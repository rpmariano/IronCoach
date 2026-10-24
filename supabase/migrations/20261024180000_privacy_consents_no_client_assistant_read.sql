-- ============================================================================
-- privacy_consents: o cliente deixa de poder escrever linhas 'assistant_read'
-- (revisão pré-deploy do assistant-read, 2026-10-24).
--
-- A política "own privacy_consents insert" (20260921120000_percentile_snapshots)
-- deixa o atleta inserir no seu livro qualquer kind que o check aceite — e
-- desde 20261024120000_assistant_read isso inclui 'assistant_read'. Essas
-- linhas só podem nascer nas RPCs create_assistant_token/revoke_assistant_token,
-- junto com o token a que dizem respeito; uma linha escrita à mão pelo
-- cliente era um consentimento (ou uma retirada) sem token nenhum por trás.
--
-- As RPCs não passam por esta política: são security definer do postgres, o
-- dono da tabela, e a tabela não tem FORCE ROW LEVEL SECURITY (verificado em
-- produção a 2026-10-24).
--
-- O resto da política fica igual ao que está em produção (verificado a
-- 2026-10-24): para todos os papéis, com auth.uid() = user_id. 'stats_pool'
-- e 'leaderboard' continuam a ser escritos pela app como até aqui.
-- ============================================================================

drop policy if exists "own privacy_consents insert" on public.privacy_consents;
create policy "own privacy_consents insert" on public.privacy_consents
  for insert with check (auth.uid() = user_id and kind <> 'assistant_read');
