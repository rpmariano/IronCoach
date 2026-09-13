import React, { useState, useRef, useEffect } from 'react';
import { useAppStore, selectCoachHasPendingTopic } from '../../store';
import { invokeEdgeFunctionWithTimeout, supabase } from '../../lib/supabase';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import '../Home/WeeklyPlanCard.css';
import { useToast } from '../shared/ToastProvider';
import { detectCoachInsights } from '../../utils/biEngine';
import CoachText from '../shared/CoachText';
import PlanProposalBottomSheet from './PlanProposalBottomSheet';
import CoachAvatar from './CoachAvatar';
import { splitIntoBubbles, typingDelayFor, prefersReducedMotion, BUBBLE_GAP_MS } from '../../utils/coachBubbles';
import { pickProactiveTrigger, wasProactiveSent, markProactiveSent } from '../../utils/coachProactive';
import { markDivergenceHandled, MAX_DIVERGENCE_TEXTS } from '../../utils/planDivergence';
import { usePersistedFormDraft, restorePersistedFormDraft, clearPersistedFormDraft } from '../../utils/formDraftPersistence';

// Chave única — o chat da Carol é uma conversa só, não um registo por id
// como os formulários (RunAgenda, MealRegistration, ...), por isso não há
// aqui um sufixo de id a acrescentar.
const COACH_CHAT_DRAFT_KEY = 'ironcoach:carol-chat-rascunho';

// Quando invokeEdgeFunctionWithTimeout falha (rede ou o timeout de 45s do
// cliente), não sabemos se o pedido chegou ou não a ser processado no
// servidor — um incidente investigado em 2026-08-20 mostrou que SIM: o
// coach-chat pode legitimamente demorar mais de 45s quando encadeia várias
// rondas de function-calling (até 4 rondas × 2 tentativas × 40s cada), só a
// resposta é que não chegava a tempo ao cliente. Mostrar logo um erro
// definitivo e destravar o campo levava a reformular a mesma pergunta
// enquanto o pedido original ainda estava em curso, gerando duas respostas
// (e duas propostas de plano) concorrentes para a mesma pergunta. Por isso
// aguardamos de forma assíncrona em vez de desistir logo — ver
// handleAsyncFallback abaixo.
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_MS = 180000; // cobre o pior caso de latência do coach-chat

// Mesma extração que firstNameOf em coach-chat/index.ts — duplicada porque
// vive noutro runtime (cliente vs. Edge Function), não porque a lógica seja
// diferente. Usada para tratar o atleta pelo nome no aviso de demora abaixo.
function getFirstName(displayName) {
  if (!displayName || typeof displayName !== 'string') return null;
  const trimmed = displayName.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : null;
}

// Variantes do aviso de demora (handleAsyncFallback) — mesmo espírito do
// "Banco de Humor" do system prompt da Carol: leve, situacional, nunca
// sempre a mesma frase (antes era só a dos agachamentos, repetida em toda
// a demora de resposta). Escolhida ao acaso a cada aviso. Na voz dela
// (CAROL.md): sem emoji, sem exclamação, e nunca a pedir desculpa pelo
// sistema — diz o que se passa e o que fazer entretanto.
const WAITING_MESSAGES = [
  (name) => `${name}, isto está a demorar mais do que o costume. Aproveita para fazer uns agachamentos enquanto termino.`,
  (name) => `${name}, a ligação está hoje ao ritmo de um treino regenerativo. Alonga os gémeos enquanto acabo de pensar.`,
  (name) => `Um segundo, ${name}. Estou a rever os teus dados com mais calma do que o habitual. Bebe água entretanto.`,
  (name) => `${name}, isto está a demorar tanto como o último quilómetro de um treino longo. Já não falta muito.`,
  (name) => `${name}, hoje até o servidor precisou de um dia de descanso ativo. A resposta vem a caminho.`,
  (name) => `${name}, estou a processar tudo com mais cuidado do que o costume. Faz uma prancha de 30 segundos enquanto esperas.`,
];

function pickWaitingMessage(firstName) {
  const name = firstName ?? 'atleta';
  const variant = WAITING_MESSAGES[Math.floor(Math.random() * WAITING_MESSAGES.length)];
  return variant(name);
}

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
    runs, gymSessions, meals, bodyAssessments, raceEvents, insightStates, shoes
  } = useAppStore();
  const { showToast } = useToast();
  // Liga o halo do avatar (ponto 9, animação 7).
  const hasPendingTopic = useAppStore(selectCoachHasPendingTopic);

  const pendingPlans = (coachPlans || []).filter(p => p.status === 'proposto');
  const pendingGoalProposals = coachGoalProposals || [];

  const [activeProposalSheetPlan, setActiveProposalSheetPlan] = useState(null);
  const [activeGoalProposal, setActiveGoalProposal] = useState(null);

  useEffect(() => {
    reloadCoachGoalProposals();
  }, []);

  // Motor partilhado das conversas que a própria Carol inicia sem o atleta
  // escrever nada (handleProactiveIntervention, handleAdaptPlanCheckin e a
  // mensagem proativa ao abrir o chat, abaixo) — só o payload muda.
  // `silent`: numa falha imediata não deixa bolha nenhuma. É para a mensagem
  // proativa: o atleta não enviou nada, e "A tua mensagem não saiu" a
  // aparecer sozinha ao abrir o chat era exatamente o incidente de
  // 2026-09-12 (o servidor recusou com 409 `busy` a segunda de duas chamadas
  // gémeas ao montar, e o cliente anunciou uma falha de rede que não houve).
  const sendCoachInitiatedPayload = async (payload, { silent = false } = {}) => {
    if (coachLoading) return null;
    setCoachLoading(true);
    setCoachSuggestions([]);
    const requestStartedAt = new Date().toISOString();

    try {
      const { data, error, isTimeout, isBusy } = await invokeEdgeFunctionWithTimeout('coach-chat', {
        body: JSON.stringify(payload)
      });

      if (error) {
        if (isTimeout) {
          await handleAsyncFallback(requestStartedAt);
        } else if (silent) {
          setCoachLoading(false);
        } else {
          handleImmediateFailure(isBusy ? error : undefined);
        }
        return null;
      }

      // live: entra bolha a bolha, precedida de "a escrever…" (ver revealMessage).
      if (data?.model_message?.content) {
        addCoachMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.model_message.content,
          live: true,
        });
      }
      if (Array.isArray(data?.suggestions)) {
        setCoachSuggestions(data.suggestions);
      }
      if (data?.plan_proposed) {
        const freshPlans = await reloadCoachPlans();
        if (freshPlans && freshPlans.length > 0) {
          const pending = freshPlans.filter(p => p.status === 'proposto');
          if (pending.length > 0) setActiveProposalSheetPlan(pending[0]);
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
      setCoachLoading(false);
      return data;
    } catch (err) {
      await handleAsyncFallback(requestStartedAt);
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
      state: insightStates[i.id] === 'understood'
        ? 'Entendido (resolvido pelo atleta)'
        : insightStates[i.id] === 'ignored'
          ? 'Ativo (ignorado temporariamente pelo atleta)'
          : 'Ativo (pendente)'
    }));
  };

  const handleProactiveIntervention = (intentData) => sendCoachInitiatedPayload({
    message: '',
    is_intervention_start: true,
    intervention_details: intentData?.reason ? `Motivo/Análise: "${intentData.reason}"` : null,
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
  });

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
  };

  const handleAdaptPlanCheckin = ({ divergence = null, signature = null } = {}) => sendCoachInitiatedPayload({
    message: '',
    is_plan_checkin: true,
    ...(divergence?.length ? { plan_divergence: divergence.slice(0, MAX_DIVERGENCE_TEXTS) } : {}),
    userData: profile || {},
    activeInsights: activeInsightsPayload(),
  }).then((data) => {
    if (data && signature) markDivergenceHandled(profile?.id, signature);
    return data;
  });

  useEffect(() => {
    if (coachIntent && coachIntent.kind === 'proactive_intervention') {
      setCoachIntent(null);
      handleProactiveIntervention(coachIntent);
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
    // Vindo de Perfil > Memória do Coach: o atleta não edita por cima do
    // que a Carol escreveu — pede-lhe que altere, e a conversa abre já
    // centrada nessa nota para ele explicar o que está errado.
    if (coachIntent && coachIntent.kind === 'discuss_note') {
      const { note } = coachIntent;
      setCoachIntent(null);
      handleSend(
        `Sobre o que tens registado na tua memória: "${note}". Queria mudar isto — ` +
        `pergunta-me o que precisares e atualiza a nota quando estivermos de acordo.`,
      );
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
    const candidate = pickProactiveTrigger({ runs, meals, gymSessions, bodyAssessments, raceEvents, profile });
    if (!candidate || wasProactiveSent(profile?.id, candidate)) return;
    proactiveAttempted.current = true;
    sendCoachInitiatedPayload({
      message: '',
      proactive_trigger: candidate.trigger,
      proactive_details: candidate.details,
      // Só no balanço da prova com a corrida registada: o veredicto calculado
      // pela app (utils/raceOutcome.js), para o servidor escrever o balanço
      // com os números certos — superado / perto / aquém.
      ...(candidate.raceOutcome ? { race_outcome: candidate.raceOutcome } : {}),
      userData: profile || {},
      activeInsights: activeInsightsPayload(),
    }, { silent: true }).then((data) => {
      if (data && !data.skipped) markProactiveSent(profile?.id, candidate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha só a secção respondida — se a outra proposta (objetivos/plano)
  // ainda estiver pendente, a persiana continua aberta a mostrá-la (ver
  // PlanProposalBottomSheet, que já não fecha a persiana sozinho ao
  // responder a uma secção).
  const handleRespond = async (planId, accept) => {
    const ok = await respondToPlan(planId, accept);
    if (ok) showToast(accept ? 'Plano aceite' : 'Plano recusado');
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
    }
  };

  // Sonda coach_messages à procura da resposta do modelo criada DEPOIS do
  // início deste pedido — usado quando o cliente não conseguiu resposta
  // síncrona mas o pedido pode ainda estar em processamento no servidor.
  const waitForAsyncReply = async (afterIso) => {
    const deadline = Date.now() + POLL_MAX_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const { data: rows } = await supabase
        .from('coach_messages')
        .select('id, content, created_at')
        .eq('user_id', profile?.id)
        .eq('role', 'model')
        .gt('created_at', afterIso)
        .order('created_at', { ascending: true })
        .limit(1);
      if (rows && rows.length > 0) return rows[0];
    }
    return null;
  };

  // Chamado quando invokeEdgeFunctionWithTimeout falha — ver comentário
  // grande sobre POLL_MAX_MS acima. Mostra um aviso de demora (sem
  // destravar o campo, para não convidar a reformular a mesma pergunta) e
  // só desiste de vez se a sondagem não encontrar nada no prazo.
  const handleAsyncFallback = async (requestStartedAt) => {
    const waitingId = `waiting-${Date.now()}`;
    const firstName = getFirstName(profile?.display_name);
    addCoachMessage({
      id: waitingId,
      role: 'assistant',
      content: pickWaitingMessage(firstName)
    });

    const modelRow = await waitForAsyncReply(requestStartedAt);
    removeCoachMessage(waitingId);

    if (modelRow) {
      addCoachMessage({ id: modelRow.id, role: 'assistant', content: modelRow.content, live: true });
      // Chegados por sondagem, não temos os flags plan_proposed/goal_proposed/
      // goals_updated do payload síncrono (nem as sugestões rápidas, que só
      // vêm nesse payload e não ficam persistidas) — por isso verificamos
      // sempre se apareceu algo pendente, em vez de confiar num flag que
      // aqui não existe.
      const freshPlans = await reloadCoachPlans();
      if (freshPlans && freshPlans.length > 0) {
        const pending = freshPlans.filter(p => p.status === 'proposto');
        if (pending.length > 0) setActiveProposalSheetPlan(pending[0]);
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
    } else {
      addCoachMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Não foi possível obter uma resposta do Coach. Tenta outra vez.'
      });
    }
    setCoachLoading(false);
  };

  // Chamado quando invokeEdgeFunctionWithTimeout falha com isTimeout=false —
  // ou seja, o pedido nunca chegou a ser processado no servidor (falha de
  // rede, DNS, CORS...) ou o servidor respondeu já com erro. Ao contrário de
  // handleAsyncFallback, NÃO há nada em curso para esperar: sondar durante
  // até 3 minutos só atrasaria uma mensagem que já sabemos de antemão que
  // nunca vai chegar, e o aviso de "demora" (pensado para pedidos lentos mas
  // em curso) seria enganador aqui. Informa já e liberta o campo para o
  // atleta poder tentar de novo de imediato.
  // `message` opcional: o texto do servidor quando ele recusou de propósito
  // (409 `busy` — "Calma Rui, ainda estou a preparar a resposta…"), que é
  // dela e para mostrar tal e qual; sem isso, o aviso genérico de rede.
  const handleImmediateFailure = (message) => {
    addCoachMessage({
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: message || 'A tua mensagem não saiu: falha de rede ou de ligação ao servidor. Verifica a ligação e envia outra vez.'
    });
    setCoachLoading(false);
  };

  const handleSend = async (textToSend) => {
    const text = (typeof textToSend === 'string' ? textToSend : inputStr).trim();
    if (!text || coachLoading) return;

    setInputStr('');
    clearPersistedFormDraft(COACH_CHAT_DRAFT_KEY);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const requestStartedAt = new Date().toISOString();

    // Add user message to state
    addCoachMessage({ id: Date.now().toString(), role: 'user', content: text });
    setCoachLoading(true);
    setCoachSuggestions([]);

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
        state: insightStates[i.id] === 'understood'
          ? 'Entendido (resolvido pelo atleta)'
          : insightStates[i.id] === 'ignored'
            ? 'Ativo (ignorado temporariamente pelo atleta)'
            : 'Ativo (pendente)'
      }));

      const payload = {
        message: text,
        userData: profile || {},
        activeInsights: insightsContext
      };

      const { data, error, isTimeout, isBusy } = await invokeEdgeFunctionWithTimeout('coach-chat', {
        body: JSON.stringify(payload)
      });

      if (error) {
        if (isTimeout) {
          await handleAsyncFallback(requestStartedAt);
        } else {
          handleImmediateFailure(isBusy ? error : undefined);
        }
        return;
      }

      // A função devolve a resposta em model_message.content — `data.reply`
      // nunca existiu no payload, o que fazia cair sempre no texto de
      // fallback e esconder a resposta real do coach.
      addCoachMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data?.model_message?.content || 'Não consegui responder agora. Tenta outra vez.',
        live: true,
      });
      if (Array.isArray(data?.suggestions)) {
        setCoachSuggestions(data.suggestions);
      }
      // O coach criou um plano nesta resposta — recarrega os itens para a
      // proposta aparecer no Início sem ser preciso refrescar a página.
      if (data?.plan_proposed) {
        const freshPlans = await reloadCoachPlans();
        if (freshPlans && freshPlans.length > 0) {
          const pending = freshPlans.filter(p => p.status === 'proposto');
          if (pending.length > 0) setActiveProposalSheetPlan(pending[0]);
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
      setCoachLoading(false);
    } catch (err) {
      await handleAsyncFallback(requestStartedAt);
    }
  };

  const defaultSuggestions = [
    'Como está a minha nutrição hoje?',
    'Cria-me um plano de treino para uma meia maratona',
    'Que alimentos devo comer antes de treinar?'
  ];

  return (
    <div className="flex flex-col h-full fade-in">
      {/* Header section */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Ponto 9, animação 7: o halo só respira quando há assunto por
              resolver — três ciclos e para. */}
          <CoachAvatar size={36} radius={12} breathing={hasPendingTopic} />
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
            <h3 className="text-sm font-bold text-white mb-1">Sou a Carol, a tua treinadora.</h3>
            <p className="text-xs text-[var(--text-3)] leading-relaxed mb-5 max-w-xs">
              Tenho os teus dados de hoje e o teu perfil à frente. Pergunta-me sobre o treino, a alimentação ou a prova.
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

          return (
            <div key={idx} className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
              {chunks.slice(0, shown).map((chunk, cIdx) => (
                <div
                  key={cIdx}
                  data-testid={isWaiting ? 'coach-waiting-message' : undefined}
                  className={`max-w-[85%] px-[15px] py-[13px] text-[13px] leading-normal ${isUser ? 'coach-bubble-user font-semibold' : 'coach-bubble-model'}`}
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
        })}

        {/* "a escrever…" — CAROL.md §5: precede cada mensagem dela, 600 a
            900 ms; some com prefers-reduced-motion (as bolhas entram logo). */}
        {(coachLoading || typingActive) && (
          <div className="flex justify-start" data-testid="coach-typing">
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
      <div className="shrink-0 border-t border-[var(--border-glass)] pt-3 mt-1 relative">
        {/* Sugestões pendentes (Planos / Objetivos) — botão único: as duas
            propostas podem coexistir e abrem sempre a MESMA persiana, para
            o atleta decidir ambas sem trocar de ecrã. */}
        {(pendingPlans.length > 0 || pendingGoalProposals.length > 0) && (
          <div className="fixed bottom-[140px] right-4 z-50 flex flex-col gap-2 items-end">
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
                setActiveProposalSheetPlan(pendingPlans[0] || null);
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
        <div className="flex gap-2 items-end">
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
            className="flex-1 bg-[var(--bg-sheet)] border border-[var(--border-glass)] rounded-2xl px-4 py-3 text-sm text-[var(--text-3)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--mod-coach-to)] resize-none leading-tight shadow-sm"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputStr.trim() || coachLoading}
            aria-label="Enviar pergunta ao Coach"
            className={`shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center transition active:scale-95 ${
              coachLoading || !inputStr.trim()
                ? 'bg-[var(--surface-strong)] text-[var(--text-3)] cursor-not-allowed'
                : 'text-[var(--coach-ink)] font-bold'
            }`}
            style={{
              background: !inputStr.trim() || coachLoading ? undefined : 'var(--mod-coach-to)'
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
          goalProposal={activeGoalProposal}
          profile={profile}
          onRespondGoal={handleRespondGoal}
          onClose={handleCloseProposalsSheet}
        />
      )}
    </div>
  );
}
