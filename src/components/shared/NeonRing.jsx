import React, { useEffect, useState } from 'react';
import { useCountUpDisplay } from '../../utils/useCountUp';

/* Um anel neon por macro (bug #51, 2026-10-03: «um círculo por cada macro e
   as cores têm de ser apelativas, neon»). O "Como estou" do Início passou da
   órbita de três anéis concêntricos para quatro anéis lado a lado —
   calorias, proteína, hidratos, gordura — cada um com o comido ao centro e
   o objetivo do dia por baixo. Cores: --neon-* (tokens/colors.css).

   O traço enche até 100% e fica cheio acima disso; o número ao centro é que
   diz quanto passou. `animate` desenha-o de zero (animação 1 do ponto 9,
   como a órbita), desfasado por `index`. */
export default function NeonRing({ value, target, color, size = 64, stroke = 6, animate = false, index = 0, children }) {
  const [drawn, setDrawn] = useState(!animate);
  useEffect(() => {
    if (!animate) { setDrawn(true); return undefined; }
    if (typeof requestAnimationFrame !== 'function') { setDrawn(true); return undefined; }
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity=".14" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={drawn ? c * (1 - pct) : c}
          style={{
            filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 8px ${color})`,
            transition: animate ? `stroke-dashoffset var(--dur-rings) var(--ease-out) calc(var(--stagger-rings) * ${index})` : 'none',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** O número ao centro, a contar (animação 2 do ponto 9). */
export function NeonRingValue({ value, animate }) {
  const text = useCountUpDisplay(value, { animate, decimals: 0, display: Math.round(value).toLocaleString('pt-PT') });
  return <>{text}</>;
}
