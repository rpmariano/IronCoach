import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import CupTrofeuScreen from './CupTrofeuScreen';
import { buildCupView } from '../../utils/useCup';
import { CUP_STATUS_ICONS, promotionPreview } from '../../utils/cupCalendar';
import * as F from '@formulas/cup.fixtures.ts';

/* O ecrã do Troféu (specs/trofeu.md §4.3). A vista vem de buildCupView (a
   mesma função pura do hook, ver useCup.test.jsx) sobre as fixtures da 34.ª
   — assim o ecrã é testado com a forma real dos dados, não uma imitação.
   Fase 1 (2026-09-26): a lista pré-marcada, "Confirmar", "Gerir inscrição".
   Fase 3 (2026-09-27): o calendário (estado em texto e ícone, frase por
   linha, alvos de 56/44 px), a classificação (só a linha dele e o total do
   clube dele), a folha da jornada (decisão, papel, prazo, promover). */

const TODAY = '2027-01-11';
const EDITION_ID = F.CASCAIS_34_ABERTA.id;
const REAL = useAppStore.getState();

// O perfil da persona de Cascais: na J3 (24/01/2027) tem 44 anos — M35,
// percurso longo (7,4 km às 9h30).
const PROFILE = { ...F.PERSONAS.cascais, id: 'u1', experience_level: 'medio' };
const part = (roundId, decision, extra = {}) => ({ id: `p-${roundId}`, enrollment_id: 'enr-1', round_id: roundId, decision, decision_source: 'atleta', ...extra });
const X2 = { id: 'x2', name: 'Corta-mato do NAZA', date: '2027-01-10', distance_km: 8, race_type: 'estrada', race_priority: 'b', status: 'agendada', cup_round_id: 'r-c2' };
const X3 = { id: 'x3', name: 'Corrida CCD Cascais', date: '2027-01-24', distance_km: 7.4, race_type: 'estrada', race_priority: 'b', status: 'agendada', cup_round_id: 'r-c3' };

function makeView({
  seasonGoal = 'premio', participations = [], isFederated = false, today = TODAY, races = [], runs = [],
  results = null, enrollment = {}, edition = {}, rounds = F.CASCAIS_ROUNDS,
} = {}) {
  const cup = {
    status: 'ready',
    userId: 'u1',
    editions: [{ ...F.CASCAIS_34_ABERTA, ...edition, competition: F.CASCAIS_COMPETITION }],
    enrollments: [{
      id: 'enr-1', user_id: 'u1', edition_id: EDITION_ID, team_id: 't-ccd', team_other: null,
      is_federated: isFederated, season_goal: seasonGoal, bib: '42', status: 'ativa', notify_calendar: false,
      ...enrollment,
    }],
    dismissals: [],
    catalog: {
      [EDITION_ID]: {
        status: 'ready', rounds, courses: F.CASCAIS_COURSES,
        overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS,
      },
    },
    participations,
    results: results || { status: 'idle', enrollmentId: null, rows: [], teamRows: [] },
  };
  return buildCupView({ cup, profile: PROFILE, raceEvents: races, runs, today });
}

const montar = (view, onClose = () => {}, props = {}) => render(
  <ToastProvider><CupTrofeuScreen view={view} onClose={onClose} {...props} /></ToastProvider>,
);

describe('CupTrofeuScreen', () => {
  let setCupParticipations;
  let setCupParticipation;
  let updateEnrollment;
  let leaveCup;
  let registerCupRound;
  let markCupRoundNotAttended;
  let setCupRoundIntent;
  let markCupEntryDone;
  let setCupRoundPriority;
  let openRaceRun;
  let setEditingRaceId;

  beforeEach(() => {
    setCupParticipations = vi.fn().mockResolvedValue({ ok: true, results: [] });
    setCupParticipation = vi.fn().mockResolvedValue({ ok: true, data: {}, collided: false });
    updateEnrollment = vi.fn().mockResolvedValue({ ok: true, data: {} });
    leaveCup = vi.fn().mockResolvedValue({ ok: true, data: {} });
    registerCupRound = vi.fn().mockResolvedValue({ ok: true, data: { raceId: 'x2' } });
    markCupRoundNotAttended = vi.fn().mockResolvedValue({ ok: true, data: {} });
    setCupRoundIntent = vi.fn().mockResolvedValue({ ok: true, data: {} });
    markCupEntryDone = vi.fn().mockResolvedValue({ ok: true, data: {} });
    setCupRoundPriority = vi.fn().mockResolvedValue({ ok: true, data: {} });
    openRaceRun = vi.fn();
    setEditingRaceId = vi.fn();
    useAppStore.setState({
      setCupParticipations, setCupParticipation, updateEnrollment, leaveCup, registerCupRound, markCupRoundNotAttended,
      setCupRoundIntent, markCupEntryDone, setCupRoundPriority, openRaceRun, setEditingRaceId,
      profile: PROFILE, raceEvents: [], runs: [], coachPlans: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAppStore.setState({
      setCupParticipations: REAL.setCupParticipations, setCupParticipation: REAL.setCupParticipation,
      updateEnrollment: REAL.updateEnrollment, leaveCup: REAL.leaveCup, registerCupRound: REAL.registerCupRound,
      markCupRoundNotAttended: REAL.markCupRoundNotAttended, setCupRoundIntent: REAL.setCupRoundIntent,
      markCupEntryDone: REAL.markCupEntryDone, setCupRoundPriority: REAL.setCupRoundPriority,
      openRaceRun: REAL.openRaceRun, setEditingRaceId: REAL.setEditingRaceId,
      profile: null, raceEvents: [], runs: [], coachPlans: [],
    });
  });

  it('mostra o cabeçalho e o contador com objetivo prémio', () => {
    montar(makeView({ seasonGoal: 'premio' }));
    expect(screen.getByTestId('cup-trofeu-cabecalho')).toHaveTextContent('CCD Cascais');
    expect(screen.getByTestId('cup-trofeu-contador')).toHaveTextContent('a confirmar');
  });

  it('sem objetivo prémio, não mostra o contador', () => {
    montar(makeView({ seasonGoal: 'participar' }));
    expect(screen.queryByTestId('cup-trofeu-contador')).not.toBeInTheDocument();
  });

  /* ── A lista pré-marcada (modo "decidir", Fase 1) ──────────────────── */

  it('jornadas com data têm as três opções; canceladas e por anunciar não', () => {
    montar(makeView());
    expect(screen.getByTestId('cup-trofeu-screen').getAttribute('data-modo')).toBe('decidir');
    expect(screen.getByTestId('cup-jornada-r-c3-vou')).toBeInTheDocument();
    expect(screen.getByTestId('cup-jornada-r-c3-nao_vou')).toBeInTheDocument();
    expect(screen.getByTestId('cup-jornada-r-c3-nao_sei')).toBeInTheDocument();

    expect(screen.getByTestId('cup-jornada-r-c6')).toHaveTextContent('Cancelada');
    expect(screen.queryByTestId('cup-jornada-r-c6-vou')).not.toBeInTheDocument();

    expect(screen.getByTestId('cup-jornada-r-c5')).toHaveTextContent('Data a anunciar');
    expect(screen.queryByTestId('cup-jornada-r-c5-vou')).not.toBeInTheDocument();

    // Já passou (10/01, hoje 11/01): sem "Vou" depois do dia — criava uma
    // prova agendada no passado (revisão pré-deploy da Fase 1).
    expect(screen.getByTestId('cup-jornada-r-c2')).toHaveTextContent('(já passou)');
    expect(screen.queryByTestId('cup-jornada-r-c2-vou')).not.toBeInTheDocument();
  });

  it('Confirmar grava as jornadas pendentes, uma vez cada, com decision_source atleta', async () => {
    montar(makeView({ seasonGoal: 'premio' }));
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    await waitFor(() => expect(setCupParticipations).toHaveBeenCalledTimes(1));
    const items = setCupParticipations.mock.calls[0][0];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.patch.decision_source === 'atleta')).toBe(true);
    expect(new Set(items.map((i) => i.roundId)).size).toBe(items.length);
  });

  it('"Decidir depois" esconde a barra sem gravar nada — e passa ao calendário', () => {
    montar(makeView({ seasonGoal: 'premio' }));
    fireEvent.click(screen.getByTestId('cup-decidir-depois'));
    expect(screen.queryByTestId('cup-confirmar')).not.toBeInTheDocument();
    expect(setCupParticipations).not.toHaveBeenCalled();
    expect(screen.getByTestId('cup-trofeu-screen').getAttribute('data-modo')).toBe('calendario');
    expect(screen.getByTestId('cup-calendario')).toBeInTheDocument();
  });

  it('mudar a decisão manualmente muda o que "Confirmar" vai gravar', async () => {
    montar(makeView({ seasonGoal: 'participar' }), () => {}, { initialMode: 'decidir' }); // sem prémio, nada pré-marcado
    expect(screen.queryByTestId('cup-confirmar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cup-jornada-r-c3-nao_vou'));
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    await waitFor(() => expect(setCupParticipations).toHaveBeenCalledTimes(1));
    const items = setCupParticipations.mock.calls[0][0];
    expect(items).toEqual([{ roundId: 'r-c3', patch: { decision: 'nao_vou', decision_source: 'atleta' } }]);
  });

  /* Revisão da Fase 1 (2026-09-26): o "Confirmar" lê o resultado de cada
     jornada — colisões com uma principal e erros parciais. */
  it('um "Vou" que volta por decidir (colisão com uma principal) é dito, não dá "Jornadas confirmadas."', async () => {
    setCupParticipations.mockResolvedValue({ ok: true, results: [{ roundId: 'r-c3', ok: true, collided: true }] });
    montar(makeView({ seasonGoal: 'participar' }), () => {}, { initialMode: 'decidir' });
    fireEvent.click(screen.getByTestId('cup-jornada-r-c3-vou'));
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    expect(await screen.findByText('1 jornada ficou por decidir: é o dia de uma prova principal.')).toBeInTheDocument();
    expect(screen.queryByText('Jornadas confirmadas.')).not.toBeInTheDocument();
  });

  it('num erro parcial, as escolhas das jornadas que falharam ficam no rascunho', async () => {
    setCupParticipations.mockResolvedValue({
      ok: false,
      results: [{ roundId: 'r-c3', ok: true, collided: false }, { roundId: 'r-c4', ok: false, error: { message: 'x' } }],
    });
    montar(makeView({ seasonGoal: 'participar' }), () => {}, { initialMode: 'decidir' });
    fireEvent.click(screen.getByTestId('cup-jornada-r-c3-vou'));
    fireEvent.click(screen.getByTestId('cup-jornada-r-c4-nao_vou'));
    expect(screen.getByTestId('cup-confirmar')).toHaveTextContent('1 vou, 1 não vou');
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    expect(await screen.findByText(/Uma jornada não gravou/)).toBeInTheDocument();
    // A que falhou continua escolhida e pendente; a que gravou saiu do rascunho.
    expect(screen.getByTestId('cup-jornada-r-c4-nao_vou').querySelector('input')).toBeChecked();
    expect(screen.getByTestId('cup-confirmar')).toHaveTextContent('0 vou, 1 não vou');
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    await waitFor(() => expect(setCupParticipations).toHaveBeenCalledTimes(2));
    expect(setCupParticipations.mock.calls[1][0]).toEqual([{ roundId: 'r-c4', patch: { decision: 'nao_vou', decision_source: 'atleta' } }]);
  });

  it('um "Confirmar" que não deixa nada pendente passa ao calendário', async () => {
    setCupParticipations.mockResolvedValue({ ok: true, results: [{ roundId: 'r-c3', ok: true, collided: false }] });
    montar(makeView({ seasonGoal: 'participar' }), () => {}, { initialMode: 'decidir' });
    fireEvent.click(screen.getByTestId('cup-jornada-r-c3-vou'));
    fireEvent.click(screen.getByTestId('cup-confirmar'));
    expect(await screen.findByText('Jornadas confirmadas.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('cup-trofeu-screen').getAttribute('data-modo')).toBe('calendario'));
  });

  it('Gerir inscrição — um federado também pode dizer que o clube não está na lista, nunca Individual', () => {
    montar(makeView({ isFederated: true }));
    fireEvent.click(screen.getByTestId('cup-abrir-gerir'));
    expect(screen.getByTestId('cup-gerir-clube-outro')).toBeInTheDocument();
    expect(document.getElementById('gerir-clube-t-ind')).toBeNull();
    expect(document.getElementById('gerir-clube-t-ccd')).not.toBeNull();
  });

  it('Gerir inscrição — sair pede confirmação antes de chamar leaveCup, e fecha o ecrã', async () => {
    const onClose = vi.fn();
    montar(makeView(), onClose);
    fireEvent.click(screen.getByTestId('cup-abrir-gerir'));
    fireEvent.click(screen.getByTestId('cup-gerir-sair'));
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(leaveCup).toHaveBeenCalledWith('enr-1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  /* ── Fase 3: os modos ──────────────────────────────────────────────── */

  describe('os modos', () => {
    it('sem nada por confirmar abre no calendário; com "Decidir agora" vai à lista e "Ver o calendário" volta', () => {
      // 'participar' não pré-marca nada; r-c3 e r-c4 ficam por decidir.
      montar(makeView({ seasonGoal: 'participar' }));
      expect(screen.getByTestId('cup-trofeu-screen').getAttribute('data-modo')).toBe('calendario');
      expect(screen.getByTestId('cup-trofeu-por-decidir')).toHaveTextContent('Tens 2 jornadas por decidir.');
      fireEvent.click(screen.getByTestId('cup-decidir-agora'));
      expect(screen.getByTestId('cup-trofeu-screen').getAttribute('data-modo')).toBe('decidir');
      expect(screen.getByTestId('cup-jornada-r-c3-vou')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('cup-ver-calendario'));
      expect(screen.getByTestId('cup-trofeu-screen').getAttribute('data-modo')).toBe('calendario');
    });

    it('o modo pedido manda: "calendario" mesmo com jornadas pré-marcadas', () => {
      montar(makeView({ seasonGoal: 'premio' }), () => {}, { initialMode: 'calendario' });
      expect(screen.getByTestId('cup-trofeu-screen').getAttribute('data-modo')).toBe('calendario');
      expect(screen.queryByTestId('cup-confirmar')).not.toBeInTheDocument();
    });

    it('sem nada por decidir não há o bloco "por decidir"', () => {
      montar(makeView({ seasonGoal: 'participar', participations: [part('r-c3', 'vou'), part('r-c4', 'nao_vou')] }));
      expect(screen.queryByTestId('cup-trofeu-por-decidir')).not.toBeInTheDocument();
    });

    it('com focusRoundId abre logo a folha dessa jornada', () => {
      montar(makeView({ seasonGoal: 'participar' }), () => {}, { focusRoundId: 'r-c4' });
      const folha = screen.getByTestId('cup-jornada-sheet');
      expect(folha).toHaveTextContent('GP Monte Real');
      expect(folha).toHaveTextContent('Jornada 4');
    });
  });

  /* ── Fase 3: o calendário (§4.3) ───────────────────────────────────── */

  describe('o calendário', () => {
    const view = () => makeView({ seasonGoal: 'participar', participations: [part('r-c3', 'vou'), part('r-c4', 'nao_vou')] });

    it('cada jornada: o estado em texto e num dos quatro ícones, e uma frase por linha para o leitor de ecrã', () => {
      const v = view();
      montar(v);
      for (const r of v.rounds) {
        const row = screen.getByTestId(`cup-cal-${r.id}`);
        // O botão da linha tem a frase inteira (e é por ela que se encontra).
        const btn = screen.getByRole('button', { name: r.status.ariaLabel });
        expect(row.contains(btn)).toBe(true);
        expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(56);
        // Nunca só cor: o texto do estado está lá, e o ícone é um dos quatro.
        expect(within(row).getByText(r.status.label)).toBeInTheDocument();
        expect(CUP_STATUS_ICONS).toContain(r.status.icon);
        const icon = within(row).getAllByText(r.status.icon)[0];
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      }
      expect(screen.getByTestId('cup-cal-r-c3').getAttribute('data-status')).toBe('proxima');
      expect(screen.getByTestId('cup-cal-r-c3')).toHaveTextContent('Próxima · Vou');
      expect(screen.getByTestId('cup-cal-r-c4')).toHaveTextContent('Não vou');
      expect(screen.getByTestId('cup-cal-r-c6')).toHaveTextContent('Cancelada');
      expect(screen.getByTestId('cup-cal-r-c1')).toHaveTextContent('Data por confirmar');
      expect(screen.getByTestId('cup-cal-r-c2')).toHaveTextContent('Já passou');
    });

    it('"Não fui" e "Registar" só nas que já passaram — nenhuma futura os tem', () => {
      montar(view());
      const naoFui = document.querySelectorAll('[data-testid^="cup-cal-"][data-testid$="-nao-fui"]');
      expect([...naoFui].map((b) => b.getAttribute('data-testid'))).toEqual(['cup-cal-r-c2-nao-fui']);
      const registar = document.querySelectorAll('[data-testid^="cup-cal-"][data-testid$="-registar"]');
      expect([...registar].map((b) => b.getAttribute('data-testid'))).toEqual(['cup-cal-r-c2-registar']);
      // Alvos de 44 px, e fora do botão da linha (nunca botão dentro de botão).
      const btn = screen.getByTestId('cup-cal-r-c2-nao-fui');
      expect(parseInt(btn.style.minHeight, 10)).toBe(44);
      // Fora da linha, cada botão diz de que jornada é.
      expect(btn.getAttribute('aria-label')).toBe('Não fui à jornada 2, Corta-mato do NAZA');
      expect(screen.getByTestId('cup-cal-r-c2-registar').getAttribute('aria-label')).toBe('Registar a jornada 2, Corta-mato do NAZA');
      expect(btn.closest('[data-testid="cup-cal-r-c2-abrir"]')).toBeNull();
    });

    it('com a prova no calendário e sem corrida: "Por registar", com as duas ações', () => {
      montar(makeView({ seasonGoal: 'participar', races: [X2], runs: [] }));
      expect(screen.getByTestId('cup-cal-r-c2').getAttribute('data-status')).toBe('por_registar');
      expect(screen.getByTestId('cup-cal-r-c2')).toHaveTextContent('Por registar');
      expect(screen.getByTestId('cup-cal-r-c2-registar')).toBeInTheDocument();
      expect(screen.getByTestId('cup-cal-r-c2-nao-fui')).toBeInTheDocument();
    });

    it('"Registar" → registerCupRound, fecha o ecrã e abre o registo na prova', async () => {
      const onClose = vi.fn();
      montar(view(), onClose);
      fireEvent.click(screen.getByTestId('cup-cal-r-c2-registar'));
      await waitFor(() => expect(openRaceRun).toHaveBeenCalledWith('x2'));
      expect(registerCupRound).toHaveBeenCalledWith('r-c2');
      expect(onClose).toHaveBeenCalled();
    });

    it('"Registar" sem prova possível: a mensagem do servidor, e o ecrã fica', async () => {
      registerCupRound.mockResolvedValue({ ok: false, error: { code: 'sem_prova', message: 'Não consegui criar a prova desta jornada.' } });
      const onClose = vi.fn();
      montar(view(), onClose);
      fireEvent.click(screen.getByTestId('cup-cal-r-c2-registar'));
      expect(await screen.findByText('Não consegui criar a prova desta jornada.')).toBeInTheDocument();
      expect(openRaceRun).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('"Não fui" pede confirmação e só depois grava, uma vez', async () => {
      montar(view());
      fireEvent.click(screen.getByTestId('cup-cal-r-c2-nao-fui'));
      const dialog = screen.getByTestId('cup-nao-fui-dialog');
      expect(dialog).toHaveTextContent('Não foste à jornada 2?');
      expect(markCupRoundNotAttended).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('cup-nao-fui-confirmar'));
      await waitFor(() => expect(markCupRoundNotAttended).toHaveBeenCalledTimes(1));
      expect(markCupRoundNotAttended).toHaveBeenCalledWith('r-c2');
      expect(await screen.findByText('Ficou como «Não fui».')).toBeInTheDocument();
    });

    it('a mudança de data diz-se na linha ("mudou de 17 para 24 jan")', () => {
      const rounds = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3' ? { ...r, previous_date: '2027-01-17' } : r));
      montar(makeView({ seasonGoal: 'participar', rounds }));
      expect(screen.getByTestId('cup-cal-r-c3')).toHaveTextContent('mudou de 17 para 24 jan');
    });

    it('sem calendário publicado: diz-se, e "Avisa-me quando sair" liga só esse aviso', () => {
      montar(makeView({ seasonGoal: 'participar', rounds: [] }));
      expect(screen.getByTestId('cup-trofeu-sem-calendario')).toHaveTextContent('Ainda não saiu o calendário desta edição.');
      fireEvent.click(screen.getByLabelText('Avisa-me quando sair'));
      expect(updateEnrollment).toHaveBeenCalledWith('enr-1', { notify_calendar: true });
    });
  });

  /* ── Fase 3: o cabeçalho e o contador ──────────────────────────────── */

  describe('o cabeçalho e o contador', () => {
    it('clube, escalão, percurso da próxima jornada, objetivo, [Regulamento ↗] e [Gerir inscrição]', () => {
      montar(makeView({ seasonGoal: 'participar', edition: { regulation_url: 'https://example.org/reg' } }));
      const cab = screen.getByTestId('cup-trofeu-cabecalho');
      expect(cab).toHaveTextContent('CCD Cascais');
      expect(screen.getByTestId('cup-trofeu-escalao')).toHaveTextContent('Escalão M35 · Longo');
      expect(cab).toHaveTextContent('Objetivo: Só participar');
      const reg = screen.getByTestId('cup-trofeu-regulamento');
      expect(reg.getAttribute('href')).toBe('https://example.org/reg');
      expect(reg.getAttribute('target')).toBe('_blank');
      expect(reg.getAttribute('rel')).toBe('noopener noreferrer');
      expect(reg.getAttribute('aria-label')).toBe('Regulamento (abre o site oficial)');
      expect(screen.getByTestId('cup-abrir-gerir')).toHaveTextContent('Gerir inscrição');
      // O título é o nome da edição.
      expect(screen.getByTestId('cup-trofeu-screen')).toHaveTextContent('34.º Troféu de Atletismo de Cascais');
    });

    it('sem regulamento, não há o link', () => {
      montar(makeView({ seasonGoal: 'participar' }));
      expect(screen.queryByTestId('cup-trofeu-regulamento')).not.toBeInTheDocument();
    });

    it('"Já não dá para chegar ao mínimo." quando as que faltam já não chegam', () => {
      const v = makeView({ seasonGoal: 'premio', today: '2027-03-01' });
      expect(v.attendance.reachable).toBe(false);
      montar(v, () => {}, { initialMode: 'calendario' });
      expect(screen.getByTestId('cup-trofeu-inalcancavel')).toHaveTextContent('Já não dá para chegar ao mínimo.');
    });

    it('enquanto dá, não o diz', () => {
      const v = makeView({ seasonGoal: 'premio', today: '2026-12-01' });
      expect(v.attendance.reachable).toBe(true);
      montar(v);
      expect(screen.queryByTestId('cup-trofeu-inalcancavel')).not.toBeInTheDocument();
    });
  });

  /* ── Fase 3: a classificação (§4.3, §7) ────────────────────────────── */

  describe('a classificação', () => {
    const RESULTS = {
      status: 'ready',
      enrollmentId: 'enr-1',
      teamId: 't-ccd',
      rows: [{ round_id: 'r-c2', position: 120, category_code: 'M35', category_position: 29, points: 5, official_time_s: 2172, match_status: 'confirmada' }],
      teamRows: [{ round_id: 'r-c2', position: 6, points: 412 }],
    };
    const ROUNDS = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c2'
      ? { ...r, results_url: 'https://example.org/j2', team_results_url: 'https://example.org/j2-coletiva' }
      : r));
    const feita = (extra = {}) => makeView({
      seasonGoal: 'participar',
      rounds: ROUNDS,
      races: [{ ...X2, status: 'concluida' }],
      runs: [{ id: 'run2', race_id: 'x2', date: '2027-01-10', distance_km: 8, duration_seconds: 2200, details: { bib_number: '4321', age_group_position: 31 } }],
      results: RESULTS,
      edition: { standings_url: 'https://example.org/geral' },
      ...extra,
    });

    it('a linha dele e o total do clube dele, com os links oficiais', () => {
      montar(feita());
      const c = screen.getByTestId('cup-trofeu-classificacao');
      expect(screen.getByTestId('cup-classificacao-tua')).toHaveTextContent('A tua: 1 jornada com resultado oficial · 5 pontos');
      expect(screen.getByTestId('cup-classificacao-coletiva')).toHaveTextContent('Coletiva: CCD Cascais ficou em 6.º na J2 · 412 pontos');
      expect(c).toHaveTextContent('nunca nomes nem lugares de outros atletas');
      const links = [
        ['cup-classificacao-link-geral', 'https://example.org/geral', 'Classificação geral (abre o site oficial)'],
        ['cup-classificacao-link-jornada', 'https://example.org/j2', 'Resultados da J2 (abre o site oficial)'],
        ['cup-classificacao-link-coletiva', 'https://example.org/j2-coletiva', 'Coletiva da J2 (abre o site oficial)'],
      ];
      for (const [id, href, label] of links) {
        const a = screen.getByTestId(id);
        expect(a.getAttribute('href')).toBe(href);
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toBe('noopener noreferrer');
        expect(a.getAttribute('aria-label')).toBe(label);
        expect(parseInt(a.style.minHeight, 10)).toBe(44);
      }
      // O lugar da jornada vai na linha do calendário (o oficial manda).
      expect(screen.getByTestId('cup-cal-r-c2')).toHaveTextContent('Feita · 29.º M35');
    });

    it('sem resultados, sem coletiva e sem links, a secção some inteira', () => {
      montar(makeView({ seasonGoal: 'participar' }));
      expect(screen.queryByTestId('cup-trofeu-classificacao')).not.toBeInTheDocument();
    });

    it('só com a geral: diz que ainda não há resultados dele e deixa o link', () => {
      montar(makeView({ seasonGoal: 'participar', edition: { standings_url: 'https://example.org/geral' } }));
      expect(screen.getByTestId('cup-classificacao-tua')).toHaveTextContent('Ainda não há resultados oficiais teus confirmados.');
      expect(screen.getByTestId('cup-classificacao-link-geral')).toBeInTheDocument();
      expect(screen.queryByTestId('cup-classificacao-coletiva')).not.toBeInTheDocument();
    });

    it('sem clube da lista (Individual), não há coletiva', () => {
      montar(feita({ enrollment: { team_id: 't-ind' } }));
      expect(screen.queryByTestId('cup-classificacao-coletiva')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cup-classificacao-link-coletiva')).not.toBeInTheDocument();
    });

    it('privacidade: nem o dorsal, nem o nome de outro clube (com "Gerir" fechado)', () => {
      montar(feita({ enrollment: { bib: '4321' } }));
      const text = document.body.textContent;
      expect(text).not.toContain('4321');
      expect(text).not.toMatch(/dorsal/i);
      expect(text).not.toContain('Núcleo de Atletismo da Zona da Abóboda');
      // O clube dele sim, e o total dele.
      expect(text).toContain('CCD Cascais ficou em 6.º');
    });
  });

  /* ── Fase 3: a folha da jornada ────────────────────────────────────── */

  describe('a folha da jornada', () => {
    const abrirFolha = (roundId) => fireEvent.click(screen.getByTestId(`cup-cal-${roundId}-abrir`));

    it('a linha de dados e o estado; decidir e só "Guardar" grava', async () => {
      montar(makeView({ seasonGoal: 'participar' }));
      abrirFolha('r-c3');
      const folha = screen.getByTestId('cup-jornada-sheet');
      expect(within(folha).getByTestId('cup-jornada-dados')).toHaveTextContent('Domingo, 24 de janeiro · 7,4 km às 9h30');
      expect(folha).toHaveTextContent('Próxima · Por decidir');
      expect(within(folha).getByRole('radiogroup', { name: 'Decisão para a jornada 3' })).toBeInTheDocument();
      expect(screen.queryByTestId('cup-folha-guardar')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('cup-folha-vou'));
      expect(setCupParticipation).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('cup-folha-guardar'));
      await waitFor(() => expect(setCupParticipation).toHaveBeenCalledWith('r-c3', { decision: 'vou', decision_source: 'atleta' }));
      expect(await screen.findByText('Decisão guardada.')).toBeInTheDocument();
    });

    it('um "Vou" que colide com uma principal diz que ficou por decidir', async () => {
      setCupParticipation.mockResolvedValue({ ok: true, data: {}, collided: true });
      montar(makeView({ seasonGoal: 'participar' }));
      abrirFolha('r-c3');
      fireEvent.click(screen.getByTestId('cup-folha-vou'));
      fireEvent.click(screen.getByTestId('cup-folha-guardar'));
      expect(await screen.findByText('Ficou por decidir: é o dia de uma prova principal.')).toBeInTheDocument();
    });

    it('uma jornada que já passou não se decide: "Registar" e "Não fui"', () => {
      montar(makeView({ seasonGoal: 'participar' }));
      abrirFolha('r-c2');
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(screen.getByTestId('cup-folha-registar')).toBeInTheDocument();
      expect(screen.getByTestId('cup-folha-nao-fui')).toBeInTheDocument();
    });

    describe('com "Vou" e a prova no calendário', () => {
      const comProva = (extra = {}) => makeView({
        seasonGoal: 'participar', participations: [part('r-c3', 'vou')], races: [X3], ...extra,
      });

      beforeEach(() => {
        useAppStore.setState({ raceEvents: [X3] });
      });

      it('o papel proposto e a razão; "Aceitar" grava a escolha dele', async () => {
        const v = comProva();
        const r3 = v.rounds.find((r) => r.id === 'r-c3');
        expect(r3.role?.intent).toBeTruthy();
        montar(v);
        abrirFolha('r-c3');
        expect(r3.role.intent).toBe('atacar');
        expect(screen.getByTestId('cup-plano-papel')).toHaveTextContent('Pelas contas: atacar');
        expect(screen.getByTestId('cup-plano')).toHaveTextContent('fora das janelas das tuas principais');
        fireEvent.click(screen.getByTestId('cup-aceitar-papel'));
        await waitFor(() => expect(setCupRoundIntent).toHaveBeenCalledWith('r-c3', r3.role.intent));
      });

      it('"Mudar o papel": escolher e "Guardar" grava; "Saltar" pede confirmação e manda "Não vou" + saltar', async () => {
        const view = comProva();
        // O setCupRoundIntent verdadeiro, com o set_participation por baixo a fingir.
        useAppStore.setState({ setCupRoundIntent: REAL.setCupRoundIntent });
        montar(view);
        abrirFolha('r-c3');
        fireEvent.click(screen.getByTestId('cup-mudar-papel'));
        expect(screen.getByRole('radiogroup', { name: 'Papel na jornada 3' })).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText(/^Em trote/));
        // Escolher não grava (as setas do teclado passam por aqui): só "Guardar".
        expect(setCupParticipation).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('cup-papel-guardar'));
        await waitFor(() => expect(setCupParticipation).toHaveBeenCalledWith('r-c3', { intent: 'trote', intent_source: 'atleta' }));

        fireEvent.click(screen.getByTestId('cup-mudar-papel'));
        fireEvent.click(screen.getByLabelText(/^Saltar/));
        expect(screen.queryByTestId('cup-saltar-dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('cup-papel-guardar'));
        expect(screen.getByTestId('cup-saltar-dialog')).toHaveTextContent('Saltar a jornada 3?');
        expect(setCupParticipation).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByTestId('cup-saltar-confirmar'));
        await waitFor(() => expect(setCupParticipation).toHaveBeenCalledTimes(2));
        expect(setCupParticipation.mock.calls[1]).toEqual(['r-c3', { decision: 'nao_vou', decision_source: 'atleta', intent: 'saltar', intent_source: 'atleta' }]);
      });

      it('com o papel escolhido por ele: "O teu papel", e o proposto dito se for outro', () => {
        const v = comProva({ participations: [part('r-c3', 'vou', { intent: 'trote', intent_source: 'atleta' })] });
        montar(v);
        abrirFolha('r-c3');
        expect(screen.getByTestId('cup-plano-papel')).toHaveTextContent('O teu papel: em trote');
        expect(screen.queryByTestId('cup-aceitar-papel')).not.toBeInTheDocument();
        // Pelas contas era atacar (fora das janelas das principais).
        const r3 = v.rounds.find((r) => r.id === 'r-c3');
        expect(r3.role).toMatchObject({ intent: 'atacar', reason: 'livre' });
        expect(screen.getByTestId('cup-plano')).toHaveTextContent('Pelas contas era atacar (fora das janelas das tuas principais). A escolha é tua.');
      });

      it('a previsão com o ícone de cálculo, sem nada gravado (§2.6)', () => {
        const runs = [{ id: 'run1', date: '2027-01-05', distance_km: 10, duration_seconds: 2700 }];
        useAppStore.setState({ runs });
        const v = comProva({ runs, participations: [part('r-c3', 'vou', { intent: 'controlar', intent_source: 'atleta' })] });
        montar(v);
        abrirFolha('r-c3');
        const prev = screen.getByTestId('cup-previsao');
        expect(prev.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
        expect(prev).toHaveTextContent(/previsão calculada: \d+:\d{2}/);
        // Nada foi escrito: nenhuma ação chamada, a prova sem objetivo.
        expect(setCupParticipation).not.toHaveBeenCalled();
        expect(setCupRoundIntent).not.toHaveBeenCalled();
        expect(useAppStore.getState().raceEvents[0].target_time).toBeUndefined();
      });

      it('o prazo de inscrição: o link do organizador e "Já me inscrevi"', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        // Segunda, 18/01; o prazo é a meia-noite de quinta — "quarta às 24h".
        vi.setSystemTime(new Date('2027-01-18T10:00:00Z'));
        const rounds = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3' ? { ...r, entry_deadline_at: '2027-01-21T00:00:00+00:00' } : r));
        montar(comProva({ rounds, today: '2027-01-18', edition: { entry_url: 'https://example.org/inscricao' } }));
        abrirFolha('r-c3');
        expect(screen.getByTestId('cup-prazo')).toHaveTextContent('A inscrição fecha quarta às 24h.');
        const link = screen.getByTestId('cup-inscrever-link');
        expect(link.getAttribute('href')).toBe('https://example.org/inscricao');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('aria-label')).toBe('Inscrever-me na jornada 3 (abre o site oficial)');
        fireEvent.click(screen.getByTestId('cup-ja-inscrevi'));
        await waitFor(() => expect(markCupEntryDone).toHaveBeenCalledWith('r-c3', true));
      });

      it('sem link do organizador, só "Já me inscrevi"; quem inscreve é o clube, nada; já inscrito, "Desfazer"', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2027-01-19T10:00:00Z'));
        const rounds = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3' ? { ...r, entry_deadline_at: '2027-01-21T00:00:00+00:00' } : r));
        const { unmount } = montar(comProva({ rounds, today: '2027-01-19' }));
        abrirFolha('r-c3');
        expect(screen.getByTestId('cup-prazo')).toBeInTheDocument();
        expect(screen.queryByTestId('cup-inscrever-link')).not.toBeInTheDocument();
        expect(screen.getByTestId('cup-ja-inscrevi')).toBeInTheDocument();
        unmount();

        const clube = montar(comProva({ rounds, today: '2027-01-19', enrollment: { entry_by: 'clube' } }));
        abrirFolha('r-c3');
        expect(screen.queryByTestId('cup-prazo')).not.toBeInTheDocument();
        expect(screen.queryByTestId('cup-inscrito')).not.toBeInTheDocument();
        clube.unmount();

        montar(comProva({ rounds, today: '2027-01-19', participations: [part('r-c3', 'vou', { entry_done_at: '2027-01-18T20:00:00Z' })] }));
        abrirFolha('r-c3');
        expect(screen.queryByTestId('cup-prazo')).not.toBeInTheDocument();
        expect(screen.getByTestId('cup-inscrito')).toHaveTextContent('Já te inscreveste.');
        fireEvent.click(screen.getByTestId('cup-desfazer-inscricao'));
        await waitFor(() => expect(markCupEntryDone).toHaveBeenCalledWith('r-c3', false));
      });

      it('promover: o custo aparece ANTES de qualquer escrita; "Cancelar" não grava nada', () => {
        const v = comProva();
        const expected = promotionPreview(v, 'r-c3', { raceEvents: [X3], coachPlans: [], profile: PROFILE, runs: [], today: TODAY }).lines;
        montar(v);
        abrirFolha('r-c3');
        fireEvent.click(screen.getByTestId('cup-promover'));
        const dialog = screen.getByTestId('cup-promover-dialog');
        expect(dialog).toHaveTextContent('Promover a jornada 3 a principal?');
        expect(within(dialog).getAllByTestId('cup-promover-linha').map((p) => p.textContent)).toEqual(expected);
        expect(expected[0]).toMatch(/^Uma prova principal muda o treino à volta dela: \d+ dias de afinação antes e \d+ de recuperação depois\.$/);
        expect(setCupRoundPriority).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId('cup-promover-cancelar'));
        expect(screen.queryByTestId('cup-promover-dialog')).not.toBeInTheDocument();
        expect(setCupRoundPriority).not.toHaveBeenCalled();
      });

      it('promover: confirmar grava a prioridade "a" dessa jornada', async () => {
        montar(comProva());
        abrirFolha('r-c3');
        fireEvent.click(screen.getByTestId('cup-promover'));
        fireEvent.click(screen.getByTestId('cup-promover-confirmar'));
        await waitFor(() => expect(setCupRoundPriority).toHaveBeenCalledWith('r-c3', 'a'));
        expect(await screen.findByText('A jornada 3 passou a principal.')).toBeInTheDocument();
      });

      it('já principal: diz-se, e "Voltar a secundária" grava "b"', async () => {
        const races = [{ ...X3, race_priority: 'a' }];
        useAppStore.setState({ raceEvents: races });
        montar(comProva({ races }));
        abrirFolha('r-c3');
        expect(screen.getByTestId('cup-principal')).toHaveTextContent('Principal');
        expect(screen.queryByTestId('cup-promover')).not.toBeInTheDocument();
        fireEvent.click(screen.getByTestId('cup-despromover'));
        await waitFor(() => expect(setCupRoundPriority).toHaveBeenCalledWith('r-c3', 'b'));
      });

      it('"Abrir a prova" fecha o ecrã e abre o hub dela', () => {
        const onClose = vi.fn();
        montar(comProva(), onClose);
        abrirFolha('r-c3');
        fireEvent.click(screen.getByTestId('cup-abrir-prova'));
        expect(onClose).toHaveBeenCalled();
        expect(setEditingRaceId).toHaveBeenCalledWith('x3');
      });
    });

    it('feita: o resultado oficial e os links, nunca o dorsal', () => {
      const rounds = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c2' ? { ...r, results_url: 'https://example.org/j2' } : r));
      montar(makeView({
        seasonGoal: 'participar',
        rounds,
        enrollment: { bib: '4321' },
        races: [{ ...X2, status: 'concluida' }],
        runs: [{ id: 'run2', race_id: 'x2', date: '2027-01-10', distance_km: 8, duration_seconds: 2200, details: { bib_number: '4321' } }],
        results: { status: 'ready', enrollmentId: 'enr-1', rows: [{ round_id: 'r-c2', position: 120, category_code: 'M35', category_position: 29, points: 5, official_time_s: 2172, match_status: 'confirmada' }], teamRows: [] },
      }));
      abrirFolha('r-c2');
      const res = screen.getByTestId('cup-jornada-resultado');
      expect(res).toHaveTextContent('Tempo oficial 36:12 · 29.º M35 · 5 pontos');
      expect(screen.getByTestId('cup-jornada-link-resultados').getAttribute('href')).toBe('https://example.org/j2');
      expect(document.body.textContent).not.toContain('4321');
    });

    it('feita sem linha oficial: o lugar que ele próprio registou', () => {
      montar(makeView({
        seasonGoal: 'participar',
        races: [{ ...X2, status: 'concluida' }],
        runs: [{ id: 'run2', race_id: 'x2', date: '2027-01-10', distance_km: 8, duration_seconds: 2200, details: { bib_number: '4321', age_group_position: 31 } }],
      }));
      abrirFolha('r-c2');
      const res = screen.getByTestId('cup-jornada-resultado');
      expect(res).toHaveTextContent('Ainda sem classificação oficial.');
      expect(res).toHaveTextContent('Lugar no escalão (registado por ti): 31.º');
      expect(document.body.textContent).not.toContain('4321');
    });
  });
});
