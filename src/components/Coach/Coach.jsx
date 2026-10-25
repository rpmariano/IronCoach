import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, selectCoachHasPendingTopic } from '../../store';
import { invokeEdgeFunctionWithTimeout, supabase } from '../../lib/supabase';
import { Send, Loader2, Sparkles, RotateCcw, ImagePlus, X } from 'lucide-react';
import { compressImage } from '../../lib/image';
import { MAX_CHAT_PHOTOS, addChatPhotos, photoMarker, toPayloadImages } from '../../utils/chatPhotos';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import '../Home/WeeklyPlanCard.css';
import { useToast } from '../shared/ToastProvider';
import { detectCoachInsights } from '../../utils/biEngine';
import { computeBadges } from '../../utils/badges';
import CoachText from '../shared/CoachText';
import PlanProposalBottomSheet from './PlanProposalBottomSheet';
import CoachAvatar from './CoachAvatar';
import { messageMood } from '@formulas/carolMood.ts';
import RecordConfirmation from '../shared/RecordConfirmation';
import { planStartMoment } from '../../utils/planStart';
import { todayISO } from '../../lib/utils';
import { insightStateForCarol } from '../../utils/insightState';
import { splitIntoBubbles, typingDelayFor, prefersReducedMotion, BUBBLE_GAP_MS } from '../../utils/coachBubbles';
import { listProactiveTriggers, wasProactiveSent, markProactiveSent, writeRaceBalanceCache } from '../../utils/coachProactive';
import { markDivergenceHandled, MAX_DIVERGENCE_TEXTS } from '../../utils/planDivergence';
import { markCupMapHandled } from '../../utils/cupMap';
import { nextPlanContinuation, rebuildPlanChain, findPromisedContinuation, PLAN_PART_DAYS } from '../../utils/planContinuation';
import { usePersistedFormDraft, restorePersistedFormDraft, clearPersistedFormDraft } from '../../utils/formDraftPersistence';
import { hasAnyRecord } from '../../utils/homeModels';
import { isOnboardingDoneLocally } from '../../utils/onboarding';

// Chave única — o chat da Carol é uma conversa só, não um registo por id
// como os formulários (RunAgenda, MealRegistration, ...), por isso não há
// aqui um sufixo de id a acrescentar.
const COACH_CHAT_DRAFT_KEY = 'ironcoach:carol-chat-rascunho';

// Quando invokeEdgeFunctionWithTimeout falha (rede ou o timeout de 45s do
// cliente), não sabemos se o pedido chegou ou não a ser processado no
// servidor — um incidente investigado em 2026-08-20 mostrou que SIM: o
// coach-chat pode legitimamente demorar mais de 45s quando encadeia várias
// rondas de function-calling (desde 2026-09-24, até 125 s por pedido — ver
// CHAT_BUDGET_MS no coach-chat), só a resposta é que não chegava a tempo ao
// cliente. Mostrar logo um erro
// definitivo e destravar o campo levava a reformular a mesma pergunta
// enquanto o pedido original ainda estava em curso, gerando duas respostas
// (e duas propostas de plano) concorrentes para a mesma pergunta. Por isso
// aguardamos de forma assíncrona em vez de desistir logo — ver
// handleAsyncFallback abaixo.
const POLL_INTERVAL_MS = 4000;

// Quanto tempo a cara do cabeçalho guarda a emoção da última mensagem dela.
const HEADER_MOOD_TTL_MS = 6 * 60 * 60 * 1000;

/** A hora de uma mensagem: a gravada, ou a do id local (Date.now()). */
function messageTime(msg) {
  if (msg.created_at) {
    const t = new Date(msg.created_at).getTime();
    if (!isNaN(t)) return t;
  }
  if (msg.id && !isNaN(msg.id)) return parseInt(msg.id, 10);
  return null;
}

/** A emoção de uma mensagem da Carol; o aviso de demora é ela a pensar. */
function carolMoodOf(msg) {
  if (typeof msg.id === 'string' && msg.id.startsWith('waiting-')) return 'thinking';
  return messageMood(msg);
}
const POLL_MAX_MS = 180000; // cobre o pior caso de latência do coach-chat
const OFFLINE_POLLS_MAX = 3; // voltas seguidas sem rede até desistir (ver waitForAsyncReply)

// Mesma extração que firstNameOf em coach-chat/index.ts — duplicada porque
// vive noutro runtime (cliente vs. Edge Function), não porque a lógica seja
// diferente. Usada para tratar o atleta pelo nome no aviso de demora abaixo.
function getFirstName(displayName) {
  if (!displayName || typeof displayName !== 'string') return null;
  const trimmed = displayName.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : null;
}

// As frases fixas de falha, na voz dela (ação P.12) — exportadas para o
// teste de voz (src/utils/carolVoice.test.js) as verificar sem ter de
// montar o componente inteiro e simular cada caminho de erro.
export const COACH_ASYNC_FALLBACK_TEXT = 'Não consegui responder. Tenta outra vez.';
// Sem "responder" (nem sempre houve pergunta — um "Falar com a Carol" não é
// uma) e sem "ligação ao servidor" (revisão de 2026-09-26).
export const COACH_IMMEDIATE_FAILURE_TEXT = 'A rede falhou e não te consegui dizer nada. Tenta outra vez daqui a bocado.';
export const COACH_EMPTY_REPLY_TEXT = 'Não consegui responder agora. Tenta outra vez.';

// A conversa que ela pediu a partir de um aviso do Início (assunto por
// resolver, conflito de provas, ajuste do plano, balanço, fim de bloco): o
// aviso fica lá até a conversa acontecer, por isso é aí que se volta a
// tentar — "Tenta outra vez" não dizia onde (revisão de 2026-09-26).
export const COACH_INITIATED_FALLBACK_TEXT = 'Não consegui acabar o que te queria dizer. Volta a tocar em Falar com a Carol, no Início.';
export const COACH_INITIATED_NETWORK_TEXT = 'A rede falhou. Volta a tocar em Falar com a Carol, no Início.';
const HOME_ALERT_FAILURE = { timeout: COACH_INITIATED_FALLBACK_TEXT, network: COACH_INITIATED_NETWORK_TEXT };
// As outras conversas que ela abre (insights, cartões e registos, o fim do
// arranque, o "Adaptar Plano"): não houve pergunta, por isso nada de "Não
// consegui responder", e não há um aviso no Início a que voltar — os
// insights, por exemplo, saem de lá como entendidos ao abrir a conversa
// (revisão de 2026-09-26). Na rede fica o genérico, que já não presume
// pergunta.
export const COACH_INITIATED_LATER_TEXT = 'Não consegui acabar o que te queria dizer. Tenta outra vez daqui a bocado.';
const COACH_INITIATED_FAILURE = { timeout: COACH_INITIATED_LATER_TEXT };

// Variantes do aviso de demora (handleAsyncFallback), escolhida ao acaso a
// cada aviso. Na voz dela (CAROL.md): sem emoji, sem exclamação, e nunca a
// pedir desculpa pelo sistema. Nenhuma sugere um movimento — saíam à sorte
// "alonga os gémeos" com uma dor no gémeo em aberto, ou uma prancha à 01:30
// — nem fala de servidor, ligação ou dados, nem promete que a resposta "vem
// a caminho" (revisão de 2026-09-26). Sem nome não há vocativo: "atleta,
// isto está a demorar" lia-se como um formulário.
const WAITING_MESSAGES = [
  (n) => `${n ? `${n}, esta` : 'Esta'} resposta está a levar-me mais tempo do que contava. Não precisas de mandar nada outra vez: respondo-te aqui quando acabar.`,
  (n) => `${n ? `${n}, estou` : 'Estou'} a pensar nisto, preciso de mais tempo. Respondo-te aqui.`,
];

function pickWaitingMessage(firstName) {
  const variant = WAITING_MESSAGES[Math.floor(Math.random() * WAITING_MESSAGES.length)];
  return variant(firstName);
}

// O aviso enquanto o servidor ainda responde à mensagem anterior (409 `busy`):
// a frase do servidor manda "outra vez daqui a um instante", mas é a app que
// espera e volta a mandar — por isso aqui não se pede nada ao atleta.
export const busyWaitingMessage = (n) =>
  `${n ? `${n}, ainda` : 'Ainda'} estou a acabar de te responder à mensagem anterior. Respondo a esta logo a seguir.`;

export default function Coach() {
  const {
    coachMessages,
    addCoachMessage,
    removeCoachMessage,
    coachLoading,
    setCoachLoading,
    coachSuggestions,
    setCoachSuggestions,
    clearCoachChat,
    profile,
    setProfile,
    session,
    reloadCoachPlans,
    coachPlans,
    coachPlanItems,
    respondToPlan,
    coachGoalProposals,
    reloadCoachGoalProposals,
    respondToGoalProposal,
    coachIntent,
    setCoachIntent,
    runs, gymSessions, meals, bodyAssessments, raceEvents, insightStates, insightSnoozes, shoes, dailyCheckins
  } = useAppStore();
  const { showToast } = useToast();
  // Liga o halo do avatar (ponto 9, animação 7).
  const hasPendingTopic = useAppStore(selectCoachHasPendingTopic);

  const pendingPlans = (coachPlans || []).filter(p => p.status === 'proposto');
  const pendingGoalProposals = coachGoalProposals || [];

  const [activeProposalSheetPlan, setActiveProposalSheetPlan] = useState(null);
  /* Plano longo em partes: a resposta traz `plan_continuation: { from, to,
     part, of }` (a Carol avisou e propôs a 1.ª semana). Só pode haver uma
     proposta pendente — o servidor recusa a anterior quando grava outra —, por
     isso a continuação fica pendente (`armed: false`) e só sai DEPOIS de o
     atleta aceitar a parte que está na folha (handleRespond a arma). Recusar
     pára a cadeia. Armada, com o chat livre o cliente manda sozinho o pedido da
     parte seguinte, sem texto do atleta; cada resposta pode trazer a seguinte.
     Se o atleta escrever entretanto (coachLoading), espera a vez — nunca se
     perde a mensagem dele. */
  const [pendingContinuation, setPendingContinuation] = useState(null);
  const continuationRunsRef = useRef(0);
  const lastProposedPlanIdRef = useRef(null);
  /* A cadeia das partes de um plano longo (tudo-ou-nada): { of, parts: [{ planId,
     part }] } com as propostas já recebidas. Nada se aplica até a última ser
     aceite; recusar uma recusa todas. Vive aqui (recarregar a página deixa as
     propostas pendentes como sempre, sem aplicar). Estado + ref: a ref serve a
     lógica, o estado serve a folha. */
  const [planChain, setPlanChainState] = useState(null);
  const planChainRef = useRef(null);
  const setPlanChain = (chain) => { planChainRef.current = chain; setPlanChainState(chain); };
  // O pedido de continuação em curso: se a resposta chegar por sondagem, é daqui
  // que se deriva a parte seguinte (handleAsyncFallback).
  const inflightContinuationRef = useRef(null);
  /* Depois de um plano ficar aplicado (proposta normal, ou a cadeia toda na
     última parte) a Carol revê se os objetivos ainda batem certo: um turno
     iniciado { targets_review: { reason: 'plan_accepted', plan_id } }, pelo canal
     do cup_map. Com os objetivos em dia o servidor salta (skipped: 'targets_ok')
     e nada aparece; senão vem uma mensagem dela, com as sugestões «Atualiza os
     objetivos» / «Mantém». Fica pendente até o chat estar livre (depois do
     «Aceitei o plano.»); em silêncio, uma falha não mostra nada. Nunca nas partes
     intermédias de uma cadeia. */
  const [pendingTargetsReview, setPendingTargetsReview] = useState(null); // { reason, plan_id | race_id }
  /* O mesmo pedido depois do balanço da prova (reason 'race_after'): a revisão
     dos objetivos já não vem dentro do balanço. Só com o balanço mesmo entregue
     e um resultado válido (candidate.raceOutcome, que só existe com a corrida
     registada e ligada à prova: sem ele — sem_registo, por ligar — não se pede). */
  const queueRaceTargetsReview = (candidate, data) => {
    const outcome = candidate?.raceOutcome;
    const raceId = candidate?.raceId ?? outcome?.race_id ?? null;
    if (!data || data.skipped || !data.model_message?.content) return;
    if (!outcome || !outcome.verdict || outcome.verdict === 'sem_registo' || !raceId) return;
    // O balanço «perto» traz duas respostas próprias («para a próxima é para
    // fazer melhor?»): a revisão dos objetivos ficaria por cima dos chips. Fica
    // retida (hold) até o atleta responder, e sai depois do turno seguinte dele
    // (sendUserMessage larga-a). Nos outros veredictos sai logo.
    setPendingTargetsReview({ reason: 'race_after', race_id: raceId, ...(outcome.verdict === 'perto' ? { hold: true } : null) });
  };
  const [activeGoalProposal, setActiveGoalProposal] = useState(null);

  useEffect(() => {
    reloadCoachGoalProposals();
  }, []);

  // A conversa silenciosa ainda em curso (a mensagem proativa ao abrir o
  // chat, abaixo): o que o atleta pedir entretanto espera a vez em vez de
  // sair já — o servidor ainda a tem em mãos e recusava o pedido dele com
  // 409 `busy`.
  const silentRunRef = useRef(null);
  const afterSilentRun = async () => {
    while (silentRunRef.current) await silentRunRef.current.catch(() => null);
  };

  // Motor partilhado das conversas que a própria Carol inicia sem o atleta
  // escrever nada (handleProactiveIntervention, handleAdaptPlanCheckin e a
  // mensagem proativa ao abrir o chat, abaixo) — só o payload muda.
  // `silent`: numa falha imediata não deixa bolha nenhuma. É para a mensagem
  // proativa: o atleta não enviou nada, e "A tua mensagem não saiu" a
  // aparecer sozinha ao abrir o chat era exatamente o incidente de
  // 2026-09-12 (o servidor recusou com 409 `busy` a segunda de duas chamadas
  // gémeas ao montar, e o cliente anunciou uma falha de rede que não houve).
  // Num timeout também: nem aviso de demora nem erro no fim, só a resposta
  // se chegar (ver handleAsyncFallback). E não toma o ecrã enquanto espera:
  // sem "a escrever…", com o ecrã vazio e as sugestões à vista e o campo
  // livre — a revisão semanal que dava timeout deixava a bolha "a escrever…"
  // até 3 minutos e depois sumia sem nada (revisão de 2026-09-26). Ela
  // "escreve" quando a mensagem chega, como sempre (revealMessage).
  // `failure`: as frases do fim — as de um aviso do Início
  // (HOME_ALERT_FAILURE) só quando esse aviso lá está.
  const validContinuation = (c) => !!c && typeof c.from === 'string' && typeof c.to === 'string'
    && Number.isFinite(Number(c.part)) && Number.isFinite(Number(c.of)) && Number(c.part) <= Number(c.of);

  /* Abre a folha da proposta que acabou de chegar e regista-a na cadeia. Com
     várias pendentes (as partes da cadeia ficam todas pendentes), a nova é a
     que a cadeia ainda não conhece. `continuation` é a PRÓXIMA parte (a
     proposta é a parte c.part - 1); sem ela, num turno de continuação, é a
     última. Fora de uma cadeia é uma proposta normal. */
  const openProposalSheet = (freshPlans, { continuation = null, continuationTurn = false } = {}) => {
    const pending = (freshPlans || []).filter((p) => p.status === 'proposto');
    if (pending.length === 0) return null;
    const chain = continuationTurn ? planChainRef.current : null;
    const known = new Set((chain?.parts || []).map((p) => p.planId));
    const plan = pending.find((p) => !known.has(p.id)) || pending[0];
    lastProposedPlanIdRef.current = plan.id;
    const next = validContinuation(continuation) ? continuation : null;
    if (next || chain) {
      const of = chain?.of ?? Number(next.of);
      const part = next ? Number(next.part) - 1 : (chain.parts.length + 1);
      setPlanChain({ of, parts: [...(chain?.parts || []).filter((p) => p.planId !== plan.id), { planId: plan.id, part }] });
    } else {
      setPlanChain(null);
    }
    setActiveProposalSheetPlan(plan);
    return plan;
  };

  /* Recarregar a página perde a cadeia em memória, mas as partes continuam
     pendentes na base: reconstrói-se das propostas pendentes seguidas do mesmo
     plano (rebuildPlanChain), para aceitar uma só parte nunca aplicar um plano
     parcial. Só quando não há cadeia viva. */
  useEffect(() => {
    if (planChainRef.current) return;
    const rebuilt = rebuildPlanChain(coachPlans, (coachMessages || []).filter((m) => m.role !== 'user'), coachPlanItems);
    if (!rebuilt) return;
    setPlanChain({ of: rebuilt.of, parts: rebuilt.parts });
    if (rebuilt.continuation) setPendingContinuation((c) => c || rebuilt.continuation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachPlans, coachMessages, coachPlanItems]);

  // Uma continuação válida: { from, to } (datas) e a parte x de y. No máximo
  // 12 seguidas sem o atleta escrever — rede de segurança contra um ciclo.
  const queuePlanContinuation = (data, { fromAthlete = false } = {}) => {
    if (fromAthlete) continuationRunsRef.current = 0;
    const c = data?.plan_continuation;
    const valid = validContinuation(c);
    if (valid && continuationRunsRef.current < 12) {
      // Desarmada, atada à proposta desta resposta: só o aceite dela a arma.
      setPendingContinuation({
        from: c.from, to: c.to, part: Number(c.part), of: Number(c.of),
        ...(typeof c.until === 'string' ? { until: c.until } : null),
        planId: lastProposedPlanIdRef.current, armed: false,
      });
    } else if (!fromAthlete) {
      // A resposta da continuação sem a seguinte: acabou.
      setPendingContinuation(null);
    }
  };

  const sendCoachInitiatedPayload = (payload, options = {}) => {
    if (coachLoading) return Promise.resolve(null);
    const run = runCoachInitiatedPayload(payload, options);
    if (options.silent) {
      silentRunRef.current = run;
      const release = () => { if (silentRunRef.current === run) silentRunRef.current = null; };
      run.then(release, release);
    }
    return run;
  };

  const runCoachInitiatedPayload = async (payload, { silent = false, failure = COACH_INITIATED_FAILURE } = {}) => {
    cancelLateReplyChecks();
    if (!silent) {
      setCoachLoading(true);
      setCoachSuggestions([]);
      await afterSilentRun();
    }
    const requestStartedAt = new Date().toISOString();

    try {
      const { data, error, isTimeout, isNetwork, serverText } = await invokeEdgeFunctionWithTimeout('coach-chat', {
        body: JSON.stringify(payload)
      });

      if (error) {
        if (isTimeout) {
          await handleAsyncFallback(requestStartedAt, { silent, failureText: failure?.timeout });
        } else if (isNetwork) {
          // A ligação pode ter caído com o pedido já no servidor (ver
          // handleImmediateFailure): espera-se pela resposta como num timeout.
          await handleAsyncFallback(requestStartedAt, { silent, failureText: failure?.network || COACH_IMMEDIATE_FAILURE_TEXT });
        } else if (!silent) {
          // O servidor respondeu com uma frase dela (ação P.12): mostra-a
          // (409 busy, 429, 5xx…). Sem frase — um erro do gateway que só traz
          // o texto em inglês da supabase-js — cai no aviso genérico.
          handleImmediateFailure(serverText || failure?.network);
        }
        return null;
      }

      // live: entra bolha a bolha, precedida de "a escrever…" (ver revealMessage).
      // Um turno silencioso que o servidor saltou (targets_ok, already_sent,
      // quiet_hours…) manda suggestions: [] — e isso apagava os chips da
      // conversa que o atleta tem à frente (os do «Aceitei o plano.»). Salta-se
      // sem tocar em nada.
      if (silent && data?.skipped) return data;
      if (data?.model_message?.content) {
        addCoachMessage({
          id: data.model_message.id || (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.model_message.content,
          mood: data.model_message.mood,
          live: true,
        });
      }
      if (Array.isArray(data?.suggestions)) {
        setCoachSuggestions(data.suggestions);
      } else if (silent && data?.model_message?.content) {
        // Na silenciosa as sugestões não se limparam à partida: as que lá
        // estavam eram da conversa anterior.
        setCoachSuggestions([]);
      }
      if (data?.plan_proposed) {
        const freshPlans = await reloadCoachPlans();
        // Cada parte de um plano longo abre a folha como proposta própria (o
        // atleta acabou de aceitar a anterior: nada fica por cima).
        if (freshPlans && freshPlans.length > 0) {
          openProposalSheet(freshPlans, { continuation: data?.plan_continuation, continuationTurn: !!payload?.plan_continuation });
        }
      }
      if (data?.goal_proposed) {
        const freshGoals = await reloadCoachGoalProposals();
        if (freshGoals && freshGoals.length > 0) {
          const pendingGoals = freshGoals.filter(g => g.status === 'proposto');
          if (pendingGoals.length > 0) setActiveGoalProposal(pendingGoals[0]);
        }
      }
      await refreshAfterTurn(data);
      queuePlanContinuation(data);
      // A silenciosa não o ligou — e o pedido do atleta que esteja à espera
      // dela ainda está em curso.
      if (!silent) setCoachLoading(false);
      return data;
    } catch (err) {
      // Mesma rede de segurança de sendUserMessage: a espera não pode deixar
      // o coachLoading preso.
      try {
        await handleAsyncFallback(requestStartedAt, { silent, failureText: failure?.timeout });
      } catch (fallbackErr) {
        console.warn('[Coach] a espera pela resposta falhou', fallbackErr);
        if (!silent) handleImmediateFailure(failure?.network);
      }
      return null;
    }
  };

  const activeInsightsPayload = () => {
    const allInsights = detectCoachInsights(
      { runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile
    );
    return allInsights.map(i => ({
      title: i.title,
      message: i.message,
      metric: i.metric,
      value: i.value,
      state: insightStateForCarol(i.id, { states: insightStates, snoozes: insightSnoozes, today: todayISO() }),
    }));
  };

  /* O contexto do badge que o atleta abriu ao carregar em "Falar com a
     Carol" (Perfil/BadgeDetailSheet.jsx) — mesmo molde do activeInsights
     acima: o cliente manda, o servidor injeta no prompt
     (_shared/carolMemory.ts, buildBadgeQuestionContext).

     Isto é a ÚNICA via por onde o progresso de um badge chega à Carol: o
     bloco geral da vitrina nunca o leva, e é essa ausência que cumpre o R1 e
     o R3 da doutrina 6 #6. A porta abre-se aqui porque quem perguntou foi o
     atleta, e a própria regra prevê o caso — vale para ESTE badge e mais
     nenhum, e é o servidor que junta o aviso que o diz.

     Os números não vêm do `coachIntent` (que leva a identificação do badge,
     não o estado dele): recalculam-se das mesmas regras que desenharam o
     ecrã, para o que vai ao servidor ser o que o atleta estava a ver. Se
     falhar, vai só a identificação — a conversa continua, com menos. */
  const badgeContextPayload = (intent) => {
    const key = intent?.badgeKey;
    if (!key) return null;
    let badge = null;
    try {
      const { badges } = computeBadges({
        runs, raceEvents, profile: profile || {}, planItems: coachPlanItems, gymSessions, today: todayISO(),
      });
      badge = (badges || []).find((b) => b.key === key) || null;
    } catch {
      badge = null;
    }
    return {
      key,
      name: badge?.name || intent.badgeName || null,
      familia: badge?.familia || intent.familia || null,
      estado: badge?.state || intent.estado || null,
      regra: badge?.rule || null,
      progresso: badge?.linha || null,
      niveis: Array.isArray(badge?.niveis)
        ? badge.niveis.map((n) => ({ label: n.label, limiar: n.limiar, ganho: !!n.ganho }))
        : null,
      repeticoes: badge?.count || null,
    };
  };

  /* Este intent chega de muitos lados: do aviso "Preciso de falar contigo" no
     Início (e do toque na notificação desse assunto), mas também da janela
     dos insights (que os deixa como entendidos, e o Início deixa de os
     mostrar), dos cartões e dos ecrãs de registo. Só o primeiro tem no
     Início um "Falar com a Carol" a que voltar — o assunto por resolver do
     perfil, com o mesmo motivo e sem registo por trás (revisão de
     2026-09-26). */
  const interventionAlertOnHome = (intentData) => (
    !intentData?.recordType
    && (profile?.coach_intervention_status === 'needed' || profile?.coach_intervention_status === 'in_progress')
    && (intentData?.reason || null) === (profile?.coach_intervention_reason || null)
  );

  const handleProactiveIntervention = (intentData) => sendCoachInitiatedPayload({
    message: '',
    is_intervention_start: true,
    intervention_details: intentData?.reason ? `Motivo/Análise: "${intentData.reason}"` : null,
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
  }, interventionAlertOnHome(intentData) ? { failure: HOME_ALERT_FAILURE } : {});

  // "Adaptar Plano" (WeeklyPlanCard): o atleta é que veio ter com a Carol —
  // ao contrário da intervenção proativa acima (disparada por um alerta que
  // surgiu sozinho na análise de um registo), aqui não há nada para
  // "confrontar" à partida. is_plan_checkin diz ao servidor para a Carol
  // atender como quem abre a porta: cumprimentar/retomar consoante já
  // tenham falado hoje, perguntar como pode ajudar, e só trazer um alerta
  // ativo à conversa como hipótese — nunca como acusação.
  /* `divergence` só vem do Início, quando a app detetou sozinha que o plano
     e a realidade se afastaram (utils/planDivergence.js): é o MESMO
     check-in, mas com os motivos concretos no corpo — o servidor aceita até
     seis textos em `plan_divergence` e a Carol explica o que muda e propõe o
     plano ajustado. Recebida a resposta, a assinatura fica marcada como
     tratada e a mesma deteção não volta a chamar enquanto o plano não mudar.
     specs/plano-de-prova.md, "O plano tem de saber da prova". */
  /* O que o turno mudou na base de dados volta para o store: metas ou
     intervenção resolvida → perfil; prova atualizada (update_race_event) →
     provas. Sem isto o Início ficava a dizer "1 assunto a resolver" com a
     intervenção já resolvida, e o hub a planear sobre o objetivo antigo. */
  const refreshAfterTurn = async (data) => {
    if (!profile?.id) return;
    if (data?.goals_updated || data?.intervention_resolved) {
      const { data: freshProfile } = await supabase.from('profiles').select('*').eq('id', profile.id).single();
      if (freshProfile) setProfile(freshProfile);
    }
    if (data?.race_updated) {
      const { data: freshRaces } = await supabase.from('race_events').select('*').eq('user_id', profile.id).order('date', { ascending: true });
      if (freshRaces) useAppStore.getState().setRaceEvents(freshRaces);
    }
    // A Carol gravou numa jornada ou no objetivo da época (set_cup_*, só a
    // um inscrito — specs/trofeu.md §5): relê a competição, as provas (a
    // sincronização mexe na prova da jornada) e, se mudaram, os planos.
    if (data?.cup_updated) await useAppStore.getState().refreshCupAfterChat?.();
  };

  const handleAdaptPlanCheckin = ({ divergence = null, signature = null } = {}) => sendCoachInitiatedPayload({
    message: '',
    is_plan_checkin: true,
    ...(divergence?.length ? { plan_divergence: divergence.slice(0, MAX_DIVERGENCE_TEXTS) } : {}),
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
    // Só a divergência vem de um aviso do Início; o "Adaptar Plano" é um
    // botão do cartão do plano, e lá não há "Falar com a Carol" a que voltar.
  }, divergence?.length ? { failure: HOME_ALERT_FAILURE } : {}).then((data) => {
    if (data && signature) markDivergenceHandled(profile?.id, signature);
    return data;
  });

  /* Vindo do fim do arranque (onboarding): a Carol prometeu lá o plano e o
     arranque acabava sem plano nenhum e sem conversa. Agora é ela que abre,
     pelo canal do check-in do plano — o único onde as ferramentas de propor
     estão abertas; o guião do arranque é montado no servidor
     (onboarding_start). */
  const handleOnboardingStart = () => sendCoachInitiatedPayload({
    message: '',
    is_plan_checkin: true,
    onboarding_start: true,
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
  });

  /* Vindo do Início, aviso "A Carol precisa de falar contigo" por conflito
     de provas principais (specs/plano-vinculado-a-prova.md §4.4). Vai pelo
     canal do check-in do plano — é lá que as ferramentas de propor estão
     abertas — mas com o guião do conflito, que o servidor monta a partir das
     provas que aqui seguem. Ao contrário da divergência, não se marca nada
     como tratado no fim: o que fecha o assunto é a decisão do atleta gravada
     na prova (conflict_acknowledged_at), não o facto de terem falado. */
  const handleRaceConflictCheckin = ({ races = [], target = null } = {}) => sendCoachInitiatedPayload({
    message: '',
    is_plan_checkin: true,
    race_conflict: { races, target },
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
  }, { failure: HOME_ALERT_FAILURE });

  /* Vindo do Início, aviso "O mapa da época" (specs/trofeu.md §5, Fase 2;
     utils/cupMap.js): o atleta inscrito numa competição por jornadas abre a
     conversa em que a Carol lhe mostra o papel de cada jornada ao lado das
     provas principais. Vai pelo canal do check-in do plano — o do caso E,
     onde propor o plano ajustado e gravar as jornadas estão abertos — e o
     servidor monta o guião do mapa a partir do bloco da competição; `first`
     (o mapa da inscrição) junta as perguntas da época que ainda faltem.
     A assinatura só fica tratada — aqui e, pela impressão 'moment' (sem
     título: fica fora do prompt), nos outros dispositivos — quando o
     servidor diz que o turno foi mesmo o do mapa (`cup_map_shown`): sem
     isso, uma leitura da competição que falhou ou um servidor que não
     conhece o mapa (o guião do "Adaptar Plano") davam-no por tratado sem
     nunca o ter mostrado, e as perguntas da época perdiam-se (revisão da
     Fase 2). Sem bloco ativo o servidor salta o turno
     (`cup_map_unavailable`): uma frase para o toque não ficar sem resposta,
     e a competição relê-se — se a inscrição já não está ativa (saiu noutro
     dispositivo), o aviso do Início desaparece. */
  const cupMapPendingRef = useRef(null);
  const markCupMapDone = (signature) => {
    markCupMapHandled(profile?.id, signature);
    useAppStore.getState().logImpression?.({ kind: 'moment', key: signature, title: null });
  };
  const handleCupMapCheckin = ({ signature = null, first = false } = {}) => {
    // Se o turno passar dos 45 s a resposta chega por sondagem, sem os sinais
    // do servidor: a assinatura fica pendente para o handleAsyncFallback.
    if (!coachLoading) cupMapPendingRef.current = signature;
    return sendCoachInitiatedPayload({
    message: '',
    is_plan_checkin: true,
    cup_map: { first: !!first, signature },
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
  }).then((data) => {
    cupMapPendingRef.current = null;
    // Mostrado agora, ou "already_sent" (o servidor já o tinha mostrado a esta
    // assinatura): tratado nos dois casos. Chegado por sondagem fica em
    // handleAsyncFallback, que lê a assinatura pendente.
    if ((data?.cup_map_shown === true || data?.skipped === 'already_sent') && signature) {
      markCupMapDone(signature);
    } else if (data?.skipped && data.reason === 'cup_map_unavailable') {
      addCoachMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: COACH_EMPTY_REPLY_TEXT });
      useAppStore.getState().loadCup?.({ force: true })?.catch?.(() => {});
    }
    return data;
  });
  };

  // Vindo do Início, botão "Falar com a Carol" no aviso "O balanço da
  // prova" (utils/coachProactive.js, pendingRaceBalanceCandidate): ao
  // contrário do efeito passivo abaixo (que cede sempre que ela tiver
  // falado há menos de 6h, para não empilhar duas mensagens não pedidas),
  // isto é um pedido explícito do atleta — vai com `proactive_force` para
  // não ficar silenciosamente sem resposta nenhuma (bug 2026-09-14).
  //
  // O mesmo para o aviso "O bloco está a acabar" (ação P.11, coachIntent
  // 'proactive_moment'): o servidor honra o force em qualquer momento. Um
  // "already_sent" (a conversa já aconteceu noutro dispositivo) marca-se
  // como dita, para o aviso do Início desaparecer em vez de ficar a pedir
  // uma conversa que o chat já mostra.
  const handleRaceBalanceCheckin = (candidate) => sendCoachInitiatedPayload({
    message: '',
    proactive_trigger: candidate.trigger,
    proactive_details: candidate.details,
    proactive_key: candidate.key,
    ...(candidate.raceOutcome ? { race_outcome: candidate.raceOutcome } : {}),
    proactive_force: true,
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
  }, { failure: HOME_ALERT_FAILURE }).then((data) => {
    // «Já não há nada a retomar» (plan_resume_gone) conta como já dito: o aviso sai.
    if (data?.skipped && (data.reason === 'already_sent' || data.reason === 'plan_resume_gone')) markProactiveSent(profile?.id, candidate);
    queueRaceTargetsReview(candidate, data);
    if (data && !data.skipped) {
      markProactiveSent(profile?.id, candidate);
      // O hub (RaceBalanceCard) tem o mesmo balanço — pedido lá, marca-se
      // aqui e o aviso do Início desaparece (wasProactiveSent, partilhado);
      // pedido aqui, é esta cópia local que faz o hub mostrar o que a Carol
      // já disse em vez de convidar a pedir-lho outra vez.
      if (candidate.raceId && data.model_message?.content) {
        writeRaceBalanceCache(candidate.raceId, {
          text: data.model_message.content,
          suggestions: Array.isArray(data.suggestions) ? data.suggestions.filter((s) => typeof s === 'string' && s.trim()) : [],
          runId: candidate.runId,
        });
      }
    }
    return data;
  });

  /* O toque na notificação "Saiu a classificação" do Troféu (specs/trofeu.md
     §8, Fase 5; App.jsx, cupPushRoute): a conversa da classificação dessa
     jornada. Só a chave vai ao servidor — é ele que lê a linha do atleta
     (nada de lugar, pontos ou clube sai do telemóvel) — e com
     `proactive_force`, como os outros toques numa notificação: prometeu-se
     uma conversa. Se ela já aconteceu (outro dispositivo), o servidor diz
     `already_sent` e o chat já a mostra. */
  const handleCupResultsCheckin = ({ key }) => sendCoachInitiatedPayload({
    message: '',
    proactive_trigger: 'cup_results',
    proactive_key: key,
    proactive_force: true,
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
  });

  useEffect(() => {
    if (coachIntent && coachIntent.kind === 'proactive_intervention') {
      setCoachIntent(null);
      handleProactiveIntervention(coachIntent);
      return;
    }
    if (coachIntent && (coachIntent.kind === 'race_balance' || coachIntent.kind === 'proactive_moment')) {
      const { candidate } = coachIntent;
      setCoachIntent(null);
      handleRaceBalanceCheckin(candidate);
      return;
    }
    if (coachIntent && coachIntent.kind === 'race_conflict') {
      const { races, target } = coachIntent;
      setCoachIntent(null);
      handleRaceConflictCheckin({ races, target });
      return;
    }
    if (coachIntent && coachIntent.kind === 'cup_results') {
      const { key } = coachIntent;
      setCoachIntent(null);
      if (typeof key === 'string' && key.startsWith('cup_results:')) handleCupResultsCheckin({ key });
      return;
    }
    if (coachIntent && coachIntent.kind === 'cup_map') {
      const { signature, first } = coachIntent;
      setCoachIntent(null);
      handleCupMapCheckin({ signature, first });
      return;
    }
    if (coachIntent === 'onboarding_start' || (coachIntent && coachIntent.kind === 'onboarding_start')) {
      setCoachIntent(null);
      handleOnboardingStart();
      return;
    }
    // Os botões "Adaptar plano" mandam a string; o Início, quando detetou uma
    // divergência, manda o objeto com os motivos.
    if (coachIntent === 'adapt_plan') {
      setCoachIntent(null);
      handleAdaptPlanCheckin();
      return;
    }
    if (coachIntent && coachIntent.kind === 'adapt_plan') {
      const { divergence, signature } = coachIntent;
      setCoachIntent(null);
      handleAdaptPlanCheckin({ divergence, signature });
      return;
    }
    // Vindo do hub da prova: o atleta respondeu à pergunta do balanço ("Sim,
    // para a próxima quero melhor") — a resposta entra no chat como se a
    // tivesse escrito aqui (specs/gamificacao-provas.md §6).
    if (coachIntent && coachIntent.kind === 'say' && typeof coachIntent.text === 'string') {
      const { text } = coachIntent;
      setCoachIntent(null);
      handleSend(text);
      return;
    }
    /* Vindo do ecrã de um badge (Perfil > Vitrina, ou o painel "o que há
       para ganhar"): o atleta pediu que ela lhe explicasse o badge. A
       pergunta dele entra na conversa como se a tivesse escrito — é o molde
       do `say` — mas leva atrás, fora da mensagem, o contexto deste badge.
       Ver badgeContextPayload acima. */
    if (coachIntent && coachIntent.kind === 'badge') {
      const intent = coachIntent;
      setCoachIntent(null);
      handleSend(intent.pergunta, { badgeContext: badgeContextPayload(intent) });
      return;
    }
    // Vindo de Perfil > Memória do Coach: o atleta não edita por cima do
    // que a Carol escreveu — pede-lhe que altere, e a conversa abre já
    // centrada nessa nota para ele explicar o que está errado. A bolha é o
    // que ele diria; o pedido de atualizar a nota vai à parte, no corpo do
    // pedido — "atualiza a nota" era vocabulário de implementação na boca
    // do atleta (revisão de 2026-09-26).
    if (coachIntent && coachIntent.kind === 'discuss_note') {
      const { note } = coachIntent;
      setCoachIntent(null);
      handleSend(`Há uma coisa que tens anotada sobre mim que já não está certa: "${note}"`, {
        noteDiscussion: {
          note,
          instruction: 'O atleta quer mudar esta nota da memória: pergunta-lhe o que precisares e atualiza-a quando estiverem de acordo.',
        },
      });
    }
  }, [coachIntent]);

  // ── Mensagens por iniciativa dela (CAROL.md §3 e §7) ────────────────────
  // 3 dias sem registo, véspera/manhã/depois da prova: ao abrir o chat, se
  // houver um destes momentos e ainda não tiver sido dito, a Carol escreve
  // primeiro. Decisão em utils/coachProactive.js; o texto é do coach-chat
  // (proactive_trigger). Corre uma vez por montagem e cede a vez a qualquer
  // intenção já em curso (intervenção, adaptar plano, nota da memória). Só
  // fica marcado como enviado quando o servidor responde de facto — se ele
  // saltar (ela falou há pouco), volta a tentar na próxima abertura.
  // Uma tentativa por montagem, a sério: em desenvolvimento o StrictMode
  // corre este efeito duas vezes seguidas e o `coachLoading` do fecho ainda é
  // o do primeiro render (false nas duas) — saíam dois pedidos gémeos, o
  // segundo levava 409 do lock do servidor. O ref sobrevive à dupla
  // invocação porque a instância do componente é a mesma.
  const proactiveAttempted = useRef(false);
  useEffect(() => {
    if (coachIntent || coachLoading || proactiveAttempted.current) return;
    const { percentileSnapshots, leaderboardEntries } = useAppStore.getState();
    // plan_resume (a Carol retoma um plano partido) não está na lista do cliente:
    // decide-o o servidor. Uma notificação tocada traz a chave (plan_resume:<id
    // da mensagem>) e o servidor lê os factos por ela — entra à frente.
    const tapped = useAppStore.getState().proactiveKeyRequested;
    const resume = typeof tapped === 'string' && /^plan_resume:/.test(tapped)
      ? [{ trigger: 'plan_resume', key: tapped, details: '' }].filter((c) => !wasProactiveSent(profile?.id, c))
      : [];
    const list = [...resume, ...listProactiveTriggers({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile, coachPlans, coachPlanItems, dailyCheckins, percentileSnapshots, leaderboardEntries })
      .filter((c) => !wasProactiveSent(profile?.id, c))];
    if (!list.length) return;
    // Uma notificação tocada com a app já a carregar os dados (ação P.9):
    // este candidato vai primeiro. Se a chave já não estiver na lista
    // (resolvido entretanto, ou já enviado por outro dispositivo), segue-se
    // a ordem normal — consome-se sempre, para não voltar a pedir prioridade
    // numa montagem futura por engano.
    const requestedKey = useAppStore.getState().proactiveKeyRequested;
    if (requestedKey) useAppStore.getState().setProactiveKeyRequested(null);
    const requested = requestedKey ? list.find((c) => c.key === requestedKey) : null;
    const ordered = requested
      ? [requested, ...list.filter((c) => c.key !== requestedKey)]
      : list;
    proactiveAttempted.current = true;

    // Uma tentativa de cada vez, à espera da resposta: "already_sent" (outro
    // dispositivo já a deu) passa ao candidato seguinte — barato, o
    // coach-chat recusa antes de ler ou chamar o modelo; "quiet_hours" (ela
    // falou há pouco por qualquer motivo) para a lista inteira, não só este
    // candidato — não é ele que está errado, é o momento.
    (async () => {
      for (const candidate of ordered) {
        // Ele escreveu entretanto (a silenciosa não trava o campo): a vez é
        // dele, e os outros momentos ficam para a próxima abertura.
        if (useAppStore.getState().coachLoading) return;
        const data = await sendCoachInitiatedPayload({
          message: '',
          proactive_trigger: candidate.trigger,
          proactive_details: candidate.details,
          // A chave vai para o servidor (coach_proactive_log): se outro
          // dispositivo já recebeu esta mensagem, ela não se repete aqui.
          proactive_key: candidate.key,
          // Só no balanço da prova com a corrida registada: o veredicto calculado
          // pela app (utils/raceOutcome.js), para o servidor escrever o balanço
          // com os números certos — superado / perto / aquém.
          ...(candidate.raceOutcome ? { race_outcome: candidate.raceOutcome } : {}),
          // O toque numa notificação fura as quiet hours (ação P.9), como o
          // botão "Falar com a Carol" do balanço já fazia: prometeu-se uma
          // conversa, e recusá-la em silêncio por ela ter falado por
          // qualquer outro motivo há menos de 6h deixava o toque sem
          // resposta nenhuma. Só o candidato pedido pelo toque, nunca a
          // tentativa silenciosa normal ao abrir o chat.
          ...(candidate === requested ? { proactive_force: true } : {}),
          userData: profile || {},
          activeInsights: activeInsightsPayload(),
        }, { silent: true });
        if (!data) return; // erro de rede — não martela os candidatos seguintes
        if (!data.skipped) { markProactiveSent(profile?.id, candidate); queueRaceTargetsReview(candidate, data); return; }
        // already_sent, ou plan_resume_gone (a retoma deixou de valer: o plano seguiu): marca-se e
        // passa-se ao candidato seguinte, para não bloquear os outros momentos da abertura.
        if (data.reason === 'already_sent' || data.reason === 'plan_resume_gone') { markProactiveSent(profile?.id, candidate); continue; }
        return; // quiet_hours (ou outro motivo global) — tenta-se tudo de novo na próxima abertura
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha só a secção respondida — se a outra proposta (objetivos/plano)
  // ainda estiver pendente, a persiana continua aberta a mostrá-la (ver
  // PlanProposalBottomSheet, que já não fecha a persiana sozinho ao
  // responder a uma secção).
  /* O plano aceite (utils/planStart.js): em vez do aviso "Plano aceite", o
     arranque do bloco dito por ela — quantas semanas, quando começa, o
     primeiro treino —, no cartão da confirmação. Recusar continua a ser só
     o aviso: não há nada a começar. */
  const [planStart, setPlanStart] = useState(null);
  /* Aplica (ou recusa) as propostas da cadeia por ordem de parte. Pára à primeira
     que falhar e deixa na cadeia só as que ficaram por tratar. */
  const applyChain = async (accept) => {
    const chain = planChainRef.current;
    const ordered = [...chain.parts].sort((a, b) => a.part - b.part);
    const done = [];
    for (const { planId } of ordered) {
      const ok = await respondToPlan(planId, accept);
      if (!ok) {
        // Fica na cadeia só o que falta; o que já se gravou fica registado para
        // a decisão seguinte não mentir sobre o estado do plano.
        setPlanChain({ ...chain, parts: chain.parts.filter((p) => !done.includes(p.planId)), applied: [...(chain.applied || []), ...(accept ? done : [])] });
        return { ok: false, done };
      }
      done.push(planId);
    }
    return { ok: true, done };
  };

  /* A continuação desta parte: a pendente (se for desta proposta) ou, se se
     perdeu (o pedido falhou, ou recarregou-se a página), a que a mensagem do
     modelo prometeu para a semana a seguir. Sem nenhuma, a parte trata-se como
     a última: «Aceitar plano» e aplica-se a cadeia que existe. */
  const continuationFor = (plan) => {
    if (!plan) return null;
    if (pendingContinuation && pendingContinuation.planId === plan.id) return pendingContinuation;
    const promised = findPromisedContinuation((coachMessages || []).filter((m) => m.role !== 'user'), plan);
    return promised ? { ...promised, planId: plan.id, armed: false } : null;
  };

  const handleRespond = async (planId, accept) => {
    // Plano longo em partes — tudo-ou-nada: aceitar uma parte que não é a última
    // NÃO aplica nada, arma o pedido da seguinte; na última, aplica-se a cadeia
    // inteira por ordem; recusar qualquer uma recusa todas.
    const chain = planChainRef.current;
    const mine = chain?.parts.find((p) => p.planId === planId);
    if (mine) {
      const findPlan = (id) => (activeProposalSheetPlan?.id === id ? activeProposalSheetPlan : (coachPlans || []).find((p) => p.id === id));
      const cont = accept && mine.part < chain.of ? continuationFor(findPlan(planId)) : null;
      if (cont) {
        // Arma (ou volta a armar, regenerada da mensagem) o pedido da seguinte.
        setPendingContinuation({ ...cont, planId, armed: true });
        setActiveProposalSheetPlan(null);
        return;
      }
      // Sem continuação possível, a parte é a última: aplica a cadeia que existe.
      const before = chain.applied || [];
      const firstPlan = findPlan([...chain.parts].sort((a, b) => a.part - b.part)[0].planId);
      const r = await applyChain(accept);
      if (!r.ok) {
        const gravadas = (accept ? [...before, ...r.done] : before).length;
        showToast(gravadas > 0
          ? `Gravei ${gravadas} ${gravadas === 1 ? 'parte' : 'partes'} do plano, mas falhou a seguinte. A proposta continua aqui — tenta outra vez.`
          : 'Não consegui gravar a tua decisão. A proposta continua aqui — tenta outra vez.', 'error');
        return;
      }
      setPlanChain(null);
      setPendingContinuation(null);
      if (accept) {
        // As partes fundem-se num só bloco e a proposta apagada já não existe:
        // o início do plano procura-se no bloco aceite que cobre a 1.ª parte.
        const st = useAppStore.getState();
        const alvo = (st.coachPlans || []).find((p) => p.status === 'aceite' && firstPlan
          && p.period_start <= firstPlan.period_start && p.period_end >= firstPlan.period_end
          && (p.race_id ?? null) === (firstPlan.race_id ?? null))
          || (st.coachPlans || []).find((p) => p.id === planId);
        const moment = planStartMoment(alvo, st.coachPlanItems, todayISO());
        if (moment) setPlanStart(moment);
        else showToast('Plano aceite');
        setPendingTargetsReview({ reason: 'plan_accepted', plan_id: alvo?.id || planId });
      } else if (before.length > 0) {
        // Recusar depois de partes já gravadas: não se diz «Plano recusado».
        showToast(`Recusei o que faltava, mas ${before.length === 1 ? 'a parte que já tinha gravado fica' : `as ${before.length} partes que já tinha gravado ficam`} no teu plano.`);
      } else {
        showToast('Plano recusado');
      }
      setActiveProposalSheetPlan(null);
      // Depois de partes já gravadas, recusar o resto não é «Recusei o plano.» (a
      // frase que a Carol lê como o plano todo recusado): não se envia.
      if (accept || before.length === 0) handleSend(accept ? 'Aceitei o plano.' : 'Recusei o plano.');
      return;
    }
    const ok = await respondToPlan(planId, accept);
    if (ok && !accept) setPendingContinuation(null);
    if (ok && accept) {
      const st = useAppStore.getState();
      const plan = (st.coachPlans || []).find((p) => p.id === planId);
      const moment = planStartMoment(plan, st.coachPlanItems, todayISO());
      if (moment) setPlanStart(moment);
      else showToast('Plano aceite');
      setPendingTargetsReview({ reason: 'plan_accepted', plan_id: planId });
    } else if (ok) {
      showToast('Plano recusado');
    }
    setActiveProposalSheetPlan(null);
    // Mesmo problema que os objetivos (ver handleRespondGoal): decidir na
    // persiana só grava o estado, não é uma troca de mensagens — sem isto a
    // Carol nunca sabia se o atleta tinha aceitado ou recusado, e a
    // conversa ficava suspensa sem reação nenhuma da parte dela.
    if (ok) {
      handleSend(accept ? 'Aceitei o plano.' : 'Recusei o plano.');
    }
  };

  const handleRespondGoal = async (proposalId, accept) => {
    const ok = await respondToGoalProposal(proposalId, accept);
    if (ok) showToast(accept ? 'Objetivos aceites e atualizados' : 'Proposta de objetivos recusada');
    // Antes, uma falha não dizia nada — a persiana fechava como se tivesse
    // corrido bem. A proposta continua por decidir no botão flutuante.
    else showToast('Não consegui gravar a tua decisão. A proposta continua aqui — tenta outra vez.', 'error');
    setActiveGoalProposal(null);
    // Aceitar na persiana só grava no perfil — não é uma troca de mensagens,
    // por isso a Carol nunca fica a saber que pode agora avançar com o que
    // tinha ficado pendente (ex.: sugestões de refeições, ver regra
    // SEQUÊNCIA DE DEPENDÊNCIA no prompt do coach-chat). Dispara uma
    // mensagem automática, tal como já se faz para coachIntent==='adapt_plan'.
    // Mantida deliberadamente curta e natural — o texto que instruía a Carol
    // a não repropor objetivos e a "avançar com o que tinha dito que faria"
    // aparecia no chat como uma bolha do atleta, o que lia mal (ninguém
    // escreve assim). Essa instrução está no servidor, no ESQUEMA DE DECISÃO
    // do prompt do coach-chat, que classifica exatamente estas quatro frases
    // (casos A a D) e fixa que ferramentas podem ser chamadas em cada caso.
    // As frases têm de bater certo com as do esquema — não as reformules sem
    // atualizar o prompt.
    if (ok) {
      handleSend(accept ? 'Aceitei os novos objetivos.' : 'Recusei os novos objetivos.');
    }
  };

  // Fecho total da persiana (X, backdrop, arrastar) — abandona as duas
  // propostas por decidir agora; continuam pendentes na base de dados e
  // reaparecem no botão flutuante.
  const handleCloseProposalsSheet = () => {
    setActiveProposalSheetPlan(null);
    setActiveGoalProposal(null);
  };

  const [inputStr, setInputStr] = useState('');
  // Fotos por enviar (embalagens, comida — decisões 16/17): só em memória, vão neste pedido e mais nada.
  const [photos, setPhotos] = useState([]);
  const [photoNote, setPhotoNote] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [hoursToShow, setHoursToShow] = useState(24);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Bug relatado 2026-08-30 (mesma causa dos formulários de registo — ver
  // formDraftPersistence.js): o Android descarta a página em segundo plano
  // sob pressão de memória e recarrega-a do zero ao voltar, apagando este
  // texto por escrever tal como qualquer outro estado em memória. Restaura
  // uma única vez ao montar — este ecrã desmonta/remonta ao trocar de
  // separador, por isso não precisa do guard restoredForKeyRef usado nos
  // formulários (que ficam montados durante várias sessões de edição).
  useEffect(() => {
    const persisted = restorePersistedFormDraft(COACH_CHAT_DRAFT_KEY);
    if (persisted?.inputStr) setInputStr(persisted.inputStr);
  }, []);

  // Grava o rascunho (com debounce) enquanto houver texto por enviar —
  // handleSend limpa-o assim que a mensagem é enviada (ver abaixo).
  usePersistedFormDraft(COACH_CHAT_DRAFT_KEY, { inputStr }, { isDirty: true });

  const cutoffTime = Date.now() - (hoursToShow * 60 * 60 * 1000);
  const visibleMessages = (coachMessages || []).filter(msg => {
    let msgTime;
    if (msg.created_at) {
      msgTime = new Date(msg.created_at).getTime();
    } else if (msg.id && !isNaN(msg.id)) {
      msgTime = parseInt(msg.id, 10);
    }
    if (!msgTime || isNaN(msgTime)) return true;
    return msgTime >= cutoffTime;
  });
  const hasMoreMessages = (coachMessages || []).length > visibleMessages.length;


  const isFirstRender = useRef(true);

  // ── Ritmo humano (CAROL.md §5) ──────────────────────────────────────────
  // reveal[id] = nº de bolhas já visíveis de uma mensagem nova da Carol; sem
  // entrada = mensagem inteira (histórico, avisos, e o que já cá estava ao
  // montar — trocar de separador não a faz "escrever" outra vez). Uma
  // mensagem é UM registo em coach_messages; a divisão em bolhas é só de
  // apresentação (splitIntoBubbles). revealMessage mostra "a escrever…" e vai
  // soltando as bolhas, uma mensagem de cada vez (revealQueue).
  const [reveal, setReveal] = useState({});
  const revealRef = useRef({});
  const [typingActive, setTypingActive] = useState(false);
  const revealQueue = useRef(Promise.resolve());
  const mountedRef = useRef(true);
  const seenIds = useRef(null);
  if (seenIds.current === null) seenIds.current = new Set((coachMessages || []).map((m) => m.id));
  useEffect(() => () => { mountedRef.current = false; }, []);

  const setVisibleChunks = (id, n) => {
    revealRef.current = { ...revealRef.current, [id]: n };
    setReveal(revealRef.current);
  };
  const revealMessage = async (msg) => {
    const chunks = splitIntoBubbles(msg.content);
    if (prefersReducedMotion() || chunks.length === 0) {
      setVisibleChunks(msg.id, chunks.length);
      return;
    }
    setVisibleChunks(msg.id, 0);
    setTypingActive(true);
    for (let i = 0; i < chunks.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, i === 0 ? typingDelayFor(chunks[i]) : BUBBLE_GAP_MS));
      if (!mountedRef.current) return;
      setVisibleChunks(msg.id, i + 1);
    }
    setTypingActive(false);
  };
  useEffect(() => {
    for (const m of coachMessages || []) {
      if (m.role === 'user' || !m.live || seenIds.current.has(m.id)) continue;
      seenIds.current.add(m.id);
      revealQueue.current = revealQueue.current.then(() => revealMessage(m));
    }
  }, [coachMessages]);

  // Auto-scroll to bottom when messages or loading state changes
  useEffect(() => {
    if (isFirstRender.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      isFirstRender.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [coachMessages, coachLoading, coachSuggestions, reveal, typingActive]);

  // Adjust textarea height on input change
  const handleInputChange = (e) => {
    setInputStr(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
      // Bug #56 (2026-10-05): ao crescer, a caixa e o botão de enviar
      // ficavam por baixo do teclado. Com interactive-widget=resizes-content
      // (index.html) a página encolhe acima do teclado; isto traz a caixa
      // inteira de volta à vista a cada linha nova.
      textareaRef.current.scrollIntoView?.({ block: 'nearest' });
    }
  };

  // Sonda coach_messages à procura da resposta do modelo criada DEPOIS do
  // início deste pedido — usado quando o cliente não conseguiu resposta
  // síncrona mas o pedido pode ainda estar em processamento no servidor.
  //
  // Pára cedo quando o servidor já acabou sem resposta: ele liberta o lock
  // (profiles.coach_chat_busy_since) no fim de qualquer pedido, DEPOIS de
  // gravar a resposta. Por isso lê-se o lock primeiro e as mensagens depois:
  // lock livre e nenhuma resposta quer dizer que não vem nenhuma. Antes
  // esperava-se sempre os 3 minutos — a 2026-09-24 o servidor desistiu aos
  // 80 s e a atleta só soube quase 2 minutos depois. Um lock que não se lê
  // (erro) ou que ficou preso (a função morta a meio) mantém a sondagem, e
  // só se desiste com DUAS leituras seguidas de lock livre sem resposta: o
  // pedido que chegou tarde ao servidor ainda não o tinha reservado na
  // primeira. (Um pedido que falhou a reservar o lock corre sem ele do
  // princípio ao fim — esse caso raro continua sem cobertura.)
  //
  // Sem rede, desiste ao fim de OFFLINE_POLLS_MAX voltas seguidas (~12 s):
  // esperar os 3 minutos com o campo travado era pior do que avisar e deixar
  // o "Reenviar" (revisões pré-deploy de 3a00a815 e 82852b22). "Sem rede" é
  // navigator.onLine falso, OU as duas leituras falharem na mesma volta — o
  // telemóvel pode dizer que tem rede sem ter internet (Wi-Fi sem saída,
  // portal cativo, dados sem sinal útil). Só o lock a falhar não conta: a
  // sondagem continua (ver acima). A resposta, se o servidor a gravou,
  // aparece ao recarregar.
  //
  // Nunca lança: uma leitura que rebente conta como leitura falhada — quem
  // chama (handleAsyncFallback) tem de chegar sempre ao fim e destravar o
  // campo.
  const waitForAsyncReply = async (afterIso) => {
    const deadline = Date.now() + POLL_MAX_MS;
    let freeReads = 0;
    let offlineReads = 0;
    const safeRead = async (read) => {
      try {
        return await read();
      } catch (err) {
        return { data: null, error: err };
      }
    };
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        offlineReads += 1;
        if (offlineReads >= OFFLINE_POLLS_MAX) return null;
        continue;
      }
      const { data: lock, error: lockError } = await safeRead(() => supabase
        .from('profiles')
        .select('coach_chat_busy_since')
        .eq('id', profile?.id)
        .single());
      // '*' e não a lista das colunas: a `mood` pode ainda não existir na
      // base (migration por aplicar), e pedi-la pelo nome partia a sondagem.
      const { data: rows, error: rowsError } = await safeRead(() => supabase
        .from('coach_messages')
        .select('*')
        .eq('user_id', profile?.id)
        .eq('role', 'model')
        .gt('created_at', afterIso)
        .order('created_at', { ascending: true })
        .limit(1));
      if (rows && rows.length > 0) return rows[0];
      if (lockError && rowsError) {
        offlineReads += 1;
        if (offlineReads >= OFFLINE_POLLS_MAX) return null;
        continue;
      }
      offlineReads = 0;
      freeReads = lock && lock.coach_chat_busy_since === null ? freeReads + 1 : 0;
      if (freeReads >= 2) return null;
    }
    return null;
  };

  // Chamado quando invokeEdgeFunctionWithTimeout falha — ver comentário
  // grande sobre POLL_MAX_MS acima. Mostra um aviso de demora (sem
  // destravar o campo, para não convidar a reformular a mesma pergunta) e
  // só desiste de vez se a sondagem não encontrar nada no prazo.
  // `silent` (a mensagem proativa ao abrir o chat): ninguém pediu nada, por
  // isso nem aviso nem erro — só a resposta, se chegar. À segunda-feira, a
  // revisão semanal que dava timeout deixava as duas bolhas sozinhas no
  // chat, sem contexto nenhum (revisão de 2026-09-26). Também não mexe no
  // coachLoading, que não é dela (ver sendCoachInitiatedPayload), e uma
  // sondagem que falhe acaba calada.
  // `retry`: o que o botão "Reenviar" volta a mandar (ver handleSend) — fica
  // na bolha de falha do fim, ou na frase de falha que o servidor gravou.
  // `chained`: há mais trabalho depois desta espera (o reenvio a seguir a um
  // 409 `busy`) — sem bolha de falha no fim e sem destravar o campo.
  /* O que se faz depois de a resposta de um turno chegar por sondagem (ou tarde):
     recarrega planos e objetivos e abre a folha da proposta pendente, com a
     cadeia (o servidor grava o plan_continuation na linha da resposta; sem ele,
     numa continuação deriva-se da que se pediu). */
  const afterPolledReply = async (modelRow, sent) => {
    const freshPlans = await reloadCoachPlans();
    if (freshPlans && freshPlans.length > 0) {
      const fromRow = validContinuation(modelRow?.plan_continuation) ? modelRow.plan_continuation : null;
      const next = fromRow || (sent ? nextPlanContinuation(sent) : null);
      const plan = openProposalSheet(freshPlans, { continuation: next, continuationTurn: !!sent });
      if (plan) queuePlanContinuation({ plan_continuation: next }, { fromAthlete: !sent });
    }
    const freshGoals = await reloadCoachGoalProposals();
    if (freshGoals && freshGoals.length > 0) {
      const pendingGoals = freshGoals.filter(g => g.status === 'proposto');
      if (pendingGoals.length > 0) setActiveGoalProposal(pendingGoals[0]);
    }
    if (profile?.id) {
      const { data: freshProfile } = await supabase.from('profiles').select('*').eq('id', profile.id).single();
      if (freshProfile) setProfile(freshProfile);
    }
  };

  /* A sondagem desistiu e a resposta chegou depois: volta a ler a resposta (às 15,
     45 e 90 s) e, se já lá estiver e ainda não estiver no ecrã, trata-a como se
     tivesse chegado por sondagem. Idempotente: a primeira leitura que a encontra
     mostra-a, as seguintes já a vêem no store. */
  const lateReplyTimersRef = useRef([]);
  // Cada pedido novo (envio, «Reenviar», turno iniciado) muda a época: uma
  // leitura tardia de um pedido anterior já não vale — apanharia a resposta do
  // seguinte e correria o pós-sondagem com o `sent` antigo.
  const requestEpochRef = useRef(0);
  const cancelLateReplyChecks = () => {
    requestEpochRef.current += 1;
    lateReplyTimersRef.current.forEach(clearTimeout);
    lateReplyTimersRef.current = [];
  };
  useEffect(() => () => { lateReplyTimersRef.current.forEach(clearTimeout); }, []);
  const scheduleLateReplyCheck = (afterIso, sent, failureId = null) => {
    if (!profile?.id) return;
    lateReplyTimersRef.current.forEach(clearTimeout);
    const epoch = requestEpochRef.current;
    lateReplyTimersRef.current = [15000, 45000, 90000].map((ms) => setTimeout(async () => {
      // Outro pedido começou (ou está em curso): esta leitura já não é desta conversa.
      if (epoch !== requestEpochRef.current || useAppStore.getState().coachLoading) return;
      try {
        const { data: rows } = await supabase
          .from('coach_messages')
          .select('*')
          .eq('user_id', profile.id)
          .eq('role', 'model')
          .gt('created_at', afterIso)
          .order('created_at', { ascending: true })
          .limit(1);
        const row = rows?.[0];
        if (!row || epoch !== requestEpochRef.current) return;
        if ((useAppStore.getState().coachMessages || []).some((m) => m.id === row.id)) return;
        // A resposta chegou: sai a bolha de falha («Reenviar») que a sondagem deixou.
        if (failureId) removeCoachMessage(failureId);
        addCoachMessage({ id: row.id, role: 'assistant', content: row.content, mood: row.mood, live: true });
        await afterPolledReply(row, sent);
      } catch (err) {
        console.warn('[Coach] a leitura tardia da resposta falhou', err);
      }
    }, ms));
  };

  /* Uma proposta pendente de treino aberta SEM cadeia (a sondagem desistiu, a
     página recarregou, abriu-se pelo botão flutuante): vai-se buscar à base a
     linha do modelo com o plan_continuation que prometeu a semana a seguir a
     esta proposta, e monta-se a cadeia na hora («Parte 1 de N»). Independe de a
     linha estar no store. */
  useEffect(() => {
    const plan = activeProposalSheetPlan;
    if (!plan || !profile?.id) return undefined;
    if (planChainRef.current?.parts.some((p) => p.planId === plan.id)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: lookupError } = await supabase
          .from('coach_messages')
          .select('id, role, plan_continuation')
          .eq('user_id', profile.id)
          .eq('role', 'model')
          .not('plan_continuation', 'is', null)
          .order('created_at', { ascending: false })
          .limit(30);
        if (lookupError) console.warn('[Coach] a procura da continuação da proposta falhou', lookupError);
        if (cancelled || planChainRef.current) return;
        const st = useAppStore.getState();
        const messages = [...(data || []), ...(st.coachMessages || []).filter((m) => m.role !== 'user')];
        const rebuilt = rebuildPlanChain(st.coachPlans, messages, st.coachPlanItems);
        if (!rebuilt || !rebuilt.parts.some((p) => p.planId === plan.id)) return;
        setPlanChain({ of: rebuilt.of, parts: rebuilt.parts });
        if (rebuilt.continuation) setPendingContinuation((c) => c || rebuilt.continuation);
      } catch (err) {
        console.warn('[Coach] a procura da continuação da proposta falhou', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProposalSheetPlan?.id, profile?.id]);

  const handleAsyncFallback = async (requestStartedAt, { silent = false, failureText = COACH_ASYNC_FALLBACK_TEXT, retry = null, waitingText = null, chained = false } = {}) => {
    const waitingId = `waiting-${Date.now()}`;
    if (!silent) {
      addCoachMessage({
        id: waitingId,
        role: 'assistant',
        content: waitingText || pickWaitingMessage(getFirstName(profile?.display_name)),
        transient: true,
      });
    }

    // O aviso de espera sai sempre, mesmo se a sondagem lançar uma exceção.
    let modelRow;
    try {
      modelRow = silent
        ? await waitForAsyncReply(requestStartedAt).catch(() => null)
        : await waitForAsyncReply(requestStartedAt);
    } finally {
      if (!silent) removeCoachMessage(waitingId);
    }

    if (modelRow) {
      // A resposta do mapa da época chegou por sondagem: sem cup_map_shown, mas
      // foi o turno do mapa — marca-se (uma resposta de erro não conta).
      if (cupMapPendingRef.current && !modelRow.is_error) {
        markCupMapDone(cupMapPendingRef.current);
        cupMapPendingRef.current = null;
      }
      addCoachMessage({
        id: modelRow.id, role: 'assistant', content: modelRow.content, mood: modelRow.mood, live: true,
        ...(modelRow.is_error && retry ? retry : {}),
      });
      // As da conversa anterior, que a silenciosa deixou ficar.
      if (silent) setCoachSuggestions([]);
      // Chegados por sondagem, não temos os flags plan_proposed/goal_proposed/
      // goals_updated do payload síncrono (nem as sugestões rápidas, que só
      // vêm nesse payload e não ficam persistidas) — por isso verificamos
      // sempre se apareceu algo pendente, em vez de confiar num flag que
      // aqui não existe. A resposta já está no ecrã: se recarregar falhar,
      // o que faltar entra no próximo carregamento — não é uma falha da
      // conversa, e não pode impedir quem chama de destravar o campo.
      try {
        await afterPolledReply(modelRow, inflightContinuationRef.current);
      } catch (err) {
        console.warn('[Coach] recarregar depois da resposta falhou', err);
      }
    } else if (!silent && !chained) {
      // A sondagem desistiu (o lock pareceu livre, a rede caiu…), mas a resposta
      // pode ainda chegar: volta a ler mais tarde (caso pssmartins, 25/10).
      const failureId = (Date.now() + 1).toString();
      scheduleLateReplyCheck(requestStartedAt, inflightContinuationRef.current, failureId);
      addCoachMessage({
        id: failureId,
        role: 'assistant',
        content: failureText,
        transient: true,
        ...(retry || {}),
      });
    }
    if (!silent && !chained) setCoachLoading(false);
    return modelRow;
  };

  // Chamado quando o servidor respondeu já com erro (4xx/5xx). Ao contrário
  // de handleAsyncFallback, NÃO há nada em curso para esperar: informa já e
  // liberta o campo para o atleta poder tentar de novo de imediato.
  // A falha de REDE (FunctionsFetchError) já não vem para aqui: a ligação
  // pode cair a meio, com o pedido já no servidor. Incidente 2026-10-11: a
  // rede caiu 6 s depois do envio, a app disse "A rede falhou" e destravou o
  // campo, a atleta reenviou e levou o 409 `busy` — e a resposta, gravada
  // 61 s depois, só apareceu quando voltou à app, uma hora mais tarde.
  // `message` opcional: o texto QUE ELA disse quando o servidor respondeu
  // (mesmo com erro — 409 `busy`, 502, 503...), para mostrar tal e qual em
  // vez de o esconder atrás de um aviso genérico (ação P.12: antes só o 409
  // `busy` mostrava o texto do servidor; qualquer outra resposta HTTP, por
  // exemplo "Estou com muitos pedidos. Dá-me uns minutos.", ficava presa
  // atrás deste aviso). Sem `message` (um erro do gateway, que não traz
  // frase dela) fica o genérico: nem sempre há "uma mensagem" —
  // um pedido por iniciativa dela (balanço, plano) não é escrito pelo
  // atleta, por isso o texto não presume isso.
  // `messageId`: a frase já gravada no histórico pelo coach-chat — com o id
  // da BD não se repete ao recarregar; sem ele, só existe no ecrã.
  // `retry`: ver handleSend.
  const handleImmediateFailure = (message, messageId, retry) => {
    addCoachMessage({
      id: messageId || (Date.now() + 1).toString(),
      role: 'assistant',
      content: message || COACH_IMMEDIATE_FAILURE_TEXT,
      ...(messageId ? {} : { transient: true }),
      ...(retry || {}),
    });
    setCoachLoading(false);
  };

  /* `extras`: campos que vão para o corpo do pedido a acompanhar esta
     mensagem — o `badgeContext` (ver badgeContextPayload) e o
     `noteDiscussion` (a nota da memória a mudar). Fica de
     fora da mensagem de propósito: o que o atleta escreve tem de ser o que
     ele diria, e o contexto é do servidor. */
  const handleSelectPhotos = async (e) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files?.length) return;
    // Enquanto comprime, anexar e enviar ficam parados: duas seleções seguidas apagavam-se uma à outra.
    setPhotoBusy(true);
    setPhotoNote('A preparar a foto…');
    let next = photos;
    let skipped = 0;
    try {
      ({ photos: next, skipped } = await addChatPhotos(photos, files, compressImage));
    } finally {
      setPhotoBusy(false);
    }
    setPhotos(next);
    setPhotoNote(skipped > 0
      ? `Só cabem ${MAX_CHAT_PHOTOS} fotos por mensagem, ou algum ficheiro não era uma imagem.`
      : `${next.length === 1 ? '1 foto pronta' : `${next.length} fotos prontas`} a enviar.`);
  };

  const handleSend = async (textToSend, extras) => {
    // Só o envio da caixa de texto leva as fotos; as frases automáticas (decisões de plano, etc.) não.
    const fromComposer = typeof textToSend !== 'string';
    const sendPhotos = fromComposer ? photos : [];
    const typed = (fromComposer ? inputStr : textToSend).trim();
    // Um "Reenviar" de só fotos volta com as imagens nos extras (retryExtras).
    const retriedImages = Array.isArray(extras?.images) && extras.images.length > 0;
    if ((!typed && !sendPhotos.length && !retriedImages) || coachLoading) return;
    // Só fotos: o servidor responde a "olha para estas fotos"; aqui a bolha mostra só a linha das fotos.
    const text = typed;
    if (sendPhotos.length) {
      extras = { ...(extras && typeof extras === 'object' ? extras : null), images: toPayloadImages(sendPhotos) };
      setPhotos([]);
      setPhotoNote('');
    }
    const nPhotos = Array.isArray(extras?.images) ? extras.images.length : 0;

    setInputStr('');
    clearPersistedFormDraft(COACH_CHAT_DRAFT_KEY);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add user message to state
    const localUserId = Date.now().toString();
    addCoachMessage({ id: localUserId, role: 'user', content: (text + photoMarker(nPhotos)).trim() });
    setCoachLoading(true);
    setCoachSuggestions([]);

    // A pergunta dele fica à vista, mas só sai quando a conversa silenciosa
    // dela acabar (silentRunRef) — e a hora do pedido conta a partir daí,
    // para a sondagem não tomar a mensagem dela pela resposta a ele.
    await afterSilentRun();
    await sendUserMessage(text, extras, localUserId);
  };

  /* O pedido de handleSend, com a bolha do atleta já no ecrã.
     `retry` vai em toda a bolha de falha que fecha este pedido: é o que o
     botão "Reenviar" (no fim da conversa) volta a mandar, para o atleta não
     ter de escrever tudo outra vez. Se a pergunta afinal já tinha resposta, o
     servidor devolve essa (`duplicate`) em vez de responder duas vezes.
     `afterBusy`: já é o reenvio automático a seguir a um 409 `busy`. */
  const sendUserMessage = async (text, extras, localUserId, { afterBusy = false } = {}) => {
    cancelLateReplyChecks();
    const requestStartedAt = new Date().toISOString();
    const retry = { retryText: text, ...(extras && typeof extras === 'object' ? { retryExtras: extras } : null) };

    try {
      // Injeta os insights biométricos ativos no payload para a Carol
      // ter contexto dos alertas que o atleta viu/ignorou/entendeu.
      const allInsights = detectCoachInsights(
        { runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes }, profile
      );
      const insightsContext = allInsights.map(i => ({
        title: i.title,
        message: i.message,
        metric: i.metric,
        value: i.value,
        state: insightStateForCarol(i.id, { states: insightStates, snoozes: insightSnoozes, today: todayISO() }),
      }));

      const payload = {
        message: text,
        userData: profile || {},
        activeInsights: insightsContext,
        ...(extras && typeof extras === 'object' ? extras : null),
      };

      const { data, error, isTimeout, isNetwork, isBusy, serverText, serverMessageId } = await invokeEdgeFunctionWithTimeout('coach-chat', {
        body: JSON.stringify(payload)
      });

      if (error) {
        if (isBusy && !afterBusy) {
          // Ela ainda está a responder à mensagem anterior, e esta não foi
          // gravada: espera essa resposta, mostra-a e manda esta a seguir —
          // em vez de devolver ao atleta o "manda outra vez".
          // Uma exceção nesta espera (a sondagem, ou recarregar planos e
          // objetivos depois da resposta anterior) não pode engolir a
          // mensagem dele: o reenvio sai na mesma (revisão pré-deploy de
          // 3a00a815 — antes caía no catch de baixo e acabava sem reenvio,
          // sem falha e sem "Reenviar").
          try {
            await handleAsyncFallback(requestStartedAt, {
              waitingText: busyWaitingMessage(getFirstName(profile?.display_name)),
              chained: true,
            });
          } catch (err) {
            console.warn('[Coach] a espera depois do 409 falhou; reenvia na mesma', err);
          }
          await sendUserMessage(text, extras, localUserId, { afterBusy: true });
        } else if (isTimeout || isNetwork) {
          // A rede pode ter caído com o pedido já no servidor (ver
          // handleImmediateFailure): espera-se pela resposta como num
          // timeout. Se ele afinal não chegou lá, o servidor não está ocupado
          // e a sondagem desiste em segundos; sem rede nenhuma, desiste ao
          // fim de ~12 s (waitForAsyncReply).
          await handleAsyncFallback(requestStartedAt, {
            failureText: isTimeout ? COACH_ASYNC_FALLBACK_TEXT : COACH_IMMEDIATE_FAILURE_TEXT,
            retry,
          });
        } else {
          // O servidor respondeu com uma frase dela (ação P.12): mostra-a,
          // não só no caso 409 busy. Sem frase — um erro do gateway que só
          // traz o texto em inglês da supabase-js — cai no aviso genérico.
          handleImmediateFailure(serverText || undefined, serverMessageId, retry);
        }
        return;
      }

      // A função devolve a resposta em model_message.content — `data.reply`
      // nunca existiu no payload, o que fazia cair sempre no texto de
      // fallback e esconder a resposta real do coach.
      // Pedido repetido (o servidor devolveu a resposta que já tinha dado):
      // a pergunta não voltou a ser gravada, por isso a bolha repetida sai.
      if (data?.duplicate) removeCoachMessage(localUserId);
      // O id da BD, quando vem: se esta resposta já estiver no ecrã (chegou
      // num recarregamento), o store não a mostra outra vez.
      addCoachMessage({
        id: data?.model_message?.id || (Date.now() + 1).toString(),
        role: 'assistant',
        content: data?.model_message?.content || COACH_EMPTY_REPLY_TEXT,
        mood: data?.model_message?.mood,
        live: true,
        ...(data?.model_message?.content ? null : retry),
      });
      if (Array.isArray(data?.suggestions)) {
        setCoachSuggestions(data.suggestions);
      }
      // O coach criou um plano nesta resposta — recarrega os itens para a
      // proposta aparecer no Início sem ser preciso refrescar a página.
      if (data?.plan_proposed) {
        const freshPlans = await reloadCoachPlans();
        if (freshPlans && freshPlans.length > 0) {
          openProposalSheet(freshPlans, { continuation: data?.plan_continuation });
        }
      }
      if (data?.goal_proposed) {
        const freshGoals = await reloadCoachGoalProposals();
        if (freshGoals && freshGoals.length > 0) {
          const pending = freshGoals.filter(g => g.status === 'proposto');
          if (pending.length > 0) setActiveGoalProposal(pending[0]);
        }
      }
      await refreshAfterTurn(data);
      queuePlanContinuation(data, { fromAthlete: true });
      // O atleta respondeu e a Carol já falou: larga a revisão retida (balanço «perto»).
      setPendingTargetsReview((r) => (r?.hold ? { ...r, hold: false } : r));
      setCoachLoading(false);
    } catch (err) {
      // Se a própria espera rebentar (recarregar planos/objetivos depois de
      // a resposta chegar), acaba aqui: com o campo destravado e o
      // "Reenviar", nunca com o coachLoading preso.
      try {
        await handleAsyncFallback(requestStartedAt, { retry });
      } catch (fallbackErr) {
        console.warn('[Coach] a espera pela resposta falhou', fallbackErr);
        handleImmediateFailure(undefined, undefined, retry);
      }
    }
  };

  // A continuação do plano longo: com o chat livre, manda a parte seguinte
  // (sem texto do atleta). Limpa-se ANTES de enviar: se falhar, não insiste —
  // a Carol já disse o que vem e o atleta pode pedir "e a semana seguinte?".
  useEffect(() => {
    if (!pendingContinuation?.armed || coachLoading) return;
    const { from, to, part, of, until } = pendingContinuation;
    const sent = { from, to, part, of, ...(until ? { until } : null) };
    setPendingContinuation(null);
    continuationRunsRef.current += 1;
    inflightContinuationRef.current = sent;
    sendCoachInitiatedPayload({
      message: '',
      // `until` (o dia da prova) volta tal como veio no turno da parte.
      plan_continuation: sent,
      userData: profile || {},
      activeInsights: activeInsightsPayload(),
    }).finally(() => { inflightContinuationRef.current = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingContinuation, coachLoading]);

  // A revisão dos objetivos depois de um plano aceite (ver pendingTargetsReview).
  useEffect(() => {
    if (!pendingTargetsReview || pendingTargetsReview.hold || coachLoading) return;
    const { hold, ...review } = pendingTargetsReview;
    setPendingTargetsReview(null);
    sendCoachInitiatedPayload({
      message: '',
      targets_review: review,
      userData: profile || {},
      activeInsights: activeInsightsPayload(),
    }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTargetsReview, coachLoading]);

  // O botão "Reenviar": só na última bolha, e só se for uma falha a uma
  // mensagem do atleta (`retryText`, ver sendUserMessage) — depois de outra
  // mensagem qualquer, já não é "a última" que falhou.
  const lastVisibleMsg = visibleMessages[visibleMessages.length - 1];
  const retryMsg = lastVisibleMsg?.retryText || lastVisibleMsg?.retryExtras?.images?.length ? lastVisibleMsg : null;

  // A cara dela no chat (CAROL.md §4). Enquanto pensa ou escreve, "a pensar";
  // depois, a emoção do que acabou de dizer — a que o modelo escolheu junto
  // com o texto, ou a que o texto sugere nas mensagens antigas (messageMood).
  // Ao fim de umas horas volta à neutra: quem abre o chat no dia seguinte não
  // é recebido com a preocupação de ontem.
  const lastCarolMsg = [...visibleMessages].reverse().find((m) => m.role !== 'user');
  const lastCarolAt = lastCarolMsg ? messageTime(lastCarolMsg) : null;
  const headerMood = coachLoading || typingActive
    ? 'thinking'
    : lastCarolMsg && (lastCarolAt == null || Date.now() - lastCarolAt < HEADER_MOOD_TTL_MS)
      ? carolMoodOf(lastCarolMsg)
      : 'neutral';

  // O ecrã vazio conforme o que já existe: "uma meia maratona" fixa saía a
  // quem tinha marcado um 10 km, e "ou a prova" a quem não tinha prova
  // nenhuma; e depois dos seis ecrãs do arranque, onde ela já se
  // apresentou, não volta a dizer quem é (revisão de 2026-09-26).
  const hoje = todayISO();
  const temPlanoAceite = (coachPlans || []).some((p) => p?.status === 'aceite' && String(p.period_end || '').slice(0, 10) >= hoje);
  const temProva = (raceEvents || []).some((e) => e.status !== 'concluida' && e.date >= hoje);
  const temRegistos = hasAnyRecord({ runs, meals, gymSessions, bodyAssessments });
  const jaSeApresentou = profile?.onboarding_done === true || isOnboardingDoneLocally(profile?.id);
  const emptyStateText = !temRegistos
    ? 'Ainda não tenho registos teus. Diz-me o que queres preparar e começamos por aí.'
    : `Tenho os teus dados de hoje e o teu perfil à frente. Pergunta-me sobre ${temProva ? 'o treino, a alimentação ou a prova' : 'o treino ou a alimentação'}.`;

  const defaultSuggestions = [
    'Como está a minha nutrição hoje?',
    temPlanoAceite
      ? 'Como está a correr o meu plano?'
      : temProva ? 'Cria-me um plano para a minha prova' : 'Cria-me um plano de treino',
    'Que alimentos devo comer antes de treinar?'
  ];

  return (
    <div className="flex flex-col h-full fade-in">
      {/* Header section */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Ponto 9, animação 7: o halo só respira quando há assunto por
              resolver — três ciclos e para. */}
          <CoachAvatar size={48} radius={15} mood={headerMood} breathing={hasPendingTopic} draw />
          <div>
            <h2 className="text-base font-bold leading-none tracking-tight" style={{ color: 'var(--coach-soft)' }}>Carol</h2>
            <p className="text-[11px] leading-none mt-1" style={{ color: 'var(--text-4)' }}>a tua treinadora</p>
          </div>
        </div>
      </div>



      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-2 pr-1 no-scrollbar">
        {/* Empty State */}
        {coachMessages.length === 0 && !coachLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
            <CoachAvatar size={64} radius={24} className="mb-4" />
            <h3 className="text-sm font-bold text-white mb-1">{jaSeApresentou ? 'Estou aqui.' : 'Sou a Carol, a tua treinadora.'}</h3>
            <p className="text-xs text-[var(--text-3)] leading-relaxed mb-5 max-w-xs">
              {emptyStateText}
            </p>
            <div className="space-y-2 w-full max-w-xs text-left">
              {defaultSuggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(s)}
                  className="w-full min-h-[44px] text-left text-xs rounded-xl px-3.5 py-2.5 transition font-medium"
                  style={{
                    color: 'var(--mod-coach-to)',
                    border: '1px solid color-mix(in srgb, var(--mod-coach-to) 30%, transparent)',
                    background: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Load More Button */}
        {hasMoreMessages && (
          <div className="flex justify-center mb-4 mt-2">
            <button
              onClick={() => setHoursToShow(prev => prev + 24)}
              className="tap-h-44 text-xs rounded-xl px-4 py-2.5 transition font-medium"
              style={{
                color: 'var(--mod-coach-to)',
                border: '1px solid color-mix(in srgb, var(--mod-coach-to) 30%, transparent)',
                background: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)'
              }}
            >
              Carregar mensagens anteriores
            </button>
          </div>
        )}

        {/* Bolhas — CAROL.md §5: uma ideia por bolha. Uma mensagem dela é UM
            registo em coach_messages; a divisão em 2-3 bolhas é só de
            apresentação (splitIntoBubbles), por isso o histórico recarregado
            lê-se igual ao que chegou ao vivo. As novas entram uma bolha de
            cada vez, precedidas de "a escrever…" (ver revealMessage). */}
        {visibleMessages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          let msgDate = null;
          if (msg.created_at) {
            msgDate = new Date(msg.created_at);
          } else if (msg.id && !isNaN(msg.id)) {
            msgDate = new Date(parseInt(msg.id, 10));
          }
          const timeStr = msgDate && !isNaN(msgDate) ? format(msgDate, "dd MMM 'às' HH:mm", { locale: pt }) : '';
          // Ancorada por id (waiting-*) em vez do texto — o conteúdo varia
          // entre reformulações do aviso de demora (ver WAITING_MESSAGES).
          const isWaiting = typeof msg.id === 'string' && msg.id.startsWith('waiting-');
          const chunks = isUser ? [msg.content] : splitIntoBubbles(msg.content);
          const shown = reveal[msg.id] === undefined ? chunks.length : Math.min(reveal[msg.id], chunks.length);
          if (shown === 0) return null;

          const bubbles = (
            <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start min-w-0 flex-1'}`}>
              {chunks.slice(0, shown).map((chunk, cIdx) => (
                <div
                  key={cIdx}
                  data-testid={isWaiting ? 'coach-waiting-message' : undefined}
                  className={`${isUser ? 'max-w-[85%]' : 'max-w-[92%]'} px-[15px] py-[13px] text-[13px] leading-normal ${isUser ? 'coach-bubble-user font-semibold' : 'coach-bubble-model'}`}
                >
                  {isUser ? chunk : <CoachText>{chunk}</CoachText>}
                </div>
              ))}
              {timeStr && shown === chunks.length && (
                <span className="text-[11px] mt-0.5 mx-1 px-1" style={{ color: 'var(--text-muted)' }}>
                  {timeStr}
                </span>
              )}
            </div>
          );
          if (isUser) return <React.Fragment key={idx}>{bubbles}</React.Fragment>;
          // A cara dela ao lado do que diz, com a emoção dessa mensagem — é
          // aí que o atleta está a olhar. Só a mais recente pisca. 36 px: a
          // 24 as emoções confundiam-se (feedback de produto 2026-09-24).
          return (
            <div key={idx} className="flex items-start gap-2" data-testid="coach-message-carol">
              <CoachAvatar
                size={36}
                mood={isWaiting ? 'thinking' : carolMoodOf(msg)}
                alive={msg === lastCarolMsg}
                style={{ marginTop: 2 }}
              />
              {bubbles}
            </div>
          );
        })}

        {/* "a escrever…" — CAROL.md §5: precede cada mensagem dela, 600 a
            900 ms; some com prefers-reduced-motion (as bolhas entram logo). */}
        {(coachLoading || typingActive) && (
          <div className="flex justify-start items-start gap-2" data-testid="coach-typing">
            <CoachAvatar size={36} talking style={{ marginTop: 2 }} />
            <div className="coach-bubble-model px-[15px] py-3 flex items-center gap-2">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--coach-soft)' }}>a escrever…</span>
              <span className="flex items-center gap-1" aria-hidden="true">
                <span className="coach-typing-dot" />
                <span className="coach-typing-dot" style={{ animationDelay: '150ms' }} />
                <span className="coach-typing-dot" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        {/* Reenviar a mensagem que falhou, sem a escrever outra vez. */}
        {!coachLoading && !typingActive && retryMsg && (
          <div className="flex pl-11">
            <button
              type="button"
              data-testid="coach-retry"
              onClick={() => handleSend(retryMsg.retryText, retryMsg.retryExtras)}
              className="min-h-[44px] inline-flex items-center gap-2 text-xs rounded-xl px-3.5 py-2 transition font-semibold"
              style={{
                color: 'var(--mod-coach-to)',
                border: '1px solid color-mix(in srgb, var(--mod-coach-to) 30%, transparent)',
                background: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)'
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reenviar a mensagem
            </button>
          </div>
        )}

        {/* Contextual Suggestions after response */}
        {!coachLoading && !typingActive && coachSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {coachSuggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(s)}
                className="min-h-[44px] text-left text-xs rounded-xl px-3 py-2 transition font-medium"
                style={{
                  color: 'var(--mod-coach-to)',
                  border: '1px solid color-mix(in srgb, var(--mod-coach-to) 30%, transparent)',
                  background: 'color-mix(in srgb, var(--mod-coach-to) 5%, transparent)'
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Input Box Footer */}
      {/* paddingBottom: --keyboard-inset (utils/softKeyboard.js, bug #56,
          2026-10-05) sobe a caixa acima do teclado no Safari iOS, onde ele
          tapa o layout viewport. 0px no Chrome Android (resizes-content) e
          sem teclado — por isso nada muda aí. */}
      <div className="shrink-0 border-t border-[var(--border-glass)] pt-3 mt-1 relative" style={{ paddingBottom: 'var(--keyboard-inset, 0px)' }} data-testid="coach-composer">
        {/* Sugestões pendentes (Planos / Objetivos) — botão único: as duas
            propostas podem coexistir e abrem sempre a MESMA persiana, para
            o atleta decidir ambas sem trocar de ecrã. */}
        {(pendingPlans.length > 0 || pendingGoalProposals.length > 0) && (
          <div className="hide-when-keyboard fixed right-4 z-50 flex flex-col gap-2 items-end" style={{ bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
            <button
              type="button"
              // disabled={coachLoading} é o único guard aqui — impede mesmo o
              // clique de acontecer, não só o efeito. Necessário porque aceitar
              // objetivos dispara um handleSend automático (ver
              // handleRespondGoal), e handleSend descarta silenciosamente
              // qualquer envio se coachLoading já for true; sem isto, a
              // persiana continuaria a abrir mas a mensagem de seguimento
              // perdia-se.
              disabled={coachLoading}
              onClick={() => {
                // Com uma cadeia viva, abre na parte mais recente.
                const latestId = planChain?.parts?.length ? [...planChain.parts].sort((a, b) => b.part - a.part)[0].planId : null;
                setActiveProposalSheetPlan(pendingPlans.find((p) => p.id === latestId) || pendingPlans[0] || null);
                setActiveGoalProposal(pendingGoalProposals[0] || null);
              }}
              className="text-[var(--coach-ink)] font-bold text-xs rounded-xl px-4 py-2.5 min-h-[44px] shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-2 transition active:scale-95 coach-nudge hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--grad-coach-legible)' }}
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {pendingGoalProposals.length > 0 && pendingPlans.length > 0
                  ? `Propostas por rever (${pendingGoalProposals.length + pendingPlans.length})`
                  : pendingGoalProposals.length > 0
                    ? `Objetivos por rever (${pendingGoalProposals.length})`
                    : `Proposta de plano por rever (${pendingPlans.length})`}
              </span>
            </button>
          </div>
        )}
        {photos.length > 0 && (
          <div className="flex gap-2 mb-2 px-1" data-testid="coach-photos">
            {photos.map((p, i) => (
              <div key={i} className="relative w-16 h-16 shrink-0">
                <img src={p.dataUrl} alt={`Foto ${i + 1} por enviar`} className="w-full h-full object-cover rounded-xl border border-[var(--border-glass)]" />
                <button
                  type="button"
                  aria-label={`Tirar a foto ${i + 1}`}
                  disabled={photoBusy}
                  onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-2 -right-2 w-11 h-11 flex items-center justify-center"
                >
                  <span className="bg-white/90 text-slate-800 border border-[var(--border-glass)] rounded-full p-1 shadow-sm flex"><X size={12} /></span>
                </button>
              </div>
            ))}
          </div>
        )}
        {photoNote && <p role="status" className="text-[12px] text-[var(--text-2)] mb-2 px-1">{photoNote}</p>}
        <div className="flex gap-2 items-end">
          {photos.length < MAX_CHAT_PHOTOS && (
            <label
              className={`shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center border border-[var(--border-glass)] bg-[var(--bg-sheet)] text-[var(--text-3)] transition focus-within:ring-2 focus-within:ring-[var(--mod-coach-to)] ${coachLoading ? 'opacity-50' : 'cursor-pointer active:scale-95'}`}
            >
              <input type="file" accept="image/*" multiple aria-label="Anexar foto (embalagem ou comida)" disabled={coachLoading || photoBusy} className="sr-only" onChange={handleSelectPhotos} data-testid="coach-photo-input" />
              <ImagePlus className="w-5 h-5" />
            </label>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputStr}
            onChange={handleInputChange}
            // Enter faz sempre quebra de linha, nunca envia — só o botão
            // envia. Pedido explícito do utilizador 2026-08-31: uma
            // mensagem mais longa (várias linhas) enviava-se a meio sem
            // querer ao carregar em Enter para mudar de linha.
            aria-label="Mensagem para a Carol"
            placeholder="Escreve a tua pergunta..."
            className="flex-1 bg-[var(--bg-sheet)] border border-[var(--border-glass)] rounded-2xl px-4 py-3 text-base text-[var(--text-3)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--mod-coach-to)] resize-none leading-tight shadow-sm"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={(!inputStr.trim() && !photos.length) || coachLoading || photoBusy}
            aria-label="Enviar pergunta à Carol"
            className={`shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center transition active:scale-95 ${
              coachLoading || (!inputStr.trim() && !photos.length)
                ? 'bg-[var(--surface-strong)] text-[var(--text-3)] cursor-not-allowed'
                : 'text-[var(--coach-ink)] font-bold'
            }`}
            style={{
              background: (!inputStr.trim() && !photos.length) || coachLoading ? undefined : 'var(--mod-coach-to)'
            }}
          >
            {coachLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>


      {/* Modal Bottom Sheet (Persiana de baixo para cima) — Objetivos e/ou
          Plano, o que estiver pendente. Ver comentário no componente sobre
          porque as duas propostas partilham a mesma persiana. */}
      {(activeProposalSheetPlan || activeGoalProposal) && (
        <PlanProposalBottomSheet
          plan={activeProposalSheetPlan}
          items={coachPlanItems}
          onRespondPlan={handleRespond}
          partInfo={(() => {
            const mine = planChain?.parts.find((p) => p.planId === activeProposalSheetPlan?.id);
            if (!mine || !activeProposalSheetPlan) return null;
            const c = mine.part < planChain.of ? continuationFor(activeProposalSheetPlan) : null;
            const last = !c;
            const days = c ? Math.round((Date.parse(`${c.to}T00:00:00Z`) - Date.parse(`${c.from}T00:00:00Z`)) / 86400000) + 1 : null;
            return { part: mine.part, of: planChain.of, last, nextDays: days, from: activeProposalSheetPlan.period_start, to: activeProposalSheetPlan.period_end };
          })()}
          goalProposal={activeGoalProposal}
          profile={profile}
          onRespondGoal={handleRespondGoal}
          onClose={handleCloseProposalsSheet}
          raceEvents={raceEvents}
          bodyAssessments={bodyAssessments}
        />
      )}
      {planStart && <RecordConfirmation label="Plano aceite" first={planStart} onDone={() => setPlanStart(null)} />}
    </div>
  );
}
