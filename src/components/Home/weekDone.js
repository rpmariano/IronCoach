/* A semana cumprida — CAROL.md §3: "Semana cumprida a 100%: uma frase de
   reconhecimento. Uma."

   A semana é a do plano acordado, a mesma do "semana 6 de 18" do cartão "O
   que faço hoje" (planWeekLabel): contada a partir do arranque do plano, não
   do calendário. Cumprida quer dizer: todos os treinos dessa semana (corrida
   e ginásio, sem os cancelados) estão concluídos, e são pelo menos dois — um
   treino sozinho não faz uma semana.

   Puro, para os testes; a memória de "já vi o momento" vive em localStorage
   (wasWeekCelebrated/markWeekCelebrated). */

import { addDaysISO } from '../../lib/utils';
import { computeAcceptedWindow, diffDaysISO } from './WeeklyPlanCard';

const TRAINING = new Set(['corrida', 'ginasio']);
const EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
const DIA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']; // domingo primeiro, como getUTCDay()

const dateOf = (i) => String(i.status === 'concluido' ? (i.actual_date || i.planned_date) : i.planned_date).slice(0, 10);

/**
 * { week, count, weekStart, days: [{ dateISO, initial, state: 'done'|'rest', isToday }] }
 * quando a semana do plano em que hoje cai está toda cumprida; null nos outros.
 */
export function weekDone({ plans = [], planItems = [], today }) {
  const win = computeAcceptedWindow(plans, planItems, today);
  if (!win) return null;
  const elapsed = diffDaysISO(win.start, today);
  if (elapsed < 0) return null;
  const week = Math.floor(elapsed / 7) + 1;
  const weekStart = addDaysISO(win.start, (week - 1) * 7);
  const weekEnd = addDaysISO(weekStart, 6);

  const aceites = new Set((plans || []).filter((p) => p.status === 'aceite').map((p) => p.id));
  const treinos = (planItems || []).filter((i) => i && aceites.has(i.plan_id) && TRAINING.has(i.kind)
    && i.status !== 'cancelado' && dateOf(i) >= weekStart && dateOf(i) <= weekEnd);
  if (treinos.length < 2 || !treinos.every((i) => i.status === 'concluido')) return null;

  const feitos = new Set(treinos.map(dateOf));
  const days = Array.from({ length: 7 }, (_, k) => {
    const dateISO = addDaysISO(weekStart, k);
    return {
      dateISO,
      initial: DIA[new Date(`${dateISO}T00:00:00Z`).getUTCDay()],
      state: feitos.has(dateISO) ? 'done' : 'rest',
      isToday: dateISO === today,
    };
  });
  return { week, count: treinos.length, weekStart, days };
}

/** A frase dela. Uma, sem exclamação: o número por extenso até dez. */
export function weekDoneLine({ week, count }) {
  const n = count <= 10 ? EXTENSO[count] : String(count);
  const N = n.charAt(0).toUpperCase() + n.slice(1);
  return `Semana ${week} cumprida. ${N} treinos, ${n} feitos.`;
}

const markKey = (userId, weekStart) => `ironcoach_week_done_${userId || 'anon'}_${weekStart}`;

export function wasWeekCelebrated(userId, weekStart, storage = globalThis.localStorage) {
  try { return storage?.getItem(markKey(userId, weekStart)) === '1'; } catch { return true; }
}

export function markWeekCelebrated(userId, weekStart, storage = globalThis.localStorage) {
  try { storage?.setItem(markKey(userId, weekStart), '1'); } catch { /* sem storage */ }
}
