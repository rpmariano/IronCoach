/* A intervenção da Carol num registo (corrida, ginásio, refeição, avaliação),
   lida num sítio só (2026-10-05).

   Até aqui cada superfície lia o texto da Carol de um campo diferente: o
   cartão da corrida usava coach_notes || ai_analysis || coach_analysis e o
   formulário coach_notes || coach_analysis; o cartão da avaliação lia
   ai_summary e o formulário coach_notes. Como a dispensa se grava com o
   texto (dismissIntervention(id, texto)), dispensar no cartão não a
   dispensava no formulário, e vice-versa. Agora há UMA chave por tipo,
   usada pelo cartão, pelo formulário e pelo "Registo Guardado"
   (CreatedRecordModal) para gravar e para ler a dispensa — aceitando ainda
   o legado 'dismissed' (dispensa gravada sem texto). */

// O campo que a análise do servidor escreve vem primeiro; os outros são
// nomes antigos que ainda podem estar em registos velhos.
const NOTE_FIELDS = {
  run: ['coach_notes', 'ai_analysis', 'coach_analysis'],
  gym: ['coach_notes', 'coach_analysis'],
  meal: ['coach_notes', 'coach_analysis'],
  // A analyze-body escreve o resumo em ai_summary (não em coach_notes).
  body: ['ai_summary', 'coach_notes', 'coach_analysis'],
};

/** O texto da Carol neste registo — a chave única da dispensa por tipo. */
export function interventionNotes(record, type) {
  if (!record) return null;
  for (const field of NOTE_FIELDS[type] || ['coach_notes']) {
    const v = record[field];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

// As frases com que a análise convida a falar com ela (as mesmas de sempre).
const INTERVENTION_RE = /adaptar o plano|falar com a coach|ajustarmos o teu plano|botão vermelho/i;

/** A análise deste registo pede conversa com a Carol? Pelas marcas que a
 *  análise acabou de devolver (intervention_needed / 'needed', só no registo
 *  acabado de gravar) ou pelo convite no texto. */
export function recordAsksToTalk(record, type) {
  if (!record) return false;
  if (record.intervention_needed || record.coach_intervention_status === 'needed') return true;
  const notes = interventionNotes(record, type);
  return Boolean(notes && INTERVENTION_RE.test(notes));
}

/** Já foi dispensada? Pela chave única, ou pela marca antiga 'dismissed'. */
export function isInterventionDismissed(record, type, dismissed = {}) {
  if (!record?.id) return false;
  const mark = (dismissed || {})[record.id];
  if (mark == null) return false;
  if (mark === 'dismissed') return true;
  return mark === interventionNotes(record, type);
}

/** Mostra-se o "Falar com a Carol" deste registo? */
export function showRecordIntervention(record, type, dismissed = {}) {
  return Boolean(record?.id) && recordAsksToTalk(record, type) && !isInterventionDismissed(record, type, dismissed);
}

const RECORD_NAME = { body: 'Avaliação Corporal' };

/** O pedido ao chat: abre a conversa sobre ESTE registo (a origem). */
export function recordInterventionIntent(record, type, reason = null) {
  return {
    kind: 'proactive_intervention',
    recordType: type,
    recordId: record?.id,
    recordName: RECORD_NAME[type] || record?.name,
    date: record?.date,
    reason: reason || record?.coach_intervention_reason || interventionNotes(record, type),
  };
}
