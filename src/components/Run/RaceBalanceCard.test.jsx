import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RaceBalanceCard from './RaceBalanceCard';

/* O balanço completo da Carol no hub (pedido 2026-09-13): pedido ao
   coach-chat à primeira abertura, guardado na prova, com as respostas do
   "perto" a levarem ao chat. */

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {},
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));

const RACE = { id: 'race-1', name: 'Corrida do Tejo', date: '2026-09-13', distance_km: 10, status: 'concluida', target_time: '50:00', target_time_seconds: 3000 };
const RUN = { id: 'run-1', kind: 'competicao', race_id: 'race-1', date: '2026-09-13', distance_km: 10.11, duration_seconds: 3088 };
const PROFILE = { id: 'user-1', display_name: 'Rui' };

const BALANCO = 'Foi por pouco, Rui: 51:28 a 1:28 do objetivo.\n\nOs parciais mostram o arranque a 4:50, rápido de mais.\n\nPara a próxima é para fazer melhor?';

beforeEach(() => {
  window.localStorage.clear();
  mocks.invoke.mockReset();
  useAppStore.setState({ profile: PROFILE, raceEvents: [RACE], runs: [RUN], coachMessages: [], coachIntent: null, activeTab: 'calendario', editingRaceId: null });
});

describe('RaceBalanceCard', () => {
  it('pede o balanço ao montar e mostra-o em parágrafos, com a linha de números por baixo', async () => {
    mocks.invoke.mockResolvedValue({ data: { model_message: { id: 'm1', content: BALANCO }, suggestions: ['Sim, para a próxima quero melhor', 'Por agora fico por aqui'] }, error: null });
    render(<RaceBalanceCard race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} numbersLine="51:28 (5.05/km). Ficaste a 1:28 do objetivo — foi por pouco." />);

    expect(screen.getByTestId('race-balance-loading')).toBeInTheDocument();
    const carol = await screen.findByTestId('race-balance-carol');
    expect(carol.querySelectorAll('p')).toHaveLength(3);
    expect(carol).toHaveTextContent('Os parciais mostram o arranque a 4:50');
    expect(screen.getByTestId('race-hub-balance')).toHaveTextContent('Ficaste a 1:28 do objetivo');

    // O pedido é o turno race_after, forçado, com os números da régua.
    const body = JSON.parse(mocks.invoke.mock.calls[0][1].body);
    expect(body.proactive_trigger).toBe('race_after');
    expect(body.proactive_force).toBe(true);
    expect(body.race_outcome.race_id).toBe('race-1');
    expect(body.race_outcome.official_seconds).toBe(3088);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    // Fica no chat; na prova só por quem monta o hub (onSaved), nunca por
    // escrita direta no store — isso repunha o rascunho do RunAgenda.
    expect(useAppStore.getState().coachMessages[0].content).toBe(BALANCO);
    expect(useAppStore.getState().raceEvents[0].coach_balance).toBeUndefined();
  });

  it('entrega o balanço a quem monta o hub, para o gravar pelo caminho do RunAgenda', async () => {
    mocks.invoke.mockResolvedValue({ data: { model_message: { id: 'm1', content: BALANCO }, suggestions: [] }, error: null });
    const onSaved = vi.fn();
    render(<RaceBalanceCard race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} onSaved={onSaved} />);
    await screen.findByTestId('race-balance-carol');
    expect(onSaved).toHaveBeenCalledWith({ coach_balance: BALANCO, coach_balance_at: expect.any(String) });
  });

  it('a resposta do "perto" vai para o chat como se o atleta a tivesse escrito', async () => {
    mocks.invoke.mockResolvedValue({ data: { model_message: { id: 'm1', content: BALANCO }, suggestions: ['Sim, para a próxima quero melhor'] }, error: null });
    const onLeave = vi.fn();
    render(<RaceBalanceCard race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} onLeave={onLeave} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sim, para a próxima quero melhor' }));
    expect(onLeave).toHaveBeenCalled();
    expect(useAppStore.getState().coachIntent).toEqual({ kind: 'say', text: 'Sim, para a próxima quero melhor' });
    expect(useAppStore.getState().activeTab).toBe('coach');
  });

  it('com o balanço já na prova não pede nada', () => {
    render(<RaceBalanceCard race={{ ...RACE, coach_balance: 'Já feito.' }} run={RUN} runs={[RUN]} profile={PROFILE} />);
    expect(screen.getByTestId('race-balance-carol')).toHaveTextContent('Já feito.');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('se o chat já fez este balanço neste dispositivo, oferece pedi-lo em vez de o repetir', async () => {
    window.localStorage.setItem('ironcoach:carol-proativa:user-1', JSON.stringify({ race_after: 'race_after:race-1:run-1' }));
    mocks.invoke.mockResolvedValue({ data: { model_message: { id: 'm2', content: 'De novo.' }, suggestions: [] }, error: null });
    render(<RaceBalanceCard race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} />);
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('race-balance-ask'));
    expect(await screen.findByTestId('race-balance-carol')).toHaveTextContent('De novo.');
  });

  it('se a Carol não responder, fica a linha de números e "Tentar de novo"', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('rede') })
      .mockResolvedValueOnce({ data: { model_message: { id: 'm3', content: 'Agora sim.' }, suggestions: [] }, error: null });
    render(<RaceBalanceCard race={RACE} run={RUN} runs={[RUN]} profile={PROFILE} numbersLine="51:28." />);
    const retry = await screen.findByTestId('race-balance-ask');
    expect(retry).toHaveTextContent('Tentar de novo');
    expect(screen.getByTestId('race-hub-balance')).toHaveTextContent('51:28.');
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(screen.getByTestId('race-balance-carol')).toHaveTextContent('Agora sim.'));
  });

  it('sem corrida registada não pede nem oferece — só a linha do motor', () => {
    render(<RaceBalanceCard race={RACE} run={null} runs={[]} profile={PROFILE} numbersLine="Sem corrida." />);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId('race-balance-ask')).not.toBeInTheDocument();
    expect(screen.getByTestId('race-hub-balance')).toHaveTextContent('Sem corrida.');
  });
});
