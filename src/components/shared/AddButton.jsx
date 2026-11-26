import React from 'react';
import { cn } from './Button';
import { useDesignV2 } from '../../utils/designV2';

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
    accent: 'text-[var(--coach)]',
    gym: 'text-[var(--mod-ginasio-to)]',
    run: 'text-[var(--mod-corrida-to)]',
    nutrition: 'text-[var(--mod-nutricao-to)]',
    body: 'text-[var(--mod-corpo-to)]',
  };

  /* Design v2 (P2 da 2.ª crítica): o texto na tinta neutra; a cor do módulo fica só no «+». */
  const v2 = useDesignV2();
  const plusColor = { accent: 'var(--coach)', gym: 'var(--mod-ginasio-to)', run: 'var(--mod-corrida-to)', nutrition: 'var(--mod-nutricao-to)', body: 'var(--mod-corpo-to)' }[variant];
  return (
    <button className={cn(baseClasses, v2 ? 'text-[var(--v2-ink)]' : variants[variant], className)} {...props}>
      <span className="text-[13px] font-black leading-none mb-0.5" style={v2 ? { color: plusColor } : undefined}>+</span>
      {children}
    </button>
  );
}

export default AddButton;
