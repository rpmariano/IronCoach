import React from 'react';
import { Scatter } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import { formatPace } from '../../utils/run';

export default function ScatterTrendChart({ data = [], className = '' }) {
  // data: array of {date, paceSecondsPerKm, avgHR, label}
  // Antes tinha o seu próprio formatPace ("5:20", arredondamento diferente
  // do canónico) — unificado por pedido explícito
  // (specs/formulas-checklist.md Fase D).

  // Sort by date to calculate recency color fading if needed, or simply assign shades
  // We'll use alpha channel based on index
  const chartData = {
    datasets: [
      {
        label: 'Sessões',
        data: data.map(d => ({
          x: d.paceSecondsPerKm,
          y: d.avgHR,
          rawDate: d.date,
          rawLabel: d.label
        })),
        backgroundColor: data.map((d, i) => {
          const alpha = 0.3 + (0.7 * (i / Math.max(data.length - 1, 1)));
          return `rgba(59, 130, 246, ${alpha})`; // var(--mod-corrida)
        }),
        borderColor: data.map((d, i) => {
          const alpha = 0.5 + (0.5 * (i / Math.max(data.length - 1, 1)));
          return `rgba(59, 130, 246, ${alpha})`;
        }),
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
            const pt = context.raw;
            return `${pt.rawLabel || 'Sessão'}: ${formatPace(pt.x)}/km @ ${pt.y} bpm`;
          }
        }
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'Ritmo (min/km)', color: 'rgba(255, 255, 255, 0.5)' },
        reverse: true, // faster pace on the right (lower seconds)
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          callback: function(value) {
            return formatPace(value);
          }
        },
        grid: { display: false }
      },
      y: {
        title: { display: true, text: 'FC Média (bpm)', color: 'rgba(255, 255, 255, 0.5)' },
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.5)' }
      }
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] ${className}`}>
      <div className="flex flex-wrap items-start mb-3">
        <h3 className="text-[12px] font-bold text-slate-200">Eficiência Aeróbica</h3>
        <MetricInfo text="Cruza o teu Pace (Ritmo) com a Frequência Cardíaca Média. O objetivo é ver a nuvem de pontos descer e ir para a direita (correr mais rápido para o mesmo esforço cardíaco)." />
      </div>
      <div className="h-64 relative">
        <Scatter data={chartData} options={options} />
      </div>
    </div>
  );
}
