import React, { useRef, useEffect, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';

export default function ACWRChart({ weeklyData = [], className = '' }) {
  const chartRef = useRef(null);
  const [gradient, setGradient] = useState(null);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart) {
      const ctx = chart.ctx;
      const gradientBg = ctx.createLinearGradient(0, 0, 0, 400);
      gradientBg.addColorStop(0, '#3b82f6');
      gradientBg.addColorStop(1, 'rgba(59, 130, 246, 0.2)');
      setGradient(gradientBg);
    }
  }, []);

  // For bands, we can use a custom plugin to draw background areas
  const backgroundBandsPlugin = {
    id: 'backgroundBands',
    beforeDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const y = scales.ratio;
      
      const drawBand = (min, max, color) => {
        const top = y.getPixelForValue(max);
        const bottom = y.getPixelForValue(min);
        // Constrain to chart area
        const adjustedTop = Math.max(top, chartArea.top);
        const adjustedBottom = Math.min(bottom, chartArea.bottom);
        if (adjustedBottom > adjustedTop) {
          ctx.fillStyle = color;
          ctx.fillRect(chartArea.left, adjustedTop, chartArea.right - chartArea.left, adjustedBottom - adjustedTop);
        }
      };

      ctx.save();
      // Green Zone (0.8 - 1.3)
      drawBand(0.8, 1.3, 'rgba(40, 167, 69, 0.1)');
      // Orange Zone (1.3 - 1.5)
      drawBand(1.3, 1.5, 'rgba(255, 193, 7, 0.1)');
      // Red Zone (>1.5)
      drawBand(1.5, 3.0, 'rgba(220, 53, 69, 0.1)');
      ctx.restore();
    }
  };

  const data = {
    labels: weeklyData.map(d => d.weekLabel),
    datasets: [
      {
        type: 'line',
        label: 'Rácio ACWR',
        data: weeklyData.map(d => d.ratio),
        borderColor: '#334155', // slate-700
        backgroundColor: '#334155',
        yAxisID: 'ratio',
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        order: 1
      },
      {
        type: 'bar',
        label: 'Carga Aguda',
        data: weeklyData.map(d => d.acuteLoad),
        backgroundColor: gradient || '#3b82f6',
        borderRadius: 6,
        yAxisID: 'load',
        order: 2
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
        boxPadding: 4,
        usePointStyle: true,
      }
    },
    scales: {
      x: {
        grid: { display: false }
      },
      load: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { display: false }
      },
      ratio: {
        type: 'linear',
        display: true,
        position: 'right',
        min: 0,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      }
    }
  };

  return (
    <div className={`bg-white/40 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ${className}`}>
      <div className="flex items-start mb-3">
        <h3 className="text-[12px] font-bold text-slate-700">Rácio de Carga Aguda:Crónica</h3>
        <MetricInfo text="O ACWR compara a carga do teu treino na última semana (Aguda) com a média das últimas 4 semanas (Crónica). Mantém-te na zona verde (0.8 a 1.3) para evoluir com segurança. Valores > 1.5 indicam risco elevado de lesão." />
      </div>
      <div className="h-64 relative">
        <Chart
          ref={chartRef}
          type="bar"
          data={data}
          options={options}
          plugins={[backgroundBandsPlugin]}
        />
      </div>
    </div>
  );
}
