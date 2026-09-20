import React from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';

/* O botão flutuante dos insights (mock "Início": canto inferior direito,
   48px, gradiente da Carol, ondas na cor do alerta mais grave e o número
   de insights no badge). Sem alertas não aparece.

   `alerts` são os avisos da Carol que viviam no cabeçalho do cartão dela
   ("precisa de falar contigo", "o plano precisa de um ajuste", "o balanço
   da prova" — pedido 2026-09-13). Contam no número como os insights e,
   quando pedem conversa (severity 'warning'), fazem a onda pulsar. */
/* `bottom` (px) sobe o botão quando o ecrã tem barra de ação fixa por
   baixo — o Perfil tem, e a 100px o botão caía em cima do "Guardar
   alterações" (z-38 contra o z-30 da barra). */
export default function CoachInsightButton({ insights = [], alerts = [], onClick, bottom = 100 }) {
  const list = insights || [];
  const carolAlerts = alerts || [];
  const total = list.length + carolAlerts.length;
  if (total === 0) return null;

  const all = [...carolAlerts, ...list];
  const hasCritical = all.some((i) => i.severity === 'critical');
  const hasWarning = all.some((i) => i.severity === 'warning');
  // Ponto 3: a onda do aviso era âmbar (#f59e0b) — o âmbar é da prova.
  const wave = hasCritical ? 'var(--danger)' : hasWarning ? 'var(--warn)' : 'var(--coach)';
  const ring = hasCritical ? 'rgba(248,113,113,.5)' : hasWarning ? 'rgba(251,124,77,.5)' : 'rgba(34,211,238,.4)';
  // Texto sobre a cor cheia é escuro (handoff, "Cor"): o branco sobre coral
  // não chegava a 4.5:1.
  const waveInk = hasCritical ? 'var(--danger-ink)' : hasWarning ? 'var(--warn-ink)' : 'var(--coach-ink)';
  const Icon = hasCritical ? AlertTriangle : hasWarning ? AlertCircle : null;

  // Aviso 5 da revisão: com avisos e insights juntos, os insights não são
  // "assuntos" — cada um diz-se pelo seu nome.
  const insightsLabel = `${list.length} insight${list.length === 1 ? '' : 's'}`;
  const label = carolAlerts.length
    ? `A Carol quer falar contigo${list.length ? `, e tem ${insightsLabel}` : ''}`
    : `${insightsLabel} da Carol`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid="coach-insight-button"
      data-alerts={carolAlerts.length}
      className="fixed right-4 z-[38] w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"
      style={{ bottom, background: 'var(--grad-coach-legible)', animation: hasCritical || hasWarning ? 'coach-pulse-ring 2s infinite' : 'none' }}
    >
      <span aria-hidden="true" className="coach-wave-ring" style={{ background: wave }} />
      <span aria-hidden="true" className="coach-wave-ring coach-wave-ring--delay" style={{ background: wave }} />
      {/* O icone era branco sobre o ciano da Carol: 1,81:1 para um objeto
          grafico (precisa de 3:1). A tinta do tom da 8,9:1. */}
      {Icon ? <Icon className="relative w-6 h-6" style={{ color: 'var(--coach-ink)' }} /> : <CoachAvatar size={48} className="relative" />}
      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: wave, color: waveInk, border: '2px solid #fff' }}>
        {total}
      </span>
      <style>{`@keyframes coach-pulse-ring { 0% { box-shadow: 0 0 0 0 ${ring}; } 70% { box-shadow: 0 0 0 10px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }`}</style>
    </button>
  );
}
