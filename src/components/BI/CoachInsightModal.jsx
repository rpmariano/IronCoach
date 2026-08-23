import React from 'react';
import { Bot, AlertTriangle, AlertCircle, Info, Sparkles } from 'lucide-react';
import PremiumModal from '../shared/PremiumModal';
import { useAppStore } from '../../store';
import Button from '../shared/Button';
import { COACH_GRADIENT, COACH_TEXT_SHADOW } from '../shared/CoachButton';

export default function CoachInsightModal({ insights, onClose }) {
  const { setInsightState, setActiveTab, setCoachIntent } = useAppStore();

  const handleIgnorar = () => {
    insights.forEach(i => setInsightState(i.id, 'ignored'));
    onClose();
  };

  const handleEntendido = () => {
    insights.forEach(i => setInsightState(i.id, 'understood'));
    onClose();
  };

  const handleFalarComCoach = () => {
    const titles = insights.map(i => i.title).join(', ');
    
    // Marca como entendido para que desapareçam do ecrã inicial/dashboard
    insights.forEach(i => setInsightState(i.id, 'understood'));

    setCoachIntent({
      kind: 'proactive_intervention',
      reason: `O atleta abriu o chat a partir dos Insights do Coach. Aborda proativamente estes temas: ${titles}.`
    });
    setActiveTab('coach');
    onClose();
  };

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
      <div className="px-5 py-5 overflow-y-auto space-y-3.5">
        <p className="text-xs text-slate-400 leading-relaxed">
          Baseado na doutrina de treino e nutrição, identifiquei os seguintes pontos que merecem a tua atenção:
        </p>

        {insights.map((insight, idx) => {
          const isCritical = insight.severity === 'critical';
          const isWarning = insight.severity === 'warning';

          const Icon = isCritical ? AlertTriangle : isWarning ? AlertCircle : Info;

          const cardStyles = isCritical
            ? {
                container: 'bg-red-500/10 border-red-500/30 text-red-200',
                iconWrap: 'bg-red-500/20 border-red-500/40 text-red-400',
                title: 'text-red-100',
                metricBadge: 'bg-red-500/20 border-red-500/40 text-red-300',
              }
            : isWarning
            ? {
                container: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
                iconWrap: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
                title: 'text-amber-100',
                metricBadge: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
              }
            : {
                container: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200',
                iconWrap: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400',
                title: 'text-cyan-100',
                metricBadge: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
              };

          return (
            <div
              key={insight.id || idx}
              className={`rounded-2xl border p-4 backdrop-blur-md shadow-sm flex flex-col gap-2.5 ${cardStyles.container}`}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${cardStyles.iconWrap}`}>
                  <Icon size={16} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-extrabold tracking-tight leading-snug ${cardStyles.title}`}>
                    {insight.title}
                  </h3>
                  
                  {/* Mensagem / Doutrina */}
                  <p className="text-xs text-slate-200 mt-1.5 leading-relaxed font-normal">
                    {insight.message}
                  </p>

                  {/* Badges de Módulo e Métrica */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-[10px] font-black uppercase tracking-wider text-slate-300 shadow-sm">
                      {insight.module}
                    </span>
                    {insight.metric && (
                      <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider shadow-sm ${cardStyles.metricBadge}`}>
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

      {/* Ações */}
      <div className="px-5 pb-6 pt-2 flex flex-col gap-2.5">
        <Button
          variant="module"
          moduleColor={COACH_GRADIENT}
          className="w-full flex justify-center items-center gap-2 py-3.5 rounded-2xl shadow-lg shadow-cyan-900/30 text-white font-extrabold text-sm"
          onClick={handleFalarComCoach}
        >
          <Sparkles size={17} style={{ color: '#fff' }} />
          <span style={{ textShadow: COACH_TEXT_SHADOW, color: '#fff' }}>Falar com o Coach</span>
        </Button>
        <div className="flex gap-2.5 w-full">
          <Button
            variant="ghost"
            className="flex-1 text-xs text-slate-400 hover:text-slate-200 py-2.5"
            onClick={handleIgnorar}
          >
            Ignorar
          </Button>
          <Button
            variant="secondary"
            className="flex-1 text-xs font-bold py-2.5 bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10"
            onClick={handleEntendido}
          >
            Entendido
          </Button>
        </div>
      </div>
    </PremiumModal>
  );
}
