-- ============================================================================
-- Sugestão alimentar por dia do plano de treino
--
-- Ver specs/coach-investigacao.md, Bloco 7 — a sugestão alimentar é uma das
-- três formas de entrega decididas, e esta é a que vive colada ao treino:
-- "o que comer no dia em que vais fazer este treino".
--
-- Duas alterações:
--
-- 1. meal_suggestion — texto livre do Coach. Não são macros nem gramas
--    estruturadas de propósito: o enquadramento decidido é SUGESTÃO EDUCATIVA,
--    nunca prescrição (Bloco 7, "Enquadramento de segurança"). Um campo
--    numérico convidaria a app a tratá-lo como meta, que é exatamente o que
--    não pode acontecer. As metas do dia continuam a sair de planAffectsDay().
--
-- 2. kind='descanso' — um dia sem treino pode mesmo assim ter sugestão
--    alimentar (véspera de longão, dia de recuperação). Sem este valor não
--    havia onde pendurar a sugestão nesses dias. Itens 'descanso' não têm
--    treino para concluir e nunca afetam os objetivos de nutrição —
--    planAffectsDay() já os ignora, porque exige kind='corrida'.
--
-- Idempotente: pode correr mais que uma vez sem efeito adverso.
-- ============================================================================

alter table coach_plan_items
  add column if not exists meal_suggestion text;

comment on column coach_plan_items.meal_suggestion is
  'Sugestão alimentar do Coach para o dia deste item, em texto livre. '
  'Educativa, nunca prescritiva — ver specs/coach-investigacao.md, Bloco 7. '
  'Não substitui nem altera as metas de nutrição do dia, que continuam a ser '
  'calculadas em src/utils/nutrition.js.';

-- Alarga o vocabulário de kind sem perder a validação. O constraint tem o
-- nome que o Postgres gera por omissão na criação da tabela.
alter table coach_plan_items
  drop constraint if exists coach_plan_items_kind_check;

alter table coach_plan_items
  add constraint coach_plan_items_kind_check
    check (kind in ('corrida', 'ginasio', 'descanso'));

comment on column coach_plan_items.kind is
  'corrida | ginasio | descanso. Um item ''descanso'' não tem treino a '
  'concluir — existe só para o dia poder ter meal_suggestion e/ou notes.';
