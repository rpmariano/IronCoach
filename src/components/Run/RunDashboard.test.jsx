import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeBestPace } from '@formulas/bestPace.ts';

/* Corrida — factos errados R2, R3, R4, R8, R9 (evolução 2026-10-04).
   O RunDashboard monta-se inteiro, com o store simulado e os gráficos
   substituídos por marcadores (o jsdom não tem canvas); o Scatter guarda os
   dados que recebe para se poder ver a ordem em que o gráfico os desenha. */

const h = vi.hoisted(() => ({ state: {}, scatterProps: [] }));

vi.mock('../../store', () => ({ useAppStore: () => h.state }));
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="chart-bar" />,
  Line: () => <div data-testid="chart-line" />,
  Doughnut: () => <div data-testid="chart-donut" />,
  Scatter: (props) => { h.scatterProps.push(props); return <div data-testid="chart-scatter" />; },
  Chart: () => <div data-testid="chart-base" />,
}));

import RunDashboard from './RunDashboard';
import ScatterTrendChart from '../BI/ScatterTrendChart';
import { descreverBase } from '../BI/RacePredictionChart';

const corrida = (over = {}) => ({
  id: over.id || `r-${Math.random()}`,
  date: '2026-09-12',
  kind: 'treino',
  distance_km: 10,
  duration_seconds: 3000,
  training_type: 'tempo',
  details: {},
  ...over,
});

const prova = (over = {}) => ({
  id: 'p1', name: 'Meia de Lisboa', date: '2026-11-15', distance_km: 21.1,
  race_type: 'road', status: 'agendada', race_priority: 'a', ...over,
});

function monta({ runs = [], raceEvents = [], profile = {} } = {}) {
  h.state = { runs, raceEvents, profile, setOpenCreationMode: vi.fn(), coachPlans: [], coachPlanItems: [] };
  return render(<RunDashboard />);
}

const frame = (label) => screen.getAllByTestId('chart-frame').find((f) => within(f).queryByText(label));

beforeEach(() => {
  h.scatterProps.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('R2 — Previsão de prova', () => {
  it('uma corrida com distância e sem duração não faz a previsão cair a "00:00"', () => {
    monta({
      runs: [
        corrida({ id: 'a', date: '2026-09-12', distance_km: 10, duration_seconds: 3000 }),
        corrida({ id: 'b', date: '2026-09-20', distance_km: 8, duration_seconds: null }),
      ],
      raceEvents: [prova({ distance_km: 10 })],
    });
    const f = frame('Previsão de prova');
    expect(f).toBeTruthy();
    expect(within(f).getByTestId('chart-frame-value')).toHaveTextContent('50:00');
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
  });

  it('diz em que corrida se baseia', () => {
    monta({
      runs: [corrida({ date: '2026-09-12', distance_km: 10, duration_seconds: 3000 })],
      raceEvents: [prova({ distance_km: 10 })],
    });
    expect(screen.getByTestId('race-prediction-base')).toHaveTextContent('Baseado nos 10 km de 12 set.');
  });

  it('a corrida de base de outro ano leva o ano na data (12 set 2024, não "12 set")', () => {
    monta({
      runs: [
        corrida({ id: 'a', date: '2024-09-12', distance_km: 10, duration_seconds: 2700 }),
        corrida({ id: 'b', date: '2026-09-20', distance_km: 10, duration_seconds: 3000 }),
      ],
      raceEvents: [prova({ distance_km: 10 })],
    });
    expect(screen.getByTestId('race-prediction-base')).toHaveTextContent('Baseado nos 10 km de 12 set 2024.');
  });

  it('descreverBase: ano corrente sem ano, 1 km no singular, data malformada só com a distância', () => {
    const hoje = new Date(2026, 9, 4);
    expect(descreverBase({ distance: 10, date: '2026-09-12' }, hoje)).toBe('baseado nos 10 km de 12 set');
    expect(descreverBase({ distance: 10, date: '2025-12-31' }, hoje)).toBe('baseado nos 10 km de 31 dez 2025');
    expect(descreverBase({ distance: 1, date: '2026-09-12' }, hoje)).toBe('baseado numa corrida de 1 km de 12 set');
    expect(descreverBase({ distance: 10, date: '2026-13-40' }, hoje)).toBe('baseado numa corrida de 10 km');
    expect(descreverBase({ distance: 10 }, hoje)).toBe('baseado numa corrida de 10 km');
    expect(descreverBase({ distance: 0, date: '2026-09-12' }, hoje)).toBeNull();
  });

  it('usa a prova-objetivo do hub (a principal), não a mais próxima por data', () => {
    monta({
      runs: [corrida({ date: '2026-09-12', distance_km: 10, duration_seconds: 3000 })],
      raceEvents: [
        prova({ id: 'treino', name: 'Corrida de treino', date: '2026-10-10', distance_km: 5, race_priority: 'c' }),
        prova({ id: 'obj', name: 'Meia de Lisboa', date: '2026-11-15', distance_km: 21.1, race_priority: 'a' }),
      ],
    });
    const f = frame('Previsão de prova');
    expect(within(f).getByTestId('chart-frame-unit')).toHaveTextContent('Meia de Lisboa');
  });

  it('confiança baixa quando a corrida de base é bem mais curta do que a prova (como o hub)', () => {
    monta({
      runs: [corrida({ date: '2026-09-12', distance_km: 10, duration_seconds: 3000 })],
      raceEvents: [prova({ distance_km: 42.2 })],
    });
    expect(screen.getByTestId('race-prediction-confianca')).toBeInTheDocument();
  });

  it('sem confiança baixa quando a base tem mais de metade da prova', () => {
    monta({
      runs: [corrida({ date: '2026-09-12', distance_km: 10, duration_seconds: 3000 })],
      raceEvents: [prova({ distance_km: 12 })],
    });
    expect(screen.queryByTestId('race-prediction-confianca')).not.toBeInTheDocument();
  });

  it('sem prova por correr volta ao "Evolução do VDOT", sem número de previsão', () => {
    monta({
      runs: [corrida({ date: '2026-09-12' })],
      raceEvents: [prova({ date: '2026-09-01', status: 'concluida' })],
    });
    expect(frame('Evolução do VDOT')).toBeTruthy();
    expect(screen.queryByText('Previsão de prova')).not.toBeInTheDocument();
    expect(screen.queryByTestId('race-prediction-base')).not.toBeInTheDocument();
  });
});

describe('R3 — "na última" é a corrida mais recente', () => {
  const pontos = [
    { date: '2026-10-03', paceSecondsPerKm: 300, avgHR: 150, label: 'Corrida' },
    { date: '2026-09-29', paceSecondsPerKm: 310, avgHR: 160, label: 'Corrida' },
    { date: '2026-09-14', paceSecondsPerKm: 360, avgHR: 170, label: 'Corrida' },
  ];

  it('com os dados por data descendente (como o store), mostra a de 3 out', () => {
    render(<ScatterTrendChart data={pontos} />);
    const f = screen.getByTestId('chart-frame');
    expect(within(f).getByTestId('chart-frame-value')).toHaveTextContent('5.00');
    expect(within(f).getByTestId('chart-frame-unit')).toHaveTextContent('/km a 150 bpm na última');
  });

  it('desenha os pontos por data ascendente e a opacidade cresce para a mais recente', () => {
    render(<ScatterTrendChart data={pontos} />);
    const ds = h.scatterProps.at(-1).data.datasets[0];
    expect(ds.data.map((p) => p.rawDate)).toEqual(['2026-09-14', '2026-09-29', '2026-10-03']);
    const alfa = (c) => Number(/,\s*([\d.]+)\)$/.exec(c)[1]);
    const a = ds.backgroundColor.map(alfa);
    expect(a[0]).toBeLessThan(a[1]);
    expect(a[1]).toBeLessThan(a[2]);
  });

  it('não muda o array recebido', () => {
    const entrada = [...pontos];
    render(<ScatterTrendChart data={entrada} />);
    expect(entrada.map((p) => p.date)).toEqual(pontos.map((p) => p.date));
  });

  it('a mesma ordem vale no dashboard, com as corridas por data descendente', () => {
    const hr = (bpm) => ({ avg_heart_rate_bpm: bpm });
    monta({
      runs: [
        corrida({ id: '3', date: '2026-10-03', distance_km: 10, duration_seconds: 3000, details: hr(150) }),
        corrida({ id: '2', date: '2026-09-29', distance_km: 10, duration_seconds: 3100, details: hr(160) }),
        corrida({ id: '1', date: '2026-09-14', distance_km: 10, duration_seconds: 3600, details: hr(170) }),
      ],
    });
    const f = frame('Eficiência aeróbica');
    expect(within(f).getByTestId('chart-frame-unit')).toHaveTextContent('/km a 150 bpm na última');
  });
});

describe('R4 — Pace Médio só com corridas com distância e tempo', () => {
  const kpiPace = () => screen.getByText('Pace Médio').closest('div').parentElement;

  it('10 km a 5:00 mais 10 km sem tempo dá 5:00/km, não 2:30/km, e diz "1 de 2"', () => {
    monta({
      runs: [
        corrida({ id: 'a', distance_km: 10, duration_seconds: 3000 }),
        corrida({ id: 'b', date: '2026-09-20', distance_km: 10, duration_seconds: null }),
      ],
    });
    expect(kpiPace()).toHaveTextContent('5.00/km');
    expect(screen.getByTestId('pace-denominador')).toHaveTextContent('1 de 2 corridas com distância e tempo');
  });

  it('uma corrida com tempo e sem distância não torna o ritmo mais lento', () => {
    monta({
      runs: [
        corrida({ id: 'a', distance_km: 10, duration_seconds: 3000 }),
        corrida({ id: 'b', date: '2026-09-20', distance_km: null, duration_seconds: 3000 }),
      ],
    });
    expect(kpiPace()).toHaveTextContent('5.00/km');
    expect(screen.getByTestId('pace-denominador')).toHaveTextContent('1 de 2 corridas com distância e tempo');
  });

  it('todas com tempo: sem nota de denominador', () => {
    monta({ runs: [corrida({ id: 'a' }), corrida({ id: 'b', date: '2026-09-20' })] });
    expect(screen.queryByTestId('pace-denominador')).not.toBeInTheDocument();
  });

  it('nenhuma com tempo: sem número, e diz o que falta', () => {
    monta({ runs: [corrida({ id: 'a', duration_seconds: null }), corrida({ id: 'b', date: '2026-09-20', duration_seconds: null })] });
    expect(kpiPace()).toHaveTextContent('—');
    expect(screen.getByTestId('pace-denominador')).toHaveTextContent('nenhuma das 2 corridas tem distância e tempo registados');
  });

  it('corrida com tempo mas sem distância: a nota diz o que falta (distância), não "sem tempo"', () => {
    monta({ runs: [corrida({ id: 'a', distance_km: null, duration_seconds: 1200 })] });
    expect(kpiPace()).toHaveTextContent('—');
    const nota = screen.getByTestId('pace-denominador');
    expect(nota).toHaveTextContent('a corrida não tem distância e tempo registados');
    expect(nota).not.toHaveTextContent('não tem tempo registado');
  });

  it('a campo "pace" (que a BD não tem) já não conta como tempo', () => {
    monta({ runs: [corrida({ id: 'a', duration_seconds: null, pace: '5:00/km' })] });
    expect(kpiPace()).toHaveTextContent('—');
  });
});

describe('R8 — o alvo 80/20 sem nível declarado é o da Carol (80%)', () => {
  const zonas = { hr_zones: [{ zone: 1, minutes: 40 }, { zone: 2, minutes: 44 }, { zone: 3, minutes: 16 }] };

  it('sem experience_level: alvo 80%, e o veredicto não acusa "forte demais"', () => {
    monta({ runs: [corrida({ details: zonas })], profile: {} });
    const f = frame('Distribuição de intensidade');
    expect(within(f).getByTestId('chart-frame-delta')).toHaveTextContent('alvo 80%');
    expect(document.body).not.toHaveTextContent('máximo 5%');
  });

  it('com nível declarado, esse nível manda (iniciante: 95%)', () => {
    monta({ runs: [corrida({ details: zonas })], profile: { experience_level: 'iniciante' } });
    const f = frame('Distribuição de intensidade');
    expect(within(f).getByTestId('chart-frame-delta')).toHaveTextContent('alvo 95%');
  });
});

describe('R9 — rótulos dos recordes', () => {
  it('"≈5 km / ≈10 km / ≈21 km" com o intervalo real na legenda', () => {
    monta({ runs: [corrida({ distance_km: 5, duration_seconds: 1500 })] });
    expect(screen.getByText('≈5 km')).toBeInTheDocument();
    expect(screen.getByText('≈10 km')).toBeInTheDocument();
    expect(screen.getByText('≈21 km')).toBeInTheDocument();
    expect(screen.queryByText('5 km+')).not.toBeInTheDocument();
    const legenda = screen.getByTestId('recordes-intervalos');
    expect(legenda).toHaveTextContent('4 a 6,5 km');
    expect(legenda).toHaveTextContent('8,5 a 12 km');
    expect(legenda).toHaveTextContent('19 a 23 km');
  });

  it('a legenda diz o mesmo que bestPace.ts: as fronteiras dos intervalos', () => {
    const run = (km) => [{ date: '2026-09-01', distance_km: km, duration_seconds: km * 300, details: {} }];
    const dentro = (alvo, km) => computeBestPace(run(km), alvo) !== null;
    expect([dentro(5, 3.99), dentro(5, 4), dentro(5, 6.5), dentro(5, 6.51)]).toEqual([false, true, true, false]);
    expect([dentro(10, 8.49), dentro(10, 8.5), dentro(10, 12), dentro(10, 12.01)]).toEqual([false, true, true, false]);
    expect([dentro(21, 18.99), dentro(21, 19), dentro(21, 23), dentro(21, 23.01)]).toEqual([false, true, true, false]);
  });
});
