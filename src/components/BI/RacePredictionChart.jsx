import React from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function RacePredictionChart({ vdotTrend = [], prediction, className = '' }) {
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  const labels = vdotTrend.map(d => {
    try { return format(parseISO(d.date), 'dd MMM', { locale: pt }); }
    catch { return d.date; }
  });

  const predictionPlugin = {
    id: 'predictionAnno',
    afterDraw: (chart) => {
      if (!prediction) return;
      const { ctx, chartArea } = chart;
      if (!chartArea) return;

      // Draw simple annotation in top right
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(chartArea.right - 130, chartArea.top + 10, 120, 50, 8);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px system-ui';
      ctx.fillText(prediction.raceName || 'Previsão Prova', chartArea.right - 120, chartArea.top + 25);
      
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 14px system-ui';
      ctx.fillText(formatTime(prediction.predictedSeconds), chartArea.right - 120, chartArea.top + 45);
      ctx.restore();
    }
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'VDOT',
        data: vdotTrend.map(d => d.vdot),
        borderColor: '#fbbf24', // --mod-prova
        backgroundColor: 'rgba(251, 191, 36, 0.2)',
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
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#0f172a',
        bodyColor: '#0f172a',
        borderColor: 'rgba(0,0,0,0.1)',
        borderWidth: 1,
        padding: 10,
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: 'rgba(0, 0, 0, 0.05)' } }
    }
  };

  return (
    <div className={`bg-white/40 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ${className}`}>
      <h3 className="text-[12px] font-bold text-slate-700 mb-3">Evolução VDOT & Previsão de Prova</h3>
      <div className="h-64 relative">
        <Line data={data} options={options} plugins={[predictionPlugin]} />
      </div>
    </div>
  );
}
