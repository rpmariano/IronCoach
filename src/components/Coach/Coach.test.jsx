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
    // isTimeout=true: o CLIENTE desistiu de esperar (AbortError), mas o
    // pedido pode legitimamente ainda estar em processamento no servidor —
    // é o único caso em que a UI deve mostrar o aviso de demora e sondar.
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true });
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

    // O texto do aviso varia entre reformulações (ver WAITING_MESSAGES em
    // Coach.jsx) — a bolha é identificada por data-testid, não por conteúdo.
    expect(screen.getByTestId('coach-waiting-message')).toBeInTheDocument();
    // Não é um erro definitivo — não deve aparecer o prefixo "Erro:".
    expect(screen.queryByText(/^\*\*Erro/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i })).toBeDisabled();
  });

  it('BUG CORRIGIDO 2026-08-31 — Enter faz quebra de linha, nunca envia a pergunta; só o botão envia', () => {
    // Pedido explícito do utilizador: uma mensagem mais longa (várias
    // linhas) enviava-se a meio sem querer ao carregar em Enter para
    // mudar de linha — Enter (com ou sem Shift) nunca deve chamar
    // invokeEdgeFunctionWithTimeout nem limpar o campo.
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });
    renderCoach();

    const textarea = screen.getByPlaceholderText('Escreve a tua pergunta...');
    fireEvent.change(textarea, { target: { value: 'Primeira linha' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true });

    expect(invokeEdgeFunctionWithTimeout).not.toHaveBeenCalled();
    expect(textarea.value).toBe('Primeira linha');
  });

  it('encontra a resposta por sondagem: substitui o aviso pela resposta real e destrava o campo', async () => {
    // isTimeout=true: o CLIENTE desistiu de esperar (AbortError), mas o
    // pedido pode legitimamente ainda estar em processamento no servidor —
    // é o único caso em que a UI deve mostrar o aviso de demora e sondar.
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true });
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
    expect(screen.getByTestId('coach-waiting-message')).toBeInTheDocument();

    // 1ª sondagem (POLL_INTERVAL_MS = 4000ms): ainda vazio.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.getByTestId('coach-waiting-message')).toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(true);

    // 2ª sondagem: encontra a resposta real.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.queryByTestId('coach-waiting-message')).not.toBeInTheDocument();
    expect(screen.getByText(/Resposta real do coach\./i)).toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);
    // O botão só fica ativo com texto por enviar — testa o destravar do
    // campo (coachLoading) escrevendo de novo, não o estado "sem texto".
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Obrigada' } });
    expect(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i })).not.toBeDisabled();
  });

  it('esgota a sondagem sem resposta: mostra erro final e destrava o campo', async () => {
    // isTimeout=true: o CLIENTE desistiu de esperar (AbortError), mas o
    // pedido pode legitimamente ainda estar em processamento no servidor —
    // é o único caso em que a UI deve mostrar o aviso de demora e sondar.
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true });
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

    expect(screen.queryByTestId('coach-waiting-message')).not.toBeInTheDocument();
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

  it('trata o atleta pelo primeiro nome no aviso de demora, quando o perfil o tem', async () => {
    useAppStore.setState({ profile: { id: 'user-1', display_name: 'Patrícia Martins' } });
    // isTimeout=true: o CLIENTE desistiu de esperar (AbortError), mas o
    // pedido pode legitimamente ainda estar em processamento no servidor —
    // é o único caso em que a UI deve mostrar o aviso de demora e sondar.
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true });
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

    // Todas as variantes do aviso incluem o nome (ver WAITING_MESSAGES em
    // Coach.jsx) — o texto exato varia, o nome não.
    expect(screen.getByTestId('coach-waiting-message')).toHaveTextContent(/Patrícia/i);
  });

  it('sem nome no perfil, recua para "atleta" no aviso de demora', async () => {
    useAppStore.setState({ profile: { id: 'user-1', display_name: null } });
    // isTimeout=true: o CLIENTE desistiu de esperar (AbortError), mas o
    // pedido pode legitimamente ainda estar em processamento no servidor —
    // é o único caso em que a UI deve mostrar o aviso de demora e sondar.
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true });
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

    expect(screen.getByTestId('coach-waiting-message')).toHaveTextContent(/atleta/i);
  });

  it('varia o texto do aviso de demora entre pedidos (não é sempre a mesma frase)', async () => {
    // Regressão do bug relatado: a Carol usava sempre a mesma piada dos
    // agachamentos. Força cada extração de Math.random a devolver um índice
    // diferente do array WAITING_MESSAGES e confirma que o texto muda.
    useAppStore.setState({ profile: { id: 'user-1', display_name: null } });
    // isTimeout=true: o CLIENTE desistiu de esperar (AbortError), mas o
    // pedido pode legitimamente ainda estar em processamento no servidor —
    // é o único caso em que a UI deve mostrar o aviso de demora e sondar.
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'A operação demorou demasiado tempo a responder (timeout). Por favor, tente novamente.', isTimeout: true });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });

    const randomSpy = vi.spyOn(Math, 'random');
    const seenTexts = new Set();

    for (let i = 0; i < 3; i++) {
      randomSpy.mockReturnValue(i / 3); // espalha por índices diferentes do array de 6 variantes
      const { unmount } = renderCoach();
      fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i }));
        await Promise.resolve();
        await Promise.resolve();
      });
      seenTexts.add(screen.getByTestId('coach-waiting-message').textContent);
      unmount();
      useAppStore.setState({ coachMessages: [], coachLoading: false });
    }

    randomSpy.mockRestore();
    expect(seenTexts.size).toBeGreaterThan(1);
  });
});

// Regressão do bug reportado (bug-015-adjacent): o cliente mostrava o aviso
// de "demora" (e sondava coach_messages durante até 3 minutos) mesmo quando
// o pedido nunca chegou a sair — ex.: "Failed to send a request to the Edge
// Function", uma falha de rede imediata, não um timeout. Ver isTimeout em
// invokeEdgeFunctionWithTimeout (src/lib/supabase.js).
describe('Coach — falha imediata (sem timeout, isTimeout=false)', () => {
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

  it('mostra erro imediato (não o aviso de demora) e destrava logo o campo, sem sondar', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: null,
      error: 'Failed to send a request to the Edge Function',
      isTimeout: false,
    });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });

    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i }));

    await waitFor(() => expect(screen.getByText(/falha de rede/i)).toBeInTheDocument());
    // Não é o aviso de demora (não faz sentido esperar por algo que nunca
    // vai chegar — o pedido nunca saiu).
    expect(screen.queryByTestId('coach-waiting-message')).not.toBeInTheDocument();
    // Campo destravado de imediato — sem os 45s+sondagem do outro caminho.
    // O botão só fica ativo com texto por enviar (ver o mesmo padrão no
    // teste de sondagem acima) — testa o destravar do coachLoading
    // escrevendo de novo, não o estado "sem texto".
    expect(useAppStore.getState().coachLoading).toBe(false);
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Tenta de novo' } });
    expect(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i })).not.toBeDisabled();
    // Sem sondagem: nenhuma leitura a coach_messages foi despoletada.
    expect(supabase.from).not.toHaveBeenCalledWith('coach_messages');
  });
});

// Bug relatado 2026-08-30: o texto por escrever perdia-se ao trocar de app e
// voltar — o Android descarta a página em segundo plano e recarrega do
// zero, apagando o estado em memória. Mesma correção dos formulários de
// registo (ver src/utils/formDraftPersistence.js e RunAgenda.test.jsx).
describe('Coach — BUG CORRIGIDO (2026-08-30) — rascunho da mensagem sobrevive a voltar de outra app', () => {
  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    localStorage.clear();
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
    localStorage.clear();
  });

  it('texto escrito sobrevive a um "recarregamento" (remount) da app', () => {
    vi.useFakeTimers();
    const { unmount } = renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Pergunta a meio de escrever' } });

    // Debounce da persistência (formDraftPersistence.js).
    vi.advanceTimersByTime(700);

    unmount();

    // "Reabrir a app" — nova instância do componente, tal como acontece
    // quando o Android recarrega a página ao voltar de outra app e apaga
    // todo o estado em memória.
    renderCoach();

    expect(screen.getByPlaceholderText('Escreve a tua pergunta...').value).toBe('Pergunta a meio de escrever');
  });

  it('enviar a mensagem limpa o rascunho — a próxima visita ao chat não vem com texto antigo', async () => {
    // Simula um rascunho já persistido de uma sessão anterior (poupa
    // esperar pelo debounce real de formDraftPersistence.js).
    localStorage.setItem('ironcoach:carol-chat-rascunho', JSON.stringify({ inputStr: 'Rascunho Antigo' }));
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { model_message: { content: 'Olá!' } }, error: null });

    const { unmount } = renderCoach();
    expect(screen.getByPlaceholderText('Escreve a tua pergunta...').value).toBe('Rascunho Antigo');

    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta ao Coach/i }));

    await waitFor(() => expect(screen.getByPlaceholderText('Escreve a tua pergunta...').value).toBe(''));
    expect(localStorage.getItem('ironcoach:carol-chat-rascunho')).toBeNull();
    unmount();

    // Reabrir o chat: sem vestígios do rascunho enviado.
    renderCoach();
    expect(screen.getByPlaceholderText('Escreve a tua pergunta...').value).toBe('');
  });
});
