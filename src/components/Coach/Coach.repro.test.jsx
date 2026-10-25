import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Regressão do caso de pssmartins (25/10): o turno que propõe a semana 1 demora
   91 s, chega por sondagem, e a linha do modelo traz o plan_continuation. */
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: vi.fn() } },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));
const { supabase, invokeEdgeFunctionWithTimeout } = await import('../../lib/supabase');
const { useAppStore } = await import('../../store');
const { default: Coach } = await import('./Coach');
const { ToastProvider } = await import('../shared/ToastProvider');

const CONT = { of: 5, to: '2026-11-08', from: '2026-11-02', part: 2, until: '2026-11-29' };
const PLAN = { id: 'p1', status: 'proposto', race_id: 'race-meia', period_start: '2026-10-26', period_end: '2026-11-01', summary: 'Semana 1' };

function chain(result) {
  return { select: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ order: () => ({ limit: () => Promise.resolve(result()) }) }) }) }) }) };
}

Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});

describe('repro pssmartins 25/10', () => {
  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    window.localStorage.clear();
    useAppStore.setState({
      profile: { id: 'user-1', display_name: 'P' }, session: { user: { id: 'user-1' } },
      coachMessages: [], coachLoading: false, coachSuggestions: [], coachPlans: [], coachPlanItems: [], coachGoalProposals: [],
      runs: [], meals: [], gymSessions: [], bodyAssessments: [], raceEvents: [], shoes: [], insightStates: {},
      reloadCoachPlans: vi.fn().mockImplementation(() => Promise.resolve([PLAN])),
      reloadCoachGoalProposals: vi.fn().mockResolvedValue([]),
      respondToPlan: vi.fn().mockResolvedValue(true),
    });
  });

  it('91 s por sondagem: abre «Parte 1 de 5» com «Aceitar e ver próximos 7 dias»', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    let rowReady = false;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        return chain(() => (rowReady
          ? { data: [{ id: 'm1', role: 'model', content: 'Aqui tens a primeira semana.', created_at: new Date().toISOString(), plan_continuation: CONT }], error: null }
          : { data: [], error: null }));
      }
      // O lock continua ocupado enquanto o servidor trabalha.
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { coach_chat_busy_since: new Date().toISOString() }, error: null }) }) }) };
    });
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Coach /></ToastProvider>);
      fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Quero um plano até à meia' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(46000); });
      rowReady = false;
      await act(async () => { await vi.advanceTimersByTimeAsync(45000); });
      rowReady = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
      expect(useAppStore.getState().coachMessages.map((m) => m.content)).toContain('Aqui tens a primeira semana.');
      expect(screen.getByTestId('plan-part-note')).toHaveTextContent('Parte 1 de 5');
      expect(screen.getByRole('button', { name: 'Aceitar e ver próximos 7 dias' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  const ITENS = Array.from({ length: 7 }, (_, n) => ({ id: 'i' + n, plan_id: 'p1', kind: 'corrida', planned_date: '2026-10-2' + (6 + n) }));

  it('sem cadeia em memória (sondagem desistiu / página recarregada): abrir a folha pelo botão vai buscar o plan_continuation à base → «Parte 1 de 5»', async () => {
    supabase.from.mockImplementation((table) => {
      if (table !== 'coach_messages') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
      // select().eq(user).eq(role).not(plan_continuation).order().limit()
      return { select: () => ({ eq: () => ({ eq: () => ({ not: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{ id: 'm1', role: 'model', plan_continuation: CONT }], error: null }) }) }) }) }) }) };
    });
    // Uma proposta pendente, nada na conversa do store (a linha nunca lá chegou).
    useAppStore.setState({ coachPlans: [PLAN], coachPlanItems: ITENS, coachMessages: [] });
    render(<ToastProvider><Coach /></ToastProvider>);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /Proposta de plano por rever [(]1[)]/ })); });
    expect(await screen.findByTestId('plan-part-note')).toHaveTextContent('Parte 1 de 5');
    expect(screen.getByRole('button', { name: 'Aceitar e ver próximos 7 dias' })).toBeInTheDocument();
    expect(useAppStore.getState().respondToPlan).not.toHaveBeenCalled();
  });

  it('sem plan_continuation na base: proposta normal, «Aceitar plano»', async () => {
    supabase.from.mockImplementation((table) => (table !== 'coach_messages'
      ? { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ eq: () => ({ not: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }) }));
    useAppStore.setState({ coachPlans: [PLAN], coachPlanItems: ITENS, coachMessages: [] });
    render(<ToastProvider><Coach /></ToastProvider>);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /Proposta de plano por rever [(]1[)]/ })); });
    expect(await screen.findByRole('button', { name: 'Aceitar plano' })).toBeInTheDocument();
    expect(screen.queryByTestId('plan-part-note')).not.toBeInTheDocument();
  });

  it('a sondagem desiste (lock livre) e a resposta chega depois: a leitura tardia mostra-a e abre «Parte 1 de 5»', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    let rowReady = false;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        return chain(() => (rowReady
          ? { data: [{ id: 'm1', role: 'model', content: 'Aqui tens a primeira semana.', created_at: new Date().toISOString(), plan_continuation: CONT }], error: null }
          : { data: [], error: null }));
      }
      // O lock aparece livre: a sondagem desiste ao fim de duas leituras.
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { coach_chat_busy_since: null }, error: null }) }) }) };
    });
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Coach /></ToastProvider>);
      fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Quero um plano até à meia' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
      // Desistiu: sem resposta no ecrã.
      expect(useAppStore.getState().coachMessages.map((m) => m.content)).not.toContain('Aqui tens a primeira semana.');
      expect(screen.queryByTestId('plan-part-note')).not.toBeInTheDocument();
      // A resposta chega mais tarde: a leitura tardia apanha-a.
      rowReady = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(16000); });
      expect(useAppStore.getState().coachMessages.map((m) => m.content)).toContain('Aqui tens a primeira semana.');
      expect(screen.getByTestId('plan-part-note')).toHaveTextContent('Parte 1 de 5');
    } finally {
      vi.useRealTimers();
    }
  });

  it('um envio novo cancela as leituras tardias: a resposta ao pedido seguinte não passa pelo pós-sondagem antigo', async () => {
    let n = 0;
    invokeEdgeFunctionWithTimeout.mockImplementation(() => {
      n += 1;
      return Promise.resolve(n === 1
        ? { data: null, error: 'timeout', isTimeout: true }
        : { data: { model_message: { id: 'r2', content: 'Resposta ao segundo pedido.' }, suggestions: [] }, error: null });
    });
    let rowReady = false;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        return chain(() => (rowReady
          ? { data: [{ id: 'm1', role: 'model', content: 'Resposta tardia ao primeiro.', created_at: new Date().toISOString(), plan_continuation: CONT }], error: null }
          : { data: [], error: null }));
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { coach_chat_busy_since: null }, error: null }) }) }) };
    });
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Coach /></ToastProvider>);
      fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Primeiro pedido' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
      // O atleta não espera e envia outra: as releituras do primeiro caem.
      fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Segundo pedido' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      rowReady = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(100000); });
      const falas = useAppStore.getState().coachMessages.map((m) => m.content);
      expect(falas).toContain('Resposta ao segundo pedido.');
      expect(falas).not.toContain('Resposta tardia ao primeiro.');
      expect(screen.queryByTestId('plan-part-note')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a resposta tardia retira a bolha de falha («Não consegui responder»)', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'timeout', isTimeout: true });
    let rowReady = false;
    supabase.from.mockImplementation((table) => {
      if (table === 'coach_messages') {
        return chain(() => (rowReady
          ? { data: [{ id: 'm1', role: 'model', content: 'Aqui tens a primeira semana.', created_at: new Date().toISOString(), plan_continuation: CONT }], error: null }
          : { data: [], error: null }));
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { coach_chat_busy_since: null }, error: null }) }) }) };
    });
    vi.useFakeTimers();
    try {
      render(<ToastProvider><Coach /></ToastProvider>);
      fireEvent.change(screen.getByPlaceholderText('Escreve a tua pergunta...'), { target: { value: 'Quero um plano' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Enviar pergunta à Carol/i })); });
      await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
      expect(useAppStore.getState().coachMessages.some((m) => /Não consegui responder/.test(m.content))).toBe(true);
      rowReady = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(16000); });
      const falas = useAppStore.getState().coachMessages.map((m) => m.content);
      expect(falas).toContain('Aqui tens a primeira semana.');
      expect(falas.some((c) => /Não consegui responder/.test(c))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('o select ao abrir a folha devolve erro: avisa na consola e a proposta fica normal', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    supabase.from.mockImplementation((table) => (table !== 'coach_messages'
      ? { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ eq: () => ({ not: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'rls' } }) }) }) }) }) }) }));
    useAppStore.setState({ coachPlans: [PLAN], coachPlanItems: ITENS, coachMessages: [] });
    render(<ToastProvider><Coach /></ToastProvider>);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /Proposta de plano por rever [(]1[)]/ })); });
    expect(await screen.findByRole('button', { name: 'Aceitar plano' })).toBeInTheDocument();
    await vi.waitFor(() => expect(aviso).toHaveBeenCalledWith(expect.stringContaining('procura da continuação'), expect.anything()));
    aviso.mockRestore();
  });
});
