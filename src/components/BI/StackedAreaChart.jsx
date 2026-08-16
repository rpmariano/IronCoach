import React, { useRef, useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import MetricInfo from './MetricInfo';

export default function StackedAreaChart({ data = { dates: [], fatMassKg: [], leanMassKg: [] }, className = '' }) {
  const chartRef = useRef(null);
  const [gradients, setGradients] = useState({ lean: null, fat: null });

  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      const ctx = chart.ctx;
      
      const leanGradient = ctx.createLinearGradient(0, 0, 0, 400);
      leanGradient.addColorStop(0, 'rgba(5, 150, 105, 0.6)'); // --mod-nutricao
      leanGradient.addColorStop(1, 'rgba(5, 150, 105, 0.1)');
      
      const fatGradient = ctx.createLinearGradient(0, 0, 0, 400);
      fatGradient.addColorStop(0, 'rgba(239, 68, 68, 0.6)'); // warm red
      fatGradient.addColorStop(1, 'rgba(239, 68, 68, 0.1)');

      setGradients({ lean: leanGradient, fat: fatGradient });
    }
  }, []);

  const chartData = {
    labels: data.dates.map(d => {
      try { return format(parseISO(d), 'dd MMM', { locale: pt }); }
      catch { return d; }
    }),
    datasets: [
      {
        label: 'Massa Gorda',
        data: data.fatMassKg,
        borderColor: '#ef4444',
        backgroundColor: gradients.fat || 'rgba(239, 68, 68, 0.5)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
      {
        label: 'Massa Magra',
        data: data.leanMassKg,
        borderColor: '#059669',
        backgroundColor: gradients.lean || 'rgba(5, 150, 105, 0.5)',
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
      legend: { 
        position: 'top',
        align: 'end',
        labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'circle' }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#0f172a',
        bodyColor: '#0f172a',
        borderColor: 'rgba(0,0,0,0.1)',
        borderWidth: 1,
        padding: 10,
        mode: 'index',
        intersect: false,
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        stacked: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  return (
    <div className={`bg-white/40 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ${className}`}>
      <div className="flex items-start mb-3 gap-2">
        <h3 className="text-[12px] font-bold text-slate-700 flex-1 leading-tight">Composição Corporal (kg)</h3>
        <MetricInfo text="O peso na balança engana. Este gráfico permite-te ver de que é realmente feito o teu corpo. Se a linha global descer mas a área verde se mantiver igual, excelente: perdeste peso queimando apenas massa gorda enquanto seguraste a massa magra!" />
      </div>
      <div className="h-64 relative">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
}
