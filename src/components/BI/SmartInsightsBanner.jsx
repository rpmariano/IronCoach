import React, { useMemo } from 'react';
import { detectCoachInsights } from '../../utils/biEngine';
import { useAppStore } from '../../store';
import { AlertCircle, Zap, ShieldAlert } from 'lucide-react';
import Warning from '../shared/Warning';

/* Ponto 3 do redesenho: o aviso era âmbar (bg-amber-100) — o âmbar é da
   prova. Coral para aviso, vermelho para crítico, ciano da Carol para o
   informativo (era azul genérico). Ver src/components/shared/Warning.jsx. */
const SEVERITY_CONFIG = {
  critical: { tone: 'danger', Icon: ShieldAlert },
  warning: { tone: 'warn', Icon: AlertCircle },
  info: { tone: 'coach', Icon: Zap }
};

export default function SmartInsightsBanner({ data, profile, excludeIds = [] }) {
  const { insightStates } = useAppStore();
  const insights = useMemo(() => {
    // Retorna todos os insights cruzados (RED-S, ACWR, etc) ordenados por severidade,
    // filtrando aqueles já entendidos/desativados ou visíveis noutros painéis.
    return detectCoachInsights(data, profile).filter(
      i => insightStates[i.id] !== 'understood' && !excludeIds.includes(i.id)
    );
  }, [data, profile, excludeIds, insightStates]);

  if (!insights || insights.length === 0) {
    return null; // Nenhum insight, não mostra nada
  }

  // Vamos mostrar apenas o insight mais crítico (ou até 2 se houver espaço) para não sobrecarregar
  const topInsights = insights.slice(0, 2);

  return (
    <div className="space-y-3">
      {topInsights.map(insight => {
        const config = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
        const { Icon } = config;

        return (
          <Warning
            key={insight.id}
            tone={config.tone}
            title={insight.title}
            icon={<Icon size={14} />}
          >
            {insight.message}
          </Warning>
        );
      })}
    </div>
  );
}
