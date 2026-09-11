import { useCallback, useEffect, useRef } from 'react';

/**
 * "O conteúdo segue a pílula" (handoff, Interactions & Behavior; animação 8
 * de `IronCoach - Animacoes.dc.html`): ao trocar de separador, o painel que
 * fica ativo entra com `translateX(14px) → 0` mais uma pitada de opacidade,
 * em `--dur-tab-content` (280ms), a par dos 320ms da minhoca. Sem isto a
 * pílula move-se e o ecrã salta.
 *
 * Entra do lado de onde veio: para um separador à direita entra de +14px,
 * para um à esquerda de −14px.
 *
 * Implementado a reiniciar a animação CSS (`.tab-enter`, globals.css) em vez
 * de remontar o painel com uma `key` nova — os separadores do Dashboard e do
 * Perfil ficam todos montados de propósito (o carrossel de scroll-snap
 * exige-o, e é o que preserva filtros/rascunhos ao deslizar entre eles).
 *
 * `prefers-reduced-motion` não precisa de ramo aqui: a regra global de
 * globals.css já leva qualquer animação a .01ms.
 *
 * @param activeIndex índice do separador ativo
 * @returns setPageRef(i) — callback ref para o painel de cada separador
 */
export function useTabEnter(activeIndex) {
  const refs = useRef([]);
  const prevIndexRef = useRef(activeIndex);

  useEffect(() => {
    const from = prevIndexRef.current;
    prevIndexRef.current = activeIndex;
    if (from === activeIndex) return; // montagem, ou re-render sem troca real

    const el = refs.current[activeIndex];
    if (!el) return;

    el.style.setProperty('--tab-enter-from', from < activeIndex ? '14px' : '-14px');
    el.classList.remove('tab-enter');
    // Forçar reflow: sem isto o browser junta o remove e o add no mesmo
    // frame e a animação não reinicia em trocas seguidas.
    void el.offsetWidth;
    el.classList.add('tab-enter');
  }, [activeIndex]);

  return useCallback((idx) => (el) => { refs.current[idx] = el; }, []);
}

export default useTabEnter;
