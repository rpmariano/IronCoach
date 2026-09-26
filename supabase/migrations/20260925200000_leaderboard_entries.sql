-- ============================================================================
-- As tabelas com nomes — o top 10 de cada escalão (gamificação, Fase 5)
--
-- Pedido de 2026-09-25: construir as tabelas (até aqui só existia o
-- consentimento — profiles.leaderboard_consent_at e o livro privacy_consents)
-- e a Carol avisar quando o atleta passa a constar nelas e quando sai.
--
-- A tabela de cada segmento é o TOP 10, por janela de 14 dias, dos atletas
-- que aceitaram aparecer com o nome abreviado. As regras, e o porquê:
--
--   · SÓ EM SEGMENTOS PUBLICADOS. Uma tabela existe onde existe a
--     distribuição (percentile_snapshots, n >= 20) — é de lá que vêm os
--     números, e é a mesma cancela de privacidade: uma "tabela" de um grupo de
--     3 pessoas era uma lista de 3 pessoas.
--   · A JANELA NÃO SE REFAZ, como os snapshots: é escrita pela mesma tarefa
--     (compute-percentile-snapshots), na mesma volta, e nunca recalculada.
--   · A REVOGAÇÃO É IMEDIATA. Ao contrário da média, aqui há dado pessoal
--     guardado (quem está em que lugar): retirar o consentimento das tabelas
--     — ou o da média, de que as tabelas dependem — apaga as linhas do atleta
--     na mesma transação (trigger abaixo). O ecrã de consentimento promete
--     "o teu nome sai da tabela na hora", e é aqui que isso é verdade.
--   · RECIPROCIDADE. Só vê as tabelas quem também aceitou aparecer nelas —
--     a mesma regra do "Onde estás" (sem entrar na média não se vê a média):
--     ver os nomes dos outros sem pôr o seu era servir-se sem entrar.
--   · O user_id NUNCA SAI para o cliente de outro atleta. A leitura das
--     tabelas é pela função leaderboard_top (security definer), que devolve
--     o nome abreviado, o nível, a pontuação e um `is_me` — nunca o user_id.
--     O próprio atleta lê as SUAS linhas diretamente (política "own rows"),
--     que é o que a app e a Carol usam para saber se ele entrou ou saiu.
--
-- APLICADA EM PRODUÇÃO a 2026-09-26 00:14 UTC (version 20260926001410), com
-- autorização explícita, ANTES do deploy das funções que escrevem aqui (a
-- compute-percentile-snapshots e o tick) — o DDL primeiro. Ensaiada lá antes
-- numa transação revertida: inserir, ler sem sessão (0 linhas — a
-- reciprocidade), e revogar (as linhas saem na hora).
-- ============================================================================

create table if not exists public.leaderboard_entries (
  metric       text not null default 'plan_execution'
    check (metric in ('plan_execution')),
  window_start date not null,
  window_end   date not null,
  age_band     text not null check (age_band in (
    'sub23', '23-34',
    'M35', 'M40', 'M45', 'M50+',
    'F35', 'F40', 'F45', 'F50+'
  )),
  gender       text not null check (gender in ('F','M')),
  terrain      text not null check (terrain in ('estrada','trail')),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- A posição no momento da publicação (1-10). A que o ecrã mostra é
  -- recontada entre quem ainda consente (leaderboard_top): quem sai, sai na
  -- hora, e os de baixo sobem.
  rank         smallint not null check (rank between 1 and 10),
  -- O índice de execução (0-100, uma casa decimal) — "quanto do plano
  -- cumpriste", o que o ecrã de consentimento diz que passa a ver-se.
  score        numeric(4,1) not null check (score between 0 and 100),
  computed_at  timestamptz not null default now(),
  -- Um atleta está, no máximo, num segmento por janela.
  primary key (metric, window_start, user_id),
  constraint leaderboard_entries_posicao unique (metric, window_start, age_band, gender, terrain, rank),
  constraint leaderboard_entries_janela check (window_end > window_start),
  constraint leaderboard_entries_escalao_genero check (
    age_band in ('sub23', '23-34') or left(age_band, 1) = gender
  )
);

create index if not exists leaderboard_entries_user_idx on public.leaderboard_entries (user_id, window_start desc);

comment on table public.leaderboard_entries is
  'As tabelas com nomes: o top 10 de cada segmento publicado, por janela de 14 dias, só com atletas com '
  'leaderboard_consent_at. Escrita só por service_role (compute-percentile-snapshots), na mesma volta dos '
  'snapshots, e nunca recalculada. A revogação apaga as linhas do atleta na hora (trigger). Outros atletas '
  'leem pela função leaderboard_top — nunca o user_id.';

alter table public.leaderboard_entries enable row level security;

drop policy if exists "leaderboard_entries own rows" on public.leaderboard_entries;
create policy "leaderboard_entries own rows" on public.leaderboard_entries
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "leaderboard_entries admin read all" on public.leaderboard_entries;
create policy "leaderboard_entries admin read all" on public.leaderboard_entries
  for select to authenticated using (public.is_admin());

-- Sem insert/update/delete para ninguém com sessão: só service_role escreve.
revoke all on public.leaderboard_entries from anon, authenticated;
grant select on public.leaderboard_entries to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- A leitura das tabelas — os nomes dos outros, sem o user_id deles
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.leaderboard_top(
  p_window_start date,
  p_age_band text,
  p_gender text,
  p_terrain text,
  p_metric text default 'plan_execution'
)
returns table (
  "position" integer,
  display_name text,
  experience_level text,
  score numeric,
  is_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (row_number() over (order by e.rank))::integer as "position",
    p.leaderboard_display_name as display_name,
    p.experience_level,
    e.score,
    e.user_id = auth.uid() as is_me
  from public.leaderboard_entries e
  join public.profiles p on p.id = e.user_id
  where e.metric = p_metric
    and e.window_start = p_window_start
    and e.age_band = p_age_band
    and e.gender = p_gender
    and e.terrain = p_terrain
    -- Quem já não consente não aparece, mesmo antes de o trigger correr
    -- (defesa em profundidade: o trigger apaga, isto filtra).
    and p.leaderboard_consent_at is not null
    and p.stats_pool_consent_at is not null
    and p.leaderboard_display_name is not null
    -- Reciprocidade: só vê quem também aparece — e sem nome abreviado não se
    -- aparece (a agregação deixa-o de fora), por isso também não se vê.
    and exists (
      select 1 from public.profiles eu
      where eu.id = auth.uid()
        and eu.leaderboard_consent_at is not null
        and eu.stats_pool_consent_at is not null
        and eu.leaderboard_display_name is not null
    )
  order by e.rank
$$;

revoke execute on function public.leaderboard_top(date, text, text, text, text) from public, anon;
grant execute on function public.leaderboard_top(date, text, text, text, text) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- Revogação — o nome (e o lugar) saem da tabela na hora
-- ────────────────────────────────────────────────────────────────────────────
-- AFTER: escreve noutra tabela. Dispara quando sai qualquer um dos dois
-- consentimentos — as tabelas mostram números da média, e sem média não há
-- tabela (o ecrã de consentimento diz isto antes de o atleta decidir).
create or replace function public.clear_leaderboard_entries_on_consent_revoked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.leaderboard_consent_at is not null and new.leaderboard_consent_at is null)
     or (old.stats_pool_consent_at is not null and new.stats_pool_consent_at is null) then
    delete from public.leaderboard_entries where user_id = new.id;
  end if;
  return new;
end $$;

revoke execute on function public.clear_leaderboard_entries_on_consent_revoked() from public, anon, authenticated;

drop trigger if exists clear_leaderboard_entries_on_consent_revoked on public.profiles;
create trigger clear_leaderboard_entries_on_consent_revoked
  after update of leaderboard_consent_at, stats_pool_consent_at on public.profiles
  for each row execute function public.clear_leaderboard_entries_on_consent_revoked();
