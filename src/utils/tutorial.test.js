import { describe, it, expect, beforeEach } from 'vitest';
import {
  TUTORIAL_STEPS,
  tutorialLocalKey,
  isTutorialDoneLocally,
  markTutorialDoneLocally,
  resetTutorialLocally,
} from './tutorial';

describe('tutorial utils', () => {
  const userId = 'user-test-123';

  beforeEach(() => {
    localStorage.clear();
  });

  it('tem 5 passos definidos e válidos', () => {
    expect(TUTORIAL_STEPS).toHaveLength(5);
    TUTORIAL_STEPS.forEach((step) => {
      expect(step.id).toBeDefined();
      expect(step.title).toBeDefined();
      expect(step.description).toBeDefined();
      expect(step.badge).toBeDefined();
    });
  });

  it('gera chave local correta por utilizador', () => {
    expect(tutorialLocalKey('abc')).toBe('ironcoach_tutorial_done_abc');
    expect(tutorialLocalKey(null)).toBe('ironcoach_tutorial_done_anon');
  });

  it('gere o estado de conclusão em localStorage', () => {
    expect(isTutorialDoneLocally(userId)).toBe(false);
    markTutorialDoneLocally(userId);
    expect(isTutorialDoneLocally(userId)).toBe(true);
    resetTutorialLocally(userId);
    expect(isTutorialDoneLocally(userId)).toBe(false);
  });
});
