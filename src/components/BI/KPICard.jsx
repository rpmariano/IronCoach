import React from 'react';

export default function KPICard({ 
  label, 
  value, 
  unit, 
  delta, 
  status = 'neutral', 
  icon: Icon, 
  moduleColor,
  className = ''
}) {
  const getStatusColor = () => {
    switch(status) {
      case 'safe': return 'var(--ok)';
      case 'caution': return 'var(--warn)';
      case 'danger': return 'var(--danger)';
      default: return 'var(--text-4)';
    }
  };

  const isPositive = delta > 0;
  const isNegative = delta < 0;

  // Quando o chamador passa um `status` real (ex.: compliance de macros),
  // a cor do delta segue esse estado em vez do sinal bruto — "comer 150%
  // do alvo calórico" não é uma seta verde só porque o número é positivo.
  // Sem `status` explícito (ex.: peso, BF%), mantém o critério antigo:
  // sinal do delta é que decide a cor.
  const deltaColorClass = status !== 'neutral'
    ? (status === 'danger' ? 'text-[var(--danger)]' : status === 'caution' ? 'text-[var(--warn)]' : status === 'safe' ? 'text-[var(--ok)]' : 'text-[var(--text-3)]')
    : (isPositive ? 'text-[var(--ok)]' : isNegative ? 'text-[var(--danger)]' : 'text-[var(--text-3)]');

  return (
    <div 
      className={`bg-[var(--surface-glass)] backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] relative overflow-hidden ${className}`}
    >
      {moduleColor && (
        <div 
          className="absolute top-0 left-0 right-0 h-[2px]" 
          style={{ backgroundColor: moduleColor }}
        />
      )}
      
      <div className="flex justify-between items-start mb-2">
        <span className="text-[12px] font-medium text-[var(--text-3)]">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-[var(--text-3)]" />}
      </div>
      
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        {unit && <span className="text-xs text-[var(--text-3)] font-medium">{unit}</span>}
      </div>
      
      <div className="flex items-center justify-between mt-2">
        {delta !== undefined && (
          <div className={`flex items-center text-[11px] font-medium ${deltaColorClass}`}>
            {isPositive && '▲ '}
            {isNegative && '▼ '}
            {!isPositive && !isNegative && '- '}
            {Math.abs(delta)}%
          </div>
        )}
        
        <div 
          className="w-2 h-2 rounded-full" 
          style={{ backgroundColor: getStatusColor() }}
        />
      </div>
    </div>
  );
}
