import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../store';

vi.mock('./badges', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, computeBadges: vi.fn(() => ({ badges: [], due: [] })) };
});
vi.mock('./badgeAwards', () => ({
  syncBadgeAwards: vi.fn(),
  markBadgeAwardsSeen: vi.fn(),
}));

import useBadgeMoment, { resetBadgeMomentDemo } from './useBadgeMoment';
import { resetBadgeSyncSession } from './useBadges';
import { computeBadges } from './badges';
import { syncBadgeAwards, markBadgeAwardsSeen } from './badgeAwards';

/* Quando o momento do badge aparece, e em que escala.

   O que estes testes guardam:

   1. os GRANDES em fila — um de cada vez, e o seguinte só depois de o
      anterior ser dispensado;
   2. os MÉDIOS colapsados, e à espera de a fila dos grandes acabar;
   3. nada com um formulário aberto (utils/formGuard.js);
   4. SEM A MIGRAÇÃO APLICADA não acontece nada — `syncBadgeAwards` devolve
      `available: false` e `pending: []`, e a app segue. */

const badge = (key, over = {}) => ({
  key, name: key, familia: 'desempenho', cor: 'run', state: 'won', ring: 1,
  centro: '94', count: 1, ...over,
});

const award = (id, badgeKey, over = {}) => ({
  id, badge_key: badgeKey, tier: '', period_key: id, value: 94, value_unit: 'pct',
  race_id: null, awarded_at: `2026-09-${id.slice(-2)}T12:00:00.000Z`,
  title: `T ${badgeKey}`, line: `L ${badgeKey}`, ...over,
});

let latest;
function Probe() {
  latest = useBadgeMoment();
  const g = latest.grande;
  return (
    <div data-testid="probe">
      {g ? `grande:${g.award.id}+${latest.filaRestante}` : latest.medio ? `medio:${latest.medio.titulo}` : 'nada'}
    </div>
  );
}

const setBadges = (badges, due = []) => computeBadges.mockImplementation(() => ({ badges, due }));

describe('useBadgeMoment', () => {
  beforeEach(() => {
    resetBadgeSyncSession();
    resetBadgeMomentDemo();
    setBadges([]);
    syncBadgeAwards.mockReset().mockResolvedValue({ pending: [], available: true });
    markBadgeAwardsSeen.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      profile: { id: 'user-1' }, runs: [], raceEvents: [], coachPlans: [], coachPlanItems: [], gymSessions: [],
      openCreationMode: null, editingRaceId: null, editingRunId: null, navGuard: null, onboardingOpen: false,
    });
  });

  it('os grandes entram em fila: um de cada vez, o seguinte só depois de dispensado', async () => {
    // Duas estreias: dois badges diferentes, cada um com uma ocorrência.
    setBadges([badge('z2_mestre'), badge('semana_100')]);
    syncBadgeAwards.mockResolvedValue({
      pending: [award('a-21', 'semana_100'), award('a-19', 'z2_mestre')],
      available: true,
    });
    render(<Probe />);
    // O mais antigo primeiro, e o outro fica na fila.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('grande:a-19+1'));

    await act(async () => { latest.fecharGrande(); });
    expect(screen.getByTestId('probe')).toHaveTextContent('grande:a-21+0');
    expect(markBadgeAwardsSeen).toHaveBeenCalledWith(['a-19']);

    await act(async () => { latest.fecharGrande(); });
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');
  });

  it('os médios colapsam num cartão só, e esperam que a fila dos grandes acabe', async () => {
    // O mesmo badge três vezes, mas duas já vistas (count 5, três por ver):
    // nenhuma é estreia.
    setBadges([badge('z2_mestre', { count: 5 })]);
    syncBadgeAwards.mockResolvedValue({
      pending: [award('a-18', 'z2_mestre'), award('a-19', 'z2_mestre'), award('a-20', 'z2_mestre')],
      available: true,
    });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('medio:3 badges novos'));

    await act(async () => { latest.fecharMedio(); });
    expect(markBadgeAwardsSeen).toHaveBeenCalledWith(['a-18', 'a-19', 'a-20']);
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');
  });

  it('um amuleto nunca abre a escala grande, mesmo sendo a primeira vez', async () => {
    setBadges([badge('coruja', { familia: 'amuletos', cor: 'neutro' })]);
    syncBadgeAwards.mockResolvedValue({ pending: [award('a-19', 'coruja')], available: true });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('medio:T coruja'));
  });

  it('não aparece com um formulário aberto, e aparece quando ele fecha', async () => {
    setBadges([badge('z2_mestre')]);
    syncBadgeAwards.mockResolvedValue({ pending: [award('a-19', 'z2_mestre')], available: true });
    useAppStore.setState({ editingRunId: 'run-1' });
    render(<Probe />);
    await waitFor(() => expect(syncBadgeAwards).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');

    await act(async () => { useAppStore.setState({ editingRunId: null }); });
    expect(screen.getByTestId('probe')).toHaveTextContent('grande:a-19+0');
  });

  /* A migração `20260922120000_user_badges.sql` continua por aplicar: sem
     tabela não há `pending`, e sem `pending` não há cerimónia. A Vitrina
     continua certa porque tudo se recalcula. */
  it('sem a tabela `user_badges` não acontece nada', async () => {
    setBadges([badge('z2_mestre')]);
    syncBadgeAwards.mockResolvedValue({ pending: [], available: false });
    render(<Probe />);
    await waitFor(() => expect(syncBadgeAwards).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');
    expect(markBadgeAwardsSeen).not.toHaveBeenCalled();
  });

  it('sem atleta não se sincroniza nada', async () => {
    useAppStore.setState({ profile: null });
    render(<Probe />);
    await act(async () => {});
    expect(syncBadgeAwards).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe')).toHaveTextContent('nada');
  });
});
