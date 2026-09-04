import { useCallback, useEffect, useRef, useState } from 'react';

const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
// "back" com overshoot — a pílula ultrapassa levemente o alvo antes de
// assentar, o toque elástico ("slime") em vez de um travão seco.
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/**
 * Pílula indicadora "elástica" para barras de separadores (subnav): ao
 * trocar de índice, em vez de saltar em fases distintas, desliza num único
 * movimento contínuo (requestAnimationFrame, não CSS transition) que
 * primeiro estica a cobrir todo o trajeto entre o separador antigo e o novo
 * (engolindo os que ficam pelo meio) e depois contrai até assentar só no
 * novo, com um leve overshoot elástico — por serem frames calculados, não
 * duas transições CSS encadeadas, não há "salto" ao trocar de animação a
 * meio. Mede as posições reais dos botões (getBoundingClientRect) em vez de
 * usar % fixas, para funcionar com qualquer número/largura de separadores.
 * Extraído do Dashboard/Perfil, onde o mesmo subnav (glass + pílula
 * translúcida) se repetia com a mesma mecânica.
 *
 * @param containerRef ref do contentor do subnav (o pai relative/overflow-hidden)
 * @param activeIndex índice do separador ativo
 * @returns { indicatorStyle, setItemRef } — indicatorStyle vai direto no
 *   style inline da pílula (left/width/transition); setItemRef(i) é o
 *   callback ref a passar a cada botão de separador.
 */
export function useElasticPillIndicator(containerRef, activeIndex) {
  const itemRefs = useRef([]);
  const [indicatorStyle, setIndicatorStyle] = useState(null);
  const prevIndexRef = useRef(activeIndex);
  const rectRef = useRef(null); // última posição visual real (continuar de forma fluida se o alvo mudar a meio da animação)
  const rafRef = useRef(null);

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

  const animate = useCallback((fromRect, toRect) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const spanLeft = Math.min(fromRect.left, toRect.left);
    const spanRight = Math.max(fromRect.left + fromRect.width, toRect.left + toRect.width);
    // Mais separadores de distância => mais tempo de deslize, para não
    // parecer apressado nem parecer um salto num trajeto longo.
    const distance = toRect.width > 0 ? Math.round(Math.abs(toRect.left - fromRect.left) / toRect.width) : 1;
    const duration = Math.min(950, 420 + distance * 130);
    const start = performance.now();

    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      let left, right;
      if (p < 0.45) {
        // Fase de esticar (0–45% do trajeto no tempo).
        const g = easeOutCubic(p / 0.45);
        left = lerp(fromRect.left, spanLeft, g);
        right = lerp(fromRect.left + fromRect.width, spanRight, g);
      } else {
        // Fase de contrair até ao alvo, com overshoot.
        const s = easeOutBack((p - 0.45) / 0.55);
        left = lerp(spanLeft, toRect.left, s);
        right = lerp(spanRight, toRect.left + toRect.width, s);
      }
      setRect({ left, width: Math.max(0, right - left) });

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setRect(toRect);
        rafRef.current = null;
      }
    };
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
    animate(rectRef.current || measure(prevIdx) || target, target);
  }, [activeIndex, measure, animate, setRect]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
