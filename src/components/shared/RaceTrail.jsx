import React from 'react';

/* Trilho do macrociclo: semanas feitas como pontos, marcador âmbar,
   divisões de fase, seta na meta. No Início e no Hub de prova. A única
   animação que vale repetir semanalmente: quando a semana muda, o marcador
   avança (1600 ms). */
export default function RaceTrail({ weeks = 18, current = 6, phases = [], startLabel, endLabel, width = 322 }) {
  const x0 = 4;
  const x1 = width - 4;
  const span = x1 - x0;
  const safeWeeks = Math.max(1, weeks);
  const px = (w) => x0 + (Math.max(0, Math.min(safeWeeks, w)) / safeWeeks) * span;
  const cur = px(current);
  return (
    <svg viewBox={`0 0 ${width} 58`} style={{ width: '100%', height: 58, display: 'block', overflow: 'visible', marginTop: 14 }} aria-hidden="true">
      <line x1={x0} y1="34" x2={x1} y2="34" stroke="rgba(255,255,255,.12)" strokeWidth="3" strokeLinecap="round" />
      <line x1={x0} y1="34" x2={cur} y2="34" stroke="var(--race)" strokeWidth="3" strokeLinecap="round" style={{ transition: 'x2 var(--dur-trail) var(--ease-out)' }} />
      {Array.from({ length: Math.max(0, current - 1) }, (_, i) => (
        <circle key={i} cx={px(i + 1)} cy="34" r="3" fill="var(--race)" />
      ))}
      <circle cx={cur} cy="34" r="7" fill="var(--race)" stroke="var(--bg-app)" strokeWidth="3" style={{ transition: 'cx var(--dur-trail) var(--ease-out)' }} />
      {phases.slice(0, -1).map((p, i) => (
        <line key={i} x1={px(p.to)} y1="24" x2={px(p.to)} y2="44" stroke="rgba(255,255,255,.18)" strokeWidth="2" />
      ))}
      <polygon points={`${x1 - 8},26 ${x1 + 4},34 ${x1 - 8},42`} fill="var(--race-deep)" />
      {phases.map((p, i) => {
        const from = i ? phases[i - 1].to : 0;
        const active = current > from && current <= p.to;
        return (
          <text key={p.label} x={px(from) + (i ? 6 : 0)} y="14" fill={active ? 'var(--race)' : 'var(--text-muted)'} fontSize="11" fontWeight="700" fontFamily="var(--font-sans)">{p.label}</text>
        );
      })}
      {startLabel && <text x={x0} y="55" fill="var(--text-muted)" fontSize="11" fontWeight="600" fontFamily="var(--font-sans)">{startLabel}</text>}
      {endLabel && <text x={x1} y="55" fill="var(--text-muted)" fontSize="11" fontWeight="600" fontFamily="var(--font-sans)" textAnchor="end">{endLabel}</text>}
    </svg>
  );
}
