import { registerEvolutionView } from '../registry';
import {
  addDaysISO,
  calendarPeriod,
  closedDaysOf,
  eachDayISO,
  isoWeekday,
  periodEarlyState,
  periodLabel,
  previousPeriod,
  weekdayAverages,
  weeklyBuckets,
} from '@formulas/calendarPeriod.ts';
import {
  NUTRITION_KEYS,
  GOAL_KEY,
  classifyMacroDay,
  dailyNutritionRows,
  eatingForTraining,
  energyAvailabilityForDays,
  hasRecord,
  micronutrientAverages,
  summarizeNutritionPeriod,
  trainingByDay,
} from '@formulas/nutritionPeriod.ts';
import { goalsResolver } from '../../../utils/goalHistory';
import { nutritionPeriodVerdict } from '../../../utils/verdicts/nutrition';
import { whereOf } from '../../../components/BI/period/periodText';
import { periodName, rangeText, wherePast } from '../../../components/Nutrition/nutritionText';

/**
 * Vista pré-calculada da Nutrição na Evolução (fase 4, 2026-10-04 — plano §3
 * "Nutrição — implementar o mock-up", R1–R10; erros N1, N2, N3, N5, N6, N7).
 *
 * Tudo o que o separador mostra num período, já calculado e estável (a cache
 * de src/store/evolution guarda-o por separador|período|hoje): o ecrã só
 * formata. Regras, do mock-up aprovado "Evolução · Nutrição por período":
 * - só dias FECHADOS (closedDaysOf — hoje nunca entra nas médias nem nos
 *   totais, N1/R2) e, quando o período começa antes do 1.º registo, só desde
 *   esse dia ("desde 13 jul", R7);
 * - o objetivo de CADA dia (goalsResolver, F3/N5) e "objetivos aproximados"
 *   quando algum dia é anterior a 3 out;
 * - uma só régua de estado (classifyMacroDay, N7);
 * - ▲/▼ só contra o período anterior EQUIVALENTE e fechado (R5/N6): num
 *   período em curso, os mesmos dias do anterior ("21 – 26 set" contra seg–sáb
 *   desta semana); num fechado, o anterior inteiro; e só com dias que cheguem
 *   dos dois lados;
 * - mínimos de dados (R6): água com ≥ 3 dias, "Comer para treinar" com ≥ 4/7/14
 *   dias fechados (semana/mês/trimestre), calorias por dia da semana com ≥ 4
 *   registos de cada.
 *
 * `build` é pura: só depende de (deps, período, hoje). Não congelar nada.
 */

/** Dias fechados abaixo dos quais o período em curso está "cedo" (R6). */
export const NUTRITION_MIN_CLOSED = 4;
/** "Comer para treinar" a partir de N dias fechados (mock-up: 7 no mês, 14 no trimestre). */
export const EATING_MIN_CLOSED = { semana: 4, mes: 7, trimestre: 14, ano: 14 };
/** ▲/▼ só com pelo menos estes dias com refeições dos dois lados. */
export const DELTA_MIN_DAYS = 4;
/** Calorias por dia da semana: pelo menos 4 registos de cada dia. */
export const WEEKDAY_MIN = 4;
/** Água com média a partir de 3 dias com registo. */
export const WATER_MIN_DAYS = 3;

const EMPTY = [];

// 1.º dia com refeições, memorizado pela identidade da lista (o mesmo `meals`
// serve todos os períodos — não se varre o histórico a cada seta).
let firstDayMemo = new WeakMap();
function firstMealDate(meals) {
  if (!Array.isArray(meals) || meals.length === 0) return null;
  if (firstDayMemo.has(meals)) return firstDayMemo.get(meals);
  let min = null;
  for (const m of meals) {
    const d = typeof m?.date === 'string' ? m.date.slice(0, 10) : null;
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && (min === null || d < min)) min = d;
  }
  firstDayMemo.set(meals, min);
  return min;
}

const meanOf = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const pctOf = (k, n) => (n > 0 ? Math.round((k * 100) / n) : null);

/* Os dias de `days` a partir do 1.º registo (os de antes não são "dias sem
   registo" — o atleta ainda não usava a app). */
const fromDataStart = (days, dataStartISO) => (dataStartISO ? days.filter((d) => d >= dataStartISO) : days);

/**
 * Estado "a começar" / "cedo" / "ok" do período (R6/R8), contado em dias
 * fechados DESDE O 1.º REGISTO quando o período em curso começa antes dele
 * (R7 — revisão de 2026-10-04). periodEarlyState conta os dias fechados do
 * calendário: com a 1.ª refeição a uma quarta, dava "Só 2 dias fechados nesta
 * semana" com esses 2 dias anteriores ao 1.º registo (e marcados assim no
 * gráfico). Agora:
 *  - nada fechado desde o 1.º registo (ele é hoje) → 'a_comecar';
 *  - menos de NUTRITION_MIN_CLOSED dias fechados desde ele → 'cedo'.
 * Um período passado fica como estava ('ok' — o veredicto trata dos poucos dias).
 */
export function nutritionEarlyState(p, todayISO, closedSinceStart, dataStartISO) {
  const base = periodEarlyState(p, todayISO, NUTRITION_MIN_CLOSED);
  if (!p.isCurrent || base === 'a_comecar') return base;
  if (!dataStartISO || dataStartISO <= p.start) return base;
  if (closedSinceStart === 0) return 'a_comecar';
  if (closedSinceStart < Math.min(NUTRITION_MIN_CLOSED, p.totalDays)) return 'cedo';
  return base;
}

/** O período anterior equivalente (R5): em curso → os mesmos N primeiros dias
 *  do anterior; fechado → o anterior inteiro. */
function equivalentPrevious(p, todayISO) {
  const prev = previousPeriod(p, todayISO);
  if (p.isCurrent) {
    const n = p.closedDays;
    if (n === 0) return null;
    const lastWanted = addDaysISO(prev.start, n - 1);
    const end = lastWanted < prev.end ? lastWanted : prev.end;
    const partial = end !== prev.end;
    return {
      period: prev,
      days: eachDayISO(prev.start, end),
      label: partial ? rangeText(prev.start, end, todayISO) : periodName(prev.kind, prev.start, prev.end, todayISO),
    };
  }
  return { period: prev, days: eachDayISO(prev.start, prev.end), label: periodName(prev.kind, prev.start, prev.end, todayISO) };
}

/** Por chave, os números de um conjunto de linhas (uma semana, um dia da
 *  semana): média, objetivo médio, estado e contagens Dentro/Abaixo/Acima/sem. */
function groupStats(rows, key) {
  const recs = rows.filter((r) => hasRecord(r, key) && r.values[key] != null);
  const avg = meanOf(recs.map((r) => r.values[key]));
  const goal = meanOf(recs.map((r) => Number(r.goals[GOAL_KEY[key]]) || 0));
  const cls = avg == null ? { pct: null, pctLabel: null, status: null } : classifyMacroDay(key, avg, goal);
  return {
    avg,
    goal: goal > 0 ? goal : null,
    nDays: recs.length,
    pct: cls.pct,
    pctLabel: cls.pctLabel,
    status: cls.status,
    ok: recs.filter((r) => r.status[key].status === 'ok').length,
    below: recs.filter((r) => r.status[key].status === 'below').length,
    above: recs.filter((r) => r.status[key].status === 'above').length,
    none: rows.length - recs.length,
  };
}

function byKey(fn) {
  return Object.fromEntries(NUTRITION_KEYS.map((k) => [k, fn(k)]));
}

/**
 * build([meals, waterLogs, runs, gymSessions, bodyAssessments, profile, goalHistory], { kind, offset }, hoje)
 */
export function buildNutritionView(deps, period, todayISO) {
  const [meals, waterLogs, runs, gymSessions, bodyAssessments, profile, goalHistory] = deps || EMPTY;
  const kind = period?.kind || 'semana';
  const offset = period?.offset || 0;
  // A vista Dia é a de sempre (DayNutritionCard) e calcula-se no ecrã.
  if (kind === 'dia') return { kind, offset };

  const p = calendarPeriod(kind, todayISO, offset);
  const dataStartISO = firstMealDate(meals);
  const goalsFor = goalsResolver(goalHistory || EMPTY, profile, todayISO);
  const closed = dataStartISO ? closedDaysOf(p, todayISO, dataStartISO) : closedDaysOf(p, todayISO);
  const closedSet = new Set(closed);

  const rows = dailyNutritionRows({ meals, waterLogs, days: closed, goalsFor });
  const rowByDate = new Map(rows.map((r) => [r.date, r]));
  const summary = summarizeNutritionPeriod(rows, { minWaterDays: WATER_MIN_DAYS });
  const label = periodLabel(p, todayISO, { daysWithData: summary.nDays, dataStartISO });
  const earlyState = nutritionEarlyState(p, todayISO, closed.length, dataStartISO);
  // O período começa antes do 1.º registo ("desde 13 jul"): quantos dias do
  // calendário tem a partir dele (os fechados e os que faltam) — para dizer
  // que "Comer para treinar" não chega lá neste período, em vez de prometer.
  const startsBeforeData = !!dataStartISO && dataStartISO > p.start && dataStartISO <= p.end;
  const daysFromDataStart = startsBeforeData ? eachDayISO(dataStartISO, p.end).length : (dataStartISO && dataStartISO > p.end ? 0 : p.totalDays);

  // Hoje, até agora — só para a barra tracejada da semana e o "hoje já vais
  // em 640 kcal" do período a começar. Nunca entra em médias nem contagens.
  const todayRow = p.isCurrent ? dailyNutritionRows({ meals, waterLogs, days: [todayISO], goalsFor })[0] : null;
  const goalsToday = goalsFor(todayISO).goals;

  // Dias do calendário do período e o que cada um é.
  const allDays = eachDayISO(p.start, p.end);
  const training = trainingByDay({ runs, gymSessions }, allDays.filter((d) => d <= todayISO));
  const trainingClosed = new Set([...training.keys()].filter((d) => closedSet.has(d)));
  const days = allDays.map((date) => {
    let state;
    if (date > todayISO) state = 'future';
    else if (date === todayISO) state = 'today';
    else if (closedSet.has(date)) state = 'closed';
    else state = 'before'; // antes do 1.º registo
    return {
      date,
      state,
      row: state === 'closed' ? rowByDate.get(date) : state === 'today' ? todayRow : null,
      training: training.get(date) || null,
    };
  });

  // ── Período anterior (R5) ────────────────────────────────────────────────
  const eq = equivalentPrevious(p, todayISO);
  // Antes do 1.º registo não há "anterior": é o primeiro período (mock-up:
  // "Primeiro trimestre com registos — ainda não há outro para comparar.").
  const firstPeriod = !dataStartISO || previousPeriod(p, todayISO).end < dataStartISO;
  let compare = null;
  if (eq && !firstPeriod) {
    const prevRows = dailyNutritionRows({ meals, waterLogs, days: fromDataStart(eq.days, dataStartISO), goalsFor });
    const prev = summarizeNutritionPeriod(prevRows, { minWaterDays: WATER_MIN_DAYS });
    if (summary.nDays >= DELTA_MIN_DAYS && prev.nDays >= DELTA_MIN_DAYS) {
      compare = {
        label: eq.label,
        both: {
          cur: summary.both,
          prev: prev.both,
          curPct: pctOf(summary.both.k, summary.both.n),
          prevPct: pctOf(prev.both.k, prev.both.n),
          // A diferença de dias ("▼ 1 face a 21 – 26 set") só serve quando o período
          // está em curso e se compara com os MESMOS dias do anterior. Num período
          // FECHADO o mock-up escreve sempre o anterior por extenso com a %
          // ("▲ agosto: 11 de 29 (38%)"): "▲ 3 face a agosto" não diz quantos dias
          // houve de cada lado (2026-10-04, reparo da verificação no browser).
          sameN: p.isCurrent && summary.both.n === prev.both.n,
        },
        byKey: byKey((k) => {
          const a = summary.byKey[k];
          const b = prev.byKey[k];
          if (a.avg == null || b.avg == null) return null;
          return {
            curAvg: a.avg,
            prevAvg: b.avg,
            curIn: a.daysInGoal,
            curN: a.nDays,
            prevIn: b.daysInGoal,
            prevN: b.nDays,
            curInPct: pctOf(a.daysInGoal, a.nDays),
            prevInPct: pctOf(b.daysInGoal, b.nDays),
          };
        }),
      };
    }
  }

  // O período anterior INTEIRO (fechado), para o "a começar" e o "cedo":
  // "Semana passada (28 set – 4 out): 2 300 kcal/dia · …" / "Ver setembro".
  let previousFull = null;
  if (p.isCurrent && earlyState !== 'ok' && !firstPeriod) {
    const prevP = previousPeriod(p, todayISO);
    const prevDays = fromDataStart(closedDaysOf(prevP, todayISO), dataStartISO);
    const prevSum = summarizeNutritionPeriod(dailyNutritionRows({ meals, waterLogs, days: prevDays, goalsFor }), { minWaterDays: WATER_MIN_DAYS });
    if (prevSum.nDays > 0) {
      previousFull = {
        name: periodName(prevP.kind, prevP.start, prevP.end, todayISO),
        range: rangeText(prevP.start, prevP.end, todayISO),
        nDays: prevSum.nDays,
        kcalAvg: prevSum.byKey.calories.avg,
        both: prevSum.both,
      };
    }
  }

  // ── Comer para treinar, EA e micronutrientes (só dias fechados) ─────────
  const eating = eatingForTraining(rows, trainingClosed, { minClosed: EATING_MIN_CLOSED[kind] ?? 7 });
  const ea = energyAvailabilityForDays({ meals, runs, gymSessions, bodyAssessments, days: closed });
  const micros = micronutrientAverages(meals, closed);

  // ── Trimestre: semanas e dias da semana ─────────────────────────────────
  let weeks = null;
  let weekdays = null;
  if (kind === 'trimestre' || kind === 'ano') {
    weeks = weeklyBuckets(allDays).map(({ weekStart, days: wd }) => {
      const wRows = wd.map((d) => rowByDate.get(d)).filter(Boolean);
      return {
        weekStart,
        start: wd[0],
        end: wd[wd.length - 1],
        closedDays: wRows.length,
        future: wd[0] > todayISO,
        beforeData: !dataStartISO || wd[wd.length - 1] < dataStartISO,
        inProgress: p.isCurrent && wd.includes(todayISO),
        perKey: byKey((k) => groupStats(wRows, k)),
      };
    });
    weekdays = byKey((k) => {
      const recs = rows.filter((r) => hasRecord(r, k) && r.values[k] != null);
      const avgs = weekdayAverages(recs.map((r) => ({ date: r.date, value: r.values[k] })), WEEKDAY_MIN);
      const per = avgs.map((a, i) => {
        if (!a) return null;
        const goal = meanOf(recs.filter((r) => isoWeekday(r.date) === i).map((r) => Number(r.goals[GOAL_KEY[k]]) || 0));
        const cls = classifyMacroDay(k, a.avg, goal);
        return { avg: a.avg, n: a.n, goal, pctLabel: cls.pctLabel, status: cls.status };
      });
      return { complete: per.every(Boolean), days: per };
    });
  }

  const verdict = nutritionPeriodVerdict({
    summary,
    isCurrent: p.isCurrent,
    where: p.isCurrent ? whereOf(kind, label.title, true) : wherePast(kind, p.start, todayISO, offset),
    eating: eating.enough ? eating : null,
    ea: eating.enough ? ea : null,
  });

  return {
    kind,
    offset,
    period: p,
    label,
    earlyState,
    dataStartISO,
    startsBeforeData,
    daysFromDataStart,
    hasAnyMeals: !!dataStartISO,
    daysWithData: summary.nDays,
    closedDays: closed,
    rows,
    summary,
    goalsToday,
    todayRow,
    days,
    leadingBlanks: isoWeekday(p.start),
    compare,
    firstPeriod,
    previousFull,
    eating,
    ea,
    micros,
    weeks,
    weekdays,
    verdict,
  };
}

registerEvolutionView('nutricao', {
  deps: (s) => [s.meals, s.waterLogs, s.runs, s.gymSessions, s.bodyAssessments, s.profile, s.goalHistory],
  build: buildNutritionView,
});

/** Só para testes. */
export function resetNutritionViewMemo() {
  firstDayMemo = new WeakMap();
}
