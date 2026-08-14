import { useRef, useCallback } from 'react';

let audioCtx = null;

/**
 * Triggers haptic (vibration) feedback on supported devices.
 * Uses navigator.vibrate with safety checks and a subtle Web Audio tick fallback for iOS devices.
 *
 * @param {number|number[]} [pattern=20] - Vibration duration in ms or pattern array.
 */
export function triggerHaptic(pattern = 20) {
  let vibrated = false;
  if (
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    typeof window.navigator.vibrate === 'function'
  ) {
    try {
      vibrated = window.navigator.vibrate(pattern) !== false;
    } catch {
      vibrated = false;
    }
  }

  // Fallback for iOS / Safari where navigator.vibrate is unavailable
  if (!vibrated && typeof window !== 'undefined') {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        if (!audioCtx || audioCtx.state === 'closed') {
          audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.03);
        gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.03);
      }
    } catch {
      // Ignore audio context errors
    }
  }
}

/**
 * Custom React hook for adding haptic feedback to carousels.
 * Handles touchmove (active gesture context), scroll, and explicit button clicks.
 */
export function useCarouselHaptics(scrollRef, itemCount, currentIndex, setCurrentIndex) {
  const activeIndexRef = useRef(currentIndex);
  activeIndexRef.current = currentIndex;

  const checkIndexAndVibrate = useCallback((newIndex) => {
    if (newIndex >= 0 && newIndex < itemCount && newIndex !== activeIndexRef.current) {
      activeIndexRef.current = newIndex;
      setCurrentIndex(newIndex);
      triggerHaptic(20);
      return true;
    }
    return false;
  }, [itemCount, setCurrentIndex]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current && scrollRef.current.offsetWidth > 0) {
      const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      checkIndexAndVibrate(idx);
    }
  }, [scrollRef, checkIndexAndVibrate]);

  const handleTouchMove = useCallback(() => {
    if (scrollRef.current && scrollRef.current.offsetWidth > 0) {
      const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      checkIndexAndVibrate(idx);
    }
  }, [scrollRef, checkIndexAndVibrate]);

  const scrollTo = useCallback((idx) => {
    const targetIdx = Math.max(0, Math.min(itemCount - 1, idx));
    triggerHaptic(20);
    if (targetIdx !== activeIndexRef.current) {
      activeIndexRef.current = targetIdx;
      setCurrentIndex(targetIdx);
    }
    if (scrollRef.current) {
      if (typeof scrollRef.current.scrollTo === 'function') {
        scrollRef.current.scrollTo({ left: targetIdx * (scrollRef.current.offsetWidth || 0), behavior: 'smooth' });
      } else {
        scrollRef.current.scrollLeft = targetIdx * (scrollRef.current.offsetWidth || 0);
      }
    }
  }, [scrollRef, itemCount, setCurrentIndex]);

  return { handleScroll, handleTouchMove, scrollTo };
}
