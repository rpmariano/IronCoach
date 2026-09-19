import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { registerServiceWorker } from './lib/push';
import { reloadFresh, isBusy } from './lib/appUpdate';
import { useAppStore } from './store';
import { useAppNavigationHistory } from './utils/appNavigationHistory';
import Auth from './components/Auth/Auth';
import Layout from './components/Layout/Layout';
import { shouldShowOnboarding, shouldSilentlyMarkDone, onboardingLocalKey } from './utils/onboarding';
import { ToastProvider } from './components/shared/ToastProvider';
import { authEventAction, shouldReloadOnVisible } from './utils/authEvents';
import { MedalhaoDefs } from './components/shared/Medalhao';
import CarolWelcome from './components/Welcome/CarolWelcome';
import { decideWelcome, buildWelcome, readSeen, markSeen, slotKey } from './utils/carolWelcome';

// O primeiro ecrã — estático de propósito. A PWA tem como princípio arrancar
// instantânea (é por isso que usa fontes de sistema); o Início e a moldura
// que o envolve (Layout, Auth) nunca podem ficar à espera de um pedido de
// rede extra. Tudo o resto abre por ação do atleta e entra por import()
// dinâmico — ver o bloco a seguir.
import Home from './components/Home/Home';
import LogoLoader from './components/shared/LogoLoader';

/* Code-splitting (auditoria de performance 2026-09-11). Antes disto o bundle
   era um só ficheiro de 1 351 kB: o primeiro carregamento trazia o Chart.js
   inteiro (Dashboard), o Admin, o arranque, os quatro dashboards e os cinco
   ecrãs de registo — nada disso visível no Início.

   As fábricas de import ficam em constantes (em vez de inline no lazy())
   para poderem ser reutilizadas no pré-carregamento por gesto, mais abaixo:
   tocar num separador da barra começa a descarregar o chunk antes de o
   React o pedir, e o esqueleto quase nunca chega a aparecer. */
/* Depois de um deploy do GitHub Pages os ficheiros antigos (com hash) deixam
   de existir: numa sessão que ficou aberta, o primeiro separador ainda não
   visitado falhava o import() e caía no AppErrorBoundary — um ecrã de erro
   por causa de uma atualização. Uma recarga única resolve; a marca em
   sessionStorage evita um ciclo se a recarga não resolver. */
const CHUNK_RELOAD_KEY = 'ironcoach:chunk-reload';
function retryOnce(load) {
  return () => load().then((mod) => {
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* sem storage */ }
    return mod;
  }).catch((err) => {
    let already = false;
    try {
      already = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1';
      if (!already) sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    } catch { already = true; }
    if (!already && typeof window !== 'undefined') {
      // Sem passar pela cache do index.html (max-age=600 no GitHub Pages),
      // que ainda apontaria para os chunks que acabaram de desaparecer.
      reloadFresh();
      return new Promise(() => {});
    }
    throw err;
  });
}
const loadDashboard = retryOnce(() => import('./components/Dashboard/Dashboard'));
const loadCalendar = retryOnce(() => import('./components/Calendar/Calendar'));
const loadRaces = retryOnce(() => import('./components/Run/RacesScreen'));
const loadCoach = retryOnce(() => import('./components/Coach/Coach'));
const loadPerfil = retryOnce(() => import('./components/Perfil/Perfil'));
const loadAdmin = retryOnce(() => import('./components/Admin/Admin'));
const loadOnboarding = retryOnce(() => import('./components/Onboarding/Onboarding'));
const loadRunAgenda = retryOnce(() => import('./components/Run/RunAgenda'));
const loadMealRegistration = retryOnce(() => import('./components/Nutrition/MealRegistration'));
const loadBodyRegistration = retryOnce(() => import('./components/Body/BodyRegistration'));
const loadRunRegistration = retryOnce(() => import('./components/Run/RunRegistration'));
const loadGymRegistration = retryOnce(() => import('./components/Gym/GymRegistration'));
// "O plano" (dia a dia do plano acordado) não é um registo, mas abre como
// eles: ecrã de topo, a partir do rodapé de "O que faço hoje".
const loadPlanoScreen = retryOnce(() => import('./components/Home/PlanoScreen'));

const Dashboard = lazy(loadDashboard);
const Calendar = lazy(loadCalendar);
const RacesScreen = lazy(loadRaces);
const Coach = lazy(loadCoach);
const Perfil = lazy(loadPerfil);
const Admin = lazy(loadAdmin);
const Onboarding = lazy(loadOnboarding);
const RunAgenda = lazy(loadRunAgenda);
const MealRegistration = lazy(loadMealRegistration);
const BodyRegistration = lazy(loadBodyRegistration);
const RunRegistration = lazy(loadRunRegistration);
const GymRegistration = lazy(loadGymRegistration);
const PlanoScreen = lazy(loadPlanoScreen);

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
  provas: loadRaces,
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
      // O Perfil e o Calendário vivem no cabeçalho (o Calendário desde
      // 2026-09-13, quando a barra ganhou Provas). Não há como os distinguir
      // do logótipo sem lhes tocar no Layout, e não faz mal: os dois chunks
      // são pequenos e o pior caso é aquecê-los sem ser preciso.
      if (target.closest('header')) { loadPerfil(); loadCalendar(); }
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
/* O ecrã a chegar: o brasão desenhado a traço (shared/LogoLoader), onde o
   conteúdo vai aparecer — em vez dos retângulos a pulsar. */
function ScreenSkeleton() {
  return (
    <div data-testid="screen-skeleton" className="flex items-center justify-center" style={{ minHeight: '46vh' }}>
      <LogoLoader size={64} label="A carregar o ecrã" />
    </div>
  );
}

/* Para os ecrãs que vivem FORA do Layout (arranque, bancadas de teste) o
   fallback é exatamente o mesmo placeholder que o App já mostra enquanto
   `isInitializing` — a troca entre os dois é invisível. */
function FullScreenLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-transparent" style={{ gap: 18 }}>
      <LogoLoader size={112} label="A carregar" />
      {/* A palavra entra quando o brasão acaba de se desenhar. */}
      <span aria-hidden="true" className="logo-loader-word" style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.32em', color: 'var(--text-3)', paddingLeft: '.32em' }}>
        IRONCOACH
      </span>
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
        /* A hora de partida (specs/plano-de-prova.md, "A véspera e a hora"):
           é esta prova que deixa ver "· 09:00" no cabeçalho do hub e
           "Partida às 09:00" no cartão do plano. A demo-race-4 fica de
           propósito sem hora, para se ver também o pedido. */
        start_time: '09:00',
        target_time: '48:00', target_time_seconds: 2880, target_pace_seconds_per_km: 288,
        /* Percurso extraído do site (o que o enrich-race-event devolve): é
           esta prova que deixa ver o cartão "Plano para o dia" com os troços
           nomeados e os ajustes de subida e descida
           (specs/plano-de-prova.md). */
        web_info: {
          source_url: 'https://saosilvestrelisboa.pt',
          fetched_at: new Date().toISOString(),
          route_summary: 'Percurso urbano e rápido, com uma subida curta a meio e uma descida longa até ao rio.',
          route_segments: [
            { km_marker: 0, description: 'Partida na Praça do Marquês de Pombal', elevation: 'plano' },
            { km_marker: 3.5, description: 'subida da Avenida da Liberdade', elevation: 'sobe' },
            { km_marker: 6, description: 'descida para o Terreiro do Paço', elevation: 'desce' },
          ],
        },
      },
      {
        id: 'demo-race-4', date: inDays(-2), name: 'Trail dos Moinhos',
        location: 'Sintra', race_type: 'trail', distance_km: 15, elevation_gain_m: 620,
        experience_level: 'medio', status: 'agendada',
        target_time: '1:45:00', target_time_seconds: 6300, target_pace_seconds_per_km: 420,
      },
      /* A prova de AMANHÃ (specs/plano-de-prova.md, "O plano tem de saber da
         prova"): é com ela que se vê a véspera no cartão da Carol — as horas
         e as gramas de computeRaceEve em "Preparar amanhã" — e, junto com o
         plano de demonstração abaixo, o alerta "o plano precisa de um
         ajuste". */
      {
        id: 'demo-race-5', date: inDays(1), name: 'Corrida do Tejo · Noturna',
        location: 'Lisboa', race_type: 'estrada', distance_km: 10,
        experience_level: 'medio', status: 'agendada', start_time: '08:30',
        target_time: '47:00', target_time_seconds: 2820, target_pace_seconds_per_km: 282,
      },
    ],
    waterLogs: [],
    meals: [],
    runs: [
      /* Uma de manhã e outra à noite: é assim que se vê a hora nos cartões do
         Calendário, e é a diferença que a Carol lê (um treino às 22:10 corta
         o sono) — specs/plano-de-prova.md, "A véspera e a hora". A BD devolve
         'HH:MM:SS', por isso a demo escreve-o na mesma grafia. */
      { id: 'demo-run-1', date: inDays(-2), start_time: '07:30:00', distance_km: 8, duration_seconds: 2400, kind: 'treino', training_type: 'continuo' },
      { id: 'demo-run-2', date: inDays(-5), start_time: '22:10:00', distance_km: 12, duration_seconds: 3900, kind: 'treino', training_type: 'longo' },
    ],
    gymSessions: [
      /* Uma sessão só, para a hora ser visível também no Ginásio — o demo não
         tinha nenhuma e o cartão do Calendário ficava sem nada para mostrar. */
      {
        id: 'demo-gym-1', date: inDays(-1), start_time: '19:00:00', kind: 'forca',
        name: 'Peito e Tríceps', categories: ['Peito', 'Tríceps'],
        duration_seconds: 3600, calories_kcal: 340, exertion: 7,
        workout_session_sets: [],
      },
    ],
    bodyAssessments: [],
    /* Um plano aceite que NÃO sabe da prova (specs/plano-de-prova.md, "O
       plano tem de saber da prova"): tem o dia de hoje certo — item de
       prova, para a São Silvestre — mas marcou uma rodagem longa no dia da
       prova de amanhã e intervalos na véspera dela. É esse plano que faz
       aparecer o alerta de ajuste no Início, e o item de prova de hoje que
       deixa ver o cartão âmbar "Prova · São Silvestre de Lisboa · 10 km". */
    coachPlans: [
      { id: 'demo-plan-1', status: 'aceite', period_start: inDays(-3), period_end: inDays(7), summary: 'Semana de afinação antes das provas.' },
    ],
    coachPlanItems: [
      { id: 'demo-item-1', plan_id: 'demo-plan-1', planned_date: inDays(0), kind: 'corrida', training_type: 'prova', target_distance_km: 10, status: 'pendente', notes: 'O plano para o dia está no hub da prova.' },
      { id: 'demo-item-2', plan_id: 'demo-plan-1', planned_date: inDays(1), kind: 'corrida', training_type: 'longo', target_distance_km: 18, status: 'pendente' },
      { id: 'demo-item-3', plan_id: 'demo-plan-1', planned_date: inDays(-1), kind: 'corrida', training_type: 'intervalos', target_distance_km: 10, status: 'pendente' },
      { id: 'demo-item-4', plan_id: 'demo-plan-1', planned_date: inDays(-3), kind: 'ginasio', categories: ['Pernas'], target_duration_min: 45, status: 'pendente' },
    ],
  };
}

/* Variante de ?demo=true&palmares=1 — o atleta que já correu e ainda não
   marcou a próxima (specs/gamificacao-provas.md). É o único estado onde o
   Início mostra "Prova concluída · ontem": com uma prova por correr ou por
   registar, o cartão volta a olhar para a frente, que é a função dele. Serve
   também para ver o hub pós-prova com conquistas e o Palmarés do separador Provas com
   umas desbloqueadas e outras ainda por fazer. */
function buildPalmaresDemoData() {
  const today = new Date();
  const inDays = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return {
    raceEvents: [
      {
        id: 'demo-palmares-1', date: inDays(-160), name: 'Meia do Estoril',
        location: 'Estoril', race_type: 'estrada', distance_km: 21.0975,
        experience_level: 'medio', status: 'concluida',
        target_time: '2:00:00', target_time_seconds: 7200,
      },
      {
        id: 'demo-palmares-2', date: inDays(-70), name: 'Trail da Arrábida',
        location: 'Setúbal', race_type: 'trail', distance_km: 18, elevation_gain_m: 740,
        experience_level: 'medio', status: 'concluida',
        target_time: '2:20:00', target_time_seconds: 8400,
      },
      {
        id: 'demo-palmares-3', date: inDays(-1), name: 'Corrida das Vindimas',
        location: 'Palmela', race_type: 'estrada', distance_km: 10,
        experience_level: 'medio', status: 'concluida',
        target_time: '47:00', target_time_seconds: 2820, target_pace_seconds_per_km: 282,
      },
    ],
    waterLogs: [],
    meals: [],
    runs: [
      { id: 'demo-pr-1', date: inDays(-160), name: 'Meia do Estoril', kind: 'competicao', race_id: 'demo-palmares-1', distance_km: 21.0975, duration_seconds: 7106, details: { official_time_seconds: 7106 } },
      { id: 'demo-pr-2', date: inDays(-70), name: 'Trail da Arrábida', kind: 'competicao', race_id: 'demo-palmares-2', distance_km: 18, elevation_gain_m: 740, duration_seconds: 8880, details: { official_time_seconds: 8880 } },
      { id: 'demo-pr-3', date: inDays(-1), name: 'Corrida das Vindimas', kind: 'competicao', race_id: 'demo-palmares-3', distance_km: 10, duration_seconds: 2766, details: {
        official_time_seconds: 2766, gun_time_seconds: 2790, position: 212, age_group_position: 31, official_splits: [{ km: 5, seconds: 1390 }],
        // Parciais do relógio: dão a linha do ritmo no estúdio do mural.
        splits: [283, 279, 281, 276, 274, 277, 279, 275, 272, 270].map((time_seconds) => ({ distance_km: 1, time_seconds })),
      } },
      { id: 'demo-pr-t1', date: inDays(-8), distance_km: 12, duration_seconds: 3960, kind: 'treino', training_type: 'continuo' },
      { id: 'demo-pr-t2', date: inDays(-15), distance_km: 16, duration_seconds: 5400, kind: 'treino', training_type: 'longo' },
      { id: 'demo-pr-t3', date: inDays(-30), distance_km: 10, duration_seconds: 3180, kind: 'treino', training_type: 'intervalado' },
    ],
    gymSessions: [],
    bodyAssessments: [],
    /* Um plano aceite que NÃO sabe da prova (specs/plano-de-prova.md, "O
       plano tem de saber da prova"): tem o dia de hoje certo — item de
       prova, para a São Silvestre — mas marcou uma rodagem longa no dia da
       prova de amanhã e intervalos na véspera dela. É esse plano que faz
       aparecer o alerta de ajuste no Início, e o item de prova de hoje que
       deixa ver o cartão âmbar "Prova · São Silvestre de Lisboa · 10 km". */
    coachPlans: [
      { id: 'demo-plan-1', status: 'aceite', period_start: inDays(-3), period_end: inDays(7), summary: 'Semana de afinação antes das provas.' },
    ],
    coachPlanItems: [
      { id: 'demo-item-1', plan_id: 'demo-plan-1', planned_date: inDays(0), kind: 'corrida', training_type: 'prova', target_distance_km: 10, status: 'pendente', notes: 'O plano para o dia está no hub da prova.' },
      { id: 'demo-item-2', plan_id: 'demo-plan-1', planned_date: inDays(1), kind: 'corrida', training_type: 'longo', target_distance_km: 18, status: 'pendente' },
      { id: 'demo-item-3', plan_id: 'demo-plan-1', planned_date: inDays(-1), kind: 'corrida', training_type: 'intervalos', target_distance_km: 10, status: 'pendente' },
      { id: 'demo-item-4', plan_id: 'demo-plan-1', planned_date: inDays(-3), kind: 'ginasio', categories: ['Pernas'], target_duration_min: 45, status: 'pendente' },
    ],
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
  /* O utilizador cujos dados já estão carregados. Ao voltar à app depois de
     ter estado noutra, o Supabase recupera a sessão e emite SIGNED_IN com o
     MESMO utilizador (auth-js, _onVisibilityChanged → _recoverAndRefresh).
     Tratá-lo como um login novo punha o ecrã de carregamento e desmontava
     tudo — um registo a meio perdia as fotos (relatado 2026-09-13). */
  const loadedUserIdRef = useRef(null);

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

  /* As boas-vindas da Carol (utils/carolWelcome.js): antes da Home, na
     primeira abertura dentro de cada faixa do dia — ao arrancar a app e ao
     voltar a ela. Nunca por cima do arranque (que já é ela a receber), nem
     quando a app abre por uma notificação (?tab=, o atleta vem ao que a
     notificação disse); nesses casos a faixa conta como vista. */
  const [welcome, setWelcome] = useState(null);
  const openedWithTabRef = useRef(typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tab'));
  const welcomeReady = !isInitializing && !!session && !showOnboarding;
  const welcomeReadyRef = useRef(false);
  welcomeReadyRef.current = welcomeReady;
  const markCurrentSlotSeen = useCallback(() => {
    const uid = useAppStore.getState().session?.user?.id;
    if (uid) markSeen(uid, [slotKey().key]);
  }, []);
  const tryWelcome = useCallback(() => {
    const s = useAppStore.getState();
    const uid = s.session?.user?.id;
    const clear = () => { if (useAppStore.getState().welcomeGate !== 'open') s.setWelcomeGate('clear'); };
    if (!uid) { clear(); return; }
    /* Nunca por cima de outra camada: uma persiana, um diálogo, o momento da
       medalha, um campo com o foco (a mesma regra da atualização automática,
       lib/appUpdate.js). Fica para a próxima vez que se voltar à app. */
    if (isBusy(document)) { clear(); return; }
    const decision = decideWelcome({ raceEvents: s.raceEvents, seen: readSeen(uid) });
    if (!decision) { clear(); return; }
    markSeen(uid, decision.markKeys);
    s.setWelcomeGate('open');
    setWelcome({ ...buildWelcome(decision.variant, s), key: decision.key, at: new Date() });
  }, []);
  const closeWelcome = useCallback(() => {
    setWelcome(null);
    useAppStore.getState().setWelcomeGate('clear');
  }, []);
  useEffect(() => {
    if (showOnboarding) markCurrentSlotSeen();
  }, [showOnboarding, markCurrentSlotSeen]);
  useEffect(() => {
    if (!welcomeReady) return;
    if (openedWithTabRef.current) {
      openedWithTabRef.current = false;
      markCurrentSlotSeen();
      useAppStore.getState().setWelcomeGate('clear');
      return;
    }
    tryWelcome();
  }, [welcomeReady, tryWelcome, markCurrentSlotSeen]);

  // Criar/editar um registo (Prova, refeição, avaliação, corrida, treino)
  // é sempre um ecrã de topo — ver o comentário completo mais abaixo, onde
  // é usado no JSX.
  const isCreatingOrEditing = !!openCreationMode || !!editingRaceId || onboardingOpen;

  /* Voltar à app com nenhum formulário aberto atualiza os dados, no máximo
     uma vez por minuto (utils/authEvents.js, shouldReloadOnVisible). Com um
     registo, uma corrida em edição ou uma prova aberta não — recarregar por
     baixo repunha o rascunho com os valores do servidor. */
  const formOpenRef = useRef(false);
  formOpenRef.current = isCreatingOrEditing || !!editingRunId;
  const lastVisibleReloadRef = useRef(Date.now());
  useEffect(() => {
    const onVisibilityChange = () => {
      const userId = loadedUserIdRef.current;
      // Voltar à app numa faixa nova também é "abrir a app" — com nada a
      // meio (um registo aberto passa à frente de uma saudação).
      if (document.visibilityState === 'visible' && welcomeReadyRef.current
        && !formOpenRef.current && !useAppStore.getState().navGuard) {
        tryWelcome();
      }
      // Formulário aberto: os ecrãs de topo (registo, prova, onboarding) e,
      // para os que abrem por dentro de outro ecrã (editar uma corrida a
      // partir do Calendário), a guarda de navegação que todos os
      // formulários com rascunho põem enquanto têm alterações por gravar
      // (terceira revisão pré-deploy, 2026-09-13).
      const formOpen = formOpenRef.current || !!useAppStore.getState().navGuard;
      if (!shouldReloadOnVisible({
        visible: document.visibilityState === 'visible',
        userId,
        formOpen,
        sinceLastMs: Date.now() - lastVisibleReloadRef.current,
      })) return;
      lastVisibleReloadRef.current = Date.now();
      loadInitialData(userId);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [loadInitialData, tryWelcome]);

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

    /* Uma notificação da Carol tocada com a app já aberta (ação P.3): o
       service worker pede o separador, e só se aceita o do Coach. Com a app
       fechada, a notificação abre-a com ?tab=coach, que o bloco acima trata. */
    const onWorkerMessage = (event) => {
      // O Coach, ou o Início (onde vivem o assunto por resolver e o conflito de provas — P.5).
      if (event?.data?.type === 'open-tab' && (event.data.tab === 'coach' || event.data.tab === 'home')) {
        // Veio por uma notificação: o atleta vem ao que ela disse. As
        // boas-vindas não o tapam, e a faixa conta como vista.
        markCurrentSlotSeen();
        setWelcome(null);
        useAppStore.getState().setWelcomeGate('clear');
        setActiveTab(event.data.tab);
      }
    };
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.addEventListener) {
      navigator.serviceWorker.addEventListener('message', onWorkerMessage);
    }

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        setSession(existingSession);
        loadedUserIdRef.current = existingSession.user.id;
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
        // ?demo=true&palmares=1 — provas já corridas e nenhuma marcada: o
        // dia a seguir no Início, o hub com conquistas e o Palmarés cheio.
        const verPalmares = params.get('palmares') === '1';
        useAppStore.setState(
          forcarOnboarding ? buildEmptyDemoData()
            : verPalmares ? buildPalmaresDemoData()
              : buildDemoData(),
        );
        setIsInitializing(false);
      } else {
        setSession(null);
        setIsInitializing(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // A regra vive em utils/authEvents.js: com o mesmo utilizador cujos
      // dados já estão carregados (o SIGNED_IN ou o TOKEN_REFRESHED que
      // chegam ao voltar à app), só se atualiza a sessão — nem ecrã de
      // carregamento, que desmontava um registo a meio, nem recarga por
      // baixo, que repunha o rascunho de uma prova ou corrida em edição.
      const userId = newSession?.user?.id || null;
      const action = authEventAction(_event, {
        hasUser: !!userId,
        sameUser: !!userId && loadedUserIdRef.current === userId,
      });
      if (action === 'signed-out') {
        loadedUserIdRef.current = null;
        setSession(null);
        return;
      }
      if (action === 'ignore') return;
      setSession(newSession);
      if (action === 'session-only') return;
      loadedUserIdRef.current = userId;
      if (action === 'load-with-loader') {
        // No login (password/registo) o perfil chega antes das listas e, por
        // um instante, um atleta com dados parecia "sem registos" — o
        // onboarding montava e desmontava logo a seguir. Enquanto os dados
        // carregam, é o loader que se vê.
        setIsInitializing(true);
        Promise.resolve(loadInitialData(userId)).finally(() => setIsInitializing(false));
      } else {
        loadInitialData(userId);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (typeof navigator !== 'undefined') navigator.serviceWorker?.removeEventListener?.('message', onWorkerMessage);
    };
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
      {/* A biblioteca de formas dos medalhões: uma vez, os ids são globais. */}
      <MedalhaoDefs />
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
              {activeTab === 'provas' && <RacesScreen />}
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
          {/* O plano dia a dia entra pelo mesmo `openCreationMode` que os
              registos — é o que já faz dele um ecrã de topo (isCreatingOrEditing,
              acima) e dá ao "voltar" do telemóvel a saída certa, sem um
              segundo mecanismo em paralelo. */}
          {openCreationMode === 'plano' && <PlanoScreen onClose={() => setOpenCreationMode(null)} />}
        </Suspense>
      </Layout>
      {welcome && <CarolWelcome key={welcome.key} welcome={welcome} now={welcome.at} onClose={closeWelcome} />}
    </ToastProvider>
  );
}
