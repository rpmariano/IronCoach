import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { registerServiceWorker } from './lib/push';
import { useAppStore } from './store';
import { useAppNavigationHistory } from './utils/appNavigationHistory';
import Auth from './components/Auth/Auth';
import Layout from './components/Layout/Layout';
import { shouldShowOnboarding, shouldSilentlyMarkDone, onboardingLocalKey } from './utils/onboarding';
import { ToastProvider } from './components/shared/ToastProvider';

// O primeiro ecrã — estático de propósito. A PWA tem como princípio arrancar
// instantânea (é por isso que usa fontes de sistema); o Início e a moldura
// que o envolve (Layout, Auth) nunca podem ficar à espera de um pedido de
// rede extra. Tudo o resto abre por ação do atleta e entra por import()
// dinâmico — ver o bloco a seguir.
import Home from './components/Home/Home';

/* Code-splitting (auditoria de performance 2026-09-11). Antes disto o bundle
   era um só ficheiro de 1 351 kB: o primeiro carregamento trazia o Chart.js
   inteiro (Dashboard), o Admin, o arranque, os quatro dashboards e os cinco
   ecrãs de registo — nada disso visível no Início.

   As fábricas de import ficam em constantes (em vez de inline no lazy())
   para poderem ser reutilizadas no pré-carregamento por gesto, mais abaixo:
   tocar num separador da barra começa a descarregar o chunk antes de o
   React o pedir, e o esqueleto quase nunca chega a aparecer. */
const loadDashboard = () => import('./components/Dashboard/Dashboard');
const loadCalendar = () => import('./components/Calendar/Calendar');
const loadCoach = () => import('./components/Coach/Coach');
const loadPerfil = () => import('./components/Perfil/Perfil');
const loadAdmin = () => import('./components/Admin/Admin');
const loadOnboarding = () => import('./components/Onboarding/Onboarding');
const loadRunAgenda = () => import('./components/Run/RunAgenda');
const loadMealRegistration = () => import('./components/Nutrition/MealRegistration');
const loadBodyRegistration = () => import('./components/Body/BodyRegistration');
const loadRunRegistration = () => import('./components/Run/RunRegistration');
const loadGymRegistration = () => import('./components/Gym/GymRegistration');

const Dashboard = lazy(loadDashboard);
const Calendar = lazy(loadCalendar);
const Coach = lazy(loadCoach);
const Perfil = lazy(loadPerfil);
const Admin = lazy(loadAdmin);
const Onboarding = lazy(loadOnboarding);
const RunAgenda = lazy(loadRunAgenda);
const MealRegistration = lazy(loadMealRegistration);
const BodyRegistration = lazy(loadBodyRegistration);
const RunRegistration = lazy(loadRunRegistration);
const GymRegistration = lazy(loadGymRegistration);

// Bancadas de teste do design system: só se chegam por ?tab=design-system /
// ?tab=audit-sandbox. Não têm de pesar no arranque de ninguém.
const ButtonShowcase = lazy(() => import('./components/DesignSystem/ButtonShowcase'));
const UIAuditSandbox = lazy(() => import('./components/DesignSystem/UIAuditSandbox'));

/* Pré-carregamento por gesto. A barra inferior vive no Layout.jsx, que não é
   território deste ficheiro — em vez de lhe acrescentar handlers, ouve-se o
   pointerdown na fase de captura e lê-se o `data-vert` que os botões já
   expõem. Entre o dedo tocar e o React trocar de separador há tempo de
   sobra para o chunk chegar; se o atributo um dia mudar, isto simplesmente
   deixa de pré-carregar (o esqueleto do Suspense cobre o caso). */
const PRELOAD_BY_TAB = {
  calendario: loadCalendar,
  dashboard: loadDashboard,
  coach: loadCoach,
};

function usePreloadOnNavTouch() {
  useEffect(() => {
    const onPointerDown = (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const navBtn = target.closest('[data-vert]');
      if (navBtn) {
        PRELOAD_BY_TAB[navBtn.dataset.vert]?.();
        return;
      }
      // O "+" é o único botão do nav sem data-vert. Abre o menu de registo,
      // por isso vale a pena aquecer os cinco formulários de uma vez — são
      // pequenos e o atleta ainda tem de escolher qual.
      if (target.closest('[data-testid="bottom-nav"]')) {
        loadRunAgenda(); loadMealRegistration(); loadBodyRegistration();
        loadRunRegistration(); loadGymRegistration();
        return;
      }
      // O botão "Perfil" vive no cabeçalho, não no nav. Não há como o
      // distinguir do logótipo sem lhe tocar no Layout, e não faz mal:
      // o chunk do Perfil é pequeno e o pior caso é aquecê-lo sem ser
      // preciso.
      if (target.closest('header')) loadPerfil();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);
}

/* Esqueleto de transição — a mesma linguagem do `carol-skeleton` do Início
   (barras a rgba(255,255,255,.08)). Nunca um spinner nem a palavra "a
   carregar" escrita no ecrã: o estado diz-se a quem usa leitor de ecrã pelo
   role/aria-label, e a quem vê pela forma do conteúdo que está prestes a
   chegar. Na prática quase nunca aparece — o pré-carregamento acima trata
   disso — e existe sobretudo para a primeira visita a cada separador com
   rede lenta. */
function ScreenSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="A carregar o ecrã"
      data-testid="screen-skeleton"
      className="flex flex-col gap-3 pt-2 animate-pulse"
    >
      <span className="block h-[104px] rounded-2xl w-full" style={{ background: 'rgba(255,255,255,.08)' }} />
      <span className="block h-[104px] rounded-2xl w-full" style={{ background: 'rgba(255,255,255,.08)' }} />
      <span className="block h-3 rounded-full w-2/3" style={{ background: 'rgba(255,255,255,.08)' }} />
    </div>
  );
}

/* Para os ecrãs que vivem FORA do Layout (arranque, bancadas de teste) o
   fallback é exatamente o mesmo placeholder que o App já mostra enquanto
   `isInitializing` — a troca entre os dois é invisível. */
function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 bg-[var(--brd-700)] rounded-xl mb-4"></div>
        <div className="h-4 w-24 bg-[var(--brd-700)] rounded"></div>
      </div>
    </div>
  );
}

const DEMO_PROFILE = {
  id: 'demo-user',
  full_name: 'Atleta IronCoach',
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
  // O perfil fictício conta como já arrancado: ?demo=true existe para ver os
  // ecrãs reais da app, não para ficar preso nos seis passos do onboarding.
  // Para VER o arranque em demo há o parâmetro ?onboarding=1 (ver abaixo).
  onboarding_done: true,
};

// Dados fictícios para o modo ?demo=true — deixa ver o layout real da app
// sem precisar de sessão/login nenhuns. Duas provas de propósito: é o caso
// que ativa o carrossel de pontos no NextRaceCard (upcoming.length > 1),
// que foi exatamente o que ficou por verificar visualmente ao corrigir a
// "caixa cinzenta" por baixo do cartão (ver git log de NextRaceCard.css).
function buildDemoData() {
  const today = new Date();
  // Data LOCAL, como o todayISO da app: passar por toISOString num fuso a
  // leste de Greenwich devolvia o dia anterior, e uma prova declarada como
  // "há 2 dias" aparecia no ecrã como "há 3".
  const inDays = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      /* Duas provas a pedir registo (specs/prova-concluida.md §3) — o estado
         que o demo não tinha e que é o mais fácil de partir sem dar por
         isso: o dia da prova e os dias a seguir, ainda sem corrida ligada.
         É com elas que se vê o CTA âmbar do Início, o da agenda e o do hub. */
      {
        id: 'demo-race-3', date: inDays(0), name: 'São Silvestre de Lisboa',
        location: 'Lisboa', race_type: 'estrada', distance_km: 10,
        experience_level: 'medio', status: 'agendada',
        target_time: '48:00', target_time_seconds: 2880, target_pace_seconds_per_km: 288,
      },
      {
        id: 'demo-race-4', date: inDays(-2), name: 'Trail dos Moinhos',
        location: 'Sintra', race_type: 'trail', distance_km: 15, elevation_gain_m: 620,
        experience_level: 'medio', status: 'agendada',
        target_time: '1:45:00', target_time_seconds: 6300, target_pace_seconds_per_km: 420,
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

// Variante de ?demo=true&onboarding=1: um atleta mesmo acabado de chegar —
// sem registos e sem provas. É a segunda metade da regra de arranque (a
// primeira é onboarding_done a false, posto no perfil demo).
function buildEmptyDemoData() {
  return {
    raceEvents: [], waterLogs: [], meals: [], runs: [], gymSessions: [],
    bodyAssessments: [], coachPlans: [], coachPlanItems: [], coachNotes: [],
  };
}

export default function App() {
  const { session, setSession, setProfile, loadInitialData, activeTab, setActiveTab, openCreationMode, setOpenCreationMode, editingRaceId, setEditingRaceId, editingRunId, setEditingRunId } = useAppStore();
  const profile = useAppStore((s) => s.profile);
  const runs = useAppStore((s) => s.runs);
  const meals = useAppStore((s) => s.meals);
  const gymSessions = useAppStore((s) => s.gymSessions);
  const bodyAssessments = useAppStore((s) => s.bodyAssessments);
  const raceEvents = useAppStore((s) => s.raceEvents);
  const onboardingOpen = useAppStore((s) => s.onboardingOpen);
  const setOnboardingOpen = useAppStore((s) => s.setOnboardingOpen);
  const markOnboardingDone = useAppStore((s) => s.markOnboardingDone);
  const [isInitializing, setIsInitializing] = useState(true);

  /* Onboarding (ponto 8 do redesenho 2026-09). Duas entradas distintas:
     - PRIMEIRO ACESSO: decidido pela regra de utils/onboarding.js — perfil
       sem `onboarding_done` E sem registo nenhum nem prova. Quem já usa a app
       nunca o vê, mesmo tendo a coluna a `false` (ela nasceu agora, a `false`
       para toda a gente); nesse caso marca-se como feito em silêncio.
     - REENTRADA: `onboardingOpen`, posto pelo cartão "Rever o arranque com a
       Carol" em Perfil · Coach. Conta como ecrã de topo, para o "voltar" do
       telemóvel o fechar em vez de sair da app. */
  const dadosAtleta = { profile, runs, meals, gymSessions, bodyAssessments, raceEvents };
  const needsOnboarding = !isInitializing && shouldShowOnboarding(dadosAtleta);
  const silentlyDone = !isInitializing && shouldSilentlyMarkDone(dadosAtleta);
  const showOnboarding = !!session && (needsOnboarding || onboardingOpen);

  useEffect(() => {
    if (silentlyDone) markOnboardingDone();
  }, [silentlyDone, markOnboardingDone]);

  // Criar/editar um registo (Prova, refeição, avaliação, corrida, treino)
  // é sempre um ecrã de topo — ver o comentário completo mais abaixo, onde
  // é usado no JSX.
  const isCreatingOrEditing = !!openCreationMode || !!editingRaceId || onboardingOpen;

  // Botão/gesto de "voltar" do telemóvel navega entre separadores e fecha
  // o ecrã de topo em vez de sair da app inteira — ver o comentário
  // completo em utils/appNavigationHistory.js (bug relatado 2026-08-30;
  // uma primeira correção só cobria o ecrã de registo/edição, insuficiente
  // para navegar entre separadores).
  const closeTopScreen = useCallback(() => {
    setOpenCreationMode(null);
    setEditingRaceId(null);
    setEditingRunId(null);
    setOnboardingOpen(false);
  }, [setOpenCreationMode, setEditingRaceId, setEditingRunId, setOnboardingOpen]);
  useAppNavigationHistory({
    activeTab,
    setActiveTab,
    isCreatingOrEditing,
    closeTopScreen,
    ready: !isInitializing,
  });

  // Aquece o chunk do separador ao toque, antes de o React o pedir — ver o
  // comentário em usePreloadOnNavTouch, no topo.
  usePreloadOnNavTouch();

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
        const demoSession = { user: { id: 'demo-user', email: 'atleta@ironcoach.app' } };
        setSession(demoSession);
        // ?demo=true&onboarding=1 — o único sítio onde o arranque se vê sem
        // criar uma conta nova: perfil por arrancar E sem registo nenhum nem
        // prova, que é exatamente o que a regra de utils/onboarding.js exige.
        // Só existe em demo; sem `demo=true` o parâmetro não faz nada.
        const forcarOnboarding = params.get('onboarding') === '1';
        // O fallback local (utils/onboarding.js) grava "feito" ao terminar —
        // sem isto, recarregar o mesmo URL já não mostrava o arranque.
        if (forcarOnboarding) {
          try { localStorage.removeItem(onboardingLocalKey('demo-user')); } catch (_) { /* modo privado */ }
        }
        setProfile(forcarOnboarding
          ? { ...DEMO_PROFILE, onboarding_done: false }
          : DEMO_PROFILE);
        // setState direto (em vez dos setters individuais) porque isto é
        // inicialização única fora do fluxo normal de dados — os setters
        // existem para respostas do Supabase, não para semear um estado
        // fictício de propósito.
        useAppStore.setState(forcarOnboarding ? buildEmptyDemoData() : buildDemoData());
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
    return <Suspense fallback={<FullScreenLoader />}><ButtonShowcase /></Suspense>;
  }

  if (activeTab === 'audit-sandbox') {
    return <Suspense fallback={<FullScreenLoader />}><UIAuditSandbox /></Suspense>;
  }

  if (isInitializing) {
    return <FullScreenLoader />;
  }

  if (!session) {
    return <ToastProvider><Auth /></ToastProvider>;
  }

  /* O arranque não tem navegação inferior — o mock não a mostra e não há para
     onde navegar antes de a app saber quem é o atleta. Por isso vive FORA do
     <Layout>, como ecrã inteiro, tanto no primeiro acesso como na reentrada
     pelo Perfil (ver Onboarding.jsx). `reentry` muda só duas coisas: o
     primeiro passo ganha "Voltar", e terminar devolve ao Perfil em vez de
     mudar de separador. */
  if (showOnboarding) {
    return (
      <ToastProvider>
        <Suspense fallback={<FullScreenLoader />}>
          <Onboarding
            reentry={!needsOnboarding}
            onDone={() => setOnboardingOpen(false)}
          />
        </Suspense>
      </ToastProvider>
    );
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
  // (isCreatingOrEditing já foi calculado acima, antes dos hooks.)

  return (
    <ToastProvider>
      <Layout>
        {/* O Suspense vive DENTRO do Layout, e não à volta dele: o cabeçalho,
            a barra inferior e o FAB não têm de piscar por causa do ecrã que
            está a chegar. O esqueleto aparece onde o conteúdo vai aparecer,
            dentro do <main>. */}
        <Suspense fallback={<ScreenSkeleton />}>
          {!isCreatingOrEditing && (
            <>
              {activeTab === 'home' && <Home />}
              {activeTab === 'calendario' && <Calendar />}
              {['hub', 'nutricao', 'corpo', 'ginasio', 'corrida', 'holistica'].includes(activeTab) && <Dashboard activeModule={activeTab} />}
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
          {/* `editingRunId` só vem do hub da prova, a reabrir um registo já
              gravado para lhe juntar as memórias (specs/prova-concluida.md
              §4); a criar, é null e isto é o "Nova corrida" de sempre. */}
          {openCreationMode === 'run' && (
            <RunRegistration
              key={editingRunId || 'nova-corrida'}
              runIdToEdit={editingRunId}
              onClose={() => { setOpenCreationMode(null); setEditingRunId(null); }}
            />
          )}
          {openCreationMode === 'workout' && <GymRegistration onClose={() => setOpenCreationMode(null)} />}
        </Suspense>
      </Layout>
    </ToastProvider>
  );
}
