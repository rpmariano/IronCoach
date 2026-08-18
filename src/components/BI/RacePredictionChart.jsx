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
      ctx.shadowColor = 'rgba(255,255,255,0.15)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(chartArea.right - 130, chartArea.top + 10, 120, 50, 8);
      ctx.fill();
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#64748b';
      ctx.font = '10px system-ui';
      ctx.fillText(prediction.raceName || 'Previsão Prova', chartArea.right - 120, chartArea.top + 25);
      
      ctx.fillStyle = '#f8fafc';
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
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: 10,
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' } }
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] ${className}`}>
      <div className="flex items-start mb-3">
        <h3 className="text-[12px] font-bold text-slate-700">Evolução VDOT & Previsão de Prova</h3>
        <MetricInfo text="O VDOT é uma aproximação do teu VO2max. Quanto mais alto o valor, maior a tua aptidão aeróbica e mais rápidos serão os teus tempos em provas." />
      </div>
      <div className="h-64 relative">
        <Line data={data} options={options} plugins={[predictionPlugin]} />
      </div>
    </div>
  );
}
