import { computeRunAcwr, RUN_ACWR_MIN_HISTORY_WEEKS } from '@formulas/runAcwr.ts';
import { computeAcwr } from '@formulas/acwr.ts';
import { computeWeightTrend } from '@formulas/weightTrend.ts';
import { computeVdotTrend } from '@formulas/vdotTrend.ts';
import { addDaysISO, mondayOf } from '@formulas/calendarPeriod.ts';

/**
 * Cálculos de base partilhados pelos separadores da Evolução (2026-10-04,
 * F6 / plano §2.2). O ACWR de corrida, a tendência de peso e o VDOT eram
 * calculados por cada separador que os mostrava (Corrida, Geral, Nutrição,
 * Corpo, insights…) — até 6 vezes os mesmos números a cada entrada. Aqui
 * calculam-se uma vez por lista: memorizados por IDENTIDADE da lista numa
 * WeakMap (a lista nova de um recarregamento com conteúdo diferente é
 * outra chave; a antiga sai sozinha com o lixo).
 *
 * As fórmulas são as de @formulas (as mesmas da Carol) — isto só evita
 * repeti-las, não as muda. Os resultados não se congelam (podem acabar em
 * `data` do Chart.js), mas quem os lê não os deve alterar: são partilhados.
 */

// Chave da WeakMap para "sem lista" (null/undefined). Só serve de chave e
// de entrada às fórmulas — nunca é devolvida.
const EMPTY = Object.freeze([]);
let memo = new WeakMap();

// Memoriza fn(list, ...args) por identidade de `list` e pelo valor dos args.
function memoByList(name, list, argsKey, compute) {
  const key = list && typeof list === 'object' ? list : EMPTY;
  let perList = memo.get(key);
  if (!perList) {
    perList = new Map();
    memo.set(key, perList);
  }
  const k = `${name}|${argsKey}`;
  if (perList.has(k)) return perList.get(k);
  const value = compute(Array.isArray(list) ? list : EMPTY);
  perList.set(k, value);
  return value;
}

// Nada congelado que possa chegar a um gráfico: o Chart.js põe uma
// propriedade nos arrays de `data` e rebenta com um array congelado.
const acwrFallback = () => ({
  acuteKm: 0, chronicWeeklyKm: 0, ratio: 0, status: 'unknown', hasEnoughData: false, historyWeeks: 0,
});

/** ACWR de corrida de hoje (janelas de 7/28 dias, runAcwr.ts — o mesmo do
 *  KPI e da Carol). */
export function runAcwrCore(runs, todayISO) {
  return memoByList('acwr', runs, todayISO, (list) => {
    try {
      return computeRunAcwr(list, todayISO);
    } catch {
      return acwrFallback();
    }
  });
}

/**
 * Histórico semanal do ACWR (semanas seg–dom), para o gráfico. Mesma conta
 * do calculateACWRHistory do biEngine (carga = km; aguda = a semana; crónica
 * = média dessa semana e das 3 anteriores; rácio só com corridas em 3 das 4
 * semanas), mas presa a `todayISO` em vez de `new Date()` — senão a cache
 * guardava um histórico de outro dia. A última semana é a corrente e vem
 * marcada `inProgress` (ainda parcial): é a fase 5 (R1) que decide como a
 * mostrar; aqui não se esconde nada.
 *
 * Devolve [{ weekStart, acuteLoad, chronicLoad, ratio, hasEnoughData, inProgress }].
 */
export function runAcwrHistoryCore(runs, todayISO, weeksCount = 12) {
  return memoByList('acwrHistory', runs, `${todayISO}|${weeksCount}`, (list) => {
    const currentMonday = mondayOf(todayISO);
    const total = weeksCount + 3; // + 3 semanas de base para a crónica da primeira
    const firstMonday = addDaysISO(currentMonday, -7 * (total - 1));
    const starts = [];
    const loads = [];
    const index = new Map();
    for (let i = 0; i < total; i++) {
      const s = addDaysISO(firstMonday, 7 * i);
      starts.push(s);
      loads.push(0);
      index.set(s, i);
    }
    for (const run of list) {
      const d = typeof run?.date === 'string' ? run.date.slice(0, 10) : null;
      if (!d || d < firstMonday) continue;
      let i;
      try { i = index.get(mondayOf(d)); } catch { continue; }
      if (i === undefined) continue; // semanas futuras
      loads[i] += Number(run.distance_km) || 0;
    }
    const out = [];
    for (let i = 3; i < total; i++) {
      const window = [loads[i], loads[i - 1], loads[i - 2], loads[i - 3]];
      const acute = loads[i];
      const chronic = (window[0] + window[1] + window[2] + window[3]) / 4;
      const { ratio } = computeAcwr(acute, chronic);
      const hasEnoughData = window.filter((v) => v > 0).length >= RUN_ACWR_MIN_HISTORY_WEEKS;
      out.push({
        weekStart: starts[i],
        acuteLoad: Math.round(acute * 10) / 10,
        chronicLoad: Math.round(chronic * 10) / 10,
        ratio: hasEnoughData && ratio !== null ? Math.round(ratio * 100) / 100 : null,
        hasEnoughData,
        inProgress: i === total - 1,
      });
    }
    return out;
  });
}

/** Tendência de peso (weightTrend.ts) com os pontos brutos ordenados — o
 *  mesmo que o calculateWeightTrend do biEngine. null sem pesagens. */
export function weightTrendCore(bodyAssessments) {
  return memoByList('weightTrend', bodyAssessments, '', (list) => {
    try {
      const rawPoints = list
        .filter((a) => a && a.weight_kg > 0 && typeof a.date === 'string')
        .map((a) => ({ date: a.date, weight: a.weight_kg }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (rawPoints.length === 0) return null;
      const result = computeWeightTrend(rawPoints);
      return result ? { rawPoints, ...result } : null;
    } catch {
      return null;
    }
  });
}

/** Pontos de VDOT das corridas que qualificam (vdotTrend.ts), por data. */
export function vdotTrendCore(runs) {
  return memoByList('vdot', runs, '', (list) => {
    try {
      return computeVdotTrend(list);
    } catch {
      return [];
    }
  });
}

/** Só para testes. */
export function resetEvolutionCore() {
  memo = new WeakMap();
}
