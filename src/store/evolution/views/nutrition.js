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
import { nDays, whereOf } from '../../../components/BI/period/periodText';
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
 *   DIAS COM REFEIÇÕES (semana/mês/trimestre), calorias por dia da semana com ≥ 4
 *   registos em pelo menos 5 dos 7 dias da semana.
 * - 2026-10-05 (auditoria dos limiares, N3/N4/N6/N8): os mínimos contam o que
 *   o atleta registou, não o calendário — um mês com 14 dias fechados e 2 com
 *   refeições não chega a "Comer para treinar"; um domingo por registar não
 *   esconde o padrão semanal inteiro, nem no Ano.
 * - dias "provavelmente incompletos" (menos de 40% do objetivo de calorias, ou
 *   uma só refeição): continuam nas contas, mas o ecrã avisa que podem ter
 *   refeições por registar (`incomplete`) e manda-os ao Dia para os marcar.
 * - 2026-10-06: dias MARCADOS como incompletos pelo atleta (no Dia; tabela
 *   nutrition_incomplete_days) saem de TODAS as contas — linhas e resumo,
 *   sugestões de incompletos, comparação, período anterior, Comer para
 *   treinar, EA, micronutrientes, semanas e dias da semana. Continuam em
 *   `closedDays` (o calendário: estado "cedo", textos) e em `days`, com
 *   `state: 'incomplete'` e a linha calculada só para mostrar (`marked`).
 *
 * `build` é pura: só depende de (deps, período, hoje). Não congelar nada.
 */

/** Dias fechados abaixo dos quais o período em curso está "cedo" (R6). */
export const NUTRITION_MIN_CLOSED = 4;
/** "Comer para treinar" a partir de N dias COM REFEIÇÕES (mock-up: 7 no mês, 14 no
 *  trimestre). O nome ficou de quando contava dias fechados; a contagem passou a
 *  ser de dias com refeições em 2026-10-05 (limiares N3). */
export const EATING_MIN_CLOSED = { semana: 4, mes: 7, trimestre: 14, ano: 14 };
/** ▲/▼ só com pelo menos estes dias com refeições dos dois lados. */
export const DELTA_MIN_DAYS = 4;
/** Calorias por dia da semana: um dia da semana conta com pelo menos 4 registos… */
export const WEEKDAY_MIN = 4;
/** …e o padrão aparece quando pelo menos 5 dos 7 dias da semana contam (N4,
 *  2026-10-05): um só domingo por registar não esconde o gráfico todo. */
export const WEEKDAY_MIN_DAYS = 5;
/** Um dia com menos de 40% do objetivo de calorias provavelmente ficou por registar. */
export const INCOMPLETE_KCAL_RATIO = 0.4;
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

/**
 * Dias "provavelmente incompletos" (2026-10-05): dos dias com refeições, os que
 * têm menos de 40% do objetivo de calorias OU uma só refeição. Não saem das
 * contas — o ecrã só diz que alguns podem ter refeições por registar.
 * `mealCounts` é um Map data → número de refeições.
 */
export function incompleteDaysOf(rows, mealCounts) {
  const withMeals = rows.filter((r) => r.hasMeals && r.values.calories != null);
  const days = withMeals
    .filter((r) => {
      const goal = Number(r.goals?.calorie_goal) || 0;
      const lowKcal = goal > 0 && r.values.calories < goal * INCOMPLETE_KCAL_RATIO;
      return lowKcal || (mealCounts.get(r.date) || 0) === 1;
    })
    .map((r) => r.date);
  return { days, n: days.length, of: withMeals.length };
}

/** Os registos por dia da semana de uma chave, com o mínimo de cada dia (N4). */
function weekdayStats(rows, key) {
  const recs = rows.filter((r) => hasRecord(r, key) && r.values[key] != null);
  const days = Array.from({ length: 7 }, (_, i) => {
    const rs = recs.filter((r) => isoWeekday(r.date) === i);
    if (rs.length === 0) return null;
    const avg = meanOf(rs.map((r) => r.values[key]));
    const goal = meanOf(rs.map((r) => Number(r.goals[GOAL_KEY[key]]) || 0));
    const cls = classifyMacroDay(key, avg, goal);
    return { avg, n: rs.length, goal, pctLabel: cls.pctLabel, status: cls.status, thin: rs.length < WEEKDAY_MIN };
  });
  const strong = days.filter((d) => d && !d.thin).length;
  return { shown: strong >= WEEKDAY_MIN_DAYS, complete: strong === 7, strong, days };
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
 * build([meals, waterLogs, runs, gymSessions, bodyAssessments, profile, goalHistory, nutritionIncompleteDays], { kind, offset }, hoje)
 */
export function buildNutritionView(deps, period, todayISO) {
  const [meals, waterLogs, runs, gymSessions, bodyAssessments, profile, goalHistory, markedDays] = deps || EMPTY;
  const kind = period?.kind || 'semana';
  const offset = period?.offset || 0;
  // A vista Dia é a de sempre (DayNutritionCard) e calcula-se no ecrã.
  if (kind === 'dia') return { kind, offset };

  const p = calendarPeriod(kind, todayISO, offset);
  const dataStartISO = firstMealDate(meals);
  const goalsFor = goalsResolver(goalHistory || EMPTY, profile, todayISO);
  const closed = dataStartISO ? closedDaysOf(p, todayISO, dataStartISO) : closedDaysOf(p, todayISO);
  // Os dias marcados como incompletos (2026-10-06): saem de tudo o que conta.
  // `counted` são os dias fechados que contam; `closed` fica o calendário.
  const marked = new Set(Array.isArray(markedDays) ? markedDays : EMPTY);
  const unmarked = (ds) => (marked.size ? ds.filter((d) => !marked.has(d)) : ds);
  const counted = unmarked(closed);
  const countedSet = new Set(counted);
  const markedClosed = closed.filter((d) => marked.has(d));

  const rows = dailyNutritionRows({ meals, waterLogs, days: counted, goalsFor });
  const rowByDate = new Map(rows.map((r) => [r.date, r]));
  const summary = summarizeNutritionPeriod(rows, { minWaterDays: WATER_MIN_DAYS });
  // A linha de um dia marcado só se mostra (o gráfico, o "Ver dia") — nunca conta.
  const markedRowByDate = markedClosed.length
    ? new Map(dailyNutritionRows({ meals, waterLogs, days: markedClosed, goalsFor }).map((r) => [r.date, r]))
    : new Map();
  // Refeições por dia que conta (o "só uma refeição" dos dias provavelmente incompletos).
  const mealCounts = new Map();
  for (const m of meals || EMPTY) {
    const d = typeof m?.date === 'string' ? m.date.slice(0, 10) : null;
    if (d && countedSet.has(d)) mealCounts.set(d, (mealCounts.get(d) || 0) + 1);
  }
  const incomplete = incompleteDaysOf(rows, mealCounts);
  // Primeiro e último dia COM refeições dos fechados: o "(3 dias: 1–3 out)" do cabeçalho.
  const mealDates = rows.filter((r) => r.hasMeals && r.values.calories != null).map((r) => r.date);
  const recordedRange = mealDates.length ? { first: mealDates[0], last: mealDates[mealDates.length - 1] } : null;
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
  const trainingClosed = new Set([...training.keys()].filter((d) => countedSet.has(d)));
  const days = allDays.map((date) => {
    let state;
    if (date > todayISO) state = 'future';
    else if (date === todayISO) state = 'today';
    else if (countedSet.has(date)) state = 'closed';
    else if (markedClosed.includes(date)) state = 'incomplete'; // marcado: fora das contas
    else state = 'before'; // antes do 1.º registo
    let row = null;
    if (state === 'closed') row = rowByDate.get(date);
    else if (state === 'incomplete') row = markedRowByDate.get(date) || null;
    else if (state === 'today') row = todayRow;
    return {
      date,
      state,
      row,
      training: training.get(date) || null,
    };
  });

  // ── Período anterior (R5) ────────────────────────────────────────────────
  const eq = equivalentPrevious(p, todayISO);
  // Antes do 1.º registo não há "anterior": é o primeiro período (mock-up:
  // "Primeiro trimestre com registos — ainda não há outro para comparar.").
  const firstPeriod = !dataStartISO || previousPeriod(p, todayISO).end < dataStartISO;
  let compare = null;
  let eqSummary = null;
  if (eq && !firstPeriod) {
    const prevRows = dailyNutritionRows({ meals, waterLogs, days: unmarked(fromDataStart(eq.days, dataStartISO)), goalsFor });
    const prev = summarizeNutritionPeriod(prevRows, { minWaterDays: WATER_MIN_DAYS });
    eqSummary = prev;
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

  // N6 (2026-10-05): quando não há ▲/▼ por falta de dias de um dos lados, diz-se
  // qual — em vez de a seta desaparecer sem explicação. Em "cedo" não: aí o
  // veredicto já diz que é cedo.
  let compareNote = null;
  if (!compare && eqSummary && earlyState === 'ok') {
    const eqDays = eqSummary.nDays;
    const where = p.isCurrent ? whereOf(kind, label.title, true) : wherePast(kind, p.start, todayISO, offset);
    if (summary.nDays < DELTA_MIN_DAYS) {
      compareNote = `Sem comparação: só há ${nDays(summary.nDays)} com refeições ${where}.`;
    } else if (eqDays < DELTA_MIN_DAYS) {
      compareNote = `Sem comparação: ${eq.label} só tem ${nDays(eqDays)} com refeições.`;
    }
  }

  // ── Comer para treinar, EA e micronutrientes (só dias fechados) ─────────
  // N3 (2026-10-05): o mínimo conta DIAS COM REFEIÇÕES, não dias fechados — com
  // 14 dias fechados e 2 com refeições não há "com treino" nem "sem treino" que
  // se compare. `closedDays` mantém-se (dias fechados) para os textos.
  const eatingRaw = eatingForTraining(rows, trainingClosed, { minClosed: EATING_MIN_CLOSED[kind] ?? 7 });
  const eating = { ...eatingRaw, mealDays: summary.nDays, enough: summary.nDays >= eatingRaw.minClosed };
  const ea = energyAvailabilityForDays({ meals, runs, gymSessions, bodyAssessments, days: counted });
  const micros = micronutrientAverages(meals, counted);

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
    weekdays = byKey((k) => weekdayStats(rows, k));
  }

  // O período anterior INTEIRO (fechado), calculado uma vez e só quando serve:
  // - o "a começar"/"cedo": "Semana passada (28 set – 4 out): 2 300 kcal/dia · …" / "Ver setembro";
  // - dizer, onde falta uma porta de dados (Comer para treinar, dias da
  //   semana), se o período anterior já a abre — "Em setembro tens 24: Ver setembro ›".
  let previousFull = null;
  let previousData = null;
  const weekdaysMissing = !!weekdays && NUTRITION_KEYS.some((k) => !weekdays[k].shown);
  if (p.isCurrent && !firstPeriod && (earlyState !== 'ok' || !eating.enough || weekdaysMissing)) {
    const prevP = previousPeriod(p, todayISO);
    const prevDays = unmarked(fromDataStart(closedDaysOf(prevP, todayISO), dataStartISO));
    const prevRows = dailyNutritionRows({ meals, waterLogs, days: prevDays, goalsFor });
    const prevSum = summarizeNutritionPeriod(prevRows, { minWaterDays: WATER_MIN_DAYS });
    const name = periodName(prevP.kind, prevP.start, prevP.end, todayISO);
    if (earlyState !== 'ok' && prevSum.nDays > 0) {
      previousFull = {
        name,
        range: rangeText(prevP.start, prevP.end, todayISO),
        nDays: prevSum.nDays,
        kcalAvg: prevSum.byKey.calories.avg,
        both: prevSum.both,
      };
    }
    previousData = {
      name,
      mealDays: prevSum.nDays,
      weekdayStrong: byKey((k) => weekdayStats(prevRows, k).strong),
    };
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
    previousData,
    compareNote,
    incomplete,
    // Os dias fechados que o atleta marcou como incompletos (fora das contas).
    marked: { days: markedClosed, n: markedClosed.length },
    recordedRange,
    eating,
    ea,
    micros,
    weeks,
    weekdays,
    verdict,
  };
}

registerEvolutionView('nutricao', {
  deps: (s) => [s.meals, s.waterLogs, s.runs, s.gymSessions, s.bodyAssessments, s.profile, s.goalHistory, s.nutritionIncompleteDays],
  build: buildNutritionView,
});

/** Só para testes. */
export function resetNutritionViewMemo() {
  firstDayMemo = new WeakMap();
}
