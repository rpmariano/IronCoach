import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import '../../lib/chartSetup';
import { ChevronRight } from 'lucide-react';

/**
 * PillarSummaryCard — Card compacto para os 4 pilares do dashboard.
 * Props:
 *   title: string
 *   icon: string (emoji)
 *   kpi: string — valor principal (ex: "32.4 km", "74.2 kg")
 *   kpiUnit: string — unidade opcional
 *   badge: { label: string, color: 'green'|'yellow'|'red'|'blue'|'neutral' }
 *   delta: string — ex: "+5%", "-0.3kg/sem"
 *   sparkData: number[] — últimos 7 pontos para sparkline
 *   sparkType: 'bar' | 'line'
 *   sparkColor: string — hex color
 *   onClick: function
 *   subtitle: string — linha descritiva opcional
 */

const BADGE_COLORS = {
  green: 'bg-emerald-100 text-emerald-800',
  yellow: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-800',
  blue: 'bg-sky-100 text-sky-800',
  neutral: 'bg-slate-100 text-slate-600',
};

/**
 * Mini-gráfico de barras dos 7 dias, em CSS puro em vez de Chart.js.
 *
 * Print do utilizador (23/08): quando só 1 dos 7 dias tinha valor (ex.: os
 * 65km de Corrida todos numa única saída), o Chart.js desenhava só essa
 * barra — as outras 6, com altura zero, ficavam invisíveis — e sem eixos
 * (escondidos de propósito, para um mini-gráfico) o resultado era um
 * quadrado colorido a flutuar sozinho no cartão, sem se perceber que
 * representava "1 em 7 dias". Barras em div/CSS garantem as 7 colunas
 * sempre visíveis (as vazias com uma altura mínima), o que já se lê como
 * "semana", e evita o problema à parte de o Chart.js por vezes não
 * calcular bem o tamanho do canvas dentro de um contentor tão pequeno.
 */
function MiniBars({ data, color }) {
  const max = Math.max(...data, 0);
  return (
    <div className="h-8 w-full flex items-end gap-[3px]">
      {data.map((v, i) => {
        const pct = max > 0 && v > 0 ? Math.max((v / max) * 100, 14) : 6;
        return (
          <div
            key={i}
            className="flex-1 rounded-[2px] transition-[height]"
            style={{ height: `${pct}%`, background: v > 0 ? color : 'rgba(255,255,255,0.1)' }}
          />
        );
      })}
    </div>
  );
}

export default function PillarSummaryCard({
  title,
  icon,
  kpi,
  kpiUnit,
  badge,
  delta,
  subtitle,
  sparkData = [],
  sparkType = 'bar',
  sparkColor = '#6366f1',
  onClick,
}) {
  const hasSparkData = sparkData && sparkData.some(v => v > 0);

  // Só o tipo 'line' (tendência de peso do Corpo) ainda usa Chart.js — uma
  // linha contínua não se presta bem a "7 colunas" como o bar. Sem
  // beginAtZero: um peso à volta de 79kg com o eixo forçado a partir de 0
  // preenchia quase todo o cartão (fill:true até à base), parecendo um
  // bloco sólido em vez de uma linha de tendência — o Chart.js escala
  // agora ao intervalo real dos dados, onde a variação fica visível.
  const sparkChartData = useMemo(() => {
    if (sparkType !== 'line') return null;
    return {
      labels: sparkData.map((_, i) => i.toString()),
      datasets: [{
        data: sparkData,
        borderColor: sparkColor,
        borderWidth: 1.5,
        fill: true,
        backgroundColor: `${sparkColor}20`,
        pointRadius: 0,
        tension: 0.4,
      }],
    };
  }, [sparkData, sparkColor, sparkType]);

  const sparkOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false },
      y: { display: false },
    },
  };

  const badgeCls = BADGE_COLORS[badge?.color || 'neutral'];

  return (
    <button
      onClick={onClick}
      className="bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-3 shadow-[0_8px_20px_rgba(0,0,0,0.2),inset_0_1px_6px_rgba(255,255,255,0.4)] text-left w-full active:scale-[0.97] transition-transform"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{icon}</span>
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{title}</span>
        </div>
        <ChevronRight size={12} className="text-slate-500" />
      </div>

      {/* KPI */}
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-xl font-black text-white leading-none">{kpi}</span>
        {kpiUnit && <span className="text-[11px] text-slate-400 font-semibold">{kpiUnit}</span>}
      </div>

      {/* Badge + delta */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {badge && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badgeCls}`}>
            {badge.label}
          </span>
        )}
        {delta && (
          <span className="text-[10px] text-slate-400 font-medium">{delta}</span>
        )}
        {subtitle && !badge && (
          <span className="text-[10px] text-slate-400 font-medium">{subtitle}</span>
        )}
      </div>

      {/* Sparkline — a área fica sempre reservada, com ou sem dados, para os
          4 cartões da grelha manterem a mesma altura (ver print do
          utilizador, 23/08: Nutrição e Ginásio ficavam mais baixos que
          Corrida e Corpo sempre que não tinham dados para o mini-gráfico).
          `relative` no contentor é o que falta ao Chart.js para calcular o
          tamanho certo dentro de responsive+maintainAspectRatio:false —
          sem isto o canvas às vezes desenhava num tamanho intrínseco
          errado em vez de preencher a faixa. */}
      <div className="h-8 w-full relative">
        {hasSparkData ? (
          sparkType === 'line'
            ? <Line data={sparkChartData} options={sparkOptions} />
            : <MiniBars data={sparkData} color={sparkColor} />
        ) : (
          <div className="absolute inset-x-0 bottom-0 h-px bg-white/10" />
        )}
      </div>
    </button>
  );
}
