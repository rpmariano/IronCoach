import { useRef, useCallback } from 'react';

/**
 * 15ms é o intervalo ideal para um feedback tátil de transição suave em carrosséis,
 * simulando o clique físico de uma roda dentada (tick) à medida que o utilizador desliza.
 */
export const triggerCarouselTick = () => {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      // 30ms para garantir que motores de vibração Android mais lentos registam o feedback
      navigator.vibrate(30);
    } catch {
      // Evita quebras em navegadores que bloqueiem a API
    }
  }
};

export const triggerHaptic = (pattern = 15) => {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Evita quebras em navegadores que bloqueiem a API
    }
  }
};

/**
 * Custom React hook for adding haptic feedback to carousels.
 * Dispara o feedback tátil (15ms tick) sempre que o cartão ativo muda
 * (via botões, paginação, swipe/touch ou scroll).
 */
export function useCarouselHaptics(scrollRef, itemCount, currentIndex, setCurrentIndex) {
  const activeIndexRef = useRef(currentIndex);
  activeIndexRef.current = currentIndex;

  // Enquanto uma animação de scroll disparada por nós (scrollTo, ex.: clique
  // num separador) está em curso, o próprio scroll nativo passa por índices
  // intermédios (ex.: 0 -> 1 -> 2 -> 3) e dispara eventos "scroll" para cada
  // um deles. Sem esta guarda, handleScroll interpretava essas posições
  // intermédias como a nova seleção do utilizador e sobrepunha-se ao índice
  // final já definido de forma síncrona pelo próprio scrollTo — na prática,
  // clicar num separador distante (não adjacente) podia acabar por "voltar"
  // ao separador errado. O swipe manual nunca passa por aqui porque só move
  // um índice de cada vez, por isso o problema só era visível ao clicar.
  const programmaticScrollRef = useRef(false);
  const programmaticScrollTimeoutRef = useRef(null);
  const programmaticScrollEndCleanupRef = useRef(null);

  const changeCard = useCallback((newIndex) => {
    if (newIndex >= 0 && newIndex < itemCount && newIndex !== activeIndexRef.current) {
      activeIndexRef.current = newIndex;
      setCurrentIndex(newIndex);
      triggerCarouselTick();
      return true;
    }
    return false;
  }, [itemCount, setCurrentIndex]);

  const handleScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    if (scrollRef.current && scrollRef.current.offsetWidth > 0) {
      const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      changeCard(idx);
    }
  }, [scrollRef, changeCard]);

  const handleTouchMove = useCallback(() => {
    // Um toque real do utilizador significa que ele está a assumir o
    // controlo do carrossel — cancela de imediato a supressão de scroll
    // programático para que o gesto responda sem atraso.
    programmaticScrollRef.current = false;
    if (scrollRef.current && scrollRef.current.offsetWidth > 0) {
      const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      changeCard(idx);
    }
  }, [scrollRef, changeCard]);

  const scrollTo = useCallback((idx, instant = false) => {
    const targetIdx = Math.max(0, Math.min(itemCount - 1, idx));
    const distance = Math.abs(targetIdx - activeIndexRef.current);
    if (targetIdx !== activeIndexRef.current) {
      changeCard(targetIdx);
    } else {
      triggerCarouselTick();
    }
    if (scrollRef.current) {
      const el = scrollRef.current;
      programmaticScrollRef.current = true;
      if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
      if (programmaticScrollEndCleanupRef.current) {
        programmaticScrollEndCleanupRef.current();
        programmaticScrollEndCleanupRef.current = null;
      }

      const clearGuard = () => { programmaticScrollRef.current = false; };

      // scrollend (quando suportado) é o sinal exato de que a animação
      // nativa acabou — mais preciso do que um temporizador fixo.
      if ('onscrollend' in el) {
        const onScrollEnd = () => { clearGuard(); el.removeEventListener('scrollend', onScrollEnd); };
        el.addEventListener('scrollend', onScrollEnd);
        programmaticScrollEndCleanupRef.current = () => el.removeEventListener('scrollend', onScrollEnd);
      }

      // Rede de segurança para quando scrollend não existe (ou nunca dispara,
      // ex.: alvo igual à posição atual): a duração real do scroll suave
      // nativo cresce com a distância percorrida — saltar 2+ separadores
      // (ex.: de um do meio para o da ponta) podia ultrapassar folgadamente
      // os 500ms fixos de antes, a guarda caía a meio da animação e o
      // próximo evento de scroll, apanhado numa posição intermédia, era lido
      // como a escolha do utilizador — o separador "saltava" para o destino
      // e logo a seguir "voltava" para o vizinho.
      programmaticScrollTimeoutRef.current = setTimeout(clearGuard, instant ? 60 : 550 + distance * 220);

      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ left: targetIdx * (el.offsetWidth || 0), behavior: instant ? 'instant' : 'smooth' });
      } else {
        el.scrollLeft = targetIdx * (el.offsetWidth || 0);
      }
    }
  }, [scrollRef, itemCount, changeCard]);

  return { handleScroll, handleTouchMove, scrollTo, changeCard };
}
