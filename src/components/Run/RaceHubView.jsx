import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { readinessTextV2, trainingTodayOf } from '../../utils/raceReadinessV2';
import { useFeature } from '../../utils/features';
import CoachAvatar from '../Coach/CoachAvatar';
import {
  Sparkles,
  RefreshCw,
  Calendar,
  MapPin,
  Mountain,
  Gauge,
  Timer,
  Trophy,
  Plus,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Link as LinkIcon,
  Award,
  Flame,
  Zap,
  Star,
  Pencil,
  MessageCircle,
} from 'lucide-react';
import Button from '../shared/Button';
import PremiumModal from '../shared/PremiumModal';
import Warning from '../shared/Warning';
import RunIcon from '../shared/RunIcon';
import RaceTrail from '../shared/RaceTrail';
import SectionLabel from '../shared/SectionLabel';
import AchievementCard from '../shared/AchievementCard';
import { Sheet } from '../shared/Sheet';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import RaceWebInfoSections from './RaceWebInfoSections';
import RacePacingPlanCard from './RacePacingPlanCard';
import RaceMemoriesSheet from './RaceMemoriesSheet';
import RaceBalanceCard from './RaceBalanceCard';
import RaceForecastCard from './RaceForecastCard';
import { retryOnce } from '../../lib/retryOnce';

// O Design v2: lazy (com o retryOnce, um chunk velho depois de um deploy não parte o hub).
const loadHubV2 = retryOnce(() => import('./RaceHubV2'));
const RaceHubV2 = lazy(loadHubV2);
const RaceDoneV2 = lazy(() => loadHubV2().then((m) => ({ default: m.RaceDoneV2 })));
import { useDesignV2 } from '../../utils/designV2';
import RaceTimesBreakdown from './RaceTimesBreakdown';
import { raceForecast, raceTimesBreakdown, targetLine } from '../../utils/raceTimes';
import RaceMuralSheet from './RaceMuralSheet';
import AddToCalendar from './AddToCalendar';
import CupRaceBlock from './CupRaceBlock';
import { buildRacePacingPlan } from '@formulas/racePacing.ts';
import { pacingRouteInput } from '../../utils/coursePacing';
import { calculateRaceTrainingPlan, formatDatePTShort, formatDateDayMonth } from '../../utils/racePlanEngine';
import { calculateReadinessIndex, getRacePrediction, getVDOTTrend } from '../../utils/biEngine';
import { racePriorityLabel, raceTerrainLabel, RACE_TERRAIN_TYPES, formatPace, formatDuration, findRaceRun, parseDurationToSeconds, describeRaceClassification, describeRaceTimes } from '../../utils/run';
import { classifyRaceOutcome, describeRaceOutcome, raceResultSeconds } from '../../utils/raceOutcome';
import { achievementsForRace, missedInRace, describeMissedInRace } from '../../utils/achievements';
import { badgesForRace } from '../../utils/badges';
import { todayISO } from '../../lib/utils';
import { outlookForRace, volumeReadingNote, volumeReadingText } from '../../utils/raceVolumeText';
import LoadProfileCard, { useLoadState } from './LoadProfileCard';
import { experienceLevelLabel } from '../../utils/experience';
import { normalizeStartTime } from '../../utils/startTime';
import './RaceHubView.css';
import { runsOnly } from '@formulas/runKinds.ts';
import { safeHttpUrl } from '../../utils/safeUrl';
import CourseProfilePanel from './CourseProfilePanel';

/* Os km em pt-PT, com uma casa decimal quando a tem: «21,1 km», «10 km». */
// «1 250»: um inteiro em pt-PT (separador de milhares, sem casas decimais) — o D+.
export function formatIntPt(n) {
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0, useGrouping: 'always' }).format(Math.round(Number(n) || 0));
}

export function formatKmPt(km) {
  const n = Number(km);
  if (!(n > 0)) return '—';
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10)} km`;
}

/* Uma secção recolhível do hub: o botão (44 px, aria-expanded/aria-controls) com o título e um
   resumo, e o conteúdo por baixo. Fechada, o conteúdo fica montado mas escondido (hidden): o que
   está lá dentro (o GPX, por exemplo) não perde o estado ao fechar e abrir. Quem precisa de saber
   se está aberta (o gráfico do GPX, que escondido se mediria a 0×0) passa uma função: children(open). */
function HubCollapsible({ id, title, summary = null, defaultOpen = false, nested = false, testId, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `rh-collapsible-${id}`;
  return (
    <section className={nested ? 'rh-collapsible rh-collapsible-nested' : 'rh-collapsible'} data-testid={testId} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-3 text-left"
        style={{ minHeight: 'var(--tap)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span className="min-w-0">
          <span className="block text-[14px] font-extrabold text-[var(--text-1)]">{title}</span>
          {summary && <span className="block text-[12px] text-[var(--text-3)] truncate">{summary}</span>}
        </span>
        {open ? <ChevronUp size={18} className="shrink-0 text-[var(--text-3)]" /> : <ChevronDown size={18} className="shrink-0 text-[var(--text-3)]" />}
      </button>
      <div id={panelId} hidden={!open} className="rh-collapsible-body">
        {typeof children === 'function' ? children(open) : children}
      </div>
    </section>
  );
}

export default function RaceHubView({
  race,
  runs = [],
  profile = {},
  meals = [],
  bodyAssessments = [],
  gymSessions = [],
  onFetchWebInfo,
  fetchingWebInfo = false,
  onGoToEdit,
  onMarkCompleted,
  onMemoriesSaved,
  calendarRaceId,
  course = null,
}) {
  const [expandedPhaseId, setExpandedPhaseId] = useState(null);
  // O Design v2 (utils/designV2.js): antes da prova, a forma do RaceHubV2; a lógica é esta.
  const v2 = useDesignV2();
  const [confirmCompleted, setConfirmCompleted] = useState(false);

  // Os planos aceites com a Carol: antes do ciclo, o parecer manda seguir
  // o que está acordado em vez do conselho genérico (revisão de 2026-09-26).
  const storePlans = useAppStore((s) => s.coachPlans);
  const storePlanItems = useAppStore((s) => s.coachPlanItems);
  const plan = useMemo(() => {
    return calculateRaceTrainingPlan({
      race,
      profile,
      runs,
      coachPlans: storePlans,
      coachPlanItems: storePlanItems,
    });
  }, [race, profile, runs, storePlans, storePlanItems]);

  /* #113/#114 (2026-11-06): o volume até à prova numa só leitura, neutra (utils/raceVolumeText.js),
     no lugar do aviso «volume insuficiente» — que parecia acusar o atleta de falhar o plano. */
  const volumeOutlook = useMemo(
    () => outlookForRace({ race, profile, runs, coachPlans: storePlans, coachPlanItems: storePlanItems, todayISO: todayISO() }),
    [race, profile, runs, storePlans, storePlanItems],
  );
  /* Perfil de carga (2026-11-09): em conflito (carga a pedir cautela e volume abaixo, perfil por
     escolher), o cartão das duas opções toma o lugar da leitura do volume — nunca os dois avisos. */
  const loadState = useLoadState();
  const loadConflictHere = loadState?.state === 'conflito' && loadState?.race?.id && loadState.race.id === race?.id;
  const volumeLine = loadConflictHere ? null : volumeReadingText(volumeOutlook);
  // Com Mais volume escolhido para esta prova, «a prova é para completar» contradizia a escolha dele.
  const moreVolumeHere = loadState?.profile === 'mais_volume' && loadState?.race?.id === race?.id;
  const volumeNote = moreVolumeHere ? null : volumeReadingNote(volumeOutlook);
  // Os outros alertas de viabilidade ficam; o do volume passa à leitura acima.
  const viabilityAlerts = plan.viability.flags.filter((f) => f !== 'volume_insuficiente');

  const {
    raceDate,
    planStartDate,
    totalWeeks,
    recoveryDays,
    daysToRace,
    daysToStart,
    currentWeek,
    progressPercentage,
    trainingStatus,
    equivalentKm,
    currentPhase,
    phases,
    readinessLevel,
    carolAnalysis,
  } = plan;

  const togglePhase = (id) => {
    setExpandedPhaseId(prev => (prev === id ? null : id));
  };

  /* "11 set 2026 · 09:00" — a hora de partida só entra quando existe; sem
     ela o cabeçalho fica exatamente como sempre foi. O rascunho da agenda
     (RunAgenda passa `race={draft}`) já traz 'HH:MM'; o registo gravado
     traz 'HH:MM:SS' da BD — normalizeStartTime concilia os dois. */
  const formattedRaceDate = formatDatePTShort(raceDate);
  const raceStartTime = normalizeStartTime(race?.start_time);
  const raceDateLine = raceStartTime ? `${formattedRaceDate} · ${raceStartTime}` : formattedRaceDate;
  const info = race?.web_info || null;

  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  const goalHistory = useAppStore((s) => s.goalHistory);
  const readiness = useMemo(() =>
    // No v2, com o treino de hoje como o Geral (raceReadinessV2.js): o mesmo número nos três sítios.
    calculateReadinessIndex(runs, meals, bodyAssessments, gymSessions, profile, race, dailyCheckins, v2 ? trainingTodayOf(storePlans, storePlanItems) : undefined, goalHistory),
  [runs, meals, bodyAssessments, gymSessions, profile, race, dailyCheckins, goalHistory, v2, storePlans, storePlanItems]);

  // Sem pilares com dados (readinessIndex.ts, 2026-10-04), nenhuma luz acende
  // e a pílula diz "a calibrar" — não "Baixa (0%)".
  const calibrating = !!readiness.calibrating;
  const readinessTitle = calibrating ? 'a calibrar' : readiness.level === 'high' ? 'Alta' : readiness.level === 'medium' ? 'Média' : 'Baixa';
  const lightLevel = calibrating ? null : readiness.level;

  // Previsão de tempo/pace nesta prova — mesmo cálculo do gráfico "Evolução
  // VDOT & Previsão de Prova" (BI/RacePredictionChart) e dos insights do
  // Dashboard: getRacePrediction é o ponto único que resolve nível de
  // experiência e distância equivalente ITRA, para não voltar a divergir
  // entre ecrãs (ver nota em utils/biEngine.js).
  /* As corridas que servem para prever: o fastestRun do motor só exige
     distance_km > 0, por isso uma corrida com distância e sem duração entrava
     como acumulador do reduce e devolvia NaN — o que apagava a previsão do
     ecrã e punha o bloco a dizer "Regista corridas" a quem tem corridas
     registadas. O filtro estava dentro do raceForecast, mas o hub passa-lhe a
     previsão já feita, por isso nunca corria no único caminho real (2.ª
     revisão pré-deploy). Fica aqui, onde a previsão nasce, e serve também o
     plano do dia e a distância equivalente. É o mesmo critério do
     classifyRaceOutcome. */
  const runsComTempo = useMemo(() =>
    // Só corridas: uma caminhada não prevê tempo de prova (runKinds.ts, 2026-10-05).
    runsOnly(runs).filter((r) => Number(r?.distance_km) > 0 && Number(r?.duration_seconds) > 0),
  [runs]);

  const prediction = useMemo(() =>
    getRacePrediction(race, profile, runsComTempo),
  [race, profile, runsComTempo]);

  /* O objetivo e a previsão prontos a ler, com ritmo, diferença e leitura
     (utils/raceTimes.js) — o mesmo sítio de onde saem o bloco pós-prova e o
     contexto da Carol, para os três nunca discordarem. */
  const forecast = useMemo(() =>
    raceForecast({ race, runs, profile, prediction }),
  [race, runs, profile, prediction]);

  /* ── Plano para o dia (specs/plano-de-prova.md) ─────────────────────────
     Só nos últimos 7 dias e no próprio dia: antes disso o que interessa é o
     treino, não o ritmo do km 1. A régua é buildRacePacingPlan
     (@formulas/racePacing.ts), a mesma que a Carol lê no coach-chat — o hub
     não tem plano próprio, só lhe dá as entradas.

     O objetivo lê-se de target_time_seconds; o hub também recebe o rascunho
     da agenda, que só converte o texto ao gravar, por isso target_time
     (livre, "1:52:00") é o recurso. A previsão é a do treino: para uma prova
     futura todas as corridas são anteriores a ela. */
  const showPacingPlan = daysToRace >= 0 && daysToRace <= 7;
  const pacingPlan = useMemo(() => {
    if (!showPacingPlan) return null;
    const targetSeconds = Number(race?.target_time_seconds) > 0
      ? Number(race.target_time_seconds)
      : parseDurationToSeconds(race?.target_time);
    const predictedSeconds = Number(prediction?.predictedSeconds) > 0
      ? Math.round(prediction.predictedSeconds)
      : null;
    return buildRacePacingPlan({
      distanceKm: race?.distance_km,
      raceType: race?.race_type,
      elevationGainM: race?.elevation_gain_m,
      targetSeconds: targetSeconds > 0 ? targetSeconds : null,
      predictedSeconds,
      experienceLevel: race?.experience_level,
      // GPX primeiro, site depois — a regra do racePacingRoute do coach-chat (bug 2026-11-14).
      ...pacingRouteInput(race),
    });
  }, [showPacingPlan, race, prediction]);

  /* ══════ Ponto 7 do redesenho: o hub DEPOIS da prova ══════
     Mock "Hub de prova · depois da prova". Até aqui, uma prova já corrida
     continuava a mostrar a contagem decrescente ("Concluída" dentro de um
     cartão chamado "Contagem para a Prova"), a previsão VDOT para uma prova
     que já aconteceu e o macrociclo por cumprir — um ecrã inteiro a olhar
     para a frente quando já não há frente nenhuma. Este estado olha para
     trás: o tempo final, o balanço da Carol, o ciclo fechado, e a única
     pergunta que ainda faz sentido, "e agora?". */
  const isCompleted = race?.status === 'concluida' || trainingStatus === 'completed';

  /* A corrida que registou esta prova é o que dá o tempo final. Procura-se
     por runs.race_id — a ligação real desde specs/prova-concluida.md — e só
     depois pela coincidência de data, que é o que existia antes e falhava em
     qualquer registo feito no dia seguinte (ver findRaceRun). Sem corrida
     nenhuma não se inventa nada: pede-se o registo. */
  const raceRun = useMemo(() => findRaceRun(runs, race), [runs, race]);

  /* Registar a prova: a entrada existe a partir do DIA da prova, esteja ela
     marcada como concluída ou não. É a mesma ação das outras duas entradas
     (Início e agenda) e passa pelo mesmo ponto do store. */
  const canRegisterRace = !!race?.id && daysToRace <= 0 && !raceRun;
  const openRaceRegistration = () => {
    const store = useAppStore.getState();
    store.setEditingRaceId(null);
    store.openRaceRun(race.id);
  };

  /* "Marcar como concluída" sem registo (spec §1, a saída secundária): no
     hub vive no cartão "Prova & Recuperação" — e, passada a data, no estado
     pós-prova. Só a partir do DIA da prova (pedido 2026-09-12): antes disso
     o botão fica visível mas desativado, para se perceber onde vai
     aparecer. Sai de cena quando já há corrida ligada (aí a prova conclui-se
     pelo registo) ou quando já está concluída. Pede confirmação: é um estado
     que não se desfaz a partir daqui. */
  const isMarkedCompleted = race?.status === 'concluida';
  const showMarkCompleted = !!onMarkCompleted && !!race?.id && !raceRun && !isMarkedCompleted;
  const canMarkCompleted = showMarkCompleted && daysToRace <= 0;
  const markCompletedButton = showMarkCompleted ? (
    <div className="space-y-1">
      <Button
        variant="light"
        onClick={() => setConfirmCompleted(true)}
        disabled={!canMarkCompleted}
        type="button"
        data-testid="race-hub-mark-completed"
        className={`w-full text-xs ${canMarkCompleted ? 'text-[var(--ok)]' : ''}`}
        icon={<CheckCircle2 size={14} />}
      >
        Marcar como concluída
      </Button>
      {!canMarkCompleted && (
        <p className="text-[11px] text-center text-[var(--text-4)]">Disponível a partir do dia da prova.</p>
      )}
    </div>
  ) : null;
  const confirmCompletedModal = showMarkCompleted ? (
    <PremiumModal
      isOpen={confirmCompleted}
      onClose={() => setConfirmCompleted(false)}
      title="Marcar a prova como concluída?"
      icon={Trophy}
      theme="race"
      variant="dialog"
      maxWidth="max-w-sm"
    >
      <div className="p-6">
        <p className="text-[13px] text-[var(--text-3)] mb-6 leading-relaxed">
          «{race.name}» fica concluída sem corrida registada. Se ainda quiseres guardar o tempo e as memórias, usa antes "Registar a prova".
        </p>
        <div className="space-y-3">
          <Button
            onClick={() => { setConfirmCompleted(false); onMarkCompleted(race); }}
            type="button"
            variant="module"
            moduleColor="var(--mod-prova)"
            className="w-full"
            icon={<CheckCircle2 size={14} />}
          >
            Sim, concluída
          </Button>
          <Button onClick={() => setConfirmCompleted(false)} type="button" variant="ghost" className="w-full">
            Cancelar
          </Button>
        </div>
      </div>
    </PremiumModal>
  ) : null;

  /* ── Galeria de memórias (spec §4) ──────────────────────────────────────
     Os caminhos estão em race_events; o bucket é privado, por isso as URLs
     assinam-se na hora, tal como as fotos dos outros registos. */
  const memoryPaths = useMemo(() => ({
    diploma: race?.diploma_path || null,
    medal: race?.medal_path || null,
    photos: race?.photo_paths || [],
  }), [race?.diploma_path, race?.medal_path, race?.photo_paths]);
  const hasMemories = !!(memoryPaths.diploma || memoryPaths.medal || memoryPaths.photos.length);
  const [memoryUrls, setMemoryUrls] = useState({ diploma: null, medal: null, photos: [] });
  const [openPhoto, setOpenPhoto] = useState(null);
  // O ecrã "Memórias" (pedido 2026-09-13, ecrã inteiro desde 2026-09-15):
  // juntar, trocar ou remover o diploma, a medalha e as fotos DEPOIS de a
  // prova estar concluída, sem reabrir o registo da corrida.
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  // O mural para partilhar (pedido 2026-09-13): as fotos, o tempo e a
  // distância numa imagem para o Instagram, composta no telemóvel.
  const [muralOpen, setMuralOpen] = useState(false);

  useEffect(() => {
    if (!hasMemories) { setMemoryUrls({ diploma: null, medal: null, photos: [] }); return undefined; }
    let cancelled = false;
    const sign = async (path) => {
      if (!path) return null;
      try {
        const { data, error } = await supabase.storage.from('race-memories').createSignedUrl(path, 3600);
        return error ? null : (data?.signedUrl || null);
      } catch (err) {
        return null;
      }
    };
    (async () => {
      const [diploma, medal, ...photos] = await Promise.all([
        sign(memoryPaths.diploma), sign(memoryPaths.medal), ...memoryPaths.photos.map(sign),
      ]);
      if (!cancelled) setMemoryUrls({ diploma, medal, photos: photos.filter(Boolean) });
    })();
    return () => { cancelled = true; };
  }, [hasMemories, memoryPaths]);

  /* ── Conquistas desta prova (specs/gamificacao-provas.md §2) ────────────
     Entre as memórias e o balanço: o que esta prova deu, e numa linha
     discreta o que ficou para a próxima. A lista sai do mesmo
     `achievementsForRace` do Início e do Perfil, e esse do motor único dos
     prémios (utils/premios.js) — o hub não tem régua própria. O palmarés
     precisa de TODAS as provas para contar; o store é a fonte, mas a prova
     aberta entra sempre, mesmo que o store esteja vazio (é o caso dos testes
     que montam o hub à mão). */
  const storeRaceEvents = useAppStore((s) => s.raceEvents);
  const palmaresRaces = useMemo(() => {
    const all = storeRaceEvents || [];
    if (!race?.id) return all;
    return all.some((e) => e?.id === race.id) ? all : [...all, race];
  }, [storeRaceEvents, race]);

  const raceOutcome = useMemo(
    () => (raceRun ? classifyRaceOutcome({ race, run: raceRun, runs, profile, races: palmaresRaces }) : null),
    [race, raceRun, runs, profile, palmaresRaces],
  );
  // O motor dos prémios exige o dia injetado (utils/premios.js): o hub lê-o
  // aqui uma vez, para as conquistas desta prova e o Palmarés não poderem
  // discordar sobre que dia é hoje.
  const hoje = todayISO();
  // As conquistas e as memórias têm interruptor (v1 lite).
  const badgesOn = useFeature('badges');
  const memoriesOn = useFeature('race_memories');
  const cupOn = useFeature('cup');
  const raceAchievements = useMemo(
    () => (badgesOn && raceRun && race?.id ? achievementsForRace({ raceEvents: palmaresRaces, runs, profile, today: hoje }, race.id) : []),
    [badgesOn, raceRun, palmaresRaces, runs, profile, race?.id, hoje],
  );
  const raceMissed = useMemo(
    () => (badgesOn && raceRun && race?.id ? missedInRace({ raceEvents: palmaresRaces, runs, profile, today: hoje }, race.id) : []),
    [badgesOn, raceRun, palmaresRaces, runs, profile, race?.id, hoje],
  );

  /* Os badges que ESTA prova deu (utils/badges.js) — hoje o `recorde_pessoal`,
     o único badge que nasce de uma prova. Só servem ao estúdio do mural: no
     hub as conquistas já dizem o mesmo em fichas, e a Vitrina dos badges vive
     no Perfil. O plano e o ginásio entram porque o motor é o mesmo de sempre
     e calcula a lista toda; o filtro pelo `raceId` é que decide o que sai. */
  const storeGymSessions = useAppStore((s) => s.gymSessions);
  const raceBadges = useMemo(
    () => (raceRun && race?.id
      ? badgesForRace({ raceEvents: palmaresRaces, runs, profile, planItems: storePlanItems, gymSessions: storeGymSessions, today: hoje }, race.id)
      : []),
    [raceRun, palmaresRaces, runs, profile, storePlanItems, storeGymSessions, race?.id, hoje],
  );

  // Resumo do ciclo: só o que se calcula dos registos reais (volume e VDOT).
  // "Adesão ao plano" e "Lesões" do mock não têm fonte no modelo de dados —
  // ficam de fora em vez de saírem inventados.
  const cycleSummary = useMemo(() => {
    if (!isCompleted) return null;
    const inCycle = (runs || []).filter(r => r.date >= planStartDate && r.date <= raceDate);
    const totalKm = inCycle.reduce((sum, r) => sum + Number(r.distance_km || 0), 0);
    const trend = getVDOTTrend(runs || []).filter(v => v.date >= planStartDate && v.date <= raceDate);
    const fmt1 = (n) => Number(n).toFixed(1).replace('.', ',');
    return {
      totalKm: totalKm > 0 ? `${fmt1(totalKm)} km` : null,
      vdot: trend.length >= 2 ? `${fmt1(trend[0].vdot)} \u2192 ${fmt1(trend[trend.length - 1].vdot)}` : null,
    };
  }, [isCompleted, runs, planStartDate, raceDate]);

  if (isCompleted) {
    // O tempo do herói é o mesmo da régua (raceOutcome): o oficial do
    // cronómetro da organização quando existe, senão a duração registada.
    // Antes lia só duration_seconds — dava dois tempos diferentes no mesmo
    // ecrã, e uma corrida só com tempo oficial (manual, sem relógio) fazia o
    // hub dizer "não tenho a corrida desta prova" com a corrida lá.
    const finalSeconds = raceResultSeconds(raceRun) || 0;
    const finalTime = finalSeconds > 0 ? formatDuration(Math.round(finalSeconds)) : null;
    // O que o diploma trouxe (dorsal, escalão, posições, participantes).
    const classification = describeRaceClassification(raceRun?.details, profile?.gender);
    const officialTimes = describeRaceTimes(raceRun?.details);
    const finalPace = finalSeconds > 0 && Number(raceRun?.distance_km) > 0
      ? formatPace(Math.round(finalSeconds / Number(raceRun.distance_km)))
      : null;
    /* Os quatro números da prova concluída — objetivo, o que o treino
       previa, o real e o melhor anterior na mesma distância, todos com
       ritmo. Antes eram dois quadrados: o objetivo sem ritmo (e só se o
       campo de texto livre estivesse preenchido) e a diferença face ao
       treino. A previsão que conta é a do TREINO — só corridas ANTERIORES
       à prova (raceOutcome.predictedSeconds); a `prediction` geral inclui
       a própria corrida da prova, que sendo a mais rápida "previa-se" a si
       mesma e dava sempre "−0:00". */
    const timesBreakdown = raceTimesBreakdown(raceOutcome, race);
    // Prova dada como concluída sem corrida associada: não há real nem
    // diferenças para mostrar, mas o objetivo que ele pediu continua a ser
    // informação — fica a linha sozinha em vez de desaparecer o bloco.
    const targetOnly = timesBreakdown ? null : targetLine(race);

    const leaveTo = (mode) => {
      const store = useAppStore.getState();
      // Pelo navGuard, como o «+» do Layout: com alterações por gravar abre o aviso em vez de as perder.
      if (store.navGuard && !store.navGuard(store.activeTab)) return;
      store.setEditingRaceId(null);
      if (mode) store.setOpenCreationMode(mode);
    };

    // O convite (sem memórias) e o "Editar" (com elas) abrem o ecrã das
    // memórias aqui mesmo — a prova já está concluída, o registo da corrida
    // não tem de se reabrir para juntar uma foto.
    const openMemories = () => setMemoriesOpen(true);
    // O RESULTADO edita-se no registo da corrida, em modo prova (o mesmo
    // ecrã de registar, com os campos preenchidos) — depois da conclusão é
    // isto que se muda, não os detalhes de criação da prova (pedido
    // 2026-09-13). O store já sabe reabrir um registo pela prova.
    // openRaceRun já fecha a prova em edição (editingRaceId) por si.
    const openRunEdit = () => useAppStore.getState().openRaceRun(race.id, raceRun.id);
    const memoriesUserId = useAppStore.getState().profile?.id || profile?.id || null;

    /* Os blocos do depois da prova em constantes (2026-11-25): o hub de sempre e o v2
       (RaceDoneV2) mostram os mesmos — as memórias, o mural, as conquistas e o ciclo. */
    const memoriesBlock = (
      <>
      {/* 1b. As memórias do dia — medalha em destaque, diploma e as
          fotografias. Sem nada guardado fica o convite, discreto: é uma
          oferta, não uma tarefa por cumprir. */}
      {/* As memórias têm interruptor (v1 lite): desligadas, fica só o diploma (é resultado — a Carol
          lê-o); a medalha, as fotos e o mural saem. */}
      {(memoriesOn ? hasMemories : !!memoryPaths.diploma) ? (
        <>
          <div className="flex items-center justify-between" style={{ margin: '16px 2px 0' }}>
            <SectionLabel tone="race">{memoriesOn ? 'Memórias' : 'Diploma'}</SectionLabel>
            <button
              type="button"
              data-testid="race-memories-edit"
              onClick={openMemories}
              className="inline-flex items-center gap-1 text-[12px] font-extrabold"
              style={{ minHeight: 'var(--tap)', padding: '0 6px', color: 'var(--race)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Award size={13} /> Editar
            </button>
          </div>
          <div data-testid="race-memories-gallery" style={{ borderRadius: 22, background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', padding: 14, marginTop: 8 }}>
            {memoriesOn && memoryUrls.medal && (
              <img
                src={memoryUrls.medal}
                alt="A medalha da prova"
                style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 16, border: '1px solid var(--tint-race-bd)', display: 'block' }}
              />
            )}

            {memoryPaths.diploma && (
              memoryPaths.diploma.toLowerCase().endsWith('.pdf') ? (
                <a
                  href={memoryUrls.diploma || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2"
                  style={{ minHeight: 'var(--tap)', marginTop: memoryUrls.medal ? 10 : 0, borderRadius: 14, background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)', fontSize: 12.5, fontWeight: 800, textDecoration: 'none' }}
                >
                  <Award size={15} /> Abrir diploma
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenPhoto(memoryUrls.diploma)}
                  aria-label="Ver o diploma em ecrã inteiro"
                  style={{ display: 'block', width: '100%', minHeight: 'var(--tap)', marginTop: memoryUrls.medal ? 10 : 0, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <img src={memoryUrls.diploma} alt="Diploma da prova" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 16, border: '1px solid var(--border-glass)', display: 'block' }} />
                </button>
              )
            )}

            {memoriesOn && memoryUrls.photos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: (memoryUrls.medal || memoryPaths.diploma) ? 10 : 0 }}>
                {memoryUrls.photos.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setOpenPhoto(url)}
                    aria-label={`Ver a fotografia ${i + 1} em ecrã inteiro`}
                    // Miniatura quadrada, nunca abaixo do piso de toque.
                    style={{ minHeight: 'var(--tap)', minWidth: 'var(--tap)', aspectRatio: '1 / 1', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    <img src={url} alt={`Fotografia ${i + 1} da prova`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border-glass)' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : raceRun ? (
        <button
          type="button"
          data-testid="race-memories-invite"
          onClick={openMemories}
          className="w-full inline-flex items-center justify-center gap-2"
          style={{ minHeight: 'var(--tap)', marginTop: 12, borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
        >
          <Award size={15} /> {memoriesOn ? 'Guardar as memórias da prova' : 'Juntar o diploma da prova'}
        </button>
      ) : null}

      {memoriesOn && raceRun && (
        <button
          type="button"
          data-testid="race-mural-open"
          onClick={() => setMuralOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2"
          style={{ minHeight: 'var(--tap)', marginTop: 10, borderRadius: 14, background: 'var(--tint-race-bg)', border: '1px solid var(--tint-race-bd)', color: 'var(--race)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
        >
          <Star size={15} /> Montar o mural para partilhar
        </button>
      )}

      </>
    );
    const memorySheets = (
      <>
      {memoriesOpen && (
        <RaceMemoriesSheet race={race} run={raceRun} userId={memoriesUserId} diplomaOnly={!memoriesOn} onSaved={onMemoriesSaved} onClose={() => setMemoriesOpen(false)} />
      )}
      {memoriesOn && muralOpen && (
        <RaceMuralSheet race={race} run={raceRun} seconds={finalSeconds} classification={classification} achievements={raceAchievements} badges={raceBadges} memoryUrls={memoryUrls} onSaved={onMemoriesSaved} onClose={() => setMuralOpen(false)} />
      )}

      {openPhoto && (
        <Sheet eyebrow="Memórias" eyebrowTone="race" onClose={() => setOpenPhoto(null)} testId="race-photo-viewer" maxHeight="90dvh">
          <img src={openPhoto} alt="Memória da prova em ecrã inteiro" style={{ width: '100%', borderRadius: 14, display: 'block', marginBottom: 8 }} />
        </Sheet>
      )}

      </>
    );
    const achievementsBlock = (
      <>
      {/* 1c. Conquistas — o que esta prova deu ao palmarés, e o que ficou
          para a próxima. Só com a corrida registada: sem números não há
          conquista nenhuma para mostrar. */}
      {raceRun && raceAchievements.length > 0 && (
        <>
          <SectionLabel tone="race" style={{ margin: '16px 2px 0' }}>Conquistas</SectionLabel>
          <div data-testid="race-hub-achievements" className="flex flex-col gap-2" style={{ marginTop: 8 }}>
            {raceAchievements.map((a) => <AchievementCard key={a.key} achievement={a} showDate={false} />)}
          </div>
        </>
      )}
      {raceRun && raceMissed.length > 0 && (
        <div data-testid="race-hub-achievements-missed" style={{ marginTop: raceAchievements.length ? 8 : 12 }}>
          {raceMissed.map((a) => (
            <p key={a.key} className="text-[11.5px] leading-[1.45]" style={{ color: 'var(--text-4)', padding: '0 2px' }}>
              {describeMissedInRace(a, raceOutcome)}
            </p>
          ))}
        </div>
      )}

      </>
    );
    const cycleBlock = (
      <>
      {/* 3. O ciclo fechado: trilho completo (marcador na meta) e o que se
          consegue somar dos registos reais. */}
      <SectionLabel style={{ margin: '16px 2px 0' }}>{`Ciclo de ${totalWeeks} semanas`}</SectionLabel>

      <RaceTrail
        weeks={totalWeeks}
        current={totalWeeks}
        startLabel={formatDateDayMonth(planStartDate)}
        endLabel={formatDateDayMonth(raceDate)}
      />

      {(cycleSummary?.totalKm || cycleSummary?.vdot) && (
        <div style={{ borderRadius: 20, background: 'var(--surface-glass)', border: '1px solid var(--border-glass)', padding: '6px 16px', marginTop: 10 }}>
          {cycleSummary.totalKm && (
            <div className="flex items-center justify-between" style={{ padding: '12px 0', borderBottom: cycleSummary.vdot ? '1px solid rgba(255,255,255,.08)' : 'none' }}>
              <span className="text-[12.5px]" style={{ color: 'var(--text-3)' }}>Volume total</span>
              <span className="text-[13px] font-extrabold" style={{ color: 'var(--text-1)' }}>{cycleSummary.totalKm}</span>
            </div>
          )}
          {cycleSummary.vdot && (
            <div className="flex items-center justify-between" style={{ padding: '12px 0' }}>
              <span className="text-[12.5px]" style={{ color: 'var(--text-3)' }}>Forma no início / fim</span>
              <span className="text-[13px] font-extrabold" style={{ color: 'var(--text-1)' }}>{cycleSummary.vdot}</span>
            </div>
          )}
        </div>
      )}

      </>
    );

    // O Design v2 (utils/designV2.js): a forma do RaceDoneV2, com os mesmos números e as mesmas saídas.
    if (v2) {
      const talk = () => {
        const store = useAppStore.getState();
        store.setCoachIntent({ kind: 'say', text: `${race.name ? `Já fiz a prova «${race.name}».` : 'Já fiz a prova.'} O que fazemos a seguir?` });
        if (store.setActiveTab('coach') === false) { store.setCoachIntent(null); return; }
        leaveTo(null);
      };
      return (
        <Suspense fallback={null}>
        <RaceDoneV2
          race={race}
          finalSeconds={finalSeconds}
          runDistanceKm={Number(raceRun?.distance_km) || null}
          breakdown={timesBreakdown}
          details={raceRun?.details}
          carolText={race?.coach_balance || (raceOutcome ? describeRaceOutcome(raceOutcome, race) : carolAnalysis.overviewText)}
          onEditRun={raceRun?.id ? openRunEdit : null}
          onRegister={openRaceRegistration}
          onNext={() => leaveTo('race')}
          onTalk={talk}
          markCompleted={markCompletedButton && <div className="mt-2">{markCompletedButton}{confirmCompletedModal}</div>}
          extras={cupOn && <CupRaceBlock race={race} />}
          sections={(
            <>
              {/* O balanço inteiro (com as sugestões): recolhido, mas montado — é ele que o pede. */}
              <HubCollapsible id="balanco" title="O balanço da Carol" testId="race-done-v2-balance">
                <RaceBalanceCard
                  race={race}
                  run={raceRun}
                  runs={runs}
                  profile={profile}
                  numbersLine={raceOutcome ? describeRaceOutcome(raceOutcome, race) : carolAnalysis.overviewText}
                  onLeave={() => leaveTo(null)}
                  onSaved={onMemoriesSaved}
                />
              </HubCollapsible>
              {/* Os tempos todos: o objetivo, o que o treino previa e o melhor anterior, cada um com a
                  diferença, e o que o diploma trouxe (a classificação, o tempo bruto, as passagens). */}
              {(timesBreakdown || classification || officialTimes) && (
                <HubCollapsible id="tempos" title="Os tempos" summary={timesBreakdown?.rows?.some((r) => r.key === 'melhor') ? 'com o melhor anterior' : null} testId="race-done-v2-times">
                  {classification && <p data-testid="race-classification" className="v2-sub">{classification}</p>}
                  {officialTimes && <p data-testid="race-official-times" className="v2-sub" style={{ marginTop: 4 }}>{officialTimes}</p>}
                  {timesBreakdown && <RaceTimesBreakdown breakdown={timesBreakdown} />}
                </HubCollapsible>
              )}
              {/* As memórias (a galeria, o convite, o mural) e as conquistas (as ganhas e as que
                  ficaram por fazer), com os interruptores de sempre. */}
              {memoriesBlock}
              {achievementsBlock}
              {/* O ciclo fechado: recolhido. */}
              <HubCollapsible id="ciclo" title={`O ciclo de ${totalWeeks} semanas`} summary={cycleSummary?.totalKm || null} testId="race-done-v2-cycle">
                {cycleBlock}
              </HubCollapsible>
            </>
          )}
          sheets={memorySheets}
        />
        </Suspense>
      );
    }

    return (
      <div className="race-hub-container" data-testid="race-hub-completed">
        {/* 1. Tempo final — o número herói do mock (44px, --text-num-lg). */}
        <div
          className="relative overflow-hidden"
          style={{
            background: 'var(--surface-glass)',
            backdropFilter: 'blur(var(--blur-card))',
            WebkitBackdropFilter: 'blur(var(--blur-card))',
            border: '1px solid rgba(251,191,36,.3)',
            borderRadius: 26,
            padding: 20,
            boxShadow: 'var(--shadow-card)',
            textAlign: 'center',
          }}
        >
          <div aria-hidden="true" className="absolute pointer-events-none" style={{ right: -40, top: -40, width: 200, height: 200, background: 'radial-gradient(circle, rgba(251,191,36,.2) 0%, transparent 70%)' }} />

          <div className="relative">
            {/* O rótulo do herói diz o mesmo que a conquista "Prova
                concluída" logo abaixo — o testid distingue-os. */}
            <div data-testid="race-hub-eyebrow" className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '.08em', color: 'var(--race)' }}>
              Prova concluída
            </div>
            <h1 className="text-[16px] font-extrabold mt-1" style={{ color: 'var(--text-1)', letterSpacing: '-.02em' }}>
              {race?.name || 'Prova'}
            </h1>

            <span
              className="inline-flex items-center justify-center mt-3"
              style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--grad-race)', color: 'var(--race-ink)' }}
            >
              <Trophy size={22} />
            </span>

            {finalTime ? (
              <>
                <div className="text-[11px] font-extrabold uppercase mt-3" style={{ letterSpacing: '.1em', color: 'var(--race)' }}>
                  Tempo final
                </div>
                <div
                  data-testid="race-final-time"
                  style={{ fontSize: 'var(--text-num-lg)', fontWeight: 900, color: 'var(--text-1)', lineHeight: 1, letterSpacing: '-.03em', marginTop: 7, fontVariantNumeric: 'tabular-nums' }}
                >
                  {finalTime}
                </div>
                <div className="text-[13px] mt-2" style={{ color: 'var(--text-3)' }}>
                  {[finalPace ? `${finalPace}/km` : null, formatDatePTShort(raceDate)].filter(Boolean).join(' · ')}
                </div>
                {classification && (
                  <div data-testid="race-classification" className="text-[12px] mt-1.5" style={{ color: 'var(--text-4)' }}>
                    {classification}
                  </div>
                )}
                {officialTimes && (
                  <div data-testid="race-official-times" className="text-[12px] mt-1" style={{ color: 'var(--text-4)' }}>
                    {officialTimes}
                  </div>
                )}

                {timesBreakdown && <RaceTimesBreakdown breakdown={timesBreakdown} />}
                {raceRun?.id && (
                  <button
                    type="button"
                    data-testid="race-hub-edit-run"
                    onClick={openRunEdit}
                    className="inline-flex items-center justify-center gap-1.5 mt-4"
                    style={{ minHeight: 'var(--tap)', padding: '0 14px', borderRadius: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Pencil size={13} /> Editar o registo
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-[12.5px] leading-[1.5] mt-3" style={{ color: 'var(--text-3)' }}>
                  Não tenho a corrida desta prova. Regista-a e mostro-te o tempo final ao lado do objetivo.
                </p>
                {targetOnly && (
                  <div data-testid="race-times-target-only" className="flex gap-2.5 mt-4">
                    <div className="flex-1" style={{ borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', padding: 11 }}>
                      <div className="text-[11px]" style={{ color: 'var(--text-4)' }}>Objetivo</div>
                      <div className="text-[14px] font-extrabold mt-1" style={{ color: 'var(--text-1)' }}>
                        {targetOnly.timeLabel}{targetOnly.paceLabel ? ` · ${targetOnly.paceLabel}` : ''}
                      </div>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={openRaceRegistration}
                  className="w-full inline-flex items-center justify-center gap-2 mt-4"
                  style={{ minHeight: 'var(--tap)', borderRadius: 14, background: 'var(--grad-race)', color: 'var(--race-ink)', fontSize: 13.5, fontWeight: 800, border: 'none', cursor: 'pointer' }}
                >
                  Registar a prova
                </button>
                {/* Data passada mas ainda "agendada": a saída secundária
                    também aqui, porque o cartão das fases já não se mostra
                    neste estado. */}
                {markCompletedButton && <div className="mt-2">{markCompletedButton}</div>}
                {confirmCompletedModal}
              </>
            )}
          </div>
        </div>

        {cupOn && <CupRaceBlock race={race} />}

        {memoriesBlock}
        {memorySheets}
        {achievementsBlock}
        {/* 2. Balanço da Carol — o balanço completo, pedido ao coach-chat
            assim que a corrida está registada (RaceBalanceCard); por baixo,
            a linha de números da régua única. Sem corrida fica o texto do
            motor, que é o único que existe. */}
        <RaceBalanceCard
          race={race}
          run={raceRun}
          runs={runs}
          profile={profile}
          numbersLine={raceOutcome ? describeRaceOutcome(raceOutcome, race) : carolAnalysis.overviewText}
          onLeave={() => leaveTo(null)}
          onSaved={onMemoriesSaved}
        />

        {cycleBlock}
        {/* 4. E agora? As duas saídas do mock. "Arquivar e descansar" não
            entra: não existe arquivo no modelo de dados (o estado
            "concluída" já é o fim da linha), e o handoff proíbe inventar
            funcionalidades. Fica a conversa com a Carol, que é onde o
            próximo ciclo se decide. */}
        <button
          type="button"
          onClick={() => leaveTo('race')}
          className="w-full inline-flex items-center justify-center gap-2"
          style={{ minHeight: 48, marginTop: 16, borderRadius: 14, border: 'none', background: 'var(--grad-race)', color: 'var(--race-ink)', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
        >
          <Plus size={16} /> Marcar a próxima prova
        </button>
        {/* Leva a prova ao chat (2026-10-05; antes só mudava de separador e
            a conversa abria sem saber de onde ele vinha). Não é o
            'race_balance': o balanço já está aqui em cima (RaceBalanceCard),
            pedido ao mesmo servidor — repeti-lo no chat era dizer duas vezes
            o mesmo. É o 'say': a pergunta dele entra na conversa, com a
            prova pelo nome. Fica secundário, com o balão da Carol: o
            primário deste ecrã é marcar a próxima prova. Se a saída for
            travada, o pedido desfaz-se. */}
        <button
          type="button"
          data-testid="race-done-talk"
          onClick={() => {
            const store = useAppStore.getState();
            store.setCoachIntent({ kind: 'say', text: `${race.name ? `Já fiz a prova «${race.name}».` : 'Já fiz a prova.'} O que fazemos a seguir?` });
            if (store.setActiveTab('coach') === false) { store.setCoachIntent(null); return; }
            leaveTo(null);
          }}
          className="w-full inline-flex items-center justify-center gap-2"
          style={{ minHeight: 'var(--tap)', marginTop: 9, borderRadius: 14, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)', color: 'var(--text-3)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          <MessageCircle size={15} aria-hidden="true" /> Falar com a Carol
        </button>
      </div>
    );
  }

  /* ── O hub antes da prova, por momento (pedido do Rui, 2026-11-22) ────────────────────────────
     Era um só ecrã para todos os momentos, com ~3700 px no dia da prova: a contagem e um cartão só
     para a distância no 1.º ecrã, o «Registar a prova» no 2.º, cinco cartões do macrociclo a
     vermelho. Agora há um bloco principal no topo, conforme o momento, e o resto recolhido:
     · longe (mais de 7 dias): a contagem, a fase em linguagem simples e o objetivo vs a previsão;
     · a última semana (showPacingPlan): o Plano para o dia;
     · o dia (e uma prova passada por registar): «Registar a prova», o Plano e a frase da Carol.
     A distância diz-se uma vez, a frase do objetivo ambicioso uma vez, e sem caixas dentro de
     caixas. Nada se perde: o que saiu do topo está nos recolhidos. */
  const moment = daysToRace <= 0 ? 'dia' : showPacingPlan ? 'semana' : 'longe';
  const kmLabel = formatKmPt(race?.distance_km || 10);
  const trailDplus = race?.race_type === 'trail' && Number(race?.elevation_gain_m) > 0;
  // A linha do cabeçalho: a data (com a hora), e depois o resto — a distância uma vez só.
  const metaRest = [
    race?.location || 'Local a definir',
    trailDplus
      ? `${kmLabel} · +${formatIntPt(race.elevation_gain_m)} m D+${equivalentKm > 0 ? ` (≈ ${formatKmPt(equivalentKm)} equivalentes)` : ''}`
      : kmLabel,
    // O piso só quando é um (estrada, trail): provas antigas guardam aqui a distância («21k»), e repeti-la não diz nada.
    RACE_TERRAIN_TYPES.some((t) => t.key === race?.race_type) ? raceTerrainLabel(race.race_type) : null,
    racePriorityLabel(race?.race_priority || 'a'),
    race?.experience_level ? experienceLevelLabel(race.experience_level) : null,
  ].filter(Boolean).join(' · ');
  const phaseLine = daysToStart > 0
    ? `A preparação começa daqui a ${daysToStart} ${daysToStart === 1 ? 'dia' : 'dias'}`
    : trainingStatus === 'completed'
      ? 'Preparação cumprida'
      : `${currentPhase.name} — semana ${currentWeek} de ${totalWeeks}`;
  const countdown = daysToRace === 1 ? 'Amanhã' : `${daysToRace} dias`;

  const header = (
    <div className="rh-hub-header" data-testid="race-hub-header">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="rh-title">{race?.name || 'Nova Prova'}</h1>
          <p className="rh-hub-meta" data-testid="race-hub-meta">
            <Calendar size={13} className="text-[var(--race)] inline-block align-[-2px] mr-1" aria-hidden="true" />
            <span data-testid="race-hub-date">{raceDateLine}</span>
            {' · '}{metaRest}
          </p>
        </div>
        {/* Semáforo de Prontidão Carol */}
        <div className="rh-traffic-light" title={calibrating ? 'Prontidão Global: a calibrar' : `Prontidão Global: ${readinessTitle} (${readiness.score}%)`}>
          <div className={`rh-light rh-light-red ${lightLevel === 'low' ? 'on' : ''}`} />
          <div className={`rh-light rh-light-yellow ${lightLevel === 'medium' ? 'on' : ''}`} />
          <div className={`rh-light rh-light-green ${lightLevel === 'high' ? 'on' : ''}`} />
        </div>
      </div>
    </div>
  );

  const registerCta = canRegisterRace && (
    // A partir do DIA da prova, a ação que interessa é registá-la (specs/prova-concluida.md §3).
    <button
      type="button"
      data-testid="race-hub-register"
      onClick={openRaceRegistration}
      className="w-full inline-flex items-center justify-center gap-2"
      style={{ minHeight: 'var(--tap)', margin: '4px 0 12px', borderRadius: 14, border: 'none', background: 'var(--grad-race)', color: 'var(--race-ink)', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
    >
      <Trophy size={16} /> Registar a prova
    </button>
  );

  const pacing = showPacingPlan && (
    <RacePacingPlanCard
      plan={pacingPlan}
      race={race}
      onGoToEdit={onGoToEdit}
      onFetchWebInfo={onFetchWebInfo}
      fetchingWebInfo={fetchingWebInfo}
      firstRows={3}
    />
  );

  // A contagem, a fase e o objetivo vs a previsão — o bloco principal de longe, e uma linha na
  // última semana (aí a frase do objetivo ambicioso é a do Plano, não esta).
  const summary = (
    <section className="rh-hub-summary" data-testid="race-hub-summary">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="rh-hub-countdown" data-testid="race-hub-countdown">{countdown}</span>
        <span className="text-[13px] font-bold text-[var(--text-2)]" data-testid="race-hub-phase">{phaseLine}</span>
      </div>
      <RaceForecastCard
        showLine={moment === 'longe'}
        forecast={forecast}
        raceType={race?.race_type}
        elevationGainM={Number(race?.elevation_gain_m) || 0}
        // O pedido do objetivo uma vez só: na última semana e no dia, é o do Plano para o dia.
        onSetTarget={moment === 'longe' ? onGoToEdit : null}
      />
    </section>
  );

  const carol = (
    <section className="rh-carol-box" data-testid="race-hub-carol">
      <div className="rh-carol-header">
        <div className="rh-carol-badge">
          <CoachAvatar size={28} />
          <span>Evolução e prontidão</span>
        </div>
        {/* Atenção é coral: o âmbar é da prova (ponto 3). */}
        <span
          className="rh-carol-readiness-pill text-[11px] font-extrabold px-2.5 py-1 rounded-full border"
          style={{
            background: calibrating ? 'var(--surface-dim)'
              : lightLevel === 'high' ? 'color-mix(in srgb, var(--ok) 16%, var(--bg-app))'
              : lightLevel === 'medium' ? 'color-mix(in srgb, var(--warn) 10%, var(--bg-app))'
              : 'color-mix(in srgb, var(--danger) 12%, var(--bg-app))',
            borderColor: calibrating ? 'var(--border-glass)'
              : lightLevel === 'high' ? 'var(--tint-ok-bd)'
              : lightLevel === 'medium' ? 'var(--tint-warn-bd)' : 'var(--tint-danger-bd)',
            color: calibrating ? 'var(--text-2)'
              : lightLevel === 'high' ? 'var(--ok)'
              : lightLevel === 'medium' ? 'var(--warn)' : 'var(--danger)',
          }}
        >
          {calibrating ? 'Prontidão a calibrar' : `Prontidão ${readinessTitle} (${readiness.score}%)`}
        </span>
      </div>

      <p className="rh-carol-body">{carolAnalysis.overviewText}</p>

      {volumeLine && (
        <div data-testid="volume-outlook" className="mt-3">
          <p className="text-[12px] font-bold text-[var(--text-3)]">Volume até à prova</p>
          <p className="text-[13px] mt-0.5 text-[var(--text-1)]" data-testid="volume-outlook-line">{volumeLine}</p>
          {volumeNote && <p className="text-[12px] mt-1 text-[var(--text-2)]" data-testid="volume-outlook-note">{volumeNote}</p>}
        </div>
      )}
      {race?.id && <LoadProfileCard raceId={race.id} />}

      {viabilityAlerts.length > 0 && (
        <Warning title="Alertas de Viabilidade" icon={<AlertTriangle size={12} />} className="mt-4">
          {viabilityAlerts.map((flag) => (
            <span key={flag} className="block">
              {flag === 'ultra_para_iniciante' && '• Prova de Ultra-Trail não recomendada para nível iniciante sem histórico de maratona.'}
              {flag === 'tempo_insuficiente' && `• Faltam ${Math.floor(daysToRace / 7)} semanas — a preparação recomendada para esta distância é de ${totalWeeks} semanas.`}
            </span>
          ))}
        </Warning>
      )}
    </section>
  );

  const extras = (
    <>
      {/* Só para uma prova gravada e por fazer — o .ics lê a prova da BD. */}
      {calendarRaceId && daysToRace >= 0 && <AddToCalendar race={race} raceEventId={calendarRaceId} />}
      {cupOn && <CupRaceBlock race={race} />}
    </>
  );

  /* O macrociclo: a fase atual aberta; as concluídas numa linha que se abre; as que faltam,
     fechadas. Sem a pílula «Sem registos · 40%» nas que passaram — julgava o passado sem dar
     nada a fazer. */
  const donePhases = phases.filter((p) => p.state === 'completed' || p.state === 'skipped');
  const openPhases = phases.filter((p) => !(p.state === 'completed' || p.state === 'skipped'));
  const renderPhase = (phase) => {
    const isActive = phase.state === 'active';
    const isDone = phase.state === 'completed';
    const isSkipped = phase.state === 'skipped';
    const isExpanded = expandedPhaseId === phase.id || (isActive && expandedPhaseId === null);
    const evalData = phase.evaluation;
    const panelId = `rh-phase-${phase.id}`;
    return (
      <div key={phase.id} className={`rh-phase-row ${isActive ? 'active-phase' : ''}`} data-testid={`race-hub-phase-${phase.id}`}>
        <button
          type="button"
          onClick={() => togglePhase(phase.id)}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className="w-full flex items-center justify-between gap-2 text-left"
          style={{ minHeight: 'var(--tap)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="rh-phase-num-badge shrink-0">{isDone ? <CheckCircle2 size={13} /> : phase.number}</span>
            <span className="min-w-0">
              <span className="block truncate font-bold text-[var(--text-1)] text-sm">{phase.name}</span>
              <span className="block text-[11px] text-[var(--text-3)]">{phase.weeksLabel} · {formatDateDayMonth(phase.startDate)} a {formatDateDayMonth(phase.endDate)}</span>
            </span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className={`rh-phase-status-pill rh-pill-${phase.state} whitespace-nowrap`}>
              {isActive ? 'Em curso' : isDone ? 'Concluída' : isSkipped ? 'Não realizada' : 'Planeada'}
            </span>
            {isExpanded ? <ChevronUp size={16} className="text-[var(--text-3)]" /> : <ChevronDown size={16} className="text-[var(--text-3)]" />}
          </span>
        </button>

        <div id={panelId} hidden={!isExpanded} className="rh-phase-eval fade-in">
            <p className="text-[12.5px] leading-[1.5] text-[var(--text-2)]">
              <span className="font-bold text-[var(--text-1)]">O que conta nesta fase:</span> {phase.focus}
            </p>
            {/* A avaliação da Carol só na fase em curso (e na da prova): as que passaram não se julgam. */}
            {!isDone && !isSkipped && (evalData?.summary || evalData?.awaitingRecord) && (
              <div className="mt-2 space-y-1">
                <p className="text-[12px] font-bold text-[var(--text-3)] flex items-center gap-1.5">
                  <Sparkles size={11} /> Avaliação da Carol
                  {evalData?.score != null && <span className="text-[var(--text-2)]">· {evalData.gradeLabel} · {evalData.score}%</span>}
                </p>
                {evalData?.summary && <p className="rh-eval-summary">{evalData.summary}</p>}
              </div>
            )}
            {evalData?.metrics?.runsCount > 0 && (
              <div className="flex items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-[var(--text-3)] flex-wrap">
                <span>Corridas: <strong className="text-[var(--text-2)]">{evalData.metrics.runsCount}</strong></span>
                <span>Volume: <strong className="text-[var(--text-2)]">{evalData.metrics.totalKm} km</strong></span>
                {evalData.metrics.polarizedZ1Z2Pct !== null && (
                  <span>Fácil: <strong className="text-[var(--text-2)]">{evalData.metrics.polarizedZ1Z2Pct}%</strong></span>
                )}
                {evalData.metrics.avgPace && (
                  <span>Ritmo médio: <strong className="text-[var(--text-2)]">{evalData.metrics.avgPace} /km</strong></span>
                )}
              </div>
            )}
            {/* O estado da prova decide-se aqui, na fase da prova. */}
            {phase.id === 'race_recovery' && markCompletedButton && <div className="mt-2">{markCompletedButton}</div>}
        </div>
      </div>
    );
  };

  const macro = (
    <HubCollapsible
      id="macro"
      title={`Macrociclo · ${totalWeeks} semanas`}
      summary={trainingStatus === 'not_started' ? `Começa a ${formatDateDayMonth(planStartDate)}` : `Fase: ${currentPhase.name}`}
      testId="race-hub-macro"
    >
      <div className="rh-track-container" style={{ marginTop: 4 }}>
        <div className="rh-track-bar">
          <div className="rh-track-fill" style={{ '--rh-track-scale': Math.max(0, Math.min(100, progressPercentage)) / 100 }} />
          <div className="rh-runner-dot" style={{ left: `${progressPercentage}%` }}>
            <RunIcon size={14} color="var(--race-deep)" />
          </div>
        </div>
        <div className="rh-track-labels">
          <span>Início ({formatDateDayMonth(planStartDate)})</span>
          <span>Meta ({formatDateDayMonth(raceDate)})</span>
        </div>
      </div>
      {donePhases.length > 0 && (
        <HubCollapsible
          id="macro-done"
          nested
          title={`${donePhases.length} ${donePhases.length === 1 ? 'fase concluída' : 'fases concluídas'}`}
          testId="race-hub-phases-done"
        >
          {donePhases.map(renderPhase)}
        </HubCollapsible>
      )}
      {openPhases.map(renderPhase)}
    </HubCollapsible>
  );

  const course_ = course && (
    // Percurso (GPX): quem monta (RunAgenda) lê o ficheiro e grava; sem `course`, não aparece.
    <HubCollapsible id="course" title="Percurso (GPX)" summary={course.profile ? `${formatKmPt(course.profile.distance_km)} · +${formatIntPt(course.profile.gain_m)} m D+` : 'Carregar o percurso'} testId="race-hub-course-section">
      {(open) => (
        <div data-testid="race-hub-course">
          <CourseProfilePanel {...course} showChart={open} />
        </div>
      )}
    </HubCollapsible>
  );

  const site = (
    <HubCollapsible id="site" title="Site oficial" summary={race?.website?.trim() ? (info ? 'Informação obtida' : 'Por obter') : 'Por adicionar'} testId="race-hub-site">
      {race?.website?.trim() ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <LinkIcon size={13} className="text-[var(--race)] shrink-0" />
              {/* Só é link o que é http(s) — um «javascript:…» fica texto (utils/safeUrl.js). */}
              {safeHttpUrl(race.website) ? (
                <a href={safeHttpUrl(race.website)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--text-2)] underline hover:text-[var(--race)] transition truncate">
                  {race.website}
                </a>
              ) : (
                <span className="text-xs font-semibold text-[var(--text-2)] truncate" data-testid="race-website-text">{race.website}</span>
              )}
            </div>
            {onFetchWebInfo && (
              <Button variant="module" moduleColor="var(--mod-prova)" size="sm" isLoading={fetchingWebInfo} onClick={onFetchWebInfo} icon={info ? <RefreshCw size={12} /> : <Sparkles size={12} />}>
                {info ? 'Atualizar informação' : 'Obter informação'}
              </Button>
            )}
          </div>
          {info ? (
            <RaceWebInfoSections info={info} variant="dark" />
          ) : (
            <p className="text-xs text-[var(--text-3)]">
              Toca em <span className="text-[var(--race)] font-bold">«Obter informação»</span> para extrair horários, dorsais, documentos, regulamento e altimetria do site oficial.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2.5">
          <p className="text-xs text-[var(--text-3)]">Ainda não adicionaste o site oficial desta prova.</p>
          {onGoToEdit && <Button variant="light" size="sm" onClick={onGoToEdit}>Adicionar Site da Prova</Button>}
        </div>
      )}
    </HubCollapsible>
  );

  if (v2) {
    return (
      <Suspense fallback={null}>
      <RaceHubV2
        race={race}
        moment={moment}
        dateLine={raceDateLine}
        meta={metaRest}
        countdown={countdown}
        // Sem travessões no v2 (direção C): «Base Aeróbica, semana 1 de 10».
        phaseLine={phaseLine.replace(' — ', ', ')}
        forecast={forecast}
        plan={showPacingPlan ? pacingPlan : null}
        daysToRace={daysToRace}
        overviewText={carolAnalysis.overviewText}
        canRegister={canRegisterRace}
        onRegister={openRaceRegistration}
        onGoToEdit={onGoToEdit}
        onFetchWebInfo={onFetchWebInfo}
        fetchingWebInfo={fetchingWebInfo}
        extras={extras}
        carolSection={(
          <HubCollapsible id="carol" title="Como chegaste aqui" summary={readinessTextV2(readiness)} testId="race-hub-carol-section">
            {carol}
          </HubCollapsible>
        )}
        macro={macro}
        course={course_}
        site={site}
        modal={confirmCompletedModal}
      />
      </Suspense>
    );
  }

  return (
    <div className="race-hub-container" data-testid="race-hub-prerace" data-moment={moment}>
      {header}

      {moment === 'dia' && (
        <>
          {registerCta}
          {pacing}
          {/* A frase da Carol do dia («É dia de prova…») vale agora: logo a seguir ao plano. */}
          <p className="rh-hub-day-line" data-testid="race-hub-day-line">{carolAnalysis.overviewText}</p>
          {extras}
          <HubCollapsible id="carol" title="Como chegaste aqui" summary={readinessTextV2(readiness)} testId="race-hub-carol-section">
            {carol}
          </HubCollapsible>
        </>
      )}

      {moment === 'semana' && (
        <>
          {pacing}
          {summary}
          {carol}
          {extras}
        </>
      )}

      {moment === 'longe' && (
        <>
          {summary}
          {carol}
          {extras}
        </>
      )}

      {macro}
      {confirmCompletedModal}
      {course_}
      {site}
    </div>
  );
}
