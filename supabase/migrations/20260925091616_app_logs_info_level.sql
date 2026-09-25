-- ============================================================================
-- app_logs aceita o nível 'info'
-- (specs/carol-omnisciencia-omnipresenca.md, ação P.10 — revisão pré-deploy
-- de 2026-09-25)
-- APLICADA EM PRODUÇÃO a 2026-09-25 09:16 UTC (version 20260925091616).
-- Testada lá numa transação revertida: 'info' passa, outro nível continua
-- recusado, e as 496 linhas que já existiam validam.
-- ============================================================================
--
-- O coach-proactive-tick grava cada decisão sobre um atleta com algum
-- momento: 'success' quando houve chamada ao modelo (o painel Custos conta-a)
-- e 'info' sem ela (ja_visto, limite_diario, falou_ha_pouco…). Mas o check
-- da tabela só aceitava 'success' e 'error': todas as linhas 'info' eram
-- recusadas (23514) e ficavam só num console.warn, e o registo da P.10 ficou
-- reduzido aos envios.
--
-- Os painéis do Admin não mudam: o de Custos lê só 'success', os contadores
-- do dia só 'success' e 'error', e a lista de logs já mostra os outros níveis
-- com um estilo neutro. O tick regista cada decisão sem custo uma vez por dia
-- (decide.ts, tickLogRow), para as linhas 'info' não encherem as 300 que o
-- Admin mostra.
-- ============================================================================

alter table public.app_logs drop constraint if exists app_logs_level_check;
alter table public.app_logs
  add constraint app_logs_level_check check (level in ('success', 'error', 'info'));
