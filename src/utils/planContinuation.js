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

export const dayAfter = (iso) => addDaysISO(String(iso).slice(0, 10), 1);

/** A continuação que uma mensagem do modelo prometeu para a semana a seguir a
 *  este plano (o `from` dela é o dia a seguir ao period_end), ou null. A mais
 *  recente ganha. */
export function findPromisedContinuation(modelMessages, plan) {
  if (!plan?.period_end) return null;
  const from = dayAfter(plan.period_end);
  const m = [...(modelMessages || [])].reverse().find((x) => validCont(x?.plan_continuation) && x.plan_continuation.from === from);
  return m ? m.plan_continuation : null;
}

const hasTraining = (planId, items) => (items || []).some((i) => i?.plan_id === planId && (i.kind === 'corrida' || i.kind === 'ginasio'));

/**
 * Reconstrói a cadeia das partes de um plano longo depois de recarregar a
 * página (tudo-ou-nada, b992ede9). A cadeia são as propostas PENDENTES de
 * TREINO (com itens corrida/ginasio: um plano só de refeições, que o
 * save_meal_suggestions também cria como proposto, nunca entra) com o mesmo
 * race_id (ou todas sem prova), de períodos seguidos (o period_start de uma é o
 * dia a seguir ao period_end da anterior) E ligadas por uma mensagem do modelo
 * com plan_continuation cujo `from` é o period_start da seguinte. Sem essa
 * ligação não há cadeia: duas propostas encostadas por acaso são propostas
 * normais. Uma só pendente conta se uma mensagem prometer a semana a seguir
 * (parte 1 de N, continuação por pedir).
 *
 * O total vem do `of` das continuações ligadas; se a última promessa ainda não
 * está pendente, o total conta com ela e devolve-se a continuação (desarmada,
 * atada à última parte).
 *
 * @returns {null | { of: number, parts: {planId: string, part: number}[],
 *   latestPlanId: string, continuation: null | object }}
 */
export function rebuildPlanChain(plans, modelMessages = [], planItems = []) {
  const conts = (modelMessages || []).map((m) => m?.plan_continuation).filter(validCont);
  if (!conts.length) return null;
  const starts = new Set(conts.map((c) => c.from));
  const pending = (plans || []).filter((p) => p?.status === 'proposto' && p.period_start && p.period_end && hasTraining(p.id, planItems));
  const groups = new Map();
  for (const p of pending) {
    const key = p.race_id ?? 'sem-prova';
    groups.set(key, [...(groups.get(key) || []), p]);
  }
  let best = null;
  const consider = (run) => {
    const promised = starts.has(dayAfter(run.at(-1).period_end));
    if (run.length < 2 && !promised) return;
    if (!best || String(run.at(-1).period_start) > String(best.at(-1).period_start)) best = [...run];
  };
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)));
    let run = [];
    for (const p of sorted) {
      const prev = run.at(-1);
      const linked = prev && dayAfter(prev.period_end) === String(p.period_start).slice(0, 10) && starts.has(String(p.period_start).slice(0, 10));
      if (linked) run.push(p);
      else { if (run.length) consider(run); run = [p]; }
    }
    if (run.length) consider(run);
  }
  if (!best) return null;
  const n = best.length;
  const latest = best.at(-1);
  const promise = findPromisedContinuation(modelMessages, latest);
  let of = Math.max(n, ...conts.map((c) => Number(c.of)));
  if (promise) of = Math.max(of, n + 1, Number(promise.of));
  return {
    of,
    parts: best.map((p, i) => ({ planId: p.id, part: i + 1 })),
    latestPlanId: latest.id,
    continuation: promise
      ? {
        from: promise.from, to: promise.to, part: Number(promise.part), of,
        ...(typeof promise.until === 'string' ? { until: promise.until } : null),
        planId: latest.id, armed: false,
      }
      : null,
  };
}
