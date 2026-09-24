import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import BadgeRing, { corDoBadge } from './BadgeRing';
import { LOOK, ambientBackground, contourRings, lookKeyForNow } from '../../utils/ambientWorld';
import { easeBack, textoContado } from '../../utils/badgeMoment';
import { prefersReducedMotion } from '../../utils/coachBubbles';
import { triggerHaptic } from '../../utils/haptics';
import './BadgeMoment.css';

/* O MOMENTO EM QUE SE GANHA UM BADGE (fase 4 da reforma da gamificação).
   As regras — que escala, que ordem — estão em utils/badgeMoment.js; quando
   aparece, em utils/useBadgeMoment.js. Aqui só se desenha.

   ── É UM MUNDO, NÃO UM CARTÃO ───────────────────────────────────────────
   A escala grande é a sala da Carol vista do outro lado: ecrã inteiro, as
   curvas de nível da app centradas no assunto, e a luz da hora do dia —
   âmbar ao amanhecer, ciano à tarde, índigo à noite, quase nada de
   madrugada. A paleta e as curvas são LITERALMENTE as dela
   (utils/ambientWorld.js), não uma imitação: a mesma hora tem de dar a
   mesma luz em toda a app.

   O que NÃO vem de lá, de propósito: o rosto da Carol. A sala é dela; este
   momento é do atleta. Partilha-se o mundo, não a protagonista — ao centro
   fica o anel do badge a desenhar-se e o número a contar, que é o objeto
   desta vitrina desde a fase 2 (shared/BadgeRing.jsx).

   As curvas e o halo tomam a COR DO BADGE (a lei da cor de utils/badges.js):
   ciano o treino, verde a disciplina, âmbar o que nasce de uma prova, prata
   um amuleto. O mundo pinta-se do significado do que se ganhou.

   ── NÃO FECHA SOZINHO ───────────────────────────────────────────────────
   Não há temporizador nenhum aqui. É o precedente de 2026-09-21 na sala da
   Carol: «todas as mensagens que têm este caráter temporário devem deixar de
   o ter; quero que só desapareçam mediante ação do utilizador». E, como lá,
   também não há linha a esvaziar-se — sem contagem para mostrar, era uma
   promessa falsa.

   ── O GESTO ─────────────────────────────────────────────────────────────
   Na escala grande: primeiro toque salta para o fim, segundo fecha. É o
   gesto que o momento da medalha trouxe e que ficou quando ele saiu — não
   se aprende gesto novo por causa de uma cerimónia nova.

   ── DIÁLOGO MODAL A SÉRIO (a escala grande) ─────────────────────────────
   Foco no botão ao abrir, Tab preso cá dentro, Escape fecha, e ao fechar o
   foco volta ao sítio de onde veio.

   ── O CARTÃO NÃO É MODAL, E É DE PROPÓSITO ──────────────────────────────
   A escala média não para o ecrã — seria a escala grande com outro tamanho.
   Por isso o cartão flutua sem tapar nada: o resto da app continua a
   responder, o Tab sai dele, e sai a um toque nele ou no × (que é explícito
   precisamente porque não há um ecrã inteiro a dizer "toca para fechar").
   O foco vai na mesma para o × ao abrir, para quem navega por teclado o
   poder dispensar sem o caçar, e Escape fecha. */

/** Os marcos da coreografia, em fração de --dur-badge-moment (2,6 s). Os
 *  keyframes de BadgeMoment.css dizem o mesmo em percentagem; estes servem
 *  aos hápticos e à contagem, que vivem no JS. */
const MARCOS = { disco: 520 / 2600, anelInicio: 360 / 2600, anelFim: 1460 / 2600 };
const FALLBACK_TOTAL_MS = 2600;
const FALLBACK_RINGS_MS = 1100;

const ANEL_GRANDE = 196;
const ANEL_MEDIO = 60;

/** O atraso do anel no cartão: entra logo a seguir à persiana, não tem
 *  disco nenhum para esperar. */
const ATRASO_MEDIO_MS = 180;

/* O tom cheio de cada significado, para o halo e o clarão. Vai literal pela
   mesma razão do BRILHO de shared/BadgeRing.jsx — são gradientes, e um
   color-mix com variáveis encadeadas não é terreno para se confiar aqui.
   São os mesmos valores de tokens/colors.css. */
const TOM = {
  run: '46,224,255',
  ok: '52,211,153',
  race: '251,191,36',
  // O --text-3 (#cbd5e1): um amuleto não se anuncia com a mesma força.
  neutro: '203,213,225',
};

const SPARKS = [
  { sx: -64, sy: -46, size: 5 },
  { sx: 68, sy: -36, size: 4 },
  { sx: 54, sy: 56, size: 5 },
  { sx: -56, sy: 52, size: 4 },
  { sx: 10, sy: -72, size: 4 },
];

/* As curvas de nível à volta do anel. Fixas, calculadas uma vez. */
const CONTOUR_VIEW = 390;
const CONTOURS = contourRings({ cx: CONTOUR_VIEW / 2, cy: CONTOUR_VIEW / 2 });

function tokenMs(name, fallback) {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return fallback;
    return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n;
  } catch {
    return fallback;
  }
}

/** O número a contar, com a MESMA curva do anel (--ease-back) e a acabar no
 *  mesmo instante — é a folha de tempos que manda, não duas animações a
 *  correr cada uma por si. Parado (`ativo` falso), o texto é o final. */
function useContagem(texto, { ativo, atrasoMs, duracaoMs }) {
  const [t, setT] = useState(ativo ? 0 : 1);
  useEffect(() => {
    if (!ativo) { setT(1); return undefined; }
    if (typeof requestAnimationFrame !== 'function') { setT(1); return undefined; }
    let raf = 0;
    let inicio = 0;
    const passo = (agora) => {
      if (!inicio) inicio = agora;
      const decorrido = agora - inicio - atrasoMs;
      if (decorrido < 0) { raf = requestAnimationFrame(passo); return; }
      const f = duracaoMs > 0 ? Math.min(1, decorrido / duracaoMs) : 1;
      setT(f);
      if (f < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [ativo, atrasoMs, duracaoMs]);
  return textoContado(texto, easeBack(t));
}

/** O foco vai para dentro: Escape fecha e, ao desmontar, regressa a quem o
 *  tinha. Com `prender`, o Tab também não sai (há uma ação só) — é o que a
 *  escala grande faz, por ser um diálogo modal; o cartão deixa sair. */
function useDialogoModal(botaoRef, fechar, prender) {
  useEffect(() => {
    const antes = typeof document !== 'undefined' ? document.activeElement : null;
    botaoRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') { fechar(); return; }
      if (prender && e.key === 'Tab') {
        e.preventDefault();
        botaoRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (antes && typeof antes.focus === 'function' && document.contains(antes)) antes.focus({ preventScroll: true });
    };
    // `fechar` vem estável de quem monta; re-armar isto perdia o foco anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * @param {object}  p
 * @param {'grande'|'medio'} p.escala
 * @param {object}  p.badge     o badge calculado (utils/badges.js)
 * @param {string}  p.titulo    o nome do que se ganhou (já com o nível, se tiver)
 * @param {string}  p.linha     a frase da conquista
 * @param {number}  p.restantes quantos ficam na fila atrás deste (só na escala grande)
 * @param {Date}    p.now       a hora, para a luz — injetada para os testes
 * @param {Function} p.onClose
 */
export default function BadgeMoment({ escala = 'grande', badge, titulo, linha, restantes = 0, now, onClose }) {
  const reduced = prefersReducedMotion();
  const [final, setFinal] = useState(reduced);
  const botaoRef = useRef(null);
  const timersRef = useRef([]);
  const fechadoRef = useRef(false);
  const grande = escala === 'grande';

  const limparTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  const fechar = useCallback(() => {
    if (fechadoRef.current) return;
    fechadoRef.current = true;
    limparTimers();
    onClose?.();
  }, [onClose]);
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  const fecharEstavel = useCallback(() => fecharRef.current(), []);

  useDialogoModal(botaoRef, fecharEstavel, grande);

  useEffect(() => {
    if (reduced) return undefined;
    const total = tokenMs('--dur-badge-moment', FALLBACK_TOTAL_MS);
    if (grande) {
      timersRef.current = [
        // O disco assenta.
        setTimeout(() => triggerHaptic(15), total * MARCOS.disco),
        // O anel fecha-se: é este o instante do prémio.
        setTimeout(() => triggerHaptic([40, 30, 60]), total * MARCOS.anelFim),
        setTimeout(() => setFinal(true), total),
      ];
    } else {
      // Um háptico leve só, quando o cartão já está à vista.
      timersRef.current = [
        setTimeout(() => triggerHaptic(15), ATRASO_MEDIO_MS),
        setTimeout(() => setFinal(true), ATRASO_MEDIO_MS + tokenMs('--dur-rings', FALLBACK_RINGS_MS)),
      ];
    }
    return limparTimers;
  }, [reduced, grande]);

  const aoTocar = () => {
    // O cartão sai a um toque, sem passo intermédio: a coreografia dele é
    // curta e o × está à vista. Saltar para o fim é da cerimónia grande.
    if (grande && !final) {
      limparTimers();
      setFinal(true);
      return;
    }
    fechar();
  };

  const look = useMemo(() => LOOK[lookKeyForNow(now || new Date())] || LOOK.manha, [now]);
  const cor = corDoBadge(badge);
  const tom = TOM[badge?.cor] || TOM.run;
  const anima = !reduced && !final;
  // Lido uma vez: o token não muda a meio de uma cerimónia.
  const totalMs = useMemo(() => tokenMs('--dur-badge-moment', FALLBACK_TOTAL_MS), []);
  const duracaoAnelMs = useMemo(() => tokenMs('--dur-rings', FALLBACK_RINGS_MS), []);
  const contado = useContagem(badge?.centro, {
    ativo: anima,
    atrasoMs: grande ? totalMs * MARCOS.anelInicio : ATRASO_MEDIO_MS,
    duracaoMs: duracaoAnelMs,
  });
  // O BadgeRing desenha o `centro` que lhe derem: a contagem entra por aqui,
  // sem o anel precisar de saber que há uma cerimónia a acontecer.
  const badgeContado = useMemo(() => (badge ? { ...badge, centro: contado } : null), [badge, contado]);

  if (!badge) return null;

  const rotulo = `Badge novo: ${titulo}`;
  const cta = restantes > 0
    ? `Continuar · e mais ${restantes} ${restantes === 1 ? 'badge' : 'badges'}`
    : 'Continuar';

  const anel = (
    <div className="bm-disc-wrap relative">
      <div className="bm-disc relative inline-flex items-center justify-center">
        {grande && (
          <span
            className="bm-halo absolute rounded-full pointer-events-none"
            aria-hidden="true"
            style={{ inset: -34, background: `radial-gradient(circle, rgba(${tom},${badge.cor === 'neutro' ? '.16' : '.26'}), transparent 68%)` }}
          />
        )}
        <BadgeRing
          badge={badgeContado}
          size={grande ? ANEL_GRANDE : ANEL_MEDIO}
          animate={anima}
          delay={grande ? totalMs * MARCOS.anelInicio : ATRASO_MEDIO_MS}
        />
        {grande && !final && (
          <>
            <span
              className="bm-flash absolute rounded-full pointer-events-none"
              aria-hidden="true"
              style={{ width: 120, height: 120, background: `radial-gradient(circle, rgba(255,255,255,.92) 0%, rgba(${tom},.45) 45%, transparent 70%)` }}
            />
            {SPARKS.map((s) => (
              <span
                key={`${s.sx},${s.sy}`}
                className="bm-spark absolute rounded-full pointer-events-none"
                data-testid="badge-moment-spark"
                aria-hidden="true"
                style={{ '--sx': `${s.sx}px`, '--sy': `${s.sy}px`, width: s.size, height: s.size, background: cor }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );

  const node = grande ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={rotulo}
      data-testid="badge-moment"
      data-escala="grande"
      data-final={final ? 'true' : 'false'}
      className={`ic-bm ic-bm--grande ${final ? 'is-final' : ''}`}
      onClick={aoTocar}
      style={{ background: ambientBackground(look) }}
    >
      {/* O mundo: as curvas de nível da app, centradas no anel e na cor do
          significado do badge. */}
      <svg
        className="bm-contours absolute left-1/2 top-1/2 pointer-events-none"
        width={CONTOUR_VIEW}
        height={CONTOUR_VIEW}
        viewBox={`0 0 ${CONTOUR_VIEW} ${CONTOUR_VIEW}`}
        aria-hidden="true"
        style={{ overflow: 'visible', transform: 'translate(-50%, -50%)' }}
      >
        {CONTOURS.map((c, i) => (
          <polyline key={i} points={c.points} fill="none" stroke={cor} strokeOpacity={c.opacity} strokeWidth="1" />
        ))}
      </svg>

      <div className="ic-bm-col">
        <div className="bm-eyebrow text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.2em', color: cor }}>
          Badge novo
        </div>

        <div style={{ marginTop: 44 }}>{anel}</div>

        <div className="bm-caption text-center" style={{ marginTop: 40 }}>
          <div className="text-[20px] font-black" style={{ letterSpacing: '-.02em', color: 'var(--text-1)' }}>{titulo}</div>
          {linha && <div className="text-[12.5px] mt-[6px] leading-[1.5]" style={{ color: 'var(--text-3)' }}>{linha}</div>}
        </div>

        <div className="bm-cta" style={{ position: 'absolute', left: 24, right: 24, bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }}>
          <button
            ref={botaoRef}
            type="button"
            data-testid="badge-moment-cta"
            onClick={(e) => { e.stopPropagation(); fechar(); }}
            className="w-full flex items-center justify-center rounded-[11px] text-[12.5px] font-extrabold"
            style={{ minHeight: 44, background: 'rgba(255,255,255,.06)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}
          >
            {cta}
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={rotulo}
      data-testid="badge-moment"
      data-escala="medio"
      data-final={final ? 'true' : 'false'}
      className={`ic-bm ic-bm--medio ${final ? 'is-final' : ''}`}
      onClick={aoTocar}
    >
      <div
        className="bm-card flex items-center gap-3"
        style={{
          padding: '12px 12px 12px 14px',
          borderRadius: 18,
          background: 'var(--bg-sheet)',
          border: '1px solid var(--border-glass-strong)',
          boxShadow: '0 18px 46px rgba(0,0,0,.45)',
          backdropFilter: 'blur(14px)',
        }}
      >
        {anel}
        <span className="flex flex-col min-w-0 flex-1" style={{ gap: 3 }}>
          <span className="text-[10px] font-extrabold uppercase" style={{ letterSpacing: '.16em', color: cor }}>Badge novo</span>
          <span className="text-[14px] font-black leading-[1.2] truncate" style={{ color: 'var(--text-1)' }}>{titulo}</span>
          {linha && <span className="text-[11.5px] leading-[1.35]" style={{ color: 'var(--text-3)' }}>{linha}</span>}
        </span>
        <button
          ref={botaoRef}
          type="button"
          aria-label="Fechar"
          data-testid="badge-moment-cta"
          onClick={(e) => { e.stopPropagation(); fechar(); }}
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 44, height: 44, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass)', color: 'var(--text-3)' }}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node;
}
