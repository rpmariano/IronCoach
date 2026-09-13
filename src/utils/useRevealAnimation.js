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
 * - o elemento fica transparente (`opacity: 0`, sem mexer no layout e sem
 *   sair da ordem do Tab nem da árvore de acessibilidade: focar um botão lá
 *   dentro faz scroll até ele e revela-o) até entrar no ecrã, e a animação
 *   corre nesse momento;
 * - `animate` só fica ligado durante a janela da animação
 *   (REVEAL_ANIMATION_WINDOW_MS) depois de cada aparecimento: mudar o
 *   período ou trocar de prova nas setas atualiza os números sem os voltar
 *   a contar de zero;
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

/** Quanto tempo `animate` fica ligado depois de aparecer: cobre a contagem
 *  (--dur-count, 1400ms) e as barras (--dur-bars 550ms + desfasamento). */
export const REVEAL_ANIMATION_WINDOW_MS = 1600;

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
  // O `play` cuja animação já acabou. Enquanto for diferente do `play` atual,
  // anima; e como é o `play` que sobe, o que remonta com o novo `key` monta
  // já a animar, no mesmo render.
  const [settledPlay, setSettledPlay] = useState(0);

  useEffect(() => {
    if (!active || state.play === 0) return undefined;
    const timer = setTimeout(() => setSettledPlay(state.play), REVEAL_ANIMATION_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [active, state.play]);

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
        if (entry.isIntersecting && seen.height >= needHeight && seenWidth >= needWidth) {
          setState((s) => (s.shown ? s : { shown: true, play: s.play + 1 }));
        } else {
          // Re-arma quando saiu DE LADO, que é a troca de separador no
          // carrossel. Não basta comparar com a largura da janela: no desktop
          // a coluna é estreita e centrada, e a página vizinha fica dentro.
          // - A espreitar (a lasca de 16px na margem): o corte é lateral
          //   quando o que se vê começa depois ou acaba antes da caixa.
          // - Fora por completo: se a caixa está dentro da janela na vertical,
          //   só pode ter sido cortada de lado. Fora por cima ou por baixo é
          //   scroll, e isso não re-arma.
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const seenLeft = seen.left ?? box.left;
          const seenRight = seen.right ?? box.right;
          const sliverSideways = entry.isIntersecting && seenWidth < needWidth
            && (seenLeft > box.left + 1 || seenRight < box.right - 1 || box.left < 0 || box.right > viewportWidth);
          const verticallyInView = (box.bottom ?? 0) > 0 && (box.top ?? viewportHeight) < viewportHeight;
          const goneSideways = !entry.isIntersecting && verticallyInView;
          if (sliverSideways || goneSideways) setState((s) => (s.shown ? { shown: false, play: s.play } : s));
        }
      }
    }, { threshold: THRESHOLDS });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, node]);

  return {
    ref,
    playKey: state.play,
    animate: active && state.play > 0 && settledPlay !== state.play,
    style: active && !state.shown ? { opacity: 0 } : undefined,
  };
}
