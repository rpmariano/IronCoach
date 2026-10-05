import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* A Nutrição na Evolução é o mock-up aprovado "Evolução · Nutrição por
   período" (fase 4, 2026-10-04): Dia · Semana · Mês · Trimestre, o resumo do
   período com 5 linhas, o veredicto factual, os gráficos de cada período,
   "Comer para treinar" e os micronutrientes — só com dias fechados (hoje não
   entra), o objetivo de cada dia e uma só régua.

   Hoje fixo: domingo, 4 out 2026 (o "hoje" do mock-up). A forma dos dados é a
   real da base de dados (meal_items por refeição). */
const h = vi.hoisted(() => ({ today: '2026-10-04' }));
vi.mock('../../utils/useTodayISO', () => ({ useTodayISO: () => h.today }));

import { useAppStore } from '../../store';
import { usePeriodStore } from '../../store/periodStore';
import { resetEvolutionCache } from '../../store/evolution/cache';
import NutritionDashboard from './NutritionDashboard';
import { fmtEa } from './EatingForTraining';
import { TabPageContext, TabReadyContext, setSettledIndex, resetSettledTab } from '../../utils/settledTab';

const PROFILE = { calorie_goal: 2400, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 };
let seq = 0;
const meal = (date, calories, protein, carbs, fat) => ({ id: `m${seq++}`, date, meal_items: [{ calories, protein, carbs, fat }] });

// A semana do mock-up (Main): seg 28 set – sáb 3 out fechados, e hoje até agora.
const WEEK = [
  meal('2026-09-28', 2520, 142, 310, 84), meal('2026-09-29', 2180, 128, 275, 76),
  meal('2026-09-30', 1960, 118, 230, 70), meal('2026-10-01', 2610, 151, 320, 86),
  meal('2026-10-02', 2040, 125, 255, 74), meal('2026-10-03', 2550, 128, 320, 78),
  meal('2026-10-04', 1240, 64, 150, 38),
];
// 21 – 26 set: calorias e proteína no objetivo em 3 de 6 (o "▼ 1" do mock-up).
const PREV_WEEK = [
  meal('2026-09-21', 2400, 150, 300, 80), meal('2026-09-22', 2400, 150, 300, 80),
  meal('2026-09-23', 2400, 150, 300, 80), meal('2026-09-24', 2000, 120, 250, 70),
  meal('2026-09-25', 2000, 120, 250, 70), meal('2026-09-26', 2000, 120, 250, 70),
  meal('2026-09-27', 2400, 150, 300, 80),
];
const WATER = [
  { date: '2026-09-28', amount_ml: 2600 }, { date: '2026-09-29', amount_ml: 2400 }, { date: '2026-09-30', amount_ml: 2100 },
  { date: '2026-10-02', amount_ml: 2200 }, { date: '2026-10-03', amount_ml: 2350 },
];
const RUNS = [{ date: '2026-09-29', distance_km: 12 }, { date: '2026-10-01', distance_km: 8 }, { date: '2026-10-03', distance_km: 20 }];
const GYM = [{ date: '2026-09-30', kind: 'forca' }];

function setData(patch = {}) {
  useAppStore.setState({
    profile: PROFILE,
    meals: [...PREV_WEEK, ...WEEK],
    waterLogs: WATER,
    runs: RUNS,
    gymSessions: GYM,
    bodyAssessments: [],
    goalHistory: [],
    coachPlans: [],
    coachPlanItems: [],
    nutritionDayFocus: null,
    ...patch,
  });
}

const summary = () => screen.getByRole('region', { name: 'Resumo do período' });
// Os números levam espaço inseparável nos milhares ("2 310"); aqui compara-se com espaço normal.
const nameOf = (el) => (el.getAttribute('aria-label') || '').replace(/[\u00a0\u202f]/g, ' ');
const row = (name) => within(summary()).getByRole('radio', { name: new RegExp(`^${name}:`) });

describe('NutritionDashboard — Semana (mock-up "Semana · esta semana")', () => {
  beforeEach(() => {
    h.today = '2026-10-04';
    usePeriodStore.getState().reset();
    resetEvolutionCache();
    setData();
  });

  it('o seletor é Dia · Semana · Mês · Trimestre (sem 6 Meses nem Ano)', () => {
    render(<NutritionDashboard />);
    const group = screen.getAllByRole('group', { name: 'Período' })[0];
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dia', 'Semana', 'Mês', 'Trimestre']);
    expect(within(group).getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('o resumo: período com ‹ ›, veredicto factual e 5 linhas só com os dias fechados (N1)', () => {
    render(<NutritionDashboard />);
    const s = summary();
    expect(within(s).getByTestId('period-title')).toHaveTextContent('Esta semana');
    expect(s).toHaveTextContent('28 set – 4 out · em curso');
    expect(within(s).getByRole('button', { name: 'Semana seguinte' })).toBeDisabled();
    expect(within(s).getByTestId('verdict-line')).toHaveTextContent(
      'Calorias no sítio (96%), mas a proteína está curta: 88% do objetivo — só 2 de 6 dias lá chegaram.',
    );
    expect(within(s).getByTestId('summary-columns')).toHaveTextContent('Média por dia registado (6 dias: 28 set – 3 out)');
    // Hoje (1 240 kcal até agora) não entra: a média é a dos 6 dias fechados.
    expect(nameOf(row('Calorias'))).toBe('Calorias: 2 310 de 2 400 kcal, Dentro · 96%, dias no objetivo: 4 de 6');
    expect(nameOf(row('Proteína'))).toBe('Proteína: 132 de 150 g, Abaixo · 88%, dias no objetivo: 2 de 6');
    expect(nameOf(row('Água'))).toBe('Água: 2 330 de 2 500 ml, Dentro · 93%, dias no objetivo: 3 de 5');
  });

  it('"X de N dias" e o ▼ contra os mesmos dias da semana anterior (N6), objetivos aproximados (N5)', () => {
    render(<NutritionDashboard />);
    const foot = within(summary()).getByTestId('summary-footer');
    expect(foot).toHaveTextContent('Calorias e proteína no objetivo em 2 de 6 dias');
    expect(within(foot).getByTestId('delta-vs-previous')).toHaveTextContent('▼ 1 face a 21 – 26 set');
    expect(foot).toHaveTextContent('Objetivos aproximados: a app só guarda as mudanças de objetivos desde 3 out.');
    expect(screen.getByTestId('today-excluded-note')).toHaveTextContent('Hoje ainda não acabou, por isso não entra nas contas. Para veres o dia de hoje, toca em Dia.');
  });

  it('barras por dia: 7 dias do calendário, hoje "até agora" sem estado, sem registo sem barra (N3)', () => {
    render(<NutritionDashboard />);
    const chart = screen.getByTestId('nutrition-week-chart');
    expect(within(chart).getByRole('heading', { name: 'Calorias por dia' })).toBeInTheDocument();
    expect(chart).toHaveTextContent('kcal/dia · média de 6 dias');
    expect(within(chart).getByTestId('delta-vs-previous')).toHaveTextContent('▲ 110 kcal face a 21 – 26 set');
    const days = within(within(chart).getByRole('radiogroup', { name: 'Dias da semana' })).getAllByRole('radio');
    expect(days).toHaveLength(7);
    expect(nameOf(days[6])).toBe('hoje, domingo, 4 de outubro: até agora 1 240 quilocalorias, em curso');
    expect(nameOf(days[1])).toBe('terça, 29 de setembro: 2 180 quilocalorias, dentro do objetivo, corrida 12 km');
    // Por omissão, o último dia fechado; tocar noutro dia mostra-o.
    expect(within(chart).getByTestId('chart-detail')).toHaveTextContent('sáb, 3 out · 2 550 de 2 400 kcal · 106% · Dentro · corrida 20 km');
    fireEvent.click(days[2]);
    expect(within(chart).getByTestId('chart-detail')).toHaveTextContent('qua, 30 set · 1 960 de 2 400 kcal · 82% · Abaixo · ginásio');
    expect(days[2]).toHaveAttribute('aria-checked', 'true');
    // Nada do ecrã antigo: KPIs com % ao alvo, linha "no último dia", adesão às macros.
    expect(screen.queryByText(/no último dia/)).not.toBeInTheDocument();
    expect(screen.queryByText('Adesão às macros')).not.toBeInTheDocument();
  });

  it('tocar numa linha do resumo escolhe o que os gráficos mostram', () => {
    render(<NutritionDashboard />);
    fireEvent.click(row('Proteína'));
    expect(row('Proteína')).toHaveAttribute('aria-checked', 'true');
    const chart = screen.getByTestId('nutrition-week-chart');
    expect(within(chart).getByRole('heading', { name: 'Proteína por dia' })).toBeInTheDocument();
    // Proteína sem teto: a linha dos 90%, não a zona 90–115%.
    expect(chart).toHaveTextContent('Objetivo: 90% ou mais');
    expect(chart).not.toHaveTextContent('Zona do objetivo');
  });

  it('"Ver dia" abre a vista Dia nesse dia', () => {
    render(<NutritionDashboard />);
    const chart = screen.getByTestId('nutrition-week-chart');
    fireEvent.click(within(chart).getByRole('button', { name: /Ver dia/ }));
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Ontem');
    expect(usePeriodStore.getState().tabs.nutricao.kind).toBe('dia');
  });

  it('comer para treinar: kcal com e sem treino, EA com a origem, dias de treino abaixo de 30', () => {
    render(<NutritionDashboard />);
    const card = screen.getByTestId('eating-for-training');
    expect(card).toHaveTextContent('2 325kcal/dia nos dias de treino');
    expect(card).toHaveTextContent('Com treino · 4 dias');
    expect(card).toHaveTextContent('Sem treino · 2 dias');
    expect(card).toHaveTextContent('Traço vertical: objetivo de 2 400 kcal');
    expect(within(card).getByTestId('eating-ea')).toHaveTextContent(/Energia que sobra depois do treino: \d+ kcal por kg de massa magra, em média/);
    // Sem avaliação: a massa magra é por omissão, e diz-se (N4).
    expect(within(card).getByTestId('eating-lean-mass')).toHaveTextContent('Sem avaliação com peso');
    const chips = within(within(card).getByTestId('eating-low-days')).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([expect.stringContaining('ter 29'), expect.stringContaining('sáb 3')]);
    fireEvent.click(chips[0]);
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent(/29/);
  });

  it('micronutrientes: média por dia do período, com o período e os dias (N2)', () => {
    render(<NutritionDashboard />);
    expect(screen.getByTestId('micros-title')).toHaveTextContent('Micronutrientes · média por dia');
    expect(screen.getByTestId('micros-subtitle')).toHaveTextContent('28 set – 4 out · 6 dias');
    fireEvent.click(screen.getByRole('button', { name: /Micronutrientes/ }));
    expect(screen.getByTestId('micro-fiber')).toHaveTextContent('g/dia');
    expect(screen.getByText('São mínimos: alimentos sem esta informação contam como zero.')).toBeInTheDocument();
  });
});

describe('NutritionDashboard — Semana a começar (mock-up "Semana · segunda-feira")', () => {
  beforeEach(() => {
    h.today = '2026-10-05';
    usePeriodStore.getState().reset();
    resetEvolutionCache();
    setData({ meals: [...PREV_WEEK, ...WEEK, meal('2026-10-05', 640, 30, 80, 20)] });
  });

  it('sem dias fechados: linhas a "—", o que já se comeu hoje e a semana passada (R8)', () => {
    render(<NutritionDashboard />);
    expect(within(summary()).getByTestId('summary-columns')).toHaveTextContent('Média por dia registado (0 dias)');
    expect(within(summary()).getAllByText('ainda sem dias fechados')).toHaveLength(5);
    const early = screen.getByTestId('early-a-comecar');
    expect(within(early).getByRole('heading', { name: 'A semana começou hoje' })).toBeInTheDocument();
    expect(early).toHaveTextContent('Os dias contam quando acabarem — hoje já vais em 640 kcal.');
    expect(within(early).getByTestId('early-previous-summary')).toHaveTextContent(
      /^Semana passada \(28 set – 4 out\): 2 1\d\d kcal\/dia · calorias e proteína no objetivo em \d de 7 dias$/,
    );
    expect(screen.queryByTestId('nutrition-week-chart')).not.toBeInTheDocument();
  });

  it('"Ver semana passada" e "Ver hoje"', () => {
    render(<NutritionDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /Ver semana passada/ }));
    expect(within(summary()).getByTestId('period-title')).toHaveTextContent('Semana passada');
    fireEvent.click(within(summary()).getByRole('button', { name: 'Voltar a esta semana' }));
    fireEvent.click(screen.getByRole('button', { name: /Ver hoje/ }));
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Hoje');
  });
});

describe('NutritionDashboard — Mês (mock-ups "setembro, fechado" e "outubro, em curso")', () => {
  beforeEach(() => {
    h.today = '2026-10-04';
    usePeriodStore.getState().reset();
    resetEvolutionCache();
    setData();
  });

  it('mês fechado: mapa de calor com Dentro/Abaixo/Acima/Sem registo, treino, e "Ver dia"', () => {
    usePeriodStore.getState().setPeriod('nutricao', 'mes', -1);
    render(<NutritionDashboard />);
    expect(within(summary()).getByTestId('period-title')).toHaveTextContent('setembro 2026');
    // O 1.º registo é a 21 set: "desde", e o 1.º mês (agosto não tem registos).
    expect(summary()).toHaveTextContent('desde 21 set · 10 de 10 dias com registo');
    expect(within(summary()).getByTestId('summary-footer')).toHaveTextContent('Primeiro mês com registos — ainda não há outro para comparar.');
    expect(within(summary()).getByRole('button', { name: 'Voltar a este mês' })).toBeInTheDocument();
    const map = screen.getByTestId('nutrition-month-heatmap');
    expect(within(map).getByRole('heading', { name: 'Calorias no mês' })).toBeInTheDocument();
    const cells = within(within(map).getByRole('radiogroup', { name: 'Dias de setembro' })).getAllByRole('radio');
    // 1.º registo a 21 set: só os dias fechados desde aí são escolhíveis.
    expect(cells).toHaveLength(10);
    expect(within(map).getByRole('radio', { name: 'terça, 29 de setembro: dentro do objetivo, treino' })).toBeInTheDocument();
    expect(within(map).getByRole('radio', { name: 'quarta, 30 de setembro: abaixo do objetivo, treino' })).toHaveAttribute('aria-checked', 'true');
    expect(within(map).getByTestId('chart-detail')).toHaveTextContent('qua, 30 set · 1 960 de 2 400 kcal · 82% · Abaixo · ginásio');
    fireEvent.click(within(map).getByRole('button', { name: /Ver dia/ }));
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent(/30/);
  });

  /* Revisão de 2026-10-04: ↑/↓ andam na COLUNA da grelha (±7 dias), não ±7
     na lista dos dias escolhíveis — com dias antes do 1.º registo a lista não
     coincide com a grelha. */
  it('mapa de calor: ↑/↓ ficam na mesma coluna e param onde não há dia escolhível', () => {
    usePeriodStore.getState().setPeriod('nutricao', 'mes', -1);
    render(<NutritionDashboard />);
    const map = screen.getByTestId('nutrition-month-heatmap');
    const group = within(map).getByRole('radiogroup', { name: 'Dias de setembro' });
    const checked = () => within(group).getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'true');
    expect(nameOf(checked())).toMatch(/^quarta, 30 de setembro/);
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(nameOf(checked())).toMatch(/^quarta, 23 de setembro/);
    // 16 set é antes do 1.º registo (21 set): fica no 23.
    fireEvent.keyDown(group, { key: 'ArrowUp' });
    expect(nameOf(checked())).toMatch(/^quarta, 23 de setembro/);
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(nameOf(checked())).toMatch(/^quarta, 30 de setembro/);
    // 7 out já é outro mês: fica.
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(nameOf(checked())).toMatch(/^quarta, 30 de setembro/);
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(nameOf(checked())).toMatch(/^terça, 29 de setembro/);
  });

  it('mês em curso com 3 dias: "ainda é cedo", o resumo de setembro e "Ver setembro" (R6)', () => {
    usePeriodStore.getState().setPeriod('nutricao', 'mes', 0);
    render(<NutritionDashboard />);
    expect(summary()).toHaveTextContent('em curso · 3 de 31 dias fechados');
    expect(within(summary()).getByTestId('verdict-line')).toHaveTextContent('Só 3 dias fechados em outubro — ainda é cedo para conclusões.');
    expect(within(summary()).getByTestId('summary-footer')).toHaveTextContent(/setembro: 2 \d{3} kcal\/dia · calorias e proteína no objetivo em \d de 10 dias/);
    expect(screen.getByTestId('min-data-note')).toHaveTextContent('Comer para treinar aparece a partir de 7 dias com refeições neste mês — em setembro há 10:');
    // Hoje no mapa: sem estado, abre o dia.
    expect(screen.getByRole('button', { name: 'hoje, domingo, 4 de outubro, em curso — ver o dia' })).toBeInTheDocument();
    fireEvent.click(within(summary()).getByRole('button', { name: /Ver setembro/ }));
    expect(within(summary()).getByTestId('period-title')).toHaveTextContent('setembro 2026');
  });

  /* 2026-10-05: o cabeçalho diz os dias ("3 dias: 1–3 out"); dias com menos de
     40% do objetivo ou uma só refeição continuam nas contas, mas há uma nota. */
  it('o cabeçalho diz os dias e os dias provavelmente incompletos têm nota (continuam nas contas)', () => {
    const m = (date, kcal) => ({ id: `x${seq++}`, date, meal_items: [{ calories: kcal, protein: 100, carbs: 200, fat: 60 }] });
    setData({ meals: [m('2026-10-01', 1200), m('2026-10-01', 1200), m('2026-10-02', 1900), m('2026-10-03', 500), m('2026-10-03', 400)], waterLogs: [{ date: '2026-10-02', amount_ml: 1000 }, { date: '2026-10-03', amount_ml: 1500 }] });
    usePeriodStore.getState().setPeriod('nutricao', 'mes', 0);
    render(<NutritionDashboard />);
    expect(within(summary()).getByTestId('summary-columns')).toHaveTextContent('Média por dia registado (3 dias: 1–3 out)');
    // 2 out (uma só refeição) e 3 out (900 < 40% de 2 400): 2 dos 3.
    expect(within(summary()).getByTestId('summary-footer')).toHaveTextContent('2 dos 3 dias parecem ter refeições por registar.');
    // Entram na média dos 3 dias: (2 400 + 1 900 + 900) / 3.
    expect(nameOf(row('Calorias'))).toMatch(/^Calorias: 1 733 /);
    // Água: de que dias fala o mínimo.
    expect(within(row('Água')).getByText('2 dias com água — poucos para média')).toBeInTheDocument();
    // E sem a calha cinzenta vazia: a linha sem média não desenha barra.
    expect(within(row('Água')).queryByTestId('row-bar')).toBeNull();
  });

  it('sem dias incompletos não há nota', () => {
    const m = (date, kcal) => ({ id: `y${seq++}`, date, meal_items: [{ calories: kcal, protein: 100, carbs: 200, fat: 60 }] });
    setData({ meals: ['2026-10-01', '2026-10-02', '2026-10-03'].flatMap((d) => [m(d, 1200), m(d, 1100)]), waterLogs: [] });
    usePeriodStore.getState().setPeriod('nutricao', 'mes', 0);
    render(<NutritionDashboard />);
    expect(within(summary()).getByTestId('summary-footer').textContent).not.toMatch(/por registar/);
  });

  // N3: o botão que leva aos dados (MinDataNote com a ação do período anterior).
  it('"Comer para treinar": diz onde estão os dados e leva lá (Ver setembro)', () => {
    usePeriodStore.getState().setPeriod('nutricao', 'mes', 0);
    render(<NutritionDashboard />);
    const note = screen.getByTestId('min-data-note');
    const go = within(note).getByRole('button', { name: /Ver setembro/ });
    fireEvent.click(go);
    expect(within(summary()).getByTestId('period-title')).toHaveTextContent('setembro 2026');
  });
});

describe('NutritionDashboard — Trimestre (mock-ups "jul – set, fechado" e "out – dez, em curso")', () => {
  // Todos os dias de 13 jul a 30 set: 2 300 kcal; às quartas 2 000 (o dia mais baixo).
  const quarterMeals = () => {
    const out = [];
    for (let t = Date.UTC(2026, 6, 13); t <= Date.UTC(2026, 8, 30); t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      const wed = new Date(t).getUTCDay() === 3;
      out.push(meal(iso, wed ? 2000 : 2300, 140, 290, 78));
    }
    return out;
  };

  beforeEach(() => {
    h.today = '2026-10-04';
    usePeriodStore.getState().reset();
    resetEvolutionCache();
    setData({ meals: [...quarterMeals(), ...WEEK.slice(3)] });
  });

  it('trimestre fechado que começa antes do 1.º registo: "desde 13 jul", primeiro trimestre (R7)', () => {
    usePeriodStore.getState().setPeriod('nutricao', 'trimestre', -1);
    render(<NutritionDashboard />);
    expect(summary()).toHaveTextContent('desde 13 jul · 80 de 80 dias com registo');
    expect(within(summary()).getByTestId('summary-footer')).toHaveTextContent('Primeiro trimestre com registos — ainda não há outro para comparar.');
    expect(within(summary()).queryByTestId('delta-vs-previous')).not.toBeInTheDocument();
    const weeks = screen.getByTestId('nutrition-quarter-weeks');
    expect(weeks).toHaveTextContent('Primeiro trimestre');
    expect(within(weeks).getByTestId('quarter-week-detail')).toHaveTextContent(/^28 – 30 set \(3 dias\) · /);
    const days = screen.getByTestId('nutrition-quarter-days');
    expect(within(days).getByRole('heading', { name: 'Dias no objetivo por semana' })).toBeInTheDocument();
    const wd = screen.getByTestId('nutrition-quarter-weekdays');
    expect(wd).toHaveTextContent('2 000kcal às quartas, o dia mais baixo');
    expect(within(wd).getByTestId('quarter-weekday-detail')).toHaveTextContent(/^Quartas · 2 000 kcal em média \(\d+ quartas\) · 83% · Abaixo$/);
    expect(screen.getByTestId('eating-for-training')).toBeInTheDocument();
    expect(screen.getByTestId('eating-low-count')).toBeInTheDocument();
  });

  /* N4 (2026-10-05): 5 dos 7 dias da semana com ≥ 4 registos chegam. Os outros
     ficam a cinzento ("sáb · 2 registos") e saem do "dia mais baixo". */
  it('por dia da semana com 5 dos 7 dias: o domingo sem registos não esconde o padrão, e o sábado fraco fica a cinzento', () => {
    const out = [];
    for (let t = Date.UTC(2026, 6, 13); t <= Date.UTC(2026, 8, 30); t += 86400000) {
      const d = new Date(t);
      const iso = d.toISOString().slice(0, 10);
      const wd = (d.getUTCDay() + 6) % 7;
      if (wd === 6) continue; // domingo: nunca registou
      if (wd === 5 && iso > '2026-07-27') continue; // sábado: só 2 registos (18 e 25 jul)
      out.push(meal(iso, wd === 2 ? 2000 : 2300, 140, 290, 78));
    }
    setData({ meals: out });
    usePeriodStore.getState().setPeriod('nutricao', 'trimestre', -1);
    render(<NutritionDashboard />);
    const wd = screen.getByTestId('nutrition-quarter-weekdays');
    const dias = within(within(wd).getByRole('radiogroup', { name: 'Dias da semana' })).getAllByRole('radio');
    expect(dias).toHaveLength(7);
    // O mais baixo é a quarta (2 000), não o sábado fraco (2 300 também, mas não conta) nem o domingo vazio.
    expect(wd).toHaveTextContent('2 000kcal às quartas, o dia mais baixo');
    expect(nameOf(dias[5])).toMatch(/^sáb: 2 300 quilocalorias em média, só 2 registos — poucos para contar$/);
    expect(dias[5]).not.toBeDisabled();
    expect(dias[5]).toHaveTextContent('sáb2 de 4');
    expect(nameOf(dias[6])).toBe('dom: sem registo');
    expect(dias[6]).toBeDisabled();
    expect(within(wd).getByTestId('nutrition-quarter-weekdays-legend')).toHaveTextContent('Menos de 4 registos: não conta');
    fireEvent.click(dias[5]);
    expect(within(wd).getByTestId('quarter-weekday-detail')).toHaveTextContent('Sábados · 2 300 kcal em média (2 sábados) — poucos para contar, preciso de 4');
  });

  it('"Ver semana" abre essa semana de calendário', () => {
    usePeriodStore.getState().setPeriod('nutricao', 'trimestre', -1);
    render(<NutritionDashboard />);
    fireEvent.click(within(screen.getByTestId('nutrition-quarter-weeks')).getByRole('button', { name: /Ver semana/ }));
    // 28 – 30 set é a semana de 28 set – 4 out: a semana em curso.
    expect(usePeriodStore.getState().tabs.nutricao).toEqual({ kind: 'semana', offset: 0 });
  });

  it('trimestre em curso com 3 dias: cedo, sem padrão por dia da semana, sem comer para treinar', () => {
    usePeriodStore.getState().setPeriod('nutricao', 'trimestre', 0);
    render(<NutritionDashboard />);
    expect(within(summary()).getByTestId('verdict-line')).toHaveTextContent('Só 3 dias fechados neste trimestre — ainda é cedo para conclusões.');
    expect(within(summary()).getByRole('button', { name: /Ver jul – set/ })).toBeInTheDocument();
    expect(within(screen.getByTestId('nutrition-quarter-weeks')).getByTestId('quarter-week-detail')).toHaveTextContent('1 – 4 out · em curso · 3 dias fechados');
    // O botão de ação vive dentro da nota: compara-se só o <p> (o texto) e o botão à parte.
    const notes = screen.getAllByTestId('min-data-note');
    expect(notes.map((n) => n.querySelector('p').textContent)).toEqual([
      'Calorias por dia da semana: preciso de 4 registos em pelo menos 5 dos 7 dias da semana — neste trimestre ainda nenhum dia da semana lá chega. Em jul – set já dá:',
      'Comer para treinar aparece a partir de 14 dias com refeições neste trimestre — no trimestre passado há 80:',
    ]);
    notes.forEach((n) => expect(within(n).getByTestId('min-data-action')).toHaveAccessibleName(/Ver jul – set/));
    fireEvent.click(within(notes[0]).getByTestId('min-data-action'));
    expect(usePeriodStore.getState().tabs.nutricao).toEqual({ kind: 'trimestre', offset: -1 });
  });

  /* Teclado no "por dia da semana" (revisão 2026-10-05): os dias sem registo estão
     desativados e não entram no roving — → salta-os e dá a volta, End vai ao último com dados. */
  it('por dia da semana: as setas saltam os dias vazios e o End vai ao último dia com registos', () => {
    const out = [];
    for (let t = Date.UTC(2026, 6, 13); t <= Date.UTC(2026, 8, 30); t += 86400000) {
      const d = new Date(t);
      const wd = (d.getUTCDay() + 6) % 7;
      if (wd === 6) continue; // domingo: nunca registou
      out.push(meal(d.toISOString().slice(0, 10), wd === 5 ? 1900 : 2300, 140, 290, 78));
    }
    setData({ meals: out });
    usePeriodStore.getState().setPeriod('nutricao', 'trimestre', -1);
    render(<NutritionDashboard />);
    const wd = screen.getByTestId('nutrition-quarter-weekdays');
    const group = within(wd).getByRole('radiogroup', { name: 'Dias da semana' });
    const dias = () => within(group).getAllByRole('radio');
    // O sábado é o mais baixo: arranca selecionado.
    expect(dias()[5]).toHaveAttribute('aria-checked', 'true');
    // → no último dia com dados (sáb) salta o domingo vazio e dá a volta à segunda.
    fireEvent.keyDown(dias()[5], { key: 'ArrowRight' });
    expect(dias()[0]).toHaveAttribute('aria-checked', 'true');
    expect(dias()[6]).toHaveAttribute('aria-checked', 'false');
    // ← na segunda volta ao sábado, sem parar no domingo.
    fireEvent.keyDown(dias()[0], { key: 'ArrowLeft' });
    expect(dias()[5]).toHaveAttribute('aria-checked', 'true');
    // Home e End.
    fireEvent.keyDown(dias()[5], { key: 'Home' });
    expect(dias()[0]).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(dias()[0], { key: 'End' });
    expect(dias()[5]).toHaveAttribute('aria-checked', 'true');
  });
});

/* Revisão de 2026-10-04: com o 1.º registo a meio do período, o "cedo" e o
   "a começar" contam os dias desde ele, e "Comer para treinar" não promete
   o que o período já não pode ter. */
describe('NutritionDashboard — 1.º registo a meio do período (R6/R7)', () => {
  beforeEach(() => {
    h.today = '2026-10-04';
    usePeriodStore.getState().reset();
    resetEvolutionCache();
  });

  it('1.ª refeição na sexta: "Só 2 dias fechados desde 2 out", e comer para treinar diz que não chega', () => {
    setData({ meals: [meal('2026-10-02', 2040, 125, 255, 74), meal('2026-10-03', 2550, 128, 320, 78)] });
    render(<NutritionDashboard />);
    expect(within(summary()).getByTestId('verdict-line')).toHaveTextContent('Só 2 dias fechados desde 2 out — ainda é cedo para conclusões.');
    expect(screen.getByTestId('min-data-note')).toHaveTextContent(
      'Comer para treinar precisa de 4 dias com refeições — nesta semana só há 3 dias desde o primeiro registo.',
    );
  });

  it('1.ª refeição hoje, a meio da semana: "Os teus registos começaram hoje", sem "Ver semana passada"', () => {
    setData({ meals: [meal('2026-10-04', 640, 30, 80, 20)], waterLogs: [] });
    render(<NutritionDashboard />);
    const early = screen.getByTestId('early-a-comecar');
    expect(within(early).getByRole('heading', { name: 'Os teus registos começaram hoje' })).toBeInTheDocument();
    expect(early).toHaveTextContent('Os dias contam quando acabarem — hoje já vais em 640 kcal.');
    expect(within(early).getByRole('button', { name: /Ver hoje/ })).toBeInTheDocument();
    expect(within(early).queryByRole('button', { name: /Ver semana passada/ })).not.toBeInTheDocument();
    expect(within(summary()).queryByTestId('verdict-line')).not.toBeInTheDocument();
  });

  it('mês passado cortado pelo 1.º registo: "em setembro só houve 3 dias", não "aparece … neste mês"', () => {
    setData({ meals: WEEK });
    usePeriodStore.getState().setPeriod('nutricao', 'mes', -1);
    render(<NutritionDashboard />);
    expect(screen.getByTestId('min-data-note')).toHaveTextContent(
      'Comer para treinar precisa de 7 dias com refeições — em setembro só houve 3 dias com refeições desde o primeiro registo.',
    );
  });

  it('massa magra medida mas sem peso: diz que o gasto da corrida conta 70 kg', () => {
    setData({ bodyAssessments: [{ date: '2026-09-12', lean_body_mass_kg: 60 }] });
    render(<NutritionDashboard />);
    expect(within(screen.getByTestId('eating-for-training')).getByTestId('eating-lean-mass')).toHaveTextContent(
      'A avaliação de 12 set não tem peso: conto com 70 kg para o gasto da corrida.',
    );
  });

  it('massa magra e peso medidos: sem nota', () => {
    setData({ bodyAssessments: [{ date: '2026-09-12', lean_body_mass_kg: 60, weight_kg: 72 }] });
    render(<NutritionDashboard />);
    expect(within(screen.getByTestId('eating-for-training')).queryByTestId('eating-lean-mass')).not.toBeInTheDocument();
  });
});

/* Bloqueio da revisão de 2026-10-04 (D4, plano §2.1 ponto 2): dentro do
   carrossel, mudar de período com ‹ › NÃO repete a entrada — o gráfico é o
   mesmo, as barras mudam de altura em 300 ms, nada volta a transparente nem à
   base, o número grande não conta do 0, e não há observer novo. Trocar de
   tipo (Semana → Mês) monta outro gráfico, mas calado. Sair do separador e
   voltar continua a animar (R9). */
describe('NutritionDashboard — animação ao mudar de período (D4)', () => {
  let observers = [];
  class FakeObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(el) { this.el = el; }
    disconnect() { this.disconnected = true; }
  }
  const live = () => observers.filter((o) => o.el && !o.disconnected);
  const fire = (entry) => act(() => { live().forEach((o) => o.callback([entry])); });
  const aVista = () => ({
    isIntersecting: true,
    intersectionRect: { height: 228, width: 343 },
    boundingClientRect: { height: 228, width: 343, top: 100, bottom: 328 },
    rootBounds: { height: 800 },
  });
  const fora = () => ({
    isIntersecting: false,
    intersectionRect: { height: 0, width: 0 },
    boundingClientRect: { height: 228, width: 343, top: 100, bottom: 328, left: 400, right: 743 },
    rootBounds: { height: 800 },
  });
  const inTab = () => (
    <TabPageContext.Provider value={3}>
      <TabReadyContext.Provider value>
        <NutritionDashboard />
      </TabReadyContext.Provider>
    </TabPageContext.Provider>
  );
  const plot = (id) => screen.getByTestId(`${id}-plot`);
  const bigNumber = (id) => within(screen.getByTestId(id)).getByTestId('chart-frame-value').textContent.replace(/[\u00a0\u202f]/g, ' ');
  const bars = () => screen.getAllByTestId('week-bar').map((b) => b.getAttribute('style') || '');

  beforeEach(() => {
    vi.useFakeTimers();
    observers = [];
    resetSettledTab();
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    h.today = '2026-10-04';
    usePeriodStore.getState().reset();
    resetEvolutionCache();
    setData();
  });
  afterEach(() => {
    resetSettledTab();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('‹ não repete a entrada: mesmo gráfico, sem transparência, sem barras na base, número sem contar do 0', () => {
    render(inTab());
    // 1.ª entrada: transparente e na base até assentar à vista; depois cresce.
    expect(plot('nutrition-week-chart').style.opacity).toBe('0');
    expect(bars()[0]).toMatch(/scaleY\(0\)/);
    act(() => { setSettledIndex(3); });
    fire(aVista());
    expect(plot('nutrition-week-chart').style.opacity).toBe('1');
    expect(bars()[0]).toMatch(/nutriGrow/);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(bars()[0]).not.toMatch(/nutriGrow|scaleY/);
    const chart = screen.getByTestId('nutrition-week-chart');
    const before = observers.length;

    fireEvent.click(within(summary()).getByRole('button', { name: 'Semana anterior' }));
    expect(within(summary()).getByTestId('period-title')).toHaveTextContent('Semana passada');
    // O mesmo elemento (não remontou) e nenhum observer novo.
    expect(screen.getByTestId('nutrition-week-chart')).toBe(chart);
    expect(observers.length).toBe(before);
    expect(plot('nutrition-week-chart').style.opacity).toBe('1');
    for (const st of bars()) {
      expect(st).not.toMatch(/nutriGrow|scaleY\(0\)/);
      expect(st).toMatch(/height 300ms/);
    }
    // 21 – 27 set: (3 × 2 400 + 3 × 2 000 + 2 400) / 7 = 2 229.
    expect(bigNumber('nutrition-week-chart')).toBe('2 229');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(bigNumber('nutrition-week-chart')).toBe('2 229');
    // O dia escolhido volta ao de omissão desta semana (o último fechado).
    expect(within(chart).getByTestId('chart-detail')).toHaveTextContent(/^dom, 27 set/);

    fireEvent.click(within(summary()).getByRole('button', { name: 'Voltar a esta semana' }));
    expect(screen.getByTestId('nutrition-week-chart')).toBe(chart);
    expect(plot('nutrition-week-chart').style.opacity).toBe('1');
    expect(bigNumber('nutrition-week-chart')).toBe('2 310');
  });

  it('Semana → Mês monta o mapa calado; sair do separador e voltar volta a animar', () => {
    render(inTab());
    act(() => { setSettledIndex(3); });
    fire(aVista());
    act(() => { vi.advanceTimersByTime(2000); });

    fireEvent.click(screen.getAllByRole('button', { name: 'Mês' })[0]);
    const cells = () => screen.getAllByTestId('month-cell').map((c) => c.getAttribute('style') || '');
    // Antes de o observer o dar à vista: já visível, sem células apagadas.
    expect(plot('nutrition-month-heatmap').style.opacity).toBe('1');
    expect(cells().every((st) => !/opacity: 0;|nutriPop/.test(st))).toBe(true);
    fire(aVista());
    expect(plot('nutrition-month-heatmap').style.opacity).toBe('1');
    expect(cells().every((st) => !/nutriPop/.test(st))).toBe(true);
    // 1, 2 e 3 out: 2 dias no objetivo — sem contar do 0.
    expect(bigNumber('nutrition-month-heatmap')).toBe('2');

    // Sai do separador (mais de 3 s, já fora da vista) e volta: anima.
    act(() => { setSettledIndex(0); });
    fire(fora());
    act(() => { vi.advanceTimersByTime(3100); });
    act(() => { setSettledIndex(3); });
    fire(aVista());
    expect(cells().some((st) => /nutriPop/.test(st))).toBe(true);
  });
});

describe('NutritionDashboard — Dia e sem dados', () => {
  beforeEach(() => {
    h.today = '2026-10-04';
    usePeriodStore.getState().reset();
    resetEvolutionCache();
  });

  /* Bug #51: "Ver dias anteriores" no Início abre aqui, na vista Dia, em
     ontem — e as setas andam de dia em dia até hoje. */
  it('a vista Dia abre no dia pedido e anda de dia em dia até hoje', () => {
    setData({
      profile: { calorie_goal: 3000, protein_goal: 200, carbs_goal: 300, fat_goal: 100 },
      meals: [meal('2026-10-04', 1000, 50, 100, 30), meal('2026-10-04', 500, 30, 50, 10)],
      nutritionDayFocus: '2026-10-03',
    });
    render(<NutritionDashboard />);
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Ontem');
    expect(screen.getByTestId('day-row-calories')).toHaveAttribute('data-status', 'sem_registo');
    expect(useAppStore.getState().nutritionDayFocus).toBe(null);
    expect(screen.getByRole('button', { name: 'Dia' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Dia seguinte' }));
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Hoje');
    expect(screen.getByTestId('day-row-calories')).toHaveTextContent('1 500 / 3 000 kcal');
    expect(screen.getByTestId('day-row-calories')).toHaveAttribute('data-status', 'abaixo');
    expect(screen.getByRole('button', { name: 'Dia seguinte' })).toBeDisabled();
    // Micronutrientes do dia, com o nome do dia (N2: não "· dia").
    expect(screen.getByTestId('micros-title')).toHaveTextContent('Micronutrientes · total do dia');
    expect(screen.getByTestId('micros-subtitle')).toHaveTextContent('Hoje');

    fireEvent.click(screen.getByRole('button', { name: 'Dia anterior' }));
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Ontem');
  });

  it('sem refeições nenhumas: o convite a registar, em vez de linhas a "—"', () => {
    setData({ meals: [], waterLogs: [] });
    render(<NutritionDashboard />);
    expect(screen.getByTestId('empty-module-state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registar refeição' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Resumo do período' })).not.toBeInTheDocument();
    // O seletor continua lá (para chegar ao Dia).
    expect(screen.getAllByRole('group', { name: 'Período' })[0]).toBeInTheDocument();
  });

  it('um período passado sem refeições: diz-se, sem gráficos vazios', () => {
    setData();
    usePeriodStore.getState().setPeriod('nutricao', 'semana', -3);
    render(<NutritionDashboard />);
    expect(within(summary()).getByTestId('verdict-line')).toHaveTextContent('Na semana de 7 set não registaste refeições.');
    expect(screen.getByTestId('min-data-note')).toHaveTextContent('Sem refeições registadas na semana de 7 set — a primeira é de 21 set.');
    expect(screen.queryByTestId('nutrition-week-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-excluded-note')).not.toBeInTheDocument();
  });
});

/* 2026-10-04 (verificação no browser, Nutrição · «Comer para treinar»): 29,6
   lia-se «30 … — baixa». Perto de um limite mostra uma casa decimal. */
describe('fmtEa — energia disponível sem contradizer os limites', () => {
  it('uma casa só quando o inteiro cruzaria 30 ou 45', () => {
    expect(fmtEa(29.6)).toBe('29,6');
    expect(fmtEa(44.7)).toBe('44,7');
    expect(fmtEa(29.4)).toBe('29');
    expect(fmtEa(30.2)).toBe('30');
    expect(fmtEa(38.6)).toBe('39');
    expect(fmtEa(null)).toBe('—');
  });
});
