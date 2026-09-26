import React, { useEffect, useMemo, useState } from 'react';
import { Footprints, ChevronRight } from 'lucide-react';
import { useAppStore, selectCoachPendingTopics } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { detectCoachInsights } from '../../utils/biEngine';
import { pendingRaceBalanceCandidate, pendingBlockEndAlert, dismissProactiveAlert } from '../../utils/coachProactive';
import { detectPlanDivergence, detectRaceConflict, raceLabel, wasDivergenceHandled } from '../../utils/planDivergence';
import { buildOrbitRings, hasAnyRecord, mealsForDay } from '../../utils/homeModels';
import { todayISO } from '../../lib/utils';
import { goalFromNotes, knownFacts, isFirstDay, firstRunLine } from '../../utils/firstDay';
import { computeAcceptedWindow, buildPlanDays } from './WeeklyPlanCard';
import SectionLabel from '../shared/SectionLabel';
import { Dialog } from '../shared/Sheet';
import CarolCard from './CarolCard';
import DayPlanCard from './DayPlanCard';
import MealSheet from './MealSheet';
import RaceCard from './RaceCard';
import StatusCard from './StatusCard';
import FirstDayCard from './FirstDayCard';
import CheckinCard from './CheckinCard';
import CoachInsightButton from '../BI/CoachInsightButton';
import CoachInsightModal from '../BI/CoachInsightModal';
import BadgeMoment from '../shared/BadgeMoment';
import useBadgeMoment from '../../utils/useBadgeMoment';
import { goalsDeclinedMarker, isGoalsIntervention } from '@formulas/goalsIntervention.ts';
import { interventionKey, raceConflictKey } from '@formulas/proactiveTriggers.ts';
import { INTERVENTION_OUTCOME } from '@formulas/interventionOutcomes.ts';
import { pendingTopicLines } from '../../utils/carolTopics';
import { eventoDaVida } from '../../utils/carolVida';
import { lisbonParts } from '../../utils/carolWelcome';
import { useCupForHome } from '../../utils/useCup';
import { cupMapCandidate, markCupMapHandled, CUP_MAP_TITLE } from '../../utils/cupMap';

/* O Início (redesenho 2026-09, ponto 5 — mock "Início"): o cartão da
   Carol, "O que faço hoje" (plano do dia), "Como estou" (a órbita, só
   leitura) e "Para onde vou" (a prova com o trilho). Gap de 8px entre
   cartões. No primeiro dia (sem registo, sem prova e sem plano) a Carol abre a
   conversa e o resto do ecrã convida a registar. Registar água vive no FAB.

   A ordem mudou a 2026-09-15: "Como estou" subiu para terceiro e a prova
   passou para último. O ecrã lê-se de perto para longe — quem me fala,
   o que faço hoje, como estou hoje, para onde vou —, e a prova fecha-o
   porque é o horizonte, não a tarefa. */

function firstNameOf(name) {
  if (!name || typeof name !== 'string') return null;
  const t = name.trim();
  return t ? t.split(/\s+/)[0] : null;
}

export default function Home() {
  const { showToast } = useToast();
  const {
    profile, meals, waterLogs, raceEvents, coachPlans, coachPlanItems, runs, gymSessions, bodyAssessments, insightStates, shoes,
    setActiveTab, setPlanItemPrefill, setEditingRaceId, setProfile, setCoachIntent, setOpenCreationMode,
    dailySummary, logImpression, logImpressionDismissed, impressionDismissed,
  } = useAppStore();
  const pendingTopics = useAppStore(selectCoachPendingTopics);
  const coachGoalProposals = useAppStore((s) => s.coachGoalProposals);
  const impressionShown = useAppStore((s) => s.impressionShown);
  // A competição por jornadas, só de quem está inscrito (Fase 2). Sem
  // inscrição é null e não lê nada — o Início fica como era.
  const cupView = useCupForHome();

  const [showInsights, setShowInsights] = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [mealDay, setMealDay] = useState(null);
  // Dispensar o aviso do balanço (ou do fim de bloco) grava a marca em
  // localStorage, que não é estado do React — este contador faz os useMemo
  // voltarem a ler.
  const [alertDismissals, setAlertDismissals] = useState(0);
  /* O momento do badge (fase 4 da reforma da gamificação) — a regra de
     quando aparece e em que escala vive no hook. É a única cerimónia de ecrã
     inteiro do Início desde que os medalhões saíram (fase C): só espera
     pelas boas-vindas (ação P.11, a cancela `welcomeGate`). Sem a migração
     `user_badges` aplicada não há `pending` nenhum e isto não mostra nada. */
  const badgeMoment = useBadgeMoment();
  const badgeVisivel = badgeMoment.grande || badgeMoment.medio;

  const today = todayISO();

  /* O que o Início mostrou (ação 2.4): a Carol lê-o para não repetir como
     novidade o que o atleta já viu. O cartão dela conta quando existe para
     hoje; os avisos e os insights contam quando a janela deles abre (ver
     abaixo) — antes disso são só um número no botão. */
  const cardDate = dailySummary?.date === today ? dailySummary.date : null;
  useEffect(() => {
    if (cardDate) logImpression({ kind: 'daily_card', key: cardDate });
  }, [cardDate, logImpression]);

  const hasRecords = hasAnyRecord({ runs, meals, gymSessions, bodyAssessments });
  const hasUpcomingRace = (raceEvents || []).some((e) => e.status !== 'concluida' && e.date >= today);
  // Com dados ainda a chegar depois do prazo do arranque, vazio não é
  // "primeiro dia" (dataPending, ver loadInitialData no store).
  const dataPending = useAppStore((s) => s.dataPending);
  // Com plano aceite ou proposto também já não é o primeiro dia (pedido
  // 2026-09-26): o cartão do primeiro dia negava o plano que a Carol tinha
  // acabado de escrever, e escondia o "O que faço hoje" (utils/firstDay.js).
  const acceptedWindow = useMemo(() => computeAcceptedWindow(coachPlans, coachPlanItems, today), [coachPlans, coachPlanItems, today]);
  const firstDay = isFirstDay({ dataPending, hasRecords, hasUpcomingRace, planWindow: acceptedWindow, plans: coachPlans });

  /* No primeiro dia a Carol lembra-se do arranque (utils/firstDay.js): o
     objetivo e o que o atleta contou vêm da Memória do Coach, que o
     arranque acabou de escrever. Numa sessão nova a memória não vem com os
     dados iniciais — lê-se aqui, uma vez, só no primeiro dia. */
  const coachNotes = useAppStore((s) => s.coachNotes);
  const reloadCoachNotes = useAppStore((s) => s.reloadCoachNotes);
  const notesEmpty = !(coachNotes || []).length;
  // Vazio antes de acabar a leitura é "ainda não chegou", não "sem
  // objetivo": o cartão só pede a prova depois de a ler (utils/firstDay.js,
  // revisão de 2026-09-26).
  const [notesRead, setNotesRead] = useState(false);
  useEffect(() => {
    if (!firstDay || !notesEmpty) return undefined;
    let vivo = true;
    Promise.resolve(reloadCoachNotes?.()).catch(() => null).then(() => { if (vivo) setNotesRead(true); });
    return () => { vivo = false; };
  }, [firstDay, notesEmpty, reloadCoachNotes]);
  const notesLoaded = !notesEmpty || notesRead;
  const firstDayGoal = firstDay ? goalFromNotes(coachNotes) : null;
  // Quem foi operado ontem não ouve "Já correste?" (pedido 2026-09-26):
  // o que ela sabe da vida dele passa à frente (utils/carolVida.js).
  const vidaHoje = firstDay ? eventoDaVida(coachNotes, lisbonParts().date) : null;
  // O popup dos assuntos lê o check-in e o plano de hoje (utils/carolTopics.js).
  const dailyCheckins = useAppStore((s) => s.dailyCheckins);
  const firstDayFacts = useMemo(() => (firstDay ? knownFacts({ profile, coachNotes }) : []), [firstDay, profile, coachNotes]);

  const rings = useMemo(() => buildOrbitRings({ meals, waterLogs, profile }), [meals, waterLogs, profile]);

  /* Os itens do plano aceite para HOJE — a mesma janela e o mesmo
     construtor que "O que faço hoje" usa (computeAcceptedWindow +
     buildPlanDays), só que para um dia. Servem a linha das refeições
     sugeridas, que saiu do cartão do plano para o "Como estou": é lá que
     estão os anéis da nutrição. A persiana é a de sempre (`mealDay`). */
  const todayPlanItems = useMemo(() => {
    const window = computeAcceptedWindow(coachPlans, coachPlanItems, today);
    if (!window) return [];
    const acceptedIds = new Set((coachPlans || []).filter((p) => p.status === 'aceite').map((p) => p.id));
    return buildPlanDays((coachPlanItems || []).filter((i) => acceptedIds.has(i.plan_id)), today, 1)[0]?.items || [];
  }, [coachPlans, coachPlanItems, today]);
  const todayMeals = useMemo(() => mealsForDay(todayPlanItems), [todayPlanItems]);

  const homeInsights = useMemo(() => {
    const all = detectCoachInsights({ runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile);
    return all.filter((i) => insightStates[i.id] !== 'understood' && i.module === 'coach');
  }, [runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes, profile, insightStates]);

  const interventionPending = profile?.coach_intervention_status === 'needed' || profile?.coach_intervention_status === 'in_progress';

  /* Duas provas principais no mesmo bloco (specs/plano-vinculado-a-prova.md
     §2.4): o taper de cada uma são 10-21 dias de polimento, e treinar para
     uma é sabotar a outra. Não há plano correto enquanto as duas forem
     principais — por isso isto sai pelo canal da intervenção e não pelo das
     divergências: pesa como um assunto por resolver, não tem botão de
     dispensar, e só se cala quando o atleta decidir (a decisão grava-se na
     prova, conflict_acknowledged_at, e vale em qualquer dispositivo). */
  const raceConflict = useMemo(
    () => detectRaceConflict({ coachPlans, raceEvents, today }),
    [coachPlans, raceEvents, today],
  );

  /* O balanço da prova (specs/gamificacao-provas.md §3): no dia a seguir, a
     Carol chama por ele a partir do botão flutuante enquanto o chat não for
     aberto. Só quando não há assuntos por resolver — uma intervenção pesa
     mais do que um balanço. Guarda-se o candidato completo (não só a prova)
     porque "Falar com a Carol" precisa dele para pedir o balanço a sério —
     ver o coachIntent 'race_balance' mais abaixo. */
  const raceBalance = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    // impressionDismissed: o que foi dispensado noutro dispositivo (ação 5.1).
    const candidate = pendingRaceBalanceCandidate({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile, impressionDismissed });
    if (!candidate) return null;
    const race = (raceEvents || []).find((r) => r?.id === candidate.raceId) || null;
    return race ? { race, candidate } : null;
  }, [pendingTopics, raceConflict, runs, meals, gymSessions, bodyAssessments, raceEvents, profile, impressionDismissed, alertDismissals]);

  /* O bloco está a acabar (ação P.11): o bloco de treino sem prova acaba e
     não há outro a seguir. O candidato é o do chat e da notificação
     (block_end:<plano>), para o toque e o botão não pedirem conversas
     diferentes; conta como uma boa notícia a preparar, abaixo do balanço. */
  const blockEnd = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    return pendingBlockEndAlert({ coachPlans, coachPlanItems, profile, impressionDismissed });
  }, [pendingTopics, raceConflict, coachPlans, coachPlanItems, profile, impressionDismissed, alertDismissals]);

  /* O plano precisa de um ajuste (specs/plano-de-prova.md, "O plano tem de
     saber da prova"): a app deteta sozinha quando a realidade se afastou do
     plano — prova sem item de prova, treino no dia da prova, trabalho forte
     na véspera, sessões falhadas — e a Carol chama por isso. A assinatura
     impede que ela chame pela mesma coisa outra vez enquanto o plano não
     mudar. Prioridade: uma intervenção pesa mais, e o ajuste pesa mais do
     que o balanço da prova (que é uma boa notícia, não uma urgência). */
  const divergence = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    const found = detectPlanDivergence({ coachPlans, coachPlanItems, raceEvents, runs, gymSessions, today });
    if (!found.reasons.length || wasDivergenceHandled(profile?.id, found.signature)) return null;
    return found;
  }, [pendingTopics, raceConflict, coachPlans, coachPlanItems, raceEvents, runs, gymSessions, today, profile?.id]);

  /* O mapa da época (specs/trofeu.md §5, Fase 2; utils/cupMap.js): ao
     inscrever, e quando sai o calendário com jornadas por decidir, a Carol
     quer ver com ele o papel de cada jornada ao lado das provas principais.
     Só para inscritos (cupView é null para os outros). Com plano aceite, o
     ajuste às jornadas propõe-se nessa mesma conversa, numa só — por isso o
     `prova_sem_item` das jornadas já não é divergência (planDivergence.js).
     O que sobra na divergência (um treino no dia de uma prova ou trabalho
     forte na véspera — também de uma principal —, o plano sem a prova ou
     encurtado, sessões falhadas) fica à FRENTE do mapa: o turno do mapa não
     leva esses motivos, e com o mapa à frente ficavam escondidos enquanto
     ele estivesse por tratar (revisão da Fase 2). */
  const cupMap = useMemo(() => {
    if (pendingTopics > 0 || raceConflict) return null;
    return cupMapCandidate({ view: cupView, userId: profile?.id, impressionShown, impressionDismissed, today });
  }, [pendingTopics, raceConflict, cupView, profile?.id, impressionShown, impressionDismissed, today, alertDismissals]);

  const openCoach = () => {
    if (interventionPending) {
      setCoachIntent({ kind: 'proactive_intervention', reason: profile?.coach_intervention_reason || null });
    } else if (raceConflict) {
      setCoachIntent({
        kind: 'race_conflict',
        races: raceConflict.races.map((r) => ({ id: r.id, name: r.name, date: r.date })),
        target: raceConflict.target ? { id: raceConflict.target.id, name: raceConflict.target.name, date: raceConflict.target.date } : null,
      });
    } else if (divergence) {
      setCoachIntent({ kind: 'adapt_plan', divergence: divergence.reasons.map((r) => r.text), signature: divergence.signature });
    } else if (cupMap) {
      setCoachIntent({ kind: 'cup_map', signature: cupMap.signature, first: cupMap.first });
    }
    setActiveTab('coach');
  };

  /* Os avisos da Carol vivem no botão flutuante (pedido 2026-09-13): no
     cabeçalho do cartão dela confundiam-se com o resumo do dia. Um de cada
     vez, pela mesma prioridade de sempre — assuntos por resolver, depois o
     conflito de principais, o ajuste do plano, o mapa da época (só inscritos
     numa competição), o balanço da prova e, por fim, o fim do bloco —,
     cada um com o seu "Falar com a Carol" na janela dos insights.

     `key` é a chave do momento no servidor (P.10), quando o aviso tem um:
     abrir a janela regista-a como vista, e o coach-proactive-tick não
     notifica hoje o que o atleta acabou de ler aqui. */
  const carolAlerts = [];
  if (pendingTopics > 0) {
    carolAlerts.push({
      id: 'assuntos',
      // Só o assunto "needed" tem momento no servidor; um já em conversa não.
      key: profile?.coach_intervention_status === 'needed' ? interventionKey(profile?.coach_intervention_reason) : null,
      severity: 'warning',
      // Na voz dela e a dizer o assunto (pedido 2026-09-23): "Tens 1 assunto
      // a resolver com ela" não dizia qual, e o popup repetia "Carol" 4 vezes.
      title: 'Preciso de falar contigo',
      message: pendingTopicLines({ profile, coachPlans, coachGoalProposals, coachPlanItems, raceEvents, dailyCheckins, coachNotes }).join(' ')
        || (pendingTopics === 1 ? 'Tenho um assunto para ver contigo.' : `Tenho ${pendingTopics} assuntos para ver contigo.`),
      onTalk: openCoach,
      onDismiss: interventionPending ? () => setShowDismiss(true) : null,
    });
  } else if (raceConflict) {
    const racesConflito = raceConflict.races.map((r) => raceLabel(r));
    const nomes = racesConflito.join(', ');
    // "marcada" tinha género — e nem sempre concordava com o nome da prova
    // (masculino, "o Trail...") nem com o número (duas provas A no mesmo
    // bloco) (revisão de 2026-09-26; backlog, Home.jsx:227). "principal" não
    // tem género, só número.
    const plural = racesConflito.length > 1;
    carolAlerts.push({
      id: 'conflito-provas',
      key: raceConflict.plan?.id ? raceConflictKey(raceConflict.plan.id, raceConflict.races.map((r) => r.id)) : null,
      severity: 'warning',
      title: 'Preciso de falar contigo',
      // Sem onDismiss, de propósito: enquanto houver duas principais no mesmo
      // bloco não há plano certo, e a decisão é do atleta — mas tem de ser
      // tomada. A Carol grava-a e não volta a perguntar.
      message: raceConflict.target
        ? `${nomes} ${plural ? 'estão como principais' : 'está como principal'} a meio do plano para ${raceLabel(raceConflict.target)}.`
        : `${nomes} ${plural ? 'estão como principais' : 'está como principal'} a meio do plano atual.`,
      onTalk: openCoach,
    });
  } else if (divergence) {
    carolAlerts.push({
      id: 'plano',
      severity: 'warning',
      title: 'O plano precisa de um ajuste',
      message: divergence.reasons.map((r) => r.text).join(' '),
      onTalk: openCoach,
    });
  } else if (cupMap) {
    carolAlerts.push({
      id: 'mapa-epoca',
      key: cupMap.signature,
      severity: 'info',
      title: CUP_MAP_TITLE,
      message: cupMap.message,
      // O Coach pede o turno do mapa (is_plan_checkin + cup_map) e, quando o
      // servidor confirma que foi esse o turno (cup_map_shown), marca a
      // assinatura como tratada.
      onTalk: () => {
        setCoachIntent({ kind: 'cup_map', signature: cupMap.signature, first: cupMap.first });
        setActiveTab('coach');
      },
      // Dispensar cala esta assinatura aqui e, pela impressão, nos outros
      // dispositivos; volta só se o calendário mudar com jornadas por decidir.
      onDismiss: () => {
        markCupMapHandled(profile?.id, cupMap.signature);
        setAlertDismissals((n) => n + 1);
        logImpressionDismissed({ kind: 'alert', key: cupMap.signature, title: CUP_MAP_TITLE });
      },
    });
  } else if (raceBalance) {
    carolAlerts.push({
      id: 'balanco',
      key: raceBalance.candidate.key,
      severity: 'info',
      title: 'O balanço da prova',
      // "Correste a ${nome}" tinha preposição de género — uma prova
      // masculina ("o Trail...") pedia "correste o" (revisão de 2026-09-26;
      // backlog, Home.jsx:255).
      message: `${raceBalance.race.name || 'A prova'}: quero fazer o balanço contigo.`,
      // Bug 2026-09-14: só mudar de separador e esperar que o Coach apanhe o
      // momento sozinho falhava em silêncio sempre que a Carol tivesse
      // falado há menos de 6h por qualquer outro motivo (regra normal contra
      // empilhar mensagens proativas) — o atleta carregava no botão e "não
      // acontecia nada". Um pedido explícito dele tem de furar essa regra,
      // por isso vai com o candidato e o Coach pede-o com `proactive_force`.
      onTalk: () => {
        setCoachIntent({ kind: 'race_balance', candidate: raceBalance.candidate });
        setActiveTab('coach');
      },
      // Uma saída se a conversa já aconteceu e o aviso não soube (outro
      // dispositivo, resposta que não chegou ao ecrã): uma marca PRÓPRIA de
      // "dispensado" — não a mesma do balanço dito, que faria o hub e o chat
      // pensarem que a conversa já tinha acontecido e deixarem de a propor.
      onDismiss: () => {
        dismissProactiveAlert(profile?.id, raceBalance.candidate);
        setAlertDismissals((n) => n + 1);
        // Duas chaves na dispensa (ação 5.1): 'balanco', que o chat já lê,
        // e a do candidato (race_after:<raceId>:<runId>), que é a que serve
        // para o outro dispositivo saber que este balanço foi dispensado.
        logImpressionDismissed({ kind: 'alert', key: 'balanco', title: 'O balanço da prova' });
        logImpressionDismissed({ kind: 'alert', key: raceBalance.candidate.key, title: 'O balanço da prova' });
      },
    });
  } else if (blockEnd) {
    carolAlerts.push({
      id: 'fim-bloco',
      key: blockEnd.candidate.key,
      severity: 'info',
      title: 'O bloco está a acabar',
      message: `O teu bloco de treino acaba ${blockEnd.when} e não há outro a seguir. Quero preparar o próximo contigo.`,
      // O mesmo contrato do balanço: um pedido explícito fura as quiet hours
      // (`proactive_force`), senão o botão ficava sem resposta sempre que ela
      // tivesse falado há menos de 6 h.
      onTalk: () => {
        setCoachIntent({ kind: 'proactive_moment', candidate: blockEnd.candidate });
        setActiveTab('coach');
      },
      onDismiss: () => {
        dismissProactiveAlert(profile?.id, blockEnd.candidate);
        setAlertDismissals((n) => n + 1);
        logImpressionDismissed({ kind: 'alert', key: blockEnd.candidate.key, title: 'O bloco está a acabar' });
      },
    });
  }

  /* Abrir a janela do botão flutuante é ver os avisos e os insights. */
  const openInsights = () => {
    for (const a of carolAlerts) {
      logImpression({ kind: 'alert', key: a.id, title: a.title });
      // A chave do momento, para o tick não o notificar hoje (P.10).
      if (a.key) logImpression({ kind: 'alert', key: a.key, title: a.title });
    }
    for (const i of homeInsights) logImpression({ kind: 'insights', key: i.id, title: i.title });
    setShowInsights(true);
  };

  // "Registar sessão" não marca logo — deixa isso ao ecrã de registo, que
  // grava o completePlanItem só depois de a corrida/sessão real estar
  // gravada (specs/plano-de-treino.md §5.2).
  // setActiveTab devolve false quando um navGuard recusa (formulário com
  // alterações por gravar). Nesse caso não se abre nada — o mesmo contrato
  // que openRaceRun (store) e o "+" do Layout já cumprem; abrir o registo
  // por cima de uma navegação que não aconteceu deixava um formulário sujo
  // sem aviso por baixo de outro (achado do grafo, 2026-09-17).
  const handleCompleteItem = (item) => {
    setPlanItemPrefill(item);
    const isRun = item.kind === 'corrida';
    if (!setActiveTab(isRun ? 'corrida' : 'ginasio')) { setPlanItemPrefill(null); return; }
    setOpenCreationMode(isRun ? 'run' : 'workout');
  };

  const createRace = () => setOpenCreationMode('race');
  // Registar a prova é abrir o registo de corrida em modo prova — o store
  // trata do prefill e do separador (specs/prova-concluida.md §3).
  const registerRace = (raceId) => useAppStore.getState().openRaceRun(raceId);
  const registerMeal = () => { if (setActiveTab('nutricao')) setOpenCreationMode('meal'); };
  const registerRun = () => { if (setActiveTab('corrida')) setOpenCreationMode('run'); };

  // Saída manual do aviso da Carol (bug-016): se a conversa já resolveu o
  // assunto mas o aviso ficou preso, o atleta não fica refém disso.
  const dismissIntervention = async () => {
    if (!profile?.id) return;
    setDismissing(true);
    try {
      const { supabase } = await import('../../lib/supabase');
      // Dispensar é um desfecho (5.5): fica em coach_interventions, e a Carol
      // calibra por ele. Só no update — o trigger consome-o.
      const { error } = await supabase.from('profiles').update({ coach_intervention_status: 'resolved', coach_intervention_reason: null, coach_intervention_outcome: INTERVENTION_OUTCOME.DISPENSADO }).eq('id', profile.id);
      if (error) throw error;
      // Dispensar um convite para objetivos é dizer "agora não": fica
      // registado para a Carol não voltar a chamar na próxima pesagem
      // (espera de 14 dias, ver goalsDeclinedMarker).
      if (isGoalsIntervention(profile.coach_intervention_reason)) {
        const { error: markErr } = await supabase.from('coach_goal_proposals').insert(goalsDeclinedMarker(profile.id));
        if (markErr) console.warn('Falha a registar a recusa de objetivos:', markErr);
      }
      setProfile({ ...profile, coach_intervention_status: 'resolved', coach_intervention_reason: null });
      logImpressionDismissed({ kind: 'alert', key: 'assuntos', title: 'A Carol precisa de falar contigo' });
      setShowDismiss(false);
      showToast('Aviso dispensado.', 'success');
    } catch (err) {
      console.error('Erro ao dispensar intervenção:', err);
      showToast('Não foi possível dispensar o aviso. Tenta outra vez.', 'error');
    } finally {
      setDismissing(false);
    }
  };

  if (firstDay) {
    return (
      <div className="flex flex-col gap-3 fade-in pb-2">
        <FirstDayCard
          firstName={firstNameOf(profile?.display_name)}
          goal={firstDayGoal}
          facts={firstDayFacts}
          vida={vidaHoje}
          notesLoaded={notesLoaded}
          onTalk={() => setActiveTab('coach')}
          onCreateRace={createRace}
          onRegisterRun={registerRun}
          onRegisterMeal={registerMeal}
        />
        <SectionLabel style={{ marginTop: 4 }}>Entretanto, começa a registar</SectionLabel>
        <StatusCard empty onRegisterMeal={registerMeal} />
        {/* Quando o pedido dela já é a corrida, a linha repetia o botão. */}
        {firstDayGoal !== 'ritmo' && firstDayGoal !== 'regresso' && !vidaHoje && (
        <button type="button" onClick={registerRun} className="flex items-center gap-2.5 w-full text-left rounded-[18px]" style={{ padding: '14px 16px', minHeight: 44, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border-glass)' }}>
          <Footprints size={16} style={{ color: 'var(--run)' }} className="shrink-0" />
          {/* Sem "eu ajusto o plano" (no primeiro dia não há plano) e sem
              "hoje" de madrugada — utils/firstDay.js, firstRunLine (2026-09-26). */}
          <span className="flex-1 text-[12.5px]" style={{ color: 'var(--text-3)' }}>{firstRunLine()}</span>
          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
        </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 fade-in pb-2">
      <CarolCard onOpenRace={setEditingRaceId} onOpenCoach={openCoach} />

      <SectionLabel>O que faço hoje</SectionLabel>
      <DayPlanCard plans={coachPlans} planItems={coachPlanItems} raceEvents={raceEvents} onComplete={handleCompleteItem} onNav={setActiveTab} onOpenRace={setEditingRaceId} onOpenPlano={() => setOpenCreationMode('plano')} />

      <SectionLabel>Como estou</SectionLabel>
      <CheckinCard />
      <StatusCard rings={rings} mealsModel={todayMeals} onOpenMeals={() => setMealDay({ dateISO: today, items: todayPlanItems })} />

      <SectionLabel>Para onde vou</SectionLabel>
      <RaceCard raceEvents={raceEvents} runs={runs} profile={profile} onOpenRace={setEditingRaceId} onCreateRace={createRace} onRegisterRace={registerRace} onOpenAllRaces={() => setActiveTab('provas')} />

      {mealDay && <MealSheet day={mealDay} onClose={() => setMealDay(null)} />}

      {showDismiss && (
        <Dialog
          title="Dispensar este aviso?"
          onClose={() => setShowDismiss(false)}
          actions={(
            <>
              <button type="button" disabled={dismissing} onClick={dismissIntervention} className="flex-1 min-h-[44px] rounded-[11px] text-[13px] font-extrabold disabled:opacity-45" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)', color: 'var(--coach)' }}>
                {dismissing ? 'A dispensar…' : 'Dispensar'}
              </button>
              <button type="button" disabled={dismissing} onClick={() => setShowDismiss(false)} className="flex-1 min-h-[44px] rounded-[11px] text-[13px] font-bold" style={{ background: 'rgba(255,255,255,.05)', border: '1px solid var(--border-glass-strong)', color: 'var(--text-3)' }}>
                Cancelar
              </button>
            </>
          )}
        >
          <p className="text-[12.5px] leading-[1.55]" style={{ color: 'var(--text-3)' }}>
            O aviso deixa de aparecer no Início. Podes voltar a falar comigo no chat sempre que quiseres.
          </p>
        </Dialog>
      )}

      <CoachInsightButton insights={homeInsights} alerts={carolAlerts} onClick={openInsights} />
      {showInsights && <CoachInsightModal insights={homeInsights} alerts={carolAlerts} onClose={() => setShowInsights(false)} />}
      {badgeVisivel && (badgeMoment.grande ? (
        <BadgeMoment
          /* A fila: cada grande é um momento novo, por isso remonta (a
             coreografia só toca ao montar). */
          key={badgeMoment.grande.award.id}
          escala="grande"
          badge={badgeMoment.grande.badge}
          titulo={badgeMoment.grande.award.title || badgeMoment.grande.badge?.name}
          linha={badgeMoment.grande.award.line}
          restantes={badgeMoment.filaRestante}
          onClose={badgeMoment.fecharGrande}
        />
      ) : (
        <BadgeMoment
          escala="medio"
          badge={badgeMoment.medio.badge}
          titulo={badgeMoment.medio.titulo}
          linha={badgeMoment.medio.linha}
          onClose={badgeMoment.fecharMedio}
        />
      ))}
    </div>
  );
}
