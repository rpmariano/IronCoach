import React from 'react';
import { cn } from './Button';

/**
 * Componente AddButton
 * Usado para botões inline de adicionar itens ("+ Adicionar série", "+ Zona").
 * 
 * @param {Object} props
 * @param {'accent'|'gym'|'run'|'nutrition'|'body'} [props.variant='accent'] - A cor principal do módulo
 */
export function AddButton({
  variant = 'accent',
  children,
  className,
  ...props
}) {
  const baseClasses = 'inline-flex items-center gap-1 font-bold text-[11px] uppercase tracking-wide transition-opacity hover:opacity-70 tap-44 active:scale-95';
  
  const variants = {
    accent: 'text-[var(--accent)]',
    gym: 'text-[var(--mod-ginasio-to)]',
    run: 'text-[var(--mod-corrida-to)]',
    nutrition: 'text-[var(--mod-nutricao-to)]',
    body: 'text-[var(--mod-body-to)]',
  };

  return (
    <button className={cn(baseClasses, variants[variant], className)} {...props}>
      <span className="text-[13px] font-black leading-none mb-0.5">+</span>
      {children}
    </button>
  );
}

export default AddButton;
