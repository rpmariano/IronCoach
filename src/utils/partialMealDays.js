import { dayCompleteness, mealLoggingProfile } from '@formulas/dayCompleteness.ts';

/* Nutrição, opção B (pedido do Rui, 2026-11-01): a app infere os dias com registo PARCIAL — o
   atleta não os marca (o botão «dia incompleto» saiu, e a tabela nutrition_incomplete_days fica
   sem uso). A regra é a do servidor, @formulas/dayCompleteness.ts (dev-back 9a8be656): o perfil
   do atleta (regista tudo / ocasional, a mediana dos dias cheios) sai dos 28 dias fechados antes
   de hoje; um dia com as 3 principais conta sempre como completo.

   Um dia PARCIAL sai das médias, das tendências, da EA e dos «dias no objetivo» (como saíam os
   dias marcados); nos gráficos e no heatmap aparece como «registo parcial». Um dia SEM refeições
   não é parcial aqui: é um dia sem registo, como sempre foi. */

// As refeições agrupadas por dia, uma vez por lista (a mesma `meals` serve todos os períodos).
let groupedMemo = new WeakMap();
function mealsByDay(meals) {
  if (!Array.isArray(meals)) return new Map();
  if (groupedMemo.has(meals)) return groupedMemo.get(meals);
  const out = new Map();
  for (const m of meals) {
    const d = typeof m?.date === 'string' ? m.date.slice(0, 10) : null;
    if (!d) continue;
    const arr = out.get(d);
    if (arr) arr.push(m); else out.set(d, [m]);
  }
  groupedMemo.set(meals, out);
  return out;
}

/**
 * `goalsFor(dayISO)` é o resolvedor dos objetivos de cada dia (utils/goalHistory). Devolve
 * `{ profile, isPartial(dayISO) }`: `profile.kind` é 'completo' ou 'ocasional'.
 */
export function partialMealDays(meals, goalsFor, todayISO) {
  const target = (d) => {
    const g = goalsFor ? goalsFor(d)?.goals?.calorie_goal : null;
    const n = Number(g);
    return n > 0 ? n : null;
  };
  // O objetivo de CADA dia, também no perfil (2026-11-02): como o servidor (coach-chat,
  // coach-daily-summary) — com o de hoje, um dia antigo julgava-se com o objetivo de agora.
  const profile = mealLoggingProfile(Array.isArray(meals) ? meals : [], todayISO, target);
  const byDay = mealsByDay(meals);
  const cache = new Map();
  const isPartial = (dayISO) => {
    if (cache.has(dayISO)) return cache.get(dayISO);
    const dayMeals = byDay.get(dayISO);
    const v = !!dayMeals?.length
      && dayCompleteness(dayMeals, target(dayISO), profile, { dayISO, todayISO }) === 'parcial';
    cache.set(dayISO, v);
    return v;
  };
  return { profile, isPartial };
}

/** Só para testes. */
export function resetPartialMealDaysMemo() {
  groupedMemo = new WeakMap();
}
