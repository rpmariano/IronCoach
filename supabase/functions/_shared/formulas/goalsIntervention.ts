// A intervenção "objetivos" (bug #41, 2026-09-22): depois de uma avaliação
// corporal, a Carol chama o atleta ao chat para definir objetivos — ou para
// os rever, quando a avaliação mostra que os que tem deixaram de servir.
//
// Usa o mesmo mecanismo das outras intervenções (profiles.
// coach_intervention_status/_reason), que até aqui só existia para desvios
// ao plano — e a conversa era de confronto ("o plano ficou comprometido"),
// que não tem nada a ver com convidar alguém a pôr objetivos. A etiqueta no
// início do motivo é o que distingue as duas: o coach-chat lê-a para
// conduzir outra conversa, e a app para fechar a intervenção quando o
// atleta aceita ou recusa a proposta de objetivos. Sem coluna nova, sem
// migração. Vive em formulas/ para o frontend a importar pelo @formulas.

export const GOALS_INTERVENTION_TAG = "[objetivos]";

/* O motivo "faltam objetivos" já estava em produção antes da etiqueta
   (bad9f9e, 2026-09-20), com este início. Uma intervenção dessas ainda
   pendente é também uma conversa sobre objetivos. */
const LEGACY_MISSING_GOALS_PREFIX = "O atleta acabou de registar uma avaliação corporal e ainda não tem objetivos definidos";

export function isGoalsIntervention(reason: string | null | undefined): boolean {
  return typeof reason === "string" &&
    (reason.startsWith(GOALS_INTERVENTION_TAG) || reason.startsWith(LEGACY_MISSING_GOALS_PREFIX));
}

/* Quando o atleta diz que não quer objetivos agora (no chat, ou dispensando o
   aviso no Início), fica uma proposta 'recusado' sem valores. Não aparece em
   lado nenhum — só se leem as 'proposto' — mas entra na espera de 14 dias
   do analyze-body, que conta propostas: sem ela, quem recusava pela conversa
   era chamado outra vez na pesagem seguinte (revisão pré-deploy do #41). */
export const GOALS_DECLINED_RATIONALE = "O atleta preferiu não definir nem rever objetivos agora.";

export function goalsDeclinedMarker(userId: string) {
  return { user_id: userId, status: "recusado", goals: {}, rationale: GOALS_DECLINED_RATIONALE };
}

/** Não há objetivos definidos (todos em falta numa família). */
export function missingGoalsReason(emFalta: string): string {
  return `${GOALS_INTERVENTION_TAG} O atleta acabou de registar uma avaliação corporal e ainda não tem ` +
    `objetivos definidos (${emFalta}). Propõe-lhe definir os objetivos em conjunto — valores do corpo E ` +
    `macronutrientes —, partindo dos números desta avaliação. Pergunta onde ele quer chegar antes de ` +
    `propores valores.`;
}

/** Há objetivos, mas a avaliação diz que deviam mudar. */
export function reviewGoalsReason(motivo: string): string {
  return `${GOALS_INTERVENTION_TAG} O atleta acabou de registar uma avaliação corporal e, pela tua leitura, ` +
    `os objetivos que tem deviam ser revistos: ${motivo.trim()} Explica-lhe porquê, com os números desta ` +
    `avaliação, e propõe os valores novos.`;
}
