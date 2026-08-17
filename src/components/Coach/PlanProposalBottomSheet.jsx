import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Sparkles, Check, X, Calendar, Target } from 'lucide-react';
import { buildPlanDays, diffDaysISO, PlanDayCard } from '../Home/WeeklyPlanCard';
import Button from '../shared/Button';
import PremiumModal from '../shared/PremiumModal';

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
  onRespondPlan,
  onClose,
}) {
  if (!plan) return null;

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
    onClose();
  };

  const title = 'Nova Proposta de Plano';
  const subtitle = plan ? `Período: ${plan.period_start} a ${plan.period_end}` : undefined;

  return (
    <PremiumModal
      isOpen={true}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={Sparkles}
      theme="coach"
      variant="bottom-sheet"
      maxWidth="max-w-md"
    >
      <div className="px-6 py-4 space-y-5">
          {/* Seção 2: Proposta de Plano (Treino / Refeições) */}
          {plan && (
            <div className="space-y-4 pb-4">
              {(plan.summary || planItems?.length > 0) && (
                <div
                  className="p-3.5 rounded-2xl border text-xs leading-relaxed font-medium space-y-2"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--mod-coach-to) 20%, transparent)',
                    color: 'var(--mod-coach-to)'
                  }}
                >
                  {planItems?.length > 0 && (
                    <p className="flex items-start gap-1.5 font-bold">
                      <span>✨</span>
                      <span>
                        Plano de {diffDaysISO(plan.period_start, plan.period_end) + 1} dias com{' '}
                        {(() => {
                          const runs = planItems.filter(i => i.kind === 'corrida').length;
                          const gym = planItems.filter(i => i.kind === 'ginasio').length;
                          const parts = [];
                          if (runs > 0) parts.push(`${runs} ${runs === 1 ? 'corrida' : 'corridas'}`);
                          if (gym > 0) parts.push(`${gym} ${gym === 1 ? 'sessão' : 'sessões'} de ginásio`);
                          return parts.length > 0 ? parts.join(' e ') : 'refeições e descanso';
                        })()}.
                      </span>
                    </p>
                  )}
                  {plan.summary && (
                    <div className={`opacity-90 leading-relaxed ${planItems?.length > 0 ? 'pl-5 border-l-2 mt-2' : ''}`} style={{ borderColor: 'color-mix(in srgb, var(--mod-coach-to) 20%, transparent)' }}>
                      {plan.summary}
                    </div>
                  )}
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
            <Button
              variant="module"
              moduleColor="linear-gradient(135deg, #10b981 0%, #059669 100%)"
              onClick={() => handleRespondPlanAction(true)}
              className="flex-1 text-sm py-3.5"
              icon={<Check size={18} />}
            >
              Aceitar Plano
            </Button>

            <Button
              variant="light"
              onClick={() => handleRespondPlanAction(false)}
              className="text-sm py-3.5 shrink-0 px-6"
              icon={<X size={16} />}
            >
              Recusar
            </Button>
          </div>
        )}
    </PremiumModal>
  );
}

export default PlanProposalBottomSheet;
