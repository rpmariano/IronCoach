import React, { useEffect, useState } from 'react';

/* A órbita do Início — três anéis concêntricos: calorias (violeta),
   proteína (rosa), água (ciano). Desde o bug #51 (2026-10-03) o "Como
   estou" mostra um anel neon por macro (shared/NeonRing.jsx) e a órbita
   ficou só para o primeiro dia, tracejada (StatusCard empty). Só leitura; o registo vive no FAB
   (auditoria 2026-09-09, achado 7: o "+250" dentro dos anéis era o alvo
   mais pequeno da app). `empty` desenha os anéis tracejados do primeiro dia.

   `animate` é a animação 1 do ponto 9 ("anéis que se desenham"): os três
   partem de zero com --stagger-rings (80 ms) de desfasamento, de fora para
   dentro, em --dur-rings (1100 ms). Quem decide é quem monta o componente — no Início
   é o useRevealAnimation do StatusCard: quando a órbita aparece no ecrã, e
   outra vez ao voltar ao Início. */
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
              // O desfasamento é o token --stagger-rings (tokens/motion.css),
              // não um 80 escrito à mão: o token existia e nunca era lido, e
              // os anéis dos badges (shared/BadgeRing.jsx) passaram a precisar
              // do MESMO valor — dois 80 em ficheiros diferentes acabariam
              // por deixar de ser o mesmo número.
              style={{ filter: `drop-shadow(0 0 6px ${ring.color}88)`, transition: animate ? `stroke-dashoffset var(--dur-rings) var(--ease-out) calc(var(--stagger-rings) * ${i})` : 'none' }}
            />
          </g>
        );
      })}
    </svg>
  );
}
