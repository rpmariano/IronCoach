-- Intervenção proativa da Carol: ela decide, a partir da nota de um registo
-- (analyze-run/meal/gym), que o desvio ao plano justifica falar com o atleta.
-- 'needed' faz aparecer o alerta no Início (Home.jsx); a conversa só arranca
-- quando o atleta carrega, e a Carol fecha-a com a ferramenta
-- resolve_intervention (coach-chat).
--
-- 'resolved' TEM de constar do CHECK: é o valor que runResolveIntervention
-- escreve ao dar a intervenção por encerrada. Sem ele, o UPDATE falhava na
-- restrição e o alerta vermelho ficava preso no ecrã para sempre — o CHECK
-- original desta migração (never applied) só previa os três primeiros.
--
-- 'in_progress' é lido pelo cliente mas nada o escreve ainda; fica previsto.

alter table profiles
  add column if not exists coach_intervention_status text
    default 'none'
    check (coach_intervention_status in ('none', 'needed', 'in_progress', 'resolved'));

alter table profiles
  add column if not exists coach_intervention_reason text;
