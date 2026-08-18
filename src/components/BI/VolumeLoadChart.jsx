import React, { useRef, useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';

export default function VolumeLoadChart({ weeklyData = [], acwr, className = '' }) {
  const chartRef = useRef(null);
  const [gradient, setGradient] = useState(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      const ctx = chart.ctx;
      const bg = ctx.createLinearGradient(0, 0, 0, 400);
      bg.addColorStop(0, '#d97706'); // --mod-ginasio
      bg.addColorStop(1, 'rgba(217, 119, 6, 0.2)');
      setGradient(bg);
    }
  }, []);

  // Compute 4-week average if there are enough data points
  let avg4w = null;
  if (weeklyData.length >= 4) {
    const last4 = weeklyData.slice(-4);
    avg4w = last4.reduce((sum, d) => sum + d.volumeLoad, 0) / 4;
  }

  const avgLinePlugin = {
    id: 'avgLine',
    afterDraw: (chart) => {
      if (avg4w === null) return;
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      
      const yPos = scales.y.getPixelForValue(avg4w);
      if (yPos > chartArea.bottom || yPos < chartArea.top) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPos);
      ctx.lineTo(chartArea.right, yPos);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#94a3b8'; // slate-400
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      
      // Label
      ctx.fillStyle = '#64748b'; // slate-500
      ctx.font = '10px system-ui';
      ctx.fillText('Média 4s', chartArea.right - 45, yPos - 5);
      ctx.restore();
    }
  };

  const data = {
    labels: weeklyData.map(d => d.weekLabel),
    datasets: [
      {
        label: 'Volume-Carga',
        data: weeklyData.map(d => d.volumeLoad),
        backgroundColor: weeklyData.map((_, i) => {
          // highlight current week (last item) if desired, or all gradient
          if (i === weeklyData.length - 1) return '#d97706';
          return gradient || 'rgba(217, 119, 6, 0.5)';
        }),
        borderRadius: 6,
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
      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, beginAtZero: true }
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/10 rounded-2xl p-4 shadow-lg ${className}`}>
      <div className="flex justify-between items-start mb-3 gap-2">
        <div className="flex items-start flex-1">
          <h3 className="text-[12px] font-bold text-slate-700 leading-tight">Volume-Carga Semanal (kg)</h3>
          <MetricInfo text="O Volume-Carga é o teu total de Séries × Repetições × Carga. É essencial subir este número ao longo do tempo para ganhares músculo. Compara com o ACWR para não exagerares." />
        </div>
        {acwr && (
          <div className="text-right">
            <span className="text-[10px] text-slate-500 block">ACWR</span>
            <span className={`text-xs font-bold ${
              acwr.status === 'danger' ? 'text-[#DC3545]' :
              acwr.status === 'caution' ? 'text-[#FFC107]' : 'text-[#28A745]'
            }`}>{acwr.ratio.toFixed(2)}</span>
          </div>
        )}
      </div>
      <div className="h-64 relative">
        <Bar ref={chartRef} data={data} options={options} plugins={[avgLinePlugin]} />
      </div>
    </div>
  );
}
