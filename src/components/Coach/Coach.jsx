import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout, supabase } from '../../lib/supabase';
import { Bot, Send, Loader2, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import '../Home/WeeklyPlanCard.css';
import { useToast } from '../shared/ToastProvider';
import { detectCoachInsights } from '../../utils/biEngine';
import CoachText from '../shared/CoachText';
import PlanProposalBottomSheet from './PlanProposalBottomSheet';

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
    runs, gymSessions, meals, bodyAssessments, raceEvents, insightStates
  } = useAppStore();
  const { showToast } = useToast();

  const pendingPlans = (coachPlans || []).filter(p => p.status === 'proposto');
  const pendingGoalProposals = coachGoalProposals || [];

  const [activeProposalSheetPlan, setActiveProposalSheetPlan] = useState(null);
  const [activeGoalProposal, setActiveGoalProposal] = useState(null);

  useEffect(() => {
    reloadCoachGoalProposals();
  }, []);

  const handleProactiveIntervention = async (intentData) => {
    if (coachLoading) return;
    setCoachLoading(true);
    setCoachSuggestions([]);
    const requestStartedAt = new Date().toISOString();

    try {
      const allInsights = detectCoachInsights(
        { runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems }, profile
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
        message: '',
        is_intervention_start: true,
        intervention_details: intentData?.reason ? `Motivo/Análise: "${intentData.reason}"` : null,
        userData: profile || {},
        activeInsights: insightsContext
      };

      const { data, error } = await invokeEdgeFunctionWithTimeout('coach-chat', {
        body: JSON.stringify(payload)
      });

      if (error) {
        await handleAsyncFallback(requestStartedAt);
        return;
      }

      if (data?.model_message?.content) {
        addCoachMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.model_message.content
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
      if (data?.goals_updated && profile?.id) {
        const { data: freshProfile } = await supabase.from('profiles').select('*').eq('id', profile.id).single();
        if (freshProfile) setProfile(freshProfile);
      }
      setCoachLoading(false);
    } catch (err) {
      await handleAsyncFallback(requestStartedAt);
    }
  };

  useEffect(() => {
    if (coachIntent === 'adapt_plan' || (coachIntent && coachIntent.kind === 'proactive_intervention')) {
      const intentData = typeof coachIntent === 'object' ? coachIntent : null;
      setCoachIntent(null);
      handleProactiveIntervention(intentData);
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

  // Auto-scroll to bottom when messages or loading state changes
  useEffect(() => {
    if (isFirstRender.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      isFirstRender.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [coachMessages, coachLoading, coachSuggestions]);

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
      content: `Calma ${firstName ?? 'atleta'}, isto está a demorar um bocadinho mais do que o costume — aproveita para fazer uns agachamentos enquanto preparo a resposta :)`
    });

    const modelRow = await waitForAsyncReply(requestStartedAt);
    removeCoachMessage(waitingId);

    if (modelRow) {
      addCoachMessage({ id: modelRow.id, role: 'assistant', content: modelRow.content });
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
        content: '**Erro:** Não foi possível obter uma resposta do Coach. Tenta novamente.'
      });
    }
    setCoachLoading(false);
  };

  const handleSend = async (textToSend) => {
    const text = (typeof textToSend === 'string' ? textToSend : inputStr).trim();
    if (!text || coachLoading) return;

    setInputStr('');
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
        { runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems }, profile
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

      const { data, error } = await invokeEdgeFunctionWithTimeout('coach-chat', {
        body: JSON.stringify(payload)
      });

      if (error) {
        await handleAsyncFallback(requestStartedAt);
        return;
      }

      // A função devolve a resposta em model_message.content — `data.reply`
      // nunca existiu no payload, o que fazia cair sempre no texto de
      // fallback e esconder a resposta real do coach.
      addCoachMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data?.model_message?.content || 'Desculpa, não consegui obter uma resposta de momento.'
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
      if (data?.goals_updated && profile?.id) {
        const { data: freshProfile } = await supabase.from('profiles').select('*').eq('id', profile.id).single();
        if (freshProfile) setProfile(freshProfile);
      }
      setCoachLoading(false);
    } catch (err) {
      await handleAsyncFallback(requestStartedAt);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
            style={{ background: 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))' }}
          >
            <Bot className="w-5 h-5" style={{ color: '#fff' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white leading-none">Coach IronCoach</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">Nutrição · Ginásio · Corrida</p>
          </div>
        </div>

      </div>



      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-2 pr-1 no-scrollbar">
        {/* Empty State */}
        {coachMessages.length === 0 && !coachLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-sm"
              style={{ background: 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))' }}
            >
              <Bot className="w-8 h-8" style={{ color: '#fff' }} />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">O teu coach está pronto</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-5 max-w-xs">
              Pergunta sobre nutrição, treino ou corrida. Tenho acesso aos teus dados de hoje e ao teu perfil.
            </p>
            <div className="space-y-2 w-full max-w-xs text-left">
              {defaultSuggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(s)}
                  className="w-full text-left text-xs rounded-xl px-3.5 py-2.5 transition font-medium"
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
              className="text-xs rounded-xl px-4 py-2.5 transition font-medium"
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

        {/* Message Bubbles */}
        {visibleMessages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          let msgDate = null;
          if (msg.created_at) {
            msgDate = new Date(msg.created_at);
          } else if (msg.id && !isNaN(msg.id)) {
            msgDate = new Date(parseInt(msg.id, 10));
          }
          const timeStr = msgDate && !isNaN(msgDate) ? format(msgDate, "dd MMM 'às' HH:mm", { locale: pt }) : '';

          return (
            <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-[var(--accent)] text-neutral-50 font-semibold rounded-[18px_18px_4px_18px]'
                    : 'bg-neutral-900/80 border border-neutral-800 text-slate-300 rounded-[18px_18px_18px_4px] shadow-sm'
                }`}
              >
                {isUser ? msg.content : <CoachText>{msg.content}</CoachText>}
              </div>
              {timeStr && (
                <span className="text-[10px] text-slate-500 mt-1 mx-1 px-1">
                  {timeStr}
                </span>
              )}
            </div>
          );
        })}


        {/* Loading Indicator */}
        {coachLoading && (
          <div className="flex justify-start">
            <div className="bg-neutral-900/80 border border-neutral-800 rounded-[18px_18px_18px_4px] px-4 py-3 shadow-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse delay-150" />
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse delay-300" />
            </div>
          </div>
        )}

        {/* Contextual Suggestions after response */}
        {!coachLoading && coachSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {coachSuggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(s)}
                className="text-left text-xs rounded-xl px-3 py-2 transition font-medium"
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
      <div className="shrink-0 border-t border-neutral-800 pt-3 mt-1 relative">
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
              className="text-white font-bold text-xs rounded-xl px-4 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-2 transition active:scale-95 animate-bounce hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed disabled:animate-none"
              style={{ background: 'linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))' }}
            >
              <Sparkles className="w-4 h-4 text-white" />
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
            onKeyDown={handleKeyDown}
            placeholder="Escreve a tua pergunta..."
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl px-4 py-3 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-[var(--mod-coach-to)] resize-none leading-tight shadow-sm"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputStr.trim() || coachLoading}
            aria-label="Enviar pergunta ao Coach"
            className={`shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center transition active:scale-95 ${
              coachLoading || !inputStr.trim()
                ? 'bg-neutral-800 text-slate-500 cursor-not-allowed'
                : 'text-slate-950 font-bold'
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
