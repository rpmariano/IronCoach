import React, { useRef, useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import MetricInfo from './MetricInfo';

export default function EnergyAvailabilityChart({ dailyData = [], className = '' }) {
  const chartRef = useRef(null);

  const backgroundBandsPlugin = {
    id: 'backgroundBands',
    beforeDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const y = scales.y;
      
      const drawBand = (min, max, color) => {
        const topVal = Math.min(max, y.max);
        const bottomVal = Math.max(min, y.min);
        
        if (bottomVal >= topVal) return;
        
        const top = y.getPixelForValue(topVal);
        const bottom = y.getPixelForValue(bottomVal);
        
        ctx.save();
        ctx.fillStyle = color;
        ctx.fillRect(chartArea.left, top, chartArea.right - chartArea.left, bottom - top);
        ctx.restore();
      };

      // Danger zone < 30
      drawBand(0, 30, 'rgba(220, 53, 69, 0.1)');
      // Caution zone 30-45
      drawBand(30, 45, 'rgba(255, 193, 7, 0.1)');
    }
  };

  const labels = dailyData.map(d => {
    try { return format(parseISO(d.date), 'dd/MM', { locale: pt }); }
    catch { return d.date; }
  });

  const getStatusColor = (status) => {
    if (status === 'danger') return '#DC3545';
    if (status === 'caution') return '#FFC107';
    return '#28A745';
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'Disponibilidade Energética',
        data: dailyData.map(d => d.ea),
        borderColor: '#f8fafc',
        backgroundColor: '#f8fafc',
        tension: 0.4,
        pointBackgroundColor: dailyData.map(d => getStatusColor(d.status)),
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
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
            return ` EA: ${context.raw.toFixed(1)} kcal/kg FFM`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: { 
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        min: Math.min(10, ...dailyData.map(d => d.ea))
      }
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] ${className}`}>
      <div className="flex items-start mb-3">
        <h3 className="text-[12px] font-bold text-slate-700">Disponibilidade Energética (EA)</h3>
        <MetricInfo text="A EA (Energy Availability) é a energia que sobra para o teu corpo viver depois de descontar as calorias que queimaste a treinar. Se ficares repetidamente abaixo da linha vermelha (30 kcal/kg), corres um risco clínico severo de Síndrome de Deficiência Energética Relativa (RED-S). Come mais nos dias de treino duro!" />
      </div>
      <div className="h-64 relative">
        <Line ref={chartRef} data={data} options={options} plugins={[backgroundBandsPlugin]} />
      </div>
    </div>
  );
}
