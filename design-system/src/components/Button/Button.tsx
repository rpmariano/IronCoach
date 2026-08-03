import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type ButtonVariant = 'primary' | 'outline' | 'danger' | 'system' | 'fab';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Estilo visual — primary (ação principal), outline (secundária), danger (destrutiva), system (ícone circular 44px), fab (botão flutuante 56px em Coral) */
  variant?: ButtonVariant;
  /** Ícone lucide-react opcional, mostrado antes do texto ou centralizado */
  icon?: LucideIcon | React.ComponentType<{ className?: string; size?: number }>;
  /** Ocupa a largura total do contentor (por defeito true para primary/outline/danger, false para system/fab) */
  fullWidth?: boolean;
}

const base =
  'text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition disabled:opacity-40 select-none cursor-pointer';

const variants: Record<ButtonVariant, string> = {
  primary: 'min-h-[44px] px-4 rounded-xl bg-[var(--accent)] text-slate-950 font-bold shadow-sm hover:brightness-105',
  outline:
    'min-h-[44px] px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-neutral-700 hover:border-[var(--accent)] text-slate-700 dark:text-slate-300 font-semibold bg-transparent',
  danger: 'min-h-[44px] px-4 rounded-xl border border-red-500/40 text-red-500 font-semibold bg-red-50 dark:bg-red-950/20',
  system: 'w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium p-0 shrink-0 border border-slate-200/60 dark:border-slate-700/60 shadow-sm',
  fab: 'w-14 h-14 min-w-[56px] min-h-[56px] rounded-full bg-[var(--accent)] text-slate-950 font-black shadow-xl hover:scale-105 active:scale-95 shrink-0 border-2 border-slate-900/10 p-0',
};

export function Button({
  variant = 'primary',
  icon: Icon,
  fullWidth,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const isFixedSize = variant === 'system' || variant === 'fab';
  const isFullWidth = fullWidth !== undefined ? fullWidth : !isFixedSize;

  return (
    <button
      className={`${base} ${variants[variant]} ${isFullWidth ? 'w-full' : ''} ${className}`.trim()}
      {...rest}
    >
      {Icon && <Icon className={variant === 'fab' ? 'w-6 h-6' : 'w-4 h-4'} />}
      {children}
    </button>
  );
}
