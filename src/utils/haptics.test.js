import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { triggerHaptic, useCarouselHaptics } from './haptics';

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

  it('calls navigator.vibrate with default 20ms pattern', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;

    triggerHaptic();
    expect(vibrateMock).toHaveBeenCalledWith(20);
  });

  it('calls navigator.vibrate with custom pattern', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;

    triggerHaptic(30);
    expect(vibrateMock).toHaveBeenCalledWith(30);
  });

  it('handles missing navigator.vibrate gracefully using Web Audio fallback', () => {
    delete window.navigator.vibrate;
    expect(() => triggerHaptic(20)).not.toThrow();
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

    expect(vibrateMock).toHaveBeenCalled();
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

    expect(vibrateMock).toHaveBeenCalledWith(20);
    expect(setCurrentIndex).toHaveBeenCalledWith(1);
  });
});
