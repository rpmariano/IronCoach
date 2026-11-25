import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* A Evolução no Design v2 (fase 2): um só nível de separadores, o período num seletor compacto, o
   número herói, a Carol numa linha sem siglas e o «Carol explica» de cada bloco. Desligado, o
   carrossel de sempre. */

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => { throw new Error('sem rede nos testes'); } },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));
// Os avisos da Carol têm testes próprios.
vi.mock('../BI/CoachInsightsDock', () => ({ default: () => null }));
// O jsdom não tem canvas.
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="chart-bar" />,
  Line: () => <div data-testid="chart-line" />,
  Doughnut: () => <div data-testid="chart-donut" />,
  Scatter: () => <div data-testid="chart-scatter" />,
  Chart: () => <div data-testid="chart-base" />,
}));

const { default: Dashboard } = await import('./Dashboard');
const { plainVerdict } = await import('./DashboardV2');
const { useAppStore } = await import('../../store');
const { usePeriodStore } = await import('../../store/periodStore');
const { setDesignV2 } = await import('../../utils/designV2');

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const RUNS = [3, 6, 10, 14, 20, 27, 34, 41].map((n, i) => ({
  id: `r${i}`, kind: 'normal', date: daysAgo(n), distance_km: 8 + i, duration_seconds: (8 + i) * 330,
}));
const SIGLAS = /Z[1-5]|VDOT|ACWR/;

function Host() {
  const tab = useAppStore((s) => s.activeTab);
  return <Dashboard activeModule={tab} />;
}

const setTab = (tab) => act(() => useAppStore.setState({ activeTab: tab }));

/** O texto «principal» do v2: título, separadores, período, herói e a linha da Carol. */
function mainText() {
  const root = screen.getByTestId('evolucao-v2');
  const parts = [
    root.querySelector('.v2-title'),
    screen.getByTestId('evo-v2-tabs'),
    screen.getByTestId('evo-v2-period'),
    screen.queryByTestId('evo-v2-hero'),
    screen.queryByTestId('evo-v2-say'),
  ].filter(Boolean);
  return parts.map((el) => el.textContent).join(' ');
}

beforeEach(() => {
  window.localStorage.clear();
  usePeriodStore.setState({
    tabs: {
      nutricao: { kind: 'semana', offset: 0 }, corrida: { kind: 'mes', offset: 0 },
      ginasio: { kind: 'mes', offset: 0 }, corpo: { kind: 'trimestre', offset: 0 }, hub: { kind: 'semana', offset: 0 },
    },
  });
  useAppStore.setState({
    session: { user: { id: 'u1' } }, profile: { id: 'u1', experience_level: 'medio' },
    runs: RUNS, gymSessions: [], meals: [], waterLogs: [], bodyAssessments: [],
    raceEvents: [], coachPlans: [], coachPlanItems: [], dataPending: false, activeTab: 'corrida',
  });
  act(() => setDesignV2(true));
});
afterEach(() => act(() => setDesignV2(false)));

describe('Evolução — Design v2', () => {
  it('desligado: o carrossel de sempre', () => {
    act(() => setDesignV2(false));
    const { container } = render(<Host />);
    expect(container.querySelector('.tab-swipe-carousel')).not.toBeNull();
    expect(screen.queryByTestId('evolucao-v2')).toBeNull();
    expect(screen.getAllByTestId('period-header').length).toBeGreaterThan(0);
  });

  it('uma só fila de separadores: Geral, Corrida, Ginásio, Nutrição, Corpo; sem a barra de pílulas por cima', async () => {
    render(<Host />);
    await screen.findByTestId('evolucao-v2');
    const tabs = within(screen.getByTestId('evo-v2-tabs')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Geral', 'Corrida', 'Ginásio', 'Nutrição', 'Corpo']);
    // Só o separador ativo aponta para um painel, e o painel existe.
    tabs.forEach((t) => {
      const id = t.getAttribute('aria-controls');
      if (t.getAttribute('aria-selected') === 'true') expect(document.getElementById(id)).toBeTruthy();
      else expect(id).toBeNull();
    });
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Corrida' })).toHaveAttribute('aria-selected', 'true');
    // O seletor do período é um <select> nativo, não um grupo de pílulas.
    expect(screen.getByTestId('evo-v2-kind').tagName).toBe('SELECT');
  });

  it('tocar num separador troca de área (pelo setActiveTab, com o navGuard)', async () => {
    render(<Host />);
    await screen.findByTestId('evo-v2-area-corrida');
    fireEvent.click(screen.getByRole('tab', { name: 'Ginásio' }));
    expect(await screen.findByTestId('evo-v2-area-ginasio')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ginásio' })).toHaveAttribute('aria-selected', 'true');
  });

  it('«hub» abre o Geral (o resumo dos pilares); «holistica» também', async () => {
    setTab('hub');
    const { unmount } = render(<Host />);
    expect(await screen.findByTestId('evo-v2-area-hub')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true');
    unmount();
    setTab('holistica');
    render(<Host />);
    expect(await screen.findByTestId('evo-v2-area-hub')).toBeInTheDocument();
  });

  it('o seletor compacto muda o período mostrado (e o dos dashboards, que é o mesmo)', async () => {
    render(<Host />);
    const select = await screen.findByTestId('evo-v2-kind');
    expect(select.value).toBe('mes');
    expect([...select.options].map((o) => o.value)).toEqual(['semana', 'mes', 'trimestre', 'ano']);
    const before = screen.getByTestId('evo-v2-period-title').textContent;
    fireEvent.change(select, { target: { value: 'semana' } });
    expect(screen.getByTestId('evo-v2-period-title')).toHaveTextContent('Esta semana');
    expect(screen.getByTestId('evo-v2-period-title').textContent).not.toBe(before);
    expect(usePeriodStore.getState().tabs.corrida.kind).toBe('semana');
  });

  it('as setas andam de período, e «Voltar ao período atual» repõe', async () => {
    render(<Host />);
    await screen.findByTestId('evo-v2-kind');
    fireEvent.change(screen.getByTestId('evo-v2-kind'), { target: { value: 'semana' } });
    expect(screen.getByRole('button', { name: 'Período seguinte' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(screen.getByTestId('evo-v2-period-title')).toHaveTextContent('Semana passada');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao período atual' }));
    expect(screen.getByTestId('evo-v2-period-title')).toHaveTextContent('Esta semana');
  });

  for (const area of ['corrida', 'ginasio', 'nutricao', 'corpo']) {
    it(`${area}: um número herói, a Carol sem siglas e sem travessões no texto do v2`, async () => {
      setTab(area);
      render(<Host />);
      await screen.findByTestId(`evo-v2-area-${area}`);
      const heroes = screen.getAllByTestId('evo-v2-hero');
      expect(heroes).toHaveLength(1);
      expect(screen.getByTestId('evo-v2-hero-n').textContent).toMatch(/^\d/);
      const say = screen.queryByTestId('evo-v2-say');
      if (say) {
        expect(say).toHaveTextContent(/^Carol\./);
        expect(say.textContent).not.toMatch(SIGLAS);
      }
      const text = mainText();
      expect(text).not.toMatch(/—/);
      expect(text).not.toMatch(SIGLAS);
      // Os blocos de sempre estão lá, sem o seu próprio seletor de período à vista (o CSS do v2
      // esconde-o; continua no DOM).
      expect(screen.getByTestId('evo-v2-body')).toBeInTheDocument();
    });
  }

  it('corrida: o herói são os km do período, e cada bloco de gráfico tem o «Carol explica»', async () => {
    render(<Host />);
    await screen.findByTestId('evo-v2-area-corrida');
    expect(screen.getByTestId('evo-v2-hero')).toHaveTextContent('km');
    expect(screen.getByTestId('evo-v2-say')).toBeInTheDocument();
    const frames = within(screen.getByTestId('evo-v2-body')).getAllByTestId('chart-frame');
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(within(f).getByTestId('explain-chart')).toHaveAccessibleName(/Pedir à Carol que explique/);
    }
  });

  it('plainVerdict: sem siglas nem travessões (só na camada v2)', () => {
    const z = plainVerdict('Andas a correr forte demais. 73% do tempo em Z3+ quando o teu alvo é no máximo 20%.');
    expect(z).toBe('Andas a correr forte demais. 73% do tempo acima do ritmo fácil quando o teu alvo é no máximo 20%.');
    const v = plainVerdict('A tua forma aeróbica está a subir. O VDOT médio passou de 44,1 em setembro para 45,0 neste mês.');
    expect(v).not.toMatch(SIGLAS);
    expect(v).toContain('A forma pelo treino passou de 44,1');
    const d = plainVerdict('Em setembro a média esteve no sítio — 95% das calorias e 92% da proteína —, mas em 5 dias de treino comeste abaixo.');
    expect(d).toBe('Em setembro a média esteve no sítio: 95% das calorias e 92% da proteína, mas em 5 dias de treino comeste abaixo.');
    expect(plainVerdict('ACWR alto, Z2 e Z4.')).not.toMatch(SIGLAS);
  });
});
