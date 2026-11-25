import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout, supabase } from '../../lib/supabase';
import { ToastProvider } from '../shared/ToastProvider';
import { setDesignV2 } from '../../utils/designV2';
import Coach from './Coach';

/* O chat da Carol no Design v2 (fase 2): as mesmas ações, outro desenho. Desligado, o de sempre. */

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));
vi.mock('../../lib/image', () => ({
  compressImage: vi.fn(async (f) => ({ dataUrl: `data:image/jpeg;base64,${f.name}`, base64: f.name })),
}));

Element.prototype.scrollIntoView = vi.fn();

const renderCoach = () => render(<ToastProvider><Coach /></ToastProvider>);

function baseState() {
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

const now = () => new Date().toISOString();
const conversa = () => [
  { id: 'a', role: 'model', content: 'A prova de domingo subiu a tua carga.', created_at: now() },
  { id: 'b', role: 'model', content: 'Agora é afinar, não acumular.', created_at: now() },
  { id: 'c', role: 'user', content: 'E o longo de amanhã?', created_at: now() },
  { id: 'd', role: 'model', content: 'Faz 14, fácil.', created_at: now() },
];

describe('Coach — Design v2', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    invokeEdgeFunctionWithTimeout.mockReset();
    supabase.from.mockReset();
    useAppStore.setState(baseState());
    // Sem animação: as bolhas novas entram logo (sem o compasso do «a escrever»).
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    act(() => setDesignV2(true));
  });

  afterEach(() => {
    act(() => setDesignV2(false));
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
  });

  it('sem a cara em cada bolha; o nome dela uma vez por grupo seguido', () => {
    useAppStore.setState({ coachMessages: conversa() });
    renderCoach();
    const dela = screen.getAllByTestId('coach-message-carol');
    expect(dela).toHaveLength(3);
    for (const el of dela) expect(el.querySelector('[data-mood]')).toBeNull();
    // Dois grupos (a+b, d): dois nomes, e o da segunda mensagem seguida não se repete.
    expect(dela[0].querySelector('.v2-chat-who')).toHaveTextContent('Carol');
    expect(dela[1].querySelector('.v2-chat-who')).toBeNull();
    expect(dela[2].querySelector('.v2-chat-who')).toHaveTextContent('Carol');
    expect(document.querySelectorAll('.v2-chat-who')).toHaveLength(2);
    expect(screen.getByText('A prova de domingo subiu a tua carga.').closest('.v2-chat-msg')).toHaveClass('is-her');
  });

  it('a bolha do atleta é a do v2 (ciano)', () => {
    useAppStore.setState({ coachMessages: conversa() });
    renderCoach();
    const minha = screen.getByText('E o longo de amanhã?');
    expect(minha).toHaveClass('v2-chat-msg', 'is-me');
    expect(minha).not.toHaveClass('coach-bubble-user');
  });

  it('as respostas rápidas são botões do v2 e enviam o mesmo', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { model_message: { id: 'r1', content: 'Combinado.' }, suggestions: [] }, error: null });
    useAppStore.setState({ coachMessages: conversa(), coachSuggestions: ['Fico com Prudente', 'Agora não'] });
    renderCoach();
    const chip = screen.getByRole('button', { name: 'Fico com Prudente' });
    expect(chip).toHaveClass('v2-chat-chip');
    fireEvent.click(chip);
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    expect(JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body).message).toBe('Fico com Prudente');
  });

  it('as sugestões do ecrã vazio também são botões do v2', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { model_message: { id: 'r1', content: 'Vamos ver.' }, suggestions: [] }, error: null });
    renderCoach();
    const chip = screen.getByRole('button', { name: 'Como está a minha nutrição hoje?' });
    expect(chip).toHaveClass('v2-chat-chip');
    fireEvent.click(chip);
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
  });

  it('a escolha do perfil de carga fica no desenho do v2 e grava como sempre', async () => {
    const { TRAIL, MEIA, PATTY_RUNS, PATTY_PLANS, PATTY_PLAN_ITEMS } = await import('../../test/pattyLoad');
    const setRaceLoadProfile = vi.fn().mockResolvedValue({ ok: true });
    useAppStore.setState({ raceEvents: [TRAIL, MEIA], runs: PATTY_RUNS, coachPlans: PATTY_PLANS, coachPlanItems: PATTY_PLAN_ITEMS, setRaceLoadProfile });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { model_message: { id: 'm1', content: 'Prudente ou Mais volume?' }, suggestions: [], load_topic_shown: true, load_profile_choice: { race_id: 'meia', current: 'prudente', chosen: false } },
      error: null,
    });
    useAppStore.setState({ coachIntent: { kind: 'load_topic', raceId: 'meia', state: 'conflito', signature: 'load:meia:conflito' } });
    renderCoach();
    const choice = await screen.findByTestId('coach-load-choice');
    expect(choice).toHaveClass('hide-when-keyboard', 'v2-chat-load');
    fireEvent.click(choice.querySelector('[data-testid="load-profile-choose-prudente"]'));
    await waitFor(() => expect(setRaceLoadProfile).toHaveBeenCalledWith('meia', 'prudente'));
  });

  it('o campo de escrita envia texto e aceita uma foto', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { model_message: { id: 'r1', content: 'Ok.' }, suggestions: [] }, error: null });
    renderCoach();
    const send = screen.getByRole('button', { name: 'Enviar pergunta à Carol' });
    expect(send).toHaveClass('v2-chat-send');
    expect(send).toBeDisabled();

    fireEvent.change(screen.getByTestId('coach-photo-input'), { target: { files: [new File(['x'], 'prato.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByAltText('Foto 1 por enviar')).toBeInTheDocument();
    expect(send).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText('Mensagem para a Carol'), { target: { value: 'Quantas calorias?' } });
    fireEvent.click(send);
    await waitFor(() => expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledTimes(1));
    const body = JSON.parse(invokeEdgeFunctionWithTimeout.mock.calls[0][1].body);
    expect(body.message).toBe('Quantas calorias?');
    expect(body.images).toEqual([{ mime_type: 'image/jpeg', data: 'prato.jpg' }]);
  });

  it('desligado, o chat é o de sempre: a cara ao lado de cada mensagem dela', () => {
    act(() => setDesignV2(false));
    useAppStore.setState({ coachMessages: conversa(), coachSuggestions: ['Agora não'] });
    renderCoach();
    const dela = screen.getAllByTestId('coach-message-carol');
    expect(dela).toHaveLength(3);
    for (const el of dela) expect(el.querySelector('[data-mood]')).not.toBeNull();
    expect(document.querySelector('[class*="v2-chat"]')).toBeNull();
    expect(screen.getByText('E o longo de amanhã?')).toHaveClass('coach-bubble-user');
  });
});
