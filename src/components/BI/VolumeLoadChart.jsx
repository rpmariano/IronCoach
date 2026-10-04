import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { barGrowAnimation } from '../../utils/introAnimations';
import useReducedMotion from '../../utils/useReducedMotion';

/* Ponto 6 do redesenho:
   - O "Média 4s" era escrito com `ctx.fillText` em cima da tela. A linha
     tracejada fica (é forma), o texto sai e passa a item de legenda em HTML.
   - Os ticks dos dois eixos deixam de escrever; o valor da última semana é
     o número grande e os extremos vão para os cantos, em HTML.
   - A barra estava num gradiente âmbar (#d97706 → #f59e0b) apesar do
     comentário dizer --gym: o âmbar é da prova. Passa ao ardósia do
     ginásio, com as semanas antigas mais apagadas (tintas da cor do
     módulo, como no mock "Dashboard · Ginásio"). */

const GYM_RGB = '158, 195, 210';   // --gym #9ec3d2

/* 2026-10-04: a linha da média de 4 semanas é um plugin CONSTANTE que lê o
   valor das opções na hora de desenhar (`options.plugins.avgLine.value`). O
   react-chartjs-2 só entrega `plugins` ao `new Chart(...)` e nunca os
   atualiza; com o plugin a fechar sobre `avg4w` (useMemo [avg4w]) a linha
   ficava no valor da criação — e no carrossel o canvas já não remonta a cada
   reveal: ao passar de 'mes' para 'semana' a linha ficava desenhada sem
   legenda, e ao contrário nunca aparecia. As opções, essas, chegam ao
   gráfico (setOptions + update). */
const AVG_LINE_PLUGIN = {
  id: 'avgLine',
  afterDraw: (chart, _args, opts) => {
    const avg = opts?.value;
    if (avg == null || !isFinite(avg)) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales?.y) return;
    const yPos = scales.y.getPixelForValue(avg);
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
  },
};
const PLUGINS = [AVG_LINE_PLUGIN];

/* G3/G4 + D5 (2026-10-04): o gráfico passa a semanas de CALENDÁRIO (seg–dom).
   Antes só havia barras das semanas com sessões: o "kg esta semana" era o da
   última semana COM treino (podia ser de há meses, G3), o delta comparava as
   duas últimas semanas com dados, e a "Média 4 semanas" não contava zeros nem
   excluía a semana parcial (G4). Agora:
   - `weeklyData` traz TODAS as semanas, com zeros explícitos;
   - a semana em curso vem `inProgress`: barra só em contorno ("em curso"),
     fora da média e do delta (ainda não acabou — e hoje nunca entra, R2);
   - a semana que começa antes do 1.º registo vem `partial`: aparece, mas não
     entra na média nem no delta (não se sabe o que houve antes);
   - o número grande é a última semana FECHADA, rotulada "semana de 21 set";
   - o delta é contra a semana fechada imediatamente anterior;
   - a média é das 4 últimas semanas fechadas, zeros incluídos.
   O ACWR do ginásio saiu do ecrã (D5, G5): com 2 sessões dava "Perigo". */

/** O que o gráfico diz de um conjunto de semanas — exportado para os testes. */
export function weeklyVolumeSummary(weeklyData = []) {
  const weeks = Array.isArray(weeklyData) ? weeklyData : [];
  const closed = weeks.filter((w) => !w.inProgress);
  const last = closed.length ? closed[closed.length - 1] : null;
  const prev = closed.length > 1 ? closed[closed.length - 2] : null;
  // Só semanas observadas por inteiro entram na média e na comparação.
  const eligible = closed.filter((w) => !w.partial);
  const lastEligible = eligible.length ? eligible[eligible.length - 1] : null;
  const delta = last && prev && lastEligible === last && !prev.partial
    && Math.abs(Number(last.volumeLoad || 0) - Number(prev.volumeLoad || 0)) >= 1
    ? { diff: Number(last.volumeLoad || 0) - Number(prev.volumeLoad || 0), prevLabel: prev.weekLabel }
    : null;
  const avg4w = eligible.length >= 4
    ? eligible.slice(-4).reduce((s, w) => s + Number(w.volumeLoad || 0), 0) / 4
    : null;
  return {
    last,
    delta,
    avg4w,
    hasInProgress: weeks.some((w) => w.inProgress),
    hasZeroWeek: closed.some((w) => !(Number(w.volumeLoad) > 0)),
  };
}

export default function VolumeLoadChart({ weeklyData = [], hint, ready, className = '' }) {
  /* 2026-10-04 (F5, plano §2.1): data, plugin e options estáveis — cada
     referência nova faz o react-chartjs-2 chamar chart.update(), que a meio de
     uma entrada a reaproveita e perde o escalonamento. A revelação (quando o
     gráfico aparece no ecrã) é da ChartFrame; aqui só se diz COMO as barras
     crescem. */
  const reduced = useReducedMotion();
  const values = useMemo(() => weeklyData.map(d => Number(d.volumeLoad || 0)), [weeklyData]);
  const maxVal = values.length ? Math.max(...values) : 0;
  const { last, delta: weekDelta, avg4w, hasInProgress, hasZeroWeek } = useMemo(
    () => weeklyVolumeSummary(weeklyData),
    [weeklyData],
  );

  const data = useMemo(() => {
    // Tintas da cor do ginásio: as semanas fechadas da mais apagada (40%) à
    // mais recente (cheia); a semana em curso é só contorno — ainda não é um
    // facto.
    const closedIdx = weeklyData.map((d, i) => (d.inProgress ? -1 : i)).filter((i) => i >= 0);
    const rank = new Map(closedIdx.map((i, k) => [i, k]));
    const t = (i) => (closedIdx.length > 1 ? rank.get(i) / (closedIdx.length - 1) : 1);
    return {
      labels: weeklyData.map(d => d.weekLabel),
      datasets: [
        {
          label: 'Volume-carga',
          data: values,
          backgroundColor: weeklyData.map((d, i) => (d.inProgress
            ? `rgba(${GYM_RGB}, 0.12)`
            : `rgba(${GYM_RGB}, ${(0.4 + 0.6 * t(i)).toFixed(2)})`)),
          borderColor: weeklyData.map(() => `rgba(${GYM_RGB}, 0.9)`),
          borderWidth: weeklyData.map((d) => (d.inProgress ? 1.5 : 0)),
          borderSkipped: false,
          borderRadius: 6,
        },
      ],
    };
  }, [weeklyData, values]);

  const n = weeklyData.length;
  const options = useMemo(() => ({
    responsive: true,
    /* Ponto 9, animação 4: as barras crescem da base, da esquerda para a
       direita. Quando entra em cena é a ChartFrame que decide (stop → reset →
       update); com reduced-motion é `false` e o gráfico aparece logo. */
    animation: barGrowAnimation({ reduced, count: n }),
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
          title: (items) => {
            const w = weeklyData[items?.[0]?.dataIndex];
            if (!w) return '';
            return `Semana de ${w.weekLabel}${w.inProgress ? ' · em curso' : w.partial ? ' · início dos registos' : ''}`;
          },
          label: (ctx) => ` ${fmtNumber(ctx.raw, 0)} kg`,
        },
      },
      // Lido pelo AVG_LINE_PLUGIN a cada desenho (null = sem linha).
      avgLine: { value: avg4w },
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
  }), [reduced, n, avg4w, weeklyData]);

  const delta = weekDelta
    ? {
        text: `${weekDelta.diff > 0 ? '▲' : '▼'} ${fmtNumber(Math.abs(weekDelta.diff), 0)} kg face a ${weekDelta.prevLabel}`,
        tone: weekDelta.diff > 0 ? 'ok' : 'warn',
      }
    : undefined;

  const legend = [{ label: 'Volume-carga semanal', color: 'var(--gym)' }];
  if (hasInProgress) legend.push({ label: 'Semana em curso (fora da média)', color: 'rgba(158,195,210,.45)' });
  if (avg4w !== null) legend.push({ label: `Média 4 semanas fechadas · ${fmtNumber(avg4w, 0)} kg`, color: 'rgba(248,250,252,.45)', shape: 'dash' });

  const notes = [];
  if (hasZeroWeek) notes.push('As semanas sem treino contam 0 kg.');
  if (hasInProgress) notes.push('A semana em curso (só os dias fechados) fica fora da média e da comparação.');

  return (
    <ChartFrame
      className={className}
      label="Volume-carga semanal"
      info={<MetricInfo text="O Volume-Carga é o total de séries × repetições × carga de todos os exercícios da semana (seg–dom). Serve para ver se treinas mais ou menos de uma semana para a outra, não para comparar exercícios: agachamento e curl contam ambos em kg. Para a evolução de cada exercício, vê a Progressão por exercício." />}
      hint={hint}
      ready={ready}
      value={last ? fmtNumber(last.volumeLoad, 0) : '—'}
      unit={last ? `kg · semana de ${last.weekLabel}` : 'ainda sem semana fechada'}
      valueColor="var(--text-1)"
      delta={delta}
      axis={maxVal > 0 ? { min: '0 kg', max: `${fmtNumber(maxVal, 0)} kg` } : undefined}
      legend={legend}
      height={208}
      footer={notes.length ? <p data-testid="volume-notas" style={{ margin: 0 }}>{notes.join(' ')}</p> : undefined}
    >
      <Bar data={data} options={options} plugins={PLUGINS} updateMode="period" />
    </ChartFrame>
  );
}
