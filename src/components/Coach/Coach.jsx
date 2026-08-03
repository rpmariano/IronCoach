import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout, supabase } from '../../lib/supabase';
import { Send, Bot, Trash2, Loader2, Sparkles } from 'lucide-react';

function renderSimpleMarkdown(content) {
  if (!content) return null;

  // Split content into lines and render paragraphs/lists
  const lines = content.split('\n');
  return lines.map((line, lineIdx) => {
    // Basic bold parsing
    const parts = line.split(/(\*\*.*?\*\*)/g);
    const formattedLine = parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });

    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      return (
        <li key={lineIdx} className="ml-4 list-disc text-slate-800 my-0.5">
          {line.trim().substring(2)}
        </li>
      );
    }

    if (line.trim() === '') {
      return <div key={lineIdx} className="h-2" />;
    }

    return (
      <p key={lineIdx} className="my-0.5">
        {formattedLine}
      </p>
    );
  });
}

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
    session
  } = useAppStore();

  const [inputStr, setInputStr] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

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
        addCoachMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data?.reply || 'Desculpa, não consegui obter uma resposta de momento.'
        });
        if (Array.isArray(data?.suggestions)) {
          setCoachSuggestions(data.suggestions);
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
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 leading-none">Coach IronHealth</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Nutrição · Ginásio · Corrida</p>
          </div>
        </div>

        {coachMessages.length > 0 && (
          <button
            onClick={() => setShowClearModal(true)}
            className="text-[11px] text-slate-600 border border-slate-200 rounded-xl px-2.5 py-1 hover:bg-slate-50 active:scale-95 transition flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            Limpar
          </button>
        )}
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
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">O teu coach está pronto</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-5 max-w-xs">
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

        {/* Message Bubbles */}
        {coachMessages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-[var(--accent)] text-slate-950 font-semibold rounded-[18px_18px_4px_18px]'
                    : 'bg-white border border-[var(--brd-700)] text-slate-800 rounded-[18px_18px_18px_4px] shadow-sm'
                }`}
              >
                {isUser ? msg.content : renderSimpleMarkdown(msg.content)}
              </div>
            </div>
          );
        })}

        {/* Loading Indicator */}
        {coachLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-[var(--brd-700)] rounded-[18px_18px_18px_4px] px-4 py-3 shadow-sm flex items-center gap-1.5">
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
      <div className="shrink-0 border-t border-slate-200 pt-3 mt-1">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputStr}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Escreve a tua pergunta..."
            className="flex-1 bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-[var(--mod-coach-to)] resize-none leading-tight shadow-sm"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputStr.trim() || coachLoading}
            aria-label="Enviar pergunta ao Coach"
            className={`shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-2xl flex items-center justify-center transition active:scale-95 ${
              coachLoading || !inputStr.trim()
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-xs w-full shadow-xl">
            <h3 className="text-sm font-bold text-slate-800 mb-2">Limpar toda a conversa com o Coach?</h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Esta ação apaga permanentemente todas as mensagens trocadas e não pode ser desfeita. O Coach deixará de ter memória desta conversa.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl py-2.5 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearConversation}
                className="flex-1 bg-red-500 text-white text-xs font-semibold rounded-xl py-2.5 hover:bg-red-600 transition"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
