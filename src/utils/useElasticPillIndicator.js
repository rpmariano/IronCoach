import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './coachBubbles';

const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
// "back" com overshoot — a pílula ultrapassa levemente o alvo antes de
// assentar, o toque elástico ("slime") em vez de um travão seco. O overshoot
// é parametrizável (ver OVERSHOOT_DEFAULT) mas o handoff fixa 1.70158.
export const OVERSHOOT_DEFAULT = 1.70158;
// 45% do tempo a esticar até cobrir origem e destino, 55% a contrair no
// destino — handoff, "Interactions & Behavior", parágrafo "Minhoca".
export const STRETCH_RATIO_DEFAULT = 0.45;

const makeEaseOutBack = (overshoot) => {
  const c1 = overshoot;
  const c3 = c1 + 1;
  return (t) => 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Duração da minhoca na nav inferior: `min(950, 420 + 130·distância)` ms,
 *  com a distância contada em separadores (não em pixéis). Um salto de um
 *  separador demora 550ms; o mais longo dos quatro (Início → Coach) 810ms; o
 *  teto de 950ms (`--dur-pill-nav-max`) existe para nunca virar espera. */
export const navPillDuration = (fromIndex, toIndex) =>
  Math.min(950, 420 + 130 * Math.abs(toIndex - fromIndex));

/** Duração da minhoca nos subnavs — 320ms fixos (`--dur-pill-sub`).
 *  Auditoria, achado 5 ("A minhoca em sete sítios"): os 950ms são assinatura
 *  na nav, mas num subnav que o atleta troca quatro vezes seguidas para
 *  comparar módulos tornam-se espera. */
export const SUBNAV_PILL_DURATION = 320;
export const subPillDuration = () => SUBNAV_PILL_DURATION;

/** Duração quando o sistema pede menos movimento (motion.css leva todos os
 *  tokens de duração a 120ms ou zero em `prefers-reduced-motion`). */
export const REDUCED_MOTION_DURATION = 120;

/**
 * Guarda global da minhoca — "nunca duas em movimento ao mesmo tempo"
 * (handoff, "Interactions & Behavior"). Na prática só há uma pílula por ecrã,
 * mas a nav inferior e um subnav coexistem: tocar no subnav e logo a seguir
 * na nav punha duas a correr.
 *
 * Decisão: a pílula nova **salta a anterior para o fim** em vez de esperar
 * que acabe. Esperar acrescentaria até 950ms de latência a um toque que o
 * atleta acabou de dar — e a pílula anterior já está no separador certo
 * (o estado mudou), por isso saltá-la para o destino não perde informação
 * nenhuma: só encurta o caminho de volta.
 */
let runningPill = null;
export const pillMotion = {
  /** Regista `handle` ({ finish }) como a única animação a correr, terminando
   *  instantaneamente a que estivesse a correr antes. */
  claim(handle) {
    if (runningPill && runningPill !== handle) {
      const previous = runningPill;
      runningPill = null;
      previous.finish();
    }
    runningPill = handle;
  },
  /** Liberta `handle` (fim natural da animação ou desmontagem). */
  release(handle) {
    if (runningPill === handle) runningPill = null;
  },
  isRunning: () => runningPill !== null,
  /** Só para testes — repõe o singleton entre casos. */
  reset: () => { runningPill = null; },
};

/**
 * Pílula indicadora "elástica" ("a minhoca") para barras de separadores: ao
 * trocar de índice, em vez de saltar em fases distintas, desliza num único
 * movimento contínuo (requestAnimationFrame, não CSS transition) que
 * primeiro estica a cobrir todo o trajeto entre o separador antigo e o novo
 * (engolindo os que ficam pelo meio) e depois contrai até assentar só no
 * novo, com um leve overshoot elástico — por serem frames calculados, não
 * duas transições CSS encadeadas, não há "salto" ao trocar de animação a
 * meio. Mede as posições reais dos botões (getBoundingClientRect) em vez de
 * usar % fixas, para funcionar com qualquer número/largura de separadores.
 *
 * @param containerRef ref do contentor (o pai relative/overflow-hidden)
 * @param activeIndex índice do separador ativo
 * @param options
 *   - `duration`: ms, ou `(fromIndex, toIndex) => ms`. Por omissão
 *     `navPillDuration`; nos subnavs passa-se `SUBNAV_PILL_DURATION`.
 *   - `stretchRatio`: fração do tempo na fase de esticar (0.45).
 *   - `overshoot`: overshoot do easeOutBack na fase de contrair (1.70158).
 *   - `reducedMotionDuration`: duração usada com `prefers-reduced-motion`
 *     (120ms, a par de motion.css).
 * @returns { indicatorStyle, setItemRef } — indicatorStyle vai direto no
 *   style inline da pílula (left/width/transition); setItemRef(i) é o
 *   callback ref a passar a cada botão de separador.
 */
export function useElasticPillIndicator(containerRef, activeIndex, options = {}) {
  const {
    duration = navPillDuration,
    stretchRatio = STRETCH_RATIO_DEFAULT,
    overshoot = OVERSHOOT_DEFAULT,
    reducedMotionDuration = REDUCED_MOTION_DURATION,
  } = options;

  const itemRefs = useRef([]);
  const [indicatorStyle, setIndicatorStyle] = useState(null);
  const prevIndexRef = useRef(activeIndex);
  const rectRef = useRef(null); // última posição visual real (continuar de forma fluida se o alvo mudar a meio da animação)
  const rafRef = useRef(null);
  const handleRef = useRef(null); // animação em curso, para a libertar da guarda ao desmontar
  // As opções mudam de identidade a cada render de quem usa o hook (objeto
  // literal inline); guardá-las numa ref evita reiniciar a animação por isso.
  const optsRef = useRef(null);
  optsRef.current = { duration, stretchRatio, overshoot, reducedMotionDuration };

  const measure = useCallback((idx) => {
    const container = containerRef.current;
    const btn = itemRefs.current[idx];
    if (!container || !btn) return null;
    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    return { left: bRect.left - cRect.left, width: bRect.width };
  }, [containerRef]);

  const setRect = useCallback((rect) => {
    rectRef.current = rect;
    setIndicatorStyle({ ...rect, transition: 'none' });
  }, []);

  const animate = useCallback((fromRect, toRect, fromIndex, toIndex) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const opts = optsRef.current;
    const spanLeft = Math.min(fromRect.left, toRect.left);
    const spanRight = Math.max(fromRect.left + fromRect.width, toRect.left + toRect.width);
    const requested = typeof opts.duration === 'function'
      ? opts.duration(fromIndex, toIndex)
      : opts.duration;
    // Com prefers-reduced-motion a minhoca não desaparece — encolhe para
    // 120ms, como motion.css faz às variáveis de duração.
    const total = prefersReducedMotion()
      ? Math.min(requested, opts.reducedMotionDuration)
      : requested;
    const stretch = Math.min(0.99, Math.max(0.01, opts.stretchRatio));
    const easeOutBack = makeEaseOutBack(opts.overshoot);
    const start = performance.now();

    // Handle da guarda global: se outra pílula reclamar o palco, esta salta
    // para o destino em vez de continuar a correr em paralelo.
    const handle = {
      finish: () => {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setRect(toRect);
      },
    };

    handleRef.current = handle;

    const done = () => {
      setRect(toRect);
      rafRef.current = null;
      pillMotion.release(handle);
      if (handleRef.current === handle) handleRef.current = null;
    };

    if (!(total > 0)) { pillMotion.claim(handle); done(); return; }

    const tick = (now) => {
      const p = Math.min(1, (now - start) / total);
      let left, right;
      if (p < stretch) {
        // Fase de esticar (0–45% do trajeto no tempo).
        const g = easeOutCubic(p / stretch);
        left = lerp(fromRect.left, spanLeft, g);
        right = lerp(fromRect.left + fromRect.width, spanRight, g);
      } else {
        // Fase de contrair até ao alvo, com overshoot.
        const s = easeOutBack((p - stretch) / (1 - stretch));
        left = lerp(spanLeft, toRect.left, s);
        right = lerp(spanRight, toRect.left + toRect.width, s);
      }
      setRect({ left, width: Math.max(0, right - left) });

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        done();
      }
    };
    pillMotion.claim(handle);
    rafRef.current = requestAnimationFrame(tick);
  }, [setRect]);

  useEffect(() => {
    const target = measure(activeIndex);
    if (!target) return;
    const prevIdx = prevIndexRef.current;
    prevIndexRef.current = activeIndex;

    if (prevIdx === activeIndex) {
      // Montagem inicial (ou re-render sem troca real) — posiciona sem animar.
      if (!rectRef.current) setRect(target);
      return;
    }

    // Continua a partir da posição visual atual (não da posição "oficial" do
    // separador antigo) — tocar noutro separador a meio da animação retoma
    // o deslize dali em vez de saltar de volta ao início.
    animate(rectRef.current || measure(prevIdx) || target, target, prevIdx, activeIndex);
  }, [activeIndex, measure, animate, setRect]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (handleRef.current) { pillMotion.release(handleRef.current); handleRef.current = null; }
  }, []);

  // Reajusta a posição (sem animar) se a largura do ecrã mudar — ex.: rodar
  // o telemóvel a meio de uma troca de separador.
  useEffect(() => {
    const onResize = () => {
      const target = measure(activeIndex);
      if (target) {
        if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        setRect(target);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIndex, measure, setRect]);

  const setItemRef = useCallback((idx) => (el) => { itemRefs.current[idx] = el; }, []);

  return { indicatorStyle, setItemRef };
}
