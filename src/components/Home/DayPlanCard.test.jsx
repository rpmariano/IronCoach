import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

  it('o título é a prova e a data fica âmbar (sem badge — saiu com o redesenho)', () => {
    renderCard([raceItem()]);
    expect(screen.getByText('Prova · Corrida do Tejo · 10 km')).toBeInTheDocument();
    expect(screen.queryByText('Prova', { selector: 'span' })).not.toBeInTheDocument();
    expect(screen.getByTestId('day-plan-date')).toHaveStyle({ color: 'var(--race)' });
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

/* Redesenho "Início e o âmbar" (2026-09-15): a faixa de navegação do dia
   perdeu o Badge — o estado passou a colorir a própria data, e a
   pré-visualização de duas linhas da refeição saiu (fica só "Ver as N"). */
describe('DayPlanCard — a data em vez do badge', () => {
  let onComplete;
  let onOpenRace;

  beforeEach(() => {
    onComplete = vi.fn();
    onOpenRace = vi.fn();
  });

  const renderCard = (items, raceEvents = []) => render(
    <DayPlanCard plans={[plan]} planItems={items} raceEvents={raceEvents} onComplete={onComplete} onOpenRace={onOpenRace} />,
  );

  it('um treino de hoje por fazer colore a data a --gym, não a --ok', () => {
    renderCard([{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente' }]);
    expect(screen.getByTestId('day-plan-date')).toHaveStyle({ color: 'var(--gym)' });
  });

  it('um dia com tudo concluído colore a data a --ok', () => {
    renderCard([{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'concluido' }]);
    expect(screen.getByTestId('day-plan-date')).toHaveStyle({ color: 'var(--ok)' });
  });

  it('a instrução da Carol para o treino aparece por baixo do título; no dia da prova não', () => {
    const item = { id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'intervalos', target_distance_km: 8, status: 'pendente', notes: '8×400m a 4:15/km, 90s de trote entre séries.' };
    renderCard([item], []);
    expect(screen.getByTestId('day-plan-notes')).toHaveTextContent('8×400m a 4:15/km, 90s de trote entre séries.');
    cleanup();
    renderCard([raceItem({ notes: 'Prova: sai a 5:20/km.' })]);
    expect(screen.queryByTestId('day-plan-notes')).not.toBeInTheDocument();
  });

  it('com mais de 8 dias os pontos dão lugar ao contador "N de M"', () => {
    const longPlan = { id: 'p1', status: 'aceite', period_start: today, period_end: addDaysISO(today, 17) };
    const items = Array.from({ length: 18 }, (_, i) => ({ id: `i${i}`, plan_id: 'p1', planned_date: addDaysISO(today, i), kind: 'corrida', training_type: 'longo', status: 'pendente' }));
    render(<DayPlanCard plans={[longPlan]} planItems={items} raceEvents={[]} onComplete={onComplete} onOpenRace={onOpenRace} />);
    expect(screen.getByTestId('day-plan-counter')).toHaveTextContent('1 de 18');
    expect(screen.queryAllByTestId('carousel-dot-target')).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Dia seguinte'));
    expect(screen.getByTestId('day-plan-counter')).toHaveTextContent('2 de 18');
  });

  it('a pré-visualização da refeição saiu — fica só "Refeições sugeridas · Ver as N"', () => {
    const item = {
      id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente',
      meal_macros: { kcal: 2000, items: [{ tipo: 'pequeno-almoco', texto: 'Omelete de 2 ovos' }, { tipo: 'almoco', texto: 'Atum com grão-de-bico' }] },
    };
    renderCard([item]);
    expect(screen.getByText('Refeições sugeridas')).toBeInTheDocument();
    expect(screen.getByText('Ver as 2')).toBeInTheDocument();
    expect(screen.queryByText('Atum com grão-de-bico')).not.toBeInTheDocument();
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

/* Limitação 2026-09-15: a altura do carrossel era a do dia mais alto — um
   dia só com "Prova · 10 km" deixava ~100px vazios antes dos pontos. Agora
   segue a página ativa. O jsdom não tem layout (offsetHeight 0) nem, por
   omissão, ResizeObserver: o cartão tem de aguentar os dois. */
describe('DayPlanCard — a altura segue o dia ativo', () => {
  const twoDayPlan = { id: 'p1', status: 'aceite', period_start: today, period_end: addDaysISO(today, 1) };
  const items = [
    { id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'prova', target_distance_km: 10, status: 'pendente' },
    { id: 'i2', plan_id: 'p1', planned_date: addDaysISO(today, 1), kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente' },
  ];
  const renderTwoDays = () => render(<DayPlanCard plans={[twoDayPlan]} planItems={items} raceEvents={[]} />);
  const originalRO = globalThis.ResizeObserver;

  afterEach(() => {
    if (originalRO) globalThis.ResizeObserver = originalRO;
    else delete globalThis.ResizeObserver;
    vi.restoreAllMocks();
  });

  it('sem ResizeObserver não rebenta, e com medidas 0 deixa a altura por fixar', () => {
    delete globalThis.ResizeObserver;
    const { container } = renderTwoDays();
    const carousel = container.querySelector('.tab-swipe-carousel');
    expect(carousel.style.height).toBe('');
    fireEvent.click(screen.getByLabelText('Dia seguinte'));
    expect(carousel.style.height).toBe('');
  });

  it('as páginas alinham ao topo — não esticam até à altura do contentor', () => {
    const { container } = renderTwoDays();
    const pages = container.querySelectorAll('.tab-swipe-carousel > .tab-swipe-page');
    expect(pages).toHaveLength(2);
    pages.forEach((p) => expect(p.style.alignSelf).toBe('flex-start'));
  });

  it('com medidas reais fixa a altura da página ativa e observa as páginas', () => {
    const observe = vi.fn();
    globalThis.ResizeObserver = class { observe(el) { observe(el); } disconnect() {} };
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function h() {
      return this.classList.contains('tab-swipe-page') ? 64 : 0;
    });
    const { container } = renderTwoDays();
    const carousel = container.querySelector('.tab-swipe-carousel');
    expect(carousel.style.height).toBe('64px');
    expect(carousel.style.overflowY).toBe('hidden');
    expect(observe).toHaveBeenCalledTimes(2);
  });
});
