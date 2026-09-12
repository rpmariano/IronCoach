import React from 'react';
/** Etiqueta de secção: 11px, 800, uppercase, tracking .14em. O único elemento que organiza o ecrã. */
export function SectionLabel({ children, tone, style }) {
  return <div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 800, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: tone ? `var(--${tone})` : 'var(--text-4)', margin: '2px 2px 0', ...style }}>{children}</div>;
}
