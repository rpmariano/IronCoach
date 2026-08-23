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
    if (targetIdx !== activeIndexRef.current) {
      changeCard(targetIdx);
    } else {
      triggerCarouselTick();
    }
    if (scrollRef.current) {
      programmaticScrollRef.current = true;
      if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current);
      // Janela alinhada com a duração típica de um scroll suave entre vários
      // cartões; depois disto, eventos de scroll voltam a ser tratados como
      // vindos do utilizador.
      programmaticScrollTimeoutRef.current = setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 500);
      if (typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ left: targetIdx * (scrollRef.current.offsetWidth || 0), behavior: instant ? 'instant' : 'smooth' });
      } else {
        scrollRef.current.scrollLeft = targetIdx * (scrollRef.current.offsetWidth || 0);
      }
    }
  }, [scrollRef, itemCount, changeCard]);

  return { handleScroll, handleTouchMove, scrollTo, changeCard };
}
