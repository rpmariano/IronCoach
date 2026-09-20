import { useEffect, useRef } from 'react';

/**
 * A altura do carrossel de separadores segue a PÁGINA ATIVA.
 *
 * `.tab-swipe-carousel` é um flex container com `align-items: flex-start`
 * (globals.css): as páginas não se esticam umas às outras, mas a altura do
 * CONTENTOR continua a ser a da página mais alta de todas. Num separador
 * curto sobrava esse vão inteiro por baixo do conteúdo — dava para rolar
 * páginas de nada, como se faltasse ecrã por carregar. Foi o que o
 * utilizador relatou a partir do Perfil: «quando fazemos scroll, o limite
 * de scroll tem de ser ajustado ao conteúdo existente em cada tela».
 *
 * O padrão já existia, escrito à mão dentro do formulário da prova
 * (RunAgenda); está aqui para os três ecrãs de carrossel o partilharem —
 * Perfil, Dashboard e o próprio RunAgenda.
 *
 * Fixar a altura obriga a `overflow-y: hidden` no contentor: sem isso, o
 * `overflow-x: auto` do CSS faz o browser promover também o eixo vertical a
 * `auto` e o carrossel ganhava um segundo scroll vertical dentro do scroll
 * da página. Cortar é o que se quer — o que fica de fora é sempre conteúdo
 * das páginas INATIVAS, que ninguém está a ler.
 *
 * O ResizeObserver mantém a altura certa quando a página ativa cresce
 * depois de montada (dados a chegar, um acordeão a abrir, uma análise da
 * Carol a aparecer).
 *
 * @param scrollRef   ref do `.tab-swipe-carousel`
 * @param pageRefs    ref com o array dos elementos `.tab-swipe-page`
 * @param activeIndex índice da página visível
 */
export default function useCarouselActiveHeight(scrollRef, pageRefs, activeIndex) {
  // Lido dentro do efeito sem o pôr nas dependências: o array é mutado pelas
  // callback refs, não substituído, por isso nunca dispararia nada.
  const indexRef = useRef(activeIndex);
  indexRef.current = activeIndex;

  useEffect(() => {
    const carousel = scrollRef.current;
    if (!carousel) return undefined;

    carousel.style.transition = 'height 0.3s cubic-bezier(0.25, 1, 0.5, 1)';
    carousel.style.overflowY = 'hidden';

    const pageAt = (i) => pageRefs.current?.[i] || carousel.children[i] || null;

    let activeEl = pageAt(indexRef.current >= 0 ? indexRef.current : 0);
    let observer = null;

    const updateHeight = () => {
      if (!activeEl) return;
      const next = activeEl.scrollHeight;
      // scrollHeight 0 é um painel ainda por pintar (lazy, display:none):
      // manter a altura anterior é melhor do que colapsar o ecrã a zero.
      if (next > 0) carousel.style.height = `${next}px`;
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined' && activeEl) {
      observer = new ResizeObserver(updateHeight);
      observer.observe(activeEl);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [scrollRef, pageRefs, activeIndex]);
}
