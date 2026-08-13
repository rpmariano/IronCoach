import React, { useMemo, useState, useRef } from 'react';
import { Sparkles, Check, X, Calendar, Target, ChevronDown, ChevronUp } from 'lucide-react';
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
  if (!plan && !goalProposal) return null;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const touchStartY = useRef(null);

  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartY.current !== null) {
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      if (deltaY > 50) {
        // Deslizar para baixo: encolhe ou fecha se já estiver encolhido
        if (!isCollapsed) {
          setIsCollapsed(true);
        } else {
          onClose();
        }
      } else if (deltaY < -50) {
        // Deslizar para cima: expande
        setIsCollapsed(false);
      }
      touchStartY.current = null;
    }
  };

  const planItems = useMemo(() => (items || []).filter(i => plan && i.plan_id === plan.id), [items, plan?.id]);
  const days = useMemo(
    () => {
      if (!plan) return [];
      return buildPlanDays(planItems, plan.period_start, diffDaysISO(plan.period_start, plan.period_end) + 1).filter(d => d.items.length > 0);
    },
    [planItems, plan?.period_start, plan?.period_end],
  );

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
        className={`relative z-10 w-full flex flex-col rounded-t-[28px] border-t border-slate-700/60 shadow-2xl transition-all duration-300 ease-out overflow-hidden ${
          isCollapsed ? 'max-h-[220px]' : 'max-h-[85vh]'
        }`}
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(10, 15, 29, 0.99) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Pega / Grab Handle Interativo */}
        <div 
          onClick={() => setIsCollapsed(!isCollapsed)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="w-full py-3 cursor-pointer flex items-center justify-center shrink-0 group"
          title={isCollapsed ? "Expandir persiana" : "Encolher persiana"}
        >
          <div className={`w-12 h-1.5 rounded-full transition-colors ${isCollapsed ? 'bg-amber-400 group-hover:bg-amber-300' : 'bg-slate-600/60 group-hover:bg-slate-400'}`} />
        </div>

        {/* Cabeçalho */}
        <div className="flex items-start justify-between px-6 pb-4 border-b border-slate-800/80 shrink-0">
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

          <div className="flex items-center gap-1">
            {/* Botão de Alternar Expansão (Expandir / Encolher) */}
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
              aria-label={isCollapsed ? "Expandir persiana" : "Encolher persiana"}
            >
              {isCollapsed ? <ChevronUp size={20} className="text-amber-400 animate-bounce" /> : <ChevronDown size={20} />}
            </button>

            {/* Botão Fechar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Conteúdo Scrollável */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 no-scrollbar">
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
                  onClick={() => onRespondGoal(goalProposal.id, true)}
                  className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs text-slate-950 bg-amber-400 hover:bg-amber-300 flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md"
                >
                  <Check size={15} /> Aceitar Objetivos
                </button>
                <button
                  type="button"
                  onClick={() => onRespondGoal(goalProposal.id, false)}
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
              onClick={() => {
                onRespondPlan(plan.id, true);
              }}
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
              onClick={() => {
                onRespondPlan(plan.id, false);
              }}
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
