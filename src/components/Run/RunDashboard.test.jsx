import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeBestPace } from '@formulas/bestPace.ts';

/* Corrida — factos errados R1–R10 e períodos de calendário (evolução
   2026-10-04, fase 5). O RunDashboard monta-se inteiro, com o store simulado e
   os gráficos substituídos por marcadores (o jsdom não tem canvas); o Scatter e
   o Bar guardam os dados que recebem. "Hoje" é fixo (domingo, 4 out 2026) e
   mexe-se por `h.today` para os testes de "a começar". */

const h = vi.hoisted(() => ({ state: {}, scatterProps: [], barProps: [], chartProps: [], today: '2026-10-04', ready: true }));

vi.mock('../../utils/useTodayISO', () => ({ useTodayISO: () => h.today, default: () => h.today }));
vi.mock('../../store', () => ({ useAppStore: (sel) => (typeof sel === 'function' ? sel(h.state) : h.state), sliceReady: () => h.ready }));
vi.mock('react-chartjs-2', () => ({
  Bar: (props) => { h.barProps.push(props); return <div data-testid="chart-bar" />; },
  Line: () => <div data-testid="chart-line" />,
  Doughnut: () => <div data-testid="chart-donut" />,
  Scatter: (props) => { h.scatterProps.push(props); return <div data-testid="chart-scatter" />; },
  Chart: (props) => { h.chartProps.push(props); return <div data-testid="chart-base" />; },
}));

import RunDashboard from './RunDashboard';
import ScatterTrendChart from '../BI/ScatterTrendChart';
import { descreverBase, formatPredictedTime } from '../BI/RacePredictionChart';
import { usePeriodStore } from '../../store/periodStore';
import { resetEvolutionCache } from '../../store/evolution/cache';
import { resetEvolutionCore } from '../../store/evolution/core';

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

// Por omissão o ano (1 jan – 3 out): apanha as corridas de setembro dos testes antigos.
function monta({ runs = [], raceEvents = [], profile = {}, kind = 'ano', offset = 0 } = {}) {
  h.state = { runs, raceEvents, profile, setOpenCreationMode: vi.fn(), coachPlans: [], coachPlanItems: [] };
  act(() => usePeriodStore.getState().setPeriod('corrida', kind, offset));
  return render(<RunDashboard />);
}

const frame = (label) => screen.getAllByTestId('chart-frame').find((f) => within(f).queryByText(label));
const linha = (label) => screen.getAllByTestId('summary-row').find((r) => within(r).queryByText(label));

beforeEach(() => {
  h.scatterProps.length = 0;
  h.barProps.length = 0;
  h.chartProps.length = 0;
  h.today = '2026-10-04';
  h.ready = true;
  resetEvolutionCache();
  resetEvolutionCore();
  act(() => usePeriodStore.getState().reset());
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

  it('o tempo previsto tem o formato do hub: segundos arredondados, h:mm:ss', () => {
    // O hub faz formatDuration(Math.round(s)); o gráfico fazia floor e "1h35:00".
    expect(formatPredictedTime(2999.6)).toBe('50:00');
    expect(formatPredictedTime(5700)).toBe('1:35:00');
    expect(formatPredictedTime(5699.5)).toBe('1:35:00');
    expect(formatPredictedTime(0)).toBe('—');
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

  it('o gráfico diz de que período são as sessões', () => {
    render(<ScatterTrendChart data={pontos} scope="neste mês" />);
    expect(screen.getByTestId('chart-frame')).toHaveTextContent('3 sessões neste mês');
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

  it('com menos de 3 corridas com FC, não há nuvem: diz quantas faltam', () => {
    monta({ runs: [corrida({ details: { avg_heart_rate_bpm: 150 } })] });
    expect(frame('Eficiência aeróbica')).toBeUndefined();
    expect(screen.getByText(/preciso de pelo menos 3 corridas com frequência cardíaca média neste ano \(tens 1\)/)).toBeInTheDocument();
  });
});

describe('R4 — Pace médio só com corridas com distância e tempo, e diz "N de M"', () => {
  it('10 km a 5:00 mais 10 km sem tempo dá 5.00/km, não 2.30/km, e diz "1 de 2 com tempo"', () => {
    monta({
      runs: [
        corrida({ id: 'a', distance_km: 10, duration_seconds: 3000 }),
        corrida({ id: 'b', date: '2026-09-20', distance_km: 10, duration_seconds: null }),
      ],
    });
    const l = linha('Pace médio');
    expect(within(l).getByTestId('row-value')).toHaveTextContent('5.00/km');
    expect(l).toHaveTextContent('1 de 2 com tempo');
  });

  it('uma corrida com tempo e sem distância não torna o ritmo mais lento', () => {
    monta({
      runs: [
        corrida({ id: 'a', distance_km: 10, duration_seconds: 3000 }),
        corrida({ id: 'b', date: '2026-09-20', distance_km: null, duration_seconds: 3000 }),
      ],
    });
    const l = linha('Pace médio');
    expect(within(l).getByTestId('row-value')).toHaveTextContent('5.00/km');
    expect(l).toHaveTextContent('1 de 2 com tempo');
  });

  it('todas com tempo: sem nota de denominador', () => {
    monta({ runs: [corrida({ id: 'a' }), corrida({ id: 'b', date: '2026-09-20' })] });
    expect(linha('Pace médio')).not.toHaveTextContent('com tempo');
    // R3: toda a média diz o denominador, mesmo quando são todas.
    expect(linha('Pace médio')).toHaveTextContent('em 2 corridas');
  });

  it('nenhuma com tempo: sem número, e diz o que falta', () => {
    monta({ runs: [corrida({ id: 'a', duration_seconds: null }), corrida({ id: 'b', date: '2026-09-20', duration_seconds: null })] });
    const l = linha('Pace médio');
    expect(within(l).getByTestId('row-value')).toHaveTextContent('—');
    expect(l).toHaveTextContent('sem distância e tempo');
  });

  it('o campo "pace" (que a BD não tem) já não conta como tempo', () => {
    monta({ runs: [corrida({ id: 'a', duration_seconds: null, pace: '5:00/km' })] });
    expect(within(linha('Pace médio')).getByTestId('row-value')).toHaveTextContent('—');
  });
});

describe('R8 — o alvo 80/20 sem nível declarado é o da Carol (80%)', () => {
  const zonas = { hr_zones: [{ zone: 1, minutes: 40 }, { zone: 2, minutes: 44 }, { zone: 3, minutes: 16 }] };
  const tres = () => ['2026-09-10', '2026-09-12', '2026-09-14'].map((date, i) => corrida({ id: `z${i}`, date, details: zonas }));

  it('sem experience_level: alvo 80%, e o veredicto não acusa "forte demais"', () => {
    monta({ runs: tres(), profile: {} });
    const f = frame('Distribuição de intensidade');
    expect(within(f).getByTestId('chart-frame-delta')).toHaveTextContent('alvo 80%');
    expect(document.body).not.toHaveTextContent('máximo 5%');
  });

  it('com nível declarado, esse nível manda (iniciante: 95%)', () => {
    monta({ runs: tres(), profile: { experience_level: 'iniciante' } });
    const f = frame('Distribuição de intensidade');
    expect(within(f).getByTestId('chart-frame-delta')).toHaveTextContent('alvo 95%');
  });

  it('diz de que período e sobre quantas corridas é a distribuição', () => {
    monta({ runs: [...tres(), corrida({ id: 'sem-zonas', date: '2026-09-16' })] });
    expect(frame('Distribuição de intensidade')).toHaveTextContent('3 de 4 corridas com zonas neste ano');
  });

  it('com menos de 3 corridas com zonas não há donut (R6): diz quantas tem', () => {
    monta({ runs: tres().slice(0, 2) });
    expect(frame('Distribuição de intensidade')).toBeUndefined();
    expect(screen.getByText(/preciso de pelo menos 3 corridas com zonas de frequência cardíaca neste ano \(tens 2\)/)).toBeInTheDocument();
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

describe('R1 (fase 5) — períodos de calendário, só dias fechados', () => {
  it('o seletor é Semana · Mês · Trimestre · Ano, com o Mês por omissão e o navegador no resumo', () => {
    monta({ runs: [corrida({ date: '2026-10-02' })], kind: 'mes' });
    ['Semana', 'Mês', 'Trimestre', 'Ano'].forEach((l) => expect(screen.getByRole('button', { name: l })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /6 Meses/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dia' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
    const resumo = screen.getByTestId('period-summary');
    expect(within(resumo).getByText('outubro 2026')).toBeInTheDocument();
    // O 1.º registo é 2 out (dentro do mês): o navegador diz os dias fechados DESDE
    // ele — os que a vista conta —, não os "3 de 31" do calendário.
    expect(within(resumo).getByText('desde 2 out · em curso · 2 dias fechados')).toBeInTheDocument();
  });

  it('uma só definição de dias fechados: o Ano em curso diz "desde 13 jul · … 83 dias fechados" uma vez, não 276 de 365 e depois 83', () => {
    // 1.º registo a 13 jul 2026 → 13 jul … 3 out = 19 + 31 + 30 + 3 = 83 dias fechados.
    monta({
      runs: [corrida({ id: 'a', date: '2026-07-13' }), corrida({ id: 'b', date: '2026-09-12' })],
      kind: 'ano',
    });
    const resumo = screen.getByTestId('period-summary');
    expect(within(resumo).getByText('desde 13 jul · em curso · 83 dias fechados')).toBeInTheDocument();
    expect(resumo.textContent).not.toMatch(/276/);
    expect(resumo.textContent).not.toMatch(/de 365/);
    // O cabeçalho do bloco de KPIs deixou de repetir a contagem.
    expect(within(resumo).getByTestId('summary-columns')).toHaveTextContent('No período');
    expect(within(resumo).getByTestId('summary-columns')).not.toHaveTextContent('fechados');
    expect(resumo.textContent.match(/dias fechados/g)).toHaveLength(1);
    // Nem o gráfico a repete: "km no período".
    expect(frame('Distância por semana')).toHaveTextContent('km no período');
    expect(frame('Distância por semana')).not.toHaveTextContent('dias fechados');
  });

  it('Trimestre em curso com histórico anterior ao trimestre: o rótulo do calendário fica ("N de M dias fechados")', () => {
    monta({ runs: [corrida({ id: 'a', date: '2026-07-01' }), corrida({ id: 'b', date: '2026-09-12' })], kind: 'trimestre' });
    // out – dez: 3 de 92 dias fechados e o 1.º registo é de antes → nada a corrigir.
    expect(within(screen.getByTestId('period-summary')).getByText('em curso · 3 de 92 dias fechados')).toBeInTheDocument();
  });

  it('hoje não entra: a corrida de hoje (4 out) fica de fora dos números e a nota diz "aparece amanhã"', () => {
    monta({
      runs: [corrida({ id: 'hoje', date: '2026-10-04', distance_km: 12 }), corrida({ id: 'a', date: '2026-10-02', distance_km: 6 })],
      kind: 'semana',
    });
    expect(within(linha('Corridas')).getByTestId('row-value')).toHaveTextContent('1');
    expect(within(linha('Distância')).getByTestId('row-value')).toHaveTextContent('6,0 km');
    expect(screen.getByTestId('today-excluded-note')).toHaveTextContent('Hoje ainda não acabou, por isso não entra nas contas do período (a carga e os recordes já o incluem); aparece amanhã.');
    expect(screen.getByTestId('today-excluded-note')).not.toHaveTextContent('toca em Dia');
  });

  it('não sobra nenhum rótulo cru de período (R6 — "6mêses", "Trimêstre", "mes")', () => {
    const hr = { elevation_gain_m: 100, calories_kcal: 500, cadence_spm: 170 };
    for (const kind of ['semana', 'mes', 'trimestre', 'ano']) {
      const { unmount } = monta({ runs: [corrida({ date: '2026-10-02', details: hr })], kind });
      const texto = document.body.textContent;
      expect(texto).not.toMatch(/6\s?m[eê]ses/i);
      expect(texto).not.toMatch(/Trimêstre|6meses|\bmes\b/);
      unmount();
    }
  });

  it('o cartão do relógio leva o nome do período e "N de M corridas com dados"', () => {
    monta({
      runs: [
        corrida({ id: 'a', date: '2026-09-10', details: { elevation_gain_m: 120, calories_kcal: 600 } }),
        corrida({ id: 'b', date: '2026-09-12', details: {} }),
        corrida({ id: 'c', date: '2026-09-14', details: { elevation_gain_m: 80 } }),
      ],
      kind: 'mes',
      offset: -1,
    });
    const card = screen.getByTestId('relogio');
    // Minúscula como a pista dos outros cartões ("setembro 2026") — 2026-10-04.
    expect(within(card).getByTestId('relogio-periodo').textContent).toBe('setembro 2026');
    // R6: sem text-transform: capitalize ("Semana De 21 Set").
    expect(within(card).getByTestId('relogio-periodo').className).not.toMatch(/capitalize/);
    // Mesmo cartão dos gráficos (ChartFrame): borda e fundo do vidro, não a borda branca antiga.
    expect(card.style.border).toBe('1px solid var(--border-glass)');
    expect(card.style.background).toBe('var(--surface-glass)');
    expect(card.className).not.toMatch(/border-white/);
    expect(within(card).getByTestId('relogio-elev-n')).toHaveTextContent('2 de 3 corridas');
    expect(within(card).getByTestId('relogio-cal-n')).toHaveTextContent('1 de 3 corridas');
    expect(within(card).getByTestId('relogio-cad-n')).toHaveTextContent('sem dados');
    expect(card).toHaveTextContent('200');
  });

  it('a cadência é ponderada pelo tempo: 60 min a 160 e 20 min a 180 dão 165, não 170', () => {
    monta({
      runs: [
        corrida({ id: 'a', date: '2026-09-10', duration_seconds: 3600, details: { cadence_spm: 160 } }),
        corrida({ id: 'b', date: '2026-09-12', duration_seconds: 1200, details: { cadence_spm: 180 } }),
      ],
      kind: 'mes',
      offset: -1,
    });
    const card = screen.getByTestId('relogio');
    expect(within(card).getByText('165')).toBeInTheDocument();
    expect(within(card).getByTestId('relogio-cadencia-nota')).toHaveTextContent('ponderada pelo tempo');
  });

  it('navegar ‹ muda o período e o "Voltar a este mês" repõe-no', () => {
    monta({ runs: [corrida({ date: '2026-09-12' })], kind: 'mes' });
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(within(screen.getByTestId('period-summary')).getByText('setembro 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar a este mês' }));
    expect(within(screen.getByTestId('period-summary')).getByText('outubro 2026')).toBeInTheDocument();
  });
});

describe('R5 (fase 5) — barras com o mesmo intervalo dos KPIs', () => {
  const barras = () => h.barProps.at(-1).data.datasets[0].data;

  it('Semana (28 set – 4 out, hoje domingo): 6 barras (os dias fechados), nenhuma a zero a mais, total = soma', () => {
    monta({
      runs: [
        corrida({ id: 'a', date: '2026-09-28', distance_km: 5 }),
        corrida({ id: 'b', date: '2026-10-01', distance_km: 8 }),
        corrida({ id: 'c', date: '2026-10-03', distance_km: 12 }),
        corrida({ id: 'hoje', date: '2026-10-04', distance_km: 99 }),
      ],
      kind: 'semana',
    });
    expect(barras()).toEqual([5, 0, 0, 8, 0, 12]);
    const f = frame('Distância por dia');
    expect(within(f).getByTestId('chart-frame-value')).toHaveTextContent('25,0');
    expect(within(linha('Distância')).getByTestId('row-value')).toHaveTextContent('25,0 km');
  });

  it('Mês (outubro, 3 dias fechados): 3 barras', () => {
    monta({ runs: [corrida({ id: 'x', date: '2026-09-01' }), corrida({ date: '2026-10-02', distance_km: 7 })], kind: 'mes' });
    expect(barras()).toEqual([0, 7, 0]);
  });

  it('Trimestre: barras por semana, a soma é o total dos KPIs e a semana parcial diz quantos dias tem', () => {
    monta({
      runs: [
        corrida({ id: 'a', date: '2026-10-01', distance_km: 4 }),
        corrida({ id: 'b', date: '2026-09-30', distance_km: 99 }),
      ],
      kind: 'trimestre',
    });
    const dados = barras();
    expect(dados).toEqual([4]);
    const labels = h.barProps.at(-1).data.labels;
    expect(labels[0]).toBe('1 – 3 out (3 dias)');
    expect(frame('Distância por semana')).toBeTruthy();
    expect(within(linha('Distância')).getByTestId('row-value')).toHaveTextContent('4,0 km');
  });

  it('Ano: por semana; dias antes do 1.º registo não são zeros', () => {
    monta({
      runs: [corrida({ id: 'a', date: '2026-09-20', distance_km: 10 }), corrida({ id: 'b', date: '2026-09-27', distance_km: 6 })],
      kind: 'ano',
    });
    const labels = h.barProps.at(-1).data.labels;
    // 1.º registo: dom 20 set → a 1.ª barra é 20–20 set (1 dia), não 1 jan.
    expect(labels[0]).toBe('20 set (1 dia)');
    expect(barras().reduce((s, v) => s + v, 0)).toBe(16);
    expect(barras().length).toBe(3); // 20 set | 21–27 set | 28 set – 3 out
  });
});

describe('R1 — um só ACWR no ecrã', () => {
  const regulares = () => [
    corrida({ id: 'a', date: '2026-09-10', distance_km: 10 }),
    corrida({ id: 'b', date: '2026-09-17', distance_km: 10 }),
    corrida({ id: 'c', date: '2026-09-24', distance_km: 10 }),
    corrida({ id: 'd', date: '2026-10-01', distance_km: 10 }),
  ];

  it('o cabeçalho do gráfico é o mesmo número do KPI "Carga · 7 d vs 28 d"', () => {
    monta({ runs: regulares(), kind: 'mes' });
    const kpi = within(linha('Carga · 7 d vs 28 d')).getByTestId('row-value').textContent;
    const f = frame('Carga aguda : crónica');
    expect(kpi).toMatch(/^\d,\d\d$/);
    expect(within(f).getByTestId('chart-frame-value')).toHaveTextContent(kpi);
    expect(f).toHaveTextContent('últimas 12 semanas');
  });

  it('o gráfico não depende do período: o mesmo número em Semana e em Ano', () => {
    const primeiro = monta({ runs: regulares(), kind: 'semana' });
    const a = within(frame('Carga aguda : crónica')).getByTestId('chart-frame-value').textContent;
    primeiro.unmount();
    monta({ runs: regulares(), kind: 'ano' });
    const b = within(frame('Carga aguda : crónica')).getByTestId('chart-frame-value').textContent;
    expect(a).toBe(b);
  });

  it('sem histórico, o KPI diz quantas semanas faltam e o gráfico não finge um número', () => {
    monta({ runs: [corrida({ date: '2026-10-01' })], kind: 'mes' });
    const l = linha('Carga · 7 d vs 28 d');
    expect(l).toHaveTextContent('Faltam 2 sem.');
    expect(within(frame('Carga aguda : crónica')).getByTestId('chart-frame-value')).toHaveTextContent('—');
  });

  it('a semana em curso vai no gráfico às riscas e sem rácio', () => {
    monta({ runs: regulares(), kind: 'mes' });
    const { data } = h.chartProps.at(-1);
    const semanas = data.datasets[0].data;
    expect(semanas.at(-1)).toBeNull();
    expect(data.labels.length).toBe(12);
    expect(frame('Carga aguda : crónica')).toHaveTextContent('Semana em curso (fora das contas)');
  });
});

describe('R6/R7/R8 — a começar, cedo e vazio', () => {
  it('segunda-feira (semana a começar): resumo sem médias, "A semana começou hoje" e o resumo da anterior', () => {
    h.today = '2026-10-05';
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    monta({
      runs: [corrida({ date: '2026-09-29', distance_km: 8 }), corrida({ id: 'b', date: '2026-10-01', distance_km: 10 })],
      kind: 'semana',
    });
    expect(screen.getByTestId('early-a-comecar')).toHaveTextContent('A semana começou hoje');
    expect(within(linha('Distância')).getByTestId('row-value')).toHaveTextContent('—');
    expect(linha('Distância')).toHaveTextContent('ainda sem dias fechados');
    expect(screen.getByTestId('early-a-comecar')).toHaveTextContent('Semana passada (28 set – 4 out): 2 corridas · 18,0 km');
    expect(screen.getByRole('button', { name: 'Ver semana passada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver hoje' })).toBeNull();
    expect(screen.queryByTestId('chart-bar')).toBeNull();
    // o que não é do período continua lá
    expect(frame('Carga aguda : crónica')).toBeTruthy();
  });

  it('mês com 3 dias fechados: "Só 3 dias fechados em outubro — ainda é cedo para conclusões."', () => {
    monta({ runs: [corrida({ id: 'x', date: '2026-09-01' }), corrida({ date: '2026-10-02' })], kind: 'mes' });
    expect(screen.getByText('Só 3 dias fechados em outubro — ainda é cedo para conclusões.')).toBeInTheDocument();
    expect(screen.queryByTestId('run-deltas')).toBeNull();
    // o anterior em linha simples, não ▲/▼
    expect(screen.getByTestId('period-summary')).toHaveTextContent('setembro: 1 corrida · 10,0 km');
  });

  it('período sem corridas: diz-o, e a carga, o VDOT e os recordes não se escondem', () => {
    monta({
      runs: [corrida({ id: 'a', date: '2026-08-20' }), corrida({ id: 'b', date: '2026-09-12' })],
      kind: 'semana',
    });
    expect(screen.getByText('Sem corridas nesta semana')).toBeInTheDocument();
    expect(screen.getByText('A última foi a 12 de setembro.')).toBeInTheDocument();
    expect(frame('Carga aguda : crónica')).toBeTruthy();
    expect(frame('Evolução do VDOT')).toBeTruthy();
    expect(screen.getByTestId('recordes-intervalos')).toBeInTheDocument();
    expect(screen.queryByText('Registar corrida')).toBeInTheDocument();
    expect(screen.queryByText(/zero corridas/)).toBeNull();
  });

  it('período fechado sem corridas não oferece "Registar corrida"', () => {
    monta({ runs: [corrida({ date: '2026-09-12' })], kind: 'semana', offset: -2 });
    expect(screen.getByText('Sem corridas na semana de 14 set')).toBeInTheDocument();
    expect(screen.queryByText('Registar corrida')).toBeNull();
  });

  it('antes do primeiro registo: não são zeros, é "antes do teu primeiro registo"', () => {
    monta({ runs: [corrida({ date: '2026-09-12' })], kind: 'mes', offset: -12 });
    expect(screen.getByText('Antes do teu primeiro registo')).toBeInTheDocument();
    expect(screen.getByTestId('period-summary')).toHaveTextContent('antes do 1.º registo');
  });

  it('sem nenhuma corrida registada: o convite, com o seletor à vista', () => {
    monta({ runs: [] });
    expect(screen.getByRole('button', { name: 'Semana' })).toBeInTheDocument();
    expect(screen.getByText('Registar corrida')).toBeInTheDocument();
    expect(screen.queryByTestId('period-summary')).toBeNull();
  });
});

describe('R5 — ▲/▼ só contra o anterior equivalente e fechado', () => {
  const corridasDeSetembro = (n, km) => Array.from({ length: n }, (_, i) =>
    corrida({ id: `s${i}`, date: `2026-09-${String(2 + i * 3).padStart(2, '0')}`, distance_km: km }));
  const corridasDeAgosto = (n, km) => Array.from({ length: n }, (_, i) =>
    corrida({ id: `a${i}`, date: `2026-08-${String(1 + i * 3).padStart(2, '0')}`, distance_km: km }));

  // Setembro tem 30 dias e agosto 31: comparam-se os mesmos 30 dias ("1 – 30 ago"), nunca 30 contra 31.
  it('setembro contra agosto: a diferença e as datas do anterior', () => {
    monta({ runs: [...corridasDeAgosto(4, 5), ...corridasDeSetembro(6, 5)], kind: 'mes', offset: -1 });
    const d = screen.getByTestId('run-deltas');
    expect(d).toHaveTextContent('Corridas');
    expect(d).toHaveTextContent('▲ 2 corridas face a 1 – 30 ago');
    expect(d).toHaveTextContent('▲ 10,0 km face a 1 – 30 ago');
  });

  it('o 1.º período com registos não tem seta e diz-o', () => {
    monta({ runs: corridasDeSetembro(6, 5), kind: 'mes', offset: -1 });
    expect(screen.queryByTestId('run-deltas')).toBeNull();
    expect(screen.getByTestId('period-summary')).toHaveTextContent('Primeiro mês com registos — ainda não há outro para comparar.');
  });

  it('o anterior só em parte antes do 1.º registo não serve de comparação', () => {
    monta({ runs: [corrida({ id: 'x', date: '2026-08-20' }), ...corridasDeSetembro(6, 5)], kind: 'mes', offset: -1 });
    expect(screen.queryByTestId('run-deltas')).toBeNull();
    expect(screen.getByTestId('period-summary')).toHaveTextContent('Agosto começou antes do teu primeiro registo (20 ago) — não dá para comparar.');
  });

  it('a semana em curso compara-se com os mesmos dias da anterior (21 – 26 set), não com a semana toda', () => {
    monta({
      runs: [
        corrida({ id: 'p0', date: '2026-09-01', distance_km: 3 }),
        corrida({ id: 'p1', date: '2026-09-22', distance_km: 5 }),
        corrida({ id: 'p2', date: '2026-09-27', distance_km: 20 }), // domingo da anterior: fora da janela alinhada
        corrida({ id: 'c1', date: '2026-09-29', distance_km: 9 }),
      ],
      kind: 'semana',
    });
    expect(screen.getByTestId('run-deltas')).toHaveTextContent('▲ 4,0 km face a 21 – 26 set');
  });

  it('o pace é "melhor" quando desce (verde), com ≥2 corridas com tempo em cada período', () => {
    monta({
      runs: [
        corrida({ id: 'a1', date: '2026-08-01', distance_km: 10, duration_seconds: 3300 }),
        corrida({ id: 'a2', date: '2026-08-08', distance_km: 10, duration_seconds: 3300 }),
        corrida({ id: 's1', date: '2026-09-02', distance_km: 10, duration_seconds: 3000 }),
        corrida({ id: 's2', date: '2026-09-08', distance_km: 10, duration_seconds: 3000 }),
      ],
      kind: 'mes',
      offset: -1,
    });
    const delta = within(screen.getByTestId('run-deltas')).getAllByTestId('delta-vs-previous').find((e) => e.textContent.includes('s/km'));
    expect(delta).toHaveTextContent('▼ 30 s/km face a 1 – 30 ago');
    expect(delta).toHaveStyle({ color: 'var(--ok)' });
  });
});

describe('VDOT por período', () => {
  const tempo = (id, date, seconds) => corrida({ id, date, distance_km: 10, duration_seconds: seconds, training_type: 'tempo' });
  const treze = [
    tempo('a1', '2026-08-01', 3300), tempo('a2', '2026-08-09', 3300), tempo('a3', '2026-08-16', 3300),
    tempo('s1', '2026-09-02', 3000), tempo('s2', '2026-09-09', 3000), tempo('s3', '2026-09-16', 3000),
  ];

  it('o ▲ do gráfico é a média do período contra a do anterior, e o veredicto diz-o', () => {
    monta({ runs: treze, kind: 'mes', offset: -1 });
    const f = frame('Evolução do VDOT');
    expect(within(f).getByTestId('chart-frame-delta')).toHaveTextContent(/VDOT médio em setembro ▲ \d,\d face a agosto/);
    expect(f).toHaveTextContent('de sempre');
    expect(within(screen.getByTestId('period-summary')).getByTestId('verdict-line')).toHaveTextContent('A tua forma aeróbica está a subir');
  });

  it('com menos de 3 pontos no período não há seta no gráfico', () => {
    monta({ runs: treze.slice(0, 5), kind: 'mes', offset: -1 });
    expect(within(frame('Evolução do VDOT')).queryByTestId('chart-frame-delta')).toBeNull();
  });
});

describe('R10 — veredicto', () => {
  it('um período fechado fala dos factos dele, não da carga de hoje', () => {
    monta({ runs: [corrida({ id: 'a', date: '2026-09-10', distance_km: 8 }), corrida({ id: 'b', date: '2026-09-12', distance_km: 7 })], kind: 'mes', offset: -1 });
    expect(within(screen.getByTestId('period-summary')).getByTestId('verdict-line')).toHaveTextContent('Em setembro: 2 corridas e 15,0 km.');
  });
});

describe('revisão da Corrida (2026-10-04) — janelas, rótulos e contradições', () => {
  it('outubro fechado (corrida a 31 out) contra setembro: o ▲/▼ usa o mesmo intervalo dos KPIs', () => {
    h.today = '2026-11-05';
    vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0));
    monta({
      runs: [
        corrida({ id: 'a', date: '2026-09-01', distance_km: 10 }),
        corrida({ id: 'b', date: '2026-10-10', distance_km: 10 }),
        corrida({ id: 'c', date: '2026-10-31', distance_km: 21 }),
      ],
      kind: 'mes',
      offset: -1,
    });
    expect(within(linha('Distância')).getByTestId('row-value')).toHaveTextContent('31,0 km');
    const d = screen.getByTestId('run-deltas');
    expect(d).toHaveTextContent('▲ 21,0 km face a setembro');
    expect(d).not.toHaveTextContent('igual a setembro');
  });

  it('o rótulo do anterior leva o ano quando não é o corrente (Ano contra 2025)', () => {
    monta({
      runs: [corrida({ id: 'a', date: '2025-01-01', distance_km: 10 }), corrida({ id: 'b', date: '2026-03-10', distance_km: 14 })],
      kind: 'ano',
    });
    expect(screen.getByTestId('run-deltas')).toHaveTextContent('face a 1 jan – 3 out 2025');
  });

  it('o aviso "cedo" diz que conta desde o 1.º registo quando o período começou antes dele', () => {
    h.today = '2026-10-07';
    vi.setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
    monta({ runs: [corrida({ id: 'a', date: '2026-10-06' })], kind: 'semana' });
    expect(screen.getByText('Só 1 dia fechado nesta semana (desde o 1.º registo) — ainda é cedo para conclusões.')).toBeInTheDocument();
  });

  it('período fechado com poucos dias não diz "cedo para conclusões"', () => {
    monta({ runs: [corrida({ id: 'a', date: '2026-09-28' }), corrida({ id: 'b', date: '2026-09-29' })], kind: 'mes', offset: -1 });
    expect(screen.queryByText(/ainda é cedo para conclusões/)).toBeNull();
  });

  it('antes do 1.º registo: o veredicto e o cartão dizem o mesmo', () => {
    monta({ runs: [corrida({ date: '2026-09-12' })], kind: 'mes', offset: -12 });
    expect(screen.getByTestId('period-summary')).toHaveTextContent('Este período é anterior ao teu primeiro registo');
    expect(screen.queryByText(/Sem corridas em/)).toBeNull();
  });

  it('1.º registo hoje: "a começar" não oferece ir para um mês anterior ao registo', () => {
    monta({ runs: [corrida({ id: 'a', date: '2026-10-04' })], kind: 'mes' });
    expect(screen.getByTestId('early-a-comecar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver mês passado' })).toBeNull();
  });

  it('as legendas fora do período não prometem o que não é verdade', () => {
    monta({ runs: [corrida({ date: '2026-09-12' })], kind: 'mes', offset: -1 });
    expect(screen.getByTestId('fora-do-periodo')).not.toHaveTextContent('Os três blocos');
    expect(screen.getByTestId('recordes-de-sempre')).toBeInTheDocument();
  });

  it('recordes: "de sempre, hoje incluído" (a corrida de hoje conta nos recordes, que são factos fechados)', () => {
    // 5 km a 4:00/km hoje: é o melhor de sempre e aparece nos recordes, mesmo com a nota a dizer que hoje
    // ainda não entra nas contas do período.
    monta({
      runs: [
        corrida({ id: 'a', date: '2026-09-12', distance_km: 5, duration_seconds: 1500 }),
        corrida({ id: 'hoje', date: '2026-10-04', distance_km: 5, duration_seconds: 1200 }),
      ],
      kind: 'mes',
    });
    const recordes = screen.getByTestId('recordes-de-sempre');
    expect(recordes).toHaveTextContent('De sempre, hoje incluído');
    expect(recordes.parentElement).toHaveTextContent('4 out 2026');
    expect(screen.getByTestId('today-excluded-note')).toHaveTextContent('os recordes já o incluem');
  });

  it('a data dos recordes escreve o mês em minúsculas, como o resto do ecrã', () => {
    monta({ runs: [corrida({ date: '2026-09-12', distance_km: 5, duration_seconds: 1500 })], kind: 'ano' });
    expect(screen.getByTestId('recordes-de-sempre').parentElement).toHaveTextContent('12 set 2026');
  });
});

describe('limiares (2026-10-05) — onde estão os dados', () => {
  const zonas = (id, date) => corrida({ id, date, distance_km: 8, details: { hr_zones: [{ minutes: 25 }, { minutes: 5 }] } });
  const setembro = [zonas('z1', '2026-09-02'), zonas('z2', '2026-09-09'), zonas('z3', '2026-09-16')];

  it('R2: 0 corridas com zonas neste mês mas com setembro → diz a última e leva a setembro', () => {
    monta({ runs: [...setembro, corrida({ id: 'o1', date: '2026-10-01', details: {} })], kind: 'mes', offset: 0 });
    const nota = screen.getAllByTestId('min-data-note').find((n) => n.textContent.includes('Distribuição de intensidade'));
    expect(nota).toHaveTextContent('Distribuição de intensidade: em outubro não há corridas com zonas de frequência cardíaca — a última foi a 16 de setembro.');
    expect(nota).toHaveTextContent('Em setembro tens 3.');
    // NÃO diz "Regista corridas com zonas": o atleta já as tem.
    expect(screen.queryByText(/Regista corridas com zonas/)).toBeNull();
    const botao = within(nota).getByRole('button', { name: 'Ver setembro' });
    expect(botao.style.minHeight).toBe('var(--tap)');
    expect(botao.style.color).toBe('var(--run)');
    act(() => { fireEvent.click(botao); });
    expect(usePeriodStore.getState().tabs.corrida).toEqual({ kind: 'mes', offset: -1 });
  });

  it('R2: quem nunca teve zonas continua a ver o convite a registar, sem botão', () => {
    monta({ runs: [corrida({ id: 'o1', date: '2026-10-01', details: {} })], kind: 'mes', offset: 0 });
    const nota = screen.getAllByTestId('min-data-note').find((n) => n.textContent.includes('Regista corridas com zonas'));
    expect(nota).toBeTruthy();
    expect(screen.queryAllByTestId('min-data-action')).toHaveLength(0);
  });

  it('R2: sem 3 em setembro, o botão leva ao Ano', () => {
    monta({ runs: [zonas('z1', '2026-02-02'), zonas('z2', '2026-04-09'), zonas('z3', '2026-09-16'), corrida({ id: 'o1', date: '2026-10-01' })], kind: 'mes', offset: 0 });
    const nota = screen.getAllByTestId('min-data-note').find((n) => n.textContent.includes('Distribuição de intensidade'));
    act(() => { fireEvent.click(within(nota).getByRole('button', { name: 'Ver o ano' })); });
    expect(usePeriodStore.getState().tabs.corrida).toEqual({ kind: 'ano', offset: 0 });
  });

  it('R3: a eficiência com 0 neste mês diz a última e onde há', () => {
    const fc = (id, date) => corrida({ id, date, details: { avg_heart_rate_bpm: 150 } });
    monta({ runs: [fc('a', '2026-09-02'), fc('b', '2026-09-09'), fc('c', '2026-09-16'), corrida({ id: 'o1', date: '2026-10-01' })], kind: 'mes', offset: 0 });
    const nota = screen.getAllByTestId('min-data-note').find((n) => n.textContent.includes('Eficiência aeróbica'));
    expect(nota).toHaveTextContent('em outubro não há corridas com frequência cardíaca média — a última foi a 16 de setembro. Em setembro tens 3.');
    expect(within(nota).getByRole('button', { name: 'Ver setembro' })).toBeInTheDocument();
  });

  it('R4: a média por semana conta as semanas fechadas que tocam o mês (28 set – 4 out já fechou a 5 out)', () => {
    h.today = '2026-10-12';
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
    monta({ runs: [corrida({ id: 'a', date: '2026-09-01', distance_km: 5 }), corrida({ id: 'b', date: '2026-09-29', distance_km: 6 }), corrida({ id: 'c', date: '2026-10-06', distance_km: 10 })], kind: 'mes', offset: 0 });
    const l = linha('Média por semana');
    expect(within(l).getByTestId('row-value')).toHaveTextContent('8,0 km');
    expect(within(l).getByText('em 2 semanas')).toBeInTheDocument();
    expect(screen.getByText(/A média por semana usa as semanas seg–dom já fechadas que tocam o período \(28 set – 11 out\)\./)).toBeInTheDocument();
  });

  it('R4: antes de a 1.ª semana fechar diz quando fecha', () => {
    monta({ runs: [corrida({ id: 'a', date: '2026-09-01' }), corrida({ id: 'b', date: '2026-10-01' })], kind: 'mes', offset: 0 });
    expect(within(linha('Média por semana')).getByText('a 1.ª semana fecha a 4 out')).toBeInTheDocument();
  });

  it('R5: numa semana o VDOT não se compara e o cartão di-lo; num mês diz o que falta', () => {
    const tempo = (id, date, s) => corrida({ id, date, distance_km: 10, duration_seconds: s, training_type: 'tempo' });
    const runs = [tempo('x', '2026-08-01', 3300), tempo('y', '2026-08-15', 3300), tempo('a', '2026-09-01', 3300), tempo('b', '2026-09-15', 3300), tempo('c', '2026-10-01', 3000)];
    const { unmount } = monta({ runs, kind: 'semana', offset: 0 });
    expect(within(frame('Evolução do VDOT')).getByTestId('vdot-compare-note')).toHaveTextContent('A comparação do VDOT é por mês ou mais.');
    unmount();
    monta({ runs, kind: 'mes', offset: -1 });
    expect(within(frame('Evolução do VDOT')).getByTestId('vdot-compare-note')).toHaveTextContent('Para comparar o VDOT preciso de 3 treinos de qualidade em cada mês — setembro vai em 2, agosto (1 – 30 ago) teve 2.');
  });

  it('R8: sem tendência o cartão diz o critério real do VDOT, igual com ou sem prova', () => {
    monta({ runs: [corrida({ id: 'a', date: '2026-09-12', training_type: 'rodagem' })], kind: 'ano', offset: 0 });
    expect(screen.queryByText(/Regista corridas para veres a previsão desta prova/)).toBeNull();
  });

  it('R10: mês sem corridas fechadas mas com setembro: a linha do período diz onde e leva lá', () => {
    monta({ runs: [corrida({ id: 'a', date: '2026-09-10', distance_km: 8 }), corrida({ id: 'b', date: '2026-09-20', distance_km: 12 })], kind: 'mes', offset: 0 });
    const resumo = screen.getByTestId('period-summary');
    expect(resumo).toHaveTextContent('setembro: 2 corridas · 20,0 km');
    act(() => { fireEvent.click(within(resumo).getByRole('button', { name: /Ver setembro/ })); });
    expect(usePeriodStore.getState().tabs.corrida).toEqual({ kind: 'mes', offset: -1 });
  });
});

describe('o período por omissão abre no anterior quando está a começar (2026-10-05)', () => {
  const runs = [corrida({ id: 'a', date: '2026-10-10', distance_km: 8 }), corrida({ id: 'b', date: '2026-10-20', distance_km: 12 })];

  it('dia 1 do mês (0 dias fechados) com registos antes: abre em outubro, a seta › leva ao mês a começar', () => {
    h.today = '2026-11-01';
    vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
    h.state = { runs, raceEvents: [], profile: {}, setOpenCreationMode: vi.fn(), coachPlans: [], coachPlanItems: [] };
    render(<RunDashboard />);
    expect(usePeriodStore.getState().tabs.corrida).toEqual({ kind: 'mes', offset: -1 });
    expect(screen.getAllByText('outubro 2026').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'O mês começou hoje' })).toBeNull();
    // O mock-up do mês a começar continua disponível pela seta ›.
    act(() => { usePeriodStore.getState().shift('corrida', 1); });
    expect(screen.getByRole('heading', { name: 'O mês começou hoje' })).toBeInTheDocument();
  });

  it('quem já escolheu um período não é mexido', () => {
    h.today = '2026-11-01';
    vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
    h.state = { runs, raceEvents: [], profile: {}, setOpenCreationMode: vi.fn(), coachPlans: [], coachPlanItems: [] };
    act(() => usePeriodStore.getState().setPeriod('corrida', 'mes', 0));
    render(<RunDashboard />);
    expect(usePeriodStore.getState().tabs.corrida).toEqual({ kind: 'mes', offset: 0 });
    expect(screen.getByRole('heading', { name: 'O mês começou hoje' })).toBeInTheDocument();
  });

  it('quem nunca registou nada fica no período a começar (o convite), não num mês vazio', () => {
    h.today = '2026-11-01';
    vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
    h.state = { runs: [], raceEvents: [], profile: {}, setOpenCreationMode: vi.fn(), coachPlans: [], coachPlanItems: [] };
    render(<RunDashboard />);
    expect(usePeriodStore.getState().tabs.corrida).toEqual({ kind: 'mes', offset: 0 });
  });

  it('a meio do mês (já há dias fechados) abre no mês em curso', () => {
    h.state = { runs, raceEvents: [], profile: {}, setOpenCreationMode: vi.fn(), coachPlans: [], coachPlanItems: [] };
    render(<RunDashboard />); // hoje é 4 out
    expect(usePeriodStore.getState().tabs.corrida).toEqual({ kind: 'mes', offset: 0 });
  });
});

describe('abrir no mês anterior só depois de as corridas chegarem (revisão 2026-10-05)', () => {
  it('1.º render com a fatia por carregar (sem corridas) não grava "nunca registou": quando chegam, abre no mês anterior', () => {
    h.today = '2026-11-01';
    vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
    h.ready = false;
    h.state = { runs: [], raceEvents: [], profile: {}, setOpenCreationMode: vi.fn(), coachPlans: [], coachPlanItems: [] };
    const { rerender } = render(<RunDashboard />);
    expect(usePeriodStore.getState().tabs.corrida.offset).toBe(0);
    expect(usePeriodStore.getState().opened.corrida).toBeUndefined();
    h.ready = true;
    h.state = { ...h.state, runs: [corrida({ date: '2026-10-12' }), corrida({ date: '2026-09-20' })] };
    act(() => { rerender(<RunDashboard />); });
    expect(usePeriodStore.getState().tabs.corrida.offset).toBe(-1);
  });
});

/* Caminhada (2026-10-05, runKinds.ts): à parte das corridas, numa linha
   própria — e quem só caminha (pós-operatório) vê-a na mesma. */
describe('caminhadas à parte', () => {
  const caminhada = (over = {}) => corrida({ training_type: 'caminhada', duration_seconds: 2800, distance_km: 4, ...over });

  it('a linha "N caminhadas · X km" aparece e não mexe nos KPIs de corrida', () => {
    monta({ runs: [corrida({ id: 'c1', date: '2026-10-01' }), caminhada({ id: 'w1', date: '2026-10-02' }), caminhada({ id: 'w2', date: '2026-10-03', distance_km: 3.5 })], kind: 'mes' });
    const nota = screen.getByTestId('caminhadas-periodo');
    expect(nota.textContent).toContain('2 caminhadas · 7,5 km');
    expect(nota.textContent).toContain('não contam para os km, o pace nem a carga');
    expect(within(linha('Corridas')).getByText('1')).toBeTruthy();
  });

  it('só com caminhadas: o convite a registar corridas e as caminhadas à vista', () => {
    monta({ runs: [caminhada({ id: 'w1', date: '2026-10-02' })], kind: 'mes' });
    expect(screen.getByText(/Ainda não há corridas/)).toBeTruthy();
    expect(screen.getByTestId('caminhadas-periodo').textContent).toContain('1 caminhada · 4,0 km');
  });
});
