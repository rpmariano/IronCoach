import React from 'react';
import { Camera, Utensils, ChevronRight } from 'lucide-react';
import GlassCard from '../shared/GlassCard';
import { Orbit, OrbitLegend } from '../shared/Orbit';
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
export default function StatusCard({ rings, empty = false, onRegisterMeal, mealsModel = null, onOpenMeals }) {
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
      <div className="flex items-center gap-4" ref={reveal.ref} style={reveal.style}>
        <div className="shrink-0" style={{ width: 116, height: 116 }}><Orbit key={reveal.playKey} rings={rings} size={116} animate={reveal.animate} /></div>
        <OrbitLegend key={`l${reveal.playKey}`} rings={rings} animate={reveal.animate} />
      </div>
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
