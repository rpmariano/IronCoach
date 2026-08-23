import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';

export default function IntensityDonut({ distribution = {}, targetLowPct = 80, className = '' }) {
  const { lowIntensityPct = 0, highIntensityPct = 0 } = distribution;

  const data = {
    labels: ['Baixa Intensidade', 'Alta Intensidade'],
    datasets: [
      {
        data: [lowIntensityPct, highIntensityPct],
        backgroundColor: [
          '#14b8a6', // soft blue-green (teal-500)
          '#f97316'  // warm orange-red (orange-500)
        ],
        borderWidth: 0,
        hoverOffset: 4
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '75%',
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
            return ` ${context.label}: ${context.raw}%`;
          }
        }
      }
    }
  };

  // Custom plugin to draw center text
  const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: (chart) => {
      const { width, height, ctx } = chart;
      ctx.restore();
      const fontSize = (height / 114).toFixed(2);
      ctx.font = `bold ${fontSize}em system-ui`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      
      const text = `${lowIntensityPct}%`;
      const textX = Math.round((width - ctx.measureText(text).width) / 2);
      const textY = height / 2;
      
      ctx.fillText(text, textX, textY);
      ctx.save();
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] flex flex-col items-center ${className}`}>
      <div className="flex flex-wrap items-start w-full mb-3">
        <h3 className="text-[12px] font-bold text-slate-200 flex-1">Distribuição de Intensidade</h3>
        <MetricInfo text="Regra 80/20. Cerca de 80% do tempo de treino deve ser feito em intensidades baixas (Zonas 1 e 2) para maximizar as adaptações aeróbicas sem acumular fadiga. Só 20% deve ser intenso." />
      </div>
      <div className="w-48 h-48 relative">
        <Doughnut data={data} options={options} plugins={[centerTextPlugin]} />
      </div>
      <div className="flex justify-center items-center gap-4 mt-5 text-[11px] text-slate-300 font-medium w-full">
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-teal-500"></div> Z1-Z2
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-500"></div> Z3+
        </span>
      </div>
      <p className="text-[11px] text-slate-400 mt-2 text-center">
        Objetivo: {targetLowPct}% baixa intensidade
      </p>
    </div>
  );
}
