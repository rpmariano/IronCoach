import React from 'react';
import { Bot, AlertTriangle, Info, AlertCircle } from 'lucide-react';

export default function CoachInsightButton({ insights, onClick }) {
  if (!insights || insights.length === 0) return null;

  // Find highest severity
  const hasCritical = insights.some(i => i.severity === 'critical');
  const hasWarning = insights.some(i => i.severity === 'warning');

  let ringColor = 'rgba(6, 182, 212, 0.4)'; // Cyan (Coach default)
  let badgeColor = 'bg-cyan-500';
  let Icon = Bot;

  if (hasCritical) {
    ringColor = 'rgba(239, 68, 68, 0.5)'; // Red
    badgeColor = 'bg-red-500';
    Icon = AlertTriangle;
  } else if (hasWarning) {
    ringColor = 'rgba(245, 158, 11, 0.5)'; // Amber
    badgeColor = 'bg-amber-500';
    Icon = AlertCircle;
  }

  return (
    <button
      onClick={onClick}
      className="fixed bottom-[100px] right-4 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
      style={{
        background: 'linear-gradient(135deg, var(--mod-coach-from, #155e75), var(--mod-coach-to, #06b6d4))',
        boxShadow: `0 0 0 0 ${ringColor}`,
        animation: hasCritical || hasWarning ? 'pulse-ring 2s infinite' : 'none'
      }}
    >
      <Icon className="w-6 h-6 text-white" />
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
