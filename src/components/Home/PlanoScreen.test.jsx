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

// A segunda-feira da semana de uma data qualquer — igual à do componente.
const weekStartOf = (dateISO) => {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return addDaysISO(dateISO, -((d.getUTCDay() + 6) % 7));
};

/* Os testes correm em qualquer dia da semana, e "amanhã" tanto pode cair
   na semana em curso (aberta) como na seguinte (fechada). Este ajudante
   garante que a semana do dia em causa está aberta, sem presumir qual é. */
const abrirSemanaDe = (dateISO) => {
  const cabecalho = screen.getByTestId(`plano-semana-${weekStartOf(dateISO)}`);
  if (cabecalho.getAttribute('aria-expanded') === 'false') fireEvent.click(cabecalho);
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

  /* Um plano de várias semanas abria com dezenas de linhas de dias e a
     semana em curso perdida no meio. Fechadas por omissão, menos a de hoje. */
  it('só a semana em curso abre; as outras ficam fechadas até serem tocadas', () => {
    const proximaSegunda = addDaysISO(monday, 7);
    const longo = { id: 'p1', status: 'aceite', period_start: monday, period_end: addDaysISO(proximaSegunda, 6) };
    const amanhaNaProxima = { id: 'i3', plan_id: 'p1', planned_date: proximaSegunda, kind: 'corrida', training_type: 'longo', target_distance_km: 14, status: 'pendente' };
    setup({ coachPlans: [longo], coachPlanItems: [feito, hoje, amanhaNaProxima] });

    // A semana de hoje está aberta: os dias dela veem-se.
    expect(screen.getByTestId(`plano-dia-${today}`)).toBeInTheDocument();
    // A seguinte está fechada: o cabeçalho existe, os dias não.
    const cabecalho = screen.getByTestId(`plano-semana-${proximaSegunda}`);
    expect(cabecalho).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId(`plano-dia-${proximaSegunda}`)).not.toBeInTheDocument();
    // E o resumo diz o que lá está sem ser preciso abrir.
    expect(cabecalho).toHaveTextContent('0/1 feitos');

    fireEvent.click(cabecalho);
    expect(cabecalho).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId(`plano-dia-${proximaSegunda}`)).toBeInTheDocument();

    // E volta a fechar.
    fireEvent.click(cabecalho);
    expect(screen.queryByTestId(`plano-dia-${proximaSegunda}`)).not.toBeInTheDocument();
  });

  /* Um dia sem NENHUMA linha não é descanso: é plano em falta. A Carol não
     escreve linhas para dias sem nada a dizer, por isso a lista fabrica-os
     — e dizia "Descanso" a dias que ninguém planeou. */
  it('um dia sem linha nenhuma diz "Sem plano" e convida a pedir um', () => {
    // Plano de hoje até depois de amanhã, com item só para hoje.
    const amanha = addDaysISO(today, 1);
    const depois = addDaysISO(today, 2);
    const curto = { id: 'p1', status: 'aceite', period_start: today, period_end: depois };
    setup({ coachPlans: [curto], coachPlanItems: [hoje] });
    abrirSemanaDe(amanha);
    abrirSemanaDe(depois);

    expect(screen.getByTestId(`plano-dia-${amanha}`)).toHaveTextContent('Sem plano');
    expect(screen.getByTestId(`plano-dia-${depois}`)).toHaveTextContent('Sem plano');

    // O convite aparece só no primeiro dia do bloco vazio, não em todos.
    expect(screen.getByTestId(`plano-pedir-${amanha}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`plano-pedir-${depois}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`plano-pedir-${amanha}`));
    expect(setCoachIntent).toHaveBeenCalledWith('adapt_plan');
    expect(setActiveTab).toHaveBeenCalledWith('coach');
  });

  it('um dia com linha de descanso continua a dizer "Descanso", sem convite', () => {
    const amanha = addDaysISO(today, 1);
    const curto = { id: 'p1', status: 'aceite', period_start: today, period_end: amanha };
    const descanso = { id: 'i9', plan_id: 'p1', planned_date: amanha, kind: 'descanso', status: 'pendente' };
    setup({ coachPlans: [curto], coachPlanItems: [hoje, descanso] });
    abrirSemanaDe(amanha);

    expect(screen.getByTestId(`plano-dia-${amanha}`)).toHaveTextContent('Descanso');
    expect(screen.queryByTestId(`plano-pedir-${amanha}`)).not.toBeInTheDocument();
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
