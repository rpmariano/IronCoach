import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { usePeriodStore } from '../../store/periodStore';
import OverviewDashboard from './OverviewDashboard';
import { addDaysISO } from '../../lib/utils';

/* Visão Geral — factos reais em vez de fogo de artifício (2026-10-04).
   O2 plurais, O3 média por sessão de força com carga, O4 pilar Corpo com a
   última pesagem datada e sem tendência inventada, vírgulas decimais, e (fase 6,
   D2) a semana de calendário com ‹ ›, só dias fechados, pilares que abrem o
   separador no mesmo período, Nutrição com "X de N dias" (O1) e a lista "O que
   falta para começar" do estado sem registos (O7).

   "Hoje" é fixo — sábado 10 out 2026, 12h —, por isso a semana tem 5 dias
   fechados (seg 5 – sex 9) e a anterior é 28 set – 4 out. Os testes não dependem
   do dia em que correm (o Geral era frágil às segundas e aos domingos). */

// O jsdom não tem canvas — a Análise Cruzada desenha gráficos ao montar.
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div />, Line: () => <div />, Doughnut: () => <div />, Scatter: () => <div />, Chart: () => <div />,
}));
vi.mock('../BI/SmartInsightsBanner', () => ({ default: () => null }));
vi.mock('../BI/RaceReadinessCard', () => ({ default: () => null }));

const TODAY = '2026-10-10';
const ago = (n) => addDaysISO(TODAY, -n);
const forca = (daysAgo, kg = 5000) => ({
  id: `f${daysAgo}${kg}${Math.random()}`, date: ago(daysAgo), kind: 'forca', categories: ['Costas'],
  workout_session_sets: [{ reps: 10, weight: kg / 10 }],
});
const aula = (daysAgo) => ({
  id: `a${daysAgo}${Math.random()}`, date: ago(daysAgo), kind: 'aula', name: 'Pilates', class_types: ['Pilates'], workout_session_sets: [],
});
const corrida = (daysAgo, km = 5) => ({ id: `r${daysAgo}${km}`, date: ago(daysAgo), distance_km: km, duration_seconds: km * 330 });
const pesagem = (daysAgo, kg) => ({ id: `p${daysAgo}`, date: ago(daysAgo), weight_kg: kg });
// 1 000 g a 200 kcal/100 g = 2 000 kcal numa refeição.
const refeicao = (daysAgo, kcal = 2000) => ({
  id: `m${daysAgo}${kcal}`, date: ago(daysAgo),
  meal_items: [{ quantity_grams: kcal / 2, calories_per_100g: 200 }],
});

// O cartão do pilar é o <button> que tem o título.
const pilar = (title) => screen.getByText(title, { selector: 'span' }).closest('button');

function renderOverview(state, scrollToTab = () => {}) {
  useAppStore.setState({
    runs: [corrida(20)], gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [],
    coachPlans: [], coachPlanItems: [], shoes: [], profile: {}, goalHistory: [], ...state,
  });
  return render(<OverviewDashboard scrollToTab={scrollToTab} />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0));
  usePeriodStore.getState().reset();
});
afterEach(() => vi.useRealTimers());

describe('OverviewDashboard — plurais (O2)', () => {
  it('"2 sessões de força" e "2 avaliações", nunca "sessãoões"', () => {
    renderOverview({ gymSessions: [forca(1), forca(2)], bodyAssessments: [pesagem(1, 80), pesagem(2, 80.4)] });
    expect(within(pilar('Ginásio')).getByText('sessões de força')).toBeInTheDocument();
    expect(within(pilar('Ginásio')).getByText('2')).toBeInTheDocument();
    expect(within(pilar('Corpo')).getByText(/2 avaliações esta semana/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ãoões/);
  });

  it('singular e zero: "1 sessão de força", "0 sessões de força", "1 avaliação"', () => {
    const { unmount } = renderOverview({ gymSessions: [forca(1)], bodyAssessments: [pesagem(1, 80)] });
    expect(within(pilar('Ginásio')).getByText('sessão de força')).toBeInTheDocument();
    expect(within(pilar('Corpo')).getByText(/1 avaliação esta semana/)).toBeInTheDocument();
    unmount();
    renderOverview({ gymSessions: [forca(20)] }); // histórico, mas nenhuma nesta semana
    expect(within(pilar('Ginásio')).getByText('sessões de força')).toBeInTheDocument();
    expect(within(pilar('Ginásio')).getByText('0')).toBeInTheDocument();
    expect(within(pilar('Ginásio')).getByText('Sem treinos esta semana')).toBeInTheDocument();
  });
});

describe('OverviewDashboard — kg/sessão em média (O3)', () => {
  it('divide só pelas sessões de força com carga, diz quantas são e põe as aulas à parte', () => {
    // 2 sessões de 5000 kg + 2 aulas: 5 000 kg/sessão (antes 2 500, a dividir por 4)
    renderOverview({ gymSessions: [forca(1), forca(2), aula(3), aula(4)] });
    const g = pilar('Ginásio');
    expect(within(g).getByText('5 000 kg/sessão de força em média (2 sessões)')).toBeInTheDocument();
    expect(within(g).getByText('2 aulas à parte')).toBeInTheDocument();
  });

  it('1 treino de 1000 kg + 1 aula: 1 000 kg/sessão (1 sessão), 1 aula à parte', () => {
    renderOverview({ gymSessions: [forca(1, 1000), aula(2)] });
    const g = pilar('Ginásio');
    expect(within(g).getByText('1 000 kg/sessão de força em média (1 sessão)')).toBeInTheDocument();
    expect(within(g).getByText('1 aula à parte')).toBeInTheDocument();
  });

  it('uma sessão de força sem carga não entra no denominador', () => {
    const semCarga = { id: 'sc', date: ago(1), kind: 'forca', categories: ['Costas'], workout_session_sets: [{ reps: 10, weight: 0 }] };
    renderOverview({ gymSessions: [forca(2, 3000), semCarga] });
    const g = pilar('Ginásio');
    expect(within(g).getByText('3 000 kg/sessão de força em média (1 sessão)')).toBeInTheDocument();
    // …mas conta como sessão de força: são 2
    expect(within(g).getByText('2')).toBeInTheDocument();
  });

  it('só aulas: zero sessões de força e a aula à parte, sem "kg/sessão"', () => {
    renderOverview({ gymSessions: [aula(1)] });
    const g = pilar('Ginásio');
    expect(g.textContent).not.toMatch(/kg\/sessão/);
    expect(within(g).getByText('1 aula à parte')).toBeInTheDocument();
    expect(within(g).getByText('0')).toBeInTheDocument();
  });

  it('o estado do alvo: 2 sessões = "Alvo cumprido"; 1 a meio da semana = "1 de 2 sessões"', () => {
    const { unmount } = renderOverview({ gymSessions: [forca(1), forca(2)] });
    expect(within(pilar('Ginásio')).getByText('Alvo cumprido')).toBeInTheDocument();
    unmount();
    renderOverview({ gymSessions: [forca(1)] });
    expect(within(pilar('Ginásio')).getByText('1 de 2 sessões')).toBeInTheDocument();
  });
});

describe('OverviewDashboard — pilar Corpo (O4)', () => {
  it('com uma pesagem: mostra o peso com a data, "A calibrar" e nenhum "0 kg/sem"', () => {
    renderOverview({ bodyAssessments: [pesagem(3, 74.6)] });
    const corpo = pilar('Corpo');
    expect(within(corpo).getByText('74,6')).toBeInTheDocument();
    expect(within(corpo).getByText('kg · há 3 dias')).toBeInTheDocument();
    expect(within(corpo).getByText('A calibrar')).toBeInTheDocument();
    expect(corpo.textContent).not.toMatch(/Estável|kg\/sem|Em perda|Em ganho/);
    // diz o que falta
    expect(corpo.textContent).toMatch(/preciso de 3 pesagens nos 14 dias até à última \(tenho 1\)/);
  });

  it('com 2 pesagens espaçadas (80 → 74 em 3 meses): continua a calibrar, não "Estável"', () => {
    renderOverview({ bodyAssessments: [pesagem(90, 80), pesagem(0, 74)] });
    const corpo = pilar('Corpo');
    expect(within(corpo).getByText('74,0')).toBeInTheDocument();
    // uma pesagem de hoje é um facto fechado: pode ser a "última"
    expect(within(corpo).getByText('kg · hoje')).toBeInTheDocument();
    expect(within(corpo).getByText('A calibrar')).toBeInTheDocument();
    expect(corpo.textContent).not.toMatch(/Estável|kg\/sem/);
    // 2 registos, mas só 1 na janela: o texto diz que a contagem é da janela
    expect(corpo.textContent).toMatch(/preciso de 3 pesagens nos 14 dias até à última \(tenho 1\)/);
  });

  it('9 pesagens diárias em 8 dias: o que falta é cobrir 10 dias, não "mais pesagens"', () => {
    const nove = Array.from({ length: 9 }, (_, i) => pesagem(8 - i, 80 - i * 0.1));
    renderOverview({ bodyAssessments: nove });
    const corpo = pilar('Corpo');
    expect(within(corpo).getByText('A calibrar')).toBeInTheDocument();
    expect(corpo.textContent).toMatch(/as pesagens têm de cobrir pelo menos 10 dias \(as tuas cobrem 8 dias\)/);
    expect(corpo.textContent).not.toMatch(/preciso de 3 pesagens/);
  });

  it('sem pesagens: "Sem dados" e traço, sem delta', () => {
    renderOverview({ bodyAssessments: [] });
    const corpo = pilar('Corpo');
    expect(within(corpo).getByText('Sem dados')).toBeInTheDocument();
    expect(corpo.textContent).not.toMatch(/kg\/sem/);
  });

  it('com tendência suficiente (3 pesagens em 12 dias): estado e kg/sem com vírgula', () => {
    renderOverview({ bodyAssessments: [pesagem(12, 80), pesagem(6, 78), pesagem(0, 76)] });
    const corpo = pilar('Corpo');
    expect(within(corpo).getByText('Em perda')).toBeInTheDocument();
    expect(within(corpo).getByText('−2,3 kg/sem')).toBeInTheDocument();
    // o peso é o da última pesagem, não a média
    expect(within(corpo).getByText('76,0')).toBeInTheDocument();
  });

  it('3 pesagens de há 100+ dias: sem "Em perda" no presente, "Desatualizado" e diz a idade', () => {
    renderOverview({ bodyAssessments: [pesagem(112, 80), pesagem(106, 78), pesagem(100, 76)] });
    const corpo = pilar('Corpo');
    expect(within(corpo).getByText('Desatualizado')).toBeInTheDocument();
    expect(corpo.textContent).not.toMatch(/Em perda|Estável|Em ganho|kg\/sem/);
    expect(corpo.textContent).toMatch(/A última pesagem tem 100 dias/);
  });

  it('pesagem antiga (mais de 13 dias) mostra a data em vez de "há N dias"', () => {
    const d = ago(20);
    renderOverview({ bodyAssessments: [pesagem(20, 75)] });
    const dia = Number(d.slice(8, 10));
    expect(within(pilar('Corpo')).getByText(new RegExp(`^kg · ${dia} [a-z]{3}$`))).toBeInTheDocument();
  });
});

describe('OverviewDashboard — vírgula decimal nos pilares', () => {
  it('"12,4 km esta sem." (nunca "12.4")', () => {
    renderOverview({ runs: [corrida(1, 12.4)] });
    const corrida_ = pilar('Corrida');
    expect(within(corrida_).getByText('12,4')).toBeInTheDocument();
    expect(within(corrida_).getByText('km esta sem.')).toBeInTheDocument();
    expect(corrida_.textContent).not.toMatch(/\d\.\d/);
  });

  it('"1 corrida" e "2 corridas" no singular/plural certo', () => {
    const { unmount } = renderOverview({ runs: [corrida(1)] });
    expect(within(pilar('Corrida')).getByText('1 corrida esta semana')).toBeInTheDocument();
    unmount();
    renderOverview({ runs: [corrida(1), corrida(2)] });
    expect(within(pilar('Corrida')).getByText('2 corridas esta semana')).toBeInTheDocument();
  });
});

describe('OverviewDashboard — a semana de calendário, só dias fechados', () => {
  it('uma corrida de hoje não entra (ainda não acabou) e a nota não manda "tocar em Dia"', () => {
    renderOverview({ runs: [corrida(1, 8), corrida(0, 20)] });
    const c = pilar('Corrida');
    expect(within(c).getByText('8,0')).toBeInTheDocument();
    expect(within(c).getByText('1 corrida esta semana')).toBeInTheDocument();
    const nota = screen.getByTestId('today-excluded-note');
    expect(nota.textContent).not.toMatch(/toca em Dia/i);
    // a nota não afirma que "hoje não entra nas contas" — o Corpo e o ACWR contam hoje
    expect(nota.textContent).not.toMatch(/não entra nas contas/);
    expect(nota).toHaveTextContent('corrida, ginásio e nutrição contam só os dias fechados');
    expect(nota).toHaveTextContent('A pesagem de hoje e o ACWR já entram');
  });

  it('com uma pesagem de hoje: o Corpo mostra-a e a nota não a desmente', () => {
    renderOverview({ bodyAssessments: [pesagem(0, 74.2)] });
    expect(within(pilar('Corpo')).getByText('74,2')).toBeInTheDocument();
    expect(within(pilar('Corpo')).getByText('kg · hoje')).toBeInTheDocument();
    expect(within(pilar('Corpo')).getByText(/1 avaliação esta semana/)).toBeInTheDocument();
    const nota = screen.getByTestId('today-excluded-note');
    expect(nota).toHaveTextContent('A pesagem de hoje');
    expect(nota.textContent).not.toMatch(/não entra nas contas/);
  });

  it('uma corrida de há 8 dias (semana passada) não entra nos km desta semana', () => {
    renderOverview({ runs: [corrida(8, 10), corrida(2, 5)] });
    expect(within(pilar('Corrida')).getByText('5,0')).toBeInTheDocument();
  });

  it('o rótulo diz a semana e o intervalo; ‹ vai para a anterior e mostra os números dela', () => {
    renderOverview({ runs: [corrida(8, 10), corrida(2, 5)] });
    expect(screen.getByTestId('period-title')).toHaveTextContent('Esta semana');
    // › desativado: não há futuro
    expect(screen.getByRole('button', { name: 'Semana seguinte' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));

    expect(screen.getByTestId('period-title')).toHaveTextContent('Semana passada');
    const c = pilar('Corrida');
    expect(within(c).getByText('10,0')).toBeInTheDocument();
    expect(within(c).getByText('km na semana')).toBeInTheDocument();
    expect(within(c).getByText('1 corrida nessa semana')).toBeInTheDocument();
    // numa semana passada já não há "hoje" por excluir
    expect(screen.queryByTestId('today-excluded-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana seguinte' })).toBeEnabled();
  });

  it('numa semana passada a pesagem diz a data, não "há N dias" contado de hoje', () => {
    renderOverview({ bodyAssessments: [pesagem(9, 75), pesagem(1, 74)] });
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    const dia = Number(ago(9).slice(8, 10));
    expect(within(pilar('Corpo')).getByText('75,0')).toBeInTheDocument();
    expect(within(pilar('Corpo')).getByText(new RegExp(`^kg · ${dia} [a-z]{3}$`))).toBeInTheDocument();
  });

  it('▲/▼ face aos mesmos dias da semana anterior, com o anterior por extenso e sem inventar sem histórico', () => {
    // esta semana (seg 5 – sex 9): 15 km; a anterior, nos mesmos 5 dias (28 set – 2 out): 5 km
    renderOverview({ runs: [corrida(1, 10), corrida(3, 5), corrida(12, 5)] });
    const delta = within(pilar('Corrida')).getByTestId('pillar-delta');
    expect(delta).toHaveAttribute('data-direction', 'up');
    expect(delta).toHaveTextContent('Subiu 10,0 km face a 28 set – 2 out');
    expect(delta.textContent).toMatch(/▲ 10,0 km face a 28 set – 2 out/);
  });

  it('sem registos na semana anterior (o histórico começa esta semana) não há seta', () => {
    renderOverview({ runs: [corrida(1, 10)] });
    expect(within(pilar('Corrida')).queryByTestId('pillar-delta')).not.toBeInTheDocument();
  });

  it('ACWR sem histórico diz quantas semanas faltam', () => {
    renderOverview({ runs: [corrida(1, 10)] });
    expect(within(pilar('Corrida')).getByText('ACWR: faltam 2 sem.')).toBeInTheDocument();
  });
});

describe('OverviewDashboard — semanas anteriores ao 1.º registo (R7)', () => {
  const recuar = (n) => { for (let i = 0; i < n; i++) fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' })); };

  it('várias semanas antes do 1.º registo: sem "0", sem "Abaixo do alvo", sem "faltam N sem."', () => {
    // tudo começa a 6 out (terça); a semana de 31 ago – 6 set é muito anterior
    renderOverview({
      runs: [corrida(4, 8)], gymSessions: [forca(4)], meals: [refeicao(4)], bodyAssessments: [pesagem(4, 75)],
      profile: { calorie_goal: 2000 },
    });
    recuar(5);
    for (const titulo of ['Corrida', 'Ginásio', 'Nutrição', 'Corpo']) {
      const c = pilar(titulo);
      expect(within(c).getByText('Antes do 1.º registo'), titulo).toBeInTheDocument();
      expect(c.textContent, titulo).toMatch(/Ainda não registavas .*: o primeiro registo é de 6 out\./);
      expect(c.textContent, titulo).not.toMatch(/Abaixo do alvo|faltam|faltavam|0 sessões|Sem treinos|Sem corridas|Sem avaliações|Sem refeições/);
      expect(within(c).getByText('—'), titulo).toBeInTheDocument();
    }
    expect(within(pilar('Ginásio')).queryByText('sessões de força')).not.toBeInTheDocument();
    expect(within(pilar('Corrida')).queryByText(/km na semana/)).not.toBeInTheDocument();
  });

  it('só o ginásio é recente: a semana passada mostra corridas mas o ginásio "antes do 1.º registo"', () => {
    renderOverview({ runs: [corrida(20), corrida(9, 6)], gymSessions: [forca(3)] });
    recuar(1);
    expect(within(pilar('Corrida')).getByText('6,0')).toBeInTheDocument();
    const g = pilar('Ginásio');
    expect(within(g).getByText('Antes do 1.º registo')).toBeInTheDocument();
    expect(g.textContent).not.toMatch(/Abaixo do alvo/);
  });

  it('o ginásio começa a meio da semana passada (sábado): badge neutro, não "Abaixo do alvo"', () => {
    // semana de 28 set – 4 out; a 1.ª sessão é a de sábado 3 out (há 7 dias)
    renderOverview({ gymSessions: [forca(7)] });
    recuar(1);
    const g = pilar('Ginásio');
    expect(within(g).getByText('1 de 2 sessões')).toBeInTheDocument();
    expect(g.textContent).not.toMatch(/Abaixo do alvo/);
    expect(g.textContent).toMatch(/Só há treinos registados desde 3 out\./);
  });

  it('uma semana passada com histórico antes dela continua a dizer "Abaixo do alvo"', () => {
    renderOverview({ gymSessions: [forca(20), forca(7)] });
    recuar(1);
    expect(within(pilar('Ginásio')).getByText('Abaixo do alvo')).toBeInTheDocument();
  });

  it('semana passada: o ACWR e a pesagem falam do fim dessa semana (faltavam / tinha)', () => {
    renderOverview({
      runs: [corrida(9, 10)],
      bodyAssessments: [pesagem(30, 80), pesagem(29, 79)],
    });
    recuar(1);
    expect(within(pilar('Corrida')).getByText(/ACWR: faltavam \d sem\./)).toBeInTheDocument();
    expect(pilar('Corpo').textContent).toMatch(/No fim dessa semana a última pesagem tinha \d+ dias/);
    expect(pilar('Corpo').textContent).not.toMatch(/A última pesagem tem/);
  });
});

describe('OverviewDashboard — segunda-feira: a semana a começar (R8)', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0)); // segunda 12 out
  });

  it('sem nenhum dia fechado: cartão "a começar" com o resumo da semana passada', () => {
    // semana passada (5 – 11 out): 12 km em 2 corridas, 1 sessão de força e refeições em 2 dias
    useAppStore.setState({
      runs: [{ id: 'a', date: '2026-10-06', distance_km: 7, duration_seconds: 2400 }, { id: 'b', date: '2026-10-08', distance_km: 5, duration_seconds: 1700 }],
      gymSessions: [{ id: 'g', date: '2026-10-07', kind: 'forca', categories: ['Costas'], workout_session_sets: [{ reps: 10, weight: 50 }] }],
      meals: [{ id: 'm1', date: '2026-10-09', meal_items: [{ quantity_grams: 500, calories_per_100g: 200 }] }, { id: 'm2', date: '2026-10-10', meal_items: [{ quantity_grams: 500, calories_per_100g: 200 }] }],
      bodyAssessments: [], raceEvents: [], coachPlans: [], coachPlanItems: [], shoes: [], profile: {}, goalHistory: [],
    });
    render(<OverviewDashboard scrollToTab={() => {}} />);
    expect(screen.getByTestId('early-a-comecar')).toHaveTextContent('A semana começou hoje');
    expect(screen.getByTestId('early-previous-summary')).toHaveTextContent(
      'Semana passada (5 – 11 out): 12,0 km em 2 corridas · 1 sessão de força · refeições em 2 dias',
    );
    // os pilares não inventam números: dizem que ainda não há dias fechados
    expect(within(pilar('Corrida')).getByText('Ainda sem dias fechados')).toBeInTheDocument();
    expect(within(pilar('Nutrição')).getByText('Ainda sem dias fechados')).toBeInTheDocument();
    // "Ver semana passada" navega
    fireEvent.click(screen.getByRole('button', { name: /Ver semana passada/ }));
    expect(screen.getByTestId('period-title')).toHaveTextContent('Semana passada');
    expect(within(pilar('Corrida')).getByText('12,0')).toBeInTheDocument();
  });
});

describe('OverviewDashboard — os pilares abrem o separador no mesmo período', () => {
  it('na semana atual: setPeriod(tab, semana, 0) antes de scrollToTab', () => {
    const seen = [];
    const scrollToTab = vi.fn((tab) => seen.push({ tab, period: { ...usePeriodStore.getState().tabs[tab] } }));
    usePeriodStore.getState().setKind('corrida', 'trimestre'); // a omissão do separador era outra
    renderOverview({ runs: [corrida(1)] }, scrollToTab);
    fireEvent.click(pilar('Corrida'));
    expect(scrollToTab).toHaveBeenCalledWith('corrida');
    // no instante do scroll o separador já estava em semana, offset 0
    expect(seen[0].period).toEqual({ kind: 'semana', offset: 0 });
  });

  it('numa semana passada leva essa semana (offset −1) a cada um dos quatro separadores', () => {
    const scrollToTab = vi.fn();
    renderOverview({ runs: [corrida(8)] }, scrollToTab);
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    for (const [titulo, tab] of [['Corrida', 'corrida'], ['Ginásio', 'ginasio'], ['Nutrição', 'nutricao'], ['Corpo', 'corpo']]) {
      fireEvent.click(pilar(titulo));
      expect(scrollToTab).toHaveBeenLastCalledWith(tab);
      expect(usePeriodStore.getState().tabs[tab]).toEqual({ kind: 'semana', offset: -1 });
    }
  });

  it('duas semanas atrás: offset −2', () => {
    renderOverview({ runs: [corrida(15)] });
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    fireEvent.click(pilar('Nutrição'));
    expect(usePeriodStore.getState().tabs.nutricao).toEqual({ kind: 'semana', offset: -2 });
  });
});

describe('OverviewDashboard — Nutrição: "X de N dias" com o objetivo de cada dia (O1)', () => {
  const goalRow = (validFrom, kcal) => ({
    valid_from: validFrom, source: 'manual', calorie_goal: kcal, protein_goal: 150, carbs_goal: 200, fat_goal: 70, water_goal_ml: 2000,
  });

  it('sem objetivo definido não há % — nem o 2000 kcal inventado', () => {
    renderOverview({ meals: [refeicao(1), refeicao(2), refeicao(3), refeicao(4)], profile: {} });
    const n = pilar('Nutrição');
    expect(within(n).getByText('Sem objetivo')).toBeInTheDocument();
    expect(within(n).getByText('2 000')).toBeInTheDocument();
    expect(within(n).getByText('kcal/dia')).toBeInTheDocument();
    expect(n.textContent).not.toMatch(/%/);
    expect(n.textContent).toMatch(/Média de 4 dias registados/);
  });

  it('com objetivo: % e "Calorias no objetivo em 4 de 4 dias"', () => {
    renderOverview({ meals: [refeicao(1), refeicao(2), refeicao(3), refeicao(4)], profile: { calorie_goal: 2000 } });
    const n = pilar('Nutrição');
    expect(within(n).getByText('100%')).toBeInTheDocument();
    expect(within(n).getByText('Calorias OK')).toBeInTheDocument();
    expect(within(n).getByText('Calorias no objetivo em 4 de 4 dias')).toBeInTheDocument();
  });

  it('um pequeno-almoço de hoje não baixa a % (o dia ainda não acabou)', () => {
    renderOverview({
      meals: [refeicao(1), refeicao(2), refeicao(3), refeicao(4), refeicao(0, 400)],
      profile: { calorie_goal: 2000 },
    });
    const n = pilar('Nutrição');
    expect(within(n).getByText('100%')).toBeInTheDocument();
    expect(within(n).getByText('Calorias no objetivo em 4 de 4 dias')).toBeInTheDocument();
    expect(n.textContent).not.toMatch(/Baixa ingestão|Deficit/);
  });

  it('o objetivo é o de cada dia: 2 dias a 2 000 contra 2 000 e 2 dias contra 2 500 (80%) → "2 de 4"', () => {
    // sex 9 e qui 8 (objetivo passou a 2 500 a 7 out); qua 7 também; seg 5 e ter 6 a 2 000.
    renderOverview({
      meals: [refeicao(1), refeicao(2), refeicao(4), refeicao(5)],
      profile: { calorie_goal: 2500 },
      goalHistory: [goalRow('2026-09-01T10:00:00Z', 2000), goalRow('2026-10-07T10:00:00Z', 2500)],
    });
    const n = pilar('Nutrição');
    // sex 9 (2000/2500) e qui 8 (2000/2500) abaixo; ter 6 e seg 5 (2000/2000) dentro
    expect(within(n).getByText('Calorias no objetivo em 2 de 4 dias')).toBeInTheDocument();
    expect(within(n).getByText('Abaixo do objetivo')).toBeInTheDocument();
  });

  it('O1 por dia: os dias antes de haver objetivo ficam de fora e diz-se', () => {
    // histórico: linha inicial sem calorias + objetivo de 3 000 a partir de terça 6 out
    const inicial = { valid_from: '2026-07-11T10:00:00Z', source: 'inicial', calorie_goal: null, protein_goal: 150, carbs_goal: 200, fat_goal: 70, water_goal_ml: 2000 };
    renderOverview({
      meals: [refeicao(5, 2000), refeicao(4, 3000), refeicao(3, 3000), refeicao(2, 3000), refeicao(1, 3000)],
      profile: { calorie_goal: 3000 },
      goalHistory: [inicial, goalRow('2026-10-06T08:00:00Z', 3000)],
    });
    const n = pilar('Nutrição');
    expect(within(n).getByText('100%')).toBeInTheDocument();
    expect(within(n).getByText('Calorias no objetivo em 4 de 4 dias')).toBeInTheDocument();
    expect(within(n).getByText('1 dia sem objetivo definido ficam de fora')).toBeInTheDocument();
    expect(within(n).queryByText('Abaixo do objetivo')).not.toBeInTheDocument();
  });

  it('com menos de 3 dias registados: sem % nem estado ("ainda é cedo")', () => {
    renderOverview({ meals: [refeicao(1), refeicao(2)], profile: { calorie_goal: 2000 } });
    const n = pilar('Nutrição');
    expect(within(n).getByText('Ainda é cedo')).toBeInTheDocument();
    expect(n.textContent).not.toMatch(/%/);
    expect(n.textContent).toMatch(/2 dias registados — poucos para conclusões/);
  });

  it('EA com a origem da massa magra, vírgula decimal e só em dias com refeições', () => {
    // 2 000 kcal/dia e nenhum treino, massa magra medida 50 kg → EA 40 kcal/kg
    renderOverview({
      meals: [refeicao(1), refeicao(2), refeicao(3)],
      profile: { calorie_goal: 2000 },
      bodyAssessments: [{ id: 'b', date: ago(30), weight_kg: 70, lean_body_mass_kg: 50 }],
    });
    expect(within(pilar('Nutrição')).getByText('EA 40 kcal/kg (massa magra medida)')).toBeInTheDocument();
  });

  it('EA sem composição corporal diz que é uma estimativa', () => {
    renderOverview({ meals: [refeicao(1), refeicao(2), refeicao(3)], profile: { calorie_goal: 2000 } });
    expect(within(pilar('Nutrição')).getByText(/EA .* kcal\/kg \(estimativa: sem composição corporal medida\)/)).toBeInTheDocument();
  });

  it('um dia de treino sem refeições não vira EA negativa', () => {
    renderOverview({
      meals: [refeicao(2), refeicao(3), refeicao(4)],
      runs: [corrida(1, 15), corrida(20)],
      profile: { calorie_goal: 2000 },
      bodyAssessments: [{ id: 'b', date: ago(30), weight_kg: 70, lean_body_mass_kg: 50 }],
    });
    const n = pilar('Nutrição');
    // só os 3 dias com refeições contam: (2000 − 0) / 50 = 40
    expect(within(n).getByText('EA 40 kcal/kg (massa magra medida)')).toBeInTheDocument();
  });

  it('a nota dos objetivos aproximados só aparece quando a semana tem dias antes de 3 out', () => {
    // esta semana (5 – 11 out) já é toda depois de 3 out: sem nota
    renderOverview({ meals: [refeicao(1), refeicao(2), refeicao(3)], profile: { calorie_goal: 2000 } });
    expect(screen.queryByTestId('approx-goals-note')).not.toBeInTheDocument();
  });

  it('a semana anterior começa antes de 3 out: aproxima-se e diz-se', () => {
    renderOverview({ meals: [refeicao(8), refeicao(9), refeicao(10)], profile: { calorie_goal: 2000 } });
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(screen.getByTestId('approx-goals-note')).toHaveTextContent('Objetivos aproximados');
  });

  it('▲/▼ dos dias no objetivo contra a semana anterior, com o anterior por extenso', () => {
    // esta semana (5 dias fechados): 4 refeições todas no objetivo; a anterior, mesmos 5 dias
    // (28 set – 2 out): 5 dias, 2 no objetivo
    renderOverview({
      meals: [
        refeicao(1), refeicao(2), refeicao(3), refeicao(4),
        refeicao(8, 2000), refeicao(9, 2000), refeicao(10, 800), refeicao(11, 800), refeicao(12, 800),
      ],
      profile: { calorie_goal: 2000 },
    });
    const delta = within(pilar('Nutrição')).getByTestId('pillar-delta');
    expect(delta).toHaveAttribute('data-direction', 'up');
    expect(delta.textContent).toMatch(/▲ face a 28 set – 2 out: 2 de 5 dias no objetivo/);
    // o anterior diz de quê (a leitora de ecrã já o dizia)
    expect(delta).toHaveTextContent('dias no objetivo');
  });
});

describe('OverviewDashboard — sem registos: "O que falta para começar" (O7)', () => {
  const vazio = (over = {}) => {
    useAppStore.setState({
      runs: [], gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [],
      coachPlans: [], coachPlanItems: [], shoes: [], profile: {}, goalHistory: [], ...over,
    });
    return render(<OverviewDashboard scrollToTab={() => {}} />);
  };

  it('usa os critérios de buildGettingStarted: itens, "0 de 3", "0 de 7"', () => {
    vazio();
    expect(screen.getByTestId('overview-empty')).toBeInTheDocument();
    expect(screen.getByText('O que falta para começar')).toBeInTheDocument();
    expect(screen.getByText('Perfil preenchido')).toBeInTheDocument();
    expect(screen.getByText('Marcar uma prova')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Registar 3 corridas/ })).toHaveTextContent('0 de 3');
    expect(screen.getByRole('button', { name: /Registar 1 semana de refeições/ })).toHaveTextContent('0 de 7');
  });

  it('um passo já feito aparece sem botão; os que faltam abrem o registo certo', () => {
    const setOpenCreationMode = vi.fn();
    const setActiveTab = vi.fn();
    useAppStore.setState({ setOpenCreationMode, setActiveTab });
    vazio({ profile: { experience_level: 'medio', weight_kg: 70 }, raceEvents: [{ id: 'r1', date: '2027-01-01', name: 'Maratona' }] });
    useAppStore.setState({ setOpenCreationMode, setActiveTab });
    expect(screen.queryByRole('button', { name: /Perfil preenchido/ })).not.toBeInTheDocument();
    expect(screen.getByText('Perfil preenchido')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Registar 3 corridas/ }));
    expect(setOpenCreationMode).toHaveBeenCalledWith('run');
    fireEvent.click(screen.getByRole('button', { name: /Registar 1 semana de refeições/ }));
    expect(setOpenCreationMode).toHaveBeenCalledWith('meal');
  });
});
