import React, { useEffect, useRef, useState } from 'react';
/** A minhoca. Pílula que estica a cobrir o trajeto (45% do tempo) e contrai no alvo com overshoot (55%).
 *  Porte do useElasticPillIndicator do repositório. nav = 420+130·dist ms (teto 950); sub = 320 ms fixos. */
const lerp = (a, b, t) => a + (b - a) * t;
const eOut = t => 1 - Math.pow(1 - t, 3);
const eBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export function useElasticPill(target, speed = 'nav') {
  const [box, setBox] = useState(target);
  const cur = useRef(target); const raf = useRef();
  useEffect(() => {
    const from = cur.current, to = target;
    if (!from || from.left === to.left && from.width === to.width) { cur.current = to; setBox(to); return; }
    const L = Math.min(from.left, to.left), R = Math.max(from.left + from.width, to.left + to.width);
    const dist = to.width > 0 ? Math.round(Math.abs(to.left - from.left) / to.width) : 1;
    const dur = speed === 'sub' ? 320 : Math.min(950, 420 + dist * 130);
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur); let l, r;
      if (p < .45) { const g = eOut(p / .45); l = lerp(from.left, L, g); r = lerp(from.left + from.width, R, g); }
      else { const s = eBack((p - .45) / .55); l = lerp(L, to.left, s); r = lerp(R, to.left + to.width, s); }
      const b = { left: l, width: Math.max(0, r - l) }; cur.current = b; setBox(b);
      if (p < 1) raf.current = requestAnimationFrame(tick); else { cur.current = to; setBox(to); }
    };
    cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target.left, target.width, speed]);
  return box;
}
export function ElasticPill({ target, speed = 'nav', style }) {
  const b = useElasticPill(target, speed);
  const nav = speed === 'nav';
  return <span style={{ position: 'absolute', left: b.left, width: b.width, ...(nav ? { top: 0, height: 4, borderRadius: 9999, background: 'var(--grad-nav-pill)', boxShadow: 'var(--glow-pill)' } : { top: 6, bottom: 6, borderRadius: 10 }), ...style }} />;
}
