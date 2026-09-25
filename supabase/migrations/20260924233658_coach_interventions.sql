-- ============================================================================
-- O desfecho dos avisos da Carol
-- (specs/carol-omnisciencia-omnipresenca.md, ação 5.5, push 1)
-- APLICADA EM PRODUÇÃO a 2026-09-24 23:36 UTC (version 20260924233658).
-- Testada lá numa transação revertida: abrir com origem, trocar o motivo com o
-- aviso aberto (o anterior fecha como 'substituido'), deduzir a origem do
-- check-in pelo motivo e fechar com desfecho; as colunas de passagem ficam vazias.
-- Corrigido no ficheiro a 2026-09-25 (revisão pré-deploy): a política de admin
-- passa a nascer `to authenticated`. Foi aplicada sem isso; em produção quem a
-- corrigiu foi a 20260924235403_security_definer_rpc, e este ficheiro, se for
-- reaplicado à mão, dá agora o mesmo estado — sem ela, as consultas anónimas a
-- esta tabela davam erro (anon já não tem EXECUTE em is_admin()).
-- ============================================================================
--
-- Um "assunto por resolver" (profiles.coach_intervention_status 'needed') é o
-- aviso "Preciso de falar contigo" do Início. Abre-se em seis sítios — o
-- analyze-run/gym/meal (um desvio num registo), o analyze-body (os
-- objetivos), o coach-daily-summary (a carga) e o check-in (no cliente) — e
-- fecha-se em três: a ferramenta resolve_intervention do chat, o "Dispensar"
-- do Início e o fecho automático quando os objetivos ficam decididos. Até
-- aqui só existia o estado de agora: a Carol não sabia quantos avisos seus
-- ficaram por ouvir, nem quantos eram falsos alarmes.
--
-- coach_interventions guarda cada aviso: quando abriu, de onde veio, com que
-- motivo, quando fechou e como. Quem escreve é só o trigger abaixo, que vê
-- TODAS as transições do perfil, venham de onde vierem — um escritor que se
-- esqueça da origem ou do desfecho não deixa de ficar registado.
--
-- As duas colunas novas em profiles são DE PASSAGEM: quem abre escreve a
-- origem, quem fecha escreve o desfecho, no mesmo update do estado; o
-- trigger copia-as e apaga-as antes de a linha ser gravada. Nunca ficam para
-- a transição seguinte (um aviso aberto pelo check-in não herda a origem
-- "run" do anterior).
--
-- Enquanto o cliente novo não chega ao master, o check-in abre sem origem e o
-- "Dispensar" fecha sem desfecho: a origem deduz-se pelo início do motivo
-- ("Check-in de hoje:", "[objetivos]", "[carga]") e o desfecho fica
-- 'resolvido'.
-- ============================================================================

create table if not exists public.coach_interventions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin text check (origin is null or origin in ('run', 'gym', 'meal', 'body', 'checkin', 'load')),
  reason text check (reason is null or char_length(reason) <= 500),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  outcome text check (outcome is null or outcome in (
    'plano_ajustado', 'atleta_ignorou', 'falso_positivo', 'dispensado', 'objetivos_decididos', 'substituido', 'resolvido'
  ))
);

comment on table public.coach_interventions is
  'Cada aviso "Preciso de falar contigo" da Carol: origem, motivo, abertura, fecho e desfecho. '
  'Escrito só pelo trigger track_coach_intervention (profiles). Lido pela Carol para calibrar.';

create index if not exists coach_interventions_user_opened_idx on public.coach_interventions(user_id, opened_at desc);

alter table public.coach_interventions enable row level security;

drop policy if exists "own interventions select" on public.coach_interventions;
create policy "own interventions select" on public.coach_interventions
  for select using (auth.uid() = user_id);

drop policy if exists "admin read all interventions" on public.coach_interventions;
create policy "admin read all interventions" on public.coach_interventions
  for select to authenticated using (public.is_admin());

alter table public.profiles
  add column if not exists coach_intervention_origin text
    check (coach_intervention_origin is null or coach_intervention_origin in ('run', 'gym', 'meal', 'body', 'checkin', 'load')),
  add column if not exists coach_intervention_outcome text
    check (coach_intervention_outcome is null or coach_intervention_outcome in (
      'plano_ajustado', 'atleta_ignorou', 'falso_positivo', 'dispensado', 'objetivos_decididos', 'resolvido'
    ));

comment on column public.profiles.coach_intervention_origin is
  'De passagem: quem abre um aviso escreve daqui a origem; o trigger track_coach_intervention consome-a e limpa-a.';
comment on column public.profiles.coach_intervention_outcome is
  'De passagem: quem fecha um aviso escreve aqui o desfecho; o trigger track_coach_intervention consome-o e limpa-o.';

create or replace function public.track_coach_intervention()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  was_open boolean := coalesce(old.coach_intervention_status in ('needed', 'in_progress'), false);
  is_open boolean := coalesce(new.coach_intervention_status in ('needed', 'in_progress'), false);
  v_origin text := new.coach_intervention_origin;
begin
  if is_open and (not was_open or new.coach_intervention_reason is distinct from old.coach_intervention_reason) then
    -- Um motivo novo por cima de um aviso ainda aberto: o anterior foi substituído.
    if was_open then
      update public.coach_interventions set closed_at = now(), outcome = 'substituido'
        where user_id = new.id and closed_at is null;
    end if;
    if v_origin is null then
      v_origin := case
        when new.coach_intervention_reason like 'Check-in%' then 'checkin'
        when new.coach_intervention_reason like '[objetivos]%' then 'body'
        when new.coach_intervention_reason like '[carga]%' then 'load'
        else null
      end;
    end if;
    insert into public.coach_interventions (user_id, origin, reason)
      values (new.id, v_origin, left(new.coach_intervention_reason, 500));
  elsif was_open and not is_open then
    update public.coach_interventions
      set closed_at = now(), outcome = coalesce(new.coach_intervention_outcome, 'resolvido')
      where user_id = new.id and closed_at is null;
  end if;
  -- De passagem: consumidas aqui, nunca ficam gravadas.
  new.coach_intervention_origin := null;
  new.coach_intervention_outcome := null;
  return new;
end $$;

revoke execute on function public.track_coach_intervention() from public, anon, authenticated;

drop trigger if exists track_coach_intervention on public.profiles;
create trigger track_coach_intervention
  before update of coach_intervention_status, coach_intervention_reason, coach_intervention_origin, coach_intervention_outcome
  on public.profiles
  for each row execute function public.track_coach_intervention();

-- Os avisos abertos agora entram já no registo, sem a hora verdadeira de
-- abertura (não existia): fecham-se pelo trigger como todos os outros.
insert into public.coach_interventions (user_id, origin, reason)
select p.id,
  case
    when p.coach_intervention_reason like 'Check-in%' then 'checkin'
    when p.coach_intervention_reason like '[objetivos]%' then 'body'
    when p.coach_intervention_reason like '[carga]%' then 'load'
    else null
  end,
  left(p.coach_intervention_reason, 500)
from public.profiles p
where p.coach_intervention_status in ('needed', 'in_progress')
  and not exists (select 1 from public.coach_interventions i where i.user_id = p.id and i.closed_at is null);
