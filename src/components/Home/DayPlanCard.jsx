import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Check, Utensils, MessageCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { computeAcceptedWindow, buildPlanDays } from './WeeklyPlanCard';
import { formatDayLabel, dayTitle, dayStatus, pendingSession, mealsForDay, previewMeal } from '../../utils/homeModels';
import GlassCard from '../shared/GlassCard';
import CarouselDots from '../shared/CarouselDots';

/* "O que faço hoje" — o plano do dia (mock "Início"): carrossel de dias com
   setas de 44px, badge de estado, o treino do dia em título, um botão
   "Registar sessão" e a pré-visualização das refeições sugeridas com
   "Ver as N" a abrir a persiana. Aceitar/recusar propostas continua no chat
   (specs/plano-de-treino.md); aqui é consulta e execução. */

const BADGE = {
  ok: { color: 'var(--ok)', bg: 'rgba(52,211,153,.14)', bd: 'rgba(52,211,153,.38)' },
  warn: { color: 'var(--warn)', bg: 'var(--tint-warn-bg)', bd: 'var(--tint-warn-bd)' },
  race: { color: 'var(--race)', bg: 'var(--tint-race-bg)', bd: 'var(--tint-race-bd)' },
  neutral: { color: 'var(--text-3)', bg: 'rgba(255,255,255,.06)', bd: 'rgba(255,255,255,.14)' },
};

function Badge({ tone, children }) {
  const s = BADGE[tone] || BADGE.neutral;
  return (
    <span className="text-[11px] font-extrabold whitespace-nowrap rounded-full" style={{ color: s.color, background: s.bg, border: `1px solid ${s.bd}`, padding: '3px 9px' }}>
      {children}
    </span>
  );
}

const arrowStyle = { width: 44, height: 44, color: 'var(--gym)' };

export default function DayPlanCard({ plans = [], planItems = [], onComplete, onNav, onOpenMeals, onOpenRace }) {
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
  const session = pendingSession(day, today);
  const race = (day.items || []).find((i) => i.isRace);
  const meals = mealsForDay(day.items);
  const preview = previewMeal(meals);

  return (
    <div className="flex flex-col gap-2">
      <PendingBanner />
      <GlassCard tone="gym" glow data-testid="day-plan-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <button type="button" aria-label="Dia anterior" disabled={safeIndex === 0} onClick={() => setIndex(safeIndex - 1)} className="flex items-center justify-center rounded-full -ml-3 disabled:opacity-30" style={arrowStyle}>
              <ChevronLeft size={17} />
            </button>
            <span className="text-[11px] font-extrabold uppercase whitespace-nowrap" style={{ color: 'var(--gym)', letterSpacing: '.05em' }}>{formatDayLabel(day.dateISO)}</span>
            <button type="button" aria-label="Dia seguinte" disabled={safeIndex >= days.length - 1} onClick={() => setIndex(safeIndex + 1)} className="flex items-center justify-center rounded-full disabled:opacity-30" style={arrowStyle}>
              <ChevronRight size={17} />
            </button>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <h2 className="text-[20px] font-black leading-[1.15] mt-[5px]" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>
          {race ? race.title : dayTitle(day.items)}
        </h2>

        {session && (
          <button type="button" onClick={() => onComplete?.(session)} className="w-full inline-flex items-center justify-center gap-[7px] min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'rgba(52,211,153,.16)', border: '1px solid rgba(52,211,153,.4)', color: 'var(--ok)' }}>
            <Check size={15} /> Registar sessão
          </button>
        )}
        {race && !session && (
          <button type="button" onClick={() => onOpenRace?.(race.id.replace('race-', ''))} className="w-full inline-flex items-center justify-center gap-[7px] min-h-[44px] mt-3 rounded-[11px] text-[12.5px] font-extrabold" style={{ background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)' }}>
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
              <span className="inline-flex items-center gap-[3px] text-[11.5px] font-bold whitespace-nowrap" style={{ color: '#7dd3fc' }}>
                {meals.meals.length > 1 ? `Ver as ${meals.meals.length}` : 'Ver'} <ChevronDown size={13} />
              </span>
            </button>
            {preview && (
              <div className="flex items-baseline gap-[9px] mt-[9px]">
                <span className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '.05em', flex: '0 0 66px' }}>{preview.label}</span>
                <span className="flex-1 text-[12.5px] leading-[1.45]" style={{ color: 'var(--text-3)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{preview.texto}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 -mb-2">
          {days.length > 1 ? (
            <div className="flex items-center min-h-[44px]"><CarouselDots count={days.length} currentIndex={safeIndex} onSelect={setIndex} ariaLabelPrefix="Ver dia" /></div>
          ) : <span />}
          <button type="button" onClick={adapt} className="min-h-[44px] text-[11.5px] font-bold" style={{ color: 'var(--text-4)' }}>Adaptar plano</button>
        </div>
      </GlassCard>
    </div>
  );
}
