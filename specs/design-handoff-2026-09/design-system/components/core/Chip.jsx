import React from 'react';
/** Seletor de opção ou badge de estado. Como seletor tem 44px; como badge, 24px. */
export function Chip({ tone = 'neutral', selected = false, badge = false, children, onClick, style }) {
  const c = tone === 'neutral' ? null : tone;
  const on = selected || badge;
  const col = c ? `var(--${c})` : 'var(--text-3)';
  return (
    <span onClick={onClick} style={{
      minHeight: badge ? 24 : 'var(--tap)', display: 'inline-flex', alignItems: 'center', padding: badge ? '0 9px' : '0 15px',
      borderRadius: badge && tone === 'race' ? 8 : 'var(--radius-pill)', fontFamily: 'var(--font-sans)',
      fontSize: badge ? 'var(--text-xs)' : 'var(--text-base)', fontWeight: on ? 800 : 700,
      color: on && c ? col : 'var(--text-3)',
      background: on && c ? `var(--tint-${c}-bg)` : 'rgba(255,255,255,.05)',
      border: on && c ? `${selected ? 1.5 : 1}px solid ${selected ? col : `var(--tint-${c}-bd)`}` : '1px solid rgba(255,255,255,.13)',
      cursor: onClick ? 'pointer' : 'default', textTransform: badge ? 'uppercase' : 'none', letterSpacing: badge ? 'var(--tracking-label)' : 0, ...style
    }}>{children}</span>
  );
}
