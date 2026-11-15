import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { axisDate } from './crossPeriod';

/* 2026-10-04 (F5, animação ao ficar visível): a revelação é do ChartFrame.
   `data` e `options` passam a useMemo — quem chama (CrossAnalysisSection) já
   entrega leftData/rightData memoizados; sem isto cada render fazia
   chart.update(). A linha não tem `animation` própria: vale o default global
   (700 ms; `false` com reduced-motion). `ready` (prop) segura a entrada
   até a Análise Cruzada acabar de abrir (transitionend) e as fatias chegarem.

   Ponto 6 do redesenho: a legenda do Chart.js (desenhada na tela) e os
   `title` dos dois eixos y saem; passam a HTML no ChartFrame, com o valor
   atual das duas séries como número grande e como delta. As cores das
   séries continuam a vir de quem chama (CrossAnalysisSection), já nas
   cores dos módulos. */

// Um ponto sem vizinhos (buracos dos dois lados) não desenha linha nenhuma:
// mostra-se como ponto, senão o único RPE registado ficava invisível.
const isolatedPointRadius = (points) => (ctx) => {
  const i = ctx.dataIndex;
  const has = (j) => points[j] != null && points[j].y != null;
  return has(i) && !has(i - 1) && !has(i + 1) ? 3 : 0;
};

/* Pedido do Rui (2026-11-01): «devia ficar visível que período afeta estas análises», e o gráfico
   não tinha datas nem escala. As datas do primeiro e do último ponto vão nos cantos por baixo
   (`axis` do ChartFrame), cada eixo y mostra a sua escala na cor da série, e `period` diz por
   baixo que janela de tempo a análise usa — a Análise Cruzada não segue a semana escolhida. */
const yTicks = (color) => ({
  display: true,
  color,
  maxTicksLimit: 4,
  font: { size: 10 },
  padding: 4,
  callback: (v) => fmtNumber(v, Number.isInteger(v) ? 0 : 1),
});

export default function CrossMetricsChart({ title, helpText, leftData, rightData, ready = true, className = '', period = null }) {
  const leftPoints = useMemo(() => leftData?.data || [], [leftData]);
  const rightPoints = useMemo(() => rightData?.data || [], [rightData]);
  // O6 (2026-10-04): uma série pode ter buracos (y = null, p. ex. semanas sem
  // RPE registado). Number(null) dava 0 — o número grande mostrava "RPE 0" —,
  // por isso o "valor atual" é o último ponto que existe de facto.
  const lastValue = (points) => {
    for (let i = points.length - 1; i >= 0; i--) {
      const y = points[i].y;
      if (y != null && Number.isFinite(Number(y))) return Number(y);
    }
    return null;
  };
  const lastLeft = lastValue(leftPoints);
  const lastRight = lastValue(rightPoints);
  const labels = useMemo(() => leftPoints.map(d => d.x), [leftPoints]);
  const axis = useMemo(() => {
    if (!labels.length) return null;
    const first = labels[0];
    const last = labels[labels.length - 1];
    const withYear = String(first).slice(0, 4) !== String(last).slice(0, 4);
    return { min: axisDate(first, withYear), max: axisDate(last, withYear) };
  }, [labels]);
  const data = useMemo(() => ({
    labels: leftPoints.map((_, i) => i),
    datasets: [
      {
        label: leftData.label,
        data: leftPoints.map(d => d.y),
        borderColor: leftData.color,
        backgroundColor: leftData.color,
        yAxisID: 'yLeft',
        spanGaps: false,
        tension: 0.4,
        pointRadius: isolatedPointRadius(leftPoints),
        pointHoverRadius: 4,
      },
      {
        label: rightData.label,
        data: rightPoints.map(d => d.y),
        borderColor: rightData.color,
        backgroundColor: rightData.color,
        yAxisID: 'yRight',
        spanGaps: false, // sem RPE numa semana: buraco, não uma linha a atravessá-lo
        tension: 0.4,
        pointRadius: isolatedPointRadius(rightPoints),
        pointHoverRadius: 4,
      }
    ]
  }), [leftPoints, rightPoints, leftData, rightData]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: 10,
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (items) => labels[items?.[0]?.dataIndex] || '',
          label: (context) => {
            const isLeft = context.datasetIndex === 0;
            const unit = isLeft ? leftData.unit : rightData.unit;
            return ` ${context.dataset.label}: ${context.raw} ${unit || ''}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      yLeft: {
        type: 'linear',
        position: 'left',
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: yTicks(leftData.color),
        border: { display: false },
      },
      yRight: {
        type: 'linear',
        position: 'right',
        grid: { display: false },
        ticks: yTicks(rightData.color),
        border: { display: false },
      }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  }), [labels, leftData, rightData]);
  // As duas séries têm escalas próprias: dizê-lo, para as curvas não se lerem como a mesma régua.
  const scalesNote = `Escalas independentes: ${leftData.label} à esquerda, ${rightData.label} à direita.`;

  return (
    <ChartFrame
      ready={ready}
      className={className}
      label={title}
      info={helpText ? <MetricInfo text={helpText} /> : undefined}
      value={lastLeft !== null ? fmtNumber(lastLeft, leftData.decimals ?? 1) : '—'}
      unit={leftData.unit || leftData.label}
      valueColor={leftData.color}
      delta={lastRight !== null
        ? { text: `${rightData.label} ${fmtNumber(lastRight, rightData.decimals ?? 1)}`, tone: 'neutral' }
        : undefined}
      legend={[
        { label: leftData.label, color: leftData.color, shape: 'line' },
        { label: rightData.label, color: rightData.color, shape: 'line' },
      ]}
      height={200}
      axis={axis}
      explain={{
        title,
        period: period || (axis ? `${axis.min} – ${axis.max}` : null),
        series: [
          { label: leftData.label, values: leftPoints.map((p) => p.y), decimals: leftData.decimals },
          { label: rightData.label, values: rightPoints.map((p) => p.y), decimals: rightData.decimals },
        ],
        note: 'As duas curvas têm escalas independentes.',
      }}
      footer={(
        <>
          {period && <span className="block" data-testid="cross-chart-period" style={{ color: 'var(--text-3)' }}>{period}</span>}
          <span className="block">{scalesNote}</span>
        </>
      )}
    >
      <Line data={data} options={options} updateMode="period" />
    </ChartFrame>
  );
}
