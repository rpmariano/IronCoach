import React from 'react';
/** Três anéis concêntricos: calorias (violeta), proteína (rosa), água (ciano). Só leitura — o registo vive no FAB. */
export function Orbit({ rings, size = 116, animate = true }) {
  const R = [60, 45, 30], C = R.map(r => 2 * Math.PI * r);
  return (
    <svg viewBox="0 0 132 132" style={{ width: size, height: size, transform: 'rotate(-90deg)' }}>
      {rings.slice(0, 3).map((ring, i) => {
        const pct = Math.max(0, Math.min(1, ring.value / ring.target));
        return (<g key={i}>
          <circle cx="66" cy="66" r={R[i]} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
          <circle cx="66" cy="66" r={R[i]} fill="none" stroke={ring.color} strokeWidth="9" strokeLinecap="round" strokeDasharray={C[i]} strokeDashoffset={C[i] * (1 - pct)}
            style={{ filter: `drop-shadow(0 0 6px ${ring.color}88)`, transition: animate ? `stroke-dashoffset var(--dur-rings) var(--ease-out) ${i * 80}ms` : 'none' }} />
        </g>);
      })}
    </svg>
  );
}
/** Legenda da órbita: ponto de cor, etiqueta uppercase, valor / alvo. */
export function OrbitLegend({ rings }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontFamily: 'var(--font-sans)' }}>{rings.map((r, i) => (
    <div key={i}><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: r.color }} /><span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{r.label}</span></div><div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{r.display || r.value} <span style={{ fontSize: 11, color: 'var(--text-4)', fontWeight: 700 }}>/ {r.targetDisplay || r.target}{r.unit ? ' ' + r.unit : ''}</span></div></div>
  ))}</div>;
}
