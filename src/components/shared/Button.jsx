import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utilitário para fundir classes Tailwind
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Componente Base de Botão
 * Centraliza o design e o feedback tátil da aplicação.
 * 
 * @param {Object} props
 * @param {'primary'|'secondary'|'outline'|'ghost'|'danger'|'icon'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'|'icon'} [props.size='md']
 * @param {boolean} [props.isLoading=false]
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children]
 * @param {React.ReactNode} [props.icon] - Ícone opcional (ex: Lucide)
 */
export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon,
  ...props
}) {
  // Base classes (layout, transitions, and touch feedback)
  const baseClasses = 'inline-flex items-center justify-center font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

  // Variants (Colors & Styles)
  const variants = {
    primary: 'bg-[var(--accent)] text-neutral-950 hover:bg-[#b5e02d]',
    secondary: 'bg-neutral-800 text-slate-200 hover:bg-neutral-700',
    outline: 'border-2 border-neutral-700 text-slate-300 hover:bg-neutral-800 hover:text-white',
    ghost: 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
    icon: 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white rounded-full'
  };

  // Sizes
  const sizes = {
    sm: 'text-xs px-3 py-1.5 rounded-lg tap-44', // ensures 44px touch target if needed
    md: 'text-sm px-4 py-3 rounded-xl tap-h-44',
    lg: 'text-base px-6 py-4 rounded-2xl tap-h-44',
    icon: 'w-10 h-10 rounded-full flex-shrink-0'
  };

  return (
    <button
      className={cn(baseClasses, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : icon ? (
        <span className={children ? 'mr-2' : ''}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

export default Button;
