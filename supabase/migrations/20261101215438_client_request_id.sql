-- Idempotência das gravações (incidente de 2026-10-31: o mesmo treino de
-- ginásio gravado 4 vezes, com erros de comunicação — cada tentativa do
-- atleta inseria uma linha nova). A app gera um client_request_id uma vez
-- por formulário e reenvia-o nas novas tentativas; as Edge Functions
-- (_shared/idempotency.ts) devolvem a linha já gravada em vez de gravar outra.
--
-- Coluna opcional (os registos antigos e os clientes antigos não a têm) e
-- índice único parcial: só as linhas com id contam. Nada de RLS novo — quem
-- grava são as Edge Functions.

alter table public.workout_sessions add column if not exists client_request_id uuid;
alter table public.runs add column if not exists client_request_id uuid;
alter table public.body_assessments add column if not exists client_request_id uuid;
alter table public.meals add column if not exists client_request_id uuid;

create unique index if not exists workout_sessions_user_client_request_uniq
  on public.workout_sessions (user_id, client_request_id) where client_request_id is not null;
create unique index if not exists runs_user_client_request_uniq
  on public.runs (user_id, client_request_id) where client_request_id is not null;
create unique index if not exists body_assessments_user_client_request_uniq
  on public.body_assessments (user_id, client_request_id) where client_request_id is not null;
create unique index if not exists meals_user_client_request_uniq
  on public.meals (user_id, client_request_id) where client_request_id is not null;
