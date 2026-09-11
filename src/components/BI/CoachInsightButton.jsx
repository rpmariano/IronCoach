import React from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';

/* O botão flutuante dos insights (mock "Início": canto inferior direito,
   48px, gradiente da Carol, ondas na cor do alerta mais grave e o número
   de insights no badge). Sem alertas não aparece. */
export default function CoachInsightButton({ insights, onClick }) {
  if (!insights || insights.length === 0) return null;

  const hasCritical = insights.some((i) => i.severity === 'critical');
  const hasWarning = insights.some((i) => i.severity === 'warning');
  const wave = hasCritical ? '#ef4444' : hasWarning ? '#f59e0b' : '#06b6d4';
  const ring = hasCritical ? 'rgba(239,68,68,.5)' : hasWarning ? 'rgba(245,158,11,.5)' : 'rgba(6,182,212,.4)';
  const Icon = hasCritical ? AlertTriangle : hasWarning ? AlertCircle : null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${insights.length} insight${insights.length === 1 ? '' : 's'} do Coach`}
      className="fixed right-4 bottom-[100px] z-[38] w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"
      style={{ background: 'var(--grad-coach)', animation: hasCritical || hasWarning ? 'coach-pulse-ring 2s infinite' : 'none' }}
    >
      <span aria-hidden="true" className="coach-wave-ring" style={{ background: wave }} />
      <span aria-hidden="true" className="coach-wave-ring coach-wave-ring--delay" style={{ background: wave }} />
      {Icon ? <Icon className="relative w-6 h-6" style={{ color: '#fff' }} /> : <CoachAvatar size={48} className="relative" />}
      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: wave, color: '#fff', border: '2px solid #fff' }}>
        {insights.length}
      </span>
      <style>{`@keyframes coach-pulse-ring { 0% { box-shadow: 0 0 0 0 ${ring}; } 70% { box-shadow: 0 0 0 10px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }`}</style>
    </button>
  );
}
