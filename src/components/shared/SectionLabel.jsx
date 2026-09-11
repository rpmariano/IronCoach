import React from 'react';

/* Etiqueta de secção: 11px, 800, uppercase, tracking .14em. É o único
   elemento que organiza o ecrã — em frase, não em substantivo ("O que
   faço hoje", "Para onde vou", "Como estou"). */
export default function SectionLabel({ children, tone, className = '', style }) {
  return (
    <div
      className={`shrink-0 text-[11px] font-extrabold uppercase ${className}`}
      style={{ letterSpacing: 'var(--tracking-eyebrow)', color: tone ? `var(--${tone})` : 'var(--text-4)', margin: '2px 2px 0', ...style }}
    >
      {children}
    </div>
  );
}
