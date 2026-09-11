import React, { useMemo } from 'react';
import { Sparkles, Check, X, Target, Lightbulb } from 'lucide-react';
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
  goal_lean_body_mass_kg: { label: 'Massa Magra Alvo', unit: 'kg' },
};

/* Persiana única para propostas do Coach pendentes de decisão do atleta.
   Um plano de treino/refeições e uma proposta de objetivos podem estar
   pendentes ao mesmo tempo (ex.: a Carol propõe primeiro os objetivos e só
   depois, na conversa seguinte, o plano que deles depende) — por isso as
   duas secções aparecem juntas aqui, cada uma com o seu próprio par
   Aceitar/Recusar independente. `onClose` só cobre o fecho da persiana
   inteira (X, arrastar, backdrop); responder a uma secção não fecha a
   outra — ver Coach.jsx, que só desmonta a persiana quando ambas ficarem
   resolvidas. */
export function PlanProposalBottomSheet({
  plan,
  items = [],
  onRespondPlan,
  goalProposal,
  profile,
  onRespondGoal,
  onClose,
}) {
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
    if (plan && onRespondPlan) onRespondPlan(plan.id, accept);
  };
  const handleRespondGoalAction = (accept) => {
    if (goalProposal && onRespondGoal) onRespondGoal(goalProposal.id, accept);
  };

  const both = !!plan && !!goalProposal;
  const title = both
    ? 'Propostas do Coach'
    : goalProposal
      ? 'Proposta de Objetivos'
      : 'Nova Proposta de Plano';
  const subtitle = both
    ? 'Objetivos e plano por rever'
    : plan
      ? `Período: ${plan.period_start} a ${plan.period_end}`
      : undefined;

  return (
    <PremiumModal
      isOpen={true}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={both ? Sparkles : goalProposal ? Target : Sparkles}
      theme="coach"
      variant="bottom-sheet"
      maxWidth="max-w-md"
    >
      <div className="px-6 py-4 space-y-6">
        {/* Secção 1: Proposta de Objetivos — mostra-se primeiro porque o
            plano costuma depender destes valores serem aceites. */}
        {goalProposal && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                {/* A proposta de objetivos vem da Carol — era âmbar (a cor
                    da prova). Passa ao ciano dela (ponto 3). */}
                <Target className="w-5 h-5 shrink-0" style={{ color: 'var(--coach)' }} />
                <h4 className="text-sm font-bold text-slate-800">Alteração de Objetivos</h4>
              </div>

              {goalProposal.rationale && (
                <p
                  className="text-xs text-slate-600 p-2.5 rounded-xl flex items-start gap-1.5"
                  style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}
                >
                  <Lightbulb size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--coach)' }} />
                  <span>{goalProposal.rationale}</span>
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
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="module"
                moduleColor="var(--grad-coach)"
                onClick={() => handleRespondGoalAction(true)}
                className="flex-1 text-sm py-3.5"
                icon={<Check size={18} />}
              >
                Aceitar Objetivos
              </Button>
              <Button
                variant="light"
                onClick={() => handleRespondGoalAction(false)}
                className="text-sm py-3.5 shrink-0 px-6"
                icon={<X size={16} />}
              >
                Recusar
              </Button>
            </div>
          </div>
        )}

        {both && <div className="border-t border-slate-200" />}

        {/* Secção 2: Proposta de Plano (Treino / Refeições) */}
        {plan && (
          <div className="space-y-4">
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
                    <Sparkles size={13} className="shrink-0 mt-0.5" />
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
                  <div className={`opacity-90 leading-relaxed whitespace-pre-line ${planItems?.length > 0 ? 'pl-5 border-l-2 mt-2' : ''}`} style={{ borderColor: 'color-mix(in srgb, var(--mod-coach-to) 20%, transparent)' }}>
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
                  profile={profile}
                  readOnly
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
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
          </div>
        )}
      </div>
    </PremiumModal>
  );
}

export default PlanProposalBottomSheet;
