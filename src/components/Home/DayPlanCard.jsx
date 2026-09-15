import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Check, Utensils, MessageCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { computeAcceptedWindow, buildPlanDays } from './WeeklyPlanCard';
import { formatDayLabel, dayTitle, dayStatus, pendingSession, mealsForDay, isRacePlanItem, raceForDate } from '../../utils/homeModels';
import { useCarouselHaptics } from '../../utils/haptics';
import GlassCard from '../shared/GlassCard';
import CarouselDots from '../shared/CarouselDots';

/* "O que faço hoje" — o plano do dia (mock "Início"): carrossel de dias com
   setas de 44px, badge de estado, o treino do dia em título, um botão
   "Registar sessão" e a pré-visualização das refeições sugeridas com
   "Ver as N" a abrir a persiana. Aceitar/recusar propostas continua no chat
   (specs/plano-de-treino.md); aqui é consulta e execução.

   Bug 2026-09-14: este cartão nasceu (redesenho 6c) só com as setas e os
   pontos — o WeeklyPlanCard.jsx que substituiu já deslizava com o dedo
   (.tab-swipe-carousel + useCarouselHaptics, ver globals.css), mas isso
   nunca foi portado para aqui. Agora o corpo do dia (título/botões/
   refeições) é uma página por dia dentro do mesmo carrossel com snap nativo
   — as setas e os pontos continuam a existir, e passam a chamar `scrollTo`
   em vez de só mudar o índice, para o gesto e os toques ficarem em sintonia
   e os dois disparem o mesmo tique tátil (triggerCarouselTick). */

const arrowStyle = { width: 44, height: 44, color: 'var(--gym)' };

/* Sem o Badge "Hoje" (o rótulo da secção já diz "O que faço hoje"): o
   estado do dia colore a própria data — --gym por fazer, --ok só quando de
   facto está feito, --warn em atraso, âmbar no dia da prova. */
function dateColor(status) {
  if (status.tone === 'race') return 'var(--race)';
  if (status.label === 'Concluído') return 'var(--ok)';
  if (status.tone === 'warn') return 'var(--warn)';
  return 'var(--gym)';
}

/* O corpo de um dia — título, "Registar sessão"/"Abrir a prova" e a
   pré-visualização das refeições. Uma página do carrossel (.tab-swipe-page,
   ver globals.css); o cabeçalho (setas/etiqueta/badge) fica fora, partilhado
   pelas várias páginas, porque acompanha o dia ATIVO, não cada um. */
function DayPlanPage({ day, raceEvents, onComplete, onOpenMeals, onOpenRace }) {
  /* O dia da prova (specs/plano-de-prova.md): o plano tem lá um item
     `corrida` com `training_type = 'prova'` e a agenda tem a prova. O nome
     vem da agenda — o item do plano não o guarda — e o botão leva ao hub,
     que é onde a prova se prepara e se regista. */
  const race = (day.items || []).find((i) => i.isRace);
  const racePlanItem = (day.items || []).find(isRacePlanItem);
  const dayRace = raceForDate(raceEvents, day.dateISO);
  const openRaceId = race ? String(race.id).replace('race-', '') : (racePlanItem && dayRace ? dayRace.id : null);
  const session = pendingSession(day, todayISO());
  const meals = mealsForDay(day.items);

  return (
    <div className="tab-swipe-page">
      <h2 className="text-[20px] font-black leading-[1.15] mt-[5px]" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>
        {race ? race.title : dayTitle(day.items, dayRace?.name || null)}
      </h2>

      {session && (
        <button type="button" onClick={() => onComplete?.(session)} className="w-full inline-flex items-center justify-center gap-[7px] min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'rgba(52,211,153,.16)', border: '1px solid rgba(52,211,153,.4)', color: 'var(--ok)' }}>
          <Check size={15} /> Registar sessão
        </button>
      )}
      {openRaceId && !session && (
        <button type="button" data-testid="day-plan-open-race" onClick={() => onOpenRace?.(openRaceId)} className="w-full inline-flex items-center justify-center gap-[7px] min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
          Abrir a prova
        </button>
      )}

      {meals && (
        <div className="mt-3 pt-[11px]" style={{ borderTop: '1px solid rgba(255,255,255,.09)' }}>
          <button type="button" onClick={() => onOpenMeals?.(day)} className="flex items-center justify-between gap-2 w-full min-h-[44px] -my-2 text-left">
            <span className="flex items-center gap-2">
              <Utensils size={16} style={{ color: 'var(--gym)' }} />
              <span className="text-[13px] font-bold whitespace-nowrap" style={{ color: 'var(--text-2)' }}>Refeições sugeridas</span>
            </span>
            <span className="inline-flex items-center gap-[3px] text-[11.5px] font-bold whitespace-nowrap" style={{ color: 'var(--coach)' }}>
              {meals.meals.length > 1 ? `Ver as ${meals.meals.length}` : 'Ver'} <ChevronDown size={13} />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function DayPlanCard({ plans = [], planItems = [], raceEvents = [], onComplete, onNav, onOpenMeals, onOpenRace }) {
  const today = todayISO();
  const pendingCount = useMemo(() => (plans || []).filter((p) => p.status === 'proposto').length, [plans]);
  const window = useMemo(() => computeAcceptedWindow(plans, planItems, today), [plans, planItems, today]);
  const days = useMemo(() => {
    if (!window) return [];
    const acceptedIds = new Set((plans || []).filter((p) => p.status === 'aceite').map((p) => p.id));
    return buildPlanDays((planItems || []).filter((i) => acceptedIds.has(i.plan_id)), window.start, window.days);
  }, [plans, planItems, window]);

  const todayIdx = Math.max(0, days.findIndex((d) => d.isToday));
  const [index, setIndex] = useState(todayIdx);
  const safeIndex = Math.min(index, Math.max(0, days.length - 1));
  const day = days[safeIndex];

  const scrollRef = useRef(null);
  const { handleScroll, handleTouchMove, scrollTo } = useCarouselHaptics(scrollRef, days.length, safeIndex, setIndex);

  // Posiciona o carrossel no dia certo à primeira renderização — o plano
  // pode ter começado antes de hoje, e o scroll nativo nasce sempre a 0.
  // Sem "instant" o cartão abria a deslizar visivelmente do dia 1 até hoje.
  const positionedRef = useRef(false);
  useEffect(() => {
    if (!positionedRef.current && days.length > 0) {
      scrollTo(safeIndex, true);
      positionedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  const adapt = () => {
    useAppStore.getState().setCoachIntent('adapt_plan');
    onNav?.('coach');
  };

  const PendingBanner = () => pendingCount > 0 && (
    <button type="button" onClick={() => onNav?.('coach')} className="flex items-center gap-2 w-full min-h-[44px] px-3 rounded-[14px] text-left" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}>
      <MessageCircle size={14} style={{ color: 'var(--coach)' }} className="shrink-0" />
      <span className="flex-1 text-[12.5px] font-semibold" style={{ color: 'var(--coach-soft)' }}>
        {pendingCount === 1 ? 'Tens 1 proposta da Carol por rever' : `Tens ${pendingCount} propostas da Carol por rever`}
      </span>
      <ChevronRight size={14} style={{ color: 'var(--coach)' }} className="shrink-0" />
    </button>
  );

  if (!window || !day) {
    return (
      <div className="flex flex-col gap-2">
        <PendingBanner />
        <GlassCard tone="gym" glow>
          <h2 className="text-[20px] font-black leading-[1.15]" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>Sem plano acordado</h2>
          <p className="text-[12.5px] leading-[1.45] mt-1.5" style={{ color: 'var(--text-3)' }}>
            Pede-me um plano. As propostas aparecem no chat, para aceitares ou recusares.
          </p>
          <button type="button" onClick={() => onNav?.('coach')} className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
            <MessageCircle size={15} /> Pedir plano à Carol
          </button>
        </GlassCard>
      </div>
    );
  }

  const status = dayStatus(day, today);

  return (
    <div className="flex flex-col gap-2">
      <PendingBanner />
      <GlassCard tone="gym" glow padding={0} data-testid="day-plan-card">
        {/* A navegação do dia numa faixa própria, a toda a largura — é isto
            que separa "navegar entre dias" de "o dia" (por isso o padding
            do GlassCard sai daqui e passa para o corpo, logo abaixo). */}
        <div className="flex items-center justify-between gap-2" style={{ padding: '6px 10px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <button type="button" aria-label="Dia anterior" disabled={safeIndex === 0} onClick={() => scrollTo(safeIndex - 1)} className="flex items-center justify-center rounded-full disabled:opacity-30" style={arrowStyle}>
            <ChevronLeft size={17} />
          </button>
          <span data-testid="day-plan-date" className="text-[11.5px] font-extrabold uppercase whitespace-nowrap" style={{ color: dateColor(status), letterSpacing: '.06em' }}>{formatDayLabel(day.dateISO)}</span>
          <button type="button" aria-label="Dia seguinte" disabled={safeIndex >= days.length - 1} onClick={() => scrollTo(safeIndex + 1)} className="flex items-center justify-center rounded-full disabled:opacity-30" style={arrowStyle}>
            <ChevronRight size={17} />
          </button>
        </div>

        <div style={{ padding: '12px 16px 14px' }}>
          {/* Um dia por página, com snap nativo — desliza tal como os outros
              carrosséis do Início/Dashboard (.tab-swipe-carousel, ver
              globals.css), e useCarouselHaptics dá o tique tátil a cada
              mudança, seja por gesto, seta ou ponto. */}
          <div ref={scrollRef} onScroll={handleScroll} onTouchMove={handleTouchMove} className="tab-swipe-carousel">
            {days.map((d) => (
              <DayPlanPage key={d.dateISO} day={d} raceEvents={raceEvents} onComplete={onComplete} onOpenMeals={onOpenMeals} onOpenRace={onOpenRace} />
            ))}
          </div>

          <div className="flex items-center justify-between mt-2 -mb-2">
            {days.length > 1 ? (
              <div className="flex items-center min-h-[44px]"><CarouselDots count={days.length} currentIndex={safeIndex} onSelect={scrollTo} ariaLabelPrefix="Ver dia" /></div>
            ) : <span />}
            <button type="button" onClick={adapt} className="min-h-[44px] text-[11.5px] font-bold" style={{ color: 'var(--text-4)' }}>Adaptar plano</button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
