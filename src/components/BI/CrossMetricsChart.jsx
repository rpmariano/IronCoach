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
  const lastLeft = leftPoints.length ? Number(leftPoints[leftPoints.length - 1].y) : null;
  const lastRight = rightPoints.length ? Number(rightPoints[rightPoints.length - 1].y) : null;
  const labels = leftPoints.map(d => d.x);

  const data = {
    labels: leftPoints.map((_, i) => i),
    datasets: [
      {
        label: leftData.label,
        data: leftPoints.map(d => d.y),
        borderColor: leftData.color,
        backgroundColor: leftData.color,
        yAxisID: 'yLeft',
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
      {
        label: rightData.label,
        data: rightPoints.map(d => d.y),
        borderColor: rightData.color,
        backgroundColor: rightData.color,
        yAxisID: 'yRight',
        tension: 0.4,
        pointRadius: 0,
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
