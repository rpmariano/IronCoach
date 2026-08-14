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
    if (scrollRef.current && scrollRef.current.offsetWidth > 0) {
      const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      changeCard(idx);
    }
  }, [scrollRef, changeCard]);

  const handleTouchMove = useCallback(() => {
    if (scrollRef.current && scrollRef.current.offsetWidth > 0) {
      const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      changeCard(idx);
    }
  }, [scrollRef, changeCard]);

  const scrollTo = useCallback((idx) => {
    const targetIdx = Math.max(0, Math.min(itemCount - 1, idx));
    if (targetIdx !== activeIndexRef.current) {
      changeCard(targetIdx);
    } else {
      triggerCarouselTick();
    }
    if (scrollRef.current) {
      if (typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ left: targetIdx * (scrollRef.current.offsetWidth || 0), behavior: 'smooth' });
      } else {
        scrollRef.current.scrollLeft = targetIdx * (scrollRef.current.offsetWidth || 0);
      }
    }
  }, [scrollRef, itemCount, changeCard]);

  return { handleScroll, handleTouchMove, scrollTo, changeCard };
}
