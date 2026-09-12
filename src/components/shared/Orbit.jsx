import React, { useEffect, useState } from 'react';
import { useCountUpDisplay } from '../../utils/useCountUp';

/* A órbita do Início — três anéis concêntricos: calorias (violeta),
   proteína (rosa), água (ciano). Só leitura; o registo vive no FAB
   (auditoria 2026-09-09, achado 7: o "+250" dentro dos anéis era o alvo
   mais pequeno da app). `empty` desenha os anéis tracejados do primeiro dia.

   `animate` é a animação 1 do ponto 9 ("anéis que se desenham"): os três
   partem de zero com 80 ms de desfasamento, de fora para dentro, em
   --dur-rings (1100 ms). Quem decide é quem monta o componente — no Início
   é o useIntroAnimation('rings'), uma vez por sessão. */
const RADII = [60, 45, 30];

export function Orbit({ rings = [], size = 116, empty = false, animate = false }) {
  // Com `animate`, o primeiro pintado é a zero e só no frame seguinte se põe
  // o valor real — é a mudança de stroke-dashoffset que a transição desenha.
  const [drawn, setDrawn] = useState(!animate);

  useEffect(() => {
    if (!animate) { setDrawn(true); return undefined; }
    if (typeof requestAnimationFrame !== 'function') { setDrawn(true); return undefined; }
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  return (
    <svg viewBox="0 0 132 132" style={{ width: size, height: size, transform: 'rotate(-90deg)' }} aria-hidden="true">
      {RADII.map((r, i) => {
        const ring = rings[i];
        const c = 2 * Math.PI * r;
        if (empty || !ring) {
          return <circle key={i} cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="9" strokeDasharray="3 7" />;
        }
        const pct = ring.target > 0 ? Math.max(0, Math.min(1, ring.value / ring.target)) : 0;
        return (
          <g key={i}>
            <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
            <circle
              cx="66" cy="66" r={r} fill="none" stroke={ring.color} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={drawn ? c * (1 - pct) : c}
              style={{ filter: `drop-shadow(0 0 6px ${ring.color}88)`, transition: animate ? `stroke-dashoffset var(--dur-rings) var(--ease-out) ${i * 80}ms` : 'none' }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* Quantas casas decimais mostrar: as que o `display` do modelo já usa
   (a água vem em "1,5"), zero para calorias e proteína. */
function decimalsOf(display) {
  if (typeof display !== 'string') return 0;
  const dec = display.split(',')[1];
  return dec ? dec.replace(/\D/g, '').length : 0;
}

/* O valor de uma linha da legenda — em componente próprio porque cada um
   conta com o seu próprio rAF (animação 2, "números que contam"). */
function OrbitLegendValue({ ring, animate }) {
  const text = useCountUpDisplay(ring.value, {
    animate,
    decimals: decimalsOf(ring.display),
    display: ring.display ?? ring.value,
  });
  return <>{text}</>;
}

/* Legenda: ponto de cor, etiqueta uppercase, valor / alvo. */
export function OrbitLegend({ rings = [], animate = false }) {
  return (
    <div className="flex flex-col gap-[11px] min-w-0 flex-1">
      {rings.map((r) => (
        <div key={r.label}>
          <div className="flex items-center gap-[7px]">
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: r.color }} />
            <span className="text-[11px] font-extrabold uppercase whitespace-nowrap" style={{ color: 'var(--text-3)', letterSpacing: 'var(--tracking-label)' }}>{r.label}</span>
          </div>
          <div className="text-[16px] font-black whitespace-nowrap mt-[3px]" style={{ color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
            <OrbitLegendValue ring={r} animate={animate} /> <span className="text-[11px] font-bold" style={{ color: 'var(--text-4)' }}>/ {r.targetDisplay ?? r.target}{r.unit ? ` ${r.unit}` : ''}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
