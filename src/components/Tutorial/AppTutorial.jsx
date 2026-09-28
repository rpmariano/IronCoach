import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  House,
  Plus,
  Trophy,
  MessageSquare,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Lightbulb,
} from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';
import { TUTORIAL_STEPS, markTutorialDoneLocally } from '../../utils/tutorial';
import { useAppStore } from '../../store';

/* Mapa de ícones principais de cada passo do tutorial */
function StepIcon({ iconKey, tone, size = 32 }) {
  const isRace = tone === 'race';
  const color = isRace ? 'var(--race, #fbbf24)' : 'var(--coach, #22d3ee)';

  switch (iconKey) {
    case 'coach':
      return <CoachAvatar size={size + 14} mood="proud" />;
    case 'home':
      return <House size={size} style={{ color }} />;
    case 'plus':
      return <Plus size={size + 4} style={{ color }} />;
    case 'trophy':
      return <Trophy size={size} style={{ color }} />;
    case 'chat':
      return <MessageSquare size={size} style={{ color }} />;
    default:
      return <Sparkles size={size} style={{ color }} />;
  }
}

export default function AppTutorial({ onClose, onFinish, isFirstArrival = false }) {
  const [stepIndex, setStepIndex] = useState(0);
  const containerRef = useRef(null);
  const primaryBtnRef = useRef(null);

  const profile = useAppStore((s) => s.profile);
  const session = useAppStore((s) => s.session);
  const setTutorialOpen = useAppStore((s) => s.setTutorialOpen);
  const setOnboardingOpen = useAppStore((s) => s.setOnboardingOpen);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const userId = session?.user?.id || profile?.id || 'anon';

  const totalSteps = TUTORIAL_STEPS.length;
  const currentStep = TUTORIAL_STEPS[stepIndex];
  const isLastStep = stepIndex === totalSteps - 1;

  // Fecha e marca como concluído no localStorage
  const handleComplete = useCallback((targetTab = null) => {
    markTutorialDoneLocally(userId);
    if (session?.user?.id) markTutorialDoneLocally(session.user.id);
    if (profile?.id) markTutorialDoneLocally(profile.id);
    setTutorialOpen(false);

    if (typeof window !== 'undefined' && window.location.search.includes('tutorial=')) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('tutorial');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
      } catch (_) { /* ignore */ }
    }

    if (isFirstArrival) {
      setOnboardingOpen(true);
    } else if (targetTab) {
      setActiveTab(targetTab);
    }
    if (onFinish) onFinish({ startOnboarding: isFirstArrival });
    if (onClose) onClose();
  }, [userId, session, profile, setTutorialOpen, setOnboardingOpen, setActiveTab, onFinish, onClose, isFirstArrival]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete(isFirstArrival ? null : 'home');
    } else {
      setStepIndex((idx) => Math.min(totalSteps - 1, idx + 1));
    }
  };

  const handlePrev = () => {
    setStepIndex((idx) => Math.max(0, idx - 1));
  };

  // Suporte a teclado: Esc fecha, Setas navegam
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleComplete();
      } else if (e.key === 'ArrowRight' && !isLastStep) {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' && stepIndex > 0) {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLastStep, stepIndex, handleComplete]);

  // Foco inicial no botão de ação
  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, [stepIndex]);

  const isRace = currentStep.tone === 'race';
  const accentColor = isRace ? 'var(--race, #fbbf24)' : 'var(--coach, #22d3ee)';
  const glowBg = isRace
    ? 'radial-gradient(circle at 50% 20%, rgba(251,191,36,0.18), transparent 70%)'
    : 'radial-gradient(circle at 50% 20%, rgba(34,211,238,0.18), transparent 70%)';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-step-title"
      aria-describedby="tutorial-step-desc"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        paddingTop: 'max(16px, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 16,
        paddingRight: 16,
      }}
      onClick={(e) => {
        // Clicar fora do cartão principal fecha o tutorial
        if (e.target === e.currentTarget) handleComplete();
      }}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-md flex flex-col overflow-hidden animate-fade-in"
        style={{
          maxHeight: '92dvh',
          borderRadius: 24,
          background: 'rgba(18, 20, 26, 0.97)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 40px -10px rgba(34, 211, 238, 0.15)',
        }}
      >
        {/* Glow de fundo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: glowBg, opacity: 0.8 }}
          aria-hidden="true"
        />

        {/* Barra de Topo: Badge do passo + Botão Fechar/Saltar */}
        <header className="relative flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: isRace ? 'rgba(251, 191, 36, 0.14)' : 'rgba(34, 211, 238, 0.14)',
                color: isRace ? 'var(--race-ink-soft, #fcd34d)' : 'var(--coach-soft, #67e8f9)',
                border: `1px solid ${isRace ? 'rgba(251, 191, 36, 0.28)' : 'rgba(34, 211, 238, 0.28)'}`,
              }}
            >
              <span>{stepIndex + 1}/{totalSteps}</span>
              <span className="opacity-40">·</span>
              <span>{currentStep.badge}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleComplete()}
            className="flex items-center justify-center rounded-full p-2 text-zinc-400 hover:text-white transition active:scale-95"
            style={{
              minWidth: 44,
              minHeight: 44,
              background: 'rgba(255, 255, 255, 0.05)',
            }}
            aria-label="Saltar tutorial"
          >
            <X size={18} />
          </button>
        </header>

        {/* Corpo scrollável */}
        <main className="relative flex-1 overflow-y-auto px-6 py-4 flex flex-col items-center text-center">
          {/* Ícone com halo iluminado */}
          <div
            className="relative my-3 flex items-center justify-center shrink-0"
            style={{
              width: 84,
              height: 84,
              borderRadius: 26,
              background: isRace ? 'rgba(251, 191, 36, 0.12)' : 'rgba(34, 211, 238, 0.12)',
              border: `1px solid ${isRace ? 'rgba(251, 191, 36, 0.28)' : 'rgba(34, 211, 238, 0.28)'}`,
              boxShadow: `0 0 24px -4px ${accentColor}`,
            }}
          >
            <StepIcon iconKey={currentStep.iconKey} tone={currentStep.tone} />
          </div>

          {/* Título & Subtítulo */}
          <h2
            id="tutorial-step-title"
            className="text-xl sm:text-2xl font-black text-white tracking-tight mt-2 leading-tight"
          >
            {currentStep.title}
          </h2>

          <p className="text-sm font-semibold mt-1" style={{ color: accentColor }}>
            {currentStep.lead}
          </p>

          <p
            id="tutorial-step-desc"
            className="text-sm text-zinc-300 leading-relaxed mt-3 max-w-sm"
          >
            {currentStep.description}
          </p>

          {/* Dica da Carol (Pro-Tip) */}
          {currentStep.tip && (
            <div
              className="w-full mt-4 p-3.5 rounded-xl text-left flex items-start gap-3"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span
                className="shrink-0 p-1 rounded-lg"
                style={{
                  background: isRace ? 'rgba(251, 191, 36, 0.15)' : 'rgba(34, 211, 238, 0.15)',
                  color: accentColor,
                }}
              >
                <Lightbulb size={16} />
              </span>
              <p className="text-xs text-zinc-300 leading-normal font-medium m-0">
                <span className="font-bold text-white block mb-0.5">Dica da Carol</span>
                {currentStep.tip}
              </p>
            </div>
          )}
        </main>

        {/* Rodapé: Navegação por pontos + Botões de ação */}
        <footer className="relative px-6 pt-3 pb-6 flex flex-col gap-4 shrink-0 border-t border-white/10 bg-zinc-950/40">
          {/* Indicadores de progresso em pontos */}
          <nav aria-label="Passos do tutorial" className="flex items-center justify-center gap-2">
            {TUTORIAL_STEPS.map((step, idx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setStepIndex(idx)}
                aria-label={`Ir para passo ${idx + 1}: ${step.title}`}
                aria-current={idx === stepIndex ? 'step' : undefined}
                className="transition-all duration-200"
                style={{
                  padding: '18px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="transition-all duration-200"
                  style={{
                    display: 'block',
                    width: idx === stepIndex ? 24 : 8,
                    height: 8,
                    borderRadius: 4,
                    background: idx === stepIndex ? accentColor : 'rgba(255, 255, 255, 0.2)',
                  }}
                />
              </button>
            ))}
          </nav>

          {/* Botões de Ação */}
          <div className="flex items-center gap-3">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="flex items-center justify-center gap-1.5 px-4 rounded-xl text-sm font-bold text-zinc-300 bg-white/5 hover:bg-white/10 transition active:scale-98"
                style={{
                  minHeight: 'var(--tap, 48px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <ChevronLeft size={18} />
                <span>Anterior</span>
              </button>
            )}

            <button
              ref={primaryBtnRef}
              type="button"
              onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-2 px-5 rounded-xl text-sm font-extrabold transition active:scale-98"
              style={{
                minHeight: 'var(--tap, 48px)',
                background: isRace ? 'var(--grad-race)' : 'var(--grad-coach-legible)',
                color: isRace ? 'var(--race-ink)' : 'var(--coach-ink)',
                border: 'none',
                boxShadow: `0 4px 14px 0 ${isRace ? 'rgba(251, 191, 36, 0.35)' : 'rgba(34, 211, 238, 0.35)'}`,
              }}
            >
              <span>{isLastStep ? (isFirstArrival ? 'Avançar para o arranque' : 'Começar a treinar') : 'Continuar'}</span>
              {isLastStep && isFirstArrival && <Sparkles size={18} />}
              {!isLastStep && <ChevronRight size={18} />}
            </button>
          </div>

          {/* Botão Saltar */}
          {!isLastStep && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => handleComplete(isFirstArrival ? null : 'home')}
                className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition py-3 px-4"
                style={{ minHeight: 'var(--tap, 44px)' }}
              >
                {isFirstArrival ? 'Saltar tutorial e ir para o arranque' : 'Saltar tutorial e ir para o Início'}
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
