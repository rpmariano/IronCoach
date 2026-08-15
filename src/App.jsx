import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { registerServiceWorker } from './lib/push';
import { useAppStore } from './store';
import Auth from './components/Auth/Auth';
import Layout from './components/Layout/Layout';
import { ToastProvider } from './components/shared/ToastProvider';

// Components
import Home from './components/Home/Home';
import Coach from './components/Coach/Coach';
import Nutrition from './components/Nutrition/Nutrition';
import Gym from './components/Gym/Gym';
import Body from './components/Body/Body';
import Run from './components/Run/Run';
import Perfil from './components/Perfil/Perfil';
import Admin from './components/Admin/Admin';
import Dashboard from './components/Dashboard/Dashboard';
import Calendar from './components/Calendar/Calendar';
import RunAgenda from './components/Run/RunAgenda';

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

import ButtonShowcase from './components/DesignSystem/ButtonShowcase';

export default function App() {
  const { session, setSession, setProfile, loadInitialData, activeTab, setActiveTab, openCreationMode, setOpenCreationMode, editingRaceId, setEditingRaceId } = useAppStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    registerServiceWorker();

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const isDemo = params.get('demo') === 'true';

    if (tabParam) {
      setActiveTab(tabParam);
    }

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        setSession(existingSession);
        loadInitialData(existingSession.user.id).finally(() => setIsInitializing(false));
      } else if (isDemo) {
        const demoSession = { user: { id: 'demo-user', email: 'atleta@ironhealth.app' } };
        setSession(demoSession);
        setProfile(DEMO_PROFILE);
        setIsInitializing(false);
      } else {
        setSession(null);
        setIsInitializing(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession?.user) {
        setSession(newSession);
        loadInitialData(newSession.user.id);
      } else if (_event === 'SIGNED_OUT') {
        setSession(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [setSession, setProfile, loadInitialData, setActiveTab]);

  if (activeTab === 'design-system') {
    return <ButtonShowcase />;
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--page-bg)]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 bg-[var(--brd-700)] rounded-xl mb-4"></div>
          <div className="h-4 w-24 bg-[var(--brd-700)] rounded"></div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <ToastProvider><Auth /></ToastProvider>;
  }

  return (
    <ToastProvider>
      <Layout>
        {!(openCreationMode === 'race' || editingRaceId) && (
          <>
            {activeTab === 'home' && <Home />}
            {activeTab === 'calendario' && <Calendar />}
            {['nutricao', 'corpo', 'ginasio', 'corrida'].includes(activeTab) && <Dashboard activeModule={activeTab} />}
            {activeTab === 'coach' && <Coach />}
            {activeTab === 'perfil' && <Perfil />}
            {activeTab === 'admin' && <Admin />}
          </>
        )}
        
        {(openCreationMode === 'race' || editingRaceId) && (
          <RunAgenda onClose={() => {
            setOpenCreationMode(null);
            setEditingRaceId(null);
          }} />
        )}
      </Layout>
    </ToastProvider>
  );
}
