import React from 'react';
import CoachAvatar from '../Coach/CoachAvatar';
import { noticeTone, topSeverity } from './noticeTones';

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

  // A cor e o símbolo são os do aviso mais grave, pelo mesmo código dos
  // cartões da janela (noticeTones.js). Ponto 3: a onda do aviso era âmbar
  // (#f59e0b) — o âmbar é da prova. Sem nada grave fica a cara dela.
  const severity = topSeverity([...carolAlerts, ...list]);
  const tone = noticeTone(severity);
  const urgent = severity !== 'info';
  const wave = tone.color;
  const ring = tone.ring;
  // Texto sobre a cor cheia é escuro (handoff, "Cor"): o branco sobre coral
  // não chegava a 4.5:1.
  const waveInk = tone.ink;
  const Icon = urgent ? tone.Icon : null;

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
      data-severity={severity}
      className="fixed right-4 z-[38] w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"
      style={{ bottom, background: 'var(--grad-coach-legible)', animation: urgent ? 'coach-pulse-ring 2s infinite' : 'none' }}
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
