import React, { useRef, useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import MetricInfo from './MetricInfo';

export default function StackedAreaChart({ data = { dates: [], fatMassKg: [], leanMassKg: [] }, className = '' }) {
  const chartRef = useRef(null);

  const labels = (data.dates || []).map(d => {
    try { return format(parseISO(d), 'dd MMM', { locale: pt }); }
    catch { return d; }
  });

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Massa Magra',
        data: data.leanMassKg || [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.5)',
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: 'origin',
        tension: 0.2,
        order: 2,
      },
      {
        label: 'Massa Gorda',
        data: data.fatMassKg || [],
        borderColor: '#f43f5e',
        backgroundColor: 'rgba(244, 63, 94, 0.5)',
        pointBackgroundColor: '#f43f5e',
        pointBorderColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: '-1',
        tension: 0.2,
        order: 1,
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
        labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', color: 'rgba(255, 255, 255, 0.8)', font: { size: 11 } }
      },
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
          label: (context) => {
            const val = Number(context.raw || 0);
            return ` ${context.dataset.label}: ${val.toFixed(1)} kg`;
          },
          footer: (tooltipItems) => {
            const total = tooltipItems.reduce((sum, item) => sum + Number(item.raw || 0), 0);
            return `Total (Peso): ${total.toFixed(1)} kg`;
          }
        }
      }
    },
    scales: {
      x: { 
        grid: { display: false }, 
        ticks: { color: 'rgba(255, 255, 255, 0.5)' } 
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { 
          color: 'rgba(255, 255, 255, 0.6)',
          callback: (v) => `${v} kg`,
          font: { size: 10 }
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] ${className}`}>
      <div className="flex flex-wrap items-start mb-3 gap-2">
        <h3 className="text-[12px] font-bold text-slate-200 flex-1 leading-tight">Composição Corporal (kg)</h3>
        <MetricInfo text="O peso na balança engana. Este gráfico permite-te ver de que é realmente feito o teu corpo. Se a linha global descer mas a área verde se mantiver igual, excelente: perdeste peso queimando apenas massa gorda enquanto seguraste a massa magra!" />
      </div>
      <div className="h-64 relative">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
}
