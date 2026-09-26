import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { todayISO, addDaysISO } from '../../lib/utils';
import { useAppStore } from '../../store';
import DayPlanCard, { noPlanCopy } from './DayPlanCard';
import { expectCarolVoice } from '../../test/carolVoice';

const today = todayISO();
const tomorrow = addDaysISO(today, 1);

const plan = { id: 'p1', status: 'aceite', period_start: today, period_end: today };
const race = { id: 'r1', date: today, name: 'Corrida do Tejo', status: 'agendada', distance_km: 10 };

const raceItem = (over = {}) => ({
  id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida',
  training_type: 'prova', target_distance_km: 10, status: 'pendente', ...over,
});

/* "O que faço hoje" no dia da prova (specs/plano-de-prova.md, "O plano tem
   de saber da prova"): o item `corrida` com `training_type = 'prova'` é a
   prova, não um treino — leva o nome dela, a data em âmbar, e o botão que
   abre o hub em vez de "Registar sessão" (a prova regista-se em modo prova,
   e é esse registo que conclui o item). Não há gaveta de detalhe: não há
   treino nenhum por registar por trás dela. */
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

  it('o título é a prova, a data fica âmbar e não há "Ver detalhe do treino"', () => {
    renderCard([raceItem()]);
    expect(screen.getByText('Prova · Corrida do Tejo · 10 km')).toBeInTheDocument();
    expect(screen.getByTestId('day-plan-date')).toHaveStyle({ color: 'var(--race)' });
    expect(screen.queryByTestId('day-plan-detail-toggle')).not.toBeInTheDocument();
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
});

/* Redesenho 2026-09-15: o cartão é de HOJE e só de hoje (o carrossel de
   dias mudou-se para o ecrã "O plano"), e a instrução da Carol e o botão de
   registo passaram para trás de uma única linha "Ver detalhe do treino",
   fechada por omissão — nunca um sem o outro. */
describe('DayPlanCard — "Ver detalhe do treino"', () => {
  let onComplete;

  const training = {
    id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'intervalos',
    target_distance_km: 8, status: 'pendente', notes: '8×400m a 4:15/km, 90s de trote entre séries.',
  };

  beforeEach(() => {
    onComplete = vi.fn();
  });

  const renderCard = (items = [training]) => render(
    <DayPlanCard plans={[plan]} planItems={items} raceEvents={[]} onComplete={onComplete} />,
  );

  it('fechado por omissão: o título vê-se, a instrução e o botão não', () => {
    renderCard();
    expect(screen.getByText('Intervalos · 8 km')).toBeInTheDocument();
    expect(screen.getByTestId('day-plan-detail-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('day-plan-notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Registar sessão')).not.toBeInTheDocument();
  });

  it('abrir revela a instrução e o "Registar sessão" de uma vez', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('day-plan-detail-toggle'));
    expect(screen.getByTestId('day-plan-notes')).toHaveTextContent('8×400m a 4:15/km, 90s de trote entre séries.');
    fireEvent.click(screen.getByText('Registar sessão'));
    expect(onComplete).toHaveBeenCalledWith(training);
  });

  it('um dia de descanso sem nada a dizer não tem sequer a linha do detalhe', () => {
    renderCard([{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'descanso', status: 'pendente' }]);
    expect(screen.getByText('Descanso')).toBeInTheDocument();
    expect(screen.queryByTestId('day-plan-detail-toggle')).not.toBeInTheDocument();
  });

  it('um treino já dado: o feito fica à vista, fora da gaveta, e o botão sai', () => {
    renderCard([{ ...training, status: 'concluido' }]);
    // Sem a corrida ligada no store, fica o "Feito." — sem números inventados.
    expect(screen.getByTestId('day-plan-done')).toHaveTextContent('Feito.');
    fireEvent.click(screen.getByTestId('day-plan-detail-toggle'));
    expect(screen.queryByText('Registar sessão')).not.toBeInTheDocument();
    expect(screen.queryByTestId('day-plan-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('day-plan-date')).toHaveStyle({ color: 'var(--ok)' });
  });
});

/* A faixa de navegação do dia saiu inteira: o que fica no cabeçalho é a
   data (colorida pelo estado) e a semana do plano. */
describe('DayPlanCard — a data e a semana', () => {
  it('um treino de hoje por fazer colore a data a --gym, não a --ok', () => {
    render(<DayPlanCard plans={[plan]} planItems={[{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente' }]} raceEvents={[]} />);
    expect(screen.getByTestId('day-plan-date')).toHaveStyle({ color: 'var(--gym)' });
  });

  it('"semana N de M" conta a partir do arranque da janela acordada', () => {
    // Janela de 18 dias (3 semanas) que começou há 8 dias: segunda semana.
    const longPlan = { id: 'p1', status: 'aceite', period_start: addDaysISO(today, -8), period_end: addDaysISO(today, 9) };
    render(<DayPlanCard plans={[longPlan]} planItems={[{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', status: 'pendente' }]} raceEvents={[]} />);
    expect(screen.getByTestId('day-plan-week')).toHaveTextContent('semana 2 de 3');
  });
});

/* O rodapé é a única porta para o plano inteiro desde que o carrossel saiu
   daqui — e diz o que vem amanhã, para não ser preciso abrir só por isso. */
describe('DayPlanCard — "Ver o plano · amanhã: …"', () => {
  const twoDayPlan = { id: 'p1', status: 'aceite', period_start: today, period_end: tomorrow };
  const hoje = { id: 'i1', plan_id: 'p1', planned_date: today, kind: 'ginasio', categories: ['Pernas'], status: 'pendente' };

  it('mostra o treino de amanhã e abre o ecrã do plano', () => {
    const onOpenPlano = vi.fn();
    const amanha = { id: 'i2', plan_id: 'p1', planned_date: tomorrow, kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'pendente' };
    render(<DayPlanCard plans={[twoDayPlan]} planItems={[hoje, amanha]} raceEvents={[]} onOpenPlano={onOpenPlano} />);
    // Só o dia de hoje é que se vê no cartão — amanhã existe só no rodapé.
    expect(screen.queryByText('Rodagem longa · 12 km')).not.toBeInTheDocument();
    expect(screen.getByTestId('day-plan-open-plano')).toHaveTextContent('· amanhã: rodagem longa · 12 km');
    fireEvent.click(screen.getByTestId('day-plan-open-plano'));
    expect(onOpenPlano).toHaveBeenCalled();
  });

  /* Sem NENHUMA linha para amanhã não é descanso — é o plano que não cobre
     aquele dia, e dizer-lhe "descanso" dava por planeado o que ninguém
     planeou (o mesmo engano que o ecrã do plano corrigiu). */
  // Pedido 2026-09-26: um dia vazio dentro de um plano aceite não é "sem
  // plano" — é um dia que a Carol deixou livre, ou que ainda está por escrever.
  it('sem nenhuma linha para amanhã, num plano sem prova, o rodapé diz sem treino', () => {
    render(<DayPlanCard plans={[twoDayPlan]} planItems={[hoje]} raceEvents={[]} onOpenPlano={vi.fn()} />);
    expect(screen.getByTestId('day-plan-open-plano')).toHaveTextContent('· amanhã: sem treino');
    expect(screen.getByTestId('day-plan-open-plano')).not.toHaveTextContent('sem plano');
  });

  it('no plano de uma prova, amanhã ainda por escrever diz por planear', () => {
    render(<DayPlanCard plans={[{ ...twoDayPlan, race_id: 'r1' }]} planItems={[hoje]} raceEvents={[]} onOpenPlano={vi.fn()} />);
    expect(screen.getByTestId('day-plan-open-plano')).toHaveTextContent('· amanhã: por planear');
  });

  it('o treino feito que passou para o bloco novo fecha o dia, com o redundante cancelado ao lado', () => {
    const feito = { id: 'f1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'concluido' };
    const redundante = { id: 'f2', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'continuo', target_distance_km: 10, status: 'cancelado' };
    render(<DayPlanCard plans={[twoDayPlan]} planItems={[feito, redundante]} raceEvents={[]} onOpenPlano={vi.fn()} />);
    expect(screen.getByTestId('day-plan-done')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Corrida contínua · 8 km');
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveTextContent('10 km');
  });

  it('com uma linha de descanso para amanhã, o rodapé diz descanso', () => {
    const amanhaDescanso = { id: 'i2', plan_id: 'p1', planned_date: tomorrow, kind: 'descanso', status: 'pendente' };
    render(<DayPlanCard plans={[twoDayPlan]} planItems={[hoje, amanhaDescanso]} raceEvents={[]} onOpenPlano={vi.fn()} />);
    expect(screen.getByTestId('day-plan-open-plano')).toHaveTextContent('· amanhã: descanso');
  });
});

/* Sem plano aceite não há dia nenhum para mostrar — e o cartão diz o que é
   verdade agora (pedido 2026-09-26): a proposta que ela já escreveu, o
   plano que acabou, ou o convite a pedir um. */
describe('DayPlanCard — sem plano e com propostas por rever', () => {
  it('nunca houve plano: o convite a pedir um, na voz dela do princípio ao fim', () => {
    const onNav = vi.fn();
    render(<DayPlanCard plans={[]} planItems={[]} raceEvents={[]} onNav={onNav} />);
    expect(screen.getByText('Sem plano acordado')).toBeInTheDocument();
    expect(screen.getByText('Pede-me um plano. Escrevo-o no chat, e és tu que decides se serve.')).toBeInTheDocument();
    expect(screen.queryByTestId('day-plan-open-plano')).not.toBeInTheDocument();
    // Nada de "à Carol" por baixo de um "Pede-me": o cartão não muda de pessoa.
    expect(screen.getByTestId('day-plan-no-plan')).not.toHaveTextContent('Carol');
    fireEvent.click(screen.getByText('Pedir um plano'));
    expect(onNav).toHaveBeenCalledWith('coach');
  });

  /* O caso do backlog (specs/carol-frases-contexto.md, DayPlanCard:122): a
     proposta por decidir é o estado normal depois da primeira, e o cartão
     pedia "Pede-me um plano" por baixo de "Tens 1 proposta da Carol por
     rever". */
  it('uma proposta por decidir e nenhum plano: a proposta está no chat, sem o aviso por cima', () => {
    const onNav = vi.fn();
    render(<DayPlanCard plans={[{ id: 'p2', status: 'proposto' }]} planItems={[]} raceEvents={[]} onNav={onNav} />);
    expect(screen.getByText('A proposta está no chat')).toBeInTheDocument();
    expect(screen.getByText('Escrevi-te um plano. Vê-o e diz-me se serve, ou o que queres mudar.')).toBeInTheDocument();
    expect(screen.queryByText(/Pede-me um plano/)).not.toBeInTheDocument();
    expect(screen.queryByText(/proposta da Carol por rever/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver a proposta'));
    expect(onNav).toHaveBeenCalledWith('coach');
  });

  it('duas propostas por decidir e nenhum plano: as duas, por extenso', () => {
    render(<DayPlanCard plans={[{ id: 'p2', status: 'proposto' }, { id: 'p3', status: 'proposto' }]} planItems={[]} raceEvents={[]} />);
    expect(screen.getByText('As propostas estão no chat')).toBeInTheDocument();
    expect(screen.getByText('Deixei-te duas propostas. Vê-as e diz-me o que serve.')).toBeInTheDocument();
    expect(screen.getByText('Ver as propostas')).toBeInTheDocument();
    expect(screen.queryByText(/propostas da Carol por rever/)).not.toBeInTheDocument();
  });

  it('o último plano aceite já acabou: ela diz que acabou e quer montar o próximo', () => {
    const acabado = { id: 'p0', status: 'aceite', period_start: addDaysISO(today, -14), period_end: addDaysISO(today, -1) };
    const feito = { id: 'i0', plan_id: 'p0', planned_date: addDaysISO(today, -1), kind: 'corrida', training_type: 'rodagem', status: 'concluido' };
    render(<DayPlanCard plans={[acabado]} planItems={[feito]} raceEvents={[]} />);
    expect(screen.getByText('O último plano acabou')).toBeInTheDocument();
    expect(screen.getByText('Combinar o próximo plano')).toBeInTheDocument();
    expect(screen.queryByText(/Pede-me um plano/)).not.toBeInTheDocument();
  });

  it('com plano a correr, as propostas novas continuam no aviso por cima do dia', () => {
    const onNav = vi.fn();
    render(<DayPlanCard plans={[plan, { id: 'p2', status: 'proposto' }, { id: 'p3', status: 'proposto' }]} planItems={[{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', status: 'pendente' }]} raceEvents={[]} onNav={onNav} />);
    fireEvent.click(screen.getByText('Tens 2 propostas da Carol por rever'));
    expect(onNav).toHaveBeenCalledWith('coach');
    expect(screen.queryByTestId('day-plan-no-plan')).not.toBeInTheDocument();
    cleanup();

    render(<DayPlanCard plans={[plan, { id: 'p2', status: 'proposto' }]} planItems={[{ id: 'i1', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'longo', status: 'pendente' }]} raceEvents={[]} />);
    expect(screen.getByText('Tens 1 proposta da Carol por rever')).toBeInTheDocument();
  });
});

describe('noPlanCopy — cada frase pela condição que a torna verdadeira', () => {
  it('a proposta por decidir ganha ao plano acabado, e o aviso de cima sai só aí', () => {
    expect(noPlanCopy({ pendingCount: 1, hadPlan: true })).toMatchObject({ title: 'A proposta está no chat', hideBanner: true });
    expect(noPlanCopy({ pendingCount: 0, hadPlan: true })).toMatchObject({ title: 'O último plano acabou', hideBanner: false });
    expect(noPlanCopy({})).toMatchObject({ title: 'Sem plano acordado', hideBanner: false });
  });

  it('muitas propostas: por extenso até cinco, depois em algarismos', () => {
    expect(noPlanCopy({ pendingCount: 3 }).body).toBe('Deixei-te três propostas. Vê-as e diz-me o que serve.');
    expect(noPlanCopy({ pendingCount: 7 }).body).toBe('Deixei-te 7 propostas. Vê-as e diz-me o que serve.');
  });

  it('na voz dela: sem exclamações, sem "talvez", sem se nomear na terceira pessoa', () => {
    for (const args of [{ pendingCount: 1 }, { pendingCount: 2 }, { hadPlan: true }, {}]) {
      const c = noPlanCopy(args);
      expectCarolVoice(`${c.title}. ${c.body} ${c.cta}`);
    }
  });
});

/* O dia fechado (dayDone.js) fica em coach_impressions como um momento
   (ação 5.1): a chave do dia, sem título, uma vez — para o outro telemóvel
   não o repetir. Como nos outros momentos, só com a cancela das boas-vindas
   aberta (utils/useMomentOnce). */
describe('DayPlanCard — o dia fechado fica registado', () => {
  let logImpression;
  beforeEach(() => {
    window.localStorage.clear();
    logImpression = vi.fn();
    useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, welcomeGate: 'clear', logImpression, impressionShown: new Set() });
  });

  const treinoFeito = { id: 'i2', plan_id: 'p1', planned_date: today, kind: 'corrida', training_type: 'rodagem', target_distance_km: 8, status: 'concluido' };
  const renderDone = () => render(<DayPlanCard plans={[plan]} planItems={[treinoFeito]} raceEvents={[]} />);

  it('na primeira vez é o momento e grava a chave do dia; na segunda, nada', () => {
    const first = renderDone();
    expect(first.container.querySelector('.day-done-check')).not.toBeNull();
    expect(logImpression).toHaveBeenCalledWith({ kind: 'moment', key: `daydone:${today}`, title: null });
    first.unmount();
    const second = renderDone();
    expect(second.container.querySelector('.day-done-check')).toBeNull();
    expect(logImpression).toHaveBeenCalledTimes(1);
  });

  it('dia fechado visto noutro dispositivo: fica só lá, sem momento nem nova impressão', () => {
    useAppStore.setState({ impressionShown: new Set([`moment:daydone:${today}`]) });
    const { container } = renderDone();
    expect(container.querySelector('.day-done-check')).toBeNull();
    expect(logImpression).not.toHaveBeenCalled();
  });
});
