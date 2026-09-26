import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout, supabase } from '../../lib/supabase';
import { ToastProvider } from '../shared/ToastProvider';
import { readCachedBalance } from '../../utils/raceBalance';
import Coach, { COACH_ASYNC_FALLBACK_TEXT, COACH_EMPTY_REPLY_TEXT, COACH_IMMEDIATE_FAILURE_TEXT, COACH_INITIATED_FALLBACK_TEXT, COACH_INITIATED_NETWORK_TEXT, COACH_INITIATED_LATER_TEXT } from './Coach';
// Dia LOCAL (yyyy-mm-dd), como o todayISO() da app: em UTC, entre as 00:00 e
// a 01:00 de verão o "há 5 dias" passava a 6 e o teste falhava só a essa hora.
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* Um plano aceite no período, com um treino previsto entretanto: mantém o
   limiar do silêncio em SILENCE_DAYS (3 dias) — sem ele, sobe para uma
   semana (SILENCE_DAYS_SEM_PLANO, revisão de 2026-09-26). O fim do plano
   fica longe (30 dias) para não acionar também o "fim de bloco". */
function planoDoSilencio(fromISO) {
  return {
    coachPlans: [{ id: 'sp1', status: 'aceite', race_id: null, period_start: fromISO, period_end: localISO(new Date(Date.now() + 30 * 86400000)) }],
    coachPlanItems: [{ plan_id: 'sp1', planned_date: localISO(new Date(Date.now() - 2 * 86400000)), kind: 'corrida', status: 'pendente' }],
  };
}


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
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
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
    expect(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })).toBeDisabled();
  });

  it('INCIDENTE 2026-09-24 — com o servidor já acabado sem resposta (lock livre), avisa logo em vez de sondar 3 minutos', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: { coach_chat_busy_since: null }, error: null });
    });

    vi.useFakeTimers();
    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('coach-waiting-message')).toBeInTheDocument();

    // Duas voltas da sondagem (8 s), não os 3 minutos.
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(useAppStore.getState().coachMessages.map((m) => m.content)).not.toContain(COACH_ASYNC_FALLBACK_TEXT);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    const contents = useAppStore.getState().coachMessages.map((m) => m.content);
    expect(contents).toContain(COACH_ASYNC_FALLBACK_TEXT);
    expect(useAppStore.getState().coachLoading).toBe(false);
  });

  it('um erro a ler o lock mantém a sondagem até à resposta', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    let polls = 0;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        polls += 1;
        return coachMessagesChain(polls < 4
          ? { data: [], error: null }
          : { data: [{ id: 'm2', role: 'model', content: 'Cheguei.', created_at: new Date().toISOString() }], error: null });
      }
      return profilesChain({ data: null, error: { message: 'rede' } });
    });
    vi.useFakeTimers();
    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(4100 * 4); });
    const contents = useAppStore.getState().coachMessages.map((m) => m.content);
    expect(contents).toContain('Cheguei.');
    expect(contents).not.toContain(COACH_ASYNC_FALLBACK_TEXT);
  });

  it('com o servidor ainda a trabalhar (lock ocupado), continua a sondar e apanha a resposta', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    let polls = 0;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        polls += 1;
        return coachMessagesChain(polls < 3
          ? { data: [], error: null }
          : { data: [{ id: 'm1', role: 'model', content: 'Aqui estou.', created_at: new Date().toISOString() }], error: null });
      }
      return profilesChain({ data: { id: 'user-1', coach_chat_busy_since: new Date().toISOString() }, error: null });
    });

    vi.useFakeTimers();
    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(4100 * 3); });
    expect(screen.getByText('Aqui estou.')).toBeInTheDocument();
    expect(screen.queryByText(/Não consegui responder. Tenta outra vez/)).not.toBeInTheDocument();
  });

  it('INCIDENTE 2026-09-12 — o 409 "busy" do servidor mostra-se na voz da Carol, não como falha de rede', async () => {
    // A recusa "Rui, ainda estou a acabar…" é escrita de propósito para o atleta a ler; o
    // cliente deitava-a fora e anunciava "A tua mensagem não saiu: falha de
    // rede" — que não houve.
    const busyText = 'Rui, ainda estou a acabar de te responder à mensagem anterior. Manda esta outra vez daqui a um instante.';
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: null,
      error: busyText,
      isTimeout: false,
      isBusy: true,
      // A frase veio do servidor (campo `error` do corpo): é para mostrar.
      serverText: busyText,
    });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });
    renderCoach();

    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Rui, ainda estou a acabar de te responder/)).toBeInTheDocument();
    expect(screen.queryByText(/A tua mensagem não saiu/)).not.toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);
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
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
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
    expect(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })).not.toBeDisabled();
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
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Avança para lá do prazo máximo de sondagem (180000ms).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(184000);
    });

    expect(screen.queryByTestId('coach-waiting-message')).not.toBeInTheDocument();
    expect(screen.getByText(/Não consegui responder/i)).toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Tenta de novo' } });
    expect(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })).not.toBeDisabled();
  }, 15000);

  it('em sucesso síncrono, comportamento normal mantém-se (regressão)', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Olá! Como posso ajudar?' }, suggestions: [], plan_proposed: false, goal_proposed: false, goals_updated: false },
      error: null,
    });

    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));

    await waitFor(() => expect(screen.getByText(/Como posso ajudar/i)).toBeInTheDocument());
    expect(useAppStore.getState().coachLoading).toBe(false);
  });

  // Incidente 2026-09-23: o servidor reconheceu um pedido repetido e devolveu
  // a resposta que já tinha dado — e essa resposta já estava no ecrã.
  it('pedido repetido: não repete a resposta já mostrada nem deixa a pergunta em dobro', async () => {
    useAppStore.setState({
      coachMessages: [
        { id: 'u1', role: 'user', content: 'Dieta para a recuperação?', created_at: new Date().toISOString() },
        { id: 'm1', role: 'model', content: 'Proteína alta e bem distribuída.', created_at: new Date().toISOString() },
      ],
    });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Proteína alta e bem distribuída.' }, duplicate: true, suggestions: [] },
      error: null,
    });

    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Dieta para a recuperação?' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));

    await waitFor(() => expect(useAppStore.getState().coachLoading).toBe(false));
    const msgs = useAppStore.getState().coachMessages;
    expect(msgs.filter((m) => m.content === 'Proteína alta e bem distribuída.')).toHaveLength(1);
    expect(msgs.filter((m) => m.content === 'Dieta para a recuperação?')).toHaveLength(1);
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
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Todas as variantes do aviso incluem o nome (ver WAITING_MESSAGES em
    // Coach.jsx) — o texto exato varia, o nome não.
    expect(screen.getByTestId('coach-waiting-message')).toHaveTextContent(/Patrícia/i);
  });

  // Revisão de 2026-09-26: sem nome, "atleta, isto está a demorar..." —
  // vocativo genérico, e com minúscula a abrir a frase.
  it('sem nome no perfil, o aviso de demora não tem vocativo nenhum e abre com maiúscula', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const aviso = screen.getByTestId('coach-waiting-message').textContent;
    expect(aviso).not.toMatch(/atleta/i);
    expect(aviso).toMatch(/^(Isto|Estou) /);
  });

  // Revisão de 2026-09-26: as variantes antigas mandavam alongar os gémeos
  // (com uma dor no gémeo em aberto), fazer uma prancha (à 01:30) ou
  // agachamentos, e falavam de servidor, ligação e dados — uma prometia que
  // "a resposta vem a caminho".
  it('nenhuma variante do aviso de demora sugere exercício, fala de sistema ou promete que a resposta vem a caminho', async () => {
    useAppStore.setState({ profile: { id: 'user-1', display_name: 'Rui Costa' } });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random');
    const vistos = new Set();
    for (const r of [0, 0.99]) {
      randomSpy.mockReturnValue(r);
      const { unmount } = renderCoach();
      fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
        await Promise.resolve();
        await Promise.resolve();
      });
      vistos.add(screen.getByTestId('coach-waiting-message').textContent);
      unmount();
      useAppStore.setState({ coachMessages: [], coachLoading: false });
    }
    randomSpy.mockRestore();
    expect(vistos.size).toBe(2);
    for (const aviso of vistos) {
      expect(aviso).toMatch(/^Rui, /);
      expect(aviso).not.toMatch(/agachament|gémeo|prancha|along|água|bebe|servidor|ligação|dados|process|vem a caminho/i);
    }
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
      randomSpy.mockReturnValue(i / 3); // espalha pelos índices do array de 2 variantes
      const { unmount } = renderCoach();
      fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
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
      // O pedido nunca chegou ao servidor (ação P.12) — isNetwork:true é o
      // que faz o Coach mostrar o aviso genérico em vez deste texto bruto.
      isNetwork: true,
    });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });

    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));

    await waitFor(() => expect(useAppStore.getState().coachMessages.map((m) => m.content)).toContain(COACH_IMMEDIATE_FAILURE_TEXT));
    // Não é o aviso de demora (não faz sentido esperar por algo que nunca
    // vai chegar — o pedido nunca saiu).
    expect(screen.queryByTestId('coach-waiting-message')).not.toBeInTheDocument();
    // Campo destravado de imediato — sem os 45s+sondagem do outro caminho.
    // O botão só fica ativo com texto por enviar (ver o mesmo padrão no
    // teste de sondagem acima) — testa o destravar do coachLoading
    // escrevendo de novo, não o estado "sem texto".
    expect(useAppStore.getState().coachLoading).toBe(false);
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Tenta de novo' } });
    expect(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })).not.toBeDisabled();
    // Sem sondagem: nenhuma leitura a coach_messages foi despoletada.
    expect(supabase.from).not.toHaveBeenCalledWith('coach_messages');
  });

  // Revisão pré-deploy de 2026-09-25: um erro do gateway (546 WORKER_LIMIT,
  // 503 BOOT_ERROR) responde sem frase dela — o `error` é o texto em inglês
  // da supabase-js, que aparecia na bolha da Carol.
  it('o servidor respondeu sem frase dela: aviso genérico, nunca o texto em inglês da supabase-js', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: null,
      error: 'Edge Function returned a non-2xx status code',
      isTimeout: false,
      isNetwork: false,
      status: 546,
      serverText: null,
    });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: null, error: null });
    });

    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));

    // O aviso genérico (COACH_IMMEDIATE_FAILURE_TEXT) sai partido em bolhas.
    expect(COACH_IMMEDIATE_FAILURE_TEXT).toMatch(/A rede falhou/);
    await waitFor(() => expect(screen.getByText(/A rede falhou/i)).toBeInTheDocument());
    expect(screen.queryByText(/non-2xx/)).not.toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);
  });

  // Revisão de 2026-09-26: "Não consegui responder: falha de rede ou de
  // ligação ao servidor" — "responder" pressupõe uma pergunta que num
  // "Falar com a Carol" não houve, e "ligação ao servidor" é de sistema.
  it('o aviso genérico de rede não presume pergunta nem fala do servidor', () => {
    expect(COACH_IMMEDIATE_FAILURE_TEXT).toBe('A rede falhou e não te consegui dizer nada. Tenta outra vez daqui a bocado.');
    expect(COACH_IMMEDIATE_FAILURE_TEXT).not.toMatch(/responder|servidor|ligação/i);
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

    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));

    await waitFor(() => expect(screen.getByPlaceholderText('Escreve a tua pergunta...').value).toBe(''));
    expect(localStorage.getItem('ironcoach:carol-chat-rascunho')).toBeNull();
    unmount();

    // Reabrir o chat: sem vestígios do rascunho enviado.
    renderCoach();
    expect(screen.getByPlaceholderText('Escreve a tua pergunta...').value).toBe('');
  });
});

// ─── CAROL.md — a Carol no chat (handoff 2026-09, ponto 10) ────────────────

function baseCarolState() {
  return {
    profile: { id: 'user-1', display_name: 'Rui' },
    coachMessages: [],
    coachLoading: false,
    coachSuggestions: [],
    coachPlans: [],
    coachPlanItems: [],
    coachGoalProposals: [],
    coachIntent: null,
    runs: [], meals: [], gymSessions: [], bodyAssessments: [], raceEvents: [], shoes: [], insightStates: {},
    session: { user: { id: 'user-1' } },
    setCoachIntent: (intent) => useAppStore.setState({ coachIntent: intent }),
    reloadCoachPlans: vi.fn().mockResolvedValue([]),
    reloadCoachGoalProposals: vi.fn().mockResolvedValue([]),
    respondToPlan: vi.fn().mockResolvedValue(true),
    respondToGoalProposal: vi.fn().mockResolvedValue(true),
  };
}

describe('Coach — CAROL.md §5: ritmo humano na escrita', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
  });

  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
  });

  it('a resposta chega precedida de "a escrever…" e entra uma ideia por bolha, 400 ms entre elas', async () => {
    // Sem prefers-reduced-motion: a animação corre.
    window.matchMedia = () => ({ matches: false });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: {
        model_message: { id: 'm1', content: 'Não gostei dos teus almoços esta semana.\n\nA ingestão ficou 12% abaixo do alvo nos dias longos.' },
        suggestions: ['Que faço ao almoço?'],
        plan_proposed: false, goal_proposed: false, goals_updated: false,
      },
      error: null,
    });

    vi.useFakeTimers();
    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });

    // Chegou, mas ainda não se lê: está "a escrever…".
    expect(screen.getByTestId('coach-typing')).toHaveTextContent('a escrever…');
    expect(screen.queryByText(/Não gostei dos teus almoços/)).not.toBeInTheDocument();
    expect(screen.queryByText('Que faço ao almoço?')).not.toBeInTheDocument();

    // 1.ª bolha ao fim do "a escrever…" (600-900 ms); a 2.ª ainda não.
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByText(/Não gostei dos teus almoços/)).toBeInTheDocument();
    expect(screen.queryByText(/12% abaixo do alvo/)).not.toBeInTheDocument();
    expect(screen.getByTestId('coach-typing')).toBeInTheDocument();

    // 2.ª bolha 400 ms depois; o indicador some e as sugestões aparecem.
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByText(/12% abaixo do alvo/)).toBeInTheDocument();
    expect(screen.queryByTestId('coach-typing')).not.toBeInTheDocument();
    expect(screen.getByText('Que faço ao almoço?')).toBeInTheDocument();
  });

  it('com prefers-reduced-motion as bolhas aparecem de imediato, sem "a escrever…"', async () => {
    window.matchMedia = () => ({ matches: true });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Primeira ideia.\n\nSegunda ideia.' }, suggestions: [], plan_proposed: false, goal_proposed: false, goals_updated: false },
      error: null,
    });
    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
    await waitFor(() => expect(screen.getByText(/Segunda ideia/)).toBeInTheDocument());
    expect(screen.getByText(/Primeira ideia/)).toBeInTheDocument();
    expect(screen.queryByTestId('coach-typing')).not.toBeInTheDocument();
  });

  it('o histórico já carregado lê-se inteiro — só as mensagens novas "escrevem"', () => {
    window.matchMedia = () => ({ matches: false });
    useAppStore.setState({
      coachMessages: [
        { id: 'h1', role: 'user', content: 'Como correu a semana?', created_at: new Date().toISOString() },
        { id: 'h2', role: 'model', content: 'Ficaste curto nos dias longos.\n\nÉ a terceira semana.', created_at: new Date().toISOString(), live: true },
      ],
    });
    renderCoach();
    expect(screen.getByText(/Ficaste curto nos dias longos/)).toBeInTheDocument();
    expect(screen.getByText(/É a terceira semana/)).toBeInTheDocument();
    expect(screen.queryByTestId('coach-typing')).not.toBeInTheDocument();
  });
});

describe('Coach — CAROL.md §3/§7: mensagens por iniciativa dela', () => {
  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('3 dias sem registo: ao abrir o chat a Carol escreve primeiro ("Estás bem?") — e só uma vez', async () => {
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({ runs: [{ id: 'r1', date: fiveDaysAgo, distance_km: 8, duration_seconds: 2400 }], ...planoDoSilencio(fiveDaysAgo) });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'p1', content: 'Estás bem? Não vejo nada teu há cinco dias.' }, suggestions: [], proactive: 'silence' },
      error: null,
    });

    const { unmount } = renderCoach();
    await waitFor(() => expect(screen.getByText(/Estás bem\?/)).toBeInTheDocument());
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1);
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body.proactive_trigger).toBe('silence');
    expect(body.message).toBe('');
    expect(body.proactive_details).toMatch(/há 5 dias/);
    // A chave vai para o servidor, que a regista para todos os dispositivos.
    expect(body.proactive_key).toBe(`silence:${fiveDaysAgo}`);

    // Segunda abertura: já foi dito, não volta a perguntar.
    unmount();
    renderCoach();
    await act(async () => { await Promise.resolve(); });
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('se o servidor saltar (ela falou há pouco), não fica marcado — volta a tentar na abertura seguinte', async () => {
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({ meals: [{ id: 'm1', date: fiveDaysAgo }], ...planoDoSilencio(fiveDaysAgo) });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { skipped: true, proactive: 'silence', model_message: null, suggestions: [] }, error: null });

    const { unmount } = renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/Estás bem/)).not.toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);

    unmount();
    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(2));
  });

  it('se outro dispositivo já recebeu a mensagem (already_sent), fica marcada — não volta a pedir', async () => {
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({ meals: [{ id: 'm1', date: fiveDaysAgo }], ...planoDoSilencio(fiveDaysAgo) });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { skipped: true, reason: 'already_sent', proactive: 'silence', model_message: null, suggestions: [] }, error: null });

    const { unmount } = renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/Estás bem/)).not.toBeInTheDocument();

    unmount();
    renderCoach();
    await act(async () => { await Promise.resolve(); });
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('P.9 — already_sent no primeiro candidato passa ao seguinte, sem parar a lista inteira', async () => {
    const today = localISO(new Date());
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    // Dois momentos ao mesmo tempo: o fim de bloco (prioridade sobre o
    // silêncio) e o silêncio — ver src/utils/proactiveParity.test.js para a
    // mesma combinação do lado do servidor.
    useAppStore.setState({
      meals: [{ id: 'm1', date: fiveDaysAgo }],
      coachPlans: [{ id: 'b1', status: 'aceite', race_id: null, period_start: fiveDaysAgo, period_end: today }],
      // planned_date dentro da janela do silêncio: sem nenhum treino previsto
      // no período, o plano aceite lia-se como descanso decidido e calava o
      // "Estás bem?" (revisão de 2026-09-26).
      coachPlanItems: [{ plan_id: 'b1', planned_date: localISO(new Date(Date.now() - 2 * 86400000)), kind: 'corrida' }],
    });
    invokeEdgeFunctionWithTimeout
      .mockResolvedValueOnce({ data: { skipped: true, reason: 'already_sent', proactive: 'block_end', model_message: null, suggestions: [] }, error: null })
      .mockResolvedValueOnce({ data: { model_message: { id: 'p2', content: 'Estás bem? Não vejo nada teu há cinco dias.' }, suggestions: [], proactive: 'silence' }, error: null });

    renderCoach();
    await waitFor(() => expect(screen.getByText(/Estás bem\?/)).toBeInTheDocument());
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    const secondBody = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[1][1].body);
    expect(firstBody.proactive_trigger).toBe('block_end');
    expect(secondBody.proactive_trigger).toBe('silence');
    // Sem toque nenhum, nenhuma tentativa silenciosa fura as quiet hours.
    expect(firstBody.proactive_force).toBeUndefined();
    expect(secondBody.proactive_force).toBeUndefined();
  });

  it('P.9 — uma notificação tocada põe esse candidato à cabeça da lista', async () => {
    const today = localISO(new Date());
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    // block_end tem prioridade sobre silence — sem o pedido, seria o primeiro.
    useAppStore.setState({
      meals: [{ id: 'm1', date: fiveDaysAgo }],
      coachPlans: [{ id: 'b1', status: 'aceite', race_id: null, period_start: fiveDaysAgo, period_end: today }],
      coachPlanItems: [{ plan_id: 'b1', planned_date: localISO(new Date(Date.now() - 2 * 86400000)), kind: 'corrida' }],
      proactiveKeyRequested: `silence:${fiveDaysAgo}`,
    });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'p1', content: 'Estás bem? Não vejo nada teu há cinco dias.' }, suggestions: [], proactive: 'silence' },
      error: null,
    });

    renderCoach();
    await waitFor(() => expect(screen.getByText(/Estás bem\?/)).toBeInTheDocument());
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1);
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body.proactive_trigger).toBe('silence');
    // O toque fura as quiet hours (como o balanço já faz) — só este pedido, não a tentativa silenciosa normal.
    expect(body.proactive_force).toBe(true);
    expect(useAppStore.getState().proactiveKeyRequested).toBeNull();
  });

  it('INCIDENTE 2026-09-12 — se o servidor recusar (409 busy), a mensagem proativa falha em silêncio: sem "A tua mensagem não saiu"', async () => {
    // O atleta não escreveu nada — uma bolha a dizer que a mensagem dele
    // não saiu, sozinha ao abrir o chat, era o que apareceu no incidente.
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({ meals: [{ id: 'm1', date: fiveDaysAgo }], ...planoDoSilencio(fiveDaysAgo) });
    const busyText = 'Rui, ainda estou a acabar de te responder à mensagem anterior. Manda esta outra vez daqui a um instante.';
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: null,
      error: busyText,
      isTimeout: false,
      isBusy: true,
      // A frase veio do servidor (campo `error` do corpo): é para mostrar.
      serverText: busyText,
    });

    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText(/A tua mensagem não saiu/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ainda estou a acabar de te responder/)).not.toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);
    expect(useAppStore.getState().coachMessages).toHaveLength(0);
  });

  it('sem registos e sem provas, abrir o chat não dispara nada', async () => {
    renderCoach();
    await act(async () => { await Promise.resolve(); });
    expect(invokeEdgeFunctionWithTimeout).not.toHaveBeenCalled();
    expect(screen.getByText(/Sou a Carol, a tua treinadora/)).toBeInTheDocument();
  });
});

/* specs/plano-de-prova.md, "O plano tem de saber da prova" — Alerta de
   ajuste. O Início deteta a divergência (utils/planDivergence.js) e abre o
   chat já no "Adaptar plano", com os motivos no corpo. */
describe('Coach — "o plano precisa de um ajuste"', () => {
  const SIGNATURE = 'p1|prova_sem_item:r1:2026-09-13';
  const STORAGE_KEY = 'ironcoach:plano-ajuste:user-1';

  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Vi que a prova não está no plano. Vamos arrumar isso.' }, suggestions: [] },
      error: null,
    });
  });

  it('o botão "Adaptar plano" (string) continua a fazer o check-in de sempre, sem motivos', async () => {
    useAppStore.setState({ coachIntent: 'adapt_plan' });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body.is_plan_checkin).toBe(true);
    expect(body.plan_divergence).toBeUndefined();
    await act(async () => { await Promise.resolve(); });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('vindo do Início com motivos: mesmo check-in, mas com plan_divergence — e a assinatura fica tratada', async () => {
    useAppStore.setState({
      coachIntent: { kind: 'adapt_plan', divergence: ['A Corrida do Tejo (13 set) não está no plano.'], signature: SIGNATURE },
    });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body.is_plan_checkin).toBe(true);
    expect(body.plan_divergence).toEqual(['A Corrida do Tejo (13 set) não está no plano.']);
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBe(SIGNATURE));
  });

  it('o servidor aceita no máximo 6 motivos', async () => {
    const oito = Array.from({ length: 8 }, (_, i) => `motivo ${i + 1}`);
    useAppStore.setState({ coachIntent: { kind: 'adapt_plan', divergence: oito, signature: SIGNATURE } });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body.plan_divergence).toHaveLength(6);
    expect(body.plan_divergence[5]).toBe('motivo 6');
  });

  it('se o pedido falhar, a assinatura NÃO fica tratada — ela volta a chamar', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'rede', isTimeout: false, isBusy: true });
    useAppStore.setState({ coachIntent: { kind: 'adapt_plan', divergence: ['x'], signature: SIGNATURE } });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

/* Bug 2026-09-14: o botão "Falar com a Carol" do aviso "O balanço da prova"
   (Início) só mudava de separador e deixava o efeito passivo abaixo apanhar
   o momento — que cede sempre que ela tiver falado há menos de 6h por
   qualquer outro motivo, e nesse caso o servidor responde `skipped: true`
   em silêncio: o atleta carregava no botão e não acontecia nada. Agora o
   Início manda o candidato via coachIntent 'race_balance' e isto força o
   pedido (`proactive_force`). */
describe('Coach — "O balanço da prova" pedido a partir do Início (coachIntent race_balance)', () => {
  const CANDIDATE = {
    trigger: 'race_after',
    key: 'race_after:race-1:run-1',
    details: 'Prova "Corrida do Tejo" foi há 1 dia (2026-09-13). Corrida registada: 45:00.',
    raceOutcome: { verdict: 'superado', officialSeconds: 2700 },
    raceId: 'race-1',
  };
  const STORAGE_KEY = 'ironcoach:carol-proativa:user-1';

  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
  });

  it('pede o balanço com proactive_force, mesmo que ela tivesse acabado de falar — e marca como dito', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Correste bem demais — superaste o objetivo.' }, suggestions: [] },
      error: null,
    });
    useAppStore.setState({ coachIntent: { kind: 'race_balance', candidate: CANDIDATE } });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body.proactive_trigger).toBe('race_after');
    expect(body.proactive_force).toBe(true);
    expect(body.race_outcome).toEqual(CANDIDATE.raceOutcome);
    expect(body.message).toBe('');
    await waitFor(() => expect(screen.getByText(/superaste o objetivo/)).toBeInTheDocument());
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({ race_after: CANDIDATE.key }));
    // E fica na mesma cópia local que utils/raceBalance.js usa — se o hub
    // (RaceBalanceCard) for aberto a seguir, mostra logo isto em vez de
    // convidar a pedir o balanço outra vez.
    expect(readCachedBalance('race-1')?.text).toBe('Correste bem demais — superaste o objetivo.');
  });

  it('se mesmo assim o servidor saltar, não fica marcado como dito', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { skipped: true, proactive: 'race_after', model_message: null, suggestions: [] },
      error: null,
    });
    useAppStore.setState({ coachIntent: { kind: 'race_balance', candidate: CANDIDATE } });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readCachedBalance('race-1')).toBeNull();
  });
});

/* Ação P.11: o aviso "O bloco está a acabar" do Início pede a conversa pelo
   mesmo caminho do balanço (coachIntent 'proactive_moment'), com o
   candidato do chat e da notificação. */
describe('Coach — "O bloco está a acabar" pedido a partir do Início (coachIntent proactive_moment)', () => {
  const CANDIDATE = {
    trigger: 'block_end',
    key: 'block_end:b1',
    details: 'O bloco de treino acaba daqui a 2 dias (2026-09-26) e não há outro a seguir.',
  };
  const STORAGE_KEY = 'ironcoach:carol-proativa:user-1';

  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
  });

  it('pede o fim de bloco com proactive_force e marca-o como dito', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'O bloco acaba no sábado. Vamos preparar o próximo.' }, suggestions: [] },
      error: null,
    });
    useAppStore.setState({ coachIntent: { kind: 'proactive_moment', candidate: CANDIDATE } });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body).toMatchObject({ proactive_trigger: 'block_end', proactive_key: 'block_end:b1', proactive_force: true, message: '' });
    expect(body.race_outcome).toBeUndefined();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({ block_end: 'block_end:b1' }));
    expect(useAppStore.getState().coachIntent).toBeNull();
  });

  it('a conversa já aconteceu noutro dispositivo: marca-a como dita, para o aviso do Início se calar', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { skipped: true, reason: 'already_sent', proactive: 'block_end', model_message: null, suggestions: [] },
      error: null,
    });
    useAppStore.setState({ coachIntent: { kind: 'proactive_moment', candidate: CANDIDATE } });
    renderCoach();

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({ block_end: 'block_end:b1' }));
  });
});


/* O botão "Falar com a Carol" do ecrã de um badge (Perfil/BadgeDetailSheet).
   O atleta pediu-lhe que lhe explicasse o badge: a pergunta DELE entra no
   chat como se a tivesse escrito, e o estado do badge viaja à parte, no
   `badgeContext` do corpo do pedido — nunca dentro da mensagem. É a porta
   que a doutrina 6 #6 prevê: o progresso de um badge só chega à Carol
   porque foi ele que perguntou, e só o deste badge. */
describe('Coach — explicar um badge (coachIntent badge)', () => {
  const INTENT = {
    kind: 'badge',
    badgeKey: 'escalada',
    badgeName: 'A Escalada',
    familia: 'acumulacao',
    pergunta: 'Explica-me o badge A Escalada — o que é que ele quer dizer e como é que se ganha?',
    estado: 'empty',
  };

  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'A Escalada soma os metros de subida.' }, suggestions: [] },
      error: null,
    });
  });

  it('envia a pergunta do atleta como mensagem, com o contexto do badge à parte', async () => {
    useAppStore.setState({ coachIntent: INTENT });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);

    // A mensagem visível é a do atleta, e só ela: nada de chaves nem de
    // marcadores dentro do texto.
    expect(body.message).toBe(INTENT.pergunta);
    expect(body.message).not.toMatch(/escalada|badgeContext|acumulacao/);
    await waitFor(() => expect(screen.getByText(INTENT.pergunta)).toBeInTheDocument());

    // O estado vai fora da mensagem, no molde do activeInsights.
    expect(body.badgeContext).toMatchObject({ key: 'escalada', familia: 'acumulacao', estado: 'empty' });
    expect(body.badgeContext.name).toBe('A Escalada');
    expect(typeof body.badgeContext.regra).toBe('string');
    // E o resto do payload de sempre continua lá.
    expect(Array.isArray(body.activeInsights)).toBe(true);
    // A intenção consome-se: uma pergunta, um pedido.
    expect(useAppStore.getState().coachIntent).toBeNull();
  });

  it('uma mensagem escrita à mão a seguir já não leva contexto de badge nenhum', async () => {
    useAppStore.setState({ coachIntent: INTENT });
    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'E o meu plano?' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
    });

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(2));
    const segundo = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[1][1].body);
    expect(segundo.message).toBe('E o meu plano?');
    expect(segundo.badgeContext).toBeUndefined();
  });
});

describe('Coach — CAROL.md §4: a cara acompanha o que ela diz', () => {
  const originalMatchMedia = window.matchMedia;
  const headerMood = (container) => container.querySelector('[data-mood]').getAttribute('data-mood');
  const messageMoods = () => screen.getAllByTestId('coach-message-carol')
    .map((el) => el.querySelector('[data-mood]').getAttribute('data-mood'));

  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
    window.matchMedia = () => ({ matches: true });
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('cada mensagem dela tem a sua emoção — a gravada pelo modelo, ou a que o texto sugere', () => {
    const now = new Date().toISOString();
    useAppStore.setState({
      coachMessages: [
        { id: 'a', role: 'model', content: 'Novo recorde nos 10 km.', mood: 'proud', created_at: now },
        { id: 'b', role: 'user', content: 'Tenho uma dor no joelho.', created_at: now },
        // Mensagem antiga, sem emoção gravada: vale o texto.
        { id: 'c', role: 'model', content: 'Uma dor de 6 não se ignora. Hoje não se força.', created_at: now },
      ],
    });
    const { container } = renderCoach();
    expect(messageMoods()).toEqual(['proud', 'worried']);
    // O cabeçalho fica com a da última.
    expect(headerMood(container)).toBe('worried');
  });

  it('enquanto pensa, "a pensar"; quando responde, a emoção da resposta', async () => {
    let resolve;
    invokeEdgeFunctionWithTimeout.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { container } = renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Dormi mal.' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
    await waitFor(() => expect(headerMood(container)).toBe('thinking'));

    await act(async () => {
      resolve({
        data: { model_message: { id: 'r1', content: 'Hoje fazemos menos.', mood: 'caring' }, suggestions: [], plan_proposed: false, goal_proposed: false, goals_updated: false },
        error: null,
      });
    });
    await waitFor(() => expect(headerMood(container)).toBe('caring'));
    expect(messageMoods()).toEqual(['caring']);
  });

  it('no dia seguinte o cabeçalho volta à neutra; a mensagem guarda a sua', () => {
    const ontem = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    useAppStore.setState({
      coachMessages: [{ id: 'a', role: 'model', content: 'Isto preocupa-me.', mood: 'worried', created_at: ontem }],
    });
    const { container } = renderCoach();
    expect(headerMood(container)).toBe('neutral');
    expect(messageMoods()).toEqual(['worried']);
  });
});

/* Revisão de 2026-09-26 (backlog, Coach.jsx): o que o chat diz quando a
   conversa foi aberta por ela, ou pela app, e não pelo atleta. */
describe('Coach — conversas que o atleta não escreveu', () => {
  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Segunda-feira, a revisão semanal pedida em silêncio ao abrir o chat dá
  // timeout: apareciam o aviso de demora e, no fim, "Não consegui
  // responder" — sem o atleta ter escrito nada.
  it('mensagem proativa silenciosa com timeout e sem resposta: nem aviso de demora nem erro', async () => {
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({ meals: [{ id: 'm1', date: fiveDaysAgo }], ...planoDoSilencio(fiveDaysAgo) });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: { coach_chat_busy_since: null }, error: null });
    });

    vi.useFakeTimers();
    renderCoach();
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('coach-waiting-message')).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(8200); });
    expect(useAppStore.getState().coachMessages).toHaveLength(0);
    expect(screen.queryByText(/Não consegui/)).not.toBeInTheDocument();
    expect(useAppStore.getState().coachLoading).toBe(false);
  });

  it('mensagem proativa silenciosa com timeout: se a resposta chegar pela sondagem, mostra-a (e só ela)', async () => {
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({ meals: [{ id: 'm1', date: fiveDaysAgo }], ...planoDoSilencio(fiveDaysAgo) });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    let polls = 0;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        polls += 1;
        return coachMessagesChain(polls < 2
          ? { data: [], error: null }
          : { data: [{ id: 'w1', role: 'model', content: 'A semana ficou curta nos longos.', created_at: new Date().toISOString() }], error: null });
      }
      return profilesChain({ data: { coach_chat_busy_since: new Date().toISOString() }, error: null });
    });

    vi.useFakeTimers();
    renderCoach();
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(screen.queryByTestId('coach-waiting-message')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(8200 + 2000); });
    const contents = useAppStore.getState().coachMessages.map((m) => m.content);
    expect(contents).toEqual(['A semana ficou curta nos longos.']);
  });

  // O assunto por resolver do perfil, como o Início (e a notificação) o
  // pedem: é o único caso em que lá fica um "Falar com a Carol" a que voltar.
  const assuntoNoInicio = () => ({
    profile: { id: 'user-1', display_name: 'Rui', coach_intervention_status: 'needed', coach_intervention_reason: 'Dor 6 no gémeo.' },
    coachIntent: { kind: 'proactive_intervention', reason: 'Dor 6 no gémeo.' },
  });
  const semRespostaNaSondagem = () => supabase.from.mockImplementation((table) => {
    if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
    return profilesChain({ data: { coach_chat_busy_since: null }, error: null });
  });
  const timeoutSemResposta = async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    semRespostaNaSondagem();
    vi.useFakeTimers();
    renderCoach();
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(8200); });
    return useAppStore.getState().coachMessages.map((m) => m.content);
  };

  it('"Falar com a Carol" de uma intervenção, timeout sem resposta: diz onde voltar a tocar', async () => {
    useAppStore.setState(assuntoNoInicio());
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      return profilesChain({ data: { coach_chat_busy_since: null }, error: null });
    });

    vi.useFakeTimers();
    renderCoach();
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(screen.getByTestId('coach-waiting-message')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(8200); });
    const contents = useAppStore.getState().coachMessages.map((m) => m.content);
    expect(contents).toEqual([COACH_INITIATED_FALLBACK_TEXT]);
    expect(COACH_INITIATED_FALLBACK_TEXT).toBe('Não consegui acabar o que te queria dizer. Volta a tocar em Falar com a Carol, no Início.');
  });

  it('"Falar com a Carol" de uma intervenção, falha de rede: sem "responder" nem "servidor", e diz onde voltar a tocar', async () => {
    useAppStore.setState(assuntoNoInicio());
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: null, error: 'Failed to send a request to the Edge Function', isTimeout: false, isNetwork: true, serverText: null,
    });

    renderCoach();
    await waitFor(() => expect(useAppStore.getState().coachLoading).toBe(false));
    await waitFor(() => expect(useAppStore.getState().coachMessages.map((m) => m.content)).toEqual([COACH_INITIATED_NETWORK_TEXT]));
    expect(COACH_INITIATED_NETWORK_TEXT).toBe('A rede falhou. Volta a tocar em Falar com a Carol, no Início.');
  });

  // O mesmo intent vem da janela dos insights, que os marca como entendidos
  // — o Início deixa de os mostrar, e mandar lá voltar era nomear um botão
  // que já não existe. Mesmo com um assunto por resolver no Início: esse é
  // outra conversa.
  it('vindo dos insights, timeout sem resposta: sem "responder" e sem mandar voltar ao Início', async () => {
    useAppStore.setState({
      ...assuntoNoInicio(),
      coachIntent: { kind: 'proactive_intervention', reason: 'O atleta abriu o chat a partir dos Insights da Carol. Aborda proativamente estes temas: Carga a subir.' },
    });
    const contents = await timeoutSemResposta();
    expect(contents).toEqual([COACH_INITIATED_LATER_TEXT]);
    expect(COACH_INITIATED_LATER_TEXT).toBe('Não consegui acabar o que te queria dizer. Tenta outra vez daqui a bocado.');
    expect(COACH_INITIATED_LATER_TEXT).not.toMatch(/Início|Falar com a Carol|respond|servidor|!/);
  });

  it('vindo do cartão de uma corrida (com o mesmo motivo): nem o timeout nem a rede mandam voltar ao Início', async () => {
    const doCartao = { kind: 'proactive_intervention', recordType: 'run', recordId: 'r1', recordName: 'Rodagem', date: localISO(new Date()), reason: 'Dor 6 no gémeo.' };
    useAppStore.setState({ ...assuntoNoInicio(), coachIntent: doCartao });
    expect(await timeoutSemResposta()).toEqual([COACH_INITIATED_LATER_TEXT]);
  });

  it('vindo do ecrã de um registo, falha de rede: o aviso genérico, sem mandar voltar ao Início', async () => {
    useAppStore.setState({
      ...assuntoNoInicio(),
      coachIntent: { kind: 'proactive_intervention', recordType: 'meal', recordId: 'm1', recordName: 'Almoço', date: localISO(new Date()), reason: 'Pouca proteína.' },
    });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: null, error: 'Failed to send a request to the Edge Function', isTimeout: false, isNetwork: true, serverText: null,
    });
    renderCoach();
    await waitFor(() => expect(useAppStore.getState().coachMessages.map((m) => m.content)).toEqual([COACH_IMMEDIATE_FAILURE_TEXT]));
  });

  it('o assunto já resolvido (noutro dispositivo): no Início já não há aviso, por isso não manda lá voltar', async () => {
    useAppStore.setState({ coachIntent: { kind: 'proactive_intervention', reason: null } });
    expect(await timeoutSemResposta()).toEqual([COACH_INITIATED_LATER_TEXT]);
  });

  // É ela que abre, no fim do arranque: "Não consegui responder" presumia
  // uma pergunta que não houve.
  it('fim do arranque, timeout sem resposta: sem "responder" e sem mandar voltar ao Início', async () => {
    useAppStore.setState({ coachIntent: 'onboarding_start' });
    const contents = await timeoutSemResposta();
    expect(contents).toEqual([COACH_INITIATED_LATER_TEXT]);
    expect(contents).not.toContain(COACH_ASYNC_FALLBACK_TEXT);
  });

  // A revisão semanal ao abrir o chat, em silêncio: enquanto espera — antes
  // e depois do timeout — o ecrã fica como estava. Antes ficava "a
  // escrever…" até 3 minutos, sem ecrã vazio nem sugestões, e com o campo
  // travado.
  it('mensagem proativa silenciosa: enquanto espera não há "a escrever…", o ecrã vazio e as sugestões ficam à vista e o campo livre', async () => {
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({ meals: [{ id: 'm1', date: fiveDaysAgo }], ...planoDoSilencio(fiveDaysAgo) });
    let resolveInvoke;
    invokeEdgeFunctionWithTimeout.mockReturnValue(new Promise((r) => { resolveInvoke = r; }));
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') return coachMessagesChain({ data: [], error: null });
      // O servidor ainda a trabalhar: a sondagem continua.
      return profilesChain({ data: { coach_chat_busy_since: new Date().toISOString() }, error: null });
    });

    vi.useFakeTimers();
    renderCoach();
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Olá' } });
    const ecraComoEstava = () => {
      expect(screen.queryByTestId('coach-typing')).not.toBeInTheDocument();
      expect(screen.getByText('Sou a Carol, a tua treinadora.')).toBeInTheDocument();
      expect(screen.getByText('Como está a minha nutrição hoje?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })).not.toBeDisabled();
      expect(useAppStore.getState().coachLoading).toBe(false);
    };
    ecraComoEstava();

    await act(async () => { resolveInvoke({ data: null, error: 'timeout', isTimeout: true }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(8200); });
    ecraComoEstava();
    expect(screen.queryByTestId('coach-waiting-message')).not.toBeInTheDocument();
  });

  it('mensagem proativa silenciosa: as sugestões da conversa anterior não desaparecem só por ela ter tentado', async () => {
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({
      meals: [{ id: 'm1', date: fiveDaysAgo }], ...planoDoSilencio(fiveDaysAgo),
      coachMessages: [{ id: 'h1', role: 'model', content: 'Amanhã é dia de longo.', created_at: new Date().toISOString() }],
      coachSuggestions: ['Que ritmo levo no longo?'],
    });
    invokeEdgeFunctionWithTimeout.mockReturnValue(new Promise(() => {}));
    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Que ritmo levo no longo?')).toBeInTheDocument();
    expect(screen.queryByTestId('coach-typing')).not.toBeInTheDocument();
  });

  // O campo livre não pode levar a pergunta por cima do pedido dela: o
  // servidor ainda o tem em mãos e respondia 409 `busy`.
  it('o que o atleta escreve durante a sondagem silenciosa espera a vez, e a mensagem dela entra primeiro', async () => {
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    useAppStore.setState({ meals: [{ id: 'm1', date: fiveDaysAgo }], ...planoDoSilencio(fiveDaysAgo) });
    invokeEdgeFunctionWithTimeout
      .mockResolvedValueOnce({ data: null, error: 'timeout', isTimeout: true })
      .mockResolvedValueOnce({ data: { model_message: { id: 'r1', content: 'Hoje fazes 8 km leves.' }, suggestions: [] }, error: null });
    let polls = 0;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        polls += 1;
        return coachMessagesChain(polls < 2
          ? { data: [], error: null }
          : { data: [{ id: 'w1', role: 'model', content: 'A semana ficou curta nos longos.', created_at: new Date().toISOString() }], error: null });
      }
      return profilesChain({ data: { coach_chat_busy_since: new Date().toISOString() }, error: null });
    });

    vi.useFakeTimers();
    renderCoach();
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Quanto corro hoje?' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
    // À vista, e ela a escrever-lhe — mas ainda não saiu.
    expect(screen.getByText('Quanto corro hoje?')).toBeInTheDocument();
    expect(screen.getByTestId('coach-typing')).toBeInTheDocument();
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(8200 + 2000); });
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(2);
    expect(JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[1][1].body).message).toBe('Quanto corro hoje?');
    expect(useAppStore.getState().coachMessages.map((m) => m.content))
      .toEqual(['Quanto corro hoje?', 'A semana ficou curta nos longos.', 'Hoje fazes 8 km leves.']);
    expect(useAppStore.getState().coachLoading).toBe(false);
  });

  it('se ele escrever enquanto ela tenta os momentos dela, a lista para ali: a pergunta dele sai a seguir, sem outro momento pelo meio', async () => {
    const today = localISO(new Date());
    const fiveDaysAgo = localISO(new Date(Date.now() - 5 * 86400000));
    // Dois momentos: o fim de bloco primeiro, o silêncio a seguir (como no P.9).
    useAppStore.setState({
      meals: [{ id: 'm1', date: fiveDaysAgo }],
      coachPlans: [{ id: 'b1', status: 'aceite', race_id: null, period_start: fiveDaysAgo, period_end: today }],
      coachPlanItems: [{ plan_id: 'b1', planned_date: localISO(new Date(Date.now() - 2 * 86400000)), kind: 'corrida' }],
    });
    let resolveFirst;
    invokeEdgeFunctionWithTimeout
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ data: { model_message: { id: 'r1', content: 'Hoje fazes 8 km leves.' }, suggestions: [] }, error: null });

    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Quanto corro hoje?' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
    await act(async () => {
      resolveFirst({ data: { skipped: true, reason: 'already_sent', proactive: 'block_end', model_message: null, suggestions: [] }, error: null });
    });
    await waitFor(() => expect(screen.getByText('Hoje fazes 8 km leves.')).toBeInTheDocument());
    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(2);
    expect(JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[1][1].body).message).toBe('Quanto corro hoje?');
  });

  it('o "Adaptar Plano" do cartão do plano não manda voltar a um "Falar com a Carol" que lá não há', async () => {
    useAppStore.setState({ coachIntent: 'adapt_plan' });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: null, error: 'Failed to send a request to the Edge Function', isTimeout: false, isNetwork: true, serverText: null,
    });

    renderCoach();
    await waitFor(() => expect(useAppStore.getState().coachMessages.map((m) => m.content)).toEqual([COACH_IMMEDIATE_FAILURE_TEXT]));
  });

  // A bolha do atleta dizia "atualiza a nota quando estivermos de acordo" —
  // o mecanismo, na boca dele. O pedido vai no corpo, fora da mensagem.
  it('mudar uma nota da memória: a bolha é o que o atleta diria; o pedido de atualizar vai à parte', async () => {
    const note = 'Prefere correr de manhã.';
    useAppStore.setState({ coachIntent: { kind: 'discuss_note', note } });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'n1', content: 'Diz-me o que mudou.' }, suggestions: [] },
      error: null,
    });

    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body.message).toBe(`Há uma coisa que tens anotada sobre mim que já não está certa: "${note}"`);
    expect(body.message).not.toMatch(/atualiz|memória|registad/i);
    expect(body.noteDiscussion).toMatchObject({ note });
    expect(body.noteDiscussion.instruction).toMatch(/atualiza/);
    expect(useAppStore.getState().coachMessages.find((m) => m.role === 'user').content).toBe(body.message);
  });
});

describe('Coach — o ecrã vazio conforme o que já existe', () => {
  const hoje = () => localISO(new Date());
  const daqui = (dias) => localISO(new Date(Date.now() + dias * 86400000));

  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState(baseCarolState());
    // Se algum momento proativo disparar, salta logo — o ecrã vazio volta.
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { skipped: true }, error: null });
  });

  it('conta nova sem prova nem registos: sem "meia maratona", sem "ou a prova", e diz que ainda não há registos', async () => {
    renderCoach();
    await waitFor(() => expect(screen.getByText('Ainda não tenho registos teus. Diz-me o que queres preparar e começamos por aí.')).toBeInTheDocument());
    expect(screen.getByText('Cria-me um plano de treino')).toBeInTheDocument();
    expect(screen.queryByText(/meia maratona/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ou a prova/)).not.toBeInTheDocument();
    expect(screen.getByText('Sou a Carol, a tua treinadora.')).toBeInTheDocument();
  });

  it('com o arranque feito (ela já se apresentou), não repete a apresentação', async () => {
    useAppStore.setState({ profile: { id: 'user-1', display_name: 'Rui', onboarding_done: true } });
    renderCoach();
    await waitFor(() => expect(screen.getByText('Estou aqui.')).toBeInTheDocument());
    expect(screen.queryByText(/Sou a Carol/)).not.toBeInTheDocument();
  });

  it('com registos e sem prova: sem "ou a prova"', async () => {
    useAppStore.setState({ runs: [{ id: 'r1', date: hoje(), distance_km: 8, duration_seconds: 2400 }] });
    renderCoach();
    await waitFor(() => expect(screen.getByText('Tenho os teus dados de hoje e o teu perfil à frente. Pergunta-me sobre o treino ou a alimentação.')).toBeInTheDocument());
    expect(screen.getByText('Cria-me um plano de treino')).toBeInTheDocument();
  });

  it('com um 10 km marcado: o plano é para a prova dele, não para uma meia maratona', async () => {
    useAppStore.setState({
      runs: [{ id: 'r1', date: hoje(), distance_km: 8, duration_seconds: 2400 }],
      raceEvents: [{ id: 'e1', name: 'Corrida do Tejo', date: daqui(40), distance_km: 10, status: 'agendada' }],
    });
    renderCoach();
    await waitFor(() => expect(screen.getByText('Cria-me um plano para a minha prova')).toBeInTheDocument());
    expect(screen.queryByText(/meia maratona/i)).not.toBeInTheDocument();
    expect(screen.getByText(/o treino, a alimentação ou a prova\./)).toBeInTheDocument();
  });

  it('com um plano já aceite: pergunta pelo plano em vez de pedir outro', async () => {
    useAppStore.setState({
      runs: [{ id: 'r1', date: hoje(), distance_km: 8, duration_seconds: 2400 }],
      raceEvents: [{ id: 'e1', name: 'Corrida do Tejo', date: daqui(40), distance_km: 10, status: 'agendada' }],
      coachPlans: [{ id: 'p1', status: 'aceite', race_id: 'e1', period_start: localISO(new Date(Date.now() - 10 * 86400000)), period_end: daqui(40) }],
    });
    renderCoach();
    await waitFor(() => expect(screen.getByText('Como está a correr o meu plano?')).toBeInTheDocument());
    expect(screen.queryByText(/Cria-me um plano/)).not.toBeInTheDocument();
  });
});

/* O mapa da época (specs/trofeu.md §5, Fase 2): o aviso do Início manda o
   coachIntent 'cup_map' e isto pede ao servidor o turno do mapa pelo canal do
   check-in do plano. Quando o servidor confirma que o turno foi o do mapa
   (cup_map_shown), a assinatura fica tratada aqui (localStorage) e nos outros
   dispositivos (impressão 'moment', sem título). */
describe('Coach — "O mapa da época" pedido a partir do Início (coachIntent cup_map)', () => {
  const SIGNATURE = 'cup_map:ed-cascais-34:1abc';
  const STORAGE_KEY = 'ironcoach:mapa-epoca:user-1';
  let logImpression;
  let refreshCupAfterChat;
  let loadCup;

  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    logImpression = vi.fn();
    refreshCupAfterChat = vi.fn().mockResolvedValue(undefined);
    loadCup = vi.fn().mockResolvedValue(null);
    useAppStore.setState({ ...baseCarolState(), logImpression, refreshCupAfterChat, loadCup });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Aqui vai o mapa da tua época.' }, suggestions: [], cup_map_shown: true },
      error: null,
    });
  });

  it('pede o check-in do plano com cup_map.first, e com a resposta marca a assinatura', async () => {
    useAppStore.setState({ coachIntent: { kind: 'cup_map', signature: SIGNATURE, first: true } });
    renderCoach();

    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    expect(invokeEdgeFunctionWithTimeout.mock.calls[0][0]).toBe('coach-chat');
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body).toMatchObject({ message: '', is_plan_checkin: true, cup_map: { first: true } });
    // Nada de assinatura, de edição ou de motivos no corpo: o servidor monta
    // o guião a partir do bloco da competição.
    expect(JSON.stringify(body)).not.toContain('cup_map:');
    expect(body.plan_divergence).toBeUndefined();
    expect(useAppStore.getState().coachIntent).toBeNull();

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual([SIGNATURE]));
    expect(logImpression).toHaveBeenCalledWith({ kind: 'moment', key: SIGNATURE, title: null });
    expect(refreshCupAfterChat).not.toHaveBeenCalled();
  });

  it('depois do primeiro, first vai a false', async () => {
    useAppStore.setState({ coachIntent: { kind: 'cup_map', signature: SIGNATURE, first: false } });
    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    expect(JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body).cup_map).toEqual({ first: false });
  });

  it('se o pedido falhar, nada fica marcado — o aviso volta', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'rede', isTimeout: false });
    useAppStore.setState({ coachIntent: { kind: 'cup_map', signature: SIGNATURE, first: true } });
    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(logImpression).not.toHaveBeenCalled();
  });

  it('se o servidor saltar o turno, também não', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { skipped: true, model_message: null, suggestions: [] }, error: null });
    useAppStore.setState({ coachIntent: { kind: 'cup_map', signature: SIGNATURE, first: true } });
    renderCoach();
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(logImpression).not.toHaveBeenCalled();
  });

  /* Revisão da Fase 2: uma resposta dela que não foi a do mapa — um servidor
     que não o conhece responde com o guião do "Adaptar Plano" — não o dá por
     tratado; senão o mapa, e as perguntas da época, perdiam-se sem ter sido
     mostrados. */
  it('resposta sem cup_map_shown (não foi o turno do mapa): mostra-a, mas nada fica marcado', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Olá Rui! Queres mexer em alguma coisa do plano?' }, suggestions: [] },
      error: null,
    });
    useAppStore.setState({ coachIntent: { kind: 'cup_map', signature: SIGNATURE, first: true } });
    renderCoach();
    await waitFor(() => expect(useAppStore.getState().coachMessages.map((m) => m.content)).toContain('Olá Rui! Queres mexer em alguma coisa do plano?'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(logImpression).not.toHaveBeenCalled();
  });

  it('cup_map_unavailable (sem bloco ativo no servidor): uma frase, nada marcado, e a competição relê-se', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { skipped: true, reason: 'cup_map_unavailable', model_message: null, suggestions: [] },
      error: null,
    });
    useAppStore.setState({ coachIntent: { kind: 'cup_map', signature: SIGNATURE, first: true } });
    renderCoach();
    await waitFor(() => expect(useAppStore.getState().coachMessages.map((m) => m.content)).toContain(COACH_EMPTY_REPLY_TEXT));
    expect(loadCup).toHaveBeenCalledWith({ force: true });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(logImpression).not.toHaveBeenCalled();
  });

  it('cup_updated na resposta do mapa: relê a competição e as provas', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Gravei a jornada como combinámos.' }, suggestions: [], cup_updated: true },
      error: null,
    });
    useAppStore.setState({ coachIntent: { kind: 'cup_map', signature: SIGNATURE, first: true } });
    renderCoach();
    await waitFor(() => expect(refreshCupAfterChat).toHaveBeenCalledTimes(1));
  });

  it('cup_updated numa mensagem normal: o mesmo refresh; sem a chave, nenhum', async () => {
    renderCoach();
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Vou à jornada 3.' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
    });
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(refreshCupAfterChat).not.toHaveBeenCalled();

    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm2', content: 'Gravei: jornada 3, vais.' }, suggestions: [], cup_updated: true },
      error: null,
    });
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'E quero atacar.' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i }));
    });
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(refreshCupAfterChat).toHaveBeenCalledTimes(1));
  });
});
