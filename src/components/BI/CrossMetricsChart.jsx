import React from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { fmtNumber } from '../../utils/dashboardVerdicts';

/* Ponto 6 do redesenho: a legenda do Chart.js (desenhada na tela) e os
   `title` dos dois eixos y saem; passam a HTML no ChartFrame, com o valor
   atual das duas séries como número grande e como delta. As cores das
   séries continuam a vir de quem chama (CrossAnalysisSection), já nas
   cores dos módulos. */

export default function CrossMetricsChart({ title, helpText, leftData, rightData, className = '' }) {
  const leftPoints = leftData?.data || [];
  const rightPoints = rightData?.data || [];
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
  const labels = leftPoints.map(d => d.x);
  // Um ponto sem vizinhos (buracos dos dois lados) não desenha linha nenhuma:
  // mostra-se como ponto, senão o único RPE registado ficava invisível.
  const isolatedPointRadius = (points) => (ctx) => {
    const i = ctx.dataIndex;
    const has = (j) => points[j] != null && points[j].y != null;
    return has(i) && !has(i - 1) && !has(i + 1) ? 3 : 0;
  };

  const data = {
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
  };

  const options = {
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
        ticks: { display: false },
        border: { display: false },
      },
      yRight: {
        type: 'linear',
        position: 'right',
        grid: { display: false },
        ticks: { display: false },
        border: { display: false },
      }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  };

  return (
    <ChartFrame
      className={className}
      label={title}
      info={helpText ? <MetricInfo text={helpText} /> : undefined}
      value={lastLeft !== null ? fmtNumber(lastLeft, 1) : '—'}
      unit={leftData.unit || leftData.label}
      valueColor={leftData.color}
      delta={lastRight !== null
        ? { text: `${rightData.label} ${fmtNumber(lastRight, 1)}`, tone: 'neutral' }
        : undefined}
      legend={[
        { label: leftData.label, color: leftData.color, shape: 'line' },
        { label: rightData.label, color: rightData.color, shape: 'line' },
      ]}
      height={200}
    >
      <Line data={data} options={options} />
    </ChartFrame>
  );
}
