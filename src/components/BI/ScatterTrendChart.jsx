import React, { useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import ChartJS from '../../lib/chartSetup';
import MetricInfo from './MetricInfo';
import ChartFrame from './ChartFrame';
import { useAppStore, sliceReady } from '../../store';
import { formatPace } from '../../utils/run';
import { axisDate } from './crossPeriod';

/* Ponto 6 do redesenho: os `title` dos dois eixos ("Ritmo (min/km)", "FC
   Média (bpm)") e os ticks eram texto desenhado na tela. Saem os três; os
   extremos do eixo ficam nos cantos em HTML e a sessão mais recente é o
   número grande. Paleta: a nuvem estava em rgba(59,130,246) — azul genérico,
   apesar do comentário dizer --mod-corrida. Passa ao ciano da corrida,
   mais opaco nas sessões recentes (tintas da cor do módulo). */

const RUN_RGB = '46, 224, 255';   // --run #2ee0ff

/* R3 (2026-10-04): os pontos chegam pela ordem do store, que carrega as
   corridas por data DESCENDENTE (store/index.js, order('date', desc)) — e
   nem filterByDateRange nem calculatePaceVsHR reordenam. O componente lia o
   último elemento como "a última" e fazia o gradiente de opacidade crescer
   com o índice, por isso mostrava a sessão MAIS ANTIGA como a mais recente e
   deixava as antigas mais opacas. Ordena-se aqui, por data ascendente (sort
   estável: no mesmo dia mantém a ordem recebida), sem depender de quem
   chama. */
function porDataAscendente(data) {
  return [...data].sort((a, b) => String(a?.date ?? '').localeCompare(String(b?.date ?? '')));
}

/** A reta de tendência (mínimos quadrados, FC em função do ritmo) entre o ritmo mais lento e o
 *  mais rápido; null com menos de 3 sessões ou sem variação de ritmo — dois pontos não são tendência. */
export function trendLine(data) {
  const pts = (data || [])
    .map((d) => ({ x: Number(d?.paceSecondsPerKm), y: Number(d?.avgHR) }))
    .filter((p) => Number.isFinite(p.x) && p.x > 0 && Number.isFinite(p.y) && p.y > 0);
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  const at = (x) => Math.round((my + slope * (x - mx)) * 10) / 10;
  const xs = pts.map((p) => p.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return [{ x: hi, y: at(hi) }, { x: lo, y: at(lo) }];
}

/* 2026-10-04 (fase 5): `scope` diz de que período são as sessões ("neste
   mês") — o ecrã passa só as corridas desse período, já fechadas. */
export default function ScatterTrendChart({ data: recebidos = [], scope, className = '' }) {
  const data = useMemo(() => porDataAscendente(recebidos), [recebidos]);
  const ready = useAppStore((s) => sliceReady(s, ['runs']));
  // 2026-10-04: data/options estáveis (cada referência nova faz chart.update()).
  const trend = useMemo(() => trendLine(data), [data]);
  const lastIndex = data.length - 1;
  const chartData = useMemo(() => ({
    datasets: [
      {
        label: 'Sessões',
        data: data.map(d => ({ x: d.paceSecondsPerKm, y: d.avgHR, rawDate: d.date, rawLabel: d.label })),
        backgroundColor: data.map((d, i) => `rgba(${RUN_RGB}, ${(0.3 + 0.5 * (i / Math.max(data.length - 1, 1))).toFixed(2)})`),
        borderColor: data.map((d, i) => (i === lastIndex ? '#ffffff' : `rgba(${RUN_RGB}, ${(0.5 + 0.5 * (i / Math.max(data.length - 1, 1))).toFixed(2)})`)),
        // Pedido do Rui (2026-11-01): a mais recente não pode ser só um pouco mais opaca —
        // maior, cheia e com contorno branco (e nomeada na legenda, com a data).
        pointBackgroundColor: data.map((d, i) => (i === lastIndex ? `rgb(${RUN_RGB})` : `rgba(${RUN_RGB}, ${(0.3 + 0.5 * (i / Math.max(data.length - 1, 1))).toFixed(2)})`)),
        pointBorderWidth: data.map((d, i) => (i === lastIndex ? 2 : 1)),
        pointRadius: data.map((d, i) => (i === lastIndex ? 8 : 5)),
        pointHoverRadius: 9,
        order: 1,
      },
      // Um scatter com showLine (o ScatterController desenha-o; sem precisar do LineController).
      ...(trend ? [{
        label: 'Tendência',
        data: trend,
        showLine: true,
        borderColor: 'rgba(255, 255, 255, 0.45)',
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 0,
        order: 2,
      }] : []),
    ]
  }), [data, trend, lastIndex]);

  const options = useMemo(() => ({
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
        // A linha de tendência não tem tooltip; cada sessão diz a data (pedido do Rui).
        filter: (item) => item.datasetIndex === 0,
        callbacks: {
          title: (items) => {
            const p = items?.[0]?.raw;
            return p?.rawDate ? axisDate(p.rawDate, true) : '';
          },
          label: (context) => {
            const p = context.raw;
            return `${p.rawLabel || 'Sessão'}: ${formatPace(p.x)}/km @ ${p.y} bpm`;
          }
        }
      }
    },
    scales: {
      x: {
        reverse: true, // ritmo mais rápido à direita
        ticks: { display: false },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        // A FC com escala (bpm): antes só a legenda «de 128 a 165» e não se sabia o topo da base.
        ticks: { display: true, color: 'rgba(226, 232, 240, 0.7)', maxTicksLimit: 5, font: { size: 10 }, padding: 4, callback: (v) => `${Math.round(v)}` },
        border: { display: false },
      }
    }
  }), []);

  const latest = data.length ? data[data.length - 1] : null;
  const paces = data.map(d => Number(d.paceSecondsPerKm)).filter(v => isFinite(v) && v > 0);
  const hrs = data.map(d => Number(d.avgHR)).filter(v => isFinite(v) && v > 0);

  return (
    <ChartFrame
      ready={ready}
      className={className}
      label="Eficiência aeróbica"
      info={<MetricInfo text="Cruza o teu Pace (Ritmo) com a Frequência Cardíaca Média. O objetivo é ver a nuvem de pontos descer e ir para a direita (correr mais rápido para o mesmo esforço cardíaco)." />}
      hint={data.length > 0 ? `${data.length} ${data.length === 1 ? 'sessão' : 'sessões'}${scope ? ` ${scope}` : ''}` : undefined}
      value={latest ? formatPace(latest.paceSecondsPerKm) : '—'}
      unit={latest ? `/km a ${latest.avgHR} bpm na última` : undefined}
      valueColor="var(--run)"
      axis={paces.length > 0
        ? { min: `${formatPace(Math.max(...paces))}/km`, max: `${formatPace(Math.min(...paces))}/km` }
        : undefined}
      legend={latest
        ? [
          { label: `Última · ${axisDate(latest.date)}`, color: 'var(--run)' },
          ...(data.length > 1 ? [{ label: 'Anteriores (mais claras, mais antigas)', color: `rgba(${RUN_RGB}, 0.4)` }] : []),
          ...(trend ? [{ label: 'Tendência', color: 'rgba(255, 255, 255, 0.6)', shape: 'dash' }] : []),
        ]
        : []}
      height={200}
      explain={data.length ? {
        title: 'Eficiência aeróbica',
        period: `${data.length} ${data.length === 1 ? 'sessão' : 'sessões'}${scope ? ` ${scope}` : ''}, de ${axisDate(data[0].date)} a ${axisDate(latest.date)}`,
        series: [
          { label: 'Ritmo', values: data.map((d) => d.paceSecondsPerKm), format: (v) => `${formatPace(v)}/km` },
          { label: 'FC média', unit: 'bpm', values: data.map((d) => d.avgHR), decimals: 0 },
        ],
        note: 'Cada ponto é uma sessão: ritmo na horizontal (mais rápido à direita), FC na vertical.',
      } : undefined}
      footer={(
        <>
          <span className="block" data-testid="scatter-better" style={{ color: 'var(--text-3)' }}>Melhor ↘: mais rápido (para a direita) com a FC mais baixa (para baixo).</span>
          <span className="block">Ritmo no eixo horizontal; FC média em bpm na vertical{hrs.length ? ` (de ${Math.min(...hrs)} a ${Math.max(...hrs)})` : ''}.</span>
        </>
      )}
    >
      <Scatter data={chartData} options={options} updateMode="period" />
    </ChartFrame>
  );
}
