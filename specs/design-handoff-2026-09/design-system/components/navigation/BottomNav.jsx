import React from 'react';
import { ElasticPill } from './ElasticPill.jsx';
/** Barra inferior: 5 colunas, a do meio vazia para o FAB da prova. */
export function BottomNav({ items, active = 0, onChange, fabIcon, onFab, fabOpen = false }) {
  const cols = [items[0], items[1], null, items[2], items[3]];
  const idx = [0, 1, 3, 4][active];
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', alignItems: 'center', padding: '6px 0 8px', background: 'var(--bg-nav)', backdropFilter: 'blur(var(--blur-chrome))', WebkitBackdropFilter: 'blur(var(--blur-chrome))', borderTop: '1px solid var(--border-hairline)', fontFamily: 'var(--font-sans)' }}>
      <ElasticPill target={{ left: idx * 78 + 26, width: 26 }} speed="nav" />
      {cols.map((it, i) => it ? (
        <button key={i} onClick={() => onChange && onChange([0, 1, 3, 4].indexOf(i))} style={{ minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{it.icon}<span style={{ fontSize: 'var(--text-xs)' }}>{it.label}</span></button>
      ) : <div key={i} />)}
      <button onClick={onFab} aria-label="Registar" style={{ position: 'absolute', left: '50%', transform: `translateX(-50%) rotate(${fabOpen ? 45 : 0}deg)`, top: -22, width: 56, height: 56, borderRadius: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #0f172a', color: 'var(--race-ink)', background: 'var(--grad-race)', boxShadow: 'var(--shadow-fab)', cursor: 'pointer', transition: 'transform 200ms var(--ease-out)' }}>{fabIcon}</button>
    </div>
  );
}
