import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useAppStore } from '../../store';
import RacesScreen from './RacesScreen';

/* O separador Provas (2026-09-13, opção A de "Onde vivem as provas"): a
   próxima prova, o Palmarés que saiu do Perfil e todas as provas por grupos.
   Os testes do Palmarés vieram de Perfil.test.jsx sem mudar o que afirmam —
   só mudou onde ele vive. */

const PROFILE = { id: 'user-1', display_name: 'Atleta' };

describe('Provas — o ecrã junta a próxima prova, o Palmarés e a lista', () => {
  it('sem provas, convida a marcar a primeira e mostra o Palmarés bloqueado', () => {
    useAppStore.setState({ profile: PROFILE, raceEvents: [], runs: [], editingRaceId: null, openCreationMode: null });
    render(<RacesScreen />);
    expect(screen.getByTestId('races-screen')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
    expect(screen.getByTestId('palmares-resumo')).toHaveTextContent('Ainda sem provas concluídas');
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('Ainda sem provas marcadas.');
    // Aqui não há "Todas as provas": já se está nelas.
    expect(screen.queryByTestId('race-card-all')).not.toBeInTheDocument();
  });
});

describe('Provas — Palmarés', () => {
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
      activeTab: 'perfil',
      shoes: [],
      raceEvents,
      runs,
      editingRaceId: null,
    });
    render(<RacesScreen />);
  };

  it('sem provas, as cinco conquistas mostram-se bloqueadas e o resumo diz porquê', () => {
    montar();
    expect(screen.getByTestId('palmares-resumo')).toHaveTextContent('Ainda sem provas concluídas');
    expect(screen.getByTestId('palmares-card')).toHaveTextContent('Sequência');
  });

  it('com uma prova, o resumo conta as conquistas e diz desde quando', () => {
    montar({ raceEvents: [PROVA], runs: [CORRIDA] });
    // Prova concluída + objetivo batido (6822 <= 6900).
    expect(screen.getByTestId('palmares-resumo')).toHaveTextContent('2 de 5 conquistas · desde maio de 2026');
  });

  it('"Ver tudo" abre a persiana com as conquistas e as provas concluídas', () => {
    montar({ raceEvents: [PROVA], runs: [CORRIDA] });

    const verTudo = screen.getByTestId('palmares-ver-tudo');
    expect(verTudo).toHaveStyle({ minHeight: '44px' });
    fireEvent.click(verTudo);

    const persiana = screen.getByTestId('palmares-sheet');
    expect(persiana).toHaveTextContent('Palmarés');
    expect(persiana).toHaveTextContent('Objetivo batido');
    expect(persiana).toHaveTextContent('Precisa de duas provas na mesma distância');
    expect(persiana).toHaveTextContent('Provas concluídas');
    expect(screen.getByTestId('palmares-prova-race-1')).toHaveTextContent('1:53:42');
  });

  it('tocar numa prova leva ao hub dela', () => {
    montar({ raceEvents: [PROVA], runs: [CORRIDA] });
    fireEvent.click(screen.getByTestId('palmares-ver-tudo'));
    fireEvent.click(screen.getByTestId('palmares-prova-race-1'));

    expect(useAppStore.getState().editingRaceId).toBe('race-1');
  });
});
