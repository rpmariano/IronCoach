import React from 'react';
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
 *   subtitle: string — segunda linha descritiva, sempre visível
 *   onClick: function
 *
 * Teve um mini-gráfico de 7 dias (sparkline), removido a pedido do
 * utilizador (23/08): sem eixos nem legendas, um cartão tão pequeno não dá
 * espaço para um gráfico se explicar sozinho — quando os dados eram
 * pouco distribuídos (ex.: 1 único dia com valor numa semana de 7) o
 * resultado lia-se como um bug, não como informação. `subtitle` ocupa
 * agora esse espaço com uma frase concreta em vez de um desenho.
 */

const BADGE_COLORS = {
  green: 'bg-emerald-100 text-emerald-800',
  yellow: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-800',
  blue: 'bg-sky-100 text-sky-800',
  neutral: 'bg-slate-100 text-slate-600',
};

export default function PillarSummaryCard({
  title,
  icon,
  kpi,
  kpiUnit,
  badge,
  delta,
  subtitle,
  onClick,
}) {
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
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        {badge && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badgeCls}`}>
            {badge.label}
          </span>
        )}
        {delta && (
          <span className="text-[10px] text-slate-400 font-medium">{delta}</span>
        )}
      </div>

      {/* Subtítulo — sempre visível, ocupa o espaço que era do sparkline */}
      {subtitle && (
        <p className="text-[10px] text-slate-500 font-medium leading-snug">{subtitle}</p>
      )}
    </button>
  );
}
