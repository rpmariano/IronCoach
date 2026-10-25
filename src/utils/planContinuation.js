/* A continuação de um plano longo em partes (coach-chat, nextPlanContinuation):
   quando o turno de uma parte chega por sondagem (mais de 45 s) a resposta não
   traz plan_continuation, mas o cliente sabe o que pediu — e a seguinte deriva-se
   dele com a mesma regra do servidor: a semana a seguir a `to`, de 7 dias, sem
   passar o `until` (o dia da prova); acaba quando `until` <= `to`. */

export const PLAN_PART_DAYS = 7;

const addDaysISO = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A parte seguinte a `current` ({ from, to, part, of, until }), ou null. */
export function nextPlanContinuation(current) {
  if (!current || ![current.from, current.to, current.until].every((d) => typeof d === 'string' && ISO.test(d))) return null;
  const part = Number(current.part);
  const of = Number(current.of);
  if (!Number.isFinite(part) || !Number.isFinite(of) || current.until <= current.to) return null;
  const from = addDaysISO(current.to, 1);
  const lastDay = addDaysISO(from, PLAN_PART_DAYS - 1);
  const to = lastDay < current.until ? lastDay : current.until;
  return { from, to, part: part + 1, of: Math.max(of, part + 1), until: current.until };
}

const validCont = (c) => !!c && typeof c.from === 'string' && typeof c.to === 'string'
  && Number.isFinite(Number(c.part)) && Number.isFinite(Number(c.of));

/**
 * Reconstrói a cadeia das partes de um plano longo depois de recarregar a
 * página (tudo-ou-nada, b992ede9): a cadeia são as propostas PENDENTES com o
 * mesmo race_id (ou todas sem prova) e períodos seguidos — o period_start de uma
 * é o dia a seguir ao period_end da anterior. Fora dela nunca há mais de uma
 * pendente. Com menos de duas, não há cadeia (proposta normal).
 *
 * O total vem da última mensagem do modelo com plan_continuation (o `of`); sem
 * ela, é o número de pendentes. Se essa mensagem ainda promete uma parte que
 * não está pendente (part > nº de pendentes), o total conta com ela e devolve-se
 * a continuação por pedir (desarmada, atada à última parte).
 *
 * @returns {null | { of: number, parts: {planId: string, part: number}[],
 *   latestPlanId: string, continuation: null | object }}
 */
export function rebuildPlanChain(plans, modelMessages = []) {
  const pending = (plans || []).filter((p) => p?.status === 'proposto' && p.period_start && p.period_end);
  const groups = new Map();
  for (const p of pending) {
    const key = p.race_id ?? 'sem-prova';
    groups.set(key, [...(groups.get(key) || []), p]);
  }
  let best = null;
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)));
    let run = [];
    for (const p of sorted) {
      const prev = run.at(-1);
      if (prev && addDaysISO(String(prev.period_end).slice(0, 10), 1) === String(p.period_start).slice(0, 10)) run.push(p);
      else run = [p];
      if (run.length >= 2 && (!best || String(run.at(-1).period_start) > String(best.at(-1).period_start))) best = [...run];
    }
  }
  if (!best) return null;
  const n = best.length;
  const last = [...(modelMessages || [])].reverse().find((m) => validCont(m?.plan_continuation));
  const cont = last ? last.plan_continuation : null;
  const promises = !!cont && Number(cont.part) > n;
  let of = cont ? Math.max(Number(cont.of), n) : n;
  if (promises) of = Math.max(of, n + 1);
  const latest = best.at(-1);
  return {
    of,
    parts: best.map((p, i) => ({ planId: p.id, part: i + 1 })),
    latestPlanId: latest.id,
    continuation: promises
      ? {
        from: cont.from, to: cont.to, part: Number(cont.part), of,
        ...(typeof cont.until === 'string' ? { until: cont.until } : null),
        planId: latest.id, armed: false,
      }
      : null,
  };
}
