import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Dashboard from './Dashboard';

/* Teste de fumo dos separadores do Dashboard. Existe sobretudo para travar
   uma regressão concreta: a reestruturação de 2026-08-23 removeu o separador
   "Holística" e adicionou "Visão Geral" (hub). Se alguém voltar a adicionar
   um separador que importe ficheiros inexistentes, este teste falha antes do
   build de produção. */

vi.mock('../../store', () => ({
  useAppStore: () => ({
    runs: [],
    gymSessions: [],
    meals: [],
    bodyAssessments: [],
    raceEvents: [],
    coachPlans: [],
    coachPlanItems: [],
    shoes: [],
    profile: { experience_level: 'medio' },
    insightStates: {},
    session: null,
    waterLogs: [],
    setActiveTab: vi.fn(),
  }),
}));

// O jsdom não tem canvas — sem isto os gráficos rebentavam ao montar.
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="chart-bar" />,
  Line: () => <div data-testid="chart-line" />,
  Doughnut: () => <div data-testid="chart-donut" />,
  Scatter: () => <div data-testid="chart-scatter" />,
  Chart: () => <div data-testid="chart-base" />,
}));

describe('Dashboard', () => {
  it('mostra os cinco separadores: Visão Geral, Corrida, Ginásio, Nutrição, Corpo', () => {
    render(<Dashboard activeModule="corrida" />);
    for (const label of ['Visão Geral', 'Corrida', 'Ginásio', 'Nutrição', 'Corpo']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('não mostra o separador Holística (foi removido)', () => {
    render(<Dashboard activeModule="hub" />);
    expect(screen.queryByText('Holística')).not.toBeInTheDocument();
  });

  it('monta cada módulo sem rebentar', () => {
    // Se um separador voltar a importar um ficheiro inexistente, isto falha
    // aqui em vez de só no build de produção.
    for (const mod of ['hub', 'corrida', 'ginasio', 'nutricao', 'corpo']) {
      const { unmount } = render(<Dashboard activeModule={mod} />);
      unmount();
    }
  });
});
