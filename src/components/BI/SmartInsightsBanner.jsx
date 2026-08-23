import React, { useMemo } from 'react';
import { detectCoachInsights } from '../../utils/biEngine';
import { AlertCircle, Zap, ShieldAlert, TrendingDown } from 'lucide-react';

const SEVERITY_CONFIG = {
  critical: { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-900', icon: ShieldAlert, iconColor: 'text-rose-600' },
  warning: { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900', icon: AlertCircle, iconColor: 'text-amber-600' },
  info: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-900', icon: Zap, iconColor: 'text-blue-600' }
};

export default function SmartInsightsBanner({ data, profile }) {
  const insights = useMemo(() => {
    // Retorna todos os insights cruzados (RED-S, ACWR, etc) ordenados por severidade.
    return detectCoachInsights(data, profile);
  }, [data, profile]);

  if (!insights || insights.length === 0) {
    return null; // Nenhum insight, não mostra nada
  }

  // Vamos mostrar apenas o insight mais crítico (ou até 2 se houver espaço) para não sobrecarregar
  const topInsights = insights.slice(0, 2);

  return (
    <div className="space-y-3">
      {topInsights.map(insight => {
        const config = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
        const Icon = config.icon;
        
        return (
          <div key={insight.id} className={`flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-md shadow-sm ${config.bg} ${config.border}`}>
            <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
            <div>
              <h4 className={`text-sm font-bold ${config.text} mb-0.5`}>
                {insight.title}
              </h4>
              <p className={`text-[13px] font-medium leading-snug opacity-90 ${config.text}`}>
                {insight.message}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
