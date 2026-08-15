import React from 'react';
import { Bar } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function MacroComplianceChart({ dailyData = [], className = '' }) {
  const labels = dailyData.map(d => {
    try { return format(parseISO(d.date), 'dd/MM', { locale: pt }); }
    catch { return d.date; }
  });

  // Custom plugin to draw target lines on bars
  const targetLinesPlugin = {
    id: 'targetLines',
    afterDraw: (chart) => {
      const { ctx, scales, _metasets } = chart;
      if (!_metasets || _metasets.length < 3) return;

      const drawTarget = (meta, targetData, color) => {
        meta.data.forEach((bar, index) => {
          const target = targetData[index];
          if (!target) return;
          const yPos = scales.y.getPixelForValue(target);
          const { x, width } = bar;
          
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x - width / 2, yPos);
          ctx.lineTo(x + width / 2, yPos);
          ctx.lineWidth = 2;
          ctx.strokeStyle = color;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.restore();
        });
      };

      drawTarget(_metasets[0], dailyData.map(d => d.proteinTarget), '#1e3a8a');
      drawTarget(_metasets[1], dailyData.map(d => d.carbsTarget), '#422006');
      drawTarget(_metasets[2], dailyData.map(d => d.fatTarget), '#831843');
    }
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'Proteína',
        data: dailyData.map(d => d.protein),
        backgroundColor: '#3c6cdd',
        borderRadius: 4,
      },
      {
        label: 'Hidratos',
        data: dailyData.map(d => d.carbs),
        backgroundColor: '#8b8118',
        borderRadius: 4,
      },
      {
        label: 'Gordura',
        data: dailyData.map(d => d.fat),
        backgroundColor: '#dd3cb7',
        borderRadius: 4,
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
        labels: { boxWidth: 12, usePointStyle: true }
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#0f172a',
        bodyColor: '#0f172a',
        borderColor: 'rgba(0,0,0,0.1)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          afterBody: (context) => {
            if (context.length === 0) return '';
            const idx = context[0].dataIndex;
            const d = dailyData[idx];
            return `\nAlvos:\nProt: ${d.proteinTarget}g\nHidr: ${d.carbsTarget}g\nGord: ${d.fatTarget}g`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: 'rgba(0, 0, 0, 0.05)' }, beginAtZero: true }
    }
  };

  return (
    <div className={`bg-white/40 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ${className}`}>
      <h3 className="text-[12px] font-bold text-slate-700 mb-3">Adesão às Macros (g/kg)</h3>
      <div className="h-64 relative">
        <Bar data={data} options={options} plugins={[targetLinesPlugin]} />
      </div>
    </div>
  );
}
