import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import PlanoScreen from './PlanoScreen';

/* "O plano" — o ecrã cheio que herdou o trabalho do carrossel que vivia
   dentro de "O que faço hoje": o plano acordado dia a dia, agrupado por
   semana, com o resumo da semana em curso e a porta para a conversa com a
   Carol (que continua a ser o único sítio onde o plano muda). */

const today = todayISO();
// A janela do teste é exatamente a semana ISO em curso, para as contas do
// resumo ("sessões feitas", "km esta semana") não dependerem do dia em que
// os testes correm.
const monday = (() => {
  const d = new Date(`${today}T00:00:00Z`);
  return addDaysISO(today, -((d.getUTCDay() + 6) % 7));
})();
const sunday = addDaysISO(monday, 6);
// Um dia da mesma semana que nunca é hoje (hoje pode ser segunda-feira).
const outroDia = today === monday ? addDaysISO(monday, 1) : monday;

const plan = { id: 'p1', status: 'aceite', period_start: monday, period_end: sunday };

const feito = { id: 'i1', plan_id: 'p1', planned_date: outroDia, kind: 'corrida', training_type: 'regenerativo', target_distance_km: 6, status: 'concluido', notes: '6 km bem lentos, sem pressa nenhuma.' };
const hoje = {
  id: 'i2', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'intervalos', target_distance_km: 8, status: 'pendente',
  notes: '8×400 m a 4:15/km, 90 s de trote entre séries.',
  meal_macros: { kcal: 2300, items: [{ tipo: 'almoco', texto: 'Atum com grão-de-bico' }] },
};

let setActiveTab;
let setCoachIntent;
let onClose;

const setup = (state = {}) => {
  setActiveTab = vi.fn();
  setCoachIntent = vi.fn();
  onClose = vi.fn();
  useAppStore.setState({
    coachPlans: [plan], coachPlanItems: [feito, hoje], raceEvents: [],
    setActiveTab, setCoachIntent, ...state,
  });
  return render(<PlanoScreen onClose={onClose} />);
};

describe('PlanoScreen', () => {
  beforeEach(() => {
    useAppStore.setState({ coachPlans: [], coachPlanItems: [], raceEvents: [] });
  });

  it('o cabeçalho diz o período e a prova a que o plano leva, e volta para trás', () => {
    setup({ raceEvents: [{ id: 'r1', date: sunday, name: 'Corrida do Tejo', status: 'agendada' }] });
    expect(screen.getByText('O plano')).toBeInTheDocument();
    expect(screen.getByTestId('plano-screen')).toHaveTextContent('para a Corrida do Tejo');
    fireEvent.click(screen.getByLabelText('Voltar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('o resumo conta as sessões e os quilómetros já dados desta semana', () => {
    setup();
    expect(screen.getByTestId('plano-sessoes')).toHaveTextContent('1/2');
    expect(screen.getByTestId('plano-km')).toHaveTextContent('6 km');
    expect(screen.getByTestId('plano-semana')).toHaveTextContent('1/1');
  });

  it('cada dia leva o treino, a instrução da Carol e o estado', () => {
    setup();
    expect(screen.getByText('Esta semana')).toBeInTheDocument();
    const diaDeHoje = screen.getByTestId(`plano-dia-${today}`);
    expect(diaDeHoje).toHaveTextContent('Intervalos · 8 km');
    expect(diaDeHoje).toHaveTextContent('8×400 m a 4:15/km, 90 s de trote entre séries.');
    expect(diaDeHoje).toHaveTextContent('Hoje');
    const diaFeito = screen.getByTestId(`plano-dia-${outroDia}`);
    expect(diaFeito).toHaveTextContent('Regenerativo · 6 km');
    expect(diaFeito).toHaveTextContent('Feito');
  });

  it('as refeições sugeridas abrem a persiana DESSE dia', () => {
    setup();
    expect(screen.queryByTestId(`plano-refeicoes-${outroDia}`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`plano-refeicoes-${today}`));
    const persiana = screen.getByTestId('meal-sheet');
    expect(persiana).toHaveTextContent('Atum com grão-de-bico');
    expect(persiana).toHaveTextContent('2300');
  });

  it('"Adaptar o plano com a Carol" fecha o ecrã e entra no chat com a intenção', () => {
    setup();
    fireEvent.click(screen.getByTestId('plano-adaptar'));
    expect(setCoachIntent).toHaveBeenCalledWith('adapt_plan');
    expect(onClose).toHaveBeenCalled();
    expect(setActiveTab).toHaveBeenCalledWith('coach');
  });

  it('sem plano aceite não há lista nenhuma — há o convite a pedir um', () => {
    setup({ coachPlans: [], coachPlanItems: [] });
    expect(screen.getByText('Sem plano acordado')).toBeInTheDocument();
    expect(screen.queryByTestId('plano-adaptar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Pedir plano à Carol'));
    expect(setActiveTab).toHaveBeenCalledWith('coach');
    expect(setCoachIntent).not.toHaveBeenCalled();
  });
});
