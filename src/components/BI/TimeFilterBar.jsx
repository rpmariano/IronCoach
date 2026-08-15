import React from 'react';

export default function TimeFilterBar({ activeRange, onChange, className = '' }) {
  const options = [
    { value: 'dia', label: 'Dia' },
    { value: 'semana', label: 'Semana' },
    { value: 'mes', label: 'Mês' },
    { value: 'trimestre', label: 'Trimestre' },
    { value: '6meses', label: '6 Meses' },
    { value: 'ano', label: 'Ano' }
  ];

  return (
    <div className={`flex overflow-x-auto gap-1.5 p-1 no-scrollbar ${className}`}>
      {options.map((option) => {
        const isActive = activeRange === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange?.(option.value)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
              isActive 
                ? 'bg-[var(--mod-nutricao)] text-white shadow-sm' 
                : 'bg-white/40 backdrop-blur text-slate-600 hover:bg-white/60'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
