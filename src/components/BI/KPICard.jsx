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
      case 'safe': return '#28A745';
      case 'caution': return '#FFC107';
      case 'danger': return '#DC3545';
      default: return '#6C757D';
    }
  };

  const isPositive = delta > 0;
  const isNegative = delta < 0;

  return (
    <div 
      className={`bg-white/5 backdrop-blur-[20px] border border-white/60 rounded-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.3),inset_0_2px_10px_rgba(255,255,255,0.6)] relative overflow-hidden ${className}`}
    >
      {moduleColor && (
        <div 
          className="absolute top-0 left-0 right-0 h-[2px]" 
          style={{ backgroundColor: moduleColor }}
        />
      )}
      
      <div className="flex justify-between items-start mb-2">
        <span className="text-[12px] font-medium text-slate-500">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      </div>
      
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        {unit && <span className="text-xs text-slate-500 font-medium">{unit}</span>}
      </div>
      
      <div className="flex items-center justify-between mt-2">
        {delta !== undefined && (
          <div className={`flex items-center text-[11px] font-medium ${isPositive ? 'text-[#28A745]' : isNegative ? 'text-[#DC3545]' : 'text-slate-400'}`}>
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
