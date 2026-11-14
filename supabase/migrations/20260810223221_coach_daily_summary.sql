-- ============================================================================
-- Resumo diário do Coach — card rotativo no Início
--
-- Ver specs/coach-investigacao.md, Bloco 7 (forma de entrega 3). Uma linha
-- por atleta por dia, com até quatro mensagens curtas: recapitulação recente,
-- avisos do dia, sugestão de refeição, preparação para o dia seguinte.
--
-- DECISÃO DE GERAÇÃO (2026-08-11): 1x por dia, cacheada, gerada na primeira
-- abertura da app nesse dia — não a cada abertura. Um botão explícito no
-- card ("atualizar") força nova geração. Isto mantém o custo de Gemini
-- proporcional a utilizadores ativos por dia, não a aberturas da app, e
-- aceita a troca óbvia: o resumo pode ficar desatualizado se o atleta
-- treinar a meio do dia — é aceitável para um resumo, não seria para um
-- alarme (esses continuam a sair de dayNutrientStatus, calculado ao vivo).
--
-- Uma linha por (user_id, date): a segunda geração do mesmo dia SUBSTITUI a
-- primeira (upsert), não acumula.
--
-- Idempotente: pode correr mais que uma vez sem efeito adverso.
-- ============================================================================

create table if not exists coach_daily_summary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  -- Cada campo é uma mensagem independente e pode ser null — nem todo dia
  -- tem aviso, nem toda semana tem prova a preparar. O card só mostra os
  -- campos preenchidos.
  recap text,
  warnings text,
  meal_suggestion text,
  tomorrow_prep text,
  generated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists coach_daily_summary_user_date_idx on coach_daily_summary(user_id, date desc);
alter table coach_daily_summary enable row level security;
drop policy if exists "own rows" on coach_daily_summary;
create policy "own rows" on coach_daily_summary for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin read all" on coach_daily_summary;
create policy "admin read all" on coach_daily_summary for select using (public.is_admin());
