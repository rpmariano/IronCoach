-- O dono pode atualizar as suas linhas do coach_proactive_log (revisão
-- pré-deploy do balanço da prova, 2026-11-15, B1).
--
-- O balanço pós-prova guarda no payload da chave race_after a impressão
-- digital da prova, a mensagem e a nota (coach-chat, raceAfterDecision). Ao
-- refazer o balanço (a prova mudou) ou ao carimbar uma linha antiga, o
-- coach-chat faz um upsert que ATUALIZA a linha — com o cliente do atleta,
-- sujeito à RLS. A tabela só tinha INSERT e SELECT do dono: o UPDATE era
-- recusado (42501), a impressão digital nunca mudava e cada pedido seguinte
-- refazia o balanço outra vez (uma chamada ao Gemini e uma mensagem nova de
-- cada vez).
--
-- Só as linhas dele (using e with check): o payload que pode mudar é o dos
-- seus próprios momentos — nada que o servidor confie para outro atleta.

drop policy if exists "own proactive log update" on public.coach_proactive_log;
create policy "own proactive log update" on public.coach_proactive_log
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
