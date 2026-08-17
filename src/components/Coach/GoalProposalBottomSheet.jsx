import React from 'react';
import { Sparkles, Check, X, Target } from 'lucide-react';
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

export default function GoalProposalBottomSheet({
  proposal,
  profile,
  onRespond,
  onClose,
}) {
  if (!proposal) return null;

  const handleRespond = (accept) => {
    if (onRespond) onRespond(proposal.id, accept);
    onClose();
  };

  return (
    <PremiumModal
      isOpen={true}
      onClose={onClose}
      title="Proposta de Objetivos"
      icon={Target}
      theme="coach"
      variant="bottom-sheet"
      maxWidth="max-w-md"
    >
      <div className="px-6 py-4 space-y-5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500 shrink-0" />
            <h4 className="text-sm font-bold text-slate-800">Alteração de Objetivos</h4>
          </div>

          {proposal.rationale && (
            <p className="text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100">
              💡 {proposal.rationale}
            </p>
          )}

          <div className="space-y-1.5">
            {Object.entries(proposal.goals || {})
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
      </div>

      <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex items-center gap-3">
        <Button
          variant="module"
          moduleColor="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
          onClick={() => handleRespond(true)}
          className="flex-1 text-sm py-3.5"
          icon={<Check size={18} />}
        >
          Aceitar Objetivos
        </Button>

        <Button
          variant="light"
          onClick={() => handleRespond(false)}
          className="text-sm py-3.5 shrink-0 px-6"
          icon={<X size={16} />}
        >
          Recusar
        </Button>
      </div>
    </PremiumModal>
  );
}
