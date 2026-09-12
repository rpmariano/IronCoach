import React from 'react';
import { Bar } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { acwrStatusLabel } from '../../utils/biEngine';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { useIntroAnimation, barGrowAnimation } from '../../utils/introAnimations';

/* Ponto 6 do redesenho:
   - O "Média 4s" era escrito com `ctx.fillText` em cima da tela. A linha
     tracejada fica (é forma), o texto sai e passa a item de legenda em HTML.
   - Os ticks dos dois eixos deixam de escrever; o valor da última semana é
     o número grande e os extremos vão para os cantos, em HTML.
   - A barra estava num gradiente âmbar (#d97706 → #f59e0b) apesar do
     comentário dizer --gym: o âmbar é da prova. Passa ao ardósia do
     ginásio, com as semanas antigas mais apagadas (tintas da cor do
     módulo, como no mock "Dashboard · Ginásio"). */

const TONE_COLOR = { danger: 'var(--danger)', caution: 'var(--warn)', safe: 'var(--ok)', neutral: 'var(--text-4)' };
const GYM_RGB = '158, 195, 210';   // --gym #9ec3d2

export default function VolumeLoadChart({ weeklyData = [], acwr, className = '' }) {
  const values = weeklyData.map(d => Number(d.volumeLoad || 0));
  const maxVal = values.length ? Math.max(...values) : 0;
  const last = values.length ? values[values.length - 1] : 0;
  const prev = values.length > 1 ? values[values.length - 2] : null;

  let avg4w = null;
  if (values.length >= 4) {
    avg4w = values.slice(-4).reduce((s, v) => s + v, 0) / 4;
  }

  const avgLinePlugin = {
    id: 'avgLine',
    afterDraw: (chart) => {
      if (avg4w === null) return;
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const yPos = scales.y.getPixelForValue(avg4w);
      if (yPos > chartArea.bottom || yPos < chartArea.top) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPos);
      ctx.lineTo(chartArea.right, yPos);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.45)';
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.restore();
      // Sem rótulo: o "Média 4s" vive na legenda em HTML do ChartFrame.
    }
  };

  const data = {
    labels: weeklyData.map(d => d.weekLabel),
    datasets: [
      {
        label: 'Volume-carga',
        data: values,
        // Tintas da cor do ginásio: a semana mais recente cheia, as
        // anteriores progressivamente mais apagadas (mínimo 40%).
        backgroundColor: values.map((_, i) => {
          const t = values.length > 1 ? i / (values.length - 1) : 1;
          return `rgba(${GYM_RGB}, ${(0.4 + 0.6 * t).toFixed(2)})`;
        }),
        borderRadius: 6,
      }
    ]
  };

  const introBars = useIntroAnimation('bi-bars');

  const options = {
    responsive: true,
    /* Ponto 9, animação 4: as barras crescem da base, da esquerda para a
       direita, --dur-bars com --stagger-bars — uma vez por sessão. */
    animation: barGrowAnimation(introBars),
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
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        beginAtZero: true,
        ticks: { display: false },
        border: { display: false },
      }
    }
  };

  let acwrHint;
  let acwrTone = 'neutral';
  if (acwr) {
    const { label, tone } = acwrStatusLabel(acwr.status, acwr.hasEnoughData);
    acwrTone = tone;
    acwrHint = acwr.hasEnoughData ? `ACWR ${acwr.ratio.toFixed(2).replace('.', ',')}` : `ACWR ${label}`;
  }

  const delta = prev !== null && Math.abs(last - prev) >= 1
    ? { text: `${last > prev ? '+' : '−'}${fmtNumber(Math.abs(last - prev), 0)} kg`, tone: last >= prev ? 'ok' : 'warn' }
    : undefined;

  const legend = [{ label: 'Volume-carga semanal', color: 'var(--gym)' }];
  if (avg4w !== null) legend.push({ label: `Média 4 semanas · ${fmtNumber(avg4w, 0)} kg`, color: 'rgba(248,250,252,.45)', shape: 'dash' });

  return (
    <ChartFrame
      className={className}
      label="Volume-carga semanal"
      info={<MetricInfo text="O Volume-Carga é o teu total de Séries × Repetições × Carga. É essencial subir este número ao longo do tempo para ganhares músculo. Compara com o ACWR para não exagerares." />}
      hint={acwrHint}
      value={fmtNumber(last, 0)}
      unit="kg esta semana"
      valueColor={acwrTone === 'neutral' ? 'var(--text-1)' : TONE_COLOR[acwrTone]}
      delta={delta}
      axis={maxVal > 0 ? { min: '0 kg', max: `${fmtNumber(maxVal, 0)} kg` } : undefined}
      legend={legend}
      height={208}
    >
      <Bar data={data} options={options} plugins={[avgLinePlugin]} />
    </ChartFrame>
  );
}
