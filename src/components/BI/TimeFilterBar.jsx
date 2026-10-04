import React from 'react';

/**
 * Barra de intervalo dos dashboards de módulo. O chip ativo estava fixo no
 * roxo da nutrição (--mod-nutricao) em todos os quatro módulos — ponto 3 do
 * redesenho: cada módulo fala a sua cor. `module` escolhe qual; sobre a cor
 * cheia o texto é a tinta escura do módulo, não branco.
 */
const MODULE_TONE = {
  corrida: { bg: 'var(--run)', ink: 'var(--run-ink)' },
  ginasio: { bg: 'var(--gym)', ink: 'var(--gym-ink)' },
  nutricao: { bg: 'var(--nutrition)', ink: 'var(--nutrition-ink)' },
  corpo: { bg: 'var(--body)', ink: 'var(--body-ink)' },
};

/* Listas aprovadas por separador (2026-10-04): cada módulo só oferece os
   períodos de calendário que fazem sentido nele. */
const opt = (value, label) => ({ value, label });
export const NUTRICAO = [opt('dia', 'Dia'), opt('semana', 'Semana'), opt('mes', 'Mês'), opt('trimestre', 'Trimestre')];
export const CORPO = [...NUTRICAO, opt('ano', 'Ano')];
export const CORRIDA = [opt('semana', 'Semana'), opt('mes', 'Mês'), opt('trimestre', 'Trimestre'), opt('ano', 'Ano')];
export const GINASIO = [opt('semana', 'Semana'), opt('mes', 'Mês'), opt('trimestre', 'Trimestre')];

/* Sem `options` mantém-se a lista antiga: os separadores ainda não migraram. */
const LEGACY_OPTIONS = [
    { value: 'dia', label: 'Dia' },
    { value: 'semana', label: 'Semana' },
    { value: 'mes', label: 'Mês' },
    { value: 'trimestre', label: 'Trimestre' },
    { value: '6meses', label: '6 Meses' },
    { value: 'ano', label: 'Ano' }
];

export default function TimeFilterBar({ activeRange, onChange, className = '', module = 'nutricao', options = LEGACY_OPTIONS }) {
  const tone = MODULE_TONE[module] || MODULE_TONE.nutricao;
  /* 2026-10-04 (revisão no browser, 390 px): o Corpo tem 5 períodos e, com os
     botões a dividir a largura (flex-1 do PeriodHeader), cada um ficava com
     65 px — o `min-w-[44px]` substituía o mínimo natural do flex (o
     conteúdo), e «Trimestre», o período por omissão do Corpo, saía fora da
     pílula ativa. Agora o mínimo é o próprio rótulo (min-w-max), os 44 px do
     alvo vêm do padding + largura mínima do rótulo, e com 5+ opções o padding
     aperta para caberem todas sem deslizar. Se mesmo assim não couberem, a
     barra desliza (overflow-x-auto) em vez de cortar o texto. */
  const compact = options.length >= 5;
  const padX = compact ? 'px-2' : 'px-3';
  const labelMin = compact ? 'min-w-[28px]' : 'min-w-[20px]';

  return (
    <div role="group" aria-label="Período" className={`flex overflow-x-auto gap-1.5 p-1 no-scrollbar ${className}`}>
      {options.map((option) => {
        const isActive = activeRange === option.value;
        return (
          <button
            key={option.value}
            aria-pressed={isActive}
            onClick={() => onChange?.(option.value)}
            className={`whitespace-nowrap min-h-[44px] min-w-max justify-center inline-flex items-center rounded-full ${padX} py-1.5 text-[11px] font-medium transition-colors ${
              isActive ? 'shadow-sm' : 'bg-[var(--surface-glass)] backdrop-blur text-[var(--text-3)] hover:bg-[var(--surface-glass-hover)]'
            }`}
            style={isActive ? { background: tone.bg, color: tone.ink } : undefined}
          >
            <span className={`inline-block text-center ${labelMin}`}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
