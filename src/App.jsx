import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { registerServiceWorker } from './lib/push';
import { reloadFresh, isBusy, resumeParams, entryTabFromSearch, stripResumeParam, markEntryApplied, markEntryWelcomeHandled } from './lib/appUpdate';
import { prefetchScreensWhenIdle } from './utils/prefetchScreens';
import { isScreenOpen, startNavigationPersistence, readRecentNavigation, applyNavigation, clearNavigation, dropMissingScreen, shouldRestoreNavigation } from './utils/navigationRestore';
import { useAppStore, whenDataReady } from './store';
import { useAppNavigationHistory } from './utils/appNavigationHistory';
import Auth from './components/Auth/Auth';
import Layout from './components/Layout/Layout';
import { shouldShowOnboarding, shouldSilentlyMarkDone, onboardingLocalKey } from './utils/onboarding';
import { ToastProvider } from './components/shared/ToastProvider';
import { authEventAction, shouldReloadOnVisible } from './utils/authEvents';
import CarolWelcome from './components/Welcome/CarolWelcome';
import { decideWelcome, buildWelcome, readSeen, markSeen, readShownAt, markShownAt, slotKey, welcomeReturnAction } from './utils/carolWelcome';
import { detectRaceConflict } from './utils/planDivergence';
import { todayISO } from './lib/utils';

// O primeiro ecrã — estático de propósito. A PWA tem como princípio arrancar
// instantânea (é por isso que usa fontes de sistema); o Início e a moldura
// que o envolve (Layout, Auth) nunca podem ficar à espera de um pedido de
// rede extra. A única espera deliberada é o ecrã do logo, que se deixa
// desenhar até ao fim (utils/logoIntro.js) — e o que ele puder aquecer
// entretanto, aquece (ver usePreloadDuringSplash). Tudo o resto abre por ação do atleta e entra por import()
// dinâmico — ver o bloco a seguir.
import Home from './components/Home/Home';
import LogoLoader from './components/shared/LogoLoader';
import { adoptBootSplash, holdForLogo, logoIntroMs, registerSkeletonLogo, releaseBootSplash, useHeldWhile, SKELETON_DELAY_MS } from './utils/logoIntro';

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
      // que ainda apontaria para os chunks que acabaram de desaparecer — e
      // de volta ao separador que se estava a abrir, não ao Início.
      reloadFresh(undefined, window.location, resumeParams(useAppStore.getState().activeTab));
      return new Promise(() => {});
    }
    throw err;
  });
}
// Os import() crus: o pré-carregamento em tempo morto (PREFETCH_WHEN_IDLE)
// usa-os diretamente — uma falha aí não deve recarregar a app.
const importDashboard = () => import('./components/Dashboard/Dashboard');
const importCalendar = () => import('./components/Calendar/Calendar');
const importRaces = () => import('./components/Run/RacesScreen');
const importCoach = () => import('./components/Coach/Coach');
const importPerfil = () => import('./components/Perfil/Perfil');
const importRunAgenda = () => import('./components/Run/RunAgenda');
const importMealRegistration = () => import('./components/Nutrition/MealRegistration');
const importBodyRegistration = () => import('./components/Body/BodyRegistration');
const importRunRegistration = () => import('./components/Run/RunRegistration');
const importGymRegistration = () => import('./components/Gym/GymRegistration');
// "O plano" (dia a dia do plano acordado) não é um registo, mas abre como
// eles: ecrã de topo, a partir do rodapé de "O que faço hoje".
const importPlanoScreen = () => import('./components/Home/PlanoScreen');

const loadDashboard = retryOnce(importDashboard);
const loadCalendar = retryOnce(importCalendar);
const loadRaces = retryOnce(importRaces);
const loadCoach = retryOnce(importCoach);
const loadPerfil = retryOnce(importPerfil);
const loadAdmin = retryOnce(() => import('./components/Admin/Admin'));
const loadOnboarding = retryOnce(() => import('./components/Onboarding/Onboarding'));
const loadRunAgenda = retryOnce(importRunAgenda);
const loadMealRegistration = retryOnce(importMealRegistration);
const loadBodyRegistration = retryOnce(importBodyRegistration);
const loadRunRegistration = retryOnce(importRunRegistration);
const loadGymRegistration = retryOnce(importGymRegistration);
const loadPlanoScreen = retryOnce(importPlanoScreen);

/* Todos os ecrãs que um atleta abre, pela ordem do que se abre mais cedo,
   carregados em tempo morto depois do arranque (utils/prefetchScreens.js).
   Sem isto, uma publicação a meio da sessão fazia a app recarregar na
   primeira visita a um separador ainda não aberto — "a app reinicia quando
   mudo de menu" (relatado 2026-09-24). Ficam de fora o Admin (só para quem
   o é) e o arranque (só no primeiro acesso). */
const PREFETCH_WHEN_IDLE = [
  importCoach, importCalendar, importRaces, importPerfil, importDashboard,
  importRunRegistration, importMealRegistration, importGymRegistration,
  importBodyRegistration, importRunAgenda, importPlanoScreen,
];

/* holdForLogo: se o ecrã demorar o bastante para o logo aparecer no
   esqueleto, só entra quando o brasão acabar de se desenhar (utils/
   logoIntro.js). O pré-carregamento por gesto chama as fábricas cruas. */
const Dashboard = lazy(holdForLogo(loadDashboard));
const Calendar = lazy(holdForLogo(loadCalendar));
const RacesScreen = lazy(holdForLogo(loadRaces));
const Coach = lazy(holdForLogo(loadCoach));
const Perfil = lazy(holdForLogo(loadPerfil));
const Admin = lazy(holdForLogo(loadAdmin));
// O onboarding não espera pelo logo: o fallback dele é o logo já desenhado
// (FullScreenLoader still) — no primeiro acesso vem logo a seguir ao ecrã do
// logo, e na reentrada pelo Perfil um desenho seria só demora.
const Onboarding = lazy(loadOnboarding);
const RunAgenda = lazy(holdForLogo(loadRunAgenda));
const MealRegistration = lazy(holdForLogo(loadMealRegistration));
const BodyRegistration = lazy(holdForLogo(loadBodyRegistration));
const RunRegistration = lazy(holdForLogo(loadRunRegistration));
const GymRegistration = lazy(holdForLogo(loadGymRegistration));
const PlanoScreen = lazy(holdForLogo(loadPlanoScreen));

// Bancadas de teste do design system: só se chegam por ?tab=design-system /
// ?tab=audit-sandbox. Não têm de pesar no arranque de ninguém. O fallback
// delas é o logo já desenhado (FullScreenLoader still): sem desenho, nada a
// cortar, e nada a esperar.
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

/* Enquanto o logo de arranque se desenha (~2,5 s), a rede está livre:
   aquece-se o chunk do separador por onde a app vai entrar (uma notificação
   abre ?tab=coach, por exemplo) e, se os dados já disseram que é o primeiro
   acesso, o do onboarding. Sem isto, a app saía do logo de arranque para
   cair no logo do esqueleto — dois desenhos seguidos. */
function usePreloadDuringSplash(showBootSplash, activeTab, needsOnboarding) {
  useEffect(() => {
    if (!showBootSplash) return;
    PRELOAD_BY_TAB[activeTab]?.();
  }, [showBootSplash, activeTab]);
  useEffect(() => {
    if (showBootSplash && needsOnboarding) loadOnboarding();
  }, [showBootSplash, needsOnboarding]);
}

/* Esqueleto de transição — a mesma linguagem do `carol-skeleton` do Início
   (barras a rgba(255,255,255,.08)). Nunca um spinner nem a palavra "a
   carregar" escrita no ecrã: o estado diz-se a quem usa leitor de ecrã pelo
   role/aria-label, e a quem vê pela forma do conteúdo que está prestes a
   chegar. Na prática quase nunca aparece — o pré-carregamento acima trata
   disso — e existe sobretudo para a primeira visita a cada separador com
   rede lenta. */
/* O ecrã a chegar: o brasão desenhado a traço (shared/LogoLoader), onde o
   conteúdo vai aparecer — em vez dos retângulos a pulsar. Só aparece se a
   espera passar de SKELETON_DELAY_MS (um ecrã em cache não mostra logo
   nenhum); e, se aparecer, o ecrã espera que acabe de se desenhar — a
   fábrica do lazy está embrulhada em holdForLogo, com os mesmos tempos. */
function ScreenSkeleton() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), SKELETON_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  // O brasão à vista fica registado: o ecrã que está a chegar espera por ele.
  useEffect(() => (visible ? registerSkeletonLogo() : undefined), [visible]);
  return (
    <div data-testid="screen-skeleton" role="status" aria-label="A carregar o ecrã" className="flex items-center justify-center" style={{ minHeight: '46vh' }}>
      {visible && <LogoLoader size={64} label={null} />}
    </div>
  );
}

/* O ecrã do logo: o brasão a desenhar-se e, por baixo, o nome e o
   "AI-POWERED", como no lockup da marca (public/brand/ironcoach-lockup.svg)
   — IRON claro, COACH no ciano da Carol, AI-POWERED no ouro. Mais nada.

   No arranque o App segura-o até o desenho acabar (useHeldWhile +
   LOGO_INTRO_MS): a Home nunca entra com o brasão a meio. `still` mostra-o
   já desenhado — para quando vem logo a seguir ao arranque (o arranque do
   onboarding a descarregar), onde um segundo desenho seria repetição. */
function FullScreenLoader({ still = false, decorative = false }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-transparent" data-testid="boot-splash" style={{ gap: 20 }}>
      <LogoLoader size={112} label={decorative ? null : 'A carregar'} still={still} />
      <div aria-hidden="true" className="flex flex-col items-center" style={{ gap: 8 }}>
        <span className={still ? undefined : 'logo-loader-word'} style={{ fontSize: 30, fontWeight: 900, letterSpacing: '.14em', paddingLeft: '.14em', color: 'var(--text-1)', lineHeight: 1 }}>
          IRON<span className="brand-coach-word">COACH</span>
        </span>
        <span className={still ? undefined : 'logo-loader-tagline'} style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.62em', paddingLeft: '.62em', color: 'var(--brand-gold)', lineHeight: 1 }}>
          AI-POWERED
        </span>
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

/* Variante de ?demo=true&provas=1 — o atleta que já correu e ainda não
   marcou a próxima (specs/gamificacao-provas.md). É o único estado onde o
   Início mostra "Prova concluída · ontem": com uma prova por correr ou por
   registar, o cartão volta a olhar para a frente, que é a função dele. Serve
   também para ver o hub pós-prova com conquistas e a Vitrina do Perfil com
   uns badges de prova ganhos e outros ainda por ganhar.

   Chamava-se `palmares=1` até os medalhões saírem (2026-09-22, fase C da
   reforma da gamificação): já não há Palmarés nenhum para ver, e o nome
   antigo mandava procurar um ecrã que não existe. */
function buildProvasDemoData() {
  const today = new Date();
  const inDays = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return {
    raceEvents: [
      {
        id: 'demo-prova-1', date: inDays(-160), name: 'Meia do Estoril',
        location: 'Estoril', race_type: 'estrada', distance_km: 21.0975,
        experience_level: 'medio', status: 'concluida',
        target_time: '2:00:00', target_time_seconds: 7200,
      },
      {
        id: 'demo-prova-2', date: inDays(-70), name: 'Trail da Arrábida',
        location: 'Setúbal', race_type: 'trail', distance_km: 18, elevation_gain_m: 740,
        experience_level: 'medio', status: 'concluida',
        target_time: '2:20:00', target_time_seconds: 8400,
      },
      {
        id: 'demo-prova-3', date: inDays(-1), name: 'Corrida das Vindimas',
        location: 'Palmela', race_type: 'estrada', distance_km: 10,
        experience_level: 'medio', status: 'concluida',
        target_time: '47:00', target_time_seconds: 2820, target_pace_seconds_per_km: 282,
      },
    ],
    waterLogs: [],
    meals: [],
    runs: [
      { id: 'demo-pr-1', date: inDays(-160), name: 'Meia do Estoril', kind: 'competicao', race_id: 'demo-prova-1', distance_km: 21.0975, duration_seconds: 7106, details: { official_time_seconds: 7106 } },
      { id: 'demo-pr-2', date: inDays(-70), name: 'Trail da Arrábida', kind: 'competicao', race_id: 'demo-prova-2', distance_km: 18, elevation_gain_m: 740, duration_seconds: 8880, details: { official_time_seconds: 8880 } },
      { id: 'demo-pr-3', date: inDays(-1), name: 'Corrida das Vindimas', kind: 'competicao', race_id: 'demo-prova-3', distance_km: 10, duration_seconds: 2766, details: {
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
  // O ecrã do logo fica enquanto os dados carregam E até o desenho acabar.
  /* O primeiro logo é o do index.html (adoptBootSplash): já começou a
     desenhar-se antes de o React chegar, por isso só falta o que resta do
     desenho. Os seguintes (depois de um login) são do React e desenham-se
     inteiros (logoIntroMs). */
  const [htmlSplash] = useState(adoptBootSplash);
  const [fullIntroMs] = useState(logoIntroMs);
  const [firstBootDone, setFirstBootDone] = useState(!htmlSplash);
  const showBootSplash = useHeldWhile(isInitializing, firstBootDone ? fullIntroMs : htmlSplash.remainingMs);
  /* O utilizador cujos dados já estão carregados. Ao voltar à app depois de
     ter estado noutra, o Supabase recupera a sessão e emite SIGNED_IN com o
     MESMO utilizador (auth-js, _onVisibilityChanged → _recoverAndRefresh).
     Tratá-lo como um login novo punha o ecrã de carregamento e desmontava
     tudo — um registo a meio perdia as fotos (relatado 2026-09-13). */
  const loadedUserIdRef = useRef(null);
  /* O ecrã onde se estava quando a app saiu (utils/navigationRestore.js) —
     lido AQUI, no primeiro render, antes de qualquer mudança de separador o
     reescrever. Repõe-se quando a sessão existe (abaixo). */
  const [savedNavigation] = useState(() => readRecentNavigation());
  /* Só se começa a guardar depois de decidida a reposição: uma escrita antes
     (a app escondida durante o arranque, uma recarga logo a seguir) punha
     por cima o estado de partida e o ecrã perdia-se. */
  const [navigationDecided, setNavigationDecided] = useState(false);
  useEffect(() => (navigationDecided ? startNavigationPersistence(useAppStore) : undefined), [navigationDecided]);

  /* Onboarding (ponto 8 do redesenho 2026-09). Duas entradas distintas:
     - PRIMEIRO ACESSO: decidido pela regra de utils/onboarding.js — perfil
       sem `onboarding_done` E sem registo nenhum nem prova. Quem já usa a app
       nunca o vê, mesmo tendo a coluna a `false` (ela nasceu agora, a `false`
       para toda a gente); nesse caso marca-se como feito em silêncio.
     - REENTRADA: `onboardingOpen`, posto pelo cartão "Rever o arranque com a
       Carol" em Perfil · Coach. Conta como ecrã de topo, para o "voltar" do
       telemóvel o fechar em vez de sair da app. */
  const dadosAtleta = { profile, runs, meals, gymSessions, bodyAssessments, raceEvents };
  // Com dados ainda a chegar depois do prazo do arranque (dataPending, ver
  // loadInitialData), uma lista vazia não quer dizer "sem registos".
  const dataPending = useAppStore((s) => s.dataPending);
  const needsOnboarding = !isInitializing && !dataPending && shouldShowOnboarding(dadosAtleta);
  const silentlyDone = !isInitializing && !dataPending && shouldSilentlyMarkDone(dadosAtleta);
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
  /* A chave de uma notificação tocada com a app fechada (ação P.9, `?carol=`
     na URL) — guardada aqui porque só se consome depois de loadInitialData
     trazer os dados frescos (perfil, planos, provas); ver consumeProactiveKey. */
  const proactiveKeyRef = useRef(null);
  // `navigate: false` quando os dados chegaram tarde e o atleta já foi para
  // outro lado: o assunto fica pedido ao Coach, mas não o arranca de onde está.
  const consumeProactiveKey = useCallback((key, { navigate = true } = {}) => {
    if (!key) return;
    useAppStore.getState().logImpression({ kind: 'push', key, title: null });
    if (key.startsWith('intervention:')) {
      // Só abre o Coach se o assunto ainda estiver por resolver — resolvido
      // entretanto (noutro dispositivo, ou nesta app antes de o toque
      // chegar), fica no Início com o aviso, como qualquer outro candidato
      // que já não se aplica.
      const s = useAppStore.getState();
      if (s.profile?.coach_intervention_status === 'needed' || s.profile?.coach_intervention_status === 'in_progress') {
        s.setCoachIntent({ kind: 'proactive_intervention', reason: s.profile?.coach_intervention_reason || null });
        if (navigate) setActiveTab('coach');
      }
      return;
    }
    if (key.startsWith('race_conflict:')) {
      const s = useAppStore.getState();
      const conflict = detectRaceConflict({ coachPlans: s.coachPlans, raceEvents: s.raceEvents, today: todayISO() });
      if (conflict) {
        s.setCoachIntent({
          kind: 'race_conflict',
          races: conflict.races.map((r) => ({ id: r.id, name: r.name, date: r.date })),
          target: conflict.target ? { id: conflict.target.id, name: conflict.target.name, date: conflict.target.date } : null,
        });
        if (navigate) setActiveTab('coach');
      }
      return;
    }
    // Os outros momentos (race_morning/race_eve/race_after/block_end/silence/week_review)
    // o cliente sabe montar sozinho (listProactiveTriggers), mas só o Coach
    // decide — o efeito passivo lá (Coach.jsx) percorre a lista e honra esta
    // preferência sem lhe dar prioridade sobre um coachIntent explícito.
    useAppStore.getState().setProactiveKeyRequested(key);
  }, [setActiveTab]);
  /* A memória da Carol (coach_notes) não vem com os dados iniciais: lia-se
     só no primeiro dia (Home.jsx). As boas-vindas e a resposta ao check-in
     precisam dela desde a primeira abertura — é daí que ela sabe da cirurgia
     de ontem (pedido 2026-09-26, utils/carolVida.js). Lê-se uma vez por
     sessão, e as boas-vindas esperam por ela no máximo 1,5 s: uma memória
     lenta ou em falha não atrasa a saudação, só a deixa sem esse contexto. */
  const sessionUserId = session?.user?.id || null;
  const [notesReadyFor, setNotesReadyFor] = useState(null);
  useEffect(() => {
    if (!sessionUserId || notesReadyFor === sessionUserId) return undefined;
    // Em demo (?demo=true) não há memória no servidor para ler.
    if (sessionUserId === 'demo-user') { setNotesReadyFor(sessionUserId); return undefined; }
    let feito = false;
    const pronto = () => { if (!feito) { feito = true; setNotesReadyFor(sessionUserId); } };
    const timer = setTimeout(pronto, 1500);
    Promise.resolve()
      .then(() => useAppStore.getState().reloadCoachNotes?.())
      .catch(() => {})
      .finally(pronto);
    return () => { feito = true; clearTimeout(timer); };
  }, [sessionUserId, notesReadyFor]);
  // As boas-vindas esperam pelos dados todos: decidem pelas impressões (o
  // que já foi saudado noutro dispositivo), pelos registos e pela memória dela.
  const welcomeReady = !showBootSplash && !!session && !showOnboarding && !dataPending
    && (notesReadyFor === sessionUserId || import.meta.env.MODE === 'test');

  // Com a app já à vista, os outros ecrãs carregam-se em tempo morto (ver
  // PREFETCH_WHEN_IDLE). Nos testes não: o import() tardio chegaria depois
  // de o ambiente fechar.
  useEffect(() => {
    if (!welcomeReady || import.meta.env.MODE === 'test') return undefined;
    return prefetchScreensWhenIdle(PREFETCH_WHEN_IDLE);
  }, [welcomeReady]);
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
    // O interruptor do Perfil (ação P.11). `=== false` de propósito: um
    // perfil sem a coluna continua a ver as boas-vindas.
    if (s.profile?.carol_welcome_enabled === false) { clear(); return; }
    /* Nunca por cima de outra camada: uma persiana, um diálogo, o momento do
       badge, um campo com o foco (a mesma regra da atualização automática,
       lib/appUpdate.js). Fica para a próxima vez que se voltar à app. */
    if (isBusy(document) || isScreenOpen(s)) { clear(); return; }
    /* O que já foi saudado em qualquer dispositivo (ação 5.1): às chaves
       deste telemóvel (readSeen) juntam-se as impressões 'welcome', sem o
       prefixo. O merge fica aqui, porque readSeen e decideWelcome são puras
       e testadas tal como estão. */
    const seenElsewhere = [...(s.impressionShown || [])]
      .filter((k) => k.startsWith('welcome:'))
      .map((k) => k.slice('welcome:'.length));
    // A última saudação, aqui ou noutro dispositivo — o intervalo mínimo
    // entre saudações de faixa (ação P.11).
    const lastShownAt = Math.max(readShownAt(uid) ?? 0, s.lastWelcomeAt ?? 0) || null;
    const vistas = [...readSeen(uid), ...seenElsewhere];
    const decision = decideWelcome({ raceEvents: s.raceEvents, seen: vistas, lastShownAt });
    if (!decision) { clear(); return; }
    /* Já houve hoje uma saudação de outra faixa (a da madrugada conta para a
       véspera): o que ela perguntou nessa não volta a perguntar-se nesta —
       "Como correu a cirurgia?" de manhã não se repete à tarde (pedido
       2026-09-26, utils/carolVida.js). Lido antes de marcar esta. */
    const hojeLisboa = slotKey().date;
    const saudadoHoje = vistas.some((k) => new RegExp(`^${hojeLisboa}:(manha|tarde|noite|prova|vespera)$`).test(k));
    markSeen(uid, decision.markKeys);
    markShownAt(uid);
    const text = buildWelcome(decision.variant, { ...s, saudadoHoje });
    /* O que ela disse fica em coach_impressions (kind 'welcome', ação 5.1):
       o cartão diário e o chat leem-no para não repetir nem contradizer o
       que ela já disse hoje, e o outro telemóvel fica a saber que esta faixa
       já foi saudada. Uma linha por chave de `markKeys` — a variante da
       prova ocupa também a da faixa, senão noutro dispositivo a saudação da
       faixa aparecia logo a seguir à da prova. No título vão só as frases:
       sem a saudação nem o CTA. Fica aqui, depois da decisão, porque
       tryWelcome corre a cada regresso à app e sem decisão não há nada a
       registar. */
    const title = text.lines.join(' ').slice(0, 200) || null;
    for (const key of decision.markKeys) s.logImpression({ kind: 'welcome', key, title });
    s.setWelcomeGate('open');
    setWelcome({ ...text, key: decision.key, at: new Date() });
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
    // A partir daqui o ?tab= de uma notificação já fez o seu papel: uma
    // recarga técnica pode tirá-lo (lib/appUpdate.js, resumeParams).
    markEntryWelcomeHandled();
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
    // Voltar à app numa faixa nova também é "abrir a app" — com nada a
    // meio (um registo aberto passa à frente de uma saudação).
    const canWelcomeNow = () => document.visibilityState === 'visible' && welcomeReadyRef.current
      && !formOpenRef.current && !useAppStore.getState().navGuard;
    const onVisibilityChange = () => {
      const userId = loadedUserIdRef.current;
      if (canWelcomeNow()) {
        /* Antes de decidir, as impressões voltam a ler-se (ação 5.1): o
           outro telemóvel pode ter saudado esta faixa entretanto, e a
           recarga abaixo, limitada a uma vez por minuto, não chega a tempo.
           Só quando este telemóvel ainda não saudou a faixa: o que o
           servidor acrescenta só pode tirar uma saudação, nunca dá-la, e a
           consulta a cada desbloqueio era em vão. E só com um utilizador
           carregado (em demo não há de quem ler). Enquanto a leitura
           decorre, a cancela dos momentos fecha: com ela em 'clear', um
           momento que a recarga ativasse entretanto arrancava por baixo das
           boas-vindas e ficava gasto (antes da leitura existir, tryWelcome
           corria aqui de forma síncrona). tryWelcome repõe 'open' ou
           'clear'; se ao voltar já não se pode saudar (um registo aberto
           entretanto), a cancela abre-se aqui. */
        const s = useAppStore.getState();
        const uid = s.session?.user?.id;
        // Com as boas-vindas desligadas no Perfil não há nada a decidir:
        // tryWelcome só abre a cancela, sem ler as impressões.
        const welcomeOff = s.profile?.carol_welcome_enabled === false;
        // Uma camada aberta (o momento do badge, uma persiana) fica como está,
        // e a cancela também — ver welcomeReturnAction.
        const busy = isBusy(document) || isScreenOpen(s);
        const localDecision = !busy && uid && !welcomeOff
          ? decideWelcome({ raceEvents: s.raceEvents, seen: readSeen(uid), lastShownAt: readShownAt(uid) })
          : null;
        const action = welcomeReturnAction({ busy, userLoaded: !!userId, localDecision });
        if (action === 'try') {
          tryWelcome();
        } else if (action === 'refresh') {
          if (s.welcomeGate === 'clear') s.setWelcomeGate('pending');
          s.refreshImpressionKeys().then(() => {
            if (canWelcomeNow()) tryWelcome();
            else if (useAppStore.getState().welcomeGate === 'pending') useAppStore.getState().setWelcomeGate('clear');
          });
        }
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
      loadInitialData(userId, { join: true });
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
    // As boas-vindas da Carol não são um ecrã: o "voltar" fecha-as e deixa
    // o ecrã por baixo onde estava.
    overlayOpen: !!welcome,
    closeOverlay: closeWelcome,
  });

  // Aquece o chunk do separador ao toque, antes de o React o pedir — ver o
  // comentário em usePreloadOnNavTouch, no topo.
  usePreloadOnNavTouch();
  usePreloadDuringSplash(showBootSplash, activeTab, needsOnboarding);

  useEffect(() => {
    registerServiceWorker();

    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    // O separador por onde entra: o de uma recarga técnica (?resume=, onde
    // se estava) ou o do ?tab=. O ?resume= não é uma notificação — não mexe
    // nas boas-vindas (openedWithTabRef só olha para ?tab=) — e sai já da
    // barra de endereço.
    const entryTab = entryTabFromSearch(window.location.search);
    stripResumeParam();
    const isDemo = params.get('demo') === 'true';
    // A chave da notificação que abriu a app (ação P.9) — sem sessão ainda
    // não há a quem atribuir a impressão nem dados para decidir o ecrã;
    // fica à espera de loadInitialData, mais abaixo.
    const carolParam = params.get('carol');

    if (entryTab) {
      setActiveTab(entryTab);
    }
    markEntryApplied();
    if (carolParam) {
      proactiveKeyRef.current = carolParam;
      // Sem o `carol=`: um F5 a seguir não repete a mesma conversa. O `tab`
      // fica, para um recarregamento nesta sessão continuar a ver a mesma
      // coisa que openedWithTabRef já fixou.
      try {
        window.history.replaceState(null, '', `${window.location.pathname}?tab=${encodeURIComponent(tabParam || 'home')}`);
      } catch { /* URL API indisponível — o pior caso é o carol= sobreviver a um F5 */ }
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
        // Com a app já aberta os dados já estão carregados — consome-se já
        // (ação P.9), sem esperar por loadInitialData como no arranque a frio.
        if (event.data.key) consumeProactiveKey(event.data.key);
      }
    };
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.addEventListener) {
      navigator.serviceWorker.addEventListener('message', onWorkerMessage);
    }

    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        setSession(existingSession);
        loadedUserIdRef.current = existingSession.user.id;
        // Voltar depois de o Android ter matado a app: o separador e o ecrã
        // onde se estava, que reabre com o rascunho guardado — salvo quando
        // o URL manda (uma notificação acabada de tocar, uma bancada, um
        // ?tab= sem nada a meio; ver shouldRestoreNavigation).
        if (shouldRestoreNavigation({ tabParam, carolParam, saved: savedNavigation })) applyNavigation(useAppStore, savedNavigation);
        setNavigationDecided(true);
        const loading = loadInitialData(existingSession.user.id, { join: true });
        // O logo sai quando o carregamento devolve (no máximo 10 s)…
        loading.finally(() => setIsInitializing(false));
        // …mas fechar o ecrã reposto e abrir a notificação esperam pelos dados
        // todos: com a rede lenta, as corridas ou as provas podem chegar
        // depois, e o ecrã de edição reposto fechava-se por "não existir"
        // (revisão pré-deploy de 90bfa9b).
        let tabAtEntry = null;
        loading.then(() => { tabAtEntry = useAppStore.getState().activeTab; }).then(whenDataReady).then(() => {
          // O ecrã reposto aponta para uma corrida ou prova que já não
          // existe (ou que não carregou)? Fecha-se.
          dropMissingScreen(useAppStore);
          if (proactiveKeyRef.current) {
            // Com a rede lenta os dados podem chegar até 45 s depois: se o
            // atleta entretanto mudou de separador ou abriu um ecrã, a
            // notificação não o arranca de lá (revisão pré-deploy de 62976df).
            const s = useAppStore.getState();
            const moved = s.activeTab !== tabAtEntry || isScreenOpen(s) || isBusy(document);
            consumeProactiveKey(proactiveKeyRef.current, { navigate: !moved });
            proactiveKeyRef.current = null;
          }
        });
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
        // ?demo=true&provas=1 — provas já corridas e nenhuma marcada: o
        // dia a seguir no Início, o hub com conquistas e a Vitrina cheia.
        const verProvas = params.get('provas') === '1';
        useAppStore.setState(
          forcarOnboarding ? buildEmptyDemoData()
            : verProvas ? buildProvasDemoData()
              : buildDemoData(),
        );
        // Também em demo, como com sessão: é onde isto se consegue ver sem conta.
        if (shouldRestoreNavigation({ tabParam, carolParam, saved: savedNavigation })) applyNavigation(useAppStore, savedNavigation);
        setNavigationDecided(true);
        setIsInitializing(false);
      } else {
        setSession(null);
        setNavigationDecided(true);
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
        // O ecrã aberto e o guardado não passam para outra conta.
        useAppStore.setState({
          openCreationMode: null, editingRunId: null, editingRaceId: null,
          planItemPrefill: null, runRacePrefill: null, racePrefill: null,
        });
        clearNavigation();
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
        Promise.resolve(loadInitialData(userId, { join: true })).finally(() => setIsInitializing(false));
      } else {
        loadInitialData(userId, { join: true });
      }
    });

    return () => {
      subscription.unsubscribe();
      if (typeof navigator !== 'undefined') navigator.serviceWorker?.removeEventListener?.('message', onWorkerMessage);
    };
  }, [setSession, setProfile, loadInitialData, setActiveTab, consumeProactiveKey]);

  /* O logo do index.html sai quando a app pode entrar — ou logo, nas
     bancadas de teste, que não passam pelo ecrã do logo. */
  const benchTab = activeTab === 'design-system' || activeTab === 'audit-sandbox';
  useEffect(() => {
    if (firstBootDone) return;
    if (!showBootSplash || benchTab) {
      releaseBootSplash();
      setFirstBootDone(true);
    }
  }, [showBootSplash, benchTab, firstBootDone]);

  if (activeTab === 'design-system') {
    return <Suspense fallback={<FullScreenLoader still />}><ButtonShowcase /></Suspense>;
  }

  if (activeTab === 'audit-sandbox') {
    return <Suspense fallback={<FullScreenLoader still />}><UIAuditSandbox /></Suspense>;
  }

  if (showBootSplash) {
    /* No primeiro arranque quem se vê é o logo do index.html, por cima; por
       baixo fica o mesmo logo já desenhado, que só aparece se o do HTML
       tiver saído por outra razão (a rede de segurança dele). */
    // `decorative`: o anúncio "A carregar" é o do logo do HTML, por cima.
    return <FullScreenLoader still={!firstBootDone} decorative={!firstBootDone} />;
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
        <Suspense fallback={<FullScreenLoader still />}>
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
