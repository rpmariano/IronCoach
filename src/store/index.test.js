import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from './index';

describe('Zustand Store', () => {
  beforeEach(() => {
    // Reset state before each test
    useAppStore.setState({
      profile: null,
      meals: [],
      runs: [],
      coachMessages: [],
      gymSessions: [],
      bodyAssessments: []
    });
  });

  it('should initialize with empty default state', () => {
    const state = useAppStore.getState();
    expect(state.profile).toBeNull();
    expect(state.meals).toEqual([]);
    expect(state.coachMessages).toEqual([]);
  });

  it('should update profile using setProfile/setState directly', () => {
    useAppStore.setState({ profile: { id: 'user-1', name: 'Test User', calorie_goal: 2000 } });
    const state = useAppStore.getState();
    expect(state.profile.name).toBe('Test User');
    expect(state.profile.calorie_goal).toBe(2000);
  });

  it('should add a coach message', () => {
    const message = { id: 1, text: 'Hello from Coach', isCoach: true };
    useAppStore.getState().addCoachMessage(message);
    
    const state = useAppStore.getState();
    expect(state.coachMessages.length).toBe(1);
    expect(state.coachMessages[0].text).toBe('Hello from Coach');
  });
});
