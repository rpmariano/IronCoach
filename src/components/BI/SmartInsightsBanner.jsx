import React, { useMemo } from 'react';
import { detectCoachInsights } from '../../utils/biEngine';
import { useAppStore } from '../../store';
import { todayISO } from '../../lib/utils';
import { isInsightHidden } from '../../utils/insightState';
import Warning from '../shared/Warning';
import { noticeSeverity, noticeTone } from './noticeTones';

/* Ponto 3 do redesenho: o aviso era âmbar (bg-amber-100) — o âmbar é da
   prova. Coral para aviso, vermelho para crítico, ciano da Carol para o
   informativo (era azul genérico). Ver src/components/shared/Warning.jsx.

   Desde 2026-09-27 os símbolos são os do código único dos avisos da Carol
   (noticeTones.js) — eram o escudo e o raio, só aqui — e um insight posto
   de lado hoje ("Agora não") sai também deste banner, não só do botão. */
const WARNING_TONE = { critical: 'danger', warning: 'warn', info: 'coach' };

export default function SmartInsightsBanner({ data, profile, excludeIds = [] }) {
  const { insightStates, insightSnoozes } = useAppStore();
  const today = todayISO();
  const insights = useMemo(() => {
    // Retorna todos os insights cruzados (RED-S, ACWR, etc) ordenados por severidade,
    // filtrando aqueles já percebidos, postos de lado hoje ou visíveis noutros painéis.
    return detectCoachInsights(data, profile).filter(
      i => !isInsightHidden(i.id, { states: insightStates, snoozes: insightSnoozes, today }) && !excludeIds.includes(i.id)
    );
  }, [data, profile, excludeIds, insightStates, insightSnoozes, today]);

  if (!insights || insights.length === 0) {
    return null; // Nenhum insight, não mostra nada
  }

  // Vamos mostrar apenas o insight mais crítico (ou até 2 se houver espaço) para não sobrecarregar
  const topInsights = insights.slice(0, 2);

  return (
    <div className="space-y-3">
      {topInsights.map(insight => {
        const severity = noticeSeverity(insight.severity);
        const { Icon } = noticeTone(severity);

        return (
          <Warning
            key={insight.id}
            tone={WARNING_TONE[severity]}
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
