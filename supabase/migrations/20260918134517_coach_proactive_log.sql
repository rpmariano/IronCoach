-- ============================================================================
-- As mensagens proativas da Carol, registadas no servidor
-- (specs/carol-omnisciencia-omnipresenca.md, ação P.1)
-- ============================================================================
-- APLICADA EM PRODUÇÃO a 2026-09-18 13:45 UTC (version 20260918134517).
-- Testada lá num bloco que abortava no fim: chave repetida não duplica e o
-- check recusa um trigger desconhecido.
-- ============================================================================
--
-- A chave que evita a Carol repetir uma mensagem por iniciativa própria
-- (manhã da prova, véspera, balanço, silêncio — src/utils/coachProactive.js)
-- vivia só em localStorage. Noutro telemóvel, ou depois de limpar o browser,
-- ela voltava a dizer o mesmo; o servidor só travava durante 6 horas
-- (PROACTIVE_QUIET_HOURS no coach-chat).
--
-- Agora o coach-chat grava aqui a chave de cada mensagem proativa que
-- entrega, e recusa a mesma chave outra vez, venha de que dispositivo vier.
-- O localStorage fica como atalho do cliente, já não como a verdade.
--
-- Não há corrida entre dois dispositivos: o coach-chat tem um lock por
-- utilizador (profiles.coach_chat_busy_since) e o segundo pedido leva 409.
-- ============================================================================

create table if not exists public.coach_proactive_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A chave do candidato: "race_eve:<race_id>", "silence:<data>", ...
  key text not null check (char_length(key) between 1 and 200),
  trigger text not null check (trigger in ('race_morning', 'race_eve', 'race_after', 'silence')),
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table public.coach_proactive_log is
  'Chaves das mensagens proativas que a Carol já entregou (coach-chat). '
  'Evita repeti-las noutro dispositivo. Ver src/utils/coachProactive.js.';

alter table public.coach_proactive_log enable row level security;

drop policy if exists "own proactive log select" on public.coach_proactive_log;
create policy "own proactive log select" on public.coach_proactive_log
  for select using (auth.uid() = user_id);

drop policy if exists "own proactive log insert" on public.coach_proactive_log;
create policy "own proactive log insert" on public.coach_proactive_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "admin read all proactive log" on public.coach_proactive_log;
create policy "admin read all proactive log" on public.coach_proactive_log
  for select using (public.is_admin());
