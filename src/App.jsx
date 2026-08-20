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
import MealRegistration from './components/Nutrition/MealRegistration';
import BodyRegistration from './components/Body/BodyRegistration';
import RunRegistration from './components/Run/RunRegistration';
import GymRegistration from './components/Gym/GymRegistration';

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

// Dados fictícios para o modo ?demo=true — deixa ver o layout real da app
// sem precisar de sessão/login nenhuns. Duas provas de propósito: é o caso
// que ativa o carrossel de pontos no NextRaceCard (upcoming.length > 1),
// que foi exatamente o que ficou por verificar visualmente ao corrigir a
// "caixa cinzenta" por baixo do cartão (ver git log de NextRaceCard.css).
function buildDemoData() {
  const today = new Date();
  const inDays = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return {
    raceEvents: [
      {
        id: 'demo-race-1', date: inDays(28), name: 'Corrida do Tejo',
        location: 'Lisboa', race_type: 'estrada', distance_km: 10,
        experience_level: 'medio', status: 'agendada',
      },
      {
        id: 'demo-race-2', date: inDays(70), name: 'Meia Maratona do Porto',
        location: 'Porto', race_type: '21k', distance_km: 21.0975,
        experience_level: 'medio', status: 'agendada',
      },
    ],
    waterLogs: [],
    meals: [],
    runs: [
      { id: 'demo-run-1', date: inDays(-2), distance_km: 8, duration_seconds: 2400, kind: 'treino', training_type: 'continuo' },
      { id: 'demo-run-2', date: inDays(-5), distance_km: 12, duration_seconds: 3900, kind: 'treino', training_type: 'longo' },
    ],
    gymSessions: [],
    bodyAssessments: [],
    coachPlans: [],
    coachPlanItems: [],
  };
}

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
        // setState direto (em vez dos setters individuais) porque isto é
        // inicialização única fora do fluxo normal de dados — os setters
        // existem para respostas do Supabase, não para semear um estado
        // fictício de propósito.
        useAppStore.setState(buildDemoData());
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
      <div className="min-h-screen flex items-center justify-center bg-transparent">
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

  // Criar/editar um registo (Prova, refeição, avaliação, corrida, treino)
  // é sempre um ecrã de topo, fora de qualquer separador — nunca aninhado
  // dentro do Dashboard e do seu carrossel de módulos. Isto era só o caso
  // da Prova (RunAgenda); os outros 4 abriam DENTRO do próprio módulo
  // (Nutrition.jsx/Body.jsx/Run.jsx/Gym.jsx alternavam entre o dashboard e
  // o registo), o que deixava o subnav do Dashboard (Corrida/Ginásio/...)
  // por cima do formulário e — mais grave — dava ao formulário a altura do
  // carrossel inteiro (as 5 páginas ficam sempre montadas lado a lado para
  // o gesto de deslizar, e a altura do carrossel é a da mais alta delas),
  // um "scroll infinito" para lá do fim do próprio formulário.
  const isCreatingOrEditing = !!openCreationMode || !!editingRaceId;

  return (
    <ToastProvider>
      <Layout>
        {!isCreatingOrEditing && (
          <>
            {activeTab === 'home' && <Home />}
            {activeTab === 'calendario' && <Calendar />}
            {['nutricao', 'corpo', 'ginasio', 'corrida', 'holistica'].includes(activeTab) && <Dashboard activeModule={activeTab} />}
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
        {openCreationMode === 'meal' && <MealRegistration onClose={() => setOpenCreationMode(null)} />}
        {openCreationMode === 'assessment' && <BodyRegistration onClose={() => setOpenCreationMode(null)} />}
        {openCreationMode === 'run' && <RunRegistration onClose={() => setOpenCreationMode(null)} />}
        {openCreationMode === 'workout' && <GymRegistration onClose={() => setOpenCreationMode(null)} />}
      </Layout>
    </ToastProvider>
  );
}
