import React from 'react';
import { Bar } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import MetricInfo from './MetricInfo';

export default function MacroComplianceChart({ dailyData = [], className = '' }) {
  const labels = dailyData.map(d => {
    try { return format(parseISO(d.date), 'dd/MM', { locale: pt }); }
    catch { return d.date; }
  });

  const targetLinesPlugin = {
    id: 'targetLines',
    afterDatasetsDraw: (chart) => {
      const { ctx, scales } = chart;

      const drawTarget = (datasetIndex, targetData, color) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta || meta.hidden) return;
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

      drawTarget(0, dailyData.map(d => d.proteinTarget), '#1e3a8a');
      drawTarget(1, dailyData.map(d => d.carbsTarget), '#422006');
      drawTarget(2, dailyData.map(d => d.fatTarget), '#831843');
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
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
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
      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, beginAtZero: true }
    }
  };

  return (
    <div className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] ${className}`}>
      <div className="flex items-start mb-3">
        <h3 className="text-[12px] font-bold text-slate-700">Adesão às Macros (g/kg)</h3>
        <MetricInfo text="Compara o que realmente comeste (barras coloridas) com os teus alvos ideais de Nutrição Desportiva (linhas tracejadas). Tens de bater as linhas tracejadas, especialmente a proteína, para garantirmos recuperação máxima!" />
      </div>
      <div className="h-64 relative">
        <Bar data={data} options={options} plugins={[targetLinesPlugin]} />
      </div>
    </div>
  );
}
