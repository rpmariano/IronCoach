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
    primary: 'bg-[var(--accent)] text-[var(--text-1)] hover:bg-[var(--accent-dark)] shadow-sm',
    secondary: 'bg-[var(--surface-strong)] text-[var(--text-2)] hover:bg-[var(--surface-glass-hover)]',
    outline: 'border-2 border-[var(--border-glass-strong)] text-[var(--text-3)] hover:bg-[var(--surface-strong)] hover:text-white',
    ghost: 'bg-transparent text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-glass)]',
    danger: 'bg-[var(--tint-danger-bg)] text-[var(--danger)] hover:bg-[var(--tint-danger-bg-hover)]',
    'danger-ghost': 'bg-transparent text-[var(--danger)] hover:bg-[var(--tint-danger-bg)]',
    'danger-outline': 'border border-[var(--tint-danger-bd)] text-[var(--danger)] hover:bg-[var(--tint-danger-bg)]',
    light: 'bg-[var(--surface-faint)] hover:bg-[var(--surface-soft)] text-[var(--text-2)] font-semibold border border-[var(--border-glass)]',
    // bg-red-50/border-red-200 eram cores do tema claro original — só o
    // "light" (bg-white/border-slate-200) tem um override global para dark
    // mode (globals.css), por isso este "light-danger" ficava sempre um
    // bloco rosa-claro opaco ao lado do "Editar" já adaptado. Direto em
    // rgba (não depende de nenhum override) e no mesmo espírito translúcido
    // do "danger", mas com borda para pesar visualmente como o "light" ao lado.
    'light-danger': 'bg-[var(--tint-danger-bg)] hover:bg-[var(--tint-danger-bg-hover)] text-[var(--danger)] font-bold border border-[var(--tint-danger-bd)]',
    module: 'text-white shadow-sm', // O bg é setado via style
    icon: 'bg-[var(--surface-strong)] text-[var(--text-3)] hover:bg-white/20 hover:text-white rounded-full'
  };

  // Sizes
  const sizes = {
    sm: 'text-xs px-3 py-1.5 rounded-xl tap-44 gap-1.5', // ensures 44px touch target if needed
    md: 'text-sm px-4 py-3 rounded-2xl tap-h-44 gap-2',
    lg: 'text-base px-6 py-3.5 rounded-3xl tap-h-44 gap-2',
    // 44px (--tap), nao 40 - piso de toque do ponto 2 do handoff.
    icon: 'w-11 h-11 rounded-full flex-shrink-0'
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
