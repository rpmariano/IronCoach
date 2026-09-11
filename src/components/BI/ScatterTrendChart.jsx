import React from 'react';
import { Scatter } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { formatPace } from '../../utils/run';

/* Ponto 6 do redesenho: os `title` dos dois eixos ("Ritmo (min/km)", "FC
   Média (bpm)") e os ticks eram texto desenhado na tela. Saem os três; os
   extremos do eixo ficam nos cantos em HTML e a sessão mais recente é o
   número grande. Paleta: a nuvem estava em rgba(59,130,246) — azul genérico,
   apesar do comentário dizer --mod-corrida. Passa ao ciano da corrida,
   mais opaco nas sessões recentes (tintas da cor do módulo). */

const RUN_RGB = '46, 224, 255';   // --run #2ee0ff

export default function ScatterTrendChart({ data = [], className = '' }) {
  const chartData = {
    datasets: [
      {
        label: 'Sessões',
        data: data.map(d => ({ x: d.paceSecondsPerKm, y: d.avgHR, rawDate: d.date, rawLabel: d.label })),
        backgroundColor: data.map((d, i) => `rgba(${RUN_RGB}, ${(0.3 + 0.7 * (i / Math.max(data.length - 1, 1))).toFixed(2)})`),
        borderColor: data.map((d, i) => `rgba(${RUN_RGB}, ${(0.5 + 0.5 * (i / Math.max(data.length - 1, 1))).toFixed(2)})`),
        pointRadius: 5,
        pointHoverRadius: 7,
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
        callbacks: {
          label: (context) => {
            const p = context.raw;
            return `${p.rawLabel || 'Sessão'}: ${formatPace(p.x)}/km @ ${p.y} bpm`;
          }
        }
      }
    },
    scales: {
      x: {
        reverse: true, // ritmo mais rápido à direita
        ticks: { display: false },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { display: false },
        border: { display: false },
      }
    }
  };

  const latest = data.length ? data[data.length - 1] : null;
  const paces = data.map(d => Number(d.paceSecondsPerKm)).filter(v => isFinite(v) && v > 0);
  const hrs = data.map(d => Number(d.avgHR)).filter(v => isFinite(v) && v > 0);

  return (
    <ChartFrame
      className={className}
      label="Eficiência aeróbica"
      info={<MetricInfo text="Cruza o teu Pace (Ritmo) com a Frequência Cardíaca Média. O objetivo é ver a nuvem de pontos descer e ir para a direita (correr mais rápido para o mesmo esforço cardíaco)." />}
      hint={data.length > 0 ? `${data.length} sessões` : undefined}
      value={latest ? formatPace(latest.paceSecondsPerKm) : '—'}
      unit={latest ? `/km a ${latest.avgHR} bpm na última` : undefined}
      valueColor="var(--run)"
      axis={paces.length > 0
        ? { min: `${formatPace(Math.max(...paces))}/km`, max: `${formatPace(Math.min(...paces))}/km` }
        : undefined}
      legend={hrs.length > 0
        ? [{ label: `FC de ${Math.min(...hrs)} a ${Math.max(...hrs)} bpm`, color: 'var(--run)' }]
        : []}
      height={200}
      footer="Ritmo no eixo horizontal, mais rápido à direita. Frequência cardíaca na vertical."
    >
      <Scatter data={chartData} options={options} />
    </ChartFrame>
  );
}
