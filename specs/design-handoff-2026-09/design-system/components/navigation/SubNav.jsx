import React from 'react';
import { ElasticPill } from './ElasticPill.jsx';
/** Subnav em vidro com pílula elástica rápida. A cor da pílula é a do separador ativo. */
export function SubNav({ items, active = 0, onChange, tones, width = 358 }) {
  const pitch = (width - 12) / items.length;
  const tone = (tones && tones[active]) || 'run';
  return (
    <div style={{ position: 'relative', width, display: 'flex', padding: 6, background: 'var(--surface-glass)', backdropFilter: 'blur(var(--blur-card))', border: '1px solid var(--border-glass)', borderRadius: 16, overflow: 'hidden', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }}>
      <ElasticPill target={{ left: 6 + active * pitch, width: pitch }} speed="sub" style={{ background: `var(--tint-${tone}-bg)`, border: `1px solid var(--tint-${tone}-bd)`, transition: 'background 200ms, border-color 200ms' }} />
      {items.map((it, i) => (
        <button key={i} onClick={() => onChange && onChange(i)} style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '7px 0', minHeight: 44, color: i === active ? `var(--${tone})` : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{it.icon}<span style={{ fontSize: 'var(--text-xs)', fontWeight: i === active ? 800 : 700 }}>{it.label}</span></button>
      ))}
    </div>
  );
}
