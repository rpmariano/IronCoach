import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useRevealAnimation } from '../../utils/useRevealAnimation';
import { useCountUp } from '../../utils/useCountUp';
import { DUR_COUNT_REVEAL } from '../../utils/introAnimations';
import { fmtNumber } from '../../utils/dashboardVerdicts';

/**
 * PillarSummaryCard — Card compacto para os 4 pilares do dashboard.
 * Props:
 *   title: string
 *   icon: nó React — o ícone lucide do módulo, já na cor do módulo.
 *     Era um emoji (🏃 🏋️ 🥗 👤); saiu no ponto 3 do redesenho, que pede
 *     "remover emoji dos pilares do Dashboard".
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

/* Cor do badge por significado (ponto 3). O "yellow" era âmbar
   (bg-amber-100/text-amber-800) — o âmbar é da prova; atenção é coral.
   Sobre a tinta a 16% o texto é a própria cor. */
const BADGE_COLORS = {
  green: { background: 'var(--tint-ok-bg)', color: 'var(--ok)' },
  yellow: { background: 'var(--tint-warn-bg)', color: 'var(--warn)' },
  red: { background: 'var(--tint-danger-bg)', color: 'var(--danger)' },
  blue: { background: 'var(--tint-coach-bg)', color: 'var(--coach)' },
  neutral: { background: 'rgba(255,255,255,.06)', color: 'var(--text-4)' },
};

/* 2026-10-04 (F5, animação ao ficar visível — plano §2.1, ponto 5): o KPI
   conta de zero ao valor quando o cartão fica à vista com o separador assente
   (DUR_COUNT_REVEAL, 800 ms) e volta a zero ao rearmar, como o número grande
   dos gráficos. O `kpi` chega já formatado ("32,4", "1,2k", "85%", "—"):
   separa-se o número do resto ("k", "%") e só os frames do meio são
   formatados aqui — o valor final é sempre o texto que o ecrã passou. Um KPI
   que não começa por número ("—") não conta.
   2026-10-04 (revisão): o número só leva espaços como separador de milhares
   ("1 850") e o resto tem de ser vazio, "k", "%" ou começar por espaço
   ("5 dias"). Antes "5:41" passava como 5 + ":41" (contava "1:41", "2:41"…)
   e em "5 dias" o espaço ia para o número e o zero mostrava "0dias". */
const KPI_NUMBER = /^(\d+(?:\s\d{3})*(?:[.,]\d+)?)(|[k%]|\s.*)$/i;

function parseKpi(kpi) {
  const m = typeof kpi === 'string' ? KPI_NUMBER.exec(kpi.trim()) : null;
  if (!m) return null;
  const numeric = Number(m[1].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return null;
  const dec = /[.,](\d+)$/.exec(m[1]);
  return { numeric, decimals: dec ? dec[1].length : 0, suffix: m[2] };
}

/** `key={playKey}` no sítio de uso: remonta a cada reveal e recomeça a contagem. */
function KpiValue({ kpi, parsed, animate, zero }) {
  const current = useCountUp(parsed ? parsed.numeric : NaN, { animate: !!parsed && animate, duration: DUR_COUNT_REVEAL });
  if (!parsed) return kpi;
  if (zero) {
    return (
      <>
        <span aria-hidden="true">{fmtNumber(0, parsed.decimals)}{parsed.suffix}</span>
        <span className="sr-only">{kpi}</span>
      </>
    );
  }
  // A meio da contagem formata-se; no fim (ou sem animar) é o texto original.
  return current === parsed.numeric ? kpi : `${fmtNumber(current, parsed.decimals)}${parsed.suffix}`;
}

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
  const badgeStyle = BADGE_COLORS[badge?.color] || BADGE_COLORS.neutral;

  const reveal = useRevealAnimation();
  // Só dentro do carrossel da Evolução e sem reduced-motion; fora, como era.
  const motion = reveal.active === true && !reveal.reduced;
  const zero = motion && (reveal.seen === false || reveal.armed === true);
  const parsed = useMemo(() => parseKpi(kpi), [kpi]);

  return (
    <button
      ref={motion ? reveal.ref : undefined}
      onClick={onClick}
      className="bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-3 min-h-[44px] shadow-[0_8px_20px_rgba(0,0,0,0.2),inset_0_1px_6px_rgba(255,255,255,0.4)] text-left w-full active:scale-[0.97] transition-transform"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center leading-none shrink-0">{icon}</span>
          <span className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-wider">{title}</span>
        </div>
        <ChevronRight size={12} className="text-[var(--text-3)]" />
      </div>

      {/* KPI */}
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-xl font-black text-white leading-none">
          <KpiValue key={reveal.playKey} kpi={kpi} parsed={parsed} animate={motion && !!reveal.animate} zero={zero} />
        </span>
        {kpiUnit && <span className="text-[11px] text-[var(--text-3)] font-semibold">{kpiUnit}</span>}
      </div>

      {/* Badge + delta */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        {badge && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md" style={badgeStyle}>
            {badge.label}
          </span>
        )}
        {/* 12,5px: ver nota em RaceReadinessCard — a variação é um dado que
            se lê de relance, não uma etiqueta. */}
        {delta && (
          <span className="text-[12.5px] text-[var(--text-3)] font-medium">{delta}</span>
        )}
      </div>

      {/* Subtítulo — sempre visível, ocupa o espaço que era do sparkline */}
      {subtitle && (
        <p className="text-[11px] text-[var(--text-3)] font-medium leading-snug">{subtitle}</p>
      )}
    </button>
  );
}
