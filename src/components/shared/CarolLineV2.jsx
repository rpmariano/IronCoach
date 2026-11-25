import React, { useLayoutEffect, useRef, useState } from 'react';
import CoachText from './CoachText';

/* A linha da Carol nos cartões dos registos do Design v2 (uniformização, 2026-11-25): a mesma em
   todos — o traço ciano, «Carol.» e a análise numa linha; o «Ler mais» só aparece quando a análise
   não cabe nessa linha, e abre o texto inteiro ali mesmo. Controlada por fora (`open`, `onToggle`),
   para cada cartão manter o seu defaultExpanded.

   Cabe numa linha? Mede-se no browser (scrollHeight > clientHeight da linha cortada a uma). Sem
   layout (jsdom, ou antes de pintar) as medidas são 0, e conta o número de caracteres, como no
   Início v2. */

export const CAROL_LINE_CHARS = 90;

export function useLineOverflow(ref, text, enabled = true) {
  const [overflow, setOverflow] = useState(() => String(text || '').length > CAROL_LINE_CHARS);
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const el = ref.current;
    const measure = () => {
      if (!el) return;
      const sinLayout = el.clientHeight === 0 && el.scrollHeight === 0;
      setOverflow(sinLayout ? String(text || '').length > CAROL_LINE_CHARS : el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined' || !el) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, text, enabled]);
  return overflow;
}

export default function CarolLineV2({ text, id, open, onToggle, testId, toggleTestId, label = 'Carol.' }) {
  const lineRef = useRef(null);
  // Numa linha: sem as marcas do texto rico (negrito, títulos), sem quebras, sem travessões.
  const flat = String(text || '').replace(/\*\*/g, '').replace(/^##\s+/gm, '').replace(/\s+—\s+/g, ': ').replace(/\s+/g, ' ').trim();
  const overflow = useLineOverflow(lineRef, flat, !open);
  if (!flat) return null;
  return (
    <div className="v2-say v2-rec-say" data-testid={testId}>
      <i aria-hidden="true" />
      <div className="min-w-0">
        <div id={id}>
          {open ? (
            <div className="v2-rec-say-full"><span className="v2-who">{label}</span> <CoachText>{text}</CoachText></div>
          ) : (
            <p ref={lineRef} className="v2-rec-say-line"><span className="v2-who">{label}</span> {flat}</p>
          )}
        </div>
        {(open || overflow) && (
          <button type="button" className="v2-act is-acc" aria-expanded={!!open} aria-controls={id} data-testid={toggleTestId} onClick={onToggle}>
            {open ? 'Ler menos' : 'Ler mais'}
          </button>
        )}
      </div>
    </div>
  );
}
