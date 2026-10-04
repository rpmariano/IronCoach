import React, { useMemo } from 'react';
import { Chart } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { acwrStatusLabel, acwrMissingWeeks } from '../../utils/biEngine';
import { barGrowAnimation } from '../../utils/introAnimations';
import useReducedMotion from '../../utils/useReducedMotion';
import { useAppStore, sliceReady } from '../../store';
import { fmtNumber } from '../../utils/verdicts/shared';
import { classifyAcwrZone, ACWR_DANGER, ACWR_SAFE_MAX, ACWR_UNDER_TRAINING } from '@formulas/acwr.ts';

/* Ponto 6 do redesenho: as etiquetas saíram da tela. Os eixos deixaram de
   ter ticks de texto (`ticks.display: false`) — o rácio atual é o número
   grande do ChartFrame, os extremos do eixo são HTML nos cantos e a
   legenda é HTML por baixo. Dentro do <canvas> ficam só as barras, a linha
   e as três bandas de cor.

   R1 (2026-10-04): UM só ACWR no ecrã. O número grande é o do KPI — o de
   hoje, janelas rolantes de 7 e 28 dias (runAcwr.ts, o mesmo da Carol) — e é
   recebido em `acwr`. As barras e a linha são as últimas semanas seg–dom
   FECHADAS: a semana em curso é uma barra às riscas, "em curso", sem rácio
   (antes era a carga aguda e dava 0,00 "Carga baixa" à segunda enquanto o
   KPI dizia "Ideal"). Os limiares são os de acwr.ts — `>` sobre o rácio sem
   arredondar —, não `>=` sobre o arredondado (1,295 era "Atenção" no gráfico
   e "Ideal" no KPI). A "zona segura" só se desenha com um ACWR com dados. */

const TONE_COLOR = {
  safe: 'var(--ok)',
  caution: 'var(--warn)',
  danger: 'var(--danger)',
  neutral: 'var(--text-4)',
};
const DELTA_TONE = { safe: 'ok', caution: 'warn', danger: 'danger', neutral: 'neutral' };

const RUN = '#2ee0ff'; // --run
const RUN_SOFT = 'rgba(46, 224, 255, 0.18)';

/* A zona → o tom do KPI (acwrStatusLabel): 'undertrained' é "Carga baixa",
   neutro — nem perigo nem "ideal". */
const ZONE_TONE = { safe: 'safe', caution: 'caution', danger: 'danger', undertrained: 'neutral' };

/* O rácio para mostrar: duas casas, mas três quando o arredondamento cairia
   em cima de um limiar que o estado desmente (1,5004 é "Perigo" e "1,50"
   leria-se como "Atenção"). */
export function fmtRatio(ratio) {
  const r = Number(ratio);
  if (!isFinite(r)) return '—';
  const two = Math.round(r * 100) / 100;
  const onLimit = [ACWR_UNDER_TRAINING, ACWR_SAFE_MAX, ACWR_DANGER].some((l) => Math.abs(two - l) < 1e-9);
  return fmtNumber(r, onLimit && Math.abs(r - two) > 1e-9 ? 3 : 2);
}

/* Riscas na cor da corrida para a barra da semana em curso. O padrão faz-se
   no próprio tela (createPattern) — o Chart.js não tem tracejado nas barras.
   Sem tela (jsdom) ou com erro, cai para o ciano a 18%. */
function hatch(ctx2d) {
  try {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const g = c.getContext('2d');
    if (!g) return RUN_SOFT;
    g.strokeStyle = 'rgba(46, 224, 255, 0.85)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-2, 10);
    g.lineTo(10, -2);
    g.stroke();
    return ctx2d.createPattern(c, 'repeat') || RUN_SOFT;
  } catch {
    return RUN_SOFT;
  }
}

/* 2026-10-04: o plugin saiu do componente para ser uma constante — com uma
   referência nova a cada render, o react-chartjs-2 voltava a tratá-lo como
   alteração e cada render era um chart.update(). */
// Bandas de risco: verde 0.8–1.3, coral 1.3–1.5, vermelho acima. Os limiares
// vêm de acwr.ts. Só se desenham com `plugins.backgroundBands.enabled`.
const BACKGROUND_BANDS_PLUGIN = {
  id: 'backgroundBands',
  beforeDraw: (chart) => {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    if (!chart.options?.plugins?.backgroundBands?.enabled) return;
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
    drawBand(ACWR_UNDER_TRAINING, ACWR_SAFE_MAX, 'rgba(52, 211, 153, 0.10)');   // --ok
    drawBand(ACWR_SAFE_MAX, ACWR_DANGER, 'rgba(251, 124, 77, 0.10)');           // --warn
    drawBand(ACWR_DANGER, 3.0, 'rgba(248, 113, 113, 0.10)');                    // --danger
    ctx.restore();
  }
};

const PLUGINS = [BACKGROUND_BANDS_PLUGIN];

/**
 * @param {object} props
 * @param {Array} props.weeklyData semanas seg–dom, da mais antiga à corrente:
 *   { weekLabel, acuteLoad (km; null = antes do 1.º registo), ratio (null sem
 *   dados ou em curso), hasEnoughData, inProgress? }
 * @param {object} [props.acwr] o ACWR de hoje (runAcwr.ts) — o número grande
 *   e o estado. Sem ele (uso antigo) vale a última semana fechada.
 */
export default function ACWRChart({ weeklyData = [], acwr, className = '' }) {
  const closed = useMemo(() => weeklyData.filter((d) => !d.inProgress), [weeklyData]);
  const lastClosed = closed.length > 0 ? closed[closed.length - 1] : null;

  const hasEnoughData = acwr ? !!acwr.hasEnoughData : !!lastClosed?.hasEnoughData;
  const ratio = Number(acwr ? acwr.ratio : lastClosed?.ratio) || 0;
  /* O estado é do rácio sem arredondar (acwr.ts: > e não >=). O do KPI vem
     pronto em acwr.status; no uso antigo classifica-se aqui. */
  const zone = acwr?.status && acwr.status !== 'unknown' ? acwr.status : classifyAcwrZone(ratio);
  const tone = hasEnoughData ? ZONE_TONE[zone] || 'neutral' : 'neutral';
  const base = acwrStatusLabel(zone, hasEnoughData);
  const missing = acwr ? acwrMissingWeeks(acwr) : null;
  const statusLabel = missing ? `Faltam ${missing} sem.` : base.label;

  const loads = useMemo(() => weeklyData.map((d) => (d.acuteLoad === null || d.acuteLoad === undefined ? null : Number(d.acuteLoad))), [weeklyData]);
  const maxLoad = loads.reduce((m, v) => (v !== null && v > m ? v : m), 0);
  const hasBands = useMemo(() => weeklyData.some((d) => d.ratio !== null && d.ratio !== undefined), [weeklyData]);
  const inProgressIdx = weeklyData.findIndex((d) => d.inProgress);

  const data = useMemo(() => ({
    labels: weeklyData.map(d => d.weekLabel),
    datasets: [
      {
        type: 'line',
        label: 'Rácio ACWR',
        data: weeklyData.map(d => (d.ratio === undefined ? null : d.ratio)),
        borderColor: 'rgba(248, 250, 252, 0.75)',
        backgroundColor: 'rgba(248, 250, 252, 0.75)',
        yAxisID: 'ratio',
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        spanGaps: false,
        order: 1
      },
      {
        type: 'bar',
        label: 'Carga semanal',
        data: loads,
        // A semana em curso às riscas: está fora das contas (R1).
        backgroundColor: (c) => (c.dataIndex === inProgressIdx ? hatch(c.chart.ctx) : RUN),
        borderColor: RUN,
        borderWidth: (c) => (c.dataIndex === inProgressIdx ? 1.5 : 0),
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: 'load',
        order: 2
      }
    ]
  }), [weeklyData, loads, inProgressIdx]);

  // Nenhum eixo mostra texto: `ticks.display: false` nos três. A escala
  // continua a existir (as bandas e a linha precisam dela), só não escreve.
  /* 2026-10-04: a revelação é do ChartFrame (observa a própria área, só monta
     o tela com o separador assente e no ecrã). Aqui ficam só as opções, estáveis
     (cada referência nova faz chart.update()) e com reduced-motion a `false`. */
  const reduced = useReducedMotion();
  const ready = useAppStore((s) => sliceReady(s, ['runs']));
  const n = weeklyData.length;

  const options = useMemo(() => ({
    responsive: true,
    /* Ponto 9, animação 4: só as barras da carga aguda crescem; a linha do
       rácio e as bandas entram com elas, sem animação própria. */
    animation: barGrowAnimation({ reduced, count: n }),
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      backgroundBands: { enabled: hasBands },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255,255,255,0.15)',
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          title: (items) => {
            const w = weeklyData[items?.[0]?.dataIndex];
            if (!w) return '';
            return w.inProgress ? `Semana de ${w.weekLabel} · em curso, fora das contas` : `Semana de ${w.weekLabel}`;
          },
          label: (ctx) => (ctx.dataset.yAxisID === 'ratio'
            ? ` ACWR ${fmtRatio(ctx.raw)}`
            : ` ${fmtNumber(ctx.raw, 1)} km`),
        },
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
  }), [reduced, n, hasBands, weeklyData]);

  // O estado é sempre o do rácio de cima (o do KPI, ou o da última semana
  // fechada no uso antigo) — a variação entre semanas saiu: não era o ACWR.
  const delta = { text: statusLabel, tone: DELTA_TONE[tone] };

  const legend = [
    { label: 'Carga da semana (km)', color: 'var(--run)' },
    { label: 'Rácio ACWR', color: 'rgba(248,250,252,.75)', shape: 'line' },
  ];
  if (inProgressIdx >= 0) legend.push({ label: 'Semana em curso (fora das contas)', color: 'var(--run)', shape: 'dash' });
  if (hasBands) legend.push({ label: `Zona segura ${fmtNumber(ACWR_UNDER_TRAINING, 1)}–${fmtNumber(ACWR_SAFE_MAX, 1)}`, color: 'var(--ok)' });

  const acute = Number(acwr?.acuteKm);
  const chronic = Number(acwr?.chronicWeeklyKm);
  const footer = acwr && isFinite(acute) && isFinite(chronic) ? (
    <p data-testid="acwr-explicacao" style={{ margin: 0 }}>
      O número é o de hoje: {fmtNumber(acute, 1)} km nos últimos 7 dias contra a média semanal de {fmtNumber(chronic, 1)} km dos últimos 28. As barras e a linha são semanas de segunda a domingo; a semana em curso ainda não conta.
    </p>
  ) : undefined;

  return (
    <ChartFrame
      ready={ready}
      className={className}
      label="Carga aguda : crónica"
      info={<MetricInfo text="O ACWR compara a carga do teu treino nos últimos 7 dias (Aguda) com a média semanal dos últimos 28 (Crónica). Mantém-te na zona verde (0,8 a 1,3) para evoluir com segurança. Valores acima de 1,5 indicam risco elevado de lesão." />}
      hint="últimas 12 semanas"
      value={hasEnoughData ? fmtRatio(ratio) : '—'}
      unit={acwr ? 'ACWR hoje · 7 d vs 28 d' : 'ACWR'}
      valueColor={tone === 'neutral' ? 'var(--text-1)' : TONE_COLOR[tone]}
      delta={delta}
      axis={maxLoad > 0 ? { min: '0 km', max: `${Math.round(maxLoad)} km` } : undefined}
      legend={legend}
      height={208}
      footer={footer}
    >
      <Chart
        type="bar"
        data={data}
        options={options}
        updateMode="period"
        plugins={PLUGINS}
      />
    </ChartFrame>
  );
}
