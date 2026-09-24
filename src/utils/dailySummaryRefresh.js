/* O resumo do dia refaz-se quando entra um treino (pedido 2026-09-24).

   O coach-daily-summary gera o cartão da Carol uma vez por dia e guarda-o;
   só se refazia ao aceitar um plano e ao gravar o check-in. Registar a
   corrida às 16h deixava lá, o resto do dia, "Tens hoje o último treino de
   corrida…" — escrito à meia-noite, antes de ela existir.

   Vigia as corridas e os treinos de ginásio do store: uma corrida ou treino
   novo, apagado, ou com outra distância ou data, dentro dos últimos 7 dias
   (a janela do recap e da carga), pede um resumo novo. Vários seguidos (um
   registo e a reanálise com mais prints) juntam-se num só pedido — cada um é
   uma chamada paga ao modelo.

   A primeira lista que chega para cada sessão é o ponto de partida, não uma
   novidade: sem isto, cada arranque da app regenerava o resumo. */

import { todayISO, addDaysISO } from '../lib/utils';

const WINDOW_DAYS = 7;

function trainingKeys({ runs, gymSessions }) {
  const keys = new Map();
  for (const r of runs || []) {
    if (!r?.id || typeof r.date !== 'string') continue;
    const date = r.date.slice(0, 10);
    keys.set(`run:${r.id}:${date}:${Number(r.distance_km) || 0}`, date);
  }
  for (const g of gymSessions || []) {
    if (!g?.id || typeof g.date !== 'string') continue;
    const date = g.date.slice(0, 10);
    keys.set(`gym:${g.id}:${date}`, date);
  }
  return keys;
}

/** Houve mudança num treino dos últimos 7 dias entre `before` e `after`? */
export function recentTrainingChanged(before, after, today = todayISO()) {
  const from = addDaysISO(today, -(WINDOW_DAYS - 1));
  const inWindow = (date) => date >= from && date <= today;
  for (const [key, date] of after) if (!before.has(key) && inWindow(date)) return true;
  for (const [key, date] of before) if (!after.has(key) && inWindow(date)) return true;
  return false;
}

export function startDailySummaryRefresh(store, { delayMs = 3000, today = todayISO } = {}) {
  let userId = null;
  let known = null; // null: à espera da primeira lista desta sessão
  let timer = null;

  const unsubscribe = store.subscribe((state, prev) => {
    const uid = state.session?.user?.id ?? null;
    if (uid !== userId) {
      userId = uid;
      known = null;
      clearTimeout(timer);
      timer = null;
    }
    if (!uid) return;
    if (prev && state.runs === prev.runs && state.gymSessions === prev.gymSessions) return;
    const keys = trainingKeys(state);
    if (known === null) {
      known = keys;
      return;
    }
    const changed = recentTrainingChanged(known, keys, today());
    known = keys;
    if (!changed) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const load = store.getState().loadDailySummary;
      if (typeof load === 'function') Promise.resolve(load({ force: true })).catch(() => {});
    }, delayMs);
  });

  return () => {
    unsubscribe();
    clearTimeout(timer);
  };
}
