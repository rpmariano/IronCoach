/**
 * Utility for triggering haptic (vibration) feedback on supported devices.
 * Uses navigator.vibrate with safety checks for browser compatibility and permission limits.
 *
 * @param {number|number[]} [pattern=10] - Vibration duration in ms or pattern array.
 */
export function triggerHaptic(pattern = 10) {
  if (
    typeof window !== 'undefined' &&
    typeof window.navigator !== 'undefined' &&
    typeof window.navigator.vibrate === 'function'
  ) {
    try {
      window.navigator.vibrate(pattern);
    } catch {
      // Ignore errors if vibration is disallowed by browser/system settings
    }
  }
}
