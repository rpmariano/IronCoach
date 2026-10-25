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
