-- ============================================================================
-- ai_usage — consumo da API Gemini registado pelo SERVIDOR
-- (auditoria de custos de 2026-09-27, depois do bug #45: créditos pré-pagos
-- esgotados sem aviso).
--
-- Até aqui o consumo era gravado pela app (invokeEdgeFunctionWithTimeout →
-- app_logs), o que deixava de fora tudo o que a app não chegava a ver:
-- timeouts do lado do cliente, app fechada a meio, respostas que o Gemini
-- deu mas a função depois falhou. E qualquer cliente podia inserir (ou não
-- inserir) linhas de custo. Para faturar utilizadores isto tem de vir do
-- servidor, que é quem paga a chamada.
--
-- Quem escreve: as Edge Functions, com a service role (bypass de RLS), via
-- _shared/usageRecorder.ts. Não há policy de insert: nenhum cliente escreve.
-- Quem lê: só admins (Admin → Custos API).
--
-- thoughts_tokens NULL = desconhecido: as linhas recuperadas de app_logs
-- (source 'client_backfill') são anteriores à contagem do raciocínio do
-- modelo; o painel assinala-as como incompletas.
-- model: o modelVersion que a Google devolve — o GEMINI_MODEL é um alias
-- ("-latest") que muda de modelo, e com ele a tabela de preços.
-- APLICADA EM PRODUÇÃO a 2026-09-27 20:34 UTC (version 20260927203409).
-- Ensaiada antes numa transação revertida (491 linhas de backfill).
-- ============================================================================

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  function text not null,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_tokens integer not null default 0 check (cached_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  thoughts_tokens integer check (thoughts_tokens >= 0),
  calls integer not null default 1 check (calls >= 0),
  source text not null default 'server' check (source in ('server', 'client_backfill')),
  -- Só nas linhas recuperadas: torna o backfill idempotente.
  app_log_id uuid unique
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "admin read ai usage" on public.ai_usage;
create policy "admin read ai usage" on public.ai_usage
  for select to authenticated using (public.is_admin());

-- Sem grants de escrita para anon/authenticated: só a service role escreve.
revoke insert, update, delete on public.ai_usage from anon, authenticated;

-- ── Backfill a partir de app_logs ─────────────────────────────────────────
-- Linhas de custo gravadas pela app (e pelo coach-proactive-tick) antes de o
-- servidor passar a gravar aqui. Pára na primeira linha 'server' — depois
-- disso a app ainda pode gravar em app_logs (versões antigas em cache), mas
-- essas chamadas já estão aqui pelo servidor. Idempotente (app_log_id), por
-- isso volta a correr-se depois do deploy das funções para apanhar a janela
-- entre esta migração e o primeiro registo do servidor.
insert into public.ai_usage (created_at, user_id, function, input_tokens, cached_tokens, output_tokens, thoughts_tokens, calls, source, app_log_id)
select
  l.created_at,
  l.user_id,
  l.event,
  greatest(coalesce((l.meta->>'input_tokens')::bigint, 0), 0)::int,
  least(greatest(coalesce((l.meta->>'cached_tokens')::bigint, 0), 0), greatest(coalesce((l.meta->>'input_tokens')::bigint, 0), 0))::int,
  greatest(coalesce((l.meta->>'output_tokens')::bigint, 0), 0)::int,
  (l.meta->>'thoughts_tokens')::int,
  coalesce((l.meta->>'calls')::int, 1),
  'client_backfill',
  l.id
from public.app_logs l
where l.level = 'success'
  and l.meta ? 'input_tokens'
  and l.created_at < coalesce(
    (select min(created_at) from public.ai_usage where source = 'server'),
    'infinity'::timestamptz)
on conflict (app_log_id) do nothing;
