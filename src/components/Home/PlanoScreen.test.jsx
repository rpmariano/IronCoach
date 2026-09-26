import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { useAppStore } from '../../store';
import { todayISO, addDaysISO } from '../../lib/utils';
import PlanoScreen, { convitePlanear, pedidoPlanear, propostaNoChat } from './PlanoScreen';
import { expectCarolVoice } from '../../test/carolVoice';

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
    setup({
      coachPlans: [{ ...plan, race_id: 'r1' }],
      raceEvents: [{ id: 'r1', date: sunday, name: 'Corrida do Tejo', status: 'agendada' }],
    });
    expect(screen.getByText('O plano')).toBeInTheDocument();
    // Pelo nome, sem artigo (pedido 2026-09-26): "para a" dava "para a Trail do Sicó".
    expect(screen.getByTestId('plano-screen')).toHaveTextContent('Corrida do Tejo');
    expect(screen.getByTestId('plano-screen')).not.toHaveTextContent('para a');
    fireEvent.click(screen.getByLabelText('Voltar'));
    expect(onClose).toHaveBeenCalled();
  });

  /* A prova do cabeçalho é a do plano (race_id), não a primeira da agenda que
     cai dentro da janela (pedido 2026-09-26). */
  it('o cabeçalho diz a prova do plano, não uma prova de treino que caia a meio', () => {
    setup({
      coachPlans: [{ ...plan, race_id: 'porto' }],
      raceEvents: [
        { id: 'lisboa', date: outroDia, name: 'Meia de Lisboa', status: 'agendada' },
        { id: 'porto', date: sunday, name: 'Maratona do Porto', status: 'agendada' },
      ],
    });
    expect(screen.getByTestId('plano-screen')).toHaveTextContent('Maratona do Porto');
    expect(screen.getByTestId('plano-screen')).not.toHaveTextContent('Meia de Lisboa');
  });

  it('um plano sem prova não ganha a prova de ninguém', () => {
    setup({ raceEvents: [{ id: 'r1', date: sunday, name: 'Trail do Sicó', status: 'agendada' }] });
    expect(screen.getByTestId('plano-screen')).not.toHaveTextContent('Trail do Sicó');
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

  /* Um dia sem NENHUMA linha não é descanso a sério — a Carol não escreve
     linhas para dias sem nada a dizer, e a lista fabrica-os. Mas também não
     é "Sem plano" (pedido 2026-09-26): depois do último dia que o plano de
     uma prova já decidiu, está "Por planear", e é aí que ela convida. */
  it('depois do último dia escrito, os dias estão "Por planear" e o convite fica no primeiro', () => {
    // Plano para uma prova (escreve-se por tranches), com treino só hoje.
    const amanha = addDaysISO(today, 1);
    const depois = addDaysISO(today, 2);
    const curto = { id: 'p1', status: 'aceite', race_id: 'r1', period_start: today, period_end: depois };
    setup({ coachPlans: [curto], coachPlanItems: [hoje] });
    abrirSemanaDe(amanha);
    abrirSemanaDe(depois);

    expect(screen.getByTestId(`plano-dia-${amanha}`)).toHaveTextContent('Por planear');
    expect(screen.getByTestId(`plano-dia-${depois}`)).toHaveTextContent('Por planear');
    expect(screen.getByTestId('plano-screen')).not.toHaveTextContent('Sem plano');

    // O convite aparece só no primeiro dia do bloco vazio, não em todos, e
    // no plural só quando são vários.
    expect(screen.getByTestId(`plano-pedir-${amanha}`)).toHaveTextContent('Vamos planear estes dias');
    expect(screen.queryByTestId(`plano-pedir-${depois}`)).not.toBeInTheDocument();

    // O pedido entra no chat como dele, com os dias (o `say`): ela propõe o
    // plano desses dias, e não abre a falar de um desvio que a app não
    // detetou (revisão de 2026-09-26 — era o canal plan_divergence).
    fireEvent.click(screen.getByTestId(`plano-pedir-${amanha}`));
    expect(setCoachIntent).toHaveBeenCalledTimes(1);
    const intent = setCoachIntent.mock.calls[0][0];
    expect(intent.kind).toBe('say');
    expect(intent.divergence).toBeUndefined();
    expect(intent.text).toMatch(/^Vamos planear os dias de \d{1,2} de [a-zç]+ a \d{1,2} de [a-zç]+\.$/);
    expect(setActiveTab).toHaveBeenCalledWith('coach');
  });

  it('o convite fala com a voz dela: sem exclamação, sem "talvez", sem se nomear', () => {
    [1, 2, 7].forEach((n) => expectCarolVoice(convitePlanear(n)));
    expect(convitePlanear(1)).toBe('Vamos planear este dia');
    expect(convitePlanear(3)).toBe('Vamos planear estes dias');
  });

  // O que entra no chat, como dele, quando toca no convite (revisão de 2026-09-26).
  it('o pedido que entra no chat diz os dias por extenso, no singular e no plural', () => {
    expect(pedidoPlanear('2026-09-30', '2026-09-30')).toBe('Vamos planear o dia 30 de setembro.');
    expect(pedidoPlanear('2026-09-30')).toBe('Vamos planear o dia 30 de setembro.');
    expect(pedidoPlanear('2026-09-30', '2026-10-17')).toBe('Vamos planear os dias de 30 de setembro a 17 de outubro.');
  });

  it('um só dia por planear: o convite no singular', () => {
    const amanha = addDaysISO(today, 1);
    const curto = { id: 'p1', status: 'aceite', race_id: 'r1', period_start: today, period_end: amanha };
    setup({ coachPlans: [curto], coachPlanItems: [hoje] });
    abrirSemanaDe(amanha);
    expect(screen.getByTestId(`plano-pedir-${amanha}`)).toHaveTextContent('Vamos planear este dia');
    fireEvent.click(screen.getByTestId(`plano-pedir-${amanha}`));
    expect(setCoachIntent.mock.calls[0][0]).toEqual({ kind: 'say', text: expect.stringMatching(/^Vamos planear o dia \d{1,2} de [a-zç]+\.$/) });
  });

  /* A quarta deixada livre de propósito a meio do plano: ela não se oferece
     para planear um dia que deixou vazio (pedido 2026-09-26). */
  it('um dia livre a meio do plano diz "Sem treino", sem convite', () => {
    const amanha = addDaysISO(today, 1);
    const depois = addDaysISO(today, 2);
    const plano3 = { id: 'p1', status: 'aceite', race_id: 'r1', period_start: today, period_end: depois };
    const longo = { id: 'i7', plan_id: 'p1', planned_date: depois, kind: 'corrida', training_type: 'longo', target_distance_km: 14, status: 'pendente' };
    setup({ coachPlans: [plano3], coachPlanItems: [hoje, longo] });
    abrirSemanaDe(amanha);
    expect(screen.getByTestId(`plano-dia-${amanha}`)).toHaveTextContent('Sem treino');
    expect(screen.queryByTestId(`plano-pedir-${amanha}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('plano-screen')).not.toHaveTextContent('Por planear');
  });

  it('um plano sem prova escreve-se inteiro: os dias vazios do fim não são convite', () => {
    const amanha = addDaysISO(today, 1);
    const curto = { id: 'p1', status: 'aceite', period_start: today, period_end: amanha };
    setup({ coachPlans: [curto], coachPlanItems: [hoje] });
    abrirSemanaDe(amanha);
    expect(screen.getByTestId(`plano-dia-${amanha}`)).toHaveTextContent('Sem treino');
    expect(screen.queryByTestId(`plano-pedir-${amanha}`)).not.toBeInTheDocument();
  });

  /* Um bloco novo aceite a meio do antigo (planAcceptance.js): o antigo fecha
     na véspera e os treinos dele dali em diante ficam cancelados. O dia
     juntava o velho ao novo e contava-os aos dois (pedido 2026-09-26). */
  it('bloco novo a meio do antigo: o dia mostra só o treino do novo, e as contas também', () => {
    const ontem = addDaysISO(today, -1);
    const antigo = { id: 'old', status: 'aceite', period_start: addDaysISO(today, -6), period_end: ontem };
    const novo = { id: 'new', status: 'aceite', race_id: 'r1', period_start: today, period_end: addDaysISO(today, 6) };
    const velhoHoje = { id: 'o1', plan_id: 'old', planned_date: today, kind: 'corrida', training_type: 'intervalos', target_distance_km: 8, status: 'cancelado', notes: 'Séries do bloco antigo.' };
    const novoHoje = { id: 'n1', plan_id: 'new', planned_date: today, kind: 'corrida', training_type: 'longo', target_distance_km: 12, status: 'concluido' };
    setup({ coachPlans: [antigo, novo], coachPlanItems: [velhoHoje, novoHoje] });
    const dia = screen.getByTestId(`plano-dia-${today}`);
    expect(dia).toHaveTextContent('Rodagem longa · 12 km');
    expect(dia).not.toHaveTextContent('Intervalos');
    expect(dia).not.toHaveTextContent('Séries do bloco antigo.');
    expect(dia).not.toHaveTextContent('Cancelado');
    expect(screen.getByTestId(`plano-semana-${weekStartOf(today)}`)).not.toHaveTextContent('/2 feitos');
    expect(screen.getByTestId('plano-sessoes')).toHaveTextContent('1/1');
  });

  it('o treino feito que passou para o bloco novo fecha o dia, mesmo com o redundante cancelado ao lado', () => {
    const feitoHoje = { id: 'f1', plan_id: 'p1', planned_date: outroDia, kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'concluido' };
    const redundante = { id: 'f2', plan_id: 'p1', planned_date: outroDia, kind: 'corrida', training_type: 'continuo', target_distance_km: 10, status: 'cancelado' };
    setup({ coachPlanItems: [feitoHoje, redundante, hoje] });
    const dia = screen.getByTestId(`plano-dia-${outroDia}`);
    expect(dia).toHaveTextContent('Corrida contínua · 8 km');
    expect(dia).not.toHaveTextContent('10 km');
    expect(dia).toHaveTextContent('Feito');
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

  /* ── Os dois lados da meia-noite de Lisboa (pedido 2026-09-26) ────────────
     O ecrã conta os dias pelo relógio do telemóvel (todayISO); num telemóvel
     em Lisboa, é a hora de Lisboa — setembro, UTC+1. Às 23:59 de sábado o
     sábado ainda está por planear; às 00:01 já passou, e o convite passa
     para domingo. Um relógio em UTC diria sábado nas duas. */
  describe('à meia-noite de Lisboa', () => {
    let tzAntes;
    beforeAll(() => { tzAntes = process.env.TZ; process.env.TZ = 'Europe/Lisbon'; });
    afterAll(() => { process.env.TZ = tzAntes; });
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
    afterEach(() => { vi.useRealTimers(); });

    // Plano para uma prova a 11 out, escrito até sexta, 25 set.
    const maratona = { id: 'm', status: 'aceite', race_id: 'porto', period_start: '2026-09-21', period_end: '2026-10-11' };
    const sexta = { id: 's', plan_id: 'm', planned_date: '2026-09-25', kind: 'corrida', training_type: 'continuo', target_distance_km: 8, status: 'concluido' };
    const abrir = (instante) => {
      vi.setSystemTime(new Date(instante));
      return setup({ coachPlans: [maratona], coachPlanItems: [sexta], raceEvents: [{ id: 'porto', date: '2026-10-11', name: 'Maratona do Porto', status: 'agendada' }] });
    };

    it('às 23:59 de sábado, sábado está por planear e o convite está nele', () => {
      abrir('2026-09-26T22:59:00Z');
      const sabado = screen.getByTestId('plano-dia-2026-09-26');
      expect(sabado).toHaveTextContent('Por planear');
      expect(sabado).toHaveTextContent('Hoje');
      expect(screen.getByTestId('plano-pedir-2026-09-26')).toHaveTextContent('Vamos planear estes dias');
      // O que entra no chat quando ele toca: o pedido dele, com os dias.
      fireEvent.click(screen.getByTestId('plano-pedir-2026-09-26'));
      expect(setCoachIntent).toHaveBeenCalledWith({ kind: 'say', text: 'Vamos planear os dias de 26 de setembro a 11 de outubro.' });
    });

    it('às 00:01 de domingo, sábado já passou: "Sem treino", e o convite passa para domingo', () => {
      abrir('2026-09-26T23:01:00Z');
      const sabado = screen.getByTestId('plano-dia-2026-09-26');
      expect(sabado).toHaveTextContent('Sem treino');
      expect(sabado).not.toHaveTextContent('Por planear');
      expect(screen.queryByTestId('plano-pedir-2026-09-26')).not.toBeInTheDocument();
      expect(screen.getByTestId('plano-dia-2026-09-27')).toHaveTextContent('Hoje');
      expect(screen.getByTestId('plano-pedir-2026-09-27')).toBeInTheDocument();
      // E o pedido começa em domingo: sábado já não se planeia.
      fireEvent.click(screen.getByTestId('plano-pedir-2026-09-27'));
      expect(setCoachIntent).toHaveBeenCalledWith({ kind: 'say', text: 'Vamos planear os dias de 27 de setembro a 11 de outubro.' });
    });

    /* Dias seguidos, ao meio-dia de Lisboa: o convite está sempre no dia de
       hoje, nenhum dia que já passou fica "por planear", e o cabeçalho diz
       sempre a prova do plano. */
    it('dia a dia, o convite acompanha o hoje', () => {
      ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'].forEach((hojeLx) => {
        abrir(`${hojeLx}T12:00:00+01:00`);
        abrirSemanaDe(hojeLx);
        expect(screen.getByTestId(`plano-dia-${hojeLx}`)).toHaveTextContent('Por planear');
        expect(screen.getAllByTestId(/^plano-pedir-/).map((b) => b.dataset.testid)).toEqual([`plano-pedir-${hojeLx}`]);
        screen.getAllByTestId(/^plano-dia-/).forEach((linha) => {
          const iso = linha.dataset.testid.slice('plano-dia-'.length);
          if (iso < hojeLx) expect(linha).not.toHaveTextContent('Por planear');
        });
        expect(screen.getByTestId('plano-screen')).toHaveTextContent('Maratona do Porto');
        cleanup();
      });
    });

    /* A tranche seguinte já escrita e por decidir no chat (revisão de
       2026-09-26): é o estado normal de um plano de prova entre a proposta e
       o aceite. O convite pedia-lhe que planeasse o que ela tinha acabado de
       planear, e o motivo que seguia fazia-a escrever outra proposta por cima.
       Aponta para a que lá está — dia a dia, e dos dois lados da meia-noite. */
    it('com a tranche seguinte por decidir no chat, o convite aponta para a proposta', () => {
      const proposta = { id: 'pp', status: 'proposto', race_id: 'porto', supersedes_plan_id: 'm', period_start: '2026-09-26', period_end: '2026-10-11' };
      const longo = { id: 'pl', plan_id: 'pp', planned_date: '2026-09-27', kind: 'corrida', training_type: 'longo', target_distance_km: 16, status: 'pendente' };
      [
        ['2026-09-26T22:59:00Z', '2026-09-26'], // 23:59 de sábado em Lisboa
        ['2026-09-26T23:01:00Z', '2026-09-27'], // 00:01 de domingo
        ['2026-09-28T12:00:00+01:00', '2026-09-28'],
        ['2026-09-29T12:00:00+01:00', '2026-09-29'],
        ['2026-09-30T12:00:00+01:00', '2026-09-30'],
      ].forEach(([instante, hojeLx]) => {
        vi.setSystemTime(new Date(instante));
        setup({ coachPlans: [maratona, proposta], coachPlanItems: [sexta, longo] });
        abrirSemanaDe(hojeLx);
        expect(screen.getByTestId(`plano-dia-${hojeLx}`)).toHaveTextContent('Por planear');
        expect(screen.queryAllByTestId(/^plano-pedir-/)).toHaveLength(0);
        expect(screen.getAllByTestId(/^plano-proposta-/).map((b) => b.dataset.testid)).toEqual([`plano-proposta-${hojeLx}`]);
        const link = screen.getByTestId(`plano-proposta-${hojeLx}`);
        expect(link).toHaveTextContent('A proposta está no chat');
        expectCarolVoice(link.textContent);
        // Leva ao chat, onde a proposta está, sem lhe pedir outro plano.
        fireEvent.click(link);
        expect(setCoachIntent).not.toHaveBeenCalled();
        expect(setActiveTab).toHaveBeenCalledWith('coach');
        cleanup();
      });
    });

    /* O último dia escrito conta-se pelo plano que cobre o dia (revisão de
       2026-09-26): um plano aceite mais à frente, noutro bloco, fazia a conta
       de todos juntos passar para lá da prova, e o convite desaparecia. */
    it('um plano aceite mais à frente, noutro bloco, não apaga o convite', () => {
      const recuperacao = { id: 'rec', status: 'aceite', race_id: null, period_start: '2026-10-19', period_end: '2026-10-25' };
      const rodagem = { id: 'rr', plan_id: 'rec', planned_date: '2026-10-20', kind: 'corrida', training_type: 'regenerativo', target_distance_km: 6, status: 'pendente' };
      vi.setSystemTime(new Date('2026-09-26T12:00:00+01:00'));
      setup({ coachPlans: [maratona, recuperacao], coachPlanItems: [sexta, rodagem] });
      expect(screen.getByTestId('plano-dia-2026-09-26')).toHaveTextContent('Por planear');
      expect(screen.getByTestId('plano-pedir-2026-09-26')).toHaveTextContent('Vamos planear estes dias');
    });
  });

  // As sugestões só de refeições não planeiam treino nenhum: não tiram o convite.
  it('só uma proposta de treino que toque nos dias conta como "a proposta está no chat"', () => {
    const proposta = { id: 'pp', status: 'proposto', period_start: '2026-09-26', period_end: '2026-10-11' };
    const longo = { id: 'a', plan_id: 'pp', planned_date: '2026-09-27', kind: 'corrida', training_type: 'longo', status: 'pendente' };
    const jantar = { id: 'b', plan_id: 'pp', planned_date: '2026-09-27', kind: 'descanso', categories: ['so-refeicoes'], meal_suggestion: 'Jantar: arroz.', status: 'pendente' };
    expect(propostaNoChat([proposta], [longo, jantar], '2026-09-30', '2026-10-10')).toBe(true);
    expect(propostaNoChat([proposta], [jantar], '2026-09-30', '2026-10-10')).toBe(false);
    // Sem os itens carregados, na dúvida, conta.
    expect(propostaNoChat([proposta], [], '2026-09-30', '2026-10-10')).toBe(true);
    // Fora dos dias do bloco, ou já decidida, não conta.
    expect(propostaNoChat([proposta], [longo], '2026-10-12', '2026-10-17')).toBe(false);
    expect(propostaNoChat([{ ...proposta, status: 'recusado' }], [longo], '2026-09-30', '2026-10-10')).toBe(false);
    expect(propostaNoChat([{ ...proposta, status: 'aceite' }], [longo], '2026-09-30', '2026-10-10')).toBe(false);
  });

  it('sem plano aceite não há lista nenhuma — há o convite a pedir um', () => {
    setup({ coachPlans: [], coachPlanItems: [] });
    expect(screen.getByText('Sem plano acordado')).toBeInTheDocument();
    expect(screen.queryByTestId('plano-adaptar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Pedir um plano'));
    expect(setActiveTab).toHaveBeenCalledWith('coach');
    expect(setCoachIntent).not.toHaveBeenCalled();
  });

  // Pedido 2026-09-26: com uma proposta por decidir, ela não pede outra.
  it('com uma proposta por decidir, aponta para ela em vez de pedir outro plano', () => {
    setup({ coachPlans: [{ id: 'px', status: 'proposto', period_start: '2026-09-28', period_end: '2026-10-04' }], coachPlanItems: [] });
    expect(screen.getByText('A proposta está no chat')).toBeInTheDocument();
    expect(screen.queryByText('Pedir um plano')).not.toBeInTheDocument();
    expect(screen.getByTestId('plano-screen')).not.toHaveTextContent('à Carol');
  });
});
