import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Medalhao, { MAX_SLOTS, WonStar, slotPosition, visibleSlots } from './Medalhao';
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

/* Os encaixes que se veem (até 8 — de 5 a 8 em anel, ver slotPosition em
   Medalhao.jsx), com o alvo garantidamente entre eles. Só acima de 8 é que
   a prova nova pode cair fora dos desenhados: ocupa então o último lugar. */
function discSlots(slots = [], award) {
  const all = slots || [];
  // A chave do encaixe é estável em todos os medalhões ('mes', '21k',
  // 'estrada5', 'seq3', 'o1'...) e é essa que o medal_awards grava em
  // `slot`: o encaixe encontra-se sempre por ela. (A Época, que gravava
  // 'prova' com o id no period_key porque as posições p1..pN dançavam, deixou
  // de existir em 2026-09-15 — e com ela o caso especial que isto tinha.)
  const idx = all.findIndex((s) => s?.key === award?.slot);
  let shown = visibleSlots(all);
  let targetIndex = idx;
  if (idx >= MAX_SLOTS) {
    shown = [...all.slice(0, MAX_SLOTS - 1), all[idx]];
    targetIndex = MAX_SLOTS - 1;
  }
  if (targetIndex < 0) targetIndex = Math.min(shown.length, MAX_SLOTS - 1);
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

  const { shown, targetIndex, target } = discSlots(medalhao?.slots, award);
  // A estrela pousa onde o disco a desenha — mesma função, mesma escala (no
  // anel de 7–8 encaixes a estrela é um pouco mais pequena).
  const { x: tx, y: ty, scale: tScale } = slotPosition(targetIndex, Math.max(shown.length, targetIndex + 1), 'lg');
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
            <div className="m-fly" data-testid="medal-moment-star" data-x={tx} data-y={ty} aria-hidden="true" style={{ position: 'absolute', left: tx - 36, top: ty - 36, width: 72, height: 72 }}>
              <svg width="72" height="72" viewBox="0 0 72 72" style={{ overflow: 'visible', filter: final ? undefined : 'drop-shadow(0 8px 16px rgba(251,191,36,.5))' }}>
                <g transform={tScale === 1 ? 'translate(36,36)' : `translate(36,36) scale(${tScale})`}>
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
