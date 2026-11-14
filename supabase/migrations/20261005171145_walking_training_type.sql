-- Caminhada como tipo de treino da corrida (2026-10-05).
--
-- Feature "Caminhada", aprovada pelo dono do produto: útil para recuperações
-- físicas (lesão, cirurgia, pós-prova) e para quem não pode correr. Modelo:
-- NÃO há tabela nova — a caminhada é um registo de `runs` com
-- kind = 'treino' e training_type = 'caminhada' (ver
-- supabase/functions/_shared/formulas/runKinds.ts, o critério único que a
-- tira da carga de corrida no cliente e nas Edge Functions).
--
-- O que muda: o check de runs.training_type passa a aceitar 'caminhada'. É
-- só isso — a lista antiga fica toda (incluindo 'sprints', mantido por
-- compatibilidade com registos antigos). Código antigo continua a funcionar
-- igual: nunca envia 'caminhada', e todos os valores que enviava continuam
-- válidos. Sem dados a migrar.
--
-- coach_plan_items NÃO muda: a caminhada do plano é kind = 'corrida' com
-- training_type = 'caminhada' (training_type é texto livre nessa tabela, sem
-- check), e a intensidade (leve/moderada) vai em `categories`, a coluna
-- text[] que nos itens de corrida estava sempre vazia. O check de
-- coach_plan_items.kind ('corrida','ginasio','descanso') fica como está.
--
-- ORDEM DE DEPLOY: esta migração ANTES das Edge Functions (analyze-run
-- passa a aceitar e gravar 'caminhada'; coach-chat passa a pô-la nos
-- planos). Ao contrário não rebenta nada no plano, mas um registo de
-- caminhada falharia o insert em runs com violação do check.
--
-- ROLLBACK (só depois de reverter o código e de não haver caminhadas
-- gravadas — senão o add constraint falha; nesse caso, primeiro
--   update public.runs set training_type = 'recuperacao' where training_type = 'caminhada';
-- ou apagar esses registos, decisão do dono do produto):
--   alter table public.runs drop constraint if exists runs_training_type_check;
--   alter table public.runs add constraint runs_training_type_check check (
--     training_type is null or training_type in (
--       'continuo', 'longo', 'tempo', 'recuperacao', 'fartlek',
--       'intervalos', 'subidas', 'trail', 'tecnico', 'sprints'
--     )
--   );

begin;

-- O nome é o que o Postgres deu ao check inline do `create table runs`
-- (supabase_schema.sql). `if exists` para não falhar num ambiente onde o
-- check tenha outro nome ou já tenha sido removido.
alter table public.runs drop constraint if exists runs_training_type_check;

alter table public.runs add constraint runs_training_type_check check (
  training_type is null or training_type in (
    'continuo', 'longo', 'tempo', 'recuperacao', 'fartlek',
    'intervalos', 'subidas', 'trail', 'tecnico', 'sprints',
    'caminhada'
  )
);

comment on column public.runs.training_type is
  'Tipo de treino (kind = treino). ''caminhada'' (2026-10-05) é uma caminhada: fica fora de toda a carga de corrida — ver supabase/functions/_shared/formulas/runKinds.ts.';

commit;
