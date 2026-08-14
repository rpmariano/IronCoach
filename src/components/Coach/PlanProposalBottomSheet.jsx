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
  const touchStartY = useRef(0);
  const dragYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const scrollRef = useRef(null);
  const dragAreaRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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
      if (dragYRef.current > 70) {
        onCloseRef.current?.();
      }
      dragYRef.current = 0;
      setDragY(0);
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
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
    if (onClose) {
      onClose();
    }
  };

  const handleRespondGoalAction = (accept) => {
    if (goalProposal && onRespondGoal) {
      onRespondGoal(goalProposal.id, accept);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Overlay escuro com Backdrop Blur */}
      <div 
        className="fixed inset-0 bg-black/75 backdrop-blur-md animate-bottom-sheet-overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Bottom Sheet (Persiana) */}
      <div 
        className="relative z-10 w-full max-h-[85vh] flex flex-col rounded-t-[28px] border-t border-slate-700/60 shadow-2xl animate-bottom-sheet-slide overflow-hidden"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(10, 15, 29, 0.99) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Zona de Arrasto Superior (Pega + Cabeçalho) */}
        <div ref={dragAreaRef} className="touch-none select-none shrink-0" style={{ touchAction: 'none' }}>
          {/* Pega / Grab Handle — Tocar no traço ou deslizar para baixo fecha o modal */}
          <div 
            onClick={onClose}
            className="w-full py-3.5 cursor-pointer flex items-center justify-center group"
            title="Fechar modal"
          >
            <div className="w-12 h-1.5 rounded-full bg-slate-600/70 group-hover:bg-slate-400 group-active:scale-95 transition-colors" />
          </div>

          {/* Cabeçalho */}
          <div className="flex items-start justify-between px-6 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))' }}
              >
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white leading-tight">
                  {plan && goalProposal ? 'Proposta de Plano & Objetivos' : plan ? 'Nova Proposta de Plano' : 'Proposta de Objetivos'}
                </h3>
                {plan && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 font-medium">
                    <Calendar size={12} className="text-emerald-400" />
                    <span>Período: {plan.period_start} a {plan.period_end}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Botão de Fechar (Cruz) */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 -mr-1.5 -mt-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800/80 active:scale-95 transition-all shrink-0"
              title="Fechar modal"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo Scrollável */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-5 no-scrollbar">
          {/* Seção 1: Proposta de Objetivos Independente */}
          {goalProposal && (
            <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-400 shrink-0" />
                <h4 className="text-sm font-bold text-white">Proposta de Alteração de Objetivos</h4>
              </div>

              {goalProposal.rationale && (
                <p className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
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
                      <div key={k} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/50 text-xs border border-slate-800/50">
                        <span className="text-slate-300 font-medium">{meta.label}</span>
                        <div className="flex items-center gap-2 font-bold">
                          <span className="text-slate-500 line-through">{currentVal} {meta.unit}</span>
                          <span className="text-amber-400">→ {newVal} {meta.unit}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                <button
                  type="button"
                  onClick={() => handleRespondGoalAction(true)}
                  className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-slate-950 bg-amber-400 hover:bg-amber-300 flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md"
                >
                  <Check size={15} /> Aceitar Objetivos
                </button>
                <button
                  type="button"
                  onClick={() => handleRespondGoalAction(false)}
                  className="py-2.5 px-3 rounded-xl font-semibold text-xs text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-700 flex items-center justify-center gap-1 transition active:scale-95"
                >
                  <X size={14} /> Recusar
                </button>
              </div>
            </div>
          )}

          {/* Seção 2: Proposta de Plano (Treino / Refeições) */}
          {plan && (
            <div className="space-y-4">
              {plan.summary && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 leading-relaxed font-medium">
                  ✨ {plan.summary}
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
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
          <div className="p-5 border-t border-slate-800/80 bg-slate-950/90 shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleRespondPlanAction(true)}
              className="flex-1 py-3.5 px-4 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 4px 20px rgba(16, 185, 129, 0.35)',
              }}
            >
              <Check size={18} />
              Aceitar Plano
            </button>

            <button
              type="button"
              onClick={() => handleRespondPlanAction(false)}
              className="py-3.5 px-4 rounded-2xl font-semibold text-sm text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-rose-500/10 border border-slate-700/60 hover:border-rose-500/30 flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <X size={16} />
              Recusar Plano
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlanProposalBottomSheet;
