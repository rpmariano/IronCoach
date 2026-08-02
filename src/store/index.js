import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const useAppStore = create((set, get) => ({
  // Auth & Profile State
  session: null,
  profile: null,
  isAdmin: false,
  
  // App Data State (mimicking the legacy 'state' object)
  meals: [],
  bodyAssessments: [],
  gymSessions: [],
  runs: [],
  waterLogs: [],
  
  // Coach State
  coachMessages: [],
  coachLoading: false,
  coachSuggestions: [],
  
  // UI State
  activeTab: 'home',
  homeLayout: ['weight_kg', 'body_fat_pct', 'protein_today', 'corrida_km', 'corrida_pace', 'gym_sessions', 'gym_volume'],
  
  // Actions
  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile, isAdmin: profile?.is_admin || false }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  // Coach Actions
  addCoachMessage: (msg) => set((state) => ({ coachMessages: [...state.coachMessages, msg] })),
  setCoachLoading: (loading) => set({ coachLoading: loading }),
  clearCoachChat: () => set({ coachMessages: [], coachSuggestions: [] }),
  setCoachSuggestions: (suggestions) => set({ coachSuggestions: suggestions }),

  // Data Actions
  setMeals: (meals) => set({ meals }),
  setRuns: (runs) => set({ runs }),
  setGymSessions: (sessions) => set({ gymSessions: sessions }),
  setBodyAssessments: (assessments) => set({ bodyAssessments: assessments }),

  // Fetch initial user data (called after login)
  loadInitialData: async (userId) => {
    try {
      // 1. Fetch Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (profile) {
        set({ profile, isAdmin: profile.is_admin });
      }

      // 2. Fetch all app data concurrently
      const [
        { data: meals },
        { data: runs },
        { data: gymSessions },
        { data: bodyAssessments },
        { data: waterLogs }
      ] = await Promise.all([
        supabase.from('meals').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('runs').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('workout_sessions').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('body_assessments').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('water_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      ]);

      set({
        meals: meals || [],
        runs: runs || [],
        gymSessions: gymSessions || [],
        bodyAssessments: bodyAssessments || [],
        waterLogs: waterLogs || []
      });

    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  }
}));
