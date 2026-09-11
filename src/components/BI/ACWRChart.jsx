import React from 'react';
import { Chart } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { acwrStatusLabel } from '../../utils/biEngine';
import { useIntroAnimation, barGrowAnimation } from '../../utils/introAnimations';

/* Ponto 6 do redesenho: as etiquetas saíram da tela. Os eixos deixaram de
   ter ticks de texto (`ticks.display: false`) — o rácio atual é o número
   grande do ChartFrame, os extremos do eixo são HTML nos cantos e a
   legenda é HTML por baixo. Dentro do <canvas> ficam só as barras, a linha
   e as três bandas de cor. */

const TONE_COLOR = {
  safe: 'var(--ok)',
  caution: 'var(--warn)',
  danger: 'var(--danger)',
  neutral: 'var(--text-4)',
};

export default function ACWRChart({ weeklyData = [], className = '' }) {
  // Bandas de risco: verde 0.8–1.3, coral 1.3–1.5, vermelho acima. As cores
  // vinham do bootstrap antigo (#28a745/#ffc107/#dc3545) — passam às três
  // com significado do ponto 3.
  const backgroundBandsPlugin = {
    id: 'backgroundBands',
    beforeDraw: (chart) => {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const y = scales.ratio;
      if (!y) return;

      const drawBand = (min, max, color) => {
        const top = y.getPixelForValue(max);
        const bottom = y.getPixelForValue(min);
        const adjustedTop = Math.max(top, chartArea.top);
        const adjustedBottom = Math.min(bottom, chartArea.bottom);
        if (adjustedBottom > adjustedTop) {
          ctx.fillStyle = color;
          ctx.fillRect(chartArea.left, adjustedTop, chartArea.right - chartArea.left, adjustedBottom - adjustedTop);
        }
      };

      ctx.save();
      drawBand(0.8, 1.3, 'rgba(52, 211, 153, 0.10)');   // --ok
      drawBand(1.3, 1.5, 'rgba(251, 124, 77, 0.10)');   // --warn
      drawBand(1.5, 3.0, 'rgba(248, 113, 113, 0.10)');  // --danger
      ctx.restore();
    }
  };

  const last = weeklyData.length > 0 ? weeklyData[weeklyData.length - 1] : null;
  const prev = weeklyData.length > 1 ? weeklyData[weeklyData.length - 2] : null;
  const ratio = Number(last?.ratio || 0);

  const loads = weeklyData.map(d => Number(d.acuteLoad || 0));
  const maxLoad = loads.length ? Math.max(...loads) : 0;

  /* O rácio só ganha cor e etiqueta de estado com quatro semanas de carga
     medida. Sem isso, um atleta com duas corridas via "Perigo" a vermelho
     por causa de um rácio que a crónica ainda não sustenta — é o mesmo bug
     que o acwrStatusLabel/`hasEnoughData` existe para evitar (ver
     biEngine.js, auditoria de 23/08). Aqui o número mostra-se em branco e
     a etiqueta diz "Sem dados". */
  const hasEnoughData = loads.filter(v => v > 0).length >= 4;
  const status = !hasEnoughData
    ? 'neutral'
    : ratio >= 1.5 ? 'danger' : ratio >= 1.3 ? 'caution' : ratio >= 0.8 ? 'safe' : 'neutral';
  const { label: statusLabel } = acwrStatusLabel(
    ratio >= 1.5 ? 'danger' : ratio >= 1.3 ? 'caution' : ratio >= 0.8 ? 'safe' : 'undertrained',
    hasEnoughData
  );

  const data = {
    labels: weeklyData.map(d => d.weekLabel),
    datasets: [
      {
        type: 'line',
        label: 'Rácio ACWR',
        data: weeklyData.map(d => d.ratio),
        borderColor: 'rgba(248, 250, 252, 0.75)',
        backgroundColor: 'rgba(248, 250, 252, 0.75)',
        yAxisID: 'ratio',
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        order: 1
      },
      {
        type: 'bar',
        label: 'Carga aguda',
        data: loads,
        backgroundColor: '#2ee0ff', // --run
        borderRadius: 6,
        yAxisID: 'load',
        order: 2
      }
    ]
  };

  // Nenhum eixo mostra texto: `ticks.display: false` nos três. A escala
  // continua a existir (as bandas e a linha precisam dela), só não escreve.
  const introBars = useIntroAnimation('bi-bars');

  const options = {
    responsive: true,
    /* Ponto 9, animação 4: só as barras da carga aguda crescem; a linha do
       rácio e as bandas entram com elas, sem animação própria. */
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
        boxPadding: 4,
        usePointStyle: true,
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      load: {
        type: 'linear',
        position: 'left',
        grid: { display: false },
        ticks: { display: false },
        border: { display: false },
      },
      ratio: {
        type: 'linear',
        position: 'right',
        min: 0,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { display: false },
        border: { display: false },
      }
    }
  };

  const deltaRatio = last && prev ? Number(last.ratio) - Number(prev.ratio) : null;

  return (
    <ChartFrame
      className={className}
      label="Carga aguda : crónica"
      info={<MetricInfo text="O ACWR compara a carga do teu treino na última semana (Aguda) com a média das últimas 4 semanas (Crónica). Mantém-te na zona verde (0.8 a 1.3) para evoluir com segurança. Valores > 1.5 indicam risco elevado de lesão." />}
      hint={statusLabel}
      value={hasEnoughData ? ratio.toFixed(2).replace('.', ',') : '—'}
      unit="ACWR"
      valueColor={status === 'neutral' ? 'var(--text-1)' : TONE_COLOR[status]}
      delta={hasEnoughData && deltaRatio !== null && Math.abs(deltaRatio) >= 0.01
        ? {
            text: `${deltaRatio > 0 ? '+' : '−'}${Math.abs(deltaRatio).toFixed(2).replace('.', ',')}`,
            tone: deltaRatio > 0 && ratio >= 1.3 ? 'warn' : 'neutral',
          }
        : undefined}
      axis={maxLoad > 0 ? { min: '0 km', max: `${Math.round(maxLoad)} km` } : undefined}
      legend={[
        { label: 'Carga aguda (km)', color: 'var(--run)' },
        { label: 'Rácio ACWR', color: 'rgba(248,250,252,.75)', shape: 'line' },
        { label: 'Zona segura 0,8–1,3', color: 'var(--ok)' },
      ]}
      height={208}
    >
      <Chart
        type="bar"
        data={data}
        options={options}
        plugins={[backgroundBandsPlugin]}
      />
    </ChartFrame>
  );
}
