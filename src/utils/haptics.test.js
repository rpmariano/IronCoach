import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { triggerCarouselTick, triggerHaptic, useCarouselHaptics } from './haptics';

describe('haptics utility', () => {
  const originalVibrate = window.navigator.vibrate;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalVibrate) {
      window.navigator.vibrate = originalVibrate;
    } else {
      delete window.navigator.vibrate;
    }
  });

  it('triggerCarouselTick calls navigator.vibrate with 15ms tick pattern', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;

    triggerCarouselTick();
    expect(vibrateMock).toHaveBeenCalledWith(30);
  });

  it('triggerHaptic calls navigator.vibrate with pattern', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;

    triggerHaptic(15);
    expect(vibrateMock).toHaveBeenCalledWith(15);
  });

  it('handles missing navigator.vibrate gracefully without throwing', () => {
    delete window.navigator.vibrate;
    expect(() => triggerCarouselTick()).not.toThrow();
  });
});

describe('useCarouselHaptics hook', () => {
  it('triggers haptic on scrollTo and updates scroll position', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;

    const scrollRef = {
      current: {
        offsetWidth: 300,
        scrollLeft: 0,
        scrollTo: vi.fn(),
      },
    };
    const setCurrentIndex = vi.fn();

    const { result } = renderHook(() => useCarouselHaptics(scrollRef, 3, 0, setCurrentIndex));

    act(() => {
      result.current.scrollTo(1);
    });

    expect(vibrateMock).toHaveBeenCalledWith(30);
    expect(setCurrentIndex).toHaveBeenCalledWith(1);
    expect(scrollRef.current.scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });
  });

  it('triggers haptic on touchmove when index changes', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;

    const scrollRef = {
      current: {
        offsetWidth: 300,
        scrollLeft: 300,
      },
    };
    const setCurrentIndex = vi.fn();

    const { result } = renderHook(() => useCarouselHaptics(scrollRef, 3, 0, setCurrentIndex));

    act(() => {
      result.current.handleTouchMove();
    });

    expect(vibrateMock).toHaveBeenCalledWith(30);
    expect(setCurrentIndex).toHaveBeenCalledWith(1);
  });

  it('ignores intermediate onScroll events fired by its own scrollTo animation (regression: clicking a distant tab landed on the wrong one)', () => {
    vi.useFakeTimers();
    const vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;

    const scrollRef = {
      current: {
        offsetWidth: 300,
        scrollLeft: 0,
        scrollTo: vi.fn(({ left }) => { scrollRef.current.scrollLeft = left; }),
      },
    };
    const setCurrentIndex = vi.fn();

    const { result } = renderHook(() => useCarouselHaptics(scrollRef, 5, 0, setCurrentIndex));

    // Clique num separador distante (índice 0 -> 3), como acontece ao saltar
    // de "Corrida" para "Corpo" no Dashboard.
    act(() => {
      result.current.scrollTo(3);
    });
    expect(setCurrentIndex).toHaveBeenCalledWith(3);
    setCurrentIndex.mockClear();

    // O scroll nativo em curso passa por posições intermédias (1 e 2) e
    // dispara "scroll" para cada uma — estas NÃO podem sobrepor-se ao
    // índice 3 já definido pelo clique.
    act(() => {
      scrollRef.current.scrollLeft = 300; // índice 1
      result.current.handleScroll();
      scrollRef.current.scrollLeft = 600; // índice 2
      result.current.handleScroll();
    });
    expect(setCurrentIndex).not.toHaveBeenCalled();

    // Depois da janela de supressão, um scroll genuíno do utilizador volta a
    // ser respeitado normalmente. A janela cresce com a distância percorrida
    // (550ms + 220ms por separador saltado) — para uma distância de 3 são
    // precisos 1210ms, não os 500ms fixos de antes (era exatamente esse
    // teto curto que causava a regressão descrita no título deste teste).
    act(() => {
      vi.advanceTimersByTime(1210);
    });
    act(() => {
      scrollRef.current.scrollLeft = 300; // índice 1
      result.current.handleScroll();
    });
    expect(setCurrentIndex).toHaveBeenCalledWith(1);

    vi.useRealTimers();
  });

  it('handleTouchMove cancels scroll suppression so a genuine gesture takes over immediately', () => {
    vi.useFakeTimers();
    const vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;

    const scrollRef = {
      current: {
        offsetWidth: 300,
        scrollLeft: 0,
        scrollTo: vi.fn(({ left }) => { scrollRef.current.scrollLeft = left; }),
      },
    };
    const setCurrentIndex = vi.fn();

    const { result } = renderHook(() => useCarouselHaptics(scrollRef, 5, 0, setCurrentIndex));

    act(() => {
      result.current.scrollTo(3);
    });
    setCurrentIndex.mockClear();

    act(() => {
      scrollRef.current.scrollLeft = 300; // índice 1, ainda dentro da animação
      result.current.handleTouchMove();
    });
    expect(setCurrentIndex).toHaveBeenCalledWith(1);

    vi.useRealTimers();
  });
});
