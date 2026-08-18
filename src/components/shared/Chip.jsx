import React from 'react';
import { cn } from './Button';

/**
 * Componente Chip
 * Usado para filtros, seleções tipo "rádio" (toggles) e pills.
 * 
 * @param {Object} props
 * @param {boolean} [props.active=false] - Define o estado selecionado
 * @param {'accent'|'gym'|'run'|'nutrition'|'body'|'coach'|'light'} [props.variant='accent'] - A cor a usar quando ativo
 * @param {'full'|'xl'} [props.rounded='full'] - Arredondamento dos cantos
 */
export function Chip({
  active = false,
  variant = 'accent',
  children,
  className,
  rounded = 'full',
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center font-semibold text-xs px-4 py-2 transition-all active:scale-95 cursor-pointer tap-44';
  
  const roundedClass = rounded === 'xl' ? 'rounded-xl' : 'rounded-full';

  // Estilo por defeito para estado não ativo
  const inactiveClass = 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700';

  // Estilos para estado ativo consoante a variante/módulo — pílula de vidro
  // (fundo e borda como tint translúcido da cor, texto na própria cor) em
  // vez de preenchimento sólido, para condizer com o glassmorphism escuro do
  // resto da app. Mesma receita /15 bg · /40 border já usada nos botões
  // tracejados de upload (RunRegistration, GymRegistration, ...).
  const activeVariants = {
    accent: 'bg-[var(--accent)]/15 text-[var(--accent-ink)] border-[var(--accent)]/40 shadow-sm',
    gym: 'bg-[var(--mod-ginasio-to)]/15 text-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)]/40 shadow-sm',
    run: 'bg-[var(--mod-corrida-to)]/15 text-[var(--mod-corrida-to)] border-[var(--mod-corrida-to)]/40 shadow-sm',
    nutrition: 'bg-[var(--mod-nutricao-to)]/15 text-[var(--mod-nutricao-to)] border-[var(--mod-nutricao-to)]/40 shadow-sm',
    body: 'bg-[var(--mod-corpo-to)]/15 text-[var(--mod-corpo-to)] border-[var(--mod-corpo-to)]/40 shadow-sm',
    coach: 'bg-[var(--mod-coach-to)]/15 text-[var(--mod-coach-to)] border-[var(--mod-coach-to)]/40 shadow-sm',
    light: 'bg-slate-800 text-neutral-50 border-transparent shadow-sm'
  };

  return (
    <button
      className={cn(baseClasses, roundedClass, active ? activeVariants[variant] : inactiveClass, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export default Chip;
