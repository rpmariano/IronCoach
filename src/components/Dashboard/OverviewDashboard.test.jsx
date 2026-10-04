import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import OverviewDashboard from './OverviewDashboard';
import { todayISO, addDaysISO } from '../../lib/utils';

/* Visão Geral — factos reais em vez de fogo de artifício (2026-10-04).
   O2 plurais, O3 média por sessão de força com carga, O4 pilar Corpo com a
   última pesagem datada e sem tendência inventada, e vírgulas decimais. */

// O jsdom não tem canvas — a Análise Cruzada desenha gráficos ao montar.
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div />, Line: () => <div />, Doughnut: () => <div />, Scatter: () => <div />, Chart: () => <div />,
}));
vi.mock('../BI/SmartInsightsBanner', () => ({ default: () => null }));
vi.mock('../BI/RaceReadinessCard', () => ({ default: () => null }));

const ago = (n) => addDaysISO(todayISO(), -n);
const forca = (daysAgo, kg = 5000) => ({
  id: `f${daysAgo}${kg}${Math.random()}`, date: ago(daysAgo), kind: 'forca', categories: ['Costas'],
  workout_session_sets: [{ reps: 10, weight: kg / 10 }],
});
const aula = (daysAgo) => ({
  id: `a${daysAgo}${Math.random()}`, date: ago(daysAgo), kind: 'aula', name: 'Pilates', class_types: ['Pilates'], workout_session_sets: [],
});
const corrida = (daysAgo, km = 5) => ({ id: `r${daysAgo}`, date: ago(daysAgo), distance_km: km, duration_seconds: km * 330 });
const pesagem = (daysAgo, kg) => ({ id: `p${daysAgo}`, date: ago(daysAgo), weight_kg: kg });

// O cartão do pilar é o <button> que tem o título.
const pilar = (title) => screen.getByText(title, { selector: 'span' }).closest('button');

function renderOverview(state) {
  useAppStore.setState({
    runs: [corrida(20)], gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [],
    coachPlans: [], coachPlanItems: [], shoes: [], profile: {}, ...state,
  });
  return render(<OverviewDashboard scrollToTab={() => {}} />);
}

describe('OverviewDashboard — plurais (O2)', () => {
  beforeEach(() => useAppStore.setState({ gymSessions: [], bodyAssessments: [] }));

  it('"2 sessões" e "2 avaliações", nunca "sessãoões"', () => {
    renderOverview({ gymSessions: [forca(1), forca(2)], bodyAssessments: [pesagem(1, 80), pesagem(2, 80.4)] });
    expect(within(pilar('Ginásio')).getByText('2 sessões')).toBeInTheDocument();
    expect(within(pilar('Corpo')).getByText(/2 avaliações esta semana/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ãoões/);
  });

  it('singular e zero: "1 sessão", "0 sessões", "1 avaliação"', () => {
    const { unmount } = renderOverview({ gymSessions: [forca(1)], bodyAssessments: [pesagem(1, 80)] });
    expect(within(pilar('Ginásio')).getByText('1 sessão')).toBeInTheDocument();
    expect(within(pilar('Corpo')).getByText(/1 avaliação esta semana/)).toBeInTheDocument();
    unmount();
    renderOverview({ gymSessions: [] });
    expect(within(pilar('Ginásio')).getByText('0 sessões')).toBeInTheDocument();
  });
});

describe('OverviewDashboard — kg/sessão em média (O3)', () => {
  it('divide só pelas sessões de força com carga e diz quantas são', () => {
    // 2 sessões de 5000 kg + 2 aulas: 5 000 kg/sessão (antes 2 500, a dividir por 4)
    renderOverview({ gymSessions: [forca(1), forca(2), aula(3), aula(4)] });
    expect(within(pilar('Ginásio')).getByText('5 000 kg/sessão em média (2 sessões)')).toBeInTheDocument();
  });

  it('1 treino de 1000 kg + 1 aula: 1 000 kg/sessão (1 sessão)', () => {
    renderOverview({ gymSessions: [forca(1, 1000), aula(2)] });
    expect(within(pilar('Ginásio')).getByText('1 000 kg/sessão em média (1 sessão)')).toBeInTheDocument();
  });

  it('uma sessão de força sem carga não entra no denominador', () => {
    const semCarga = { id: 'sc', date: ago(1), kind: 'forca', categories: ['Costas'], workout_session_sets: [{ reps: 10, weight: 0 }] };
    renderOverview({ gymSessions: [forca(2, 3000), semCarga] });
    expect(within(pilar('Ginásio')).getByText('3 000 kg/sessão em média (1 sessão)')).toBeInTheDocument();
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
  it('"12,4 km esta sem." e "1,0k kg vol."', () => {
    renderOverview({ runs: [corrida(1, 12.4)], gymSessions: [forca(1, 1000)] });
    const corrida_ = pilar('Corrida');
    expect(within(corrida_).getByText('12,4')).toBeInTheDocument();
    expect(within(corrida_).getByText('km esta sem.')).toBeInTheDocument();
    expect(within(pilar('Ginásio')).getByText('1,0k')).toBeInTheDocument();
  });

  it('"1 corrida" e "2 corridas" no singular/plural certo', () => {
    const { unmount } = renderOverview({ runs: [corrida(1)] });
    expect(within(pilar('Corrida')).getByText('1 corrida esta semana')).toBeInTheDocument();
    unmount();
    renderOverview({ runs: [corrida(1), corrida(2)] });
    expect(within(pilar('Corrida')).getByText('2 corridas esta semana')).toBeInTheDocument();
  });
});
