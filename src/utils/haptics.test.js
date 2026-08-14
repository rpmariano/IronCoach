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
    expect(vibrateMock).toHaveBeenCalledWith(15);
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

    expect(vibrateMock).toHaveBeenCalledWith(15);
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

    expect(vibrateMock).toHaveBeenCalledWith(15);
    expect(setCurrentIndex).toHaveBeenCalledWith(1);
  });
});
