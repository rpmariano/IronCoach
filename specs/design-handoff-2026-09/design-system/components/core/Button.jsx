import React from 'react';
/** Botão de ação. Mínimo 44px — sempre. */
export function Button({ variant = 'primary', tone = 'coach', size = 'md', icon, children, disabled, style, ...rest }) {
  const h = size === 'lg' ? 'var(--tap-hero)' : size === 'sm' ? 'var(--tap)' : 'var(--tap-primary)';
  const tones = {
    coach: { grad: 'var(--grad-coach)', ink: 'var(--coach-ink)', c: 'var(--coach)', bg: 'var(--tint-coach-bg)', bd: 'var(--tint-coach-bd)' },
    race: { grad: 'var(--grad-race)', ink: 'var(--race-ink)', c: 'var(--race)', bg: 'var(--tint-race-bg)', bd: 'var(--tint-race-bd)' },
    ok: { grad: 'var(--ok)', ink: '#052e22', c: 'var(--ok)', bg: 'var(--tint-ok-bg)', bd: 'var(--tint-ok-bd)' },
    run: { grad: 'var(--run)', ink: '#04252b', c: 'var(--run)', bg: 'var(--tint-run-bg)', bd: 'var(--tint-run-bd)' },
    gym: { grad: 'var(--gym)', ink: '#0b2129', c: 'var(--gym)', bg: 'var(--tint-gym-bg)', bd: 'var(--tint-gym-bd)' },
    nutrition: { grad: 'var(--nutrition)', ink: '#22103a', c: 'var(--nutrition)', bg: 'var(--tint-nutrition-bg)', bd: 'var(--tint-nutrition-bd)' },
    body: { grad: 'var(--body)', ink: '#3a0a22', c: 'var(--body)', bg: 'var(--tint-body-bg)', bd: 'var(--tint-body-bd)' },
    warn: { grad: 'var(--warn)', ink: '#2a1006', c: 'var(--warn)', bg: 'var(--tint-warn-bg)', bd: 'var(--tint-warn-bd)' },
  }[tone];
  const v = {
    primary: { background: tones.grad, color: tones.ink, border: 'none' },
    tinted: { background: tones.bg, color: tones.c, border: '1px solid ' + tones.bd },
    secondary: { background: 'rgba(255,255,255,.05)', color: 'var(--text-3)', border: '1px solid var(--border-glass-strong)' },
    ghost: { background: 'transparent', color: 'var(--text-muted)', border: 'none' },
  }[variant];
  return (
    <button disabled={disabled} style={{
      minHeight: h, padding: '0 16px', borderRadius: size === 'lg' ? 'var(--radius-md)' : 'var(--radius-sm)',
      fontFamily: 'var(--font-sans)', fontSize: size === 'lg' ? 'var(--text-md)' : 'var(--text-base)', fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? .45 : 1, transition: 'transform var(--dur-tap)', ...v, ...style
    }} onPointerDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(.98)'; }} onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }} onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }} {...rest}>
      {icon}{children}
    </button>
  );
}
