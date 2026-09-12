import React from 'react';
/** Botão só com ícone. Sempre 44×44 — o glifo pode ser pequeno, a área não. */
export function IconButton({ children, variant = 'glass', shape = 'square', label, style, ...rest }) {
  const v = {
    glass: { background: 'rgba(255,255,255,.06)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' },
    plain: { background: 'transparent', border: 'none', color: 'var(--text-4)' },
    coach: { background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: 'var(--coach)' },
  }[variant];
  return (
    <button aria-label={label} title={label} style={{ width: 'var(--tap)', height: 'var(--tap)', borderRadius: shape === 'round' ? 'var(--radius-pill)' : 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, ...v, ...style }} {...rest}>{children}</button>
  );
}
