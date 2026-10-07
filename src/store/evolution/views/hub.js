import { registerEvolutionView } from '../registry';
import {
  calendarPeriod,
  previousPeriod,
  periodLabel,
  periodEarlyState,
  closedDaysOf,
  addDaysISO,
} from '@formulas/calendarPeriod.ts';
import { computeRunAcwr } from '@formulas/runAcwr.ts';
import { computeWeightTrend, WEIGHT_TREND_WINDOW_DAYS } from '@formulas/weightTrend.ts';
import { computeSessionVolumeKg } from '@formulas/sessionVolumeKg.ts';
import {
  dailyNutritionRows,
  summarizeNutritionPeriod,
  energyAvailabilityForDays,
} from '@formulas/nutritionPeriod.ts';
import { goalsResolver } from '../../../utils/goalHistory';
import { acwrStatusLabel, acwrMissingWeeks } from '../../../utils/biEngine';
import { GYM_TARGET_PER_WEEK } from '../../../utils/verdicts/gym';
import { runAcwrCore, weightTrendCore, splitWalksCore } from '../core';
import { walkTotals } from '@formulas/runKinds.ts';
import { rangeText } from '../../../components/Nutrition/nutritionText';

/**
 * Vista do Geral (hub) da Evolução por semana de calendário (2026-10-04, fase 6
 * do plano — §3 "Geral", D2 aprovada; erros O1, O3, O4).
 *
 * Os quatro pilares do Geral, calculados UMA vez por semana (cache em tempo
 * morto, F6) e só com DIAS FECHADOS (R2: hoje ainda não acabou), para cada
 * pilar abrir o separador no MESMO período sem que os números mudem. O que
 * não depende da semana (a prontidão, os insights) vive à parte nos
 * componentes e diz que é "de agora".
 *
 * Regras, pilar a pilar:
 * - Corrida: km e corridas dos dias fechados + ▲/▼ face aos MESMOS dias da
 *   semana anterior (R5), só se o atleta já registava corridas nessa altura.
 *   O ACWR é o de hoje (semana em curso) ou o do fim da semana (semana
 *   passada) — "faltam N sem." quando ainda não há histórico.
 * - Ginásio: sessões de FORÇA à frente, kg por sessão de força só sobre as
 *   sessões com carga ("N sessões" — O3), aulas à parte.
 * - Nutrição (O1): só dias fechados, "X de N dias no objetivo" com o objetivo
 *   de CADA dia (goalsResolver, F3). Sem objetivo definido não há % (nem o
 *   2000 kcal por omissão que o cálculo antigo inventava). EA só em dias
 *   fechados COM refeições (N4), com a origem da massa magra.
 * - Corpo (O4): a ÚLTIMA pesagem até ao fim da semana (uma pesagem de hoje é
 *   um facto fechado), com data; a tendência só com `sufficient` (≥3 pesagens
 *   em ≥10 dias) e a última pesagem a ≤14 dias.
 *
 * Pura: o resultado só depende de (deps, período, hoje). Nada é congelado —
 * o Chart.js pode escrever nos arrays que daqui saiam (não há nenhum, mas a
 * regra das outras vistas vale aqui também).
 */

/** Dias com refeições mínimos para falar de % e de EA (R6). */
export const HUB_MIN_MEAL_DAYS = 3;
/** ▲/▼ da Nutrição só com pelo menos estes dias com refeições dos dois lados. */
export const HUB_DELTA_MIN_MEAL_DAYS = 4;

const EMPTY = [];

const dayOf = (r) => (typeof r?.date === 'string' && r.date.length >= 10 ? r.date.slice(0, 10) : null);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const minISO = (a, b) => (a < b ? a : b);

// 1.º dia de uma lista, memorizado pela identidade dela (o mesmo `runs` serve
// todas as semanas — não se varre o histórico a cada seta).
let firstDayMemo = new WeakMap();
function firstDate(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  if (firstDayMemo.has(list)) return firstDayMemo.get(list);
  let min = null;
  for (const r of list) {
    const d = dayOf(r);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && (min === null || d < min)) min = d;
  }
  firstDayMemo.set(list, min);
  return min;
}

/** Só para testes. */
export function resetHubViewMemo() {
  firstDayMemo = new WeakMap();
}

// ── "Havia objetivo de calorias nesse dia?" (O1, revisão 2026-10-04) ─────────
//
// goalsResolver devolve SEMPRE um objetivo (2000 kcal por omissão quando a linha
// que cobre o dia não tem calorie_goal). Medir um dia contra esse 2000 inventado
// dava "Abaixo do objetivo" a quem só definiu objetivo a meio da semana. Aqui
// decide-se, POR DIA, se o objetivo é um número do atleta: espelha a escolha de
// linha do goalsResolver (última linha que começou até ao fim do dia, em Lisboa;
// antes da primeira, a primeira; hoje e futuro, o perfil; sem histórico, o perfil)
// mas devolve só se essa linha tem calorie_goal > 0.
const lisbonDate = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date(ts));

function calorieGoalSetResolver(history, profile, todayISO) {
  const rows = (history || EMPTY)
    .filter((r) => r?.valid_from)
    .map((r) => ({ day: lisbonDate(r.valid_from), validFrom: String(r.valid_from), set: Number(r.calorie_goal) > 0 }))
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  const current = Number(profile?.calorie_goal) > 0;
  return (dayISO) => {
    if (todayISO && dayISO >= todayISO) return current;
    if (!rows.length) return current;
    let row = rows[0];
    for (const x of rows) {
      if (x.day <= dayISO) row = x;
      else break;
    }
    return row.set;
  };
}

// ── Contagens de uma janela de dias ───────────────────────────────────────

function runStats(runs, from, to) {
  let count = 0;
  let km = 0;
  const days = new Set();
  if (from && to && from <= to) {
    for (const r of runs) {
      const d = dayOf(r);
      if (!d || d < from || d > to) continue;
      count++;
      km += Number(r.distance_km) || 0;
      days.add(d);
    }
  }
  return { count, km, daysWithRun: days.size };
}

const isClass = (s) => s?.kind === 'aula';

/** Sessões de força, aulas e, das de força, as COM carga (O3) e os kg delas. */
function gymStats(sessions, from, to) {
  let strength = 0;
  let classes = 0;
  let loaded = 0;
  let loadKg = 0;
  let withSets = 0;
  if (from && to && from <= to) {
    for (const s of sessions) {
      const d = dayOf(s);
      if (!d || d < from || d > to) continue;
      if (isClass(s)) { classes++; continue; }
      strength++;
      if ((s.workout_session_sets || []).length > 0) withSets++;
      const kg = computeSessionVolumeKg(s);
      if (kg > 0) { loaded++; loadKg += kg; }
    }
  }
  return { strength, classes, loaded, loadKg, withSets };
}

// ── Pilares ───────────────────────────────────────────────────────────────

/** A semana anterior, nos MESMOS N dias (R5): em curso, os N primeiros; fechada, a inteira. */
function equivalentWindow(period, previous, closedN, todayISO) {
  if (closedN <= 0) return null;
  const nPrev = Math.min(closedN, previous.totalDays);
  const end = addDaysISO(previous.start, nPrev - 1);
  return {
    from: previous.start,
    to: end,
    days: nPrev,
    // Fechada (7 dias) diz-se "à semana anterior"; em curso o intervalo exato.
    label: nPrev === previous.totalDays ? 'à semana anterior' : `a ${rangeText(previous.start, end, todayISO)}`,
  };
}

/**
 * Quanto da semana vista é anterior ao 1.º registo do módulo (R7, revisão
 * 2026-10-04). Sem isto, voltar com ‹ a uma semana em que a app ainda não era usada
 * mostrava "0 sessões", "Abaixo do alvo" e "faltam 3 sem." como se fossem factos.
 *   beforeData — o 1.º registo é DEPOIS do último dia fechado: nada a dizer
 *   partial    — o 1.º registo cai a meio dos dias fechados: os zeros só valem dali
 *   dataStart  — o 1.º dia com registo (para o texto)
 */
function coverage(dataStart, from, to) {
  return {
    dataStart,
    beforeData: !!dataStart && !!to && dataStart > to,
    partial: !!dataStart && !!from && !!to && dataStart > from && dataStart <= to,
  };
}

function runPillar({ runs, period, previous, from, to, closedN, todayISO }) {
  const dataStart = firstDate(runs);
  const cur = runStats(runs, from, to);
  const win = equivalentWindow(period, previous, closedN, todayISO);
  let delta = null;
  // Só com o atleta já a registar corridas na 1.ª data comparada: antes disso
  // "0 km" não é um facto, é uma semana em que a app não era usada (R7).
  if (win && dataStart && dataStart <= win.from) {
    const prev = runStats(runs, win.from, win.to);
    if (cur.count + prev.count > 0) {
      delta = { km: { cur: cur.km, prev: prev.km }, count: { cur: cur.count, prev: prev.count }, windowDays: win.days, label: win.label };
    }
  }
  // ACWR: o de hoje na semana em curso; o do fim da semana numa passada.
  const acwr = period.isCurrent ? runAcwrCore(runs, todayISO) : computeRunAcwr(runs, period.end);
  const st = acwrStatusLabel(acwr?.status, acwr?.hasEnoughData);
  return {
    hasHistory: !!dataStart,
    ...coverage(dataStart, from, to),
    ...cur,
    delta,
    acwr: {
      ratio: acwr?.ratio ?? 0,
      hasEnoughData: !!acwr?.hasEnoughData,
      status: acwr?.status ?? 'unknown',
      label: st.label,
      tone: st.tone,
      missing: acwrMissingWeeks(acwr),
      atWeekEnd: !period.isCurrent,
    },
  };
}

function gymPillar({ sessions, period, previous, from, to, closedN, todayISO }) {
  const dataStart = firstDate(sessions);
  const cur = gymStats(sessions, from, to);
  const win = equivalentWindow(period, previous, closedN, todayISO);
  let delta = null;
  if (win && dataStart && dataStart <= win.from) {
    const prev = gymStats(sessions, win.from, win.to);
    if (cur.strength + prev.strength > 0) {
      delta = { strength: { cur: cur.strength, prev: prev.strength }, windowDays: win.days, label: win.label };
    }
  }
  return {
    hasHistory: !!dataStart,
    ...coverage(dataStart, from, to),
    strength: cur.strength,
    classes: cur.classes,
    loadedSessions: cur.loaded,
    // kg por sessão de força COM carga (O3): média sobre as sessões que têm kg.
    kgPerSession: cur.loaded > 0 ? Math.round(cur.loadKg / cur.loaded) : null,
    hasSetsWithoutLoad: cur.withSets > 0 && cur.loaded === 0,
    target: GYM_TARGET_PER_WEEK,
    delta,
  };
}

function nutritionPillar({ meals, runs, gymSessions, bodyAssessments, profile, goalHistory, incompleteDays, period, previous, closed: closedAll, from, to, closedN, todayISO }) {
  /* Os dias que o atleta marcou como incompletos (no Dia) saem das contas da
     nutrição, como no separador Nutrição (2026-10-06). */
  const marked = new Set(Array.isArray(incompleteDays) ? incompleteDays : EMPTY);
  const closed = closedAll.filter((d) => !marked.has(d));
  const goalsFor = goalsResolver(goalHistory || EMPTY, profile, todayISO);
  const hasGoalOn = calorieGoalSetResolver(goalHistory, profile, todayISO);
  const rows = dailyNutritionRows({ meals, waterLogs: null, days: closed, goalsFor });
  // Médias e contagem de dias: TODOS os dias fechados com refeições.
  const summary = summarizeNutritionPeriod(rows);
  // %, estado e "X de N": só os dias cujo objetivo é um número do atleta (O1).
  // Os dias antes de existir objetivo não se medem contra o 2000 por omissão;
  // diz-se quantos ficaram de fora (`daysWithoutGoal`).
  const goalSummary = summarizeNutritionPeriod(rows.filter((r) => hasGoalOn(r.date)));
  const cal = goalSummary.byKey.calories;
  const goalDays = goalSummary.nDays;
  const hasGoal = goalDays > 0;
  const enough = summary.nDays >= HUB_MIN_MEAL_DAYS;
  const goalEnough = goalDays >= HUB_MIN_MEAL_DAYS;

  let ea = null;
  if (enough) {
    const e = energyAvailabilityForDays({ meals, runs, gymSessions, bodyAssessments, days: closed });
    if (e.nDays >= HUB_MIN_MEAL_DAYS && e.average != null) {
      ea = {
        average: e.average,
        nDays: e.nDays,
        source: e.leanMassSource,
        weightFallback: e.weightFallback,
        // O peso por omissão (70 kg) só pesa no número quando houve corridas.
        hasRuns: runStats(runs, from, to).count > 0,
      };
    }
  }

  // ▲/▼: dias com as calorias no objetivo contra a semana anterior, nos mesmos
  // N dias — só com dias COM objetivo que cheguem dos dois lados (R5/R6).
  let delta = null;
  const win = equivalentWindow(period, previous, closedN, todayISO);
  const mealStart = firstDate(meals);
  if (hasGoal && win && mealStart && mealStart <= win.from && goalDays >= HUB_DELTA_MIN_MEAL_DAYS) {
    const prevDays = [];
    for (let d = win.from; d <= win.to; d = addDaysISO(d, 1)) if (hasGoalOn(d) && !marked.has(d)) prevDays.push(d);
    const prevSummary = summarizeNutritionPeriod(dailyNutritionRows({ meals, waterLogs: null, days: prevDays, goalsFor }));
    const pc = prevSummary.byKey.calories;
    if (prevSummary.nDays >= HUB_DELTA_MIN_MEAL_DAYS) {
      delta = {
        cur: { k: cal.daysInGoal, n: cal.nDays },
        prev: { k: pc.daysInGoal, n: pc.nDays },
        windowDays: win.days,
        label: win.label,
      };
    }
  }

  return {
    hasHistory: !!mealStart,
    ...coverage(mealStart, from, to),
    nDays: summary.nDays,
    enough,
    minDays: HUB_MIN_MEAL_DAYS,
    hasGoal,
    goalDays,
    goalEnough,
    daysWithoutGoal: summary.nDays - goalDays,
    avgKcal: summary.byKey.calories.avg != null ? Math.round(summary.byKey.calories.avg) : null,
    goalKcal: cal.goal != null ? Math.round(cal.goal) : null,
    // % e estado só com objetivo definido E dias que cheguem (R6).
    pct: goalEnough ? cal.pctLabel : null,
    status: goalEnough ? cal.status : null,
    daysInGoal: cal.daysInGoal,
    approxGoals: goalSummary.approxGoals,
    ea,
    delta,
  };
}

function bodyPillar({ bodyAssessments, period, todayISO }) {
  // Para o Corpo uma pesagem de hoje é um facto fechado (plano §3): a semana
  // em curso vai até hoje inclusive; uma passada, até ao seu último dia.
  const refDay = period.isCurrent ? todayISO : period.end;
  const all = weightTrendCore(bodyAssessments);
  let upTo = null;
  if (all) {
    const pts = all.rawPoints.filter((pt) => pt.date.slice(0, 10) <= refDay);
    if (pts.length === all.rawPoints.length) upTo = all;
    else if (pts.length > 0) upTo = { rawPoints: pts, ...computeWeightTrend(pts) };
  }
  const last = upTo ? upTo.rawPoints[upTo.rawPoints.length - 1] : null;
  // R7: a 1.ª avaliação é depois do fim desta semana — nada a dizer dela.
  const bodyStart = firstDate(bodyAssessments);
  const beforeData = !last && !!bodyStart && bodyStart > refDay;
  const lastDate = last ? last.date.slice(0, 10) : null;
  const ageDays = lastDate ? daysBetween(lastDate, todayISO) : null;
  // Porta de recência (revisão 2026-10-04): o contrato do weightTrend não tem
  // regra de frescura — 3 pesagens de há 100 dias davam "Em perda" no presente.
  // Sem pesagem nos 14 dias até ao fim do período não se afirma tendência.
  const staleDays = lastDate ? daysBetween(lastDate, refDay) : null;
  const stale = staleDays != null && staleDays > WEIGHT_TREND_WINDOW_DAYS;
  const trendKnown = !!upTo && !stale && upTo.sufficient === true && upTo.weeklyRate != null;

  let assessments = 0;
  for (const a of bodyAssessments || EMPTY) {
    const d = dayOf(a);
    if (d && d >= period.start && d <= refDay) assessments++;
  }

  return {
    hasHistory: !!last,
    beforeData,
    dataStart: bodyStart,
    last: last ? { date: lastDate, weight: last.weight } : null,
    ageDays,
    stale,
    staleDays,
    trendKnown,
    trend: trendKnown ? upTo.trend : null,
    weeklyRate: trendKnown ? upTo.weeklyRate : null,
    pointsInWindow: upTo?.pointsInWindow ?? null,
    spanDays: upTo?.spanDays ?? null,
    assessments,
  };
}

// ── O resumo da semana passada, para o "a começar" (R8) ───────────────────

function previousWeekSummary({ runs, sessions, meals, previous, todayISO }) {
  const dataStarts = [firstDate(runs), firstDate(sessions), firstDate(meals)].filter(Boolean);
  if (dataStarts.length === 0) return null;
  const start = dataStarts.reduce(minISO);
  if (start > previous.end) return null;
  const from = start > previous.start ? start : previous.start;
  const r = runStats(runs, from, previous.end);
  const g = gymStats(sessions, from, previous.end);
  const mealDays = new Set();
  for (const m of meals || EMPTY) {
    const d = dayOf(m);
    if (d && d >= from && d <= previous.end) mealDays.add(d);
  }
  return {
    range: rangeText(previous.start, previous.end, todayISO),
    km: r.km,
    runs: r.count,
    strength: g.strength,
    classes: g.classes,
    mealDays: mealDays.size,
  };
}

// ── A vista ───────────────────────────────────────────────────────────────

/**
 * build([runs, gymSessions, meals, bodyAssessments, profile, goalHistory, nutritionIncompleteDays], { offset }, hoje)
 *
 * O Geral só tem "Semana" (D2): qualquer outro `kind` no store lê-se como semana.
 */
export function buildHubView(deps, periodSel, todayISO) {
  const [runsIn, sessionsIn, mealsIn, bodyIn, profile, goalHistory, incompleteDays] = deps || EMPTY;
  /* Caminhadas (2026-10-05, runKinds.ts): o pilar Corrida é só de corridas e
     diz as caminhadas da semana à parte. Os registos "de qualquer tipo"
     (1.º registo, EA da nutrição) usam a lista inteira; o resumo da semana
     passada recebe só corridas. */
  const allRuns = Array.isArray(runsIn) ? runsIn : EMPTY;
  const split = splitWalksCore(allRuns);
  const runs = split.runs;
  const sessions = Array.isArray(sessionsIn) ? sessionsIn : EMPTY;
  const meals = Array.isArray(mealsIn) ? mealsIn : EMPTY;
  const bodyAssessments = Array.isArray(bodyIn) ? bodyIn : EMPTY;
  const offset = Math.min(0, periodSel?.offset ?? 0);

  const period = calendarPeriod('semana', todayISO, offset);
  const previous = previousPeriod(period, todayISO);
  const closed = closedDaysOf(period, todayISO);
  const closedN = closed.length;
  const from = closedN ? closed[0] : null;
  const to = closedN ? closed[closedN - 1] : null;

  const dataStarts = [firstDate(allRuns), firstDate(sessions), firstDate(meals), firstDate(bodyAssessments)].filter(Boolean);
  const dataStartISO = dataStarts.length ? dataStarts.reduce(minISO) : null;
  const hasAnyRecords = dataStarts.length > 0;

  // R8: sem nenhum dia fechado (segunda-feira) a semana "está a começar".
  const earlyState = periodEarlyState(period, todayISO, 1) === 'a_comecar' ? 'a_comecar' : 'ok';
  const label = periodLabel(period, todayISO, { dataStartISO });

  const ctx = { period, previous, from, to, closedN, todayISO };
  return {
    today: todayISO,
    kind: 'semana',
    offset,
    period,
    previous,
    label,
    closedDays: closedN,
    dataStartISO,
    hasAnyRecords,
    earlyState,
    run: {
      ...runPillar({ runs, ...ctx }),
      // Do 1.º dia da semana até hoje (inclusive) — o que se andou, não um KPI comparado.
      walks: (() => {
        const to = period.end < todayISO ? period.end : todayISO;
        const t = walkTotals(split.walks, period.start, to);
        return t.count > 0 ? t : null;
      })(),
    },
    gym: gymPillar({ sessions, ...ctx }),
    nutrition: nutritionPillar({
      meals, runs: allRuns, gymSessions: sessions, bodyAssessments, profile, goalHistory, incompleteDays, closed, ...ctx,
    }),
    body: bodyPillar({ bodyAssessments, period, todayISO }),
    previousWeek: earlyState === 'a_comecar' ? previousWeekSummary({ runs, sessions, meals, previous, todayISO }) : null,
  };
}

registerEvolutionView('hub', {
  deps: (s) => [s.runs, s.gymSessions, s.meals, s.bodyAssessments, s.profile, s.goalHistory, s.nutritionIncompleteDays],
  build: buildHubView,
  // O histórico de objetivos entra na espera (EVOLUTION_TAB_SLICES.hub não o tem):
  // sem ele a vista seria preparada com os objetivos de hoje em todos os dias.
  slices: ['profile', 'runs', 'gym', 'meals', 'body', 'goalHistory', 'nutritionIncompleteDays'],
});

export default buildHubView;
