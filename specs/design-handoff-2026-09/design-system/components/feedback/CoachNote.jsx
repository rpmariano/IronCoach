import React from 'react';
/** A voz da Carol fora do chat: régua ciano à esquerda, texto em ciano claro. Sem fundo. */
export function CoachNote({ children, style }) {
  return <div style={{ borderLeft: '3px solid var(--coach)', padding: '2px 0 2px 14px', fontFamily: 'var(--font-sans)', ...style }}><p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--coach-soft)' }}>{children}</p></div>;
}
/** Bolha de chat. Da Carol à esquerda em tinta ciano; do atleta à direita em vidro neutro. */
export function ChatBubble({ from = 'coach', children }) {
  const coach = from === 'coach';
  return <div style={{ alignSelf: coach ? 'flex-start' : 'flex-end', maxWidth: '82%', background: coach ? 'rgba(34,211,238,.09)' : 'rgba(255,255,255,.07)', border: coach ? '1px solid rgba(34,211,238,.26)' : '1px solid rgba(255,255,255,.12)', borderRadius: coach ? '20px 20px 20px 6px' : '20px 20px 6px 20px', padding: '13px 15px', fontFamily: 'var(--font-sans)' }}><p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: coach ? 'var(--text-2)' : 'var(--text-1)' }}>{children}</p></div>;
}
/** Avatar da Carol. Provisório: ícone; a substituir por retrato com 3 expressões (ver CAROL.md). */
export function CoachAvatar({ size = 30, mood = 'neutral', breathing = false }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--grad-coach)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--coach-ink)', flexShrink: 0, boxShadow: breathing ? '0 0 0 6px rgba(34,211,238,.12)' : 'none', transition: 'box-shadow var(--dur-breathe) ease-in-out' }} data-mood={mood}>
    <svg width={size * .53} height={size * .53} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
  </span>;
}
