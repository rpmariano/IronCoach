import React from 'react';
/** Barra de ação fixa acima da nav. Irmã da nav, nunca dentro do scroll. O scroll leva padding-bottom 168px. */
export function ActionBar({ children, aboveNav = true }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: aboveNav ? 'var(--nav-h)' : 0, zIndex: 30, padding: aboveNav ? '12px 16px' : '14px 20px 26px', background: 'rgba(4,8,15,.9)', backdropFilter: 'blur(var(--blur-sheet))', WebkitBackdropFilter: 'blur(var(--blur-sheet))', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: 12, alignItems: 'center' }}>{children}</div>
  );
}
