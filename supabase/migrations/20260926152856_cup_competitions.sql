-- ============================================================================
-- Competições por jornadas — M1 (specs/trofeu.md §3, §6 e §9.1)
-- O Troféu de Atletismo de Cascais é o 1.º caso; nada aqui sabe o que é Cascais
-- a não ser o seed no fim.
--
-- APLICADA EM PRODUÇÃO a 2026-09-26 15:28 UTC (version 20260926152856), com
-- autorização explícita. Ensaiada lá antes numa transação revertida (o bloco
-- DO do ensaio corre o texto integral desta migração, faz 99 verificações como
-- admin e como atleta — role authenticated + request.jwt.claims — e acaba num
-- RAISE EXCEPTION): 99/99, tudo revertido. O texto aplicado é este, sem
-- comentários e sem as linhas begin/commit, linha a linha igual ao ensaiado.
-- Verificada depois de aplicar: 18 tabelas cup_*, todas com RLS, nenhum
-- privilégio para anon; target_* aceita null e o CHECK
-- race_events_objetivo_ou_jornada existe; seed = 1 competição, edição 34
-- 'por_anunciar', 11 séries, 11 clubes (1 Individual); as 15 provas que já
-- existiam ficaram intactas. O deploy-edge-functions.yml não corre migrações:
-- esta tinha de estar aplicada ANTES de qualquer função que leia `cup_*` ou
-- `race_events.cup_round_id` (§9.2) — as funções e o cliente continuam a tratar
-- 42P01/PGRST205 como "sem inscrição".
-- Advisors depois de aplicar: cup_band e cup_norm_text sem search_path fixo
-- (WARN; só built-ins, sem EXECUTE para authenticated/anon) — fixar na próxima
-- migração.
--
-- PROCEDIMENTO DE APLICAÇÃO (revisão da Fase 1, 2026-09-26). Não há staging:
--   1. Antes, confirmar que dá 0 (senão o CHECK do objetivo, §4 abaixo,
--      recusava linhas reais — o NOT NULL foi posto à mão, fora de migração):
--        select count(*) from public.race_events
--         where target_time is null or target_time_seconds is null
--            or target_pace_seconds_per_km is null;
--      A migração volta a verificá-lo e falha com uma frase clara.
--   2. Corre inteira numa transação explícita (begin/commit abaixo) com
--      lock_timeout de 5 s: o ALTER TABLE race_events pede ACCESS EXCLUSIVE e
--      o CREATE TRIGGER em profiles pede SHARE ROW EXCLUSIVE. Sem o limite,
--      um pedido longo a segurar uma dessas tabelas punha a migração em fila
--      — e atrás dela todas as leituras e escritas da app a essas tabelas.
--      Com ele, falha ao fim de 5 s sem aplicar nada: tenta-se outra vez.
--      Se a ferramenta já abrir a sua própria transação, o `begin` dá só o
--      aviso 25001. O ensaio (bloco DO) tira as duas linhas begin/commit —
--      já é uma só transação — e fica com o lock_timeout.
-- ============================================================================
--
-- PORQUÊ. Um atleta que corre um circuito local de jornadas (11 provas curtas
-- de dezembro a junho) tem de ter as jornadas no calendário, no plano e na
-- conversa com a Carol SEM que elas atropelem as provas principais dele — e
-- quem não corre o circuito não pode notar diferença nenhuma. O modelo é
-- genérico, competição → edição → jornada, e as regras de cada edição são
-- colunas (a 2.ª competição entra por dados).
--
-- O QUE ESTÁ AQUI:
--   1. Catálogo (competições, séries, edições, jornadas, percursos, escalões,
--      clubes): lê quem tem sessão, escreve só `is_admin()`. Auditado.
--   2. Por atleta (inscrição, histórico de clubes, "não me interessa",
--      participações, resultados, resumo da época): RLS "own rows" e,
--      DE PROPÓSITO, sem "admin read all" — nenhum ecrã novo mostra a
--      inscrição de ninguém (§4.2.8). As escritas vão pelas RPCs.
--   3. Partilhado e de serviço: publicação da classificação, totais por clube
--      (dados públicos do organizador) e o livro de auditoria.
--   4. `race_events`: `cup_round_id`, `cup_link_origin` (o que uma prova do
--      atleta tinha antes de ser ligada a uma jornada), o objetivo passa de
--      NOT NULL a CHECK (vazio só em jornadas) e o trigger que não deixa o
--      cliente mexer nos dados do organizador numa jornada ligada.
--   5. Sincronização participação ↔ `race_events` (§3.5), por triggers
--      SECURITY DEFINER com EXECUTE revogado.
--   6. RPCs (§3.6): enroll_cup, update_enrollment, leave_cup,
--      set_participation, preview_round_change, unmatched_team_names,
--      close_edition — SECURITY DEFINER, EXECUTE a `authenticated`, a guarda
--      lá dentro.
--   7. Seed: o Troféu, a 34.ª edição `por_anunciar` com as regras prováveis,
--      as séries das provas da 33.ª e os clubes conhecidos. SEM jornadas: o
--      calendário nunca vai por migração (§9.1).
--
-- DECISÕES ONDE A SPEC É OMISSA (2026-09-26), cada uma explicada junto do
-- código que a aplica:
--   · Percurso do atleta: exceção da jornada para o escalão → percurso do
--     escalão → se o escalão não se resolve (ainda não há escalões, falta o
--     género/data de nascimento, ou nenhum bate) e a jornada tem UM só
--     percurso, esse. Senão, ou sem distância conhecida, NÃO se cria prova e
--     a participação "Vou" espera: volta a sincronizar-se quando os
--     percursos, os escalões ou o perfil mudarem. Uma prova já criada mantém
--     a distância que tinha (não se apaga uma prova por falta de dados).
--   · Uma principal (`a`, sem jornada) no mesmo dia manda sempre: a
--     participação volta a null com `colisao`, tanto quando a data da
--     jornada muda (§3.5) como quando o atleta diz "Vou" ou marca a
--     principal depois — é a "colisão nova" de §4.3.
--   · "Liga, se já houver prova nesse dia": liga-se a prova `b`/`c` sem
--     jornada desse dia (a mais antiga). Passa a ser a prova da jornada, mas
--     guarda em `cup_link_origin` o que o atleta lá tinha (data, local,
--     distância, hora, tipo, objetivo). Quando a participação deixa de pedir
--     prova ("Não vou", saída, jornada adiada/cancelada/apagada, colisão,
--     edição fechada antes da jornada), essa prova DESLIGA-SE e repõe esses
--     valores — nunca se apaga: foi o atleta que a criou, com objetivo,
--     notas e talvez um plano ligado (revisão da Fase 1, 2026-09-26).
--   · As principais de fora só colidem com jornadas de HOJE EM DIANTE e
--     enquanto não estão concluídas — a mesma régua do cliente
--     (defaultDecision em @formulas/cup.ts). Uma principal registada a
--     posteriori no dia de uma jornada "por registar" não a desfaz.
--   · "Hoje" é o dia no fuso da edição (cup_editions.time_zone), nunca o
--     current_date do servidor (UTC): na 1.ª hora do dia em Lisboa, o UTC
--     ainda está no dia anterior.
--   · Uma prova concluída (status 'concluida' ou com corrida ligada) nunca é
--     mexida nem apagada pela sincronização — é uma prova normal (§4.6).
--   · `leave_cup` apaga as participações sem corrida (futuras e por
--     registar): voltar na mesma época reativa a inscrição com as jornadas
--     "por decidir", sem ressuscitar provas.
--   · `nao_fui` entra nas decisões (§3.5 e §4.5 usam-no; a lista de §3.2 não).
--   · Regra do prazo de inscrição em colunas da edição (dia da semana ISO +
--     hora + fuso), preenchida pelo trigger e editável; a data anterior da
--     jornada fica em `previous_date` para a linha "mudou de 17 para 24 jan"
--     (§4.4) — o atleta não lê a auditoria.
--   · "Quem te inscreve em cada prova?" (§4.2.7) fica em
--     `cup_enrollments.entry_by`.
-- ============================================================================

begin;
-- Ver PROCEDIMENTO DE APLICAÇÃO no cabeçalho.
set local lock_timeout = '5s';
set local statement_timeout = '60s';


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Catálogo
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.cup_competitions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(btrim(name)) between 1 and 120),
  short_name  text not null check (length(btrim(short_name)) between 1 and 60),
  -- Como a competição chama a cada prova ("Jornada", "Etapa"): a app diz o
  -- que o regulamento diz.
  round_label text not null default 'Jornada' check (length(btrim(round_label)) between 1 and 30),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A série é o identificador ESTÁVEL de uma prova entre edições ("Corrida
-- CCD"): o que permite comparar o atleta consigo próprio de um ano para o
-- outro (§4.6), mesmo que a jornada mude de número ou de nome.
create table if not exists public.cup_race_series (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.cup_competitions(id) on delete cascade,
  slug           text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null check (length(btrim(name)) between 1 and 120),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (competition_id, slug)
);

-- As regras de cada edição são colunas: `null` = não sabemos, e a Carol cala
-- esse argumento (§3.1). Nada no código assume os valores de Cascais.
create table if not exists public.cup_editions (
  id                 uuid primary key default gen_random_uuid(),
  competition_id     uuid not null references public.cup_competitions(id) on delete cascade,
  edition_no         integer not null check (edition_no > 0),
  season_label       text not null check (length(btrim(season_label)) between 1 and 20),
  status             text not null default 'por_anunciar'
    check (status in ('por_anunciar', 'aberta', 'encerrada')),
  closed_at          timestamptz,
  regulation_url     text,
  standings_url      text,
  entry_url          text,
  -- Pontos individuais.
  points_mode        text check (points_mode in ('tabela', 'sem_pontos')),
  points_table       jsonb check (points_table is null or jsonb_typeof(points_table) = 'array'),
  points_basis       text check (points_basis in ('escalao', 'geral')),
  -- Classificação coletiva.
  team_scoring       text check (team_scoring in ('soma_todos', 'melhores_n')),
  team_min_athletes  integer check (team_min_athletes > 0),
  team_counting_n    integer check (team_counting_n > 0),
  -- O que conta para a classificação final individual.
  counting_rule      text check (counting_rule in ('pct_minima', 'melhores_n', 'todas')),
  counting_value     numeric check (counting_value > 0),
  entry_mode         text check (entry_mode in ('por_jornada', 'epoca')),
  bib_scope          text check (bib_scope in ('epoca', 'jornada')),
  -- A data de referência da idade para o escalão: no dia da prova, ou a 31/12
  -- do ano da prova. `null` → no dia da prova (só decide o percurso; a
  -- classificação por escalão vem sempre da fonte oficial).
  age_rule           text check (age_rule in ('data_prova', 'fim_ano_civil')),
  results_source     text not null default 'nenhuma'
    check (results_source in ('nenhuma', 'manual', 'adaptador')),
  results_adapter    text,
  area_lat           double precision check (area_lat between -90 and 90),
  area_lon           double precision check (area_lon between -180 and 180),
  area_radius_km     numeric check (area_radius_km > 0),
  -- Interruptores sem deploy (§6.4, §9.5): tudo desligado por omissão.
  sync_mode          text not null default 'desligado'
    check (sync_mode in ('desligado', 'observar', 'publicar')),
  notifications_enabled boolean not null default false,
  -- A regra do prazo de inscrição em cada prova ("quarta anterior às 24h"):
  -- dia da semana ISO (1 = segunda … 7 = domingo) ESTRITAMENTE antes da
  -- prova, à hora indicada (24:00 = fim desse dia), no fuso da competição.
  -- Preenche cup_rounds.entry_deadline_at, que o admin pode corrigir à mão.
  entry_deadline_weekday smallint check (entry_deadline_weekday between 1 and 7),
  entry_deadline_time    time,
  time_zone          text not null default 'Europe/Lisbon',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (competition_id, edition_no),
  constraint cup_editions_closed_at check (status <> 'encerrada' or closed_at is not null)
);

comment on column public.cup_editions.points_table is
  'Pontos por posição: elemento n-1 = pontos da posição n. Depois do último, vale o último '
  '(provável em Cascais: 15-13-11-10-9-8-7-6-5-4 e depois 3/2/1; a cauda confirma-se no regulamento). '
  'Só se usa com points_mode e points_basis conhecidos (specs/trofeu.md §5).';

create table if not exists public.cup_rounds (
  id                uuid primary key default gen_random_uuid(),
  edition_id        uuid not null references public.cup_editions(id) on delete cascade,
  series_id         uuid references public.cup_race_series(id) on delete set null,
  round_no          smallint not null check (round_no > 0),
  name              text not null check (length(btrim(name)) between 1 and 120),
  date              date,
  -- `provavel` NUNCA gera race_events: uma data errada daria taper, véspera
  -- e push no dia errado (§3.5). Só `confirmada` gera.
  date_status       text not null default 'provavel'
    check (date_status in ('provavel', 'confirmada', 'adiada', 'cancelada')),
  -- Para a linha "mudou de 17 para 24 jan" (§4.4): o atleta não lê a
  -- auditoria. Preenchido pelo trigger quando a data muda.
  previous_date     date,
  date_changed_at   timestamptz,
  location          text,
  -- O terreno do organizador. Na race_events o corta-mato grava-se
  -- 'estrada' ('trail' é tratado como ultra no taper) — ver a sincronização.
  terrain           text check (terrain in ('estrada', 'corta_mato', 'pista', 'trail')),
  entry_deadline_at timestamptz,
  results_url       text,
  team_results_url  text,
  source_ref        jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (edition_id, round_no),
  constraint cup_rounds_confirmada_tem_data check (date_status <> 'confirmada' or date is not null)
);

create index if not exists cup_rounds_date_idx on public.cup_rounds (edition_id, date);

create table if not exists public.cup_round_courses (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references public.cup_rounds(id) on delete cascade,
  code            text not null check (length(btrim(code)) between 1 and 20),
  name            text,
  distance_m      integer check (distance_m > 0),
  distance_status text not null default 'provisoria' check (distance_status in ('provisoria', 'oficial')),
  start_time      time,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (round_id, code)
);

-- Exceções por escalão numa jornada (ex.: os veteranos fazem o percurso curto
-- na Milha). A FK composta garante que o percurso existe NESSA jornada.
create table if not exists public.cup_round_course_overrides (
  round_id      uuid not null,
  category_code text not null,
  course_code   text not null,
  created_at    timestamptz not null default now(),
  primary key (round_id, category_code),
  foreign key (round_id, course_code)
    references public.cup_round_courses (round_id, code) on delete cascade on update cascade
);

create table if not exists public.cup_categories (
  id          uuid primary key default gen_random_uuid(),
  edition_id  uuid not null references public.cup_editions(id) on delete cascade,
  code        text not null check (length(btrim(code)) between 1 and 20),
  name        text,
  -- null = misto.
  gender      text check (gender in ('F', 'M')),
  min_age     smallint check (min_age >= 0),
  max_age     smallint check (max_age >= 0),
  -- O percurso por omissão do escalão; cup_round_course_overrides corrige-o
  -- numa jornada.
  course_code text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (edition_id, code),
  constraint cup_categories_idades check (min_age is null or max_age is null or min_age <= max_age)
);

create table if not exists public.cup_teams (
  id             uuid primary key default gen_random_uuid(),
  edition_id     uuid not null references public.cup_editions(id) on delete cascade,
  name           text not null check (length(btrim(name)) between 1 and 120),
  short_name     text,
  kind           text not null default 'clube' check (kind in ('clube', 'individual')),
  -- Elegível para a final/prémios coletivos. null = por confirmar
  -- (classifyEnrollment → 'clube_por_confirmar'); até ao regulamento da 34.ª
  -- nenhum clube se dá como elegível (specs/trofeu.md §11.3).
  eligible_final boolean,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (edition_id, name),
  -- Alvo da FK composta das inscrições: o clube tem de ser DESTA edição.
  unique (edition_id, id)
);

-- Nomes vistos na fonte oficial → clube. team_id null = "clube novo", o
-- alerta que o admin resolve (§6.3). Escrito pelo job; fica FORA da
-- auditoria para o job não a sujar.
create table if not exists public.cup_team_aliases (
  id            uuid primary key default gen_random_uuid(),
  edition_id    uuid not null references public.cup_editions(id) on delete cascade,
  alias_norm    text not null check (length(alias_norm) between 1 and 160),
  team_id       uuid references public.cup_teams(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (edition_id, alias_norm)
);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Por atleta — own rows, SEM "admin read all"
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.cup_enrollments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- restrict: apagar uma edição não pode apagar em silêncio a história dos
  -- atletas.
  edition_id    uuid not null references public.cup_editions(id) on delete restrict,
  team_id       uuid,
  -- "Não está na lista": o texto que o atleta escreveu. O admin vê-o
  -- normalizado e sem user_id (unmatched_team_names).
  team_other    text check (team_other is null or length(btrim(team_other)) between 1 and 120),
  is_federated  boolean not null default false,
  season_goal   text not null default 'participar'
    check (season_goal in ('participar', 'premio', 'pontos_clube', 'marcas')),
  -- Texto, anulável, SEM índice único: dois atletas com o mesmo dorsal não se
  -- ligam a nada e o admin vê-os (§7). Apaga-se no close_edition.
  bib           text check (bib is null or length(bib) between 1 and 20),
  -- "Quem te inscreve em cada prova?" (§4.2.7) — com 'clube' não aparece o
  -- aviso do prazo (§4.4). null = não respondeu.
  entry_by      text check (entry_by in ('atleta', 'clube', 'nao_sei')),
  status        text not null default 'ativa' check (status in ('ativa', 'saiu', 'concluida')),
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  -- Avisos (§8): todos desligados por omissão.
  notify_calendar       boolean not null default false,
  notify_date_changes   boolean not null default false,
  notify_entry_deadline boolean not null default false,
  notify_results        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, edition_id),
  foreign key (edition_id, team_id) references public.cup_teams (edition_id, id),
  constraint cup_enrollments_um_clube check (team_id is null or team_other is null),
  constraint cup_enrollments_saiu check (status <> 'saiu' or left_at is not null)
);

-- Uma inscrição ativa por atleta (§1: levantar o limite é uma migração; o
-- modelo e os hooks já recebem listas).
create unique index if not exists cup_enrollments_uma_ativa
  on public.cup_enrollments (user_id) where status = 'ativa';
create index if not exists cup_enrollments_edition_idx on public.cup_enrollments (edition_id, status);

-- Histórico de clubes: mudar de clube a meio é permitido (§4.2).
create table if not exists public.cup_enrollment_teams (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.cup_enrollments(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  team_id       uuid references public.cup_teams(id) on delete set null,
  team_other    text,
  from_date     date not null default current_date,
  created_at    timestamptz not null default now(),
  unique (enrollment_id, from_date)
);

-- "Não me interessa" — o cartão de Provas não volta para esta edição.
create table if not exists public.cup_edition_dismissals (
  user_id    uuid not null references auth.users(id) on delete cascade,
  edition_id uuid not null references public.cup_editions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, edition_id)
);

-- A decisão e a intenção vivem AQUI, não na race_events (§3.4): "Vou" com
-- data provável espera; a prova só existe para "Vou" com data confirmada.
-- Sem linha = por decidir.
create table if not exists public.cup_participations (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references public.cup_enrollments(id) on delete cascade,
  -- Denormalizado da inscrição (escrito só pelas RPCs): a política "own
  -- rows" e a sincronização leem-no sem junção.
  user_id         uuid not null references auth.users(id) on delete cascade,
  round_id        uuid not null references public.cup_rounds(id) on delete cascade,
  decision        text check (decision in ('vou', 'nao_vou', 'nao_sei', 'nao_fui')),
  decision_source text check (decision_source in ('atleta', 'omissao', 'colisao')),
  decided_at      timestamptz,
  intent          text check (intent in ('atacar', 'controlar', 'trote', 'saltar')),
  intent_source   text check (intent_source in ('sugerida', 'atleta')),
  -- "Já me inscrevi no site" (§4.4).
  entry_done_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (enrollment_id, round_id)
);

create index if not exists cup_participations_user_idx on public.cup_participations (user_id);
create index if not exists cup_participations_round_idx on public.cup_participations (round_id, decision);

-- A linha oficial DO PRÓPRIO. Fica enquanto houver conta; o atleta pode
-- apagá-la. De terceiros nunca se guarda nada (§7).
create table if not exists public.cup_results (
  id                uuid primary key default gen_random_uuid(),
  enrollment_id     uuid not null references public.cup_enrollments(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  round_id          uuid not null references public.cup_rounds(id) on delete cascade,
  position          integer check (position > 0),
  category_code     text,
  category_position integer check (category_position > 0),
  points            numeric check (points >= 0),
  official_time_s   integer check (official_time_s > 0),
  match_status      text not null default 'proposta'
    check (match_status in ('proposta', 'confirmada', 'rejeitada', 'perdida')),
  match_hash        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (enrollment_id, round_id)
);

create index if not exists cup_results_user_idx on public.cup_results (user_id);

-- Resumo final por inscrição, gravado ao fechar a edição (§4.6); atualiza-se
-- com a classificação final oficial (source 'oficial').
create table if not exists public.cup_season_summaries (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null unique references public.cup_enrollments(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  edition_id     uuid not null references public.cup_editions(id) on delete cascade,
  attendances    integer not null default 0 check (attendances >= 0),
  rounds_total   integer not null default 0 check (rounds_total >= 0),
  points         numeric,
  category_code  text,
  category_rank  integer check (category_rank > 0),
  team_name      text,
  source         text not null default 'app' check (source in ('app', 'oficial')),
  computed_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists cup_season_summaries_user_idx on public.cup_season_summaries (user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Partilhado e de serviço
-- ────────────────────────────────────────────────────────────────────────────

-- Estado da classificação de cada jornada. Escrito pelo job (ou pelo admin,
-- "Classificação publicada" manual). Fora da auditoria de propósito.
create table if not exists public.cup_round_publication (
  round_id         uuid primary key references public.cup_rounds(id) on delete cascade,
  results_ready_at timestamptz,
  source           text check (source in ('manual', 'job')),
  stable_at        timestamptz,
  -- Hash das colunas NÃO pessoais da classificação (pronta = mesmo hash em
  -- 2 voltas com ≥6 h, §7).
  content_hash     text,
  updated_at       timestamptz not null default now()
);

-- Totais por clube e jornada: dado público do organizador.
create table if not exists public.cup_team_results (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references public.cup_rounds(id) on delete cascade,
  team_id        uuid references public.cup_teams(id) on delete set null,
  team_name      text not null,
  position       integer check (position > 0),
  points         numeric,
  athletes_count integer check (athletes_count >= 0),
  created_at     timestamptz not null default now(),
  unique (round_id, team_name)
);

-- Quem mexeu no catálogo, e quando. auth.uid() E o papel da BD: o SQL direto
-- (sem sessão da app) também fica registado.
create table if not exists public.cup_audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  table_name   text not null,
  op           text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  row_key      text,
  actor_uid    uuid,
  -- O papel efetivo do pedido (authenticated, service_role, postgres…).
  actor_role   text,
  session_role text,
  old_row      jsonb,
  new_row      jsonb
);

create index if not exists cup_audit_log_at_idx on public.cup_audit_log (at desc);


-- ────────────────────────────────────────────────────────────────────────────
-- 4. race_events — a jornada é uma prova como as outras, com três diferenças
-- ────────────────────────────────────────────────────────────────────────────

-- O CHECK do objetivo (abaixo) recusava linhas reais sem objetivo — o NOT
-- NULL de hoje foi posto à mão, fora de migração, por isso confirma-se antes
-- de pedir o ACCESS EXCLUSIVE, com uma frase que diz o que fazer. As
-- jornadas não contam: numa 2.ª corrida desta migração já existem, e é
-- delas que o CHECK deixa o objetivo vazio (to_jsonb porque na 1.ª corrida a
-- coluna cup_round_id ainda não existe).
do $$
declare
  v_n bigint;
begin
  select count(*) into v_n
  from public.race_events x
  where (x.target_time is null or x.target_time_seconds is null or x.target_pace_seconds_per_km is null)
    and (to_jsonb(x) ->> 'cup_round_id') is null;
  if v_n > 0 then
    raise exception 'race_events tem % prova(s) sem jornada e sem objetivo completo — o CHECK race_events_objetivo_ou_jornada recusá-las-ia. Corrigir essas linhas antes de aplicar a M1.', v_n;
  end if;
end $$;

-- on delete set null: apagar uma jornada nunca apaga uma prova corrida (o
-- trigger de apagar jornada abaixo trata antes das que não foram corridas).
alter table public.race_events
  add column if not exists cup_round_id uuid references public.cup_rounds(id) on delete set null,
  -- "Liga, se já houver prova nesse dia" (§3.5): o que o atleta tinha na
  -- prova antes de a sincronização a ligar a uma jornada. null = a prova
  -- nasceu da sincronização (sai do calendário quando deixa de ser pedida);
  -- preenchido = a prova é do atleta, e quando deixa de ser pedida
  -- DESLIGA-SE e repõe isto em vez de se apagar (cup_release_race).
  add column if not exists cup_link_origin jsonb;

comment on column public.race_events.cup_round_id is
  'A jornada (cup_rounds) que esta prova representa. Criada e mantida pela sincronização '
  '(specs/trofeu.md §3.5), sempre com race_priority ''b'' explícito. Data, distância, local e '
  'a própria ligação são dados do organizador: o cliente não os muda (trigger '
  'guard_cup_race_columns). null = prova normal.';

comment on column public.race_events.cup_link_origin is
  'Só em provas que o atleta já tinha e a sincronização ligou a uma jornada: os valores dele '
  'antes da ligação (date, location, distance_km, start_time, race_type e o objetivo). Quando '
  'a jornada deixa de pedir prova, a prova desliga-se e volta a estes valores — nunca se apaga. '
  'null = prova criada pela sincronização (ou prova normal). Escrito só pelo servidor.';

-- Uma prova por atleta e jornada. Parcial: as provas normais não entram.
create unique index if not exists race_events_user_cup_round_key
  on public.race_events (user_id, cup_round_id) where cup_round_id is not null;
create index if not exists race_events_cup_round_idx
  on public.race_events (cup_round_id) where cup_round_id is not null;

-- Objetivo vazio só em jornadas (§3.4): o tempo da jornada fica vazio até o
-- atleta o marcar, e a previsão não se grava ("A Superação" só conta
-- objetivos gravados). Para as provas normais, o CHECK é exatamente o NOT
-- NULL de antes — o formulário continua a exigir os três. Todas as linhas
-- existentes o cumprem (vinham de NOT NULL).
alter table public.race_events alter column target_time drop not null;
alter table public.race_events alter column target_time_seconds drop not null;
alter table public.race_events alter column target_pace_seconds_per_km drop not null;

alter table public.race_events drop constraint if exists race_events_objetivo_ou_jornada;
alter table public.race_events add constraint race_events_objetivo_ou_jornada check (
  (target_time is not null and target_time_seconds is not null and target_pace_seconds_per_km is not null)
  or cup_round_id is not null
);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. RLS e privilégios
-- ────────────────────────────────────────────────────────────────────────────
-- Nada para anon. As políticas de admin são "to authenticated" (regra da
-- 20260924235403: is_admin() numa política "to public" faz a consulta de um
-- anónimo dar erro). As políticas só usam is_admin() e auth.uid(), que
-- continuam executáveis por authenticated.

-- 5a. Catálogo: lê quem tem sessão, escreve o admin.
do $$
declare
  t text;
begin
  foreach t in array array[
    'cup_competitions', 'cup_race_series', 'cup_editions', 'cup_rounds',
    'cup_round_courses', 'cup_round_course_overrides', 'cup_categories',
    'cup_teams', 'cup_team_aliases', 'cup_round_publication', 'cup_team_results'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "cup catalog read" on public.%I', t);
    execute format('create policy "cup catalog read" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "cup catalog admin write" on public.%I', t);
    execute format(
      'create policy "cup catalog admin write" on public.%I for all to authenticated '
      'using (public.is_admin()) with check (public.is_admin())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- 5b. Por atleta: só as próprias linhas. As escritas vão pelas RPCs (que
-- validam a edição, o clube e o estado) — o cliente só lê, exceto onde há
-- uma ação direta sem regra nenhuma: dispensar o cartão e apagar a sua linha
-- oficial.
do $$
declare
  t text;
begin
  foreach t in array array[
    'cup_enrollments', 'cup_enrollment_teams', 'cup_edition_dismissals',
    'cup_participations', 'cup_results', 'cup_season_summaries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows read" on public.%I', t);
    execute format('create policy "own rows read" on public.%I for select to authenticated using (user_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists "own rows insert" on public.cup_edition_dismissals;
create policy "own rows insert" on public.cup_edition_dismissals
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own rows delete" on public.cup_edition_dismissals;
create policy "own rows delete" on public.cup_edition_dismissals
  for delete to authenticated using (user_id = auth.uid());
grant insert, delete on public.cup_edition_dismissals to authenticated;

drop policy if exists "own rows delete" on public.cup_results;
create policy "own rows delete" on public.cup_results
  for delete to authenticated using (user_id = auth.uid());
grant delete on public.cup_results to authenticated;

-- 5c. Auditoria: só o admin lê; ninguém com sessão escreve (é o trigger).
alter table public.cup_audit_log enable row level security;
drop policy if exists "admin read cup audit" on public.cup_audit_log;
create policy "admin read cup audit" on public.cup_audit_log
  for select to authenticated using (public.is_admin());
revoke all on public.cup_audit_log from anon, authenticated;
grant select on public.cup_audit_log to authenticated;
revoke all on sequence public.cup_audit_log_id_seq from anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 6. Funções auxiliares (internas — sem EXECUTE para quem tem sessão)
-- ────────────────────────────────────────────────────────────────────────────

-- Uma prova "concluída" é uma prova normal: a sincronização nunca a mexe nem a
-- apaga (§4.6, "as corridas ficam como provas normais").
create or replace function public.cup_race_is_done(p_race_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (select 1 from race_events where id = p_race_id and status = 'concluida')
      or exists (select 1 from runs where race_id = p_race_id)
$$;

-- "Hoje" no fuso da edição. O current_date do servidor é UTC: entre a
-- meia-noite e a 1h de Lisboa (hora de verão) ainda é ontem, e "Não fui"
-- numa jornada de hoje era recusado (revisão da Fase 1, 2026-09-26).
create or replace function public.cup_local_today(p_tz text)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone coalesce(nullif(btrim(p_tz), ''), 'Europe/Lisbon'))::date
$$;

-- O prazo pela regra da edição: o dia da semana ESTRITAMENTE antes da prova,
-- à hora dada, no fuso da competição (24:00 = fim desse dia).
create or replace function public.cup_entry_deadline(p_date date, p_weekday smallint, p_time time, p_tz text)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_date is null or p_weekday is null or p_time is null or p_tz is null then null
    else ((p_date - ((extract(isodow from p_date)::int - p_weekday + 6) % 7 + 1)) + p_time) at time zone p_tz
  end
$$;

-- Bandas em vez de contagens exatas pequenas (§6.2): o admin percebe o
-- impacto sem ficar a saber que "são 3 atletas" (e, com o nome de um clube,
-- quem).
create or replace function public.cup_band(p_n bigint)
returns text
language sql
immutable
as $$
  select case when coalesce(p_n, 0) = 0 then '0' when p_n < 20 then '1–19' else '20+' end
$$;

create or replace function public.cup_norm_text(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '')
$$;

-- O percurso de um atleta numa jornada (§3.5): exceção da jornada para o
-- escalão → percurso do escalão → percurso único da jornada. Zero linhas =
-- não se sabe (a participação "Vou" espera).
create or replace function public.cup_resolve_course(p_round_id uuid, p_user_id uuid)
returns table (
  category_code   text,
  course_code     text,
  course_name     text,
  distance_m      integer,
  start_time      time,
  distance_status text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_round   cup_rounds%rowtype;
  v_rule    text;
  v_tz      text;
  v_gender  text;
  v_birth   date;
  v_ref     date;
  v_age     integer;
  v_cat     text;
  v_code    text;
  v_n       integer;
begin
  select * into v_round from cup_rounds where id = p_round_id;
  if not found then
    return;
  end if;
  select e.age_rule, e.time_zone into v_rule, v_tz from cup_editions e where e.id = v_round.edition_id;
  select p.gender, p.birth_date into v_gender, v_birth from profiles p where p.id = p_user_id;

  v_ref := coalesce(v_round.date, cup_local_today(v_tz));
  if v_rule = 'fim_ano_civil' then
    v_ref := make_date(extract(year from v_ref)::int, 12, 31);
  end if;
  if v_birth is not null then
    v_age := date_part('year', age(v_ref, v_birth))::int;
  end if;

  -- O escalão mais específico que bate: com género antes de misto, e a faixa
  -- de idades mais estreita primeiro. Sem idade ou género, só batem escalões
  -- sem esse critério.
  select c.code, c.course_code into v_cat, v_code
  from cup_categories c
  where c.edition_id = v_round.edition_id
    and (c.gender is null or c.gender = v_gender)
    and (c.min_age is null or c.min_age <= v_age)
    and (c.max_age is null or c.max_age >= v_age)
  order by (c.gender is null), coalesce(c.max_age, 200) - coalesce(c.min_age, 0), c.code
  limit 1;

  if v_cat is not null then
    v_code := coalesce(
      (select o.course_code from cup_round_course_overrides o
        where o.round_id = p_round_id and o.category_code = v_cat),
      v_code);
  end if;

  if v_code is not null and not exists (
    select 1 from cup_round_courses rc where rc.round_id = p_round_id and rc.code = v_code
  ) then
    v_code := null;
  end if;

  if v_code is null then
    select count(*) into v_n from cup_round_courses rc where rc.round_id = p_round_id;
    if v_n = 1 then
      select rc.code into v_code from cup_round_courses rc where rc.round_id = p_round_id;
    end if;
  end if;

  if v_code is null then
    return;
  end if;

  return query
    select v_cat, rc.code, rc.name, rc.distance_m, rc.start_time, rc.distance_status
    from cup_round_courses rc
    where rc.round_id = p_round_id and rc.code = v_code;
end $$;

-- A prova de uma jornada deixou de ser pedida (§3.5: "Não vou", "Não fui",
-- saída, jornada adiada/cancelada/apagada, colisão, edição fechada antes da
-- jornada). Uma prova que a sincronização criou sai do calendário (o
-- trigger do plano marca race_lost_at). Uma prova que o ATLETA já tinha e a
-- sincronização ligou (cup_link_origin preenchido) nunca se apaga:
-- desliga-se e volta aos valores dele — tinha objetivo, notas, web_info e
-- talvez um plano aceite (revisão da Fase 1, 2026-09-26). O objetivo repõe-se
-- só se entretanto ficou vazio (o CHECK exige-o a uma prova sem jornada).
-- Uma prova concluída é história e não se mexe (quem chama já o garante).
create or replace function public.cup_release_race(p_race_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_x race_events%rowtype;
  v_o race_events%rowtype;
begin
  select * into v_x from race_events where id = p_race_id;
  if not found or cup_race_is_done(v_x.id) then
    return;
  end if;
  if v_x.cup_link_origin is null then
    delete from race_events where id = v_x.id;
    return;
  end if;
  -- jsonb_populate_record e não casts à mão: os tipos voltam os da coluna
  -- (target_time foi criada fora das migrações).
  v_o := jsonb_populate_record(v_x, v_x.cup_link_origin);
  update race_events
  set cup_round_id    = null,
      cup_link_origin = null,
      date            = v_o.date,
      location        = v_o.location,
      distance_km     = v_o.distance_km,
      start_time      = v_o.start_time,
      race_type       = v_o.race_type,
      target_time     = coalesce(v_x.target_time, v_o.target_time),
      target_time_seconds = coalesce(v_x.target_time_seconds, v_o.target_time_seconds),
      target_pace_seconds_per_km = coalesce(v_x.target_pace_seconds_per_km, v_o.target_pace_seconds_per_km)
  where id = v_x.id;
end $$;

-- O que se guarda ao ligar (e cup_release_race repõe).
create or replace function public.cup_link_origin_of(p_race public.race_events)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_object_agg(j.key, j.value)
  from jsonb_each(to_jsonb(p_race)) j
  where j.key in ('date', 'location', 'distance_km', 'start_time', 'race_type',
                  'target_time', 'target_time_seconds', 'target_pace_seconds_per_km')
$$;

revoke execute on function public.cup_release_race(uuid) from public, anon, authenticated;
revoke execute on function public.cup_link_origin_of(public.race_events) from public, anon, authenticated;
revoke execute on function public.cup_local_today(text) from public, anon, authenticated;
revoke execute on function public.cup_race_is_done(uuid) from public, anon, authenticated;
revoke execute on function public.cup_entry_deadline(date, smallint, time, text) from public, anon, authenticated;
revoke execute on function public.cup_band(bigint) from public, anon, authenticated;
revoke execute on function public.cup_norm_text(text) from public, anon, authenticated;
revoke execute on function public.cup_resolve_course(uuid, uuid) from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 7. A sincronização participação ↔ race_events (§3.5)
-- ────────────────────────────────────────────────────────────────────────────
-- Uma só função, idempotente: olha para o estado (inscrição, decisão, data da
-- jornada, principais do atleta, percurso) e põe a race_events de acordo.
-- Todos os triggers acabam aqui, por isso qualquer ordem de eventos converge
-- para o mesmo resultado.
create or replace function public.cup_sync_participation(p_participation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p        cup_participations%rowtype;
  v_e        cup_enrollments%rowtype;
  v_r        cup_rounds%rowtype;
  v_ed       cup_editions%rowtype;
  v_race     race_events%rowtype;
  v_has_race boolean;
  v_done     boolean := false;
  v_want     boolean;
  v_c        record;
  v_location text;
  v_type     text;
  v_name     text;
begin
  select * into v_p from cup_participations where id = p_participation_id;
  if not found then
    return;
  end if;
  select * into v_e from cup_enrollments where id = v_p.enrollment_id;
  select * into v_r from cup_rounds where id = v_p.round_id;
  select * into v_ed from cup_editions where id = v_r.edition_id;

  -- Uma edição fechada é história: nada se cria nem se apaga.
  if v_ed.status = 'encerrada' then
    return;
  end if;

  select * into v_race from race_events where user_id = v_p.user_id and cup_round_id = v_r.id;
  v_has_race := found;
  if v_has_race then
    v_done := cup_race_is_done(v_race.id);
  end if;

  -- Só "Vou", inscrição ativa e data CONFIRMADA geram prova. Provável,
  -- adiada ou cancelada, "Não vou", "Não fui", "Não sei", por decidir ou
  -- saída → a prova não concluída sai (o trigger do plano marca
  -- race_lost_at). O coalesce não é decoração: com a decisão a null, a
  -- conjunção dava null e o `not` também — e o IF seguia pelo caminho de
  -- criar a prova.
  v_want := coalesce(v_e.status = 'ativa' and v_p.decision = 'vou'
                     and v_r.date_status = 'confirmada' and v_r.date is not null, false);
  if not v_want then
    -- A que a sincronização criou sai; a que o atleta já tinha desliga-se e
    -- volta ao que era (cup_release_race).
    if v_has_race and not v_done then
      perform cup_release_race(v_race.id);
    end if;
    return;
  end if;

  if v_done then
    return;
  end if;

  -- As principais de fora mandam sempre (§2.5): uma `a` sem jornada no mesmo
  -- dia devolve a participação a "por decidir" (colisao). O trigger da
  -- participação volta a chamar esta função, que então tira a prova. Só de
  -- hoje em diante e com a principal ainda por concluir — a régua de
  -- defaultDecision no cliente e de cup_principal_collision.
  if v_r.date >= cup_local_today(v_ed.time_zone) and exists (
    select 1 from race_events x
    where x.user_id = v_p.user_id
      and x.date = v_r.date
      and x.race_priority = 'a'
      and x.cup_round_id is distinct from v_r.id
      and x.status is distinct from 'concluida'
  ) then
    update cup_participations
    set decision = null, decision_source = 'colisao', decided_at = now()
    where id = v_p.id;
    return;
  end if;

  select * into v_c from cup_resolve_course(v_r.id, v_p.user_id);
  -- O corta-mato, a pista e a estrada gravam-se 'estrada': 'trail' é tratado
  -- como ultra no taper (§3.4). Só uma jornada de trail é trail.
  v_type := case when v_r.terrain = 'trail' then 'trail' else 'estrada' end;
  select coalesce(nullif(btrim(v_r.location), ''), c.short_name) into v_location
  from cup_competitions c where c.id = v_ed.competition_id;

  if v_has_race then
    -- Upsert: a data (ou o percurso) mudou. Sem percurso conhecido, a
    -- distância que a prova já tinha fica.
    update race_events
    set date        = v_r.date,
        location    = v_location,
        race_type   = v_type,
        distance_km = coalesce(trim_scale(v_c.distance_m / 1000.0), distance_km),
        start_time  = case when v_c.course_code is not null then v_c.start_time else start_time end
    where id = v_race.id
      and (date, location, race_type, distance_km, start_time) is distinct from
          (v_r.date, v_location, v_type, coalesce(trim_scale(v_c.distance_m / 1000.0), distance_km),
           case when v_c.course_code is not null then v_c.start_time else start_time end);
    return;
  end if;

  -- "Liga, se já houver prova nesse dia": a `b`/`c` sem jornada desse dia
  -- passa a ser a prova da jornada (a mais antiga, se houver mais). É uma
  -- prova do ATLETA: guarda-se o que ele lá tinha (cup_link_origin) para,
  -- quando a jornada deixar de a pedir, a desligar e repor em vez de a
  -- apagar (cup_release_race). As notas, o nome, o objetivo e o plano ligado
  -- nunca se tocam.
  select * into v_race
  from race_events x
  where x.user_id = v_p.user_id
    and x.date = v_r.date
    and x.cup_round_id is null
    and x.race_priority <> 'a'
  order by x.created_at, x.id
  limit 1;
  if found then
    if cup_race_is_done(v_race.id) then
      update race_events
      set cup_round_id = v_r.id, cup_link_origin = cup_link_origin_of(v_race)
      where id = v_race.id;
    else
      update race_events
      set cup_round_id    = v_r.id,
          cup_link_origin = cup_link_origin_of(v_race),
          location        = v_location,
          race_type       = v_type,
          distance_km     = coalesce(trim_scale(v_c.distance_m / 1000.0), distance_km),
          start_time      = coalesce(v_c.start_time, start_time)
      where id = v_race.id;
    end if;
    return;
  end if;

  -- Sem distância não há prova (distance_km é NOT NULL): a participação
  -- espera pelos percursos, pelos escalões ou pelo perfil.
  if v_c.distance_m is null then
    return;
  end if;

  -- O nome do percurso só quando a jornada tem mais de um (senão é ruído).
  v_name := v_r.name;
  if v_c.course_name is not null
     and (select count(*) from cup_round_courses where round_id = v_r.id) > 1 then
    v_name := v_name || ' · ' || v_c.course_name;
  end if;

  -- race_priority 'b' EXPLÍCITO: a omissão da BD é 'a' (§3.4). Objetivo
  -- vazio até o atleta o marcar.
  insert into race_events (user_id, date, name, race_type, location, distance_km,
                           start_time, race_priority, status, cup_round_id)
  values (v_p.user_id, v_r.date, v_name, v_type, v_location, trim_scale(v_c.distance_m / 1000.0),
          v_c.start_time, 'b', 'agendada', v_r.id);
end $$;

revoke execute on function public.cup_sync_participation(uuid) from public, anon, authenticated;

-- Todas as participações "Vou" de uma jornada (usada quando a jornada, os
-- percursos ou as exceções mudam).
create or replace function public.cup_sync_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  for v_id in
    select p.id from cup_participations p
    where p.round_id = p_round_id and p.decision = 'vou'
  loop
    perform cup_sync_participation(v_id);
  end loop;
end $$;

revoke execute on function public.cup_sync_round(uuid) from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 8. Triggers
-- ────────────────────────────────────────────────────────────────────────────

-- 8a. updated_at
create or replace function public.cup_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke execute on function public.cup_touch_updated_at() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cup_competitions', 'cup_race_series', 'cup_editions', 'cup_rounds',
    'cup_round_courses', 'cup_categories', 'cup_teams', 'cup_enrollments',
    'cup_participations', 'cup_results', 'cup_season_summaries', 'cup_round_publication'
  ] loop
    execute format('drop trigger if exists cup_touch_updated_at on public.%I', t);
    execute format(
      'create trigger cup_touch_updated_at before update on public.%I '
      'for each row execute function public.cup_touch_updated_at()', t);
  end loop;
end $$;

-- 8b. Auditoria do catálogo (§3.3): as quatro tabelas da spec e as outras
-- que o admin escreve à mão — "toda a escrita auditada" (Fase 1b). Ficam de
-- fora as que o job escreve (aliases, publicação, totais por clube).
--
-- SECURITY DEFINER para escrever no livro, que ninguém com sessão pode
-- escrever. Por isso current_user aqui é o dono; o papel do pedido lê-se do
-- GUC `role` (o PostgREST faz SET LOCAL ROLE), e o session_user fica ao lado.
create or replace function public.cup_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_role text  := nullif(current_setting('role', true), 'none');
begin
  insert into cup_audit_log (table_name, op, row_key, actor_uid, actor_role, session_role, old_row, new_row)
  values (
    tg_table_name,
    tg_op,
    coalesce(v_row ->> 'id', concat_ws(':', v_row ->> 'round_id', v_row ->> 'category_code')),
    auth.uid(),
    coalesce(v_role, session_user::text),
    session_user::text,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end $$;

revoke execute on function public.cup_audit() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cup_competitions', 'cup_race_series', 'cup_editions', 'cup_rounds',
    'cup_round_courses', 'cup_round_course_overrides', 'cup_categories', 'cup_teams'
  ] loop
    execute format('drop trigger if exists cup_audit on public.%I', t);
    execute format(
      'create trigger cup_audit after insert or update or delete on public.%I '
      'for each row execute function public.cup_audit()', t);
  end loop;
end $$;

-- 8c. Jornada: prazo pela regra, data anterior, série da mesma competição.
create or replace function public.cup_rounds_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ed cup_editions%rowtype;
begin
  select * into v_ed from cup_editions where id = new.edition_id;

  if new.series_id is not null and not exists (
    select 1 from cup_race_series s where s.id = new.series_id and s.competition_id = v_ed.competition_id
  ) then
    raise exception 'A série não é da competição desta edição' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.entry_deadline_at is null then
      new.entry_deadline_at := cup_entry_deadline(new.date, v_ed.entry_deadline_weekday,
                                                  v_ed.entry_deadline_time, v_ed.time_zone);
    end if;
  elsif new.date is distinct from old.date then
    -- O prazo acompanha a data só se ainda for o da regra (o admin pode tê-lo
    -- corrigido à mão, e aí fica).
    if new.entry_deadline_at is not distinct from old.entry_deadline_at
       and (old.entry_deadline_at is null
            or old.entry_deadline_at = cup_entry_deadline(old.date, v_ed.entry_deadline_weekday,
                                                          v_ed.entry_deadline_time, v_ed.time_zone)) then
      new.entry_deadline_at := cup_entry_deadline(new.date, v_ed.entry_deadline_weekday,
                                                  v_ed.entry_deadline_time, v_ed.time_zone);
    end if;
    if old.date is not null then
      new.previous_date := old.date;
      new.date_changed_at := now();
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.cup_rounds_before_write() from public, anon, authenticated;

drop trigger if exists cup_rounds_before_write on public.cup_rounds;
create trigger cup_rounds_before_write
  before insert or update of date, series_id, edition_id, entry_deadline_at on public.cup_rounds
  for each row execute function public.cup_rounds_before_write();

-- 8d. A jornada mudou (data, estado, local, terreno) → as provas "Vou"
-- acompanham: upsert, apagar, ou colisão com uma principal.
create or replace function public.cup_rounds_after_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform cup_sync_round(new.id);
  return null;
end $$;

revoke execute on function public.cup_rounds_after_update() from public, anon, authenticated;

drop trigger if exists cup_rounds_after_update on public.cup_rounds;
create trigger cup_rounds_after_update
  after update of date, date_status, location, terrain on public.cup_rounds
  for each row
  when (old.date is distinct from new.date
        or old.date_status is distinct from new.date_status
        or old.location is distinct from new.location
        or old.terrain is distinct from new.terrain)
  execute function public.cup_rounds_after_update();

-- 8e. Apagar uma jornada: as provas não corridas saem antes (senão o `on
-- delete set null` deixava provas sem objetivo e sem jornada, que o CHECK
-- recusa) — as que a sincronização criou apagam-se, as que o atleta já
-- tinha desligam-se e voltam ao que eram (cup_release_race). Uma corrida sem
-- objetivo impede o apagar: cancela-se. O backoffice mostra antes o impacto
-- (preview_round_change com date_status 'cancelada') e sugere cancelar.
create or replace function public.cup_rounds_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if exists (
    select 1 from race_events x
    where x.cup_round_id = old.id
      and cup_race_is_done(x.id)
      and (x.target_time is null or x.target_time_seconds is null or x.target_pace_seconds_per_km is null)
  ) then
    raise exception 'Esta jornada já foi corrida por atletas da app: marca-a como cancelada em vez de a apagar'
      using errcode = '23503';
  end if;
  for v_id in
    select x.id from race_events x where x.cup_round_id = old.id and not cup_race_is_done(x.id)
  loop
    perform cup_release_race(v_id);
  end loop;
  return old;
end $$;

revoke execute on function public.cup_rounds_before_delete() from public, anon, authenticated;

drop trigger if exists cup_rounds_before_delete on public.cup_rounds;
create trigger cup_rounds_before_delete
  before delete on public.cup_rounds
  for each row execute function public.cup_rounds_before_delete();

-- 8f. Percursos e exceções mudaram → distância e hora das provas da jornada.
create or replace function public.cup_courses_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform cup_sync_round(old.round_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.round_id is distinct from old.round_id) then
    perform cup_sync_round(new.round_id);
  end if;
  return null;
end $$;

revoke execute on function public.cup_courses_changed() from public, anon, authenticated;

drop trigger if exists cup_round_courses_changed on public.cup_round_courses;
create trigger cup_round_courses_changed
  after insert or delete on public.cup_round_courses
  for each row execute function public.cup_courses_changed();

drop trigger if exists cup_round_courses_updated on public.cup_round_courses;
create trigger cup_round_courses_updated
  after update of round_id, code, name, distance_m, start_time on public.cup_round_courses
  for each row
  when (old.round_id is distinct from new.round_id or old.code is distinct from new.code
        or old.distance_m is distinct from new.distance_m or old.start_time is distinct from new.start_time
        or old.name is distinct from new.name)
  execute function public.cup_courses_changed();

drop trigger if exists cup_round_course_overrides_changed on public.cup_round_course_overrides;
create trigger cup_round_course_overrides_changed
  after insert or update or delete on public.cup_round_course_overrides
  for each row execute function public.cup_courses_changed();

-- 8g. Escalões mudaram → percurso das jornadas futuras da edição.
create or replace function public.cup_categories_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round uuid;
begin
  for v_round in
    select r.id from cup_rounds r
    join cup_editions ed on ed.id = r.edition_id
    where r.edition_id in (old.edition_id, new.edition_id)
      and (r.date is null or r.date >= cup_local_today(ed.time_zone))
  loop
    perform cup_sync_round(v_round);
  end loop;
  return null;
end $$;

revoke execute on function public.cup_categories_changed() from public, anon, authenticated;

drop trigger if exists cup_categories_changed on public.cup_categories;
create trigger cup_categories_changed
  after insert or update or delete on public.cup_categories
  for each row execute function public.cup_categories_changed();

-- 8h. A participação mudou de decisão → sincroniza.
create or replace function public.cup_participation_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform cup_sync_participation(new.id);
  return null;
end $$;

revoke execute on function public.cup_participation_changed() from public, anon, authenticated;

drop trigger if exists cup_participations_inserted on public.cup_participations;
create trigger cup_participations_inserted
  after insert on public.cup_participations
  for each row when (new.decision = 'vou')
  execute function public.cup_participation_changed();

drop trigger if exists cup_participations_decided on public.cup_participations;
create trigger cup_participations_decided
  after update of decision on public.cup_participations
  for each row when (old.decision is distinct from new.decision)
  execute function public.cup_participation_changed();

-- 8i. Mudança de escalão pelos dados do perfil (§3.5) → percurso, hora e
-- distância das jornadas futuras. O aniversário não precisa de trigger: a
-- idade conta-se na data de referência de cada jornada, não hoje.
create or replace function public.cup_profile_category_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  for v_id in
    select p.id
    from cup_participations p
    join cup_enrollments e on e.id = p.enrollment_id and e.status = 'ativa'
    join cup_rounds r on r.id = p.round_id
    join cup_editions ed on ed.id = r.edition_id
    where p.user_id = new.id
      and p.decision = 'vou'
      and (r.date is null or r.date >= cup_local_today(ed.time_zone))
  loop
    perform cup_sync_participation(v_id);
  end loop;
  return null;
end $$;

revoke execute on function public.cup_profile_category_changed() from public, anon, authenticated;

drop trigger if exists cup_profile_category_changed on public.profiles;
create trigger cup_profile_category_changed
  after update of gender, birth_date on public.profiles
  for each row
  when (old.gender is distinct from new.gender or old.birth_date is distinct from new.birth_date)
  execute function public.cup_profile_category_changed();

-- 8j. Inscrição: federado não é Individual (§3.2). Não cabe num CHECK — o
-- tipo do clube está noutra tabela.
create or replace function public.cup_enrollments_validate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_federated and new.team_id is not null and exists (
    select 1 from cup_teams t where t.id = new.team_id and t.kind = 'individual'
  ) then
    raise exception 'Um atleta federado corre pelo clube, não como Individual' using errcode = '23514';
  end if;
  return new;
end $$;

revoke execute on function public.cup_enrollments_validate() from public, anon, authenticated;

drop trigger if exists cup_enrollments_validate on public.cup_enrollments;
create trigger cup_enrollments_validate
  before insert or update of team_id, is_federated on public.cup_enrollments
  for each row execute function public.cup_enrollments_validate();

-- 8k. race_events: o cliente não mexe nos dados do organizador (§3.4).
-- SECURITY INVOKER de propósito (molde de guard_profile_privilege_columns):
-- current_user é o papel de quem fez o pedido. As funções SECURITY DEFINER
-- da sincronização correm como o dono e passam; pg_trigger_depth() = 1
-- deixa passar tudo o que vem de outro trigger. Também não deixa o cliente
-- CRIAR uma ligação (inserir ou apontar uma prova para uma jornada), que
-- servia para fugir ao CHECK do objetivo, nem escrever cup_link_origin (é o
-- que a sincronização repõe ao desligar — o cliente podia fazer uma prova
-- criada pela sincronização "desligar-se" em vez de sair, e o CHECK
-- rebentava a transação do "Não vou").
create or replace function public.guard_cup_race_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() <> 1 or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.cup_round_id is not null or new.cup_link_origin is not null then
      raise exception 'As provas das jornadas criam-se pela inscrição na competição' using errcode = '42501';
    end if;
  elsif old.cup_round_id is not null then
    if new.date is distinct from old.date
       or new.distance_km is distinct from old.distance_km
       or new.location is distinct from old.location
       or new.cup_round_id is distinct from old.cup_round_id
       or new.cup_link_origin is distinct from old.cup_link_origin then
      raise exception 'Data, distância e local de uma jornada são do organizador' using errcode = '42501';
    end if;
  elsif new.cup_round_id is not null or new.cup_link_origin is distinct from old.cup_link_origin then
    raise exception 'As provas das jornadas criam-se pela inscrição na competição' using errcode = '42501';
  end if;

  return new;
end $$;

revoke execute on function public.guard_cup_race_columns() from public, anon, authenticated;

drop trigger if exists guard_cup_race_columns on public.race_events;
create trigger guard_cup_race_columns
  before insert or update of date, distance_km, location, cup_round_id, cup_link_origin on public.race_events
  for each row execute function public.guard_cup_race_columns();

-- 8l. A prova de uma jornada foi apagada fora da sincronização (o atleta, no
-- Calendário) → grava-se "Não vou", senão a sincronização recriava-a.
-- Distingue-se pelo estado e não pela profundidade do trigger: a
-- sincronização só apaga quando a participação já não pede prova (decisão,
-- inscrição ou data), por isso quando chega aqui a condição abaixo é falsa.
create or replace function public.cup_race_deleted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update cup_participations p
  set decision = 'nao_vou', decision_source = 'atleta', decided_at = now()
  from cup_enrollments e, cup_rounds r, cup_editions ed
  where p.round_id = old.cup_round_id
    and p.user_id = old.user_id
    and p.decision = 'vou'
    and e.id = p.enrollment_id and e.status = 'ativa'
    and r.id = p.round_id and r.date_status = 'confirmada' and r.date is not null
    and ed.id = r.edition_id and ed.status <> 'encerrada';
  return null;
end $$;

revoke execute on function public.cup_race_deleted() from public, anon, authenticated;

drop trigger if exists cup_race_deleted on public.race_events;
create trigger cup_race_deleted
  after delete on public.race_events
  for each row when (old.cup_round_id is not null)
  execute function public.cup_race_deleted();

-- 8m. Uma principal nova (ou que mudou de dia) no dia de uma jornada "Vou" →
-- a jornada volta a "por decidir" (colisao) e a prova sai: "as principais de
-- fora mandam sempre", também quando é a principal que chega depois (§4.3,
-- "colisão nova"). Sem inscrição, o UPDATE não encontra nada.
-- Só jornadas de HOJE EM DIANTE (no fuso da edição) e só principais por
-- concluir — a régua de defaultDecision no cliente. Registar a posteriori
-- uma principal que já passou (a prioridade por omissão é 'a') não desfaz
-- uma jornada "por registar" desse dia (revisão da Fase 1, 2026-09-26).
create or replace function public.cup_principal_collision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update cup_participations p
  set decision = null, decision_source = 'colisao', decided_at = now()
  from cup_enrollments e, cup_rounds r, cup_editions ed
  where p.user_id = new.user_id
    and p.decision = 'vou'
    and e.id = p.enrollment_id and e.status = 'ativa'
    and r.id = p.round_id and r.date_status = 'confirmada' and r.date = new.date
    and ed.id = r.edition_id and ed.status <> 'encerrada'
    and r.date >= cup_local_today(ed.time_zone)
    and not exists (
      select 1 from race_events x
      where x.user_id = new.user_id and x.cup_round_id = r.id and cup_race_is_done(x.id)
    );
  return null;
end $$;

revoke execute on function public.cup_principal_collision() from public, anon, authenticated;

-- cup_round_id na lista: uma jornada que o atleta tinha promovido a
-- principal e que se desliga passa a ser uma principal de fora.
drop trigger if exists cup_principal_collision on public.race_events;
create trigger cup_principal_collision
  after insert or update of date, race_priority, cup_round_id on public.race_events
  for each row
  when (new.race_priority = 'a' and new.cup_round_id is null and new.status is distinct from 'concluida')
  execute function public.cup_principal_collision();


-- ────────────────────────────────────────────────────────────────────────────
-- 9. RPCs (§3.6) — SECURITY DEFINER, EXECUTE a authenticated, guarda lá dentro
-- ────────────────────────────────────────────────────────────────────────────

-- Aplica um patch de inscrição (partilhado por enroll_cup e
-- update_enrollment). Interna: sem EXECUTE para quem tem sessão.
create or replace function public.cup_apply_enrollment_patch(p_enrollment_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old     cup_enrollments%rowtype;
  v_new     cup_enrollments%rowtype;
  v_unknown text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'O pedido tem de ser um objeto' using errcode = '22023';
  end if;
  select string_agg(k, ', ') into v_unknown
  from jsonb_object_keys(p_patch) k
  where k not in ('team_id', 'team_other', 'is_federated', 'season_goal', 'bib', 'entry_by',
                  'notify_calendar', 'notify_date_changes', 'notify_entry_deadline', 'notify_results');
  if v_unknown is not null then
    raise exception 'Campos desconhecidos: %', v_unknown using errcode = '22023';
  end if;

  select * into v_old from cup_enrollments where id = p_enrollment_id for update;

  update cup_enrollments e
  set team_id = case
        when p_patch ? 'team_id' then nullif(p_patch ->> 'team_id', '')::uuid
        when p_patch ? 'team_other' and nullif(btrim(p_patch ->> 'team_other'), '') is not null then null
        else e.team_id end,
      team_other = case
        when p_patch ? 'team_other' then nullif(btrim(p_patch ->> 'team_other'), '')
        when p_patch ? 'team_id' and nullif(p_patch ->> 'team_id', '') is not null then null
        else e.team_other end,
      is_federated = case when p_patch ? 'is_federated'
        then coalesce((p_patch ->> 'is_federated')::boolean, false) else e.is_federated end,
      season_goal = case when p_patch ? 'season_goal'
        then coalesce(p_patch ->> 'season_goal', 'participar') else e.season_goal end,
      bib = case when p_patch ? 'bib' then nullif(btrim(p_patch ->> 'bib'), '') else e.bib end,
      entry_by = case when p_patch ? 'entry_by' then p_patch ->> 'entry_by' else e.entry_by end,
      notify_calendar = case when p_patch ? 'notify_calendar'
        then coalesce((p_patch ->> 'notify_calendar')::boolean, false) else e.notify_calendar end,
      notify_date_changes = case when p_patch ? 'notify_date_changes'
        then coalesce((p_patch ->> 'notify_date_changes')::boolean, false) else e.notify_date_changes end,
      notify_entry_deadline = case when p_patch ? 'notify_entry_deadline'
        then coalesce((p_patch ->> 'notify_entry_deadline')::boolean, false) else e.notify_entry_deadline end,
      notify_results = case when p_patch ? 'notify_results'
        then coalesce((p_patch ->> 'notify_results')::boolean, false) else e.notify_results end
  where e.id = p_enrollment_id
  returning * into v_new;

  -- Histórico de clubes: uma linha por dia de mudança (a última do dia vale).
  if v_new.team_id is distinct from v_old.team_id or v_new.team_other is distinct from v_old.team_other then
    insert into cup_enrollment_teams (enrollment_id, user_id, team_id, team_other, from_date)
    values (v_new.id, v_new.user_id, v_new.team_id, v_new.team_other, current_date)
    on conflict (enrollment_id, from_date) do update
      set team_id = excluded.team_id, team_other = excluded.team_other;
  end if;
end $$;

revoke execute on function public.cup_apply_enrollment_patch(uuid, jsonb) from public, anon, authenticated;

-- Inscrever-se numa edição aberta. Voltar na mesma época reativa a mesma
-- linha (§4.2). Sem género e data de nascimento não há inscrição: o escalão
-- (e com ele o percurso) sai deles, e nunca se assume o género.
create or replace function public.enroll_cup(p_edition_id uuid, p_data jsonb default '{}'::jsonb)
returns public.cup_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_ed      cup_editions%rowtype;
  v_prof    record;
  v_row     cup_enrollments%rowtype;
  v_exists  boolean;
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  select * into v_ed from cup_editions where id = p_edition_id;
  if not found then
    raise exception 'Edição inexistente' using errcode = 'P0002';
  end if;
  if v_ed.status <> 'aberta' then
    raise exception 'Esta edição não está aberta a inscrições' using errcode = '22023';
  end if;
  select gender, birth_date into v_prof from profiles where id = v_uid;
  if v_prof.gender is null or v_prof.birth_date is null then
    raise exception 'Faltam o género e a data de nascimento no perfil' using errcode = '22023';
  end if;

  select * into v_row from cup_enrollments where user_id = v_uid and edition_id = p_edition_id for update;
  v_exists := found;
  if v_exists and v_row.status = 'ativa' then
    raise exception 'Já estás inscrito nesta edição' using errcode = '23505';
  end if;
  if exists (select 1 from cup_enrollments where user_id = v_uid and status = 'ativa') then
    raise exception 'Já tens uma inscrição ativa noutra edição' using errcode = '23505';
  end if;

  if v_exists then
    update cup_enrollments set status = 'ativa', left_at = null where id = v_row.id;
  else
    insert into cup_enrollments (user_id, edition_id) values (v_uid, p_edition_id) returning * into v_row;
    insert into cup_enrollment_teams (enrollment_id, user_id, team_id, team_other, from_date)
    values (v_row.id, v_uid, null, null, current_date);
  end if;

  perform cup_apply_enrollment_patch(v_row.id, coalesce(p_data, '{}'::jsonb));

  select * into v_row from cup_enrollments where id = v_row.id;
  return v_row;
end $$;

-- Clube, dorsal, objetivo, "quem te inscreve", avisos.
create or replace function public.update_enrollment(p_enrollment_id uuid, p_patch jsonb)
returns public.cup_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row cup_enrollments%rowtype;
begin
  select * into v_row from cup_enrollments
  where id = p_enrollment_id and user_id = auth.uid() and status = 'ativa';
  if not found then
    raise exception 'Inscrição ativa não encontrada' using errcode = 'P0002';
  end if;
  perform cup_apply_enrollment_patch(p_enrollment_id, p_patch);
  select * into v_row from cup_enrollments where id = p_enrollment_id;
  return v_row;
end $$;

-- Sair, numa transação (§3.6): `saiu`, saem as provas das jornadas futuras
-- e as por registar sem corrida (as que o atleta já tinha antes da ligação
-- desligam-se e voltam ao que eram — cup_release_race), e as participações
-- sem corrida (ao voltar, as jornadas aparecem "por decidir"). As corridas
-- ficam como provas normais — com a ligação à jornada, para o histórico.
create or replace function public.leave_cup(p_enrollment_id uuid)
returns public.cup_enrollments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row cup_enrollments%rowtype;
  v_id  uuid;
begin
  select * into v_row from cup_enrollments
  where id = p_enrollment_id and user_id = auth.uid() and status = 'ativa'
  for update;
  if not found then
    raise exception 'Inscrição ativa não encontrada' using errcode = 'P0002';
  end if;

  -- Primeiro o estado: o trigger de "prova apagada" vê a inscrição já fora e
  -- não grava "Não vou".
  update cup_enrollments set status = 'saiu', left_at = now() where id = v_row.id;

  for v_id in
    select x.id
    from race_events x
    join cup_rounds r on r.id = x.cup_round_id
    where x.user_id = v_row.user_id
      and r.edition_id = v_row.edition_id
      and not cup_race_is_done(x.id)
  loop
    perform cup_release_race(v_id);
  end loop;

  delete from cup_participations p
  where p.enrollment_id = v_row.id
    and not exists (
      select 1 from race_events x
      where x.user_id = p.user_id and x.cup_round_id = p.round_id
    );

  select * into v_row from cup_enrollments where id = v_row.id;
  return v_row;
end $$;

-- A decisão, a intenção e o "Já me inscrevi" de uma jornada. Patch:
-- decision ('vou'|'nao_vou'|'nao_sei'|'nao_fui'|null), decision_source
-- ('atleta'|'omissao'; 'colisao' só o servidor), intent, intent_source,
-- entry_done (boolean). Devolve a linha DEPOIS da sincronização — com uma
-- principal nesse dia, "Vou" volta como null/colisao.
create or replace function public.set_participation(p_round_id uuid, p_patch jsonb)
returns public.cup_participations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_r       cup_rounds%rowtype;
  v_ed      cup_editions%rowtype;
  v_e       cup_enrollments%rowtype;
  v_row     cup_participations%rowtype;
  v_unknown text;
begin
  if v_uid is null then
    raise exception 'Sem sessão' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'O pedido tem de ser um objeto' using errcode = '22023';
  end if;
  select string_agg(k, ', ') into v_unknown
  from jsonb_object_keys(p_patch) k
  where k not in ('decision', 'decision_source', 'intent', 'intent_source', 'entry_done');
  if v_unknown is not null then
    raise exception 'Campos desconhecidos: %', v_unknown using errcode = '22023';
  end if;
  if coalesce(p_patch ->> 'decision_source', 'atleta') not in ('atleta', 'omissao') then
    raise exception 'decision_source inválido' using errcode = '22023';
  end if;

  select * into v_r from cup_rounds where id = p_round_id;
  if not found then
    raise exception 'Jornada inexistente' using errcode = 'P0002';
  end if;
  select * into v_ed from cup_editions where id = v_r.edition_id;
  if v_ed.status = 'encerrada' then
    raise exception 'Esta edição já foi encerrada' using errcode = '22023';
  end if;
  select * into v_e from cup_enrollments
  where user_id = v_uid and edition_id = v_r.edition_id and status = 'ativa';
  if not found then
    raise exception 'Sem inscrição ativa nesta edição' using errcode = '42501';
  end if;
  -- "Hoje" no fuso da edição: com o current_date (UTC), na 1.ª hora do dia
  -- em Lisboa "Não fui" era recusado numa jornada desse dia.
  if p_patch ->> 'decision' = 'nao_fui' and (v_r.date is null or v_r.date > cup_local_today(v_ed.time_zone)) then
    raise exception '"Não fui" só numa jornada que já passou' using errcode = '22023';
  end if;

  insert into cup_participations (enrollment_id, user_id, round_id)
  values (v_e.id, v_uid, p_round_id)
  on conflict (enrollment_id, round_id) do nothing;

  update cup_participations p
  set decision = case when p_patch ? 'decision' then p_patch ->> 'decision' else p.decision end,
      decision_source = case when p_patch ? 'decision'
        then coalesce(p_patch ->> 'decision_source', 'atleta') else p.decision_source end,
      decided_at = case when p_patch ? 'decision' then now() else p.decided_at end,
      intent = case when p_patch ? 'intent' then p_patch ->> 'intent' else p.intent end,
      intent_source = case
        when p_patch ? 'intent' and p_patch ->> 'intent' is null then null
        when p_patch ? 'intent' then coalesce(p_patch ->> 'intent_source', 'atleta')
        else p.intent_source end,
      entry_done_at = case
        when p_patch ? 'entry_done' and coalesce((p_patch ->> 'entry_done')::boolean, false)
          then coalesce(p.entry_done_at, now())
        when p_patch ? 'entry_done' then null
        else p.entry_done_at end
  where p.enrollment_id = v_e.id and p.round_id = p_round_id;

  select * into v_row from cup_participations where enrollment_id = v_e.id and round_id = p_round_id;
  return v_row;
end $$;

-- O impacto de mudar uma jornada, ANTES de a mudar (§6.2): só lê, responde em
-- bandas ('0', '1–19', '20+'), nunca contagens exatas pequenas. Patch: date
-- e/ou date_status (o resto não mexe em provas).
create or replace function public.preview_round_change(p_round_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_r          cup_rounds%rowtype;
  v_new_date   date;
  v_new_status text;
  v_old_gen    boolean;
  v_new_gen    boolean;
  v_users      uuid[];
  v_athletes   bigint;
  v_collisions bigint := 0;
  v_moved      bigint := 0;
  v_created    bigint := 0;
  v_removed    bigint := 0;
  v_plans      bigint;
  v_tz         text;
begin
  if not public.is_admin() then
    raise exception 'Só para administradores' using errcode = '42501';
  end if;
  select * into v_r from cup_rounds where id = p_round_id;
  if not found then
    raise exception 'Jornada inexistente' using errcode = 'P0002';
  end if;
  select time_zone into v_tz from cup_editions where id = v_r.edition_id;
  p_patch := coalesce(p_patch, '{}'::jsonb);
  v_new_date := case when p_patch ? 'date' then (p_patch ->> 'date')::date else v_r.date end;
  v_new_status := case when p_patch ? 'date_status' then p_patch ->> 'date_status' else v_r.date_status end;
  v_old_gen := coalesce(v_r.date_status = 'confirmada' and v_r.date is not null, false);
  v_new_gen := coalesce(v_new_status = 'confirmada' and v_new_date is not null, false);

  -- Quem disse "Vou" (com inscrição ativa): são as provas destes que mexem.
  select coalesce(array_agg(distinct p.user_id), '{}') into v_users
  from cup_participations p
  join cup_enrollments e on e.id = p.enrollment_id and e.status = 'ativa'
  where p.round_id = p_round_id and p.decision = 'vou';
  v_athletes := cardinality(v_users);

  -- Com a data nova, uma principal no mesmo dia devolve a jornada a "por
  -- decidir" e a prova sai — a mesma régua da sincronização: de hoje em
  -- diante e principais por concluir.
  if v_new_gen and v_new_date >= cup_local_today(v_tz) then
    select count(*) into v_collisions
    from unnest(v_users) u(user_id)
    where exists (
      select 1 from race_events x
      where x.user_id = u.user_id and x.date = v_new_date and x.race_priority = 'a'
        and x.cup_round_id is distinct from p_round_id
        and x.status is distinct from 'concluida'
    );
  end if;

  if v_old_gen and v_new_gen then
    if v_new_date is distinct from v_r.date then
      v_moved := v_athletes - v_collisions;
      v_removed := v_collisions;
    end if;
  elsif v_new_gen then
    v_created := v_athletes - v_collisions;
  elsif v_old_gen then
    select count(*) into v_removed
    from race_events x
    where x.cup_round_id = p_round_id and not cup_race_is_done(x.id);
  end if;

  -- Planos aceites destes atletas que contêm a data antiga ou a nova, quando
  -- alguma prova mexe.
  select count(*) into v_plans
  from coach_plans cp
  where cp.user_id = any(v_users)
    and cp.status = 'aceite'
    and (v_moved + v_created + v_removed) > 0
    and ((v_old_gen and v_r.date between cp.period_start and cp.period_end)
         or (v_new_gen and v_new_date between cp.period_start and cp.period_end));

  return jsonb_build_object(
    'atletas_vou',      cup_band(v_athletes),
    'provas_movidas',   cup_band(v_moved),
    'provas_criadas',   cup_band(v_created),
    'provas_apagadas',  cup_band(v_removed),
    'colisoes',         cup_band(v_collisions),
    'planos_ajustados', cup_band(v_plans)
  );
end $$;

-- "Clubes por confirmar" (§6.3): os textos "não está na lista", normalizados,
-- sem user_id nem contagens.
create or replace function public.unmatched_team_names(p_edition_id uuid)
returns table (team_name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Só para administradores' using errcode = '42501';
  end if;
  return query
    select distinct cup_norm_text(e.team_other)
    from cup_enrollments e
    where e.edition_id = p_edition_id
      and e.status = 'ativa'
      and e.team_id is null
      and cup_norm_text(e.team_other) is not null
    order by 1;
end $$;

-- Fechar a edição (§6.1, §4.6): `encerrada`, inscrições ativas a
-- `concluida`, grava os resumos, apaga dorsais e dados de correspondência
-- (match_hash e as linhas que nunca foram confirmadas — podiam ser de
-- outra pessoa). Repetível: volta a calcular os resumos 'app' (um resumo
-- 'oficial' não se sobrepõe).
-- Fechada antes da última jornada, as provas das jornadas de AMANHÃ EM
-- DIANTE sem corrida saem (ou desligam-se, se eram do atleta): depois de
-- fechar, a sincronização não lhes toca, leave_cup já não corre e o guard
-- não deixa o atleta mudar-lhes a data nem o local — ficavam presas no
-- calendário, sem objetivo (revisão da Fase 1, 2026-09-26). As de hoje e
-- as passadas ficam: o atleta ainda as pode registar.
create or replace function public.close_edition(p_edition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ed cup_editions%rowtype;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Só para administradores' using errcode = '42501';
  end if;
  select * into v_ed from cup_editions where id = p_edition_id for update;
  if not found then
    raise exception 'Edição inexistente' using errcode = 'P0002';
  end if;

  update cup_editions
  set status = 'encerrada', closed_at = coalesce(closed_at, now())
  where id = p_edition_id
  returning * into v_ed;

  -- Depois do estado: com a edição já encerrada, o trigger de "prova
  -- apagada" não grava "Não vou" em nome do atleta.
  for v_id in
    select x.id
    from race_events x
    join cup_rounds r on r.id = x.cup_round_id
    where r.edition_id = p_edition_id
      and r.date > cup_local_today(v_ed.time_zone)
      and not cup_race_is_done(x.id)
  loop
    perform cup_release_race(v_id);
  end loop;

  update cup_enrollments set status = 'concluida'
  where edition_id = p_edition_id and status = 'ativa';

  insert into cup_season_summaries (enrollment_id, user_id, edition_id, attendances, rounds_total,
                                    points, category_code, team_name, source, computed_at)
  select e.id, e.user_id, e.edition_id,
         (select count(distinct r.id)
            from cup_rounds r
            join race_events x on x.cup_round_id = r.id and x.user_id = e.user_id
           where r.edition_id = e.edition_id and cup_race_is_done(x.id)),
         (select count(*) from cup_rounds r
           where r.edition_id = e.edition_id and r.date_status <> 'cancelada'),
         (select sum(cr.points) from cup_results cr
           where cr.enrollment_id = e.id and cr.match_status = 'confirmada'),
         (select cr.category_code from cup_results cr
            join cup_rounds r on r.id = cr.round_id
           where cr.enrollment_id = e.id and cr.match_status = 'confirmada' and cr.category_code is not null
           order by r.date desc nulls last limit 1),
         coalesce(t.name, e.team_other),
         'app',
         now()
  from cup_enrollments e
  left join cup_teams t on t.id = e.team_id
  where e.edition_id = p_edition_id
    and e.status in ('concluida', 'saiu')
  on conflict (enrollment_id) do update
    set attendances = excluded.attendances,
        rounds_total = excluded.rounds_total,
        points = excluded.points,
        category_code = excluded.category_code,
        team_name = excluded.team_name,
        computed_at = excluded.computed_at
    where cup_season_summaries.source = 'app';

  update cup_enrollments set bib = null where edition_id = p_edition_id and bib is not null;

  delete from cup_results cr
  using cup_rounds r
  where r.id = cr.round_id and r.edition_id = p_edition_id and cr.match_status <> 'confirmada';

  update cup_results cr set match_hash = null
  from cup_rounds r
  where r.id = cr.round_id and r.edition_id = p_edition_id and cr.match_hash is not null;

  return jsonb_build_object('edition_id', v_ed.id, 'status', v_ed.status, 'closed_at', v_ed.closed_at);
end $$;

-- EXECUTE: fora o anon (e o PUBLIC por omissão), dentro o authenticated —
-- as guardas estão lá dentro. Nenhuma destas entra numa política.
revoke execute on function public.enroll_cup(uuid, jsonb) from public, anon;
revoke execute on function public.update_enrollment(uuid, jsonb) from public, anon;
revoke execute on function public.leave_cup(uuid) from public, anon;
revoke execute on function public.set_participation(uuid, jsonb) from public, anon;
revoke execute on function public.preview_round_change(uuid, jsonb) from public, anon;
revoke execute on function public.unmatched_team_names(uuid) from public, anon;
revoke execute on function public.close_edition(uuid) from public, anon;
grant execute on function public.enroll_cup(uuid, jsonb) to authenticated, service_role;
grant execute on function public.update_enrollment(uuid, jsonb) to authenticated, service_role;
grant execute on function public.leave_cup(uuid) to authenticated, service_role;
grant execute on function public.set_participation(uuid, jsonb) to authenticated, service_role;
grant execute on function public.preview_round_change(uuid, jsonb) to authenticated, service_role;
grant execute on function public.unmatched_team_names(uuid) to authenticated, service_role;
grant execute on function public.close_edition(uuid) to authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 10. Seed — o Troféu de Cascais, 34.ª edição, SEM jornadas
-- ────────────────────────────────────────────────────────────────────────────
-- Idempotente e sem sobrepor o que o admin já tenha mudado (on conflict do
-- nothing). As regras são as PROVÁVEIS do documento orientador de 2023/24
-- (§3.1); points_basis e age_rule ficam null até ao regulamento da 34.ª, e a
-- Carol cala esses argumentos. sync_mode 'desligado' e notificações
-- desligadas: ligam-se no backoffice, pela ordem de §9.5.

insert into public.cup_competitions (slug, name, short_name, round_label)
values ('trofeu-cascais', 'Troféu de Atletismo de Cascais', 'Troféu de Cascais', 'Jornada')
on conflict (slug) do nothing;

insert into public.cup_editions (
  competition_id, edition_no, season_label, status,
  points_mode, points_table, points_basis,
  team_scoring, team_min_athletes, team_counting_n,
  counting_rule, counting_value, entry_mode, bib_scope, age_rule,
  results_source, results_adapter,
  area_lat, area_lon, area_radius_km,
  sync_mode, notifications_enabled,
  entry_deadline_weekday, entry_deadline_time, time_zone
)
select c.id, 34, '2026/27', 'por_anunciar',
       'tabela', '[15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]'::jsonb, null,
       'soma_todos', 4, null,
       'pct_minima', 70, 'por_jornada', 'epoca', null,
       'adaptador', 'trofeu_cascais',
       -- Centro aproximado do concelho de Cascais.
       38.72, -9.40, 25,
       'desligado', false,
       -- "Quarta anterior às 24h" (§1).
       3, '24:00'::time, 'Europe/Lisbon'
from public.cup_competitions c
where c.slug = 'trofeu-cascais'
on conflict (competition_id, edition_no) do nothing;

insert into public.cup_race_series (competition_id, slug, name)
select c.id, s.slug, s.name
from public.cup_competitions c
cross join (values
  ('padroeira',                    'Padroeira'),
  ('corta-mato-naza',              'Corta-mato do NAZA'),
  ('corrida-ccd-cascais',          'Corrida CCD Cascais'),
  ('gp-monte-real',                'GP Monte Real'),
  ('gp-galgos-audazes',            'GP Os Galgos Audazes'),
  ('gp-charneca-antonio-riscado',  'GP da Charneca "António Riscado"'),
  ('legua-de-janes',               'Légua de Janes'),
  ('corrida-da-juventude',         'Corrida da Juventude'),
  ('milha-urbana-sdr',             'Milha Urbana de S. Domingos de Rana'),
  ('gp-cd-arneiro',                'GP CD Arneiro'),
  ('gp-atiba-luis-candeias',       'GP Atibá "Luís Candeias"')
) as s(slug, name)
where c.slug = 'trofeu-cascais'
on conflict (competition_id, slug) do nothing;

insert into public.cup_teams (edition_id, name, short_name, kind, eligible_final)
select e.id, t.name, t.short_name, t.kind, null
from public.cup_editions e
join public.cup_competitions c on c.id = e.competition_id
cross join (values
  ('Núcleo de Atletismo da Zona da Abóboda (NAZA)',   'NAZA',              'clube'),
  ('Associação de Moradores da Atibá',                'AM Atibá',          'clube'),
  ('CD "Os Galgos Audazes"',                          'Galgos Audazes',    'clube'),
  ('CCD do Pessoal do Município de Cascais',          'CCD Cascais',       'clube'),
  ('Clube Desportivo do Arneiro',                     'CD Arneiro',        'clube'),
  ('Núcleo de Atletismo "Os Papagaios" de Cascais',   'Os Papagaios',      'clube'),
  ('Desportivo Monte Real',                           'Monte Real',        'clube'),
  ('União Recreativa da Charneca',                    'UR Charneca',       'clube'),
  ('Vitória de Janes',                                'Vitória de Janes',  'clube'),
  ('Associação de Moradores do Livramento',           'AM Livramento',     'clube'),
  ('Individual',                                      'Individual',        'individual')
) as t(name, short_name, kind)
where c.slug = 'trofeu-cascais' and e.edition_no = 34
on conflict (edition_id, name) do nothing;


-- ────────────────────────────────────────────────────────────────────────────
-- 11. Verificação — se falhar, a migração falha inteira
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_bad text;
begin
  -- RLS ligada em todas as tabelas cup_*.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cup\_%' and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'Tabelas cup_* sem RLS: %', v_bad;
  end if;

  -- Nada para anon.
  select string_agg(distinct table_name, ', ') into v_bad
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public' and table_name like 'cup\_%';
  if v_bad is not null then
    raise exception 'Tabelas cup_* com privilégios para anon: %', v_bad;
  end if;

  -- Nenhuma política cup_* avaliada por anon/public (is_admin() daria erro).
  select string_agg(c.relname || '.' || pol.polname, ', ') into v_bad
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  where c.relname like 'cup\_%'
    and (0 = any(pol.polroles) or 'anon'::regrole::oid = any(pol.polroles));
  if v_bad is not null then
    raise exception 'Políticas cup_* abertas a anon/public: %', v_bad;
  end if;

  -- As funções internas (auxiliares, sincronização, triggers) sem EXECUTE
  -- para quem tem sessão nem para anon. Sobretudo cup_apply_enrollment_patch
  -- e cup_release_race, que NÃO têm guarda de dono: com EXECUTE, qualquer
  -- um reescrevia a inscrição (ou tirava a prova) de outro. Todas as cup_*
  -- são internas — as RPCs têm outros nomes (revisão da Fase 1, 2026-09-26).
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname like 'cup\_%' or p.proname = 'guard_cup_race_columns')
    and (has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('anon', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'Funções internas cup_* executáveis por authenticated/anon: %', v_bad;
  end if;

  -- As RPCs: nunca para anon; sempre para authenticated (a guarda está lá
  -- dentro, e sem EXECUTE a app parava).
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('enroll_cup', 'update_enrollment', 'leave_cup', 'set_participation',
                      'preview_round_change', 'unmatched_team_names', 'close_edition')
    and (has_function_privilege('anon', p.oid, 'execute')
         or not has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'RPCs cup com EXECUTE errado (anon sim ou authenticated não): %', v_bad;
  end if;
end $$;

commit;
