import React from 'react';

/* O cartão de vidro do redesenho 2026-09 (design-system/components/core/
   GlassCard): 5% de branco, borda a 10%, raio 24, sombra — sem moldura
   branca. O que separa cartões é o espaço. `tone` muda a borda (e, na
   Carol, o fundo) para a cor do significado; `glow` põe um brilho radial
   nessa cor no canto superior direito — só em cartões principais (prova,
   plano do dia), nunca em listas. */
const GLOW = {
  race: 'rgba(251,191,36,.16)',
  coach: 'rgba(34,211,238,.18)',
  gym: 'rgba(90,143,163,.2)',
  run: 'rgba(46,224,255,.16)',
  nutrition: 'rgba(199,125,255,.16)',
  body: 'rgba(255,95,168,.16)',
};
const BORDER = {
  coach: '1px solid var(--tint-coach-bd)',
  race: '1px solid rgba(251,191,36,.24)',
  gym: '1px solid rgba(127,179,199,.28)',
};

export default function GlassCard({ tone, glow = false, radius = 24, padding = 16, className = '', style, children, ...rest }) {
  return (
    <div
      className={`relative overflow-hidden shrink-0 ${className}`}
      style={{
        background: tone === 'coach' ? 'var(--tint-coach-bg)' : 'var(--surface-glass)',
        backdropFilter: 'blur(var(--blur-card))',
        WebkitBackdropFilter: 'blur(var(--blur-card))',
        border: BORDER[tone] || '1px solid var(--border-glass)',
        borderRadius: radius,
        padding,
        boxShadow: 'var(--shadow-card)',
        color: 'var(--text-1)',
        ...style,
      }}
      {...rest}
    >
      {glow && GLOW[tone] && (
        <div aria-hidden="true" className="absolute pointer-events-none" style={{ right: -40, top: -40, width: 180, height: 180, background: `radial-gradient(circle, ${GLOW[tone]} 0%, transparent 70%)` }} />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}
