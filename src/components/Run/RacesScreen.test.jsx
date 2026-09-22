import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useAppStore } from '../../store';
import RacesScreen from './RacesScreen';

/* O separador Provas (2026-09-13, opção A de "Onde vivem as provas"): a
   próxima prova e todas as provas por grupos. O Palmarés, que vivia aqui
   entre os dois, mudou-se para o separador "Vitrina" do Perfil (2026-09-22,
   fase 1 da reforma da gamificação — ver Perfil.test.jsx para a cobertura
   dos medalhões e das provas concluídas que este ficheiro tinha). */

const PROFILE = { id: 'user-1', display_name: 'Atleta' };

describe('Provas — o ecrã junta a próxima prova e a lista', () => {
  it('sem provas, convida a marcar a primeira', () => {
    useAppStore.setState({ profile: PROFILE, raceEvents: [], runs: [], coachPlans: [], coachPlanItems: [], editingRaceId: null, openCreationMode: null });
    render(<RacesScreen />);
    expect(screen.getByTestId('races-screen')).toBeInTheDocument();
    expect(screen.getByTestId('race-card-empty')).toBeInTheDocument();
    expect(screen.getByTestId('race-list-resumo')).toHaveTextContent('Ainda sem provas marcadas.');
    // Aqui não há "Todas as provas": já se está nelas.
    expect(screen.queryByTestId('race-card-all')).not.toBeInTheDocument();
    // O Palmarés já não vive aqui — mudou-se para a Vitrina do Perfil.
    expect(screen.queryByTestId('palmares-card')).not.toBeInTheDocument();
  });
});
