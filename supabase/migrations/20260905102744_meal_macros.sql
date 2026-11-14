-- ============================================================================
-- Sugestão alimentar estruturada: kcal/macros calculados pela Carol,
-- alinhados ao objetivo diário do atleta e ao já registado nesse dia.
--
-- meal_suggestion (text) mantém-se INALTERADA — continua a ser a versão
-- simplificada em prosa (categoria de alimento, quantidade redonda), que já
-- é lida em vários sítios de coach-chat/index.ts (memória da Carol,
-- cruzamento com registos, etc.). Esta coluna nova é só aditiva: guarda o
-- cálculo interno estruturado (alimentos/gramas específicos → macros reais)
-- por trás do texto generalizado, para os anéis de macros do cartão do dia
-- (WeeklyPlanCard.jsx) mostrarem números reais em vez do objetivo diário
-- genérico. Nula para todas as sugestões geradas antes desta migration —
-- o frontend já trata isso como "sem meal_macros" e cai no comportamento
-- anterior (objetivo do perfil).
--
-- Forma: { items: [{tipo, texto}], kcal, protein_g, carbs_g, fat_g }
-- ============================================================================

ALTER TABLE public.coach_plan_items
  ADD COLUMN IF NOT EXISTS meal_macros jsonb;

COMMENT ON COLUMN public.coach_plan_items.meal_macros IS
  'Cálculo estruturado (kcal/macros) por trás da sugestão alimentar em meal_suggestion — nulo para sugestões antigas ou quando a validação do modelo falha. Forma: {items:[{tipo,texto}], kcal, protein_g, carbs_g, fat_g}.';
