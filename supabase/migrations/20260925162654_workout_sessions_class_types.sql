-- ============================================================================
-- Aulas: a modalidade sai de `categories`, que passa a ser sempre grupos musculares
-- APLICADA EM PRODUÇÃO a 2026-09-25 16:26 UTC (version 20260925162654), antes
-- do deploy da analyze-gym que grava class_types. Moveu a modalidade das 2
-- aulas que havia.
-- ============================================================================
--
-- Até aqui `workout_sessions.categories` queria dizer duas coisas: grupos
-- musculares num treino de força, tipo de aula (CrossFit, Treino Funcional…)
-- numa aula. Consequências: uma aula com agachamentos e remo nunca contava
-- para os grupos musculares, e o volume por grupo muscular mostrava
-- "Treino Funcional" como se fosse um músculo (relatado 2026-09-25).
--
-- Agora:
--   categories   → grupos musculares, em qualquer tipo de sessão
--   class_types  → a modalidade da aula (vazio num treino de força)
--
-- As aulas já gravadas passam a modalidade para class_types e ficam sem
-- grupos musculares — escolhem-se no formulário, ou a Carol tira-os das
-- observações quando a aula volta a passar por ela (analyze-gym,
-- inferMuscleGroupsFromNotes).
-- ============================================================================

alter table public.workout_sessions
  add column if not exists class_types text[] not null default '{}';

comment on column public.workout_sessions.class_types is
  'Modalidade da aula (HIIT, CrossFit, Treino Funcional…). Vazio num treino de força. Os grupos musculares vivem em categories, em qualquer tipo de sessão.';
comment on column public.workout_sessions.categories is
  'Grupos musculares trabalhados (Peito, Pernas Inferiores…), num treino de força ou numa aula. A modalidade da aula vive em class_types.';

-- Só se move o que é mesmo modalidade (o vocabulário do cliente e da
-- analyze-gym). Assim o UPDATE pode voltar a correr depois do deploy, para
-- apanhar aulas gravadas pelo servidor antigo no intervalo, sem arrastar
-- grupos musculares que o servidor novo já tenha gravado em categories.
update public.workout_sessions
   set class_types = categories,
       categories = '{}'
 where kind = 'aula'
   and cardinality(class_types) = 0
   and cardinality(categories) > 0
   and categories <@ array['HIIT', 'RPM/Cycling', 'Pilates', 'Yoga', 'Body Pump', 'Zumba',
                           'CrossFit', 'Treino Funcional', 'Natação', 'Outro']::text[];
