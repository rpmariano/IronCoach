import React from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';

export default function CrossMetricsChart({ title, leftData, rightData, className = '' }) {
  const data = {
    labels: leftData.data.map(d => d.x),
    datasets: [
      {
        label: leftData.label,
        data: leftData.data.map(d => d.y),
        borderColor: leftData.color,
        backgroundColor: leftData.color,
        yAxisID: 'yLeft',
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
      },
      {
        label: rightData.label,
        data: rightData.data.map(d => d.y),
        borderColor: rightData.color,
        backgroundColor: rightData.color,
        yAxisID: 'yRight',
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
        labels: { boxWidth: 12, usePointStyle: true }
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
        callbacks: {
          label: (context) => {
            const isLeft = context.datasetIndex === 0;
            const unit = isLeft ? leftData.unit : rightData.unit;
            return ` ${context.dataset.label}: ${context.raw} ${unit || ''}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      yLeft: {
        type: 'linear',
        display: true,
        position: 'left',
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        title: { display: !!leftData.unit, text: leftData.unit }
      },
      yRight: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: { display: false },
        title: { display: !!rightData.unit, text: rightData.unit }
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
      {title && <h3 className="text-[12px] font-bold text-slate-700 mb-3">{title}</h3>}
      <div className="h-64 relative">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
