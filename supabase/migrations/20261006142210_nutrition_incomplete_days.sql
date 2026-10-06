-- ============================================================================
-- Dias de nutrição marcados como incompletos (2026-10-06)
-- Aplicada à mão a 2026-10-06 (versão 20261006142210), antes do push (o
-- workflow só faz `functions deploy`; ver memória "migrations não são
-- deployadas"). A app trata a tabela em falta como "nenhum dia marcado".
-- ============================================================================
--
-- A Evolução · Nutrição só conta dias FECHADOS, mas um dia em que o atleta só
-- registou o pequeno-almoço puxa as médias para baixo. Até aqui a app só
-- avisava ("dias provavelmente incompletos") e o dia continuava nas contas.
-- Decidido com o Rui: o atleta MARCA o dia como incompleto (no Dia) e um dia
-- marcado sai de todas as contas da Nutrição por período.
--
-- Uma linha = um dia marcado. Desmarcar apaga a linha (sem update).
-- Quem escreve: só a app, com o JWT do atleta (RLS "own rows"). A Carol e as
-- Edge Functions não leem isto (aceite: o ecrã e a Carol podem diferir).
-- ============================================================================

create table if not exists public.nutrition_incomplete_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.nutrition_incomplete_days enable row level security;

drop policy if exists "own incomplete days select" on public.nutrition_incomplete_days;
create policy "own incomplete days select" on public.nutrition_incomplete_days
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own incomplete days insert" on public.nutrition_incomplete_days;
create policy "own incomplete days insert" on public.nutrition_incomplete_days
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own incomplete days delete" on public.nutrition_incomplete_days;
create policy "own incomplete days delete" on public.nutrition_incomplete_days
  for delete to authenticated using (auth.uid() = user_id);
