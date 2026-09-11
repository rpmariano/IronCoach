import React from 'react';
import { Bar } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { fmtNumber } from '../../utils/dashboardVerdicts';

/* Ponto 6 do redesenho:
   - A legenda do Chart.js (desenhada na tela) e os ticks dos dois eixos
     saem; passam a HTML no ChartFrame.
   - As três linhas de alvo continuam desenhadas (são forma, tracejado) mas
     sem rótulo dentro do canvas.
   - Paleta: #3c6cdd / #8b8118 / #dd3cb7 eram três cores inventadas. Passam
     às do mock "Dashboard · Nutrição": proteína rosa (--body), hidratos
     violeta (--nutrition), gordura ciano (--run). */

const PROT = '#ff5fa8';   // --body
const CARB = '#c77dff';   // --nutrition
const FAT = '#2ee0ff';    // --run

export default function MacroComplianceChart({ dailyData = [], className = '' }) {
  const sample = dailyData[0] || {};

  const targetLinesPlugin = {
    id: 'targetLines',
    afterDatasetsDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || dailyData.length === 0) return;

      const drawLine = (target, color) => {
        if (!target || isNaN(target)) return;
        const yPos = scales.y.getPixelForValue(target);
        if (yPos > chartArea.bottom || yPos < chartArea.top) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yPos);
        ctx.lineTo(chartArea.right, yPos);
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();
      };

      // Sem rótulo dentro da tela — os alvos estão na legenda em HTML.
      drawLine(sample.proteinTarget, PROT);
      drawLine(sample.carbsTarget, CARB);
      drawLine(sample.fatTarget, FAT);
    }
  };

  const data = {
    labels: dailyData.map((_, i) => i),
    datasets: [
      { label: 'Proteína', data: dailyData.map(d => d.protein), backgroundColor: PROT, borderRadius: 4 },
      { label: 'Hidratos', data: dailyData.map(d => d.carbs), backgroundColor: CARB, borderRadius: 4 },
      { label: 'Gordura', data: dailyData.map(d => d.fat), backgroundColor: FAT, borderRadius: 4 },
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
          title: (items) => dailyData[items?.[0]?.dataIndex]?.date || '',
          afterBody: (context) => {
            if (context.length === 0) return '';
            const d = dailyData[context[0].dataIndex];
            return `\nAlvos:\nProt: ${fmtNumber(d.proteinTarget || 0, 1)} g/kg\nHidr: ${fmtNumber(d.carbsTarget || 0, 1)} g/kg\nGord: ${fmtNumber(d.fatTarget || 0, 1)} g/kg`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { display: false },
        border: { display: false },
        beginAtZero: true,
        suggestedMax: dailyData.length > 0
          ? Math.max(sample.proteinTarget || 0, sample.carbsTarget || 0, sample.fatTarget || 0) * 1.1
          : undefined
      }
    }
  };

  // O "valor atual" deste gráfico é a proteína do último dia registado —
  // é a macro que decide a recuperação, e a que a Carol cita primeiro. Os
  // valores de `dailyBreakdown` vêm em g/kg de peso corporal (é o que
  // macroAdherence devolve), não em gramas absolutas.
  const lastDay = dailyData[dailyData.length - 1] || {};
  const lastProtein = Number(lastDay.protein || 0);
  const proteinTarget = Number(lastDay.proteinTarget || sample.proteinTarget || 0);
  const proteinPct = proteinTarget > 0 ? (lastProtein / proteinTarget) * 100 : 0;

  return (
    <ChartFrame
      className={className}
      label="Adesão às macros"
      info={<MetricInfo text="Compara o que realmente comeste (barras coloridas) com os teus alvos ideais de Nutrição Desportiva (linhas tracejadas). Tens de bater as linhas tracejadas, especialmente a proteína, para garantirmos recuperação máxima!" />}
      hint={dailyData.length > 0 ? `${dailyData.length} dias` : undefined}
      value={fmtNumber(lastProtein, 1)}
      unit="g/kg de proteína no último dia"
      valueColor={proteinPct >= 85 ? 'var(--text-1)' : 'var(--warn)'}
      delta={proteinTarget > 0 ? { text: `${fmtNumber(proteinPct, 0)}% do alvo`, tone: proteinPct >= 85 ? 'ok' : 'warn' } : undefined}
      legend={[
        { label: `Proteína · alvo ${fmtNumber(sample.proteinTarget || 0, 1)} g/kg`, color: PROT },
        { label: `Hidratos · alvo ${fmtNumber(sample.carbsTarget || 0, 1)} g/kg`, color: CARB },
        { label: `Gordura · alvo ${fmtNumber(sample.fatTarget || 0, 1)} g/kg`, color: FAT },
      ]}
      height={200}
    >
      <Bar data={data} options={options} plugins={[targetLinesPlugin]} />
    </ChartFrame>
  );
}
