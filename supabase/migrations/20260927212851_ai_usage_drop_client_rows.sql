-- ============================================================================
-- ai_usage: apaga as linhas registadas pela app (client_backfill)
-- APLICADA EM PRODUÇÃO a 2026-09-27 21:28 UTC (version 20260927212851).
-- 8 linhas apagadas (27-09 19:46–19:54); fica só o consumo gravado pelo
-- servidor, a partir de 20:43:21.
-- ============================================================================
--
-- Seguimento de 20260927212404_ai_usage_reset_before_topup: as 8 linhas
-- posteriores ao carregamento ainda vinham do código antigo (sem raciocínio
-- do modelo nem comentário da Carol) e subestimavam o custo. Pedido do dono
-- do projeto: a base das análises começa só com registos do servidor.
-- A origem continua em app_logs; o aviso sobre voltar a correr o backfill
-- de 20260927203409_ai_usage.sql (repõe tudo) mantém-se.
-- ============================================================================

delete from public.ai_usage where source = 'client_backfill';
