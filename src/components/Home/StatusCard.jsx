import React from 'react';
import { Camera, Utensils, ChevronRight, CalendarDays } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import { Orbit } from '../shared/Orbit';
import NeonRing, { NeonRingValue } from '../shared/NeonRing';
import { useRevealAnimation } from '../../utils/useRevealAnimation';

/* "Como estou" — a órbita de nutrição do dia, só leitura (mock "Início").
   O registo de água saiu daqui para o FAB. `empty` é o primeiro dia: anéis
   tracejados e o convite a registar a primeira refeição.

   Desde 2026-09-15 é também aqui que vivem as refeições que a Carol sugere
   para hoje: estavam em "O que faço hoje", um dia de cada vez dentro do
   carrossel, e o que elas dizem é sobre a nutrição do dia — pertencem ao pé
   dos anéis. `mealsModel` é o que mealsForDay() devolve (null quando a
   Carol não sugeriu nada para hoje: a linha simplesmente não aparece, sem
   estado vazio nenhum a ocupar o cartão). */
/* Desde o bug #51 (2026-10-03): um anel neon por macro, com o objetivo do
   dia por baixo, e a água numa barra (homeModels.buildNutritionGauges). "Ver
   dias anteriores" abre a Nutrição na vista Dia, em ontem — o pedido era
   saber o objetivo de ontem e se foi atingido. */
export default function StatusCard({ gauges, empty = false, onRegisterMeal, mealsModel = null, onOpenMeals, onOpenHistory }) {
  /* Ponto 9: anéis a desenharem-se e valores a contar quando a órbita
     aparece no ecrã, e outra vez sempre que se volta ao Início
     (useRevealAnimation, 2026-09-13). */
  const reveal = useRevealAnimation();

  if (empty) {
    return (
      <div className="flex flex-col items-center text-center rounded-[24px]" style={{ background: 'rgba(255,255,255,.04)', border: '1px dashed rgba(255,255,255,.18)', padding: '22px 18px' }} data-testid="status-card-empty">
        <Orbit empty size={104} />
        <p className="text-[12.5px] leading-[1.55] mt-3.5 max-w-[250px]" style={{ color: 'var(--text-4)' }}>
          Os anéis enchem-se com o teu primeiro registo. Uma refeição chega para eu perceber como comes.
        </p>
        <button type="button" onClick={onRegisterMeal} className="inline-flex items-center gap-2 min-h-[44px] mt-3.5 px-[18px] rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'rgba(199,125,255,.14)', border: '1px solid rgba(199,125,255,.4)', color: 'var(--nutrition)' }}>
          <Camera size={15} /> Registar refeição
        </button>
      </div>
    );
  }
  return (
    <GlassCard padding="14px 16px" data-testid="status-card">
      <div ref={reveal.ref} style={reveal.style}>
        <div className="grid grid-cols-4 gap-1.5" data-testid="status-card-rings">
          {gauges.macros.map((m, i) => (
            <div key={`${m.key}-${reveal.playKey}`} data-testid={`ring-${m.key}`} className="flex flex-col items-center text-center min-w-0">
              <NeonRing value={m.value} target={m.target} color={m.color} animate={reveal.animate} index={i}>
                <span className="text-[14px] font-black" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                  <NeonRingValue value={m.value} animate={reveal.animate} />
                </span>
              </NeonRing>
              <span className="text-[10.5px] font-extrabold uppercase mt-1.5 whitespace-nowrap" style={{ color: 'var(--text-3)', letterSpacing: 'var(--tracking-label)' }}>{m.label}</span>
              <span className="text-[11px] font-bold whitespace-nowrap" style={{ color: 'var(--text-4)', fontVariantNumeric: 'tabular-nums' }}>/ {m.target.toLocaleString('pt-PT')} {m.unit}</span>
            </div>
          ))}
        </div>

        <div className="mt-3.5" data-testid="status-card-water">
          <div className="flex items-baseline justify-between">
            <span className="text-[10.5px] font-extrabold uppercase" style={{ color: 'var(--text-3)', letterSpacing: 'var(--tracking-label)' }}>{gauges.water.label}</span>
            <span className="text-[13px] font-black" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
              {gauges.water.display} <span className="text-[11px] font-bold" style={{ color: 'var(--text-4)' }}>/ {gauges.water.targetDisplay} {gauges.water.unit}</span>
            </span>
          </div>
          <div className="h-[6px] rounded-full overflow-hidden mt-1.5" style={{ background: 'rgba(61,139,255,.14)' }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, gauges.water.target > 0 ? (gauges.water.value / gauges.water.target) * 100 : 0)}%`, background: gauges.water.color, boxShadow: `0 0 8px ${gauges.water.color}` }} />
          </div>
        </div>
      </div>
      {onOpenHistory && (
        <button type="button" data-testid="status-card-history" onClick={onOpenHistory} className="flex items-center justify-between w-full min-h-[44px] mt-2 text-left text-[12px] font-bold" style={{ color: 'var(--text-3)', borderTop: '1px solid rgba(255,255,255,.09)' }}>
          <span className="flex items-center gap-2">
            <CalendarDays size={15} style={{ color: 'var(--neon-kcal)' }} className="shrink-0" />
            Ver dias anteriores — o objetivo e se o atingiste
          </span>
          <ChevronRight size={15} style={{ color: 'var(--text-4)' }} className="shrink-0" />
        </button>
      )}
      {mealsModel && (
        <button type="button" data-testid="status-card-meals" onClick={() => onOpenMeals?.()} className="flex items-center justify-between w-full min-h-[44px] mt-2 text-left text-[12px] font-bold" style={{ color: 'var(--text-3)', borderTop: '1px solid rgba(255,255,255,.09)' }}>
          <span className="flex items-center gap-2">
            <Utensils size={15} style={{ color: 'var(--gym)' }} className="shrink-0" />
            O que a Carol sugere comer hoje
          </span>
          <ChevronRight size={15} style={{ color: 'var(--text-4)' }} className="shrink-0" />
        </button>
      )}
    </GlassCard>
  );
}
