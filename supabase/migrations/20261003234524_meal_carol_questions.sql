-- ============================================================================
-- As perguntas da Carol sobre uma refeição (bug #52, fase B, 2026-10-04)
-- APLICADA EM PRODUÇÃO a 2026-10-03 23:45 UTC (version 20261003234524), antes do
-- push a dev da analyze-meal que grava a coluna (sem ela, gravar uma refeição
-- falhava). Verificada: jsonb, gravável pelo atleta.
-- ============================================================================
--
-- «Em vez de a Carol estar a adivinhar determinadas situações, pode
-- perguntar no momento. Se vê um ovo estrelado, pergunta qual a gordura
-- usada.» A análise grava a refeição com o mais provável e guarda aqui até
-- 2 perguntas ({id, topic, item_name, question, options, assumed,
-- impact_kcal, answer, answered_at}) — analyze-meal/pantry.ts, parseQuestions.
-- A app mostra-as no ecrã do resultado e, enquanto houver alguma por
-- responder, no cartão da refeição; responder passa pela analyze-meal
-- (mode "answer"). Coluna de meals: a política "own rows" de sempre.
-- ============================================================================

alter table public.meals add column if not exists carol_questions jsonb;

comment on column public.meals.carol_questions is
  'Perguntas da Carol sobre a preparação dos alimentos (bug #52): [{id, topic, item_name, question, options, assumed, impact_kcal, answer, answered_at}].';
