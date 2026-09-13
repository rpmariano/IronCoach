import { normalizeStartTime } from './startTime';

/* A ordem dos registos num dia do Calendário (pedido 2026-09-13): pela hora,
   não por tipo. As corridas e os treinos de ginásio têm `start_time`
   (specs/plano-de-prova.md, "A véspera e a hora"); as refeições não têm hora
   própria, mas o tipo diz a que horas costumam ser; a avaliação corporal
   pesa-se de manhã, em jejum. O que não tem hora nenhuma vai para o fim,
   pela ordem de sempre. */

/** Hora habitual de cada tipo de refeição, em minutos desde a meia-noite —
 *  a mesma janela que `getDefaultMealType` usa para adivinhar o tipo pela
 *  hora (MealRegistration). */
export const MEAL_NOMINAL_MINUTES = {
  'pequeno-almoco': 8 * 60,
  'lanche-manha': 11 * 60,
  almoco: 13 * 60,
  lanche: 17 * 60,
  jantar: 20 * 60,
  ceia: 23 * 60,
};

/** 'HH:MM[:SS]' → minutos desde a meia-noite, ou null sem hora. */
export function minutesOfDay(value) {
  const time = normalizeStartTime(value);
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function dayRecordMinutes(kind, item) {
  if (kind === 'run' || kind === 'gym') return minutesOfDay(item?.start_time);
  if (kind === 'meal') return MEAL_NOMINAL_MINUTES[item?.meal_type] ?? null;
  if (kind === 'body') return 0;
  return null;
}

/** Os registos de um dia por ordem cronológica: [{ kind, item }], com
 *  kind ∈ run | gym | meal | body. Empates e registos sem hora mantêm a
 *  ordem de entrada (corrida, ginásio, refeição, corpo). */
export function orderDayRecords({ runs = [], gym = [], meals = [], body = [] }) {
  const entries = [
    ...runs.map((item) => ({ kind: 'run', item })),
    ...gym.map((item) => ({ kind: 'gym', item })),
    ...meals.map((item) => ({ kind: 'meal', item })),
    ...body.map((item) => ({ kind: 'body', item })),
  ].map((entry, index) => ({ ...entry, index, minutes: dayRecordMinutes(entry.kind, entry.item) }));
  return entries
    .sort((a, b) => {
      const am = a.minutes ?? Infinity;
      const bm = b.minutes ?? Infinity;
      return am === bm ? a.index - b.index : am - bm;
    })
    .map(({ kind, item }) => ({ kind, item }));
}
