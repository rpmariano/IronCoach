import React, { useEffect, useMemo, useState } from 'react';
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
  Globe,
  Award,
  Flame,
  Zap,
  Star,
  Pencil,
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
import RaceTimesBreakdown from './RaceTimesBreakdown';
import { raceForecast, raceTimesBreakdown, targetLine } from '../../utils/raceTimes';
import RaceMuralSheet from './RaceMuralSheet';
import { buildRacePacingPlan } from '@formulas/racePacing.ts';
import { calculateRaceTrainingPlan, formatDatePTShort, formatDateDayMonth } from '../../utils/racePlanEngine';
import { calculateReadinessIndex, getRacePrediction, getVDOTTrend } from '../../utils/biEngine';
import { racePriorityLabel, raceDistanceLabel, formatPace, formatDuration, findRaceRun, parseDurationToSeconds, describeRaceClassification, describeRaceTimes } from '../../utils/run';
import { classifyRaceOutcome, describeRaceOutcome, raceResultSeconds } from '../../utils/raceOutcome';
import { achievementsForRace, missedInRace, describeMissedInRace } from '../../utils/achievements';
import { badgesForRace } from '../../utils/badges';
import { todayISO } from '../../lib/utils';
import { experienceLevelLabel } from '../../utils/experience';
import { normalizeStartTime } from '../../utils/startTime';
import './RaceHubView.css';

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
}) {
  const [expandedPhaseId, setExpandedPhaseId] = useState(null);
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
  const distanceLabel = raceDistanceLabel(race?.distance_km || 10);
  const info = race?.web_info || null;

  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  const readiness = useMemo(() =>
    calculateReadinessIndex(runs, meals, bodyAssessments, gymSessions, profile, race, dailyCheckins),
  [runs, meals, bodyAssessments, gymSessions, profile, race, dailyCheckins]);

  const readinessTitle = readiness.level === 'high' ? 'Alta' : readiness.level === 'medium' ? 'Média' : 'Baixa';

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
    (runs || []).filter((r) => Number(r?.distance_km) > 0 && Number(r?.duration_seconds) > 0),
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
      routeSegments: race?.web_info?.route_segments || null,
      routeSummary: race?.web_info?.route_summary || null,
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
  const raceAchievements = useMemo(
    () => (raceRun && race?.id ? achievementsForRace({ raceEvents: palmaresRaces, runs, profile, today: hoje }, race.id) : []),
    [raceRun, palmaresRaces, runs, profile, race?.id, hoje],
  );
  const raceMissed = useMemo(
    () => (raceRun && race?.id ? missedInRace({ raceEvents: palmaresRaces, runs, profile, today: hoje }, race.id) : []),
    [raceRun, palmaresRaces, runs, profile, race?.id, hoje],
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

        {/* 1b. As memórias do dia — medalha em destaque, diploma e as
            fotografias. Sem nada guardado fica o convite, discreto: é uma
            oferta, não uma tarefa por cumprir. */}
        {hasMemories ? (
          <>
            <div className="flex items-center justify-between" style={{ margin: '16px 2px 0' }}>
              <SectionLabel tone="race">Memórias</SectionLabel>
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
              {memoryUrls.medal && (
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

              {memoryUrls.photos.length > 0 && (
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
            <Award size={15} /> Guardar as memórias da prova
          </button>
        ) : null}

        {raceRun && (
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

        {memoriesOpen && (
          <RaceMemoriesSheet race={race} run={raceRun} userId={memoriesUserId} onSaved={onMemoriesSaved} onClose={() => setMemoriesOpen(false)} />
        )}
        {muralOpen && (
          <RaceMuralSheet race={race} run={raceRun} seconds={finalSeconds} classification={classification} achievements={raceAchievements} badges={raceBadges} memoryUrls={memoryUrls} onSaved={onMemoriesSaved} onClose={() => setMuralOpen(false)} />
        )}

        {openPhoto && (
          <Sheet eyebrow="Memórias" eyebrowTone="race" onClose={() => setOpenPhoto(null)} testId="race-photo-viewer" maxHeight="90dvh">
            <img src={openPhoto} alt="Memória da prova em ecrã inteiro" style={{ width: '100%', borderRadius: 14, display: 'block', marginBottom: 8 }} />
          </Sheet>
        )}

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
                <span className="text-[12.5px]" style={{ color: 'var(--text-3)' }}>VDOT no início / fim</span>
                <span className="text-[13px] font-extrabold" style={{ color: 'var(--text-1)' }}>{cycleSummary.vdot}</span>
              </div>
            )}
          </div>
        )}

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
        <button
          type="button"
          onClick={() => { leaveTo(null); useAppStore.getState().setActiveTab('coach'); }}
          className="w-full"
          style={{ minHeight: 'var(--tap)', marginTop: 9, borderRadius: 14, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.05)', color: 'var(--text-3)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Falar com a Carol
        </button>
      </div>
    );
  }

  return (
    <div className="race-hub-container">
      {/* ─── 1. Hero Card AAA com Glow & Countdowns Duplos ─────────────────── */}
      <div className="rh-hero-card">
        <div className="rh-glow" />

        <div className="rh-hero-top">
          <div className="flex-1 min-w-0">
            <div className="rh-header-badges">
              <span className="rh-tag">{race?.race_type || 'Estrada'}</span>
              <span className={`rh-priority-pill rh-priority-${race?.race_priority || 'a'}`}>
                {racePriorityLabel(race?.race_priority || 'a')}
              </span>
              <span className="rh-distance-badge">
                {distanceLabel}
              </span>
            </div>
            <h1 className="rh-title">{race?.name || 'Nova Prova'}</h1>
            <div className="rh-sub-info">
              <div className="rh-sub-item">
                <Calendar size={13} className="text-[var(--race)]" />
                <span data-testid="race-hub-date">{raceDateLine}</span>
              </div>
              <div className="rh-sub-item">
                <MapPin size={13} className="text-[var(--race)]" />
                <span>{race?.location || 'Local a definir'}</span>
              </div>
              {race?.experience_level && (
                <div className="rh-sub-item text-[var(--text-3)]">
                  <span>· {experienceLevelLabel(race.experience_level)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Semáforo de Prontidão Carol */}
          <div className="rh-traffic-light" title={`Prontidão Global: ${readinessTitle} (${readiness.score}%)`}>
            <div className={`rh-light rh-light-red ${readiness.level === 'low' ? 'on' : ''}`} />
            <div className={`rh-light rh-light-yellow ${readiness.level === 'medium' ? 'on' : ''}`} />
            <div className={`rh-light rh-light-green ${readiness.level === 'high' ? 'on' : ''}`} />
          </div>
        </div>

        {/* Countdowns Duplos */}
        <div className="rh-countdown-row">
          {/* Card 1: Dias para a Prova */}
          <div className="rh-countdown-box">
            <span className="rh-cd-label">Contagem para a Prova</span>
            <div className="rh-cd-num">
              {daysToRace < 0 ? 'Concluída' : daysToRace === 0 ? 'Hoje!' : daysToRace}
            </div>
            <span className="rh-cd-desc">
              {daysToRace < 0 ? 'Ciclo finalizado' : daysToRace === 0 ? 'Dia da competição' : 'Dias restantes'}
            </span>
          </div>

          {/* Card 2: Fase de Treino em curso — nome da fase em destaque
              (era o contador "Sem. 4"), com "Sem. 4 de 6" como descrição. */}
          <div className="rh-countdown-box">
            <span className="rh-cd-label">Fase de Treino</span>
            <div className={`rh-cd-num ${daysToStart > 0 || trainingStatus === 'completed' ? '' : 'rh-cd-num-phase'}`}>
              {daysToStart > 0 ? (
                `${daysToStart}d`
              ) : trainingStatus === 'completed' ? (
                '100%'
              ) : (
                currentPhase.name
              )}
            </div>
            <span className="rh-cd-desc">
              {daysToStart > 0
                ? 'Para início do treino'
                : trainingStatus === 'completed'
                ? 'Preparação cumprida'
                : `Sem. ${currentWeek} de ${totalWeeks}`}
            </span>
          </div>
        </div>

        {/* Linha de Progresso & Corredor na Timeline */}
        <div className="rh-track-container">
          <div className="rh-track-bar">
            <div className="rh-track-fill" style={{ '--rh-track-scale': Math.max(0, Math.min(100, progressPercentage)) / 100 }} />
            <div className="rh-runner-dot" style={{ left: `${progressPercentage}%` }}>
              <RunIcon size={14} color="var(--race-deep)" />
            </div>
          </div>
          <div className="rh-track-labels">
            <span>Início ({formatDateDayMonth(planStartDate)})</span>
            <span className="text-[var(--race)] font-extrabold">
              {trainingStatus === 'not_started'
                ? `Início em ${daysToStart} dias`
                : trainingStatus === 'completed'
                ? 'Prova Concluída'
                : `Fase: ${currentPhase.name}`}
            </span>
            <span>Meta ({formatDateDayMonth(raceDate)})</span>
          </div>
        </div>

        {/* Specs Grid */}
        <div className="rh-specs-grid">
          <div className="rh-spec-card">
            <span className="rh-spec-lbl">Distância</span>
            <span className="rh-spec-val">{race?.distance_km || 10} km</span>
          </div>
          {race?.race_type === 'trail' && (
            <div className="rh-spec-card">
              <span className="rh-spec-lbl">D+ / ITRA Equiv.</span>
              <span className="rh-spec-val">
                +{race?.elevation_gain_m || 0}m ({equivalentKm} km)
              </span>
            </div>
          )}
          {/* Os dois números num bloco só, com a diferença e a leitura —
              eram dois cartões separados que pediam ao atleta que
              comparasse sozinho (pedido do utilizador). */}
          <RaceForecastCard forecast={forecast} raceType={race?.race_type} elevationGainM={Number(race?.elevation_gain_m) || 0} />
        </div>
      </div>

      {/* A partir do DIA da prova, a ação que interessa é registá-la — mesmo
          que o hub continue a mostrar a preparação, porque "concluída" é
          coisa que só o atleta decide (specs/prova-concluida.md §3). */}
      {canRegisterRace && (
        <button
          type="button"
          data-testid="race-hub-register"
          onClick={openRaceRegistration}
          className="w-full inline-flex items-center justify-center gap-2"
          style={{ minHeight: 'var(--tap)', marginBottom: 12, borderRadius: 14, border: 'none', background: 'var(--grad-race)', color: 'var(--race-ink)', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
        >
          <Trophy size={16} /> Registar a prova
        </button>
      )}

      {/* ─── 1b. Plano para o dia ───────────────────────────────────────────
          Abaixo do herói e da contagem, antes das fases: na última semana é
          esta a pergunta ("a que ritmo vou sair?"), não o macrociclo. */}
      {showPacingPlan && (
        <RacePacingPlanCard
          plan={pacingPlan}
          race={race}
          onGoToEdit={onGoToEdit}
          onFetchWebInfo={onFetchWebInfo}
          fetchingWebInfo={fetchingWebInfo}
        />
      )}

      {/* ─── 2. Parecer & Análise da Carol sobre a Evolução do Treino ───────── */}
      <div className="rh-carol-box">
        <div className="rh-carol-header">
          <div className="rh-carol-badge">
            <CoachAvatar size={28} />
            <span>Evolução & Prontidão</span>
          </div>
          {/* Ponto 3: a prontidão "média" era âmbar — o âmbar é da prova, e
              esta pílula está dentro do ecrã da prova, onde a confusão era
              maior. Atenção é coral. */}
          <span
            className="rh-carol-readiness-pill text-[11px] font-extrabold px-2.5 py-1 rounded-full border"
            style={{
              // A tinta aqui empilha-se sobre DUAS superfícies translúcidas
              // (o cartão do módulo + a .rh-carol-box), e o fundo efetivo
              // subia o suficiente para o coral do --danger ficar em 4,34:1.
              // Mesma cor, mas misturada com o fundo da app em vez de
              // somada ao que estiver por baixo: 5,90:1, e igual em
              // qualquer sítio onde a pílula apareça.
              background: readiness.level === 'high' ? 'color-mix(in srgb, var(--ok) 16%, var(--bg-app))'
                : readiness.level === 'medium' ? 'color-mix(in srgb, var(--warn) 10%, var(--bg-app))'
                : 'color-mix(in srgb, var(--danger) 12%, var(--bg-app))',
              borderColor: readiness.level === 'high' ? 'var(--tint-ok-bd)'
                : readiness.level === 'medium' ? 'var(--tint-warn-bd)' : 'var(--tint-danger-bd)',
              color: readiness.level === 'high' ? 'var(--ok)'
                : readiness.level === 'medium' ? 'var(--warn)' : 'var(--danger)',
            }}
          >
            Prontidão {readinessTitle} ({readiness.score}%)
          </span>
        </div>

        <p className="rh-carol-body">
          {carolAnalysis.overviewText}
        </p>

        {/* Os alertas de viabilidade eram âmbar dentro do ecrã da prova, onde
            tudo o resto também é âmbar — não se distinguiam do cenário. Coral
            (Warning), o bloco de aviso do sistema. Texto inalterado. */}
        {plan.viability.flags.length > 0 && (
          <Warning
            title="Alertas de Viabilidade"
            icon={<AlertTriangle size={12} />}
            className="mt-4"
          >
            {plan.viability.flags.map((flag) => (
              <span key={flag} className="block">
                {flag === 'ultra_para_iniciante' && '• Prova de Ultra-Trail não recomendada para nível iniciante sem histórico de maratona.'}
                {flag === 'tempo_insuficiente' && `• Faltam ${Math.floor(daysToRace / 7)} semanas — a preparação recomendada para esta distância é de ${totalWeeks} semanas.`}
                {flag === 'volume_insuficiente' && `• O teu volume médio recente (${carolAnalysis.weeklyVolumeKm} km/sem) está abaixo do recomendado para esta distância.`}
              </span>
            ))}
          </Warning>
        )}
      </div>

      {/* ─── 3. Fases do Treino & Classificação da Carol por Fase ──────────── */}
      <div className="rh-phases-section">
        <div className="flex items-center justify-between gap-2 pt-1 pb-1">
          <span className="text-xs font-black uppercase tracking-wider text-[var(--text-3)] flex items-center gap-2">
            <span className="w-1.5 h-3.5 rounded-full bg-[var(--race)] inline-block shrink-0" />
            Macrociclo de Treino ({totalWeeks} Semanas)
          </span>
        </div>

        <div className="space-y-2.5">
          {phases.map((phase) => {
            const isActive = phase.state === 'active';
            const isCompleted = phase.state === 'completed';
            const isSkipped = phase.state === 'skipped';
            const isExpanded = expandedPhaseId === phase.id || (isActive && expandedPhaseId === null);
            const evalData = phase.evaluation;

            return (
              <div
                key={phase.id}
                onClick={() => togglePhase(phase.id)}
                className={`rh-phase-card cursor-pointer ${
                  isActive ? 'active-phase' : isCompleted ? 'completed-phase' : isSkipped ? 'skipped-phase' : ''
                }`}
              >
                <div className="flex flex-col gap-1.5">
                  {/* Linha 1: [Ícone + Título] à esquerda | pílula de estado da
                      fase + chevron à direita. Só esta pílula (curta: "Em
                      Curso"/"Concluída"/"Não Realizada"/"Planeada") partilha a
                      linha com o título — a de avaliação (texto mais longo,
                      ex.: "Ajuste Recomendado · 50%") ia a esta coluna e
                      espremia o nome da fase até truncar (ex.: "Base
                      Aerób..."). */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="rh-phase-num-badge shrink-0">
                        {isCompleted ? <CheckCircle2 size={13} /> : phase.number}
                      </div>
                      <span className="rh-phase-name truncate font-bold text-[var(--text-1)] text-sm">
                        {phase.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`rh-phase-status-pill rh-pill-${phase.state} whitespace-nowrap`}>
                        {phase.state === 'active' ? 'Em Curso' : phase.state === 'completed' ? 'Concluída' : phase.state === 'skipped' ? 'Não Realizada' : 'Planeada'}
                      </span>
                      <div className="text-[var(--text-3)] pl-0.5">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Linha 2: Datas & Semanas, alinhadas sob o título (pl-8). */}
                  <p className="rh-phase-dates text-[11px] font-medium text-[var(--text-3)] pl-8">
                    {phase.weeksLabel} · {formatDateDayMonth(phase.startDate)} a {formatDateDayMonth(phase.endDate)}
                  </p>

                  {/* Linha 3: pílula de avaliação — à largura total do
                      cartão (sem o recuo pl-8 da linha acima), tal como o
                      pill "Prontidão" do cartão Evolução & Prontidão. Com
                      recuo ficava mais estreita e deslocada para a direita,
                      não lendo como a mesma peça visual. */}
                  {/* Sem nota, só a prova que passou sem corrida registada
                      mostra a pílula: "Por registar" (revisão de 2026-09-26). */}
                  {(evalData?.score != null || evalData?.awaitingRecord) && (
                    <span className={`rh-eval-badge rh-eval-${evalData.statusColor} whitespace-nowrap w-full`}>
                      {evalData.score != null ? `${evalData.gradeLabel} · ${evalData.score}%` : evalData.gradeLabel}
                    </span>
                  )}
                </div>

                {/* Conteúdo Expandido da Fase */}
                {isExpanded && (
                  <div className="rh-phase-eval fade-in" onClick={(e) => e.stopPropagation()}>
                    <p className="text-xs text-[var(--text-3)] font-medium">
                      <span className="text-[var(--race)] font-bold">Foco da Fase:</span> {phase.focus}
                    </p>

                    {/* Classificação da Carol */}
                    <div className="p-2.5 rounded-xl bg-black/20 border border-[var(--border-faint)] space-y-1.5 mt-1">
                      <div className="rh-eval-header">
                        <span className="rh-eval-carol-lbl">
                          <Sparkles size={11} /> Avaliação da Carol
                        </span>
                        {evalData?.stars > 0 && (
                          <span className="rh-eval-stars" title={`${evalData.stars} de 5 estrelas`}>
                            {/* Eram os caracteres ★/☆ usados como ícone. */}
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                size={11}
                                className="inline-block"
                                fill={n <= evalData.stars ? 'currentColor' : 'none'}
                                strokeWidth={n <= evalData.stars ? 0 : 2}
                              />
                            ))}
                          </span>
                        )}
                      </div>

                      <p className="rh-eval-summary">
                        {evalData?.summary}
                      </p>

                      {evalData?.metrics?.runsCount > 0 && (
                        <div className="flex items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-[var(--text-3)] flex-wrap">
                          <span>Corridas: <strong className="text-[var(--text-2)]">{evalData.metrics.runsCount}</strong></span>
                          <span>Volume: <strong className="text-[var(--text-2)]">{evalData.metrics.totalKm} km</strong></span>
                          {evalData.metrics.polarizedZ1Z2Pct !== null && (
                            <span>Z1/Z2: <strong className="text-[var(--ok)]">{evalData.metrics.polarizedZ1Z2Pct}%</strong></span>
                          )}
                          {evalData.metrics.avgPace && (
                            <span>Ritmo médio: <strong className="text-[var(--text-2)]">{evalData.metrics.avgPace} /km</strong></span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* O estado da prova decide-se aqui, na 5.ª "fase": ver
                        markCompletedButton acima. */}
                    {phase.id === 'race_recovery' && markCompletedButton && (
                      <div className="mt-2">{markCompletedButton}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {confirmCompletedModal}

      {/* ─── 4. Informação Oficial do Site da Prova & Extração ─────────────── */}
      <div className="rh-web-info-card mb-4">
        <div className="rh-web-header">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[var(--tint-race-bg)] flex items-center justify-center text-[var(--race)]">
              <Globe size={14} />
            </div>
            <span className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">
              Informação do Site Oficial
            </span>
          </div>

          {race?.website?.trim() && onFetchWebInfo && (
            <Button
              variant="module"
              moduleColor="var(--mod-prova)"
              size="sm"
              isLoading={fetchingWebInfo}
              onClick={onFetchWebInfo}
              icon={info ? <RefreshCw size={12} /> : <Sparkles size={12} />}
            >
              {info ? 'Atualizar informação' : 'Obter informação'}
            </Button>
          )}
        </div>

        {race?.website?.trim() ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <LinkIcon size={13} className="text-[var(--race)] shrink-0" />
                <a
                  href={race.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[var(--text-2)] underline hover:text-[var(--race)] transition truncate"
                >
                  {race.website}
                </a>
              </div>
            </div>

            {info ? (
              <RaceWebInfoSections info={info} variant="dark" />
            ) : (
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center space-y-2">
                <p className="text-xs text-[var(--text-3)] font-medium">
                  Clica em <span className="text-[var(--race)] font-bold">"Obter informação"</span> para extrair horários, dorsais, documentos, regulamento e altimetria do site oficial.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col items-center justify-center text-center gap-2.5">
            <p className="text-xs text-[var(--text-3)]">
              Ainda não adicionaste o site oficial desta prova.
            </p>
            {onGoToEdit && (
              <Button variant="light" size="sm" onClick={onGoToEdit}>
                Adicionar Site da Prova
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
