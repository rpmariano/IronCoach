import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { todayISO, addDaysISO } from '../../lib/utils';
import DayPlanCard from './DayPlanCard';

/* "O que faço hoje" no dia da prova (specs/plano-de-prova.md, "O plano tem
   de saber da prova"): o item `corrida` com `training_type = 'prova'` é a
   prova, não um treino — leva o nome dela, o badge âmbar, e o botão que
   abre o hub em vez de "Registar sessão" (a prova regista-se em modo prova,
   e é esse registo que conclui o item). */

const today = todayISO();

const plan = { id: 'p1', status: 'aceite', period_start: today, period_end: today };
const race = { id: 'r1', date: today, name: 'Corrida do Tejo', status: 'agendada', distance_km: 10 };

const raceItem = (over = {}) => ({
  id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida',
  training_type: 'prova', target_distance_km: 10, status: 'pendente', ...over,
});

describe('DayPlanCard — o dia da prova', () => {
  let onComplete;
  let onOpenRace;

  beforeEach(() => {
    onComplete = vi.fn();
    onOpenRace = vi.fn();
  });

  const renderCard = (items, raceEvents = [race]) => render(
    <DayPlanCard plans={[plan]} planItems={items} raceEvents={raceEvents} onComplete={onComplete} onOpenRace={onOpenRace} />,
  );

  it('o título é a prova e o badge é âmbar', () => {
    renderCard([raceItem()]);
    expect(screen.getByText('Prova · Corrida do Tejo · 10 km')).toBeInTheDocument();
    expect(screen.getByText('Prova')).toBeInTheDocument();
  });

  it('"Abrir a prova" em vez de "Registar sessão", e leva o id da prova da agenda', () => {
    renderCard([raceItem()]);
    expect(screen.queryByText('Registar sessão')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('day-plan-open-race'));
    expect(onOpenRace).toHaveBeenCalledWith('r1');
  });

  it('sem prova na agenda nesse dia não há para onde abrir — mas o item continua a dizer que é prova', () => {
    renderCard([raceItem()], []);
    expect(screen.getByText('Prova · 10 km')).toBeInTheDocument();
    expect(screen.queryByTestId('day-plan-open-race')).not.toBeInTheDocument();
    expect(screen.queryByText('Registar sessão')).not.toBeInTheDocument();
  });

  it('um treino normal no mesmo dia continua a oferecer "Registar sessão"', () => {
    const training = raceItem({ id: 'i2', training_type: 'longo', target_distance_km: 16 });
    renderCard([training]);
    expect(screen.getByText('Rodagem longa · 16 km')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Registar sessão'));
    expect(onComplete).toHaveBeenCalledWith(training);
  });
});

/* Bug 2026-09-14: o carrossel "O que faço hoje" nasceu (redesenho 6c) só
   com as setas e os pontos — o WeeklyPlanCard que substituiu já deslizava
   com o dedo, mas isso nunca foi portado. Agora cada dia é uma página do
   mesmo carrossel de snap nativo (.tab-swipe-carousel/.tab-swipe-page,
   useCarouselHaptics) usado no Dashboard/Perfil, com o tique tátil de
   sempre em qualquer forma de mudar de dia — gesto, seta ou ponto. */
describe('DayPlanCard — o carrossel desliza (swipe) com feedback háptico', () => {
  const originalVibrate = window.navigator.vibrate;
  let vibrateMock;

  beforeEach(() => {
    vibrateMock = vi.fn().mockReturnValue(true);
    window.navigator.vibrate = vibrateMock;
  });

  afterEach(() => {
    if (originalVibrate) window.navigator.vibrate = originalVibrate;
    else delete window.navigator.vibrate;
  });

  const twoDayPlan = { id: 'p1', status: 'aceite', period_start: today, period_end: addDaysISO(today, 1) };
  const dayOneItem = { id: 'i1', plan_id: 'p1', planned_date: today, kind: 'ginasio', categories: ['Pernas'], status: 'pendente' };
  const dayTwoItem = { id: 'i2', plan_id: 'p1', planned_date: addDaysISO(today, 1), kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente' };

  const renderTwoDays = () => render(
    <DayPlanCard plans={[twoDayPlan]} planItems={[dayOneItem, dayTwoItem]} raceEvents={[]} onComplete={vi.fn()} onOpenRace={vi.fn()} />,
  );

  it('um dia por página dentro do mesmo contentor de deslize nativo (com snap)', () => {
    const { container } = renderTwoDays();
    const carousel = container.querySelector('.tab-swipe-carousel');
    expect(carousel).toBeTruthy();
    expect(carousel.querySelectorAll('.tab-swipe-page')).toHaveLength(2);
    // Os dois dias estão no DOM ao mesmo tempo (é o scroll nativo que exige
    // isto, tal como o carrossel de módulos do Dashboard) — ambos os
    // títulos existem, não só o do dia ativo.
    expect(screen.getByText('Pernas')).toBeInTheDocument();
    expect(screen.getByText('Rodagem longa · 12 km')).toBeInTheDocument();
  });

  it('a seta "Dia seguinte" avança e dispara o tique tátil, tal como o gesto', () => {
    renderTwoDays();
    fireEvent.click(screen.getByLabelText('Dia seguinte'));
    expect(vibrateMock).toHaveBeenCalledWith(30);
  });

  it('o ponto do segundo dia também move o carrossel com o mesmo tique', () => {
    renderTwoDays();
    vibrateMock.mockClear();
    fireEvent.click(screen.getByLabelText('Ver dia 2'));
    expect(vibrateMock).toHaveBeenCalledWith(30);
  });
});
