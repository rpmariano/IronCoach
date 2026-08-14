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

  // Estilos para estado ativo consoante a variante/módulo
  const activeVariants = {
    accent: 'bg-[var(--accent)] text-neutral-900 border-transparent shadow-sm',
    gym: 'bg-[var(--mod-ginasio-to)] text-white border-transparent shadow-sm',
    run: 'bg-[var(--mod-corrida-to)] text-white border-transparent shadow-sm',
    nutrition: 'bg-[var(--mod-nutricao-to)] text-white border-transparent shadow-sm',
    body: 'bg-[var(--mod-body-to)] text-white border-transparent shadow-sm',
    coach: 'bg-[var(--mod-coach-to)] text-white border-transparent shadow-sm',
    light: 'bg-slate-800 text-white border-transparent shadow-sm'
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
