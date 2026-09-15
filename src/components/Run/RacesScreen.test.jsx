import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useAppStore } from '../../store';

// As regras dos medalhões têm os testes delas (utils/medalhoes.test.js);
// aqui só interessa que o Palmarés está no ecrã e o que ele abre.
vi.mock('../../utils/medalhoes', async () => {
  const { makeMedalhoes } = await import('../../test/medalhoesFixture');
  return { computeMedalhoes: vi.fn(() => makeMedalhoes()) };
});

import RacesScreen from './RacesScreen';

/* O separador Provas (2026-09-13, opção A de "Onde vivem as provas"): a
   próxima prova, o Palmarés e todas as provas por grupos. Desde 2026-09-15
   o Palmarés são os medalhões (specs/palmares-medalhoes.md); a lista das
   provas concluídas saiu do "Ver tudo" para "As provas e as medalhas de
   cada uma". */

const PROFILE = { id: 'user-1', display_name: 'Atleta' };

describe('Provas — o ecrã junta a próxima prova, o Palmarés e a lista', () => {
  it('sem provas, convida a marcar a primeira e mostra o Palmarés', () => {
    useAppStore.setState({ profile: PROFILE, raceEvents: [], runs: [], coachPlans: [], coachPlanItems: [], editingRaceId: null, openCreationMode: null });
    render(<RacesScreen />);
    expect(screen.getByTestId('races-screen')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
    expect(screen.getByTestId('palmares-card')).toBeInTheDocument();
    expect(screen.getByTestId('palmares-heroi')).toBeInTheDocument();
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('Ainda sem provas marcadas.');
    // Aqui não há "Todas as provas": já se está nelas.
    expect(screen.queryByTestId('race-card-all')).not.toBeInTheDocument();
  });
});

describe('Provas — Palmarés, as provas concluídas', () => {
  const PROVA = {
    id: 'race-1',
    name: 'Meia de Lisboa',
    date: '2026-05-10',
    distance_km: 21.0975,
    race_type: 'estrada',
    status: 'concluida',
    target_time_seconds: 6900,
  };
  const CORRIDA = {
    id: 'run-1',
    kind: 'competicao',
    race_id: 'race-1',
    date: '2026-05-10',
    distance_km: 21.0975,
    duration_seconds: 6822,
    details: { official_time_seconds: 6822 },
  };

  const montar = ({ raceEvents = [], runs = [] } = {}) => {
    useAppStore.setState({
      profile: PROFILE,
      session: { user: { email: 'atleta@ironhealth.app' } },
      navGuard: null,
      activeTab: 'provas',
      shoes: [],
      raceEvents,
      runs,
      coachPlans: [],
      coachPlanItems: [],
      editingRaceId: null,
    });
    render(<RacesScreen />);
  };

  it('sem provas, a persiana diz que ainda não há', () => {
    montar();
    fireEvent.click(screen.getByTestId('palmares-provas'));
    expect(screen.getByTestId('palmares-sheet')).toHaveTextContent('Provas concluídas');
    expect(screen.getByTestId('palmares-sem-provas')).toHaveTextContent('Ainda sem provas concluídas');
  });

  it('"As provas e as medalhas de cada uma" abre a lista, sem a lista das conquistas', () => {
    montar({ raceEvents: [PROVA], runs: [CORRIDA] });

    const link = screen.getByTestId('palmares-provas');
    expect(link).toHaveTextContent('As provas e as medalhas de cada uma');
    fireEvent.click(link);

    const persiana = screen.getByTestId('palmares-sheet');
    expect(persiana).toHaveTextContent('Provas concluídas');
    expect(persiana).not.toHaveTextContent('Precisa de duas provas na mesma distância');
    expect(screen.getByTestId('palmares-prova-race-1')).toHaveTextContent('1:53:42');
  });

  it('tocar numa prova leva ao hub dela', () => {
    montar({ raceEvents: [PROVA], runs: [CORRIDA] });
    fireEvent.click(screen.getByTestId('palmares-provas'));
    fireEvent.click(screen.getByTestId('palmares-prova-race-1'));

    expect(useAppStore.getState().editingRaceId).toBe('race-1');
  });
});
