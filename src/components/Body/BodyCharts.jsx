import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import '../../lib/chartSetup';
import ChartFrame from '../BI/ChartFrame';
import MetricInfo from '../BI/MetricInfo';
import { fmtNumber } from '../../utils/verdicts/shared';
import { fmtMetric, fmtMetricValue, fmtSigned, fmtDayShort } from '../../utils/body';
import { plural } from '../BI/period';
import { WEIGHT_TREND_MIN_POINTS, WEIGHT_TREND_MIN_SPAN_DAYS } from '@formulas/weightTrend.ts';

/**
 * Gráficos do Corpo por período (2026-10-04, fase 5 — plano §3 Corpo, D5).
 *
 * - EIXO TEMPORAL REAL: o x é o dia (número de dias desde 1970, eixo linear),
 *   não o índice da leitura. Antes, duas pesagens a 3 dias e duas a 3 meses
 *   ficavam à mesma distância e a linha parecia um ritmo que não existia. O
 *   eixo vai do 1.º ao último dia do período: vê-se onde caem as leituras.
 * - O gráfico "Peso" duplicado sai (D5): com a métrica Peso escolhida mostra-
 *   se só a tendência (pesagens + linha). As outras métricas têm o seu.
 * - Um só "peso atual": o número grande é a última PESAGEM do período, com
 *   data — nunca o último ponto da EWMA (que é outro número).
 * - Ritmo semanal só com dados que cheguem (weightTrend.ts, C1/C2);
 *   "estável" em texto quando |ritmo| < 0,05 kg/semana; perigo só para PERDA
 *   rápida (assessWeightLossRate, % do peso por nível), nunca para ganho.
 *
 * 2026-10-04, revisão do Corpo:
 * - O ritmo e a linha vêm do histórico até à última pesagem do período (a
 *   vista corta a linha ao período); o rodapé do "falta" usa esses números
 *   e diz até que dia (antes contava só o período e dizia "nas duas semanas
 *   até à última pesagem" — facto errado no ecrã).
 * - Perigo só com a última pesagem recente (`weight.recent`), como o veredicto.
 * - No período em curso o eixo vai até hoje (`end` = vista.axisEnd).
 *
 * `data`/`options` estáveis (F5): as opções saem de um cache por intervalo e
 * os dados de useMemo — cada referência nova faz chart.update().
 */

const DAY_MS = 86400000;
export const dayNumber = (iso) => Math.round(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / DAY_MS);

const OPTIONS_CACHE = new Map();
/** Opções de linha com eixo x temporal de `start` a `end` (ISO), estáveis por intervalo. */
export function timeAxisOptions(start, end) {
  const key = `${start}|${end}`;
  let o = OPTIONS_CACHE.get(key);
  if (o) return o;
  o = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      y: { beginAtZero: false, grace: '5%', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false }, border: { display: false } },
      x: {
        type: 'linear',
        min: start ? dayNumber(start) : undefined,
        max: end ? dayNumber(end) : undefined,
        grid: { display: false },
        ticks: { display: false },
        border: { display: false },
      },
    },
  };
  if (OPTIONS_CACHE.size > 40) OPTIONS_CACHE.clear();
  OPTIONS_CACHE.set(key, o);
  return o;
}

const TONE = { good: 'ok', bad: 'warn', neutral: 'neutral' };

/** Gráfico de uma métrica (não o peso) no período. `row` é a linha da vista. */
export function BodyMetricChart({ metric, row, period, prevName, todayISO, end, toToday = false }) {
  const series = row?.series || [];
  const n = series.length;
  const last = n ? series[n - 1] : null;

  const data = useMemo(() => ({
    datasets: [{
      label: `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}`,
      data: series.map((p) => ({ x: dayNumber(p.date), y: p.value })),
      borderColor: metric.color,
      backgroundColor: `${metric.color}25`,
      pointBackgroundColor: metric.color,
      pointRadius: n > 20 ? 2 : 5,
      pointHoverRadius: 7,
      borderWidth: 2.5,
      tension: 0.25,
      fill: true,
    }],
  }), [series, metric, n]);

  const vals = series.map((p) => p.value);
  const cmp = row?.cmp;
  let delta;
  if (cmp && cmp.direction !== 'flat') delta = { text: `${fmtSigned(metric, cmp.diff)} vs ${prevName}`, tone: TONE[cmp.tone] || 'neutral' };
  else if (cmp) delta = { text: `= igual a ${prevName}`, tone: 'neutral' };

  const hintParts = [`${n} ${plural(n, 'leitura', 'leituras')}`];
  if (row?.goal != null) hintParts.push(`objetivo ${fmtMetric(metric, row.goal)}`);
  if (toToday) hintParts.push('até hoje');

  let footer;
  if (!n) {
    footer = row?.lastBefore
      ? `Sem leituras desta métrica neste período. A última é de ${fmtDayShort(row.lastBefore.date, todayISO)} (${fmtMetric(metric, row.lastBefore.value)}).`
      : 'Sem leituras desta métrica neste período.';
  } else {
    footer = `Última leitura a ${fmtDayShort(last.date, todayISO)}.`;
  }

  return (
    <ChartFrame
      label={metric.label}
      hint={hintParts.join(' · ')}
      value={last ? fmtMetricValue(metric, last.value) : '—'}
      unit={metric.unit || undefined}
      valueColor={metric.color}
      delta={delta}
      axis={vals.length > 1 ? { min: fmtMetric(metric, Math.min(...vals)), max: fmtMetric(metric, Math.max(...vals)) } : undefined}
      legend={[{ label: metric.label, color: metric.color, shape: 'line' }]}
      height={n ? 192 : 0}
      footer={footer}
    >
      {n ? <Line data={data} options={timeAxisOptions(period.start, end || period.end)} updateMode="period" /> : null}
    </ChartFrame>
  );
}

/**
 * O que falta para o ritmo (C1/C2), com os números da janela do weightTrend:
 * as pesagens dos 14 dias até à última pesagem do período (`lastDate`),
 * contando as de antes do período.
 */
export function weightMissingText(trend, lastDate = null, todayISO = null) {
  const n = trend?.pointsInWindow ?? 0;
  const span = trend?.spanDays ?? 0;
  const ate = lastDate ? `nas duas semanas até ${fmtDayShort(lastDate, todayISO)}` : 'nas duas semanas até à última pesagem';
  if (n >= WEIGHT_TREND_MIN_POINTS) {
    // Pesagens chegam; falta espaço entre elas (7 pesagens numa semana).
    return `Para a tendência preciso de pesagens espalhadas por pelo menos ${WEIGHT_TREND_MIN_SPAN_DAYS} dias — ${ate} há ${n} pesagens, em ${span} ${plural(span, 'dia', 'dias')}.`;
  }
  return `Preciso de ${WEIGHT_TREND_MIN_POINTS} pesagens em ${WEIGHT_TREND_MIN_SPAN_DAYS} dias para a tendência — `
    + (n <= 1
      ? `${ate} só há essa.`
      : `${ate} há ${n} pesagens em ${span} ${plural(span, 'dia', 'dias')}.`);
}

/** O texto e o tom do ritmo semanal (null sem dados que cheguem). */
export function weightRateDelta(weight, { isCurrent = true } = {}) {
  if (!weight?.sufficient || weight.rate == null) return null;
  if (weight.stable) return { text: 'estável', tone: 'neutral' };
  const r = weight.rate;
  const tooFast = !!weight.loss?.isTooFast; // só existe para PERDA
  return {
    text: `${r > 0 ? '+' : '−'}${fmtNumber(Math.abs(r), 1)} kg/semana`,
    // Num período fechado, ou com a última pesagem velha, é história: aviso,
    // não perigo (o veredicto faz o mesmo).
    tone: tooFast ? (isCurrent && weight.recent !== false ? 'danger' : 'warn') : 'neutral',
  };
}

/** Tendência de peso do período: pesagens soltas + linha (EWMA com ≥5). */
export function WeightTrendChart({ weight, period, todayISO, end, toToday = false }) {
  const trend = weight?.trend;
  const points = weight?.points || [];
  const ewma = !!trend?.isEWMASmoothing;
  const line = weight?.line || trend?.movingAverage || [];

  const data = useMemo(() => ({
    datasets: [
      {
        label: ewma ? 'Tendência (EWMA)' : 'Evolução',
        data: line.map((p) => ({ x: dayNumber(p.date), y: p.weight })),
        borderColor: '#ff5fa8', // --body
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.4,
        fill: false,
      },
      {
        label: 'Pesagens',
        data: points.map((p) => ({ x: dayNumber(p.date), y: p.weight })),
        borderColor: 'transparent',
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        pointBackgroundColor: 'rgba(255, 255, 255, 0.4)',
        pointRadius: 4,
        borderWidth: 0,
        tension: 0,
        fill: false,
        showLine: false,
      },
    ],
  }), [line, points, ewma]);

  const raw = points.map((p) => p.weight);
  const latest = weight?.latest;
  const delta = weightRateDelta(weight, { isCurrent: period.isCurrent });

  return (
    <ChartFrame
      label={ewma ? 'Tendência de peso' : 'Evolução de peso'}
      info={<MetricInfo text={
        ewma
          ? 'O peso flutua todos os dias com a água, o sal e o glicogénio (vês isso nos pontos soltos). A linha é uma média móvel que ignora esse ruído e mostra a tendência. O número grande é a tua última pesagem.'
          : 'As tuas pesagens neste período, espaçadas pelas datas reais. A linha de tendência (média móvel) aparece a partir de 5 pesagens.'
      } />}
      hint={`${raw.length} ${plural(raw.length, 'pesagem', 'pesagens')}${latest ? ` · última a ${fmtDayShort(latest.date, todayISO)}` : ''}${toToday ? ' · até hoje' : ''}`}
      value={latest ? fmtNumber(latest.weight, 1) : '—'}
      unit="kg"
      valueColor="var(--body)"
      delta={delta || undefined}
      footer={weight?.sufficient ? undefined : weightMissingText(trend, latest?.date, todayISO)}
      axis={raw.length > 1
        ? { min: `${fmtNumber(Math.min(...raw), 1)} kg`, max: `${fmtNumber(Math.max(...raw), 1)} kg` }
        : undefined}
      legend={[
        { label: ewma ? 'Tendência' : 'Evolução', color: 'var(--body)', shape: 'line' },
        { label: 'Pesagens', color: 'rgba(248,250,252,.4)' },
      ]}
      height={192}
    >
      <Line data={data} options={timeAxisOptions(period.start, end || period.end)} updateMode="period" />
    </ChartFrame>
  );
}
