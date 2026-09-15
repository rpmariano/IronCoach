import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Medalhao, { LG_POSITIONS, WonStar } from './Medalhao';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { triggerHaptic } from '../../utils/haptics';
import './MedalMoment.css';

/* O momento da medalha (specs/palmares-medalhoes.md §"O momento da
   medalha", mock MomentoMedalha). Ecrã inteiro, por portal em document.body
   pela mesma razão do Sheet (um antepassado com transform/backdrop-filter
   deixa o `fixed` relativo a ele).

   O medalhão entra com os encaixes como estão, MENOS o da medalha nova, que
   começa vazio e recebe a estrela que voa. Toque em qualquer sítio salta
   para o estado final; o segundo toque fecha. O botão "Ver no Palmarés"
   fecha e leva ao separador Provas. Com prefers-reduced-motion começa já no
   estado final, sem clarão nem fagulhas nem hápticos.

   Os tempos vêm de --dur-medal-* (tokens/motion.css); os números abaixo são
   só o valor por omissão se o token não se conseguir ler. */

const FALLBACK_MS = { moment: 2600, brake: 900, land: 1700 };

function tokenMs(name, fallback) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(`--dur-medal-${name}`).trim();
    if (!raw) return fallback;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return fallback;
    return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n;
  } catch {
    return fallback;
  }
}

const SPARKS = [
  { sx: -50, sy: -36, size: 5, color: '#fde68a' },
  { sx: 54, sy: -28, size: 4, color: '#fbbf24' },
  { sx: 42, sy: 44, size: 5, color: '#fde68a' },
  { sx: -44, sy: 40, size: 4, color: '#f59e0b' },
  { sx: 8, sy: -56, size: 4, color: '#fff7db' },
];

/* Os 4 encaixes que se veem, com o alvo garantidamente entre eles. A Época
   pode ter mais de 4 (o anel da spec ainda está por desenhar): se a prova
   nova cair depois do 4.º, ocupa a última diagonal. */
function discSlots(slots = [], targetKey) {
  const all = slots || [];
  const idx = all.findIndex((s) => s?.key === targetKey);
  let shown = all.slice(0, 4);
  let targetIndex = idx;
  if (idx >= 4) {
    shown = [...all.slice(0, 3), all[idx]];
    targetIndex = 3;
  }
  if (targetIndex < 0) targetIndex = Math.min(shown.length, 3);
  return {
    shown: shown.map((s, i) => (i === targetIndex ? { ...s, state: 'empty' } : s)),
    targetIndex,
    target: idx >= 0 ? all[idx] : null,
  };
}

export default function MedalMoment({ award, medalhao, extraCount = 0, onClose, onOpenPalmares }) {
  const reduced = prefersReducedMotion();
  const [final, setFinal] = useState(reduced);
  const buttonRef = useRef(null);
  const timersRef = useRef([]);
  const closedRef = useRef(false);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true });
    if (reduced) return undefined;
    const brake = tokenMs('brake', FALLBACK_MS.brake);
    const land = tokenMs('land', FALLBACK_MS.land);
    const total = tokenMs('moment', FALLBACK_MS.moment);
    timersRef.current = [
      setTimeout(() => triggerHaptic(15), brake),          // o disco trava
      setTimeout(() => triggerHaptic([40, 30, 60]), land), // a estrela encaixa
      setTimeout(() => setFinal(true), total),
    ];
    return clearTimers;
  }, [reduced]);

  const close = useCallback((toPalmares = false) => {
    if (closedRef.current) return;
    closedRef.current = true;
    clearTimers();
    if (toPalmares) onOpenPalmares?.();
    onClose?.();
  }, [onClose, onOpenPalmares]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const onTap = () => {
    if (!final) {
      clearTimers();
      setFinal(true);
      return;
    }
    close();
  };

  if (!award) return null;

  const { shown, targetIndex, target } = discSlots(medalhao?.slots, award.slot);
  const [tx, ty] = LG_POSITIONS[targetIndex] || LG_POSITIONS[0];
  const enamel = target?.enamel || 'amber';
  const valueLabel = target?.valueLabel;
  const title = award.title || target?.label || 'Medalha nova';
  const cta = extraCount > 0
    ? `Ver no Palmarés · e mais ${extraCount} ${extraCount === 1 ? 'medalha' : 'medalhas'}`
    : 'Ver no Palmarés';

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Medalha nova: ${title}`}
      data-testid="medal-moment"
      data-final={final ? 'true' : 'false'}
      className={`ic-moment ${final ? 'is-final' : ''}`}
      onClick={onTap}
    >
      <div className="ic-moment-col">
        <div className="m-eyebrow text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.2em', color: 'var(--race)' }}>
          Medalha nova
        </div>

        <div className="m-disc" style={{ marginTop: 78 }}>
          <Medalhao
            size="lg"
            ribbon
            engraving={medalhao?.engraving}
            year={medalhao?.year}
            slots={shown}
            ariaLabel={`${medalhao?.name || 'Medalhão'}: ${title}`}
          >
            {!final && (
              <>
                <div className="m-flash" aria-hidden="true" style={{ position: 'absolute', left: tx - 38, top: ty - 38, width: 76, height: 76, borderRadius: '50%', background: 'radial-gradient(circle, rgba(253,230,138,.95) 0%, rgba(251,191,36,.4) 45%, transparent 70%)' }} />
                {SPARKS.map((s) => (
                  <div
                    key={`${s.sx},${s.sy}`}
                    className="m-spark"
                    data-testid="medal-moment-spark"
                    aria-hidden="true"
                    style={{ '--sx': `${s.sx}px`, '--sy': `${s.sy}px`, position: 'absolute', left: tx - 2, top: ty - 2, width: s.size, height: s.size, borderRadius: 99, background: s.color }}
                  />
                ))}
              </>
            )}
            <div className="m-fly" data-testid="medal-moment-star" aria-hidden="true" style={{ position: 'absolute', left: tx - 36, top: ty - 36, width: 72, height: 72 }}>
              <svg width="72" height="72" viewBox="0 0 72 72" style={{ overflow: 'visible', filter: final ? undefined : 'drop-shadow(0 8px 16px rgba(251,191,36,.5))' }}>
                <g transform="translate(36,36)">
                  <WonStar enamel={enamel} valueLabel={valueLabel} />
                </g>
              </svg>
            </div>
          </Medalhao>
        </div>

        <div className="m-caption text-center" style={{ marginTop: 44 }}>
          <div className="text-[20px] font-black" style={{ letterSpacing: '-.02em', color: 'var(--text-1)' }}>{title}</div>
          {award.line && <div className="text-[12.5px] mt-[5px]" style={{ color: 'var(--text-3)' }}>{award.line}</div>}
        </div>

        <div className="m-cta" style={{ position: 'absolute', left: 24, right: 24, bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            ref={buttonRef}
            type="button"
            data-testid="medal-moment-cta"
            onClick={(e) => { e.stopPropagation(); close(true); }}
            className="w-full flex items-center justify-center rounded-[11px] text-[12.5px] font-extrabold"
            style={{ minHeight: 44, background: 'rgba(255,255,255,.06)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}
