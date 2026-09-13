import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './coachBubbles';

/**
 * Animar quando se VÊ, não quando monta (pedido 2026-09-13).
 *
 * Até aqui as animações do ponto 9 (barras a crescer, números a contar,
 * anéis a desenhar) corriam "uma vez por sessão", à montagem
 * (`useIntroAnimation`). Na prática não se viam: a PWA quase nunca fecha a
 * sessão, e o Dashboard monta os cinco módulos de uma vez no carrossel —
 * os gráficos animavam fora do ecrã e, quando o atleta deslizava para lá,
 * já estavam quietos.
 *
 * A regra passa a ser:
 * - o elemento fica invisível (`visibility: hidden`, sem mexer no layout)
 *   até entrar no ecrã, e a animação corre nesse momento;
 * - volta a correr quando o elemento SAI DE LADO e regressa — é o que
 *   acontece ao trocar de separador no carrossel do Dashboard. Sair por
 *   cima ou por baixo (scroll) não re-arma: contar de novo a cada scroll
 *   cansa;
 * - trocar de ecrã na barra desmonta o ecrã, e voltar monta-o de novo,
 *   por isso anima outra vez;
 * - com `prefers-reduced-motion`, ou sem IntersectionObserver (jsdom dos
 *   testes, browsers antigos), nada se esconde e nada anima.
 *
 * Uso: pôr `ref` e `style` no elemento a observar, `key={playKey}` no que
 * tem de recomeçar a animação (um gráfico do Chart.js só anima ao montar),
 * e `animate` onde se decide se anima.
 */

/** Quanto do elemento tem de estar à vista para contar como "visto". */
export const REVEAL_MIN_VISIBLE_PX = 80;
export const REVEAL_MIN_VISIBLE_RATIO = 0.3;

const THRESHOLDS = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1];

export function useRevealAnimation({ enabled = true } = {}) {
  const supported = typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
  const active = enabled && supported && !prefersReducedMotion();

  // O ref só guarda o elemento quando há o que observar. Guardá-lo sempre
  // forçava um segundo render logo a seguir à montagem — inofensivo no
  // browser, mas no jsdom o Chart.js tentava atualizar um canvas dado como
  // desligado e rebentava (NutritionDashboard.test, 2026-09-13). Inativo,
  // o componente fica exatamente como era.
  const activeRef = useRef(active);
  activeRef.current = active;
  const [node, setNode] = useState(null);
  const ref = useCallback((el) => { if (activeRef.current) setNode(el); }, []);

  const [state, setState] = useState(() => ({ shown: !active, play: 0 }));

  useEffect(() => {
    if (!active || !node) return undefined;
    const observer = new window.IntersectionObserver((entries) => {
      for (const entry of entries) {
        const box = entry.boundingClientRect;
        const seen = entry.intersectionRect;
        // Altura E largura: a página seguinte do carrossel do Dashboard
        // espreita uns 16px na margem, e com a altura toda "à vista" contava
        // como vista — o gráfico animava antes de o atleta deslizar para lá.
        const needHeight = Math.min(REVEAL_MIN_VISIBLE_PX, box.height * REVEAL_MIN_VISIBLE_RATIO);
        const needWidth = Math.min(REVEAL_MIN_VISIBLE_PX, (box.width || 0) * REVEAL_MIN_VISIBLE_RATIO);
        const seenWidth = seen.width ?? box.width ?? 0;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        if (entry.isIntersecting && seen.height >= needHeight && seenWidth >= needWidth) {
          setState((s) => (s.shown ? s : { shown: true, play: s.play + 1 }));
        } else {
          // Re-arma quando saiu DE LADO: por completo, ou ficando só a lasca
          // que o carrossel deixa a espreitar na margem (a página anterior
          // fica com uns 16px à vista, e nunca chegava a "sair").
          const offSideways = box.left < 0 || box.right > viewportWidth;
          const gone = !entry.isIntersecting || seenWidth < needWidth;
          if (offSideways && gone) setState((s) => (s.shown ? { shown: false, play: s.play } : s));
        }
      }
    }, { threshold: THRESHOLDS });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, node]);

  return {
    ref,
    playKey: state.play,
    animate: active && state.play > 0,
    style: active && !state.shown ? { visibility: 'hidden' } : undefined,
  };
}
