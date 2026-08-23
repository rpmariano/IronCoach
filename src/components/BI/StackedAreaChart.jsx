import React, { useRef, useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import MetricInfo from './MetricInfo';

export default function StackedAreaChart({ data = { dates: [], fatMassKg: [], leanMassKg: [] }, className = '' }) {
  const chartRef = useRef(null);

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
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(239, 68, 68, 0.4)';
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
          gradient.addColorStop(1, 'rgba(239, 68, 68, 0.05)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
      {
        label: 'Massa Magra',
        data: data.leanMassKg,
        borderColor: '#059669',
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(5, 150, 105, 0.4)';
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(5, 150, 105, 0.6)');
          gradient.addColorStop(1, 'rgba(5, 150, 105, 0.05)');
          return gradient;
        },
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
        labels: { boxWidth: 12, usePointStyle: true, pointStyle: 'circle', color: 'rgba(255, 255, 255, 0.7)' }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: 10,
        mode: 'index',
        intersect: false,
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: 'rgba(255, 255, 255, 0.5)' } },
      y: {
        stacked: true,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: 'rgba(255, 255, 255, 0.5)' }
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
