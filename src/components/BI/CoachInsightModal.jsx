import React from 'react';
import { Bot, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import PremiumModal from '../shared/PremiumModal';

export default function CoachInsightModal({ insights, onClose }) {
  if (!insights || insights.length === 0) return null;

  return (
    <PremiumModal
      isOpen={true}
      onClose={onClose}
      title="Insights do Coach"
      subtitle={`${insights.length} alerta(s) para ti`}
      icon={Bot}
      theme="coach"
      variant="bottom-sheet"
    >
      <div className="px-5 py-6 overflow-y-auto space-y-4">
        <p className="text-[13px] text-slate-500 mb-2">
          Baseado na doutrina de treino e nutrição, identifiquei os seguintes pontos que merecem a tua atenção:
        </p>

        {insights.map((insight, idx) => {
          let Icon = Info;
          let color = 'text-cyan-500';
          let bg = 'bg-cyan-50';
          let border = 'border-cyan-100';

          if (insight.severity === 'critical') {
            Icon = AlertTriangle;
            color = 'text-red-500';
            bg = 'bg-red-50';
            border = 'border-red-100';
          } else if (insight.severity === 'warning') {
            Icon = AlertCircle;
            color = 'text-amber-500';
            bg = 'bg-amber-50';
            border = 'border-amber-100';
          }

          return (
            <div key={insight.id || idx} className={`rounded-2xl border p-4 ${bg} ${border}`}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${color}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <h3 className={`text-sm font-bold text-slate-800`}>{insight.title}</h3>
                  
                  {/* Resolution Framework */}
                  <p className="text-[13px] text-slate-600 mt-2 leading-relaxed">
                    {insight.message}
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    <span className="px-2 py-1 rounded-md bg-white/60 text-[11px] font-semibold text-slate-500 uppercase">
                      {insight.module}
                    </span>
                    {insight.metric && (
                      <span className={`px-2 py-1 rounded-md bg-white/60 text-[11px] font-semibold ${color}`}>
                        {insight.metric}: {typeof insight.value === 'number' ? insight.value.toFixed(1) : insight.value}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PremiumModal>
  );
}
