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
 * Tinta (cor do texto) sobre a cor cheia de cada significado.
 *
 * O handoff é explícito: "o texto sobre a cor cheia é escuro
 * (--race-ink, --coach-ink); o texto sobre a tinta a 16% é a própria cor".
 * O variant="module" pintava-se de `text-white` sobre as cores cheias dos
 * módulos, que são todas claras — medido: 1,59:1 sobre --run (#2ee0ff),
 * 1,88:1 sobre --gym, 2,69:1 sobre --nutrition, 2,83:1 sobre --body,
 * 1,67:1 sobre --race, 1,81:1 sobre --coach. Com a tinta certa: 10,1 · 8,9 ·
 * 6,5 · 6,0 · 11,0 · 8,9:1.
 *
 * A ordem importa: `--mod-corrida-to` tem de cair na regra da corrida antes
 * de qualquer outra, e um gradiente que mencione duas cores fica com a
 * primeira que casar.
 */
const MODULE_INKS = [
  [/--(?:coach|mod-coach|grad-coach)/, 'var(--coach-ink)'],
  [/--(?:race|mod-prova|grad-race)/, 'var(--race-ink)'],
  [/--(?:run|mod-corrida)/, 'var(--run-ink)'],
  [/--(?:gym|mod-ginasio)/, 'var(--gym-ink)'],
  [/--(?:nutrition|mod-nutricao)/, 'var(--nutrition-ink)'],
  [/--(?:body|mod-corpo)/, 'var(--body-ink)'],
  [/--(?:ok|green)\b/, 'var(--ok-ink)'],
  [/--warn/, 'var(--warn-ink)'],
  [/--danger/, 'var(--danger-ink)'],
];

/**
 * Descobre a tinta a usar a partir do valor de `moduleColor`.
 * Aceita `var(--x)`, gradientes e `color-mix(...)`. Um valor que não se
 * reconheça (hex solto, cor nova) fica com --coach-ink: é a omissão segura,
 * porque todas as cores de significado desta app são claras.
 */
export function resolveModuleInk(moduleColor) {
  if (!moduleColor) return 'var(--text-1)';
  const found = MODULE_INKS.find(([re]) => re.test(moduleColor));
  return found ? found[1] : 'var(--coach-ink)';
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
    // --accent é claro (ver globals.css: é um alias de --coach). Texto claro
    // por cima dava 2,06:1; a tinta (--accent-on) dá 8,91:1. O hover escurece
    // o fundo para --accent-dark, que já é escuro — daí a tinta clara no hover.
    primary: 'bg-[var(--accent)] text-[var(--accent-on)] hover:bg-[var(--accent-dark)] hover:text-[var(--text-1)] shadow-sm',
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
    // A cor do texto é a tinta do módulo, resolvida a partir do moduleColor
    // (resolveModuleInk, acima) e aplicada por style — não dá para a pôr numa
    // classe estática porque depende do valor recebido.
    module: 'shadow-sm', // bg e color são setados via style
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
  const inlineStyle = variant === 'module'
    ? { color: resolveModuleInk(moduleColor), ...(moduleColor ? { background: moduleColor } : null), ...style }
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
