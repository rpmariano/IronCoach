import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Sparkles, Check, X, Calendar, Target } from 'lucide-react';
import { buildPlanDays, diffDaysISO, PlanDayCard } from '../Home/WeeklyPlanCard';

const GOAL_LABELS = {
  calorie_goal: { label: 'Calorias', unit: 'kcal/dia' },
  protein_goal: { label: 'Proteína', unit: 'g/dia' },
  carbs_goal: { label: 'Hidratos de Carbono', unit: 'g/dia' },
  fat_goal: { label: 'Gordura', unit: 'g/dia' },
  water_goal_ml: { label: 'Água', unit: 'ml/dia' },
  goal_weight_kg: { label: 'Peso Alvo', unit: 'kg' },
  goal_body_fat_pct: { label: 'Gordura Corporal Alvo', unit: '%' },
  goal_muscle_mass_kg: { label: 'Massa Muscular Alvo', unit: 'kg' },
};

export function PlanProposalBottomSheet({
  plan,
  items = [],
  goalProposal,
  profile,
  onRespondPlan,
  onRespondGoal,
  onClose,
}) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const touchStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const scrollRef = useRef(null);
  const dragAreaRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleDismiss = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onCloseRef.current?.();
    }, 500);
  };

  useEffect(() => {
    const el = dragAreaRef.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      touchStartY.current = e.touches[0].clientY;
      isDraggingRef.current = true;
      setIsDragging(true);
    };

    const handleTouchMove = (e) => {
      if (!isDraggingRef.current) return;
      const currentY = e.touches[0].clientY;
      const deltaY = currentY - touchStartY.current;
      const isAtTop = !scrollRef.current || scrollRef.current.scrollTop <= 0;

      if (deltaY > 0 && isAtTop) {
        if (e.cancelable) e.preventDefault(); // CANCELA PULL-TO-REFRESH DO BROWSER
        dragYRef.current = deltaY;
        setDragY(deltaY);
      } else if (deltaY < 0 && dragYRef.current > 0) {
        if (e.cancelable) e.preventDefault();
        const nextVal = Math.max(0, deltaY);
        dragYRef.current = nextVal;
        setDragY(nextVal);
      }
    };

    const handleTouchEnd = () => {
      if (dragYRef.current > 60) {
        handleDismiss();
      } else {
        setDragY(0);
      }
      dragYRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    const handleTouchCancel = () => {
      setDragY(0);
      dragYRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, []);

  if (!plan && !goalProposal) return null;

  const planItems = useMemo(() => (items || []).filter(i => plan && i.plan_id === plan.id), [items, plan?.id]);
  const days = useMemo(
    () => {
      if (!plan) return [];
      return buildPlanDays(planItems, plan.period_start, diffDaysISO(plan.period_start, plan.period_end) + 1).filter(d => d.items.length > 0);
    },
    [planItems, plan?.period_start, plan?.period_end],
  );

  const handleRespondPlanAction = (accept) => {
    if (plan && onRespondPlan) {
      onRespondPlan(plan.id, accept);
    }
    handleDismiss();
  };

  const handleRespondGoalAction = (accept) => {
    if (goalProposal && onRespondGoal) {
      onRespondGoal(goalProposal.id, accept);
    }
    handleDismiss();
  };

  const sheetTransform = isClosing
    ? 'translateY(100%)'
    : dragY > 0
    ? `translateY(${dragY}px)`
    : 'translateY(0%)';

  const sheetTransition = isDragging
    ? 'none'
    : 'transform 0.5s ease-in-out';

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Overlay escuro com Backdrop Blur */}
      <div 
        className={`fixed inset-0 bg-black/[0.01] backdrop-blur-sm transition-all duration-500 ease-in-out ${
          isClosing ? 'opacity-0 backdrop-blur-none' : 'opacity-100 animate-bottom-sheet-overlay'
        }`}
        onClick={handleDismiss}
        aria-hidden="true"
      />

      {/* Modal Bottom Sheet (Persiana) */}
      <div 
        ref={dragAreaRef}
        className="relative z-10 w-full max-h-[85vh] flex flex-col rounded-t-[28px] border-t border-slate-200 bg-white shadow-2xl overflow-hidden"
        style={{
          transform: sheetTransform,
          transition: sheetTransition,
          overscrollBehavior: 'contain',
        }}
      >
        {/* Zona de Arrasto Superior (Pega + Cabeçalho) */}
        <div className="touch-none select-none shrink-0" style={{ touchAction: 'none' }}>
          {/* Pega / Grab Handle — Tocar no traço ou deslizar para baixo fecha o modal */}
          <div 
            onClick={handleDismiss}
            className="w-full py-3 cursor-pointer flex flex-col items-center justify-center group tap-44"
            title="Toca para fechar persiana"
            role="button"
            aria-label="Fechar persiana"
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 transition-colors mb-1" />
            <span className="text-[10px] text-slate-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">Toca para fechar</span>
          </div>

          {/* Cabeçalho inspirado em RunRegistration (sem bloco verde) */}
          <div className="flex items-center justify-between gap-2 px-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: 'var(--mod-coach-to)' }} />
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  {plan && goalProposal ? 'Proposta de Plano & Objetivos' : plan ? 'Nova Proposta de Plano' : 'Proposta de Objetivos'}
                </h2>
                {plan && (
                  <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1 font-medium">
                    <Calendar size={10} style={{ color: 'var(--mod-coach-to)' }} />
                    <span>Período: {plan.period_start} a {plan.period_end}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Botão Cancelar (voltar ao chat) */}
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 active:scale-95 transition-all shrink-0"
              title="Voltar ao chat"
              aria-label="Voltar ao chat"
            >
              Cancelar
            </button>
          </div>
        </div>
        {/* Conteúdo Scrollável */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-5 no-scrollbar bg-slate-50/30">
          {/* Seção 1: Proposta de Objetivos Independente */}
          {goalProposal && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-500 shrink-0" />
                <h4 className="text-sm font-bold text-slate-800">Proposta de Alteração de Objetivos</h4>
              </div>

              {goalProposal.rationale && (
                <p className="text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
                  💡 {goalProposal.rationale}
                </p>
              )}

              <div className="space-y-1.5">
                {Object.entries(goalProposal.goals || {})
                  .filter(([k]) => !k.endsWith('_set_by_coach'))
                  .map(([k, newVal]) => {
                    const meta = GOAL_LABELS[k] || { label: k, unit: '' };
                    const currentVal = profile?.[k] ?? '—';
                    return (
                      <div key={k} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 text-xs border border-slate-100">
                        <span className="text-slate-600 font-medium">{meta.label}</span>
                        <div className="flex items-center gap-2 font-bold">
                          <span className="text-slate-400 line-through">{currentVal} {meta.unit}</span>
                          <span style={{ color: 'var(--mod-coach-to)' }}>→ {newVal} {meta.unit}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleRespondGoalAction(true)}
                  className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm hover:opacity-90"
                  style={{ backgroundColor: 'var(--mod-coach-to)' }}
                >
                  <Check size={15} /> Aceitar Objetivos
                </button>
                <button
                  type="button"
                  onClick={() => handleRespondGoalAction(false)}
                  className="py-2.5 px-3 rounded-xl font-semibold text-xs text-slate-500 hover:text-rose-500 bg-white border border-slate-200 flex items-center justify-center gap-1 transition active:scale-95"
                >
                  <X size={14} /> Recusar
                </button>
              </div>
            </div>
          )}

          {/* Seção 2: Proposta de Plano (Treino / Refeições) */}
          {plan && (
            <div className="space-y-4 pb-4">
              {plan.summary && (
                <div
                  className="p-3.5 rounded-2xl border text-xs leading-relaxed font-medium"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--mod-coach-to) 20%, transparent)',
                    color: 'var(--mod-coach-to)'
                  }}
                >
                  ✨ {plan.summary}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                  Sessões / Refeições Planeadas ({days.length} dias)
                </p>
                {days.map(day => (
                  <PlanDayCard
                    key={day.dateISO}
                    dateISO={day.dateISO}
                    dayNumber={day.dayNumber}
                    items={day.items}
                    isToday={false}
                    isOverdue={false}
                    readOnly
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Fixo para Plano (se houver plano) */}
        {plan && (
          <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleRespondPlanAction(true)}
              className="flex-1 py-3.5 px-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              }}
            >
              <Check size={18} />
              Aceitar Plano
            </button>

            <button
              type="button"
              onClick={() => handleRespondPlanAction(false)}
              className="py-3.5 px-4 rounded-2xl font-semibold text-sm text-slate-600 hover:text-rose-600 bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <X size={16} />
              Recusar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlanProposalBottomSheet;
