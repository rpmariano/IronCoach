import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAppStore } from './store';
import Auth from './components/Auth/Auth';
import Layout from './components/Layout/Layout';

// Components
import Home from './components/Home/Home';
import Coach from './components/Coach/Coach';
import Nutrition from './components/Nutrition/Nutrition';
import Gym from './components/Gym/Gym';
import Body from './components/Body/Body';
import Run from './components/Run/Run';
import Perfil from './components/Perfil/Perfil';
import Admin from './components/Admin/Admin';

const DEMO_PROFILE = {
  id: 'demo-user',
  full_name: 'Atleta IronHealth',
  gender: 'M',
  height_cm: 178,
  weight_kg: 74.2,
  is_admin: true,
  accent_color: 'orange',
  calorie_goal: 2400,
  protein_goal: 160,
  carbs_goal: 250,
  fat_goal: 65,
  water_goal_ml: 2500,
  goal_weight_kg: 72.0,
  coach_context: 'Objetivo: Sub 1h35 na Meia Maratona do Porto'
};

export default function App() {
  const { session, setSession, setProfile, loadInitialData, activeTab, setActiveTab } = useAppStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // Read ?tab= from URL query params
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSession(session);
        loadInitialData(session.user.id).finally(() => setIsInitializing(false));
      } else {
        // Provide demo fallback session for UI rendering/previews
        const demoSession = { user: { id: 'demo-user', email: 'atleta@ironhealth.app' } };
        setSession(demoSession);
        setProfile(DEMO_PROFILE);
        setIsInitializing(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setSession(session);
        loadInitialData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [setSession, setProfile, loadInitialData, setActiveTab]);

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surf-950)]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 bg-[var(--brd-700)] rounded-full mb-4"></div>
          <div className="h-4 w-24 bg-[var(--brd-700)] rounded"></div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <Layout>
      {activeTab === 'home' && <Home />}
      {activeTab === 'nutricao' && <Nutrition />}
      {activeTab === 'corpo' && <Body />}
      {activeTab === 'ginasio' && <Gym />}
      {activeTab === 'corrida' && <Run />}
      {activeTab === 'coach' && <Coach />}
      {activeTab === 'perfil' && <Perfil />}
      {activeTab === 'admin' && <Admin />}
    </Layout>
  );
}
