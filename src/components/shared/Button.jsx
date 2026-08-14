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
 * @param {'primary'|'secondary'|'outline'|'ghost'|'danger'|'danger-ghost'|'danger-outline'|'light'|'light-danger'|'icon'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'|'icon'} [props.size='md']
 * @param {string} [props.moduleColor] - A css variable or valid color for 'module' variant background
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
  moduleColor,
  isLoading = false,
  disabled = false,
  icon,
  style,
  ...props
}) {
  // Base classes (layout, transitions, and touch feedback)
  const baseClasses = 'inline-flex items-center justify-center font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

  // Variants (Colors & Styles)
  const variants = {
    primary: 'bg-[var(--accent)] text-neutral-950 hover:bg-[#b5e02d] shadow-sm',
    secondary: 'bg-neutral-800 text-slate-200 hover:bg-neutral-700',
    outline: 'border-2 border-neutral-700 text-slate-300 hover:bg-neutral-800 hover:text-white',
    ghost: 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5',
    danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20',
    'danger-ghost': 'bg-transparent text-red-400 hover:text-red-500 hover:bg-red-500/10',
    'danger-outline': 'border border-red-500/40 text-red-400 hover:bg-red-500/10',
    light: 'bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200',
    'light-danger': 'bg-red-50/50 hover:bg-red-50 text-red-600 font-bold border border-red-200',
    module: 'text-white shadow-sm', // O bg é setado via style
    icon: 'bg-white/10 text-slate-400 hover:bg-white/20 hover:text-white rounded-full'
  };

  // Sizes
  const sizes = {
    sm: 'text-xs px-3 py-1.5 rounded-xl tap-44 gap-1.5', // ensures 44px touch target if needed
    md: 'text-sm px-4 py-3 rounded-xl tap-h-44 gap-2',
    lg: 'text-base px-6 py-3.5 rounded-2xl tap-h-44 gap-2',
    icon: 'w-10 h-10 rounded-full flex-shrink-0'
  };

  // Suporte para variante 'module' com cor injetada
  const inlineStyle = variant === 'module' && moduleColor 
    ? { ...style, background: moduleColor }
    : style;

  return (
    <button
      className={cn(baseClasses, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      style={inlineStyle}
      {...props}
    >
      {isLoading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />
      ) : icon ? (
        <span className={cn("shrink-0", children ? '' : '')}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

export default Button;
