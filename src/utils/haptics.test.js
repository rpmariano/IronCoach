import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerHaptic } from './haptics';

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

  it('calls navigator.vibrate with default 10ms pattern', () => {
    const vibrateMock = vi.fn();
    window.navigator.vibrate = vibrateMock;

    triggerHaptic();
    expect(vibrateMock).toHaveBeenCalledWith(10);
  });

  it('calls navigator.vibrate with custom pattern', () => {
    const vibrateMock = vi.fn();
    window.navigator.vibrate = vibrateMock;

    triggerHaptic(25);
    expect(vibrateMock).toHaveBeenCalledWith(25);
  });

  it('handles missing navigator.vibrate gracefully without throwing', () => {
    delete window.navigator.vibrate;
    expect(() => triggerHaptic(10)).not.toThrow();
  });

  it('catches and ignores thrown errors during vibrate call', () => {
    window.navigator.vibrate = vi.fn().mockImplementation(() => {
      throw new Error('User gesture required');
    });
    expect(() => triggerHaptic(10)).not.toThrow();
  });
});
