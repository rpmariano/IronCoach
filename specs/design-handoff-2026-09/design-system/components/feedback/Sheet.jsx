import React from 'react';
/** Persiana: sobe do fundo com o ecrã escurecido por trás. Pega de 44px, cabeçalho, corpo com scroll. */
export function Sheet({ open = true, title, eyebrow, onClose, children, maxHeight = 640 }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'var(--bg-scrim)', backdropFilter: 'blur(3px)', opacity: open ? 1 : 0, transition: `opacity var(--dur-sheet-open)`, pointerEvents: open ? 'auto' : 'none' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40, background: 'var(--bg-sheet)', borderTop: '1px solid var(--border-glass-strong)', borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0', boxShadow: 'var(--shadow-sheet)', padding: '12px 18px 26px', maxHeight, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', transform: open ? 'translateY(0)' : 'translateY(100%)', transition: `transform var(--dur-sheet-open) var(--ease-out)` }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 12 }}><span style={{ width: 44, height: 4, borderRadius: 99, background: 'rgba(255,255,255,.25)' }} /></div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, paddingBottom: 12, borderBottom: '1px solid var(--border-glass)' }}>
          <div>{eyebrow && <div style={{ fontSize: 'var(--text-xs)', fontWeight: 800, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gym)' }}>{eyebrow}</div>}{title && <div style={{ fontSize: 'var(--text-md)', fontWeight: 800, color: 'var(--text-1)', marginTop: eyebrow ? 5 : 0 }}>{title}</div>}</div>
          <button onClick={onClose} aria-label="Fechar" style={{ width: 44, height: 44, borderRadius: 9999, border: '1px solid var(--border-glass-strong)', background: 'rgba(255,255,255,.06)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: -8 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div style={{ overflowY: 'auto', marginTop: 4 }}>{children}</div>
      </div>
    </>
  );
}
/** Popup centrado. Para confirmações e insights; nunca para formulários. */
export function Dialog({ open = true, tone = 'coach', title, children, actions, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(4,8,15,.7)', backdropFilter: 'blur(4px)', opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 200ms' }} />
      <div style={{ position: 'absolute', zIndex: 40, left: 22, right: 22, top: '50%', transform: open ? 'translateY(-50%) scale(1)' : 'translateY(-50%) scale(.96)', opacity: open ? 1 : 0, transition: 'all 220ms var(--ease-out)', background: 'var(--bg-sheet)', border: `1px solid ${tone === 'coach' ? 'var(--tint-coach-bd)' : 'var(--border-glass-strong)'}`, borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-dialog)', padding: 22, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--font-sans)' }}>
        {title && <div style={{ fontSize: 'var(--text-lg)', fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-.01em' }}>{title}</div>}
        <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--text-3)' }}>{children}</div>
        {actions && <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>{actions}</div>}
      </div>
    </>
  );
}
