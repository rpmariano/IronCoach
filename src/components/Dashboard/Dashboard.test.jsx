import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Dashboard from './Dashboard';

/* Teste de fumo dos separadores do Dashboard. Existe sobretudo para travar
   uma regressão concreta: o separador "Holística" já esteve ligado aqui a
   importar ficheiros que não existiam no repositório (CrossAnalyticsDashboard,
   utils/biEngine, CoachInsight*), o que partia o build de produção com
   UNRESOLVED_IMPORT sem partir nenhum teste — porque a versão anterior deste
   ficheiro vivia em __tests__/ na raiz, fora do `include` do vitest
   (src/**), e por isso nunca chegava a correr. */

vi.mock('../../store', () => ({
  useAppStore: () => ({
    runs: [],
    gymSessions: [],
    meals: [],
    bodyAssessments: [],
    raceEvents: [],
    profile: { experience_level: 'medio' },
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
  it('mostra os cinco separadores, incluindo Holística', () => {
    render(<Dashboard activeModule="corrida" />);
    for (const label of ['Corrida', 'Ginásio', 'Nutrição', 'Corpo', 'Holística']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('monta cada módulo sem rebentar', () => {
    // Se um separador voltar a importar um ficheiro inexistente, isto falha
    // aqui em vez de só no build de produção.
    for (const mod of ['corrida', 'ginasio', 'nutricao', 'corpo', 'holistica']) {
      const { unmount } = render(<Dashboard activeModule={mod} />);
      unmount();
    }
  });
});
