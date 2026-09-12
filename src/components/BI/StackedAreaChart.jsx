import React from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { fmtNumber } from '../../utils/dashboardVerdicts';

/* Ponto 6 do redesenho:
   - A legenda do Chart.js (desenhada na tela) e os ticks com callback
     `${v} kg` saem; passam a HTML no ChartFrame.
   - Paleta: era verde esmeralda (#10b981) e rosa-vermelho (#f43f5e) — o
     verde é "dentro do alvo" e não uma série. Passa às cores do mock
     "Dashboard · Corpo": massa gorda no rosa do corpo (--body), massa magra
     no violeta (--nutrition), exatamente como a barra de composição do mock
     ("Gordura 11,5%" rosa, "Músculo 54,8%" violeta). */

const MAGRA = '#c77dff';  // --nutrition
const GORDA = '#ff5fa8';  // --body

export default function StackedAreaChart({ data = { dates: [], fatMassKg: [], leanMassKg: [] }, className = '' }) {
  const dates = data.dates || [];
  const lean = data.leanMassKg || [];
  const fat = data.fatMassKg || [];

  const lastLean = lean.length ? Number(lean[lean.length - 1]) : 0;
  const lastFat = fat.length ? Number(fat[fat.length - 1]) : 0;
  const total = lastLean + lastFat;

  const firstLean = lean.length ? Number(lean[0]) : 0;
  const leanDelta = lean.length >= 2 ? lastLean - firstLean : null;

  const chartData = {
    // Sem labels de texto: o eixo x não escreve nada. Os índices bastam.
    labels: dates.map((_, i) => i),
    datasets: [
      {
        label: 'Massa magra',
        data: lean,
        borderColor: MAGRA,
        backgroundColor: 'rgba(199, 125, 255, 0.18)',
        pointBackgroundColor: MAGRA,
        pointBorderColor: 'rgba(11,17,32,1)',
        pointRadius: 3,
        pointHoverRadius: 6,
        fill: 'origin',
        tension: 0.2,
      },
      {
        label: 'Massa gorda',
        data: fat,
        borderColor: GORDA,
        backgroundColor: 'rgba(255, 95, 168, 0.18)',
        pointBackgroundColor: GORDA,
        pointBorderColor: 'rgba(11,17,32,1)',
        pointRadius: 3,
        pointHoverRadius: 6,
        fill: '-1',
        tension: 0.2,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: 12,
        mode: 'index',
        intersect: false,
        callbacks: {
          title: (items) => dates[items?.[0]?.dataIndex] || '',
          label: (context) => ` ${context.dataset.label}: ${fmtNumber(context.raw, 1)} kg`,
          footer: (items) => `Total: ${fmtNumber(items.reduce((s, i) => s + Number(i.raw || 0), 0), 1)} kg`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { display: false },
        border: { display: false },
      }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  };

  return (
    <ChartFrame
      className={className}
      label="Composição corporal"
      info={<MetricInfo text="O peso na balança engana. Este gráfico permite-te ver de que é realmente feito o teu corpo. Se a linha global descer mas a área violeta se mantiver igual, excelente: perdeste peso queimando apenas massa gorda enquanto seguraste a massa magra!" />}
      hint={dates.length > 0 ? `${dates.length} avaliações` : undefined}
      value={total > 0 ? fmtNumber(total, 1) : '—'}
      unit="kg"
      delta={leanDelta !== null && Math.abs(leanDelta) >= 0.1
        ? { text: `${leanDelta > 0 ? '+' : '−'}${fmtNumber(Math.abs(leanDelta), 1)} kg de massa magra`, tone: leanDelta >= 0 ? 'ok' : 'warn' }
        : undefined}
      legend={[
        { label: `Massa magra ${fmtNumber(lastLean, 1)} kg`, color: MAGRA },
        { label: `Massa gorda ${fmtNumber(lastFat, 1)} kg`, color: GORDA },
      ]}
      height={200}
    >
      <Line data={chartData} options={options} />
    </ChartFrame>
  );
}
