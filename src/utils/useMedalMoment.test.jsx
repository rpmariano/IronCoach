import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../store';
import { todayISO } from '../lib/utils';

vi.mock('./medalhoes', async () => {
  const { makeMedalhoes } = await import('../test/medalhoesFixture');
  return { computeMedalhoes: vi.fn(() => makeMedalhoes()) };
});
vi.mock('./medalAwards', () => ({
  syncMedalAwards: vi.fn(),
  markMedalAwardsSeen: vi.fn(),
}));

import useMedalMoment, { resetMedalMomentSession } from './useMedalMoment';
import { syncMedalAwards, markMedalAwardsSeen } from './medalAwards';
import { computeMedalhoes } from './medalhoes';
import { makeMedalhoes } from '../test/medalhoesFixture';

/* Quando o momento da medalha aparece: com prémios por ver e nenhum
   formulário aberto; a mais significativa primeiro; ao fechar, todas
   vistas; uma sincronização por sessão. */

const PENDING = [
  { id: 'a1', medalhao: 'ano_km', slot: 'mes', title: 'Mês recorde' },
  { id: 'a2', medalhao: 'distancias', slot: '10k', title: '10 km' },
];

let latest;
function Probe() {
  latest = useMedalMoment();
  return <div data-testid="probe">{latest.award ? `${latest.award.id}|${latest.extraCount}` : 'nada'}</div>;
}

describe('useMedalMoment', () => {
  beforeEach(() => {
    resetMedalMomentSession();
    computeMedalhoes.mockImplementation(() => makeMedalhoes());
    syncMedalAwards.mockReset().mockResolvedValue({ pending: PENDING, available: true });
    markMedalAwardsSeen.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      profile: { id: 'user-1' }, runs: [], raceEvents: [], coachPlans: [], coachPlanItems: [],
      openCreationMode: null, editingRaceId: null, editingRunId: null, navGuard: null, onboardingOpen: false,
    });
  });

  it('mostra a mais significativa (Distâncias antes do Ano em Km) e conta as outras', async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('a2|1'));
    expect(syncMedalAwards).toHaveBeenCalledTimes(1);
    expect(syncMedalAwards.mock.calls[0][0]).toMatchObject({ userId: 'user-1', due: [] });
    expect(latest.medalhao.key).toBe('distancias');
  });

  it('não aparece com um formulário aberto, e aparece quando fecha', async () => {
    useAppStore.setState({ openCreationMode: 'run' });
    render(<Probe />);
    await waitFor(() => expect(syncMedalAwards).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');

    act(() => useAppStore.setState({ openCreationMode: null, navGuard: { dirty: true } }));
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');

    act(() => useAppStore.setState({ navGuard: null }));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('a2|1'));
  });

  it('fechar marca todas como vistas; voltar a montar não sincroniza outra vez', async () => {
    const { unmount } = render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('a2|1'));
    act(() => latest.close());
    expect(markMedalAwardsSeen).toHaveBeenCalledWith(['a2', 'a1']);
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');
    unmount();

    render(<Probe />);
    await act(async () => {});
    expect(syncMedalAwards).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');

    // Uma corrida que não dá medalha nova não volta a sincronizar…
    act(() => useAppStore.setState({ runs: [{ id: 'r1', date: todayISO(), distance_km: 10 }] }));
    await act(async () => {});
    expect(syncMedalAwards).toHaveBeenCalledTimes(1);

    // …uma que dá uma medalha devida nova (fechar uma prova com uma corrida
    // que já existia conta igual) sincroniza.
    computeMedalhoes.mockImplementation(() => ({
      ...makeMedalhoes(),
      due: [{ medalhao: 'distancias', slot: '10k', periodKey: '', title: 'Primeiros 10 km' }],
    }));
    act(() => useAppStore.setState({ runs: [{ id: 'r1', date: todayISO(), distance_km: 10.2 }] }));
    await waitFor(() => expect(syncMedalAwards).toHaveBeenCalledTimes(2));
  });

  it('sem perfil não sincroniza', async () => {
    useAppStore.setState({ profile: null });
    render(<Probe />);
    await act(async () => {});
    expect(syncMedalAwards).not.toHaveBeenCalled();
  });

  it('com dados parciais (sem corridas mas com provas concluídas) espera pelos dados completos', async () => {
    useAppStore.setState({ raceEvents: [{ id: 'race-1', name: 'Tejo', date: '2026-09-07', distance_km: 10, status: 'concluida' }] });
    render(<Probe />);
    await act(async () => {});
    expect(syncMedalAwards).not.toHaveBeenCalled();

    act(() => useAppStore.setState({ runs: [{ id: 'r1', race_id: 'race-1', kind: 'competicao', date: '2026-09-07', distance_km: 10, duration_seconds: 3100 }] }));
    await waitFor(() => expect(syncMedalAwards).toHaveBeenCalledTimes(1));
  });
});
