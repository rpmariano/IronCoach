import React from 'react';
import { Bot, AlertTriangle, X, ChevronRight, AlertCircle, Info } from 'lucide-react';

export default function CoachInsightModal({ insights, onClose }) {
  if (!insights || insights.length === 0) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 fade-in"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-3xl shadow-2xl z-50 slide-up overflow-hidden pb-safe flex flex-col max-h-[85vh]">
        {/* Header */}
        <div 
          className="px-5 pt-6 pb-4 flex items-start justify-between relative"
          style={{ background: 'linear-gradient(135deg, var(--mod-coach-from, #155e75), var(--mod-coach-to, #06b6d4))' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/30">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white leading-none">Insights do Coach</h2>
              <p className="text-sm text-cyan-100 mt-1">{insights.length} alerta(s) para ti</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center text-white active:scale-95 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-6 overflow-y-auto space-y-4">
          <p className="text-sm text-slate-500 mb-2">
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
      </div>
    </>
  );
}
