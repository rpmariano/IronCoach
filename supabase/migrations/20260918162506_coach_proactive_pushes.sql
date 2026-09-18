-- ============================================================================
-- As notificações da Carol enviadas pelo servidor
-- (specs/carol-omnisciencia-omnipresenca.md, ação P.3)
-- APLICADA EM PRODUÇÃO a 2026-09-18 16:25 UTC (version 20260918162506).
-- Testada lá numa transação revertida: a chave repetida não duplica.
-- ============================================================================
--
-- O coach-proactive-tick corre de hora a hora e decide, sem a app aberta, se
-- a Carol deve chamar pelo atleta (manhã da prova, véspera, balanço,
-- silêncio). Cada notificação enviada fica aqui:
--   - uma por chave: a mesma mensagem nunca se notifica duas vezes;
--   - sent_date (dia de Lisboa): no máximo uma notificação dela por dia.
-- A conversa em si continua a ser escrita pelo coach-chat quando o atleta
-- abre o Coach, e fica em coach_proactive_log (P.1).
--
-- Só o service role escreve. O atleta pode ler as suas.
--
-- O cron job (cron.schedule 'coach-proactive-tick') NÃO está neste ficheiro:
-- leva o CRON_SECRET no comando, e foi criado em produção copiando o comando
-- do job 'send-water-reminders' por SQL, para o segredo nunca entrar no
-- repositório.
-- ============================================================================

create table if not exists public.coach_proactive_pushes (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  trigger text not null check (trigger in ('race_morning', 'race_eve', 'race_after', 'silence')),
  sent_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table public.coach_proactive_pushes is
  'Notificações da Carol enviadas pelo coach-proactive-tick: uma por chave, e '
  'no máximo uma por dia (sent_date, dia de Lisboa). Só o service role escreve.';

create index if not exists coach_proactive_pushes_user_date_idx on public.coach_proactive_pushes(user_id, sent_date);

alter table public.coach_proactive_pushes enable row level security;

drop policy if exists "own proactive pushes select" on public.coach_proactive_pushes;
create policy "own proactive pushes select" on public.coach_proactive_pushes
  for select using (auth.uid() = user_id);
