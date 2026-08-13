import React, { useMemo } from 'react';
import { Sparkles, Check, X, Calendar, ChevronRight } from 'lucide-react';
import { buildPlanDays, diffDaysISO, PlanDayCard } from '../Home/WeeklyPlanCard';

export function PlanProposalBottomSheet({ plan, items = [], onRespond, onClose }) {
  if (!plan) return null;

  const planItems = useMemo(() => (items || []).filter(i => i.plan_id === plan.id), [items, plan.id]);
  const days = useMemo(
    () => buildPlanDays(planItems, plan.period_start, diffDaysISO(plan.period_start, plan.period_end) + 1).filter(d => d.items.length > 0),
    [planItems, plan.period_start, plan.period_end],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Overlay escuro com Backdrop Blur que escurece o fundo e bloqueia interações */}
      <div 
        className="fixed inset-0 bg-black/75 backdrop-blur-md animate-bottom-sheet-overlay"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Bottom Sheet (Persiana de baixo para cima) */}
      <div 
        className="relative z-10 w-full max-h-[85vh] flex flex-col rounded-t-[28px] border-t border-slate-700/60 shadow-2xl animate-bottom-sheet-slide overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(10, 15, 29, 0.99) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        {/* Pega / Grab Handle */}
        <div className="w-12 h-1.5 bg-slate-600/50 rounded-full mx-auto my-3 shrink-0" />

        {/* Cabeçalho do Modal */}
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
                Nova Proposta de Plano
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 font-medium">
                <Calendar size={12} className="text-emerald-400" />
                <span>Período: {plan.period_start} a {plan.period_end}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo Scrollável do Plano */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 no-scrollbar">
          {plan.summary && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 leading-relaxed font-medium">
              ✨ {plan.summary}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
              Sessões Planeadas ({days.length} dias)
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

        {/* Rodapé Fixo com Botões Aceitar / Recusar */}
        <div className="p-5 border-t border-slate-800/80 bg-slate-950/90 shrink-0 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              onRespond(plan.id, true);
              onClose();
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
              onRespond(plan.id, false);
              onClose();
            }}
            className="py-3.5 px-4 rounded-2xl font-semibold text-sm text-slate-400 hover:text-rose-400 bg-slate-800/80 hover:bg-rose-500/10 border border-slate-700/60 hover:border-rose-500/30 flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <X size={16} />
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}

export default PlanProposalBottomSheet;
