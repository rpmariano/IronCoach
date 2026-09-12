import React from 'react';
/** Aviso em coral. Nunca âmbar — o âmbar é da prova. Nunca pulsa. */
export function Warning({ title, children, icon, actions, tone = 'warn', style }) {
  const c = `var(--${tone})`;
  return (
    <div style={{ background: `var(--tint-${tone}-bg)`, border: `1px solid var(--tint-${tone}-bd)`, borderRadius: 'var(--radius-md)', padding: '13px 14px', fontFamily: 'var(--font-sans)', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{icon && <span style={{ color: c, display: 'flex' }}>{icon}</span>}<span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: c }}>{title}</span></div>
      <p style={{ margin: '8px 0 0', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: tone === 'warn' ? 'var(--warn-soft)' : tone === 'ok' ? 'var(--ok-soft)' : 'var(--text-2)' }}>{children}</p>
      {actions && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>{actions}</div>}
    </div>
  );
}
