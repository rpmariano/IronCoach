import React from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import MetricInfo from './MetricInfo';

export default function RacePredictionChart({ vdotTrend = [], prediction, className = '' }) {
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}h${m}:${s} min` : `${m}:${s} min`;
  };

  // Deduplicate: keep only the best (highest) VDOT per unique date
  const deduped = Object.values(
    vdotTrend.reduce((acc, d) => {
      const key = d.date;
      if (!acc[key] || d.vdot > acc[key].vdot) acc[key] = d;
      return acc;
    }, {})
  ).sort((a, b) => a.date.localeCompare(b.date));

  const labels = deduped.map(d => {
    try { return format(parseISO(d.date), 'dd MMM', { locale: pt }); }
    catch { return d.date; }
  });

  const predictionPlugin = {
    id: 'predictionAnno',
    afterDraw: (chart) => {
      if (!prediction) return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;

      const boxW = 148;
      const boxH = 58;
      const boxX = chartArea.left + 8; // top-left, away from the data peak
      const boxY = chartArea.top + 8;

      ctx.save();

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;

      // Background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 10);
      ctx.fill();

      // Border
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label "Previsão →"
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px system-ui';
      ctx.fillText('PREVISÃO → ' + (prediction.raceName || 'Prova'), boxX + 10, boxY + 20);

      // Time value
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 18px system-ui';
      ctx.fillText(formatTime(prediction.predictedSeconds), boxX + 10, boxY + 44);

      ctx.restore();
    }
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'VDOT',
        data: deduped.map(d => d.vdot),
        borderColor: '#fbbf24',
        backgroundColor: 'rgba(251, 191, 36, 0.15)',
        fill: true,
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
        callbacks: {
          label: (ctx) => `VDOT: ${Number(ctx.raw).toFixed(1)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          maxTicksLimit: 6,
          maxRotation: 0,
        }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          callback: (v) => `${v}`
        },
        title: {
          display: true,
          text: 'VDOT',
          color: 'rgba(255, 255, 255, 0.35)',
          font: { size: 10 }
        }
      }
    }
  };

  const hasTrend = deduped.length >= 2;

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] ${className}`}>
      <div className="flex flex-wrap items-start mb-3">
        <h3 className="text-[12px] font-bold text-slate-200">Evolução VDOT & Previsão de Prova</h3>
        <MetricInfo text="O VDOT é uma aproximação do teu VO2max. Quanto mais alto o valor, maior a tua aptidão aeróbica e mais rápidos serão os teus tempos em provas." />
      </div>
      {hasTrend ? (
        <div className="h-64 relative">
          <Line data={data} options={options} plugins={[predictionPlugin]} />
        </div>
      ) : prediction ? (
        <div className="flex items-center justify-between gap-3 py-2">
          <p className="text-[11px] text-slate-500 leading-snug max-w-[65%]">
            Regista mais corridas para veres a evolução do VDOT ao longo do tempo.
          </p>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-slate-500">Previsão → {prediction.raceName || 'Prova'}</p>
            <p className="text-lg font-bold text-amber-400">{formatTime(prediction.predictedSeconds)}</p>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500 py-2">Regista corridas para veres a previsão desta prova.</p>
      )}
    </div>
  );
}

