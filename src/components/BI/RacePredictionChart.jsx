import React from 'react';
import { Line } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { fmtNumber } from '../../utils/dashboardVerdicts';

/* Ponto 6 do redesenho:
   - O `predictionPlugin` desenhava uma caixa com texto DENTRO da tela
     (`ctx.fillText` do nome da prova e do tempo previsto). Sai por
     completo: o tempo previsto é agora o número grande do ChartFrame e o
     nome da prova é a etiqueta ao lado. Fica só a linha do VDOT no canvas.
   - Ticks e o `title` do eixo y ("VDOT") saem também.
   - Paleta: a série do VDOT estava em âmbar — o âmbar é da prova, e o VDOT
     é forma de corrida. A série passa ao ciano da corrida (--run); o âmbar
     fica só no número da PREVISÃO, que é mesmo da prova. */

const RUN = '#2ee0ff';   // --run

export default function RacePredictionChart({ vdotTrend = [], prediction, className = '' }) {
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}h${m}:${s}` : `${m}:${s}`;
  };

  // Um ponto por data, ficando com o melhor VDOT do dia.
  const deduped = Object.values(
    vdotTrend.reduce((acc, d) => {
      if (!acc[d.date] || d.vdot > acc[d.date].vdot) acc[d.date] = d;
      return acc;
    }, {})
  ).sort((a, b) => a.date.localeCompare(b.date));

  const vdots = deduped.map(d => Number(d.vdot));
  const firstVdot = vdots.length ? vdots[0] : null;
  const lastVdot = vdots.length ? vdots[vdots.length - 1] : null;
  const hasTrend = deduped.length >= 2;

  const data = {
    labels: deduped.map((_, i) => i),
    datasets: [
      {
        label: 'VDOT',
        data: vdots,
        borderColor: RUN,
        backgroundColor: 'rgba(46, 224, 255, 0.15)',
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
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          title: (items) => deduped[items?.[0]?.dataIndex]?.date || '',
          label: (ctx) => `VDOT: ${fmtNumber(ctx.raw, 1)}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { display: false }, border: { display: false } }
    }
  };

  // O número grande: o tempo previsto quando há prova (âmbar, é da prova);
  // senão o VDOT atual (ciano, é da corrida).
  const value = prediction ? formatTime(prediction.predictedSeconds) : (lastVdot !== null ? fmtNumber(lastVdot, 1) : '—');
  const unit = prediction ? (prediction.raceName || 'prova') : 'VDOT';
  const valueColor = prediction ? 'var(--race)' : 'var(--run)';

  const vdotDelta = hasTrend ? lastVdot - firstVdot : null;

  const legend = [{ label: `VDOT ${lastVdot !== null ? fmtNumber(lastVdot, 1) : '—'}`, color: RUN, shape: 'line' }];
  if (prediction) legend.push({ label: 'Previsão da prova', color: 'var(--race)' });

  return (
    <ChartFrame
      className={className}
      label={prediction ? 'Previsão de prova' : 'Evolução do VDOT'}
      info={<MetricInfo text="O VDOT é uma aproximação do teu VO2max. Quanto mais alto o valor, maior a tua aptidão aeróbica e mais rápidos serão os teus tempos em provas." />}
      value={value}
      unit={unit}
      valueColor={valueColor}
      delta={vdotDelta !== null && Math.abs(vdotDelta) >= 0.1
        ? { text: `VDOT ${vdotDelta > 0 ? '+' : '−'}${fmtNumber(Math.abs(vdotDelta), 1)}`, tone: vdotDelta >= 0 ? 'ok' : 'warn' }
        : undefined}
      legend={hasTrend ? legend : []}
      axis={hasTrend ? { min: fmtNumber(Math.min(...vdots), 1), max: fmtNumber(Math.max(...vdots), 1) } : undefined}
      height={hasTrend ? 200 : 0}
      footer={!hasTrend
        ? (prediction
            ? 'Regista mais corridas para veres a evolução do VDOT ao longo do tempo.'
            : 'Regista corridas para veres a previsão desta prova.')
        : undefined}
    >
      {hasTrend ? <Line data={data} options={options} /> : null}
    </ChartFrame>
  );
}
