import React from 'react';
/** O cartão. Vidro a 5%, borda a 10%, raio 24, sombra. Um brilho radial opcional na cor do significado. */
export function GlassCard({ tone, glow = false, radius = '2xl', padding = 16, children, style }) {
  const glowColor = { race: 'rgba(251,191,36,.16)', coach: 'rgba(34,211,238,.18)', gym: 'rgba(90,143,163,.2)', run: 'rgba(46,224,255,.16)', nutrition: 'rgba(199,125,255,.16)', body: 'rgba(255,95,168,.16)' }[tone];
  const border = tone === 'coach' ? '1px solid var(--tint-coach-bd)' : tone === 'race' ? '1px solid rgba(251,191,36,.24)' : tone === 'gym' ? '1px solid rgba(127,179,199,.28)' : '1px solid var(--border-glass)';
  const bg = tone === 'coach' ? 'var(--tint-coach-bg)' : 'var(--surface-glass)';
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: bg, backdropFilter: 'blur(var(--blur-card))', WebkitBackdropFilter: 'blur(var(--blur-card))', border, borderRadius: `var(--radius-${radius})`, padding, boxShadow: 'var(--shadow-card)', fontFamily: 'var(--font-sans)', color: 'var(--text-1)', ...style }}>
      {glow && glowColor && <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`, pointerEvents: 'none' }} />}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}
