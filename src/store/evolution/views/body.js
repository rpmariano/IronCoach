import { registerEvolutionView } from '../registry';
import { calendarPeriod, previousPeriod, periodLabel } from '@formulas/calendarPeriod.ts';
import { computeWeightTrend } from '@formulas/weightTrend.ts';
import { computeCompositionTrend } from '@formulas/compositionTrend.ts';
import { assessWeightLossRate } from '@formulas/weightLossRate.ts';
import {
  sortAssessments,
  metricsRegistered,
  readingOf,
  goalOf,
  compareValues,
  daysBetweenISO,
  fmtDayShort,
  isoDay,
} from '../../../utils/body';
import { bodyVerdict, BODY_VERDICT_RECENT_DAYS } from '../../../utils/verdicts/body';
import { whereOf } from '../../../components/BI/period/periodText';

/**
 * Vista do Corpo por período de calendário (2026-10-04, fase 5 do plano da
 * Evolução — plano §3 "Corpo", D1; erros C1, C2, C3, C4, C5).
 *
 * Tudo o que o separador mostra num período, calculado UMA vez (cache F6) e
 * puro: só depende de (deps, período, hoje). Regras:
 * - Para o Corpo, R2 aplica-se a MÉDIAS, e aqui não há médias: uma avaliação
 *   é um facto fechado no dia em que se faz. Por isso o período vai do 1.º
 *   dia até HOJE inclusive (uma pesagem de hoje pode ser a "última").
 * - Cada métrica mostra a ÚLTIMA leitura do período, com data (C5: nunca um
 *   valor de fora do período sem dizer de quando é).
 * - Diferença face ao período ANTERIOR (R5): última leitura de cada um, e só
 *   (a) acima do limiar de ruído da métrica (BODY_METRICS[].noise) — abaixo
 *   é "igual" — e (b) com histórico maduro da métrica: leituras a cobrir
 *   ≥ 14 dias (plano §3: "≥2 leituras em ≥14 dias"). 2026-10-04, revisão
 *   (corpo-delta-ruido-14dias): antes exigia 14 dias ENTRE as duas leituras
 *   comparadas — numa semana o máximo é 13, por isso o ▲/▼ da semana era
 *   impossível e a nota prometia uma condição que nunca se cumpria.
 * - Ritmo do peso só com dados que cheguem (weightTrend.ts, `sufficient`,
 *   C1/C2). 2026-10-04, revisão (C1/C2): calculado com TODAS as pesagens até
 *   à última do período (janela de 14 dias ancorada nela) — o ritmo é "o
 *   ritmo no fim do período", não algo que nasce dentro dele. Só com as do
 *   período, uma semana nunca chegava aos 10 dias pedidos (é o que o Geral e
 *   a Carol já fazem). "estável" quando |ritmo| < 0,05 kg/semana; perigo só
 *   para PERDA rápida, em % do peso e por nível (assessWeightLossRate) —
 *   nunca para ganho — e só com a última pesagem a ≤ 14 dias de hoje
 *   (`weight.recent`): um ritmo de março não é um alarme de outubro.
 * - Composição só com avaliações com gordura medida (compositionTrend.ts, C3).
 * - Métricas nunca registadas não aparecem.
 *
 * `kind: 'dia'` (D1): o "Dia" do Corpo é uma AVALIAÇÃO, não um dia de
 * calendário — a vista devolve só a lista ordenada; a navegação entre
 * avaliações e o "Comparar com…" vivem no componente (BodyAssessmentDay).
 *
 * Nada é congelado: os arrays podem acabar em `data` do Chart.js.
 */

/** Dias que as leituras de uma métrica têm de cobrir (1.ª → última) para haver ▲/▼. */
export const BODY_DELTA_MIN_SPAN_DAYS = 14;
/** Uma pesagem com mais dias do que isto já não é "agora": sem presente nem perigo. */
export const BODY_RECENT_DAYS = BODY_VERDICT_RECENT_DAYS; // a mesma régua do veredicto
/** Abaixo disto (kg/semana, em valor absoluto) o ritmo escreve-se "estável". */
export const BODY_STABLE_RATE = 0.05;

// A lista ordenada é a mesma para todos os períodos: memorizada pela
// identidade da lista do store (não se reordena o histórico a cada seta).
let sortedMemo = new WeakMap();
function sortedOf(list) {
  if (!Array.isArray(list)) return [];
  let s = sortedMemo.get(list);
  if (!s) {
    s = sortAssessments(list);
    sortedMemo.set(list, s);
  }
  return s;
}

/** Só para testes. */
export function resetBodyViewMemo() {
  sortedMemo = new WeakMap();
}

const between = (list, from, to) => list.filter((a) => {
  const d = isoDay(a);
  return d && d >= from && d <= to;
});

function firstReading(list, key) {
  for (const a of list) {
    const v = readingOf(a, key);
    if (v !== null) return { value: v, date: isoDay(a) };
  }
  return null;
}

function lastReading(list, key) {
  for (let i = list.length - 1; i >= 0; i--) {
    const v = readingOf(list[i], key);
    if (v !== null) return { value: v, date: isoDay(list[i]) };
  }
  return null;
}

/** Nome do período anterior para "vs setembro" / "vs semana passada" / "vs jul – set". */
export function bodyPeriodName(p, todayISO) {
  const title = periodLabel(p, todayISO).title;
  const year = String(todayISO).slice(0, 4);
  if (p.kind === 'semana') return title.charAt(0).toLowerCase() + title.slice(1);
  if (p.kind === 'ano') return title;
  // "setembro 2026" → "setembro"; "jul – set 2026" → "jul – set" (só no ano corrente).
  return title.endsWith(` ${year}`) ? title.slice(0, -5) : title;
}

/** "em setembro", "nesta semana", "na semana passada", "no 3.º trimestre" — onde fica o período na frase. */
function whereText(p, label, todayISO) {
  if (p.kind === 'mes' && !p.isCurrent) return `em ${bodyPeriodName(p, todayISO)}`;
  /* 2026-10-04, revisão (corpo-veredicto-periodo): "Em jul – set 2026, …" lido
     em voz alta é opaco — o trimestre fechado diz-se pelo número. */
  if (p.kind === 'trimestre' && !p.isCurrent) {
    const q = Math.floor((Number(p.start.slice(5, 7)) - 1) / 3) + 1;
    const year = p.start.slice(0, 4);
    return `no ${q}.º trimestre${year === String(todayISO).slice(0, 4) ? '' : ` de ${year}`}`;
  }
  return whereOf(p.kind, label.title, p.isCurrent);
}

const THIS_PERIOD = { semana: 'Esta semana', mes: 'Este mês', trimestre: 'Este trimestre', ano: 'Este ano' };

function buildDay(all, base) {
  return { ...base, assessments: all };
}

export function buildBodyView([bodyAssessments, profile, gymSessions], { kind, offset = 0 }, todayISO) {
  const all = sortedOf(bodyAssessments);
  const metrics = metricsRegistered(all);
  const dataStartISO = all.length ? isoDay(all[0]) : null;
  const base = {
    kind,
    offset,
    hasAny: all.length > 0,
    dataStartISO,
    metricKeys: metrics.map((m) => m.key),
  };
  if (kind === 'dia') return buildDay(all, base);

  const period = calendarPeriod(kind, todayISO, offset);
  // Hoje conta (facto fechado); o futuro não existe.
  const upper = period.end < todayISO ? period.end : todayISO;
  const inP = period.start <= upper ? between(all, period.start, upper) : [];
  const prevP = previousPeriod(period, todayISO);
  const inPrev = between(all, prevP.start, prevP.end);
  const before = all.filter((a) => isoDay(a) < period.start);
  const upToEnd = all.filter((a) => isoDay(a) <= upper);
  const prevName = bodyPeriodName(prevP, todayISO);

  const rawLabel = periodLabel(period, todayISO, { dataStartISO });
  const n = inP.length;
  const count = `${n} ${n === 1 ? 'avaliação' : 'avaliações'}`;
  let coverage;
  if (dataStartISO && dataStartISO > period.end) coverage = 'antes da primeira avaliação';
  else {
    const desde = dataStartISO && dataStartISO > period.start && dataStartISO <= period.end
      ? `desde ${fmtDayShort(dataStartISO, todayISO)}` : null;
    coverage = [desde, period.isCurrent ? 'em curso' : null, n ? count : 'sem avaliações'].filter(Boolean).join(' · ');
  }
  // A cobertura do Corpo conta avaliações, não "dias fechados" (aqui hoje conta).
  const label = { ...rawLabel, coverage };
  const where = whereText(period, label, todayISO);

  // ── Linhas do resumo: última leitura do período e a diferença (R5) ──────
  let withheldSpan = false;
  let anyFlat = false;
  const rows = metrics.map((m) => {
    const series = [];
    for (const a of inP) {
      const v = readingOf(a, m.key);
      if (v !== null) series.push({ date: isoDay(a), value: v });
    }
    const last = series.length ? series[series.length - 1] : null;
    const prevLast = lastReading(inPrev, m.key);
    const first = firstReading(all, m.key);
    const lastBefore = last ? null : lastReading(upToEnd, m.key);
    const goal = goalOf(profile, m.key);
    let cmp = null;
    let withheld = null;
    if (last && prevLast) {
      // Maturidade do histórico: as leituras desta métrica cobrem ≥ 14 dias?
      if (!first || daysBetweenISO(first.date, last.date) < BODY_DELTA_MIN_SPAN_DAYS) {
        withheld = 'span';
        withheldSpan = true;
      } else {
        cmp = { ...compareValues(m, last.value, prevLast.value, { goal }), spanDays: daysBetweenISO(prevLast.date, last.date) };
        if (cmp.direction === 'flat') anyFlat = true;
      }
    }
    return { key: m.key, n: series.length, series, last, prevLast, lastBefore, goal, cmp, withheld };
  });

  // ── Peso: pesagens do período; ritmo com o histórico até à última (C1/C2) ──
  const weighIns = [];
  for (const a of inP) {
    const w = readingOf(a, 'weight_kg');
    if (w !== null) weighIns.push({ date: isoDay(a), weight: w });
  }
  let weight = null;
  if (weighIns.length) {
    const latest = weighIns[weighIns.length - 1];
    const history = [];
    for (const a of all) {
      const d = isoDay(a);
      if (d > latest.date) break; // `all` está por ordem cronológica
      const w = readingOf(a, 'weight_kg');
      if (w !== null) history.push({ date: d, weight: w });
    }
    const trend = computeWeightTrend(history);
    const sufficient = trend?.sufficient === true && trend.weeklyRate != null;
    const rate = sufficient ? Number(trend.weeklyRate) : null;
    // A linha (EWMA do histórico) só no período, mais o ponto de antes para
    // entrar pela esquerda (o eixo corta o que fica fora).
    const ma = trend?.movingAverage || [];
    let from = ma.findIndex((p) => p.date >= period.start);
    if (from < 0) from = ma.length;
    weight = {
      points: weighIns,
      trend,
      line: ma.slice(Math.max(0, from - 1)),
      latest,
      sufficient,
      rate,
      recent: daysBetweenISO(latest.date, todayISO) <= BODY_RECENT_DAYS,
      stable: rate !== null && Math.abs(rate) < BODY_STABLE_RATE,
      loss: rate !== null ? assessWeightLossRate(rate, latest.weight, profile?.experience_level) : null,
    };
  }

  const composition = computeCompositionTrend(inP);
  const hasWeighInsOutside = all.some((a) => readingOf(a, 'weight_kg') !== null && (isoDay(a) < period.start || isoDay(a) > upper));
  const lastOutsideW = n === 0 ? lastReading(upToEnd, 'weight_kg') : null;
  const gymSessionCount = between(Array.isArray(gymSessions) ? gymSessions : [], period.start, upper).length;

  const beforeFirst = !!dataStartISO && dataStartISO > period.end;
  const verdict = beforeFirst
    /* 2026-10-04, revisão (R7): antes do 1.º registo o NO_DATA genérico ("não
       tenho dados suficientes") contradizia as 10 avaliações que vêm depois. */
    ? { text: `${THIS_PERIOD[kind] || 'Este período'} é anterior à tua primeira avaliação (${fmtDayShort(dataStartISO, todayISO)}).`, tone: 'neutral' }
    : bodyVerdict({
    weightTrend: weight ? { rawPoints: weighIns, ...weight.trend } : null,
    composition,
    assessmentCount: n,
    gymSessionCount,
    experienceLevel: profile?.experience_level || null,
    hasWeighInsOutside,
    period: { where, isCurrent: period.isCurrent },
    goalWeight: goalOf(profile, 'weight_kg'),
    lastOutside: lastOutsideW ? { date: lastOutsideW.date, weight: lastOutsideW.value } : null,
    todayISO,
  });

  const prevWeight = lastReading(inPrev, 'weight_kg');
  const previousSummary = inPrev.length
    ? { name: prevName, range: periodLabel(prevP, todayISO).range, count: inPrev.length, lastWeight: prevWeight }
    : null;

  return {
    ...base,
    period,
    previous: prevP,
    prevName,
    label,
    where,
    count: n,
    rows,
    weight,
    composition,
    verdict,
    gymSessionCount,
    previousSummary,
    withheldSpan,
    anyFlat,
    firstPeriod: n > 0 && before.length === 0,
    beforeFirst,
    /* Fim do eixo dos gráficos (2026-10-04, revisão): no período em curso vai
       até HOJE — com o eixo até 31 dez, a 4 out os pontos ficavam nos
       primeiros 3% da largura. Num período que começa hoje fica o período
       inteiro (um eixo de um só dia não tem largura). */
    axisEnd: period.isCurrent && upper > period.start ? upper : period.end,
    axisToToday: period.isCurrent && upper > period.start && upper < period.end,
    emptyCurrent: period.isCurrent && n === 0,
    justStarted: period.isCurrent && period.closedDays === 0,
  };
}

registerEvolutionView('corpo', {
  deps: (s) => [s.bodyAssessments, s.profile, s.gymSessions],
  build: buildBodyView,
});

export default buildBodyView;
