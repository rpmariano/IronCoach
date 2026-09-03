import React from 'react';
import { Bot, AlertTriangle, Info, AlertCircle } from 'lucide-react';

export default function CoachInsightButton({ insights, onClick }) {
  if (!insights || insights.length === 0) return null;

  // Find highest severity
  const hasCritical = insights.some(i => i.severity === 'critical');
  const hasWarning = insights.some(i => i.severity === 'warning');

  let ringColor = 'rgba(6, 182, 212, 0.4)'; // Cyan (Coach default)
  let waveColor = '#06b6d4';
  let badgeColor = 'bg-cyan-500';
  let Icon = Bot;

  if (hasCritical) {
    ringColor = 'rgba(239, 68, 68, 0.5)'; // Red
    waveColor = '#ef4444';
    badgeColor = 'bg-red-500';
    Icon = AlertTriangle;
  } else if (hasWarning) {
    ringColor = 'rgba(245, 158, 11, 0.5)'; // Amber
    waveColor = '#f59e0b';
    badgeColor = 'bg-amber-500';
    Icon = AlertCircle;
  }

  return (
    <button
      onClick={onClick}
      className="fixed bottom-[100px] right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] active:scale-95 transition-transform"
      style={{
        background: 'linear-gradient(135deg, var(--mod-coach-from, #155e75), var(--mod-coach-to, #06b6d4))',
        boxShadow: `0 0 0 0 ${ringColor}`,
        animation: hasCritical || hasWarning ? 'pulse-ring 2s infinite' : 'none'
      }}
    >
      {/* Onda brilhante a nascer do centro do botão para fora, em loop —
          o botão ficava pouco destacado ao fundo da tela; isto chama a
          atenção para o alerta mesmo sem depender só da cor do badge
          (ver .coach-wave-ring em globals.css). */}
      <span aria-hidden="true" className="coach-wave-ring" style={{ background: waveColor }} />
      <span aria-hidden="true" className="coach-wave-ring coach-wave-ring--delay" style={{ background: waveColor }} />
      <Icon className="relative w-6 h-6 text-white" />
      <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm border-2 border-white ${badgeColor}`}>
        {insights.length}
      </span>
      <style>{`
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 ${ringColor}; }
          70% { box-shadow: 0 0 0 10px rgba(0,0,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
      `}</style>
    </button>
  );
}
