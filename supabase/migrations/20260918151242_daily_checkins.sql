-- ============================================================================
-- O atleta diz como está — check-in diário, ciclo com consentimento, e o
-- que a app lhe mostrou (specs/carol-omnisciencia-omnipresenca.md, Fase 2)
-- APLICADA EM PRODUÇÃO a 2026-09-18 15:12 UTC (version 20260918151242).
-- Testada lá numa transação revertida: retirar o consentimento limpa o
-- ciclo, o check do sono recusa 6, e a impressão repetida não duplica.
-- ============================================================================
--
-- 2.1  daily_checkins: um por atleta e por dia. Sono, energia e stress de 1 a
--      5; dor de 0 a 10 (a escala EVA da hierarquia de alarmes) com o local.
-- 2.3  period_today só se grava com profiles.cycle_tracking_consent_at
--      preenchido — o cliente só mostra a pergunta depois do "aceito", e a
--      Carol só a lê com o consentimento (_shared/formulas/checkinAlarms.ts).
--      Retirar o consentimento apaga o campo em todos os check-ins do atleta
--      (trigger abaixo): não fica nenhum dado de ciclo sem autorização.
-- 2.4  coach_impressions: o que o Início mostrou ao atleta (o cartão da
--      Carol, os avisos, os insights) e o que ele dispensou. Uma linha por
--      dia, tipo e chave.
--
-- São dados de saúde: RLS só "own rows". A leitura de admin que esta
-- migration criou foi retirada em 20260918152840_daily_checkins_cycle_guard.
-- ============================================================================

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  sleep smallint check (sleep between 1 and 5),
  energy smallint check (energy between 1 and 5),
  stress smallint check (stress between 1 and 5),
  pain smallint check (pain between 0 and 10),
  pain_location text check (pain_location is null or char_length(pain_location) <= 80),
  period_today boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_checkins_user_date_idx on public.daily_checkins(user_id, date desc);

comment on table public.daily_checkins is
  'Check-in diário do atleta (Início). Lido pela Carol como sinais de alarme — '
  'ver supabase/functions/_shared/formulas/checkinAlarms.ts.';

alter table public.daily_checkins enable row level security;

drop policy if exists "own daily_checkins" on public.daily_checkins;
create policy "own daily_checkins" on public.daily_checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin read all daily_checkins" on public.daily_checkins;
create policy "admin read all daily_checkins" on public.daily_checkins
  for select using (public.is_admin());

alter table public.profiles
  add column if not exists cycle_tracking_consent_at timestamptz;

comment on column public.profiles.cycle_tracking_consent_at is
  'Quando o atleta aceitou registar o ciclo menstrual no check-in. null = sem '
  'consentimento: a pergunta não aparece e a Carol não lê o campo.';

-- Sem consentimento, não fica ciclo nenhum: retirá-lo limpa o histórico.
create or replace function public.clear_cycle_data_on_consent_revoked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.cycle_tracking_consent_at is not null and new.cycle_tracking_consent_at is null then
    update public.daily_checkins set period_today = null where user_id = new.id and period_today is not null;
  end if;
  return new;
end $$;

revoke execute on function public.clear_cycle_data_on_consent_revoked() from public, anon, authenticated;

drop trigger if exists clear_cycle_data_on_consent_revoked on public.profiles;
create trigger clear_cycle_data_on_consent_revoked
  after update of cycle_tracking_consent_at on public.profiles
  for each row execute function public.clear_cycle_data_on_consent_revoked();

create table if not exists public.coach_impressions (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('daily_card', 'alert', 'insights')),
  key text not null check (char_length(key) between 1 and 200),
  title text check (title is null or char_length(title) <= 200),
  shown_at timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (user_id, date, kind, key)
);

comment on table public.coach_impressions is
  'O que o Início mostrou ao atleta e o que ele dispensou. Lido pela Carol '
  '(coach-chat) para saber o que ele já viu.';

alter table public.coach_impressions enable row level security;

drop policy if exists "own coach_impressions" on public.coach_impressions;
create policy "own coach_impressions" on public.coach_impressions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "admin read all coach_impressions" on public.coach_impressions;
create policy "admin read all coach_impressions" on public.coach_impressions
  for select using (public.is_admin());
