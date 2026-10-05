import { registerEvolutionView } from '../registry';
import {
  calendarPeriod,
  previousPeriod,
  periodLabel,
  periodEarlyState,
  closedDaysOf,
  weeklyBuckets,
  addDaysISO,
  mondayOf,
  isoWeekday,
} from '@formulas/calendarPeriod.ts';
import { computeAcwr, classifyAcwrZone } from '@formulas/acwr.ts';
import { RUN_ACWR_MIN_HISTORY_WEEKS } from '@formulas/runAcwr.ts';
import { computeBestPace } from '@formulas/bestPace.ts';
import { focusRace } from '@formulas/mainRace.ts';
import { runAcwrCore, vdotTrendCore, splitWalksCore } from '../core';
import { walkTotals } from '@formulas/runKinds.ts';
import {
  calculateTrainingDistribution,
  calculatePaceVsHR,
  getRacePrediction,
  acwrStatusLabel,
  acwrMissingWeeks,
} from '../../../utils/biEngine';
import { calculateRaceTrainingPlan } from '../../../utils/racePlanEngine';
import { runVerdict } from '../../../utils/verdicts/run';
import { fmtDatePt } from '../../../utils/verdicts/shared';
import { whereOf, pickFallbackPeriod, closedWeekStarts, nextWeekCloseISO, shortPeriodName } from '../../../components/BI/period/periodText';

/**
 * Vista da Corrida por período de calendário (2026-10-04, fase 5 do plano da
 * Evolução — erros R1, R5, R6, R10-resto; plano §3 "Corrida").
 *
 * Tudo o que o separador mostra sai daqui, calculado UMA vez por período
 * (cache em tempo morto, F6) e só com DIAS FECHADOS (R2: hoje ainda não
 * acabou). O que NÃO depende do período — o ACWR, o VDOT, os recordes — vem
 * à parte e o ecrã diz que é "de hoje"/"últimas 12 semanas"/"de sempre".
 *
 * Pura: o resultado só depende de (deps, período, hoje). Nada é congelado —
 * o Chart.js escreve nos arrays de `data`.
 */

/** Dias fechados mínimos para tirar conclusões do período (R6). */
export const RUN_MIN_CLOSED = 4;
/** Semanas completas mínimas para uma média por semana (R6). */
export const MIN_WEEKS_FOR_AVG = 2;
/** Pontos de VDOT em cada período para os comparar (plano §3). */
export const MIN_VDOT_POINTS = 3;
/** Corridas com zonas / com FC para mostrar donut e eficiência aeróbica. */
export const MIN_RUNS_FOR_ZONES = 3;
export const MIN_RUNS_FOR_EFFICIENCY = 3;
/** Corridas com tempo, em cada período, para uma diferença de ritmo. */
export const MIN_PACE_RUNS_FOR_DELTA = 2;
/** Semanas do gráfico ACWR (a última é a em curso). */
export const ACWR_WEEKS_SHOWN = 12;

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAYS_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

const dayOf = (r) => (typeof r?.date === 'string' && r.date.length >= 10 ? r.date.slice(0, 10) : null);
const dayNum = (iso) => Number(iso.slice(8, 10));
const monthShort = (iso) => MONTHS_SHORT[Number(iso.slice(5, 7)) - 1];

/** "28 – 30 set", "28 set – 3 out", "3 out".
 *  Com `todayISO`, acrescenta o ano quando o intervalo não é do ano corrente
 *  (mesma regra do formatRange de calendarPeriod.ts): sem ele, "1 jan – 3 out"
 *  lido no Ano de 2026 era o ano errado (2026-10-04, revisão da Corrida). */
export function fmtRange(a, b, todayISO = null) {
  const cy = todayISO ? Number(todayISO.slice(0, 4)) : null;
  const ya = Number(a.slice(0, 4));
  const yb = Number(b.slice(0, 4));
  const short = (iso, withYear) => `${dayNum(iso)} ${monthShort(iso)}${withYear ? ` ${iso.slice(0, 4)}` : ''}`;
  if (cy === null) {
    if (a === b) return short(a, false);
    if (a.slice(0, 7) === b.slice(0, 7)) return `${dayNum(a)} – ${dayNum(b)} ${monthShort(b)}`;
    return `${short(a, false)} – ${short(b, false)}`;
  }
  if (a === b) return short(a, ya !== cy);
  if (ya !== yb) return `${short(a, true)} – ${short(b, true)}`;
  const suffix = ya !== cy ? ` ${ya}` : '';
  if (a.slice(0, 7) === b.slice(0, 7)) return `${dayNum(a)} – ${dayNum(b)} ${monthShort(b)}${suffix}`;
  return `${short(a, false)} – ${short(b, false)}${suffix}`;
}

/** "sáb 3 out". */
const fmtDayLabel = (iso) => `${WEEKDAYS_SHORT[isoWeekday(iso)]} ${dayNum(iso)} ${monthShort(iso)}`;

const maxISO = (a, b) => (a > b ? a : b);

// ── Estatísticas de uma janela de dias ────────────────────────────────────

function windowStats(runs, from, to) {
  let count = 0;
  let km = 0;
  let paceKm = 0;
  let paceSec = 0;
  let withTime = 0;
  const days = new Set();
  if (from && to && from <= to) {
    for (const r of runs) {
      const d = dayOf(r);
      if (!d || d < from || d > to) continue;
      count++;
      days.add(d);
      const dist = Number(r.distance_km) || 0;
      const dur = Number(r.duration_seconds) || 0;
      km += dist;
      // R4: o ritmo só conta corridas com distância E tempo.
      if (dist > 0 && dur > 0) {
        paceKm += dist;
        paceSec += dur;
        withTime++;
      }
    }
  }
  return { from, to, count, km, daysWithRun: days.size, paceSec: paceKm > 0 ? paceSec / paceKm : null, withTime };
}

/** Média de km por semana sobre as semanas seg–dom FECHADAS que TOCAM
 *  [start, end] (2026-10-05, limiares R4). Antes só contavam as INTEIRAS dentro
 *  do período: outubro só tinha a 1.ª a 11 out e a linha ficava vazia mais de
 *  metade do mês. A semana que cruza a fronteira (28 set – 4 out) é uma semana
 *  completa de corridas e conta para os dois meses — o km dela é o da semana
 *  toda, não só dos dias de outubro, e o ecrã di-lo ("em 3 semanas (28 set –
 *  18 out)"). Uma semana que começa antes do 1.º registo não conta. */
function weeklyAverage(runs, start, end, todayISO, dataStartISO) {
  const starts = closedWeekStarts(start, end, todayISO, dataStartISO);
  if (!starts.length) return { weeks: 0, avgKm: null, range: null };
  const loads = new Map(starts.map((m) => [m, 0]));
  for (const r of runs) {
    const d = dayOf(r);
    if (!d) continue;
    const m = mondayOf(d);
    if (loads.has(m)) loads.set(m, loads.get(m) + (Number(r.distance_km) || 0));
  }
  let sum = 0;
  for (const v of loads.values()) sum += v;
  return {
    weeks: starts.length,
    avgKm: sum / starts.length,
    range: fmtRange(starts[0], addDaysISO(starts[starts.length - 1], 6), todayISO),
  };
}

// ── ACWR por semanas fechadas (R1) ────────────────────────────────────────

/**
 * Histórico semanal do gráfico (R1, 2026-10-04). Aguda = a semana seg–dom;
 * crónica = média dessa e das 3 anteriores; o rácio só existe com corridas em
 * 3 das 4 semanas e SÓ para semanas FECHADAS. A semana em curso entra como
 * barra ("em curso") sem rácio: antes era a carga aguda e dava 0,00 "Carga
 * baixa" à segunda enquanto o KPI dizia "Ideal" (a mesma conta, janelas
 * diferentes). A classificação usa o rácio SEM arredondar e `>` (acwr.ts):
 * antes classificava o arredondado com `>=` e 1,295–1,30 era "Atenção".
 * Semanas inteiras antes do 1.º registo não são zero: `acuteLoad` null.
 */
export function weeklyAcwr(runs, todayISO, dataStartISO = null, weeksShown = ACWR_WEEKS_SHOWN) {
  const currentMonday = mondayOf(todayISO);
  const total = weeksShown + 3; // + 3 semanas de base para a crónica da primeira
  const firstMonday = addDaysISO(currentMonday, -7 * (total - 1));
  const loads = new Array(total).fill(0);
  for (const r of runs) {
    const d = dayOf(r);
    if (!d || d < firstMonday || d > addDaysISO(currentMonday, 6)) continue;
    const i = Math.round((Date.parse(`${mondayOf(d)}T00:00:00Z`) - Date.parse(`${firstMonday}T00:00:00Z`)) / (7 * 86400000));
    if (i >= 0 && i < total) loads[i] += Number(r.distance_km) || 0;
  }
  const out = [];
  for (let i = 3; i < total; i++) {
    const weekStart = addDaysISO(firstMonday, 7 * i);
    const inProgress = i === total - 1;
    const window = [loads[i], loads[i - 1], loads[i - 2], loads[i - 3]];
    const chronic = (window[0] + window[1] + window[2] + window[3]) / 4;
    const hasEnoughData = !inProgress && window.filter((v) => v > 0).length >= RUN_ACWR_MIN_HISTORY_WEEKS;
    const { ratio } = computeAcwr(loads[i], chronic);
    const beforeData = !!dataStartISO && addDaysISO(weekStart, 6) < dataStartISO;
    out.push({
      weekStart,
      weekLabel: `${dayNum(weekStart)} ${monthShort(weekStart)}`,
      acuteLoad: beforeData ? null : Math.round(loads[i] * 10) / 10,
      chronicLoad: Math.round(chronic * 10) / 10,
      // Rácio SEM arredondar: o tooltip formata com fmtRatio (1,304 não vira "1,30" na
      // borda da zona verde enquanto a semana é "Atenção"; 2026-10-04, revisão).
      ratio: hasEnoughData && ratio !== null ? ratio : null,
      zone: hasEnoughData && ratio !== null ? classifyAcwrZone(ratio) : null,
      hasEnoughData,
      inProgress,
    });
  }
  return out;
}

// ── Relógio: desnível, calorias, cadência ─────────────────────────────────

/**
 * Cartão do relógio do período (2026-10-04). Cada métrica diz em quantas
 * corridas existe ("3 de 6 corridas com dados"): a soma de 3 corridas não é o
 * desnível das 6. A cadência é ponderada pelo TEMPO (uma rodagem de 90 min
 * pesa mais do que um tiro de 5): a média simples das corridas, que a Carol
 * usa em computeRunWatchMetrics, mantém-se lá — esta é só do ecrã. Sem
 * nenhuma corrida com tempo e cadência, cai na média simples.
 */
export function watchMetricsOf(runs) {
  let elevation = 0;
  let nElevation = 0;
  let calories = 0;
  let nCalories = 0;
  let cadSecs = 0;
  let cadWeighted = 0;
  let cadSimpleSum = 0;
  let nCadence = 0;
  for (const r of runs) {
    const d = r?.details || {};
    if (Number(d.elevation_gain_m) > 0) { elevation += Number(d.elevation_gain_m); nElevation++; }
    if (Number(d.calories_kcal) > 0) { calories += Number(d.calories_kcal); nCalories++; }
    if (Number(d.cadence_spm) > 0) {
      const spm = Number(d.cadence_spm);
      nCadence++;
      cadSimpleSum += spm;
      const secs = Number(r.duration_seconds) || 0;
      if (secs > 0) { cadSecs += secs; cadWeighted += spm * secs; }
    }
  }
  const avgCadence = nCadence === 0 ? null : Math.round(cadSecs > 0 ? cadWeighted / cadSecs : cadSimpleSum / nCadence);
  return {
    total: runs.length,
    elevation: nElevation > 0 ? elevation : null,
    nElevation,
    calories: nCalories > 0 ? calories : null,
    nCalories,
    avgCadence,
    nCadence,
    cadenceWeighted: nCadence > 0 && cadSecs > 0,
    hasAny: nElevation + nCalories + nCadence > 0,
  };
}

// ── Barras de distância (R5) ──────────────────────────────────────────────

/**
 * Barras com o MESMO intervalo dos KPIs (R5): os dias fechados do período,
 * por dia em Semana/Mês e por semana em Trimestre/Ano. O total é a soma das
 * barras. Antes: 8 barras na Semana, a 1.ª sempre a zero, e dias que contavam
 * no total sem barra. Dias anteriores ao 1.º registo não existem (não são
 * zeros). Uma semana só parcialmente dentro do período diz quantos dias tem.
 */
function distanceBars(runs, closedDays, kind) {
  if (closedDays.length === 0) return null;
  const perDay = new Map();
  for (const r of runs) {
    const d = dayOf(r);
    if (!d) continue;
    perDay.set(d, (perDay.get(d) || 0) + (Number(r.distance_km) || 0));
  }
  const daily = kind === 'semana' || kind === 'mes';
  let labels;
  let values;
  let counts;
  if (daily) {
    labels = closedDays.map(fmtDayLabel);
    values = closedDays.map((d) => perDay.get(d) || 0);
    counts = closedDays.map(() => 1);
  } else {
    const buckets = weeklyBuckets(closedDays);
    labels = buckets.map((b) => {
      const range = fmtRange(b.days[0], b.days[b.days.length - 1]);
      return b.days.length < 7 ? `${range} (${b.days.length} ${b.days.length === 1 ? 'dia' : 'dias'})` : range;
    });
    values = buckets.map((b) => b.days.reduce((s, d) => s + (perDay.get(d) || 0), 0));
    counts = buckets.map((b) => b.days.length);
  }
  return {
    unit: daily ? 'day' : 'week',
    labels,
    values,
    counts,
    total: values.reduce((s, v) => s + v, 0),
    max: Math.max(0, ...values),
  };
}

// ── Caminhadas do período (2026-10-05) ────────────────────────────────────

/**
 * "N caminhadas · X km" do período, à parte das corridas (runKinds.ts). Do 1.º
 * dia do período até hoje INCLUSIVE: não é um KPI comparado (a régua dos dias
 * fechados serve as comparações), é o registo do que se andou — e quem só
 * caminha (lesão, pós-operatório) vê a caminhada de hoje logo. null quando o
 * período não tem nenhuma.
 */
export function walksOfPeriod(walks, period, todayISO) {
  const to = period.end < todayISO ? period.end : todayISO;
  if (!walks?.length || period.start > to) return null;
  const t = walkTotals(walks, period.start, to);
  return t.count > 0 ? { ...t, from: period.start, to } : null;
}

// ── O nome curto do período anterior, para "face a …" ─────────────────────

const shortName = shortPeriodName;

// ── A vista ───────────────────────────────────────────────────────────────

export function buildRunView([runsIn, profile, raceEvents, coachPlans, coachPlanItems], periodSel, todayISO) {
  /* Caminhadas (2026-10-05, runKinds.ts): a vista da Corrida é SÓ de corridas —
     KPIs, carga, VDOT, recordes, previsão, zonas, eficiência. As caminhadas
     do período dizem-se à parte (`walks`, "N caminhadas · X km"). */
  const split = splitWalksCore(Array.isArray(runsIn) ? runsIn : []);
  const runs = split.runs;
  const kind = periodSel?.kind || 'mes';
  const offset = periodSel?.offset ?? 0;
  const period = calendarPeriod(kind, todayISO, offset);
  const previous = previousPeriod(period, todayISO);

  const dates = runs.map(dayOf).filter(Boolean);
  const dataStartISO = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;

  const calEarly = periodEarlyState(period, todayISO, RUN_MIN_CLOSED);
  // A janela dos KPIs: dias fechados do período, a partir do 1.º registo (R7).
  const closedDays = dataStartISO ? closedDaysOf(period, todayISO, dataStartISO) : [];
  const from = closedDays.length ? closedDays[0] : null;
  const to = closedDays.length ? closedDays[closedDays.length - 1] : null;
  const beforeData = !!dataStartISO && dataStartISO > period.end;
  /* O estado de arranque conta os dias fechados COM registo (a partir do 1.º):
     quem começou a 2 out não tem "3 dias fechados" em outubro, tem 2 (R6/R7).
     Sem nenhum e com o 1.º registo de hoje, é "a começar" na mesma, mas o
     título não diz "o mês começou hoje" (firstDay). */
  const earlyState = beforeData ? calEarly
    : (calEarly === 'a_comecar' || closedDays.length === 0) ? 'a_comecar'
    // "Ainda é cedo" só faz sentido num período em curso: num fechado (setembro com
    // registos desde 28 set) nunca vai ficar mais tarde, e os números são factos.
    : (period.isCurrent && closedDays.length < Math.min(RUN_MIN_CLOSED, period.totalDays)) ? 'cedo' : 'ok';
  const firstDay = earlyState === 'a_comecar' && calEarly !== 'a_comecar';
  const closedRuns = from ? runs.filter((r) => { const d = dayOf(r); return d && d >= from && d <= to; }) : [];

  const cur = windowStats(runs, from, to);
  const weekly = kind === 'semana'
    ? { weeks: 0, avgKm: null, range: null, nextCloseISO: null }
    : { ...weeklyAverage(runs, period.start, period.end, todayISO, dataStartISO), nextCloseISO: nextWeekCloseISO(period.start, period.end, todayISO, dataStartISO) };

  // ── O período anterior, equivalente e fechado (R5) ──
  const prevLabelFull = periodLabel(previous, todayISO);
  const prevName = shortName(prevLabelFull.title, kind, todayISO);
  const prevCoverage = !dataStartISO || dataStartISO > previous.end ? 'none' : dataStartISO > previous.start ? 'partial' : 'full';
  // Resumo completo do anterior (para "setembro: 9 corridas · 62 km · Ver setembro").
  const prevFull = prevCoverage === 'none' ? null : windowStats(runs, maxISO(previous.start, dataStartISO), previous.end);
  /* A janela da comparação, UMA para o ▲/▼ e para o VDOT (R5, 2026-10-05): o período
     em análise é sempre a dos KPIs (do 1.º ao último dia fechado) e só o anterior
     se corta ao mesmo número de dias. Antes o VDOT comparava o atual até hoje com o
     anterior inteiro. */
  const cmp = prevCoverage === 'full' && closedDays.length > 0
    ? (() => {
      const nPrev = Math.min(closedDays.length, previous.totalDays);
      return {
        days: nPrev,
        prevFrom: previous.start,
        prevTo: addDaysISO(previous.start, nPrev - 1),
        full: nPrev === previous.totalDays,
      };
    })()
    : null;
  let delta = null;
  if (prevCoverage === 'full' && earlyState === 'ok' && cur.count + (prevFull?.count || 0) > 0) {
    // A janela do período em análise é SEMPRE a dos KPIs (do 1.º ao último dia
    // fechado): só o anterior se corta (2026-10-04, revisão da Corrida). Antes
    // cortava-se o atual a `previous.totalDays` e outubro fechado a 31 contra
    // setembro dava "= igual a setembro" com o KPI a dizer 2 corridas. Se o
    // atual tem mais dias do que o anterior, compara-se inteiro com inteiro
    // (como o mock-up: "▲ agosto: 11 de 29") e o rótulo é o nome do período.
    const nPrev = cmp.days;
    const prevEnd = cmp.prevTo;
    const c = windowStats(runs, from, to);
    const p = windowStats(runs, previous.start, prevEnd);
    const full = cmp.full;
    // Média semanal do anterior sobre a MESMA janela do rótulo (semanas que a tocam).
    const pw = kind === 'semana' ? { weeks: 0, avgKm: null } : weeklyAverage(runs, previous.start, prevEnd, todayISO, dataStartISO);
    delta = {
      label: full ? prevName : fmtRange(previous.start, prevEnd, todayISO),
      windowDays: nPrev,
      count: { cur: c.count, prev: p.count },
      km: { cur: c.km, prev: p.km },
      pace: c.withTime >= MIN_PACE_RUNS_FOR_DELTA && p.withTime >= MIN_PACE_RUNS_FOR_DELTA && c.paceSec && p.paceSec
        ? { cur: c.paceSec, prev: p.paceSec } : null,
      weekly: weekly.weeks >= MIN_WEEKS_FOR_AVG && pw.weeks >= MIN_WEEKS_FOR_AVG
        ? { cur: weekly.avgKm, prev: pw.avgKm } : null,
    };
  }

  // ── Fora do período: ACWR (hoje), VDOT, recordes (de sempre) ──
  const acwr = runAcwrCore(runs, todayISO);
  const acwrStatus = (() => {
    const st = acwrStatusLabel(acwr?.status, acwr?.hasEnoughData);
    const missing = acwrMissingWeeks(acwr);
    return { ...st, label: missing ? `Faltam ${missing} sem.` : st.label, missing };
  })();
  const weeklyData = weeklyAcwr(runs, todayISO, dataStartISO);

  const vdotAll = vdotTrendCore(runs);
  const avgVdot = (a, b) => {
    const pts = vdotAll.filter((p) => p.date >= a && p.date <= b).map((p) => Number(p.vdot)).filter((v) => v > 0);
    return { n: pts.length, avg: pts.length ? pts.reduce((s, v) => s + v, 0) / pts.length : null };
  };
  /* R5 (2026-10-05): o VDOT compara-se na MESMA base de dias dos dois lados (a
     janela do ▲/▼) e só de um mês para cima: numa semana 3 treinos de qualidade
     quase nunca acontecem, a tendência é "de sempre" e diz-se uma vez. Quando não
     compara, diz porquê (vdotNote) em vez de a linha desaparecer sem explicação. */
  const vdotCur = from && kind !== 'semana' ? avgVdot(from, to) : { n: 0, avg: null };
  const vdotPrev = cmp && kind !== 'semana' ? avgVdot(cmp.prevFrom, cmp.prevTo) : { n: 0, avg: null };
  const vdotCompare = vdotCur.n >= MIN_VDOT_POINTS && vdotPrev.n >= MIN_VDOT_POINTS && cmp
    ? {
        current: vdotCur.avg, previous: vdotPrev.avg, nCurrent: vdotCur.n, nPrevious: vdotPrev.n,
        previousLabel: prevName,
        previousWhere: whereOf(kind, prevLabelFull.title, false),
        // De que período é o número atual ("nesta semana", "em setembro").
        currentWhere: whereOf(kind, periodLabel(period, todayISO).title, period.isCurrent),
      }
    : null;

  const vdotNote = (() => {
    if (vdotCompare || vdotAll.length === 0 || beforeData) return null;
    if (kind === 'semana') return 'A comparação do VDOT é por mês ou mais.';
    if (closedDays.length === 0) return null;
    if (prevCoverage === 'none') return 'Ainda não há período anterior para comparar o VDOT.';
    if (prevCoverage === 'partial') return `${prevName.charAt(0).toUpperCase()}${prevName.slice(1)} começou antes do teu primeiro registo — o VDOT só se compara com o período anterior inteiro.`;
    const unit = { mes: 'mês', trimestre: 'trimestre', ano: 'ano' }[kind] || 'período';
    const curName = shortName(periodLabel(period, todayISO).title, kind, todayISO);
    const prevTxt = cmp.full ? prevName : `${prevName} (${fmtRange(cmp.prevFrom, cmp.prevTo, todayISO)})`;
    return `Para comparar o VDOT preciso de ${MIN_VDOT_POINTS} treinos de qualidade em cada ${unit} — ${curName} vai em ${vdotCur.n}, ${prevTxt} teve ${vdotPrev.n}.`;
  })();

  const runsComTempo = runs.filter((r) => Number(r?.distance_km) > 0 && Number(r?.duration_seconds) > 0);
  const focus = focusRace(raceEvents || [], todayISO);
  let racePrediction = null;
  if (focus) {
    const p = getRacePrediction(focus, profile, runsComTempo);
    if (p && p.predictedSeconds > 0) racePrediction = { ...p, raceName: focus.name || `${focus.distance_km}km` };
  }

  const records = ['5', '10', '21'].map((k) => {
    const b = computeBestPace(runs, Number(k));
    return { km: Number(k), best: b, inPeriod: !!(b && from && b.date >= from && b.date <= to) };
  });

  // ── Dentro do período ──
  const level = profile?.experience_level || 'medio';
  const distribution = calculateTrainingDistribution(closedRuns, level);
  const hasZones = (r) => (r?.details?.hr_zones || []).some((z) => Number(z?.minutes) > 0);
  const zoneRuns = closedRuns.filter(hasZones).length;
  const scatter = calculatePaceVsHR(closedRuns);

  /* ── R2/R3 (2026-10-05): "0 neste período" não é "0 de sempre". Com corridas com
     zonas/FC noutro período a vista diz a última e onde há as 3 que chegam. ── */
  const hrOf = (r) => calculatePaceVsHR([r]).length > 0;
  /* Só contam corridas até ONTEM (a mesma régua dos dias fechados de zoneRuns e
     scatter): uma corrida com relógio feita HOJE ainda não entra na distribuição,
     e dizer "a última foi a 5 out" num período que acaba de dizer que não tem
     zonas seria falso (revisão 2026-10-05). */
  const yesterdayISO = addDaysISO(todayISO, -1);
  const pastRuns = runs.filter((r) => { const d = dayOf(r); return d && d <= yesterdayISO; });
  const lastWith = (pred) => {
    let best = null;
    for (const r of pastRuns) { const d = dayOf(r); if (pred(r) && (!best || d > best)) best = d; }
    return best;
  };
  const zonesEver = { count: pastRuns.filter(hasZones).length, lastDate: lastWith(hasZones) };
  const hrEver = { count: pastRuns.filter(hrOf).length, lastDate: lastWith(hrOf) };
  const countRunsIn = (pred) => (f, t) => {
    let n = 0;
    const end = t < yesterdayISO ? t : yesterdayISO;
    for (const r of pastRuns) { const d = dayOf(r); if (d >= f && d <= end && pred(r)) n++; }
    return n;
  };
  const pickFb = (min, countIn) => pickFallbackPeriod({ kind, offset, todayISO, dataStartISO, min, countIn });
  const periodOfFb = (fb) => (fb.type === 'prev' ? previous : calendarPeriod(fb.kind, todayISO, fb.offset || 0));
  const fallbacks = {
    zones: zoneRuns < MIN_RUNS_FOR_ZONES && zonesEver.count >= MIN_RUNS_FOR_ZONES ? pickFb(MIN_RUNS_FOR_ZONES, countRunsIn(hasZones)) : null,
    efficiency: scatter.length < MIN_RUNS_FOR_EFFICIENCY && hrEver.count >= MIN_RUNS_FOR_EFFICIENCY ? pickFb(MIN_RUNS_FOR_EFFICIENCY, countRunsIn(hrOf)) : null,
    // Qualquer corrida: o período vazio / "cedo" dizem onde há (R10) e levam lá.
    data: cur.count === 0 || earlyState === 'cedo'
      ? (() => {
        const fb = pickFb(1, countRunsIn(() => true));
        if (!fb) return null;
        const p = periodOfFb(fb);
        const st = windowStats(runs, dataStartISO && dataStartISO > p.start ? dataStartISO : p.start, p.lastClosed);
        return { ...fb, count: st.count, km: st.km };
      })()
      : null,
  };
  const bars = distanceBars(runs, closedDays, kind);
  const watch = watchMetricsOf(closedRuns);

  const lastBefore = (() => {
    const limit = to || addDaysISO(period.start, -1);
    let best = null;
    for (const d of dates) if (d <= limit && (!best || d > best)) best = d;
    return best;
  })();

  const taper = (() => {
    const next = [...(raceEvents || [])]
      .filter((r) => typeof r?.date === 'string' && r.date.slice(0, 10) >= todayISO)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!next) return false;
    try {
      return calculateRaceTrainingPlan({ race: next, profile: profile || {}, runs, todayISO })?.currentPhase?.id === 'taper';
    } catch {
      return false;
    }
  })();
  const aceites = new Set((coachPlans || []).filter((p) => p?.status === 'aceite').map((p) => p.id));
  const planItems = (coachPlanItems || []).filter((i) => i && aceites.has(i.plan_id));

  const curLabel = periodLabel(period, todayISO, { dataStartISO });
  const scope = whereOf(kind, curLabel.title, period.isCurrent);

  const verdictRun = runVerdict({
    acwr,
    weeklyVolume: weeklyData,
    vdotCompare,
    distribution: zoneRuns >= MIN_RUNS_FOR_ZONES ? distribution : undefined,
    runCount: cur.count,
    km: cur.km,
    today: todayISO,
    taper,
    planItems,
    lastRunDate: lastBefore,
    scope,
    isCurrent: period.isCurrent,
  });
  // Período anterior ao 1.º registo: "Sem corridas em agosto" contradizia o cartão
  // ("Antes do teu primeiro registo"). Diz-se o facto, igual nos dois sítios.
  const verdict = beforeData
    ? { text: `Este período é anterior ao teu primeiro registo (${fmtDatePt(dataStartISO)}).`, tone: 'neutral' }
    : verdictRun;

  return {
    today: todayISO,
    kind,
    offset,
    period,
    previous,
    dataStartISO,
    hasRuns: runs.length > 0,
    beforeData,
    earlyState,
    firstDay,
    scope,
    closedDays: closedDays.length,
    cur,
    weekly,
    prevName,
    prevLabel: { title: prevLabelFull.title, range: prevLabelFull.range },
    prevCoverage,
    prevFull,
    delta,
    acwr,
    acwrStatus,
    weeklyAcwr: weeklyData,
    distribution,
    zoneRuns,
    zonesEver,
    hrEver,
    fallbacks,
    scatter,
    vdotTrend: vdotAll,
    vdotCompare,
    vdotNote,
    racePrediction,
    records,
    bars,
    watch,
    lastRunDate: lastBefore,
    todayRuns: windowStats(runs, todayISO, todayISO),
    walks: walksOfPeriod(split.walks, period, todayISO),
    verdict,
  };
}

registerEvolutionView('corrida', {
  deps: (s) => [s.runs, s.profile, s.raceEvents, s.coachPlans, s.coachPlanItems],
  build: buildRunView,
});

export default buildRunView;
