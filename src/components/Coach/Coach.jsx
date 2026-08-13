import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout, supabase } from '../../lib/supabase';
import { Send, Bot, Trash2, Loader2, Sparkles, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { PlanProposalCard } from '../Home/WeeklyPlanCard';
import '../Home/WeeklyPlanCard.css';
import { useToast } from '../shared/ToastProvider';
import CoachText from '../shared/CoachText';
import PlanProposalBottomSheet from './PlanProposalBottomSheet';

export default function Coach() {
  const {
    coachMessages,
    addCoachMessage,
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
    respondToGoalProposal
  } = useAppStore();
  const { showToast } = useToast();

  const pendingPlans = (coachPlans || []).filter(p => p.status === 'proposto');
  const pendingGoalProposals = coachGoalProposals || [];

  const [activeProposalSheetPlan, setActiveProposalSheetPlan] = useState(null);
  const [activeGoalProposal, setActiveGoalProposal] = useState(null);
  const [autoOpenedPlans, setAutoOpenedPlans] = useState(() => new Set());
  const [autoOpenedGoals, setAutoOpenedGoals] = useState(() => new Set());

  useEffect(() => {
    reloadCoachGoalProposals();
  }, []);

  // Auto-abre a persiana Modal Bottom Sheet quando o Coach sugere um plano novo ou novos objetivos
  useEffect(() => {
    if (pendingPlans.length > 0) {
      const unopened = pendingPlans.find(p => !autoOpenedPlans.has(p.id));
      if (unopened) {
        setActiveProposalSheetPlan(unopened);
        setAutoOpenedPlans(prev => new Set(prev).add(unopened.id));
      }
    }
    if (pendingGoalProposals.length > 0) {
      const unopenedGoal = pendingGoalProposals.find(g => !autoOpenedGoals.has(g.id));
      if (unopenedGoal) {
        setActiveGoalProposal(unopenedGoal);
        setAutoOpenedGoals(prev => new Set(prev).add(unopenedGoal.id));
      }
    }
  }, [pendingPlans, pendingGoalProposals, autoOpenedPlans, autoOpenedGoals]);

  const handleRespond = async (planId, accept) => {
    const ok = await respondToPlan(planId, accept);
    if (ok) showToast(accept ? 'Plano aceite' : 'Plano recusado');
  };

  const handleRespondGoal = async (proposalId, accept) => {
    const ok = await respondToGoalProposal(proposalId, accept);
    if (ok) showToast(accept ? 'Objetivos aceites e atualizados' : 'Proposta de objetivos recusada');
  };

  const [inputStr, setInputStr] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [hoursToShow, setHoursToShow] = useState(48);
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


  // Auto-scroll to bottom when messages or loading state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [coachMessages, coachLoading, coachSuggestions]);

  // Adjust textarea height on input change
  const handleInputChange = (e) => {
    setInputStr(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSend = async (textToSend) => {
    const text = (textToSend || inputStr).trim();
    if (!text || coachLoading) return;

    setInputStr('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add user message to state
    addCoachMessage({ id: Date.now().toString(), role: 'user', content: text });
    setCoachLoading(true);
    setCoachSuggestions([]);

    try {
      const payload = {
        message: text,
        userData: profile || {}
      };

      const { data, error } = await invokeEdgeFunctionWithTimeout('coach-chat', {
        body: JSON.stringify(payload)
      });

      if (error) {
        addCoachMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `**Erro:** ${typeof error === 'string' ? error : error.message || 'Não foi possível responder.'}`
        });
      } else {
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
      }
    } catch (err) {
      addCoachMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '**Erro Crítico:** Não foi possível contactar o Coach. Tenta novamente mais tarde.'
      });
    } finally {
      setCoachLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearConversation = async () => {
    setShowClearModal(false);
    if (session?.user?.id) {
      try {
        await supabase.from('coach_messages').delete().eq('user_id', session.user.id);
      } catch (e) {
        console.error('Error clearing coach messages in Supabase:', e);
      }
    }
    clearCoachChat();
  };

  const defaultSuggestions = [
    'Como está a minha nutrição hoje?',
    'Cria-me um plano de treino para uma meia maratona',
    'Que alimentos devo comer antes de treinar?'
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] fade-in">
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
            <h2 className="text-sm font-bold text-white leading-none">Coach IronHealth</h2>
            <p className="text-[10px] text-slate-400 mt-0.5">Nutrição · Ginásio · Corrida</p>
          </div>
        </div>

        {coachMessages.length > 0 && (
          <button
            onClick={() => setShowClearModal(true)}
            className="text-[11px] text-slate-400 border border-neutral-800 rounded-xl px-2.5 py-1 hover:bg-neutral-800 active:scale-95 transition flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-500" />
            Limpar
          </button>
        )}
      </div>

      {/* Sugestões pendentes (Planos / Objetivos) — Banner que abre o Modal Bottom Sheet */}
      {(pendingPlans.length > 0 || pendingGoalProposals.length > 0) && (
        <button
          type="button"
          onClick={() => {
            if (pendingPlans.length > 0) setActiveProposalSheetPlan(pendingPlans[0]);
            if (pendingGoalProposals.length > 0) setActiveGoalProposal(pendingGoalProposals[0]);
          }}
          className="shrink-0 mb-3 w-full p-3 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-amber-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-between shadow-lg active:scale-98 transition"
        >
          <span className="flex items-center gap-2">
            <Sparkles size={15} className="text-emerald-400 animate-pulse" />
            <span>
              {pendingPlans.length > 0 && pendingGoalProposals.length > 0
                ? `Propostas de plano e objetivos por rever (${pendingPlans.length + pendingGoalProposals.length})`
                : pendingPlans.length > 0
                ? `Proposta de plano por rever (${pendingPlans.length})`
                : `Proposta de alteração de objetivos (${pendingGoalProposals.length})`}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[11px] bg-emerald-500/20 px-2.5 py-1 rounded-xl text-emerald-200 font-semibold">
            Ver proposta <ChevronRight size={13} />
          </span>
        </button>
      )}

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
                    ? 'bg-[var(--accent)] text-slate-950 font-semibold rounded-[18px_18px_4px_18px]'
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
      <div className="shrink-0 border-t border-neutral-800 pt-3 mt-1">
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

      {/* Clear Confirmation Modal */}
      {showClearModal && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-xs flex items-center justify-center px-6 fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowClearModal(false);
          }}
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 max-w-xs w-full shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-2">Limpar toda a conversa com o Coach?</h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Esta ação apaga permanentemente todas as mensagens trocadas e não pode ser desfeita. O Coach deixará de ter memória desta conversa.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearModal(false)}
                className="flex-1 border border-neutral-800 text-slate-400 text-xs font-semibold rounded-xl py-2.5 hover:bg-neutral-800 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearConversation}
                className="flex-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded-xl py-2.5 border border-red-500/40 hover:bg-red-500/30 transition"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bottom Sheet (Persiana de baixo para cima) para Propostas */}
      {(activeProposalSheetPlan || activeGoalProposal) && (
        <PlanProposalBottomSheet
          plan={activeProposalSheetPlan}
          items={coachPlanItems}
          goalProposal={activeGoalProposal}
          profile={profile}
          onRespondPlan={handleRespond}
          onRespondGoal={handleRespondGoal}
          onClose={() => {
            setActiveProposalSheetPlan(null);
            setActiveGoalProposal(null);
          }}
        />
      )}
    </div>
  );
}
