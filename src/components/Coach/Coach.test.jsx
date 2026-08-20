import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout, supabase } from '../../lib/supabase';
import { ToastProvider } from '../shared/ToastProvider';
import Coach from './Coach';

// Mesmo padrão de mock usado em RunAgenda.test.jsx: supabase.from é um
// vi.fn() reconfigurável por teste (mockImplementation), em vez de uma
// cadeia estática — precisamos de simular a sondagem a coach_messages
// devolvendo respostas diferentes em chamadas sucessivas.
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

// jsdom não implementa scrollIntoView — Coach faz auto-scroll ao fundo do
// chat sempre que a lista de mensagens muda.
Element.prototype.scrollIntoView = vi.fn();

function renderCoach() {
  return render(
    <ToastProvider>
      <Coach />
    </ToastProvider>,
  );
}

// Cadeia mínima usada pela sondagem em waitForAsyncReply:
// supabase.from('coach_messages').select(...).eq(...).eq(...).gt(...).order(...).limit(1)
function coachMessagesChain(result) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          gt: () => ({
            order: () => ({
              limit: () => Promise.resolve(result),
            }),
          }),
        }),
      }),
    }),
  };
}

function profilesChain(result) {
  return { select: () => ({ eq: () => ({ single: () => Promise.resolve(result) }) }) };
}

describe('Coach — resposta assíncrona quando o pedido síncrono falha', () => {
  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    useAppStore.setState({
      profile: { id: 'user-1' },
      coachMessages: [],
      coachLoading: false,
      coachSuggestions: [],
      coachPlans: [],
      coachPlanItems: [],
      coachGoalProposals: [],
      coachIntent: null,
      session: { user: { id: 'user-1' } },
      setCoachIntent: (intent) => useAppStore.setState({ coachIntent: intent }),
      reloadCoachPlans: vi.fn().mockResolvedValue([]),
      reloadCoachGoalProposals: vi.fn().mockResolvedValue([]),
      respondToPlan: vi.fn().mockResolvedValue(true),
      respondToGoalProposal: vi.fn().mockResolvedValue(true),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('em falha, mostra aviso de demora (sem erro definitivo) e mantém o campo bloqueado', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'Failed to send a request to the Edge Function' });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });

    vi.useFakeTimers();
    renderCoach();

    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i }));
      // deixa o handleSend correr até ao catch/erro e mostrar o aviso, antes
      // de qualquer avanço de temporizador.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/está a demorar mais do que o costume/i)).toBeInTheDocument();
    // Não é um erro definitivo — não deve aparecer o prefixo "Erro:".
    expect(screen.queryByText(/^\*\*Erro/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i })).toBeDisabled();
  });

  it('encontra a resposta por sondagem: substitui o aviso pela resposta real e destrava o campo', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'Failed to send a request to the Edge Function' });
    let pollCount = 0;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        pollCount += 1;
        // 1ª sondagem: ainda nada. 2ª sondagem: chegou a resposta real.
        return coachMessagesChain(
          pollCount < 2
            ? { data: [], error: null }
            : { data: [{ id: 'msg-real', content: 'Resposta real do coach.', created_at: new Date().toISOString() }], error: null },
        );
      }
      return profilesChain({ data: { id: 'user-1' }, error: null });
    });

    vi.useFakeTimers();
    renderCoach();

    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(/está a demorar mais do que o costume/i)).toBeInTheDocument();

    // 1ª sondagem (POLL_INTERVAL_MS = 4000ms): ainda vazio.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.getByText(/está a demorar mais do que o costume/i)).toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(true);

    // 2ª sondagem: encontra a resposta real.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.queryByText(/está a demorar mais do que o costume/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Resposta real do coach\./i)).toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);
    // O botão só fica ativo com texto por enviar — testa o destravar do
    // campo (coachLoading) escrevendo de novo, não o estado "sem texto".
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Obrigada' } });
    expect(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i })).not.toBeDisabled();
  });

  it('esgota a sondagem sem resposta: mostra erro final e destrava o campo', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'Failed to send a request to the Edge Function' });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });

    vi.useFakeTimers();
    renderCoach();

    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Avança para lá do prazo máximo de sondagem (180000ms).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(184000);
    });

    expect(screen.queryByText(/está a demorar mais do que o costume/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Não foi possível obter uma resposta do Coach/i)).toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Tenta de novo' } });
    expect(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i })).not.toBeDisabled();
  }, 15000);

  it('em sucesso síncrono, comportamento normal mantém-se (regressão)', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Olá! Como posso ajudar?' }, suggestions: [], plan_proposed: false, goal_proposed: false, goals_updated: false },
      error: null,
    });

    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i }));

    await waitFor(() => expect(screen.getByText(/Como posso ajudar/i)).toBeInTheDocument());
    expect(useAppStore.getState().coachLoading).toBe(false);
  });
});
