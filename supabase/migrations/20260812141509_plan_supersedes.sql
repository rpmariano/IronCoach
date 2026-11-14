-- ============================================================================
-- Substituição de plano só se concretiza na aceitação
--
-- Problema: `replace_active_plan` marcava o plano ativo como 'recusado' logo
-- no momento em que o Coach PROPUNHA o substituto. Se o atleta depois
-- recusasse a proposta nova, ficava sem plano nenhum — perdia o microciclo
-- que estava a cumprir por ter pedido para ver uma alternativa.
--
-- Solução: a proposta passa a registar QUAL o plano que pretende substituir,
-- e a substituição só acontece quando o atleta aceita (ver respondToPlan em
-- src/store/index.js). Recusar a proposta deixa tudo como estava.
--
-- Idempotente: pode correr mais que uma vez sem efeito adverso.
-- ============================================================================

alter table coach_plans
  add column if not exists supersedes_plan_id uuid references coach_plans(id) on delete set null;

comment on column coach_plans.supersedes_plan_id is
  'Plano que esta proposta substitui se for aceite. Preenchido por '
  'propose_training_plan quando o atleta confirma que quer substituir o plano '
  'ativo; a substituição (marcar o antigo como ''recusado'') só acontece na '
  'aceitação, nunca na proposta — recusar a proposta tem de deixar o plano '
  'antigo intacto. Ver specs/plano-de-treino.md §5.1.';
