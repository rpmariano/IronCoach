import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* O bloco Troféu no hub da prova (specs/trofeu.md §4.4–§4.5, Fase 3,
   2026-09-27): só na prova de uma jornada de quem está inscrito; a migalha
   "J3 de 5"; antes, o papel e a previsão (calculada, com o ícone) e "Não
   vou"; passou sem registo, "Não fui"; depois, o resultado oficial ou o
   lugar que ele registou — nunca o dorsal. */

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...a) => mocks.from(...a),
    rpc: (...a) => mocks.rpc(...a),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('../../store');
const { CUP_EMPTY } = await import('../../store/cupSlice');
const { default: CupRaceBlock } = await import('./CupRaceBlock');
const F = await import('@formulas/cup.fixtures.ts');

const USER = 'u1';
// Nasceu a 24/1/1982: na J3 (24/01/2027) faz 45 — M45, percurso longo.
const PROFILE = { id: USER, gender: 'M', birth_date: '1982-01-24', experience_level: 'medio' };
const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-ccd', season_goal: 'participar', status: 'ativa', entry_by: 'atleta', bib: '4321' };
const X3 = { id: 'x3', name: 'Corrida CCD Cascais', date: '2027-01-24', distance_km: 7.4, race_type: 'estrada', race_priority: 'b', status: 'agendada', cup_round_id: 'r-c3' };
const RUNS = [{ id: 'run1', date: '2027-01-05', distance_km: 10, duration_seconds: 2700 }];
const ROUNDS = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3'
  ? { ...r, results_url: 'https://example.org/j3', team_results_url: 'https://example.org/j3-coletiva' }
  : r));
const REAL = useAppStore.getState();

function cupState({ participations = [{ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou', decision_source: 'atleta' }], results = null, enrollment = ENR, edition = {} } = {}) {
  return {
    ...CUP_EMPTY,
    status: 'ready', userId: USER, dismissals: [],
    editions: [{ ...F.CASCAIS_34_ABERTA, standings_url: 'https://example.org/geral', ...edition, competition: F.CASCAIS_COMPETITION }],
    enrollments: [enrollment],
    participations,
    catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds: ROUNDS, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
    results: results || { status: 'ready', enrollmentId: 'enr1', rows: [], teamRows: [] },
  };
}

const hoje = (iso) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${iso}T10:00:00Z`)); };

describe('CupRaceBlock — o bloco Troféu no hub', () => {
  let calls;
  let actions;

  beforeEach(() => {
    mocks.from.mockReset().mockImplementation(() => { throw new Error('sem rede nos testes'); });
    mocks.rpc.mockReset();
    calls = [];
    const log = (name, ret) => vi.fn((...args) => { calls.push([name, ...args]); return ret; });
    actions = {
      setEditingRaceId: log('setEditingRaceId'),
      setActiveTab: log('setActiveTab', true),
      requestCupScreen: log('requestCupScreen'),
      setCupParticipation: log('setCupParticipation', Promise.resolve({ ok: true, data: {} })),
      markCupRoundNotAttended: log('markCupRoundNotAttended', Promise.resolve({ ok: true, data: {} })),
      setCupRoundIntent: log('setCupRoundIntent', Promise.resolve({ ok: true, data: {} })),
      markCupEntryDone: log('markCupEntryDone', Promise.resolve({ ok: true, data: {} })),
      confirmCupResult: log('confirmCupResult', Promise.resolve({ ok: true, data: {} })),
      rejectCupResult: log('rejectCupResult', Promise.resolve({ ok: true, data: {} })),
    };
    useAppStore.setState({ session: { user: { id: USER } }, profile: PROFILE, cup: cupState(), raceEvents: [X3], runs: RUNS, ...actions });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAppStore.setState({
      session: null, profile: null, cup: CUP_EMPTY, raceEvents: [], runs: [],
      setEditingRaceId: REAL.setEditingRaceId, setActiveTab: REAL.setActiveTab, requestCupScreen: REAL.requestCupScreen,
      setCupParticipation: REAL.setCupParticipation, markCupRoundNotAttended: REAL.markCupRoundNotAttended,
      setCupRoundIntent: REAL.setCupRoundIntent, markCupEntryDone: REAL.markCupEntryDone,
      confirmCupResult: REAL.confirmCupResult, rejectCupResult: REAL.rejectCupResult,
      navGuard: null,
    });
  });

  it('numa prova sem jornada não desenha nada nem lê nada — mesmo sem nada lido da competição', () => {
    useAppStore.setState({ cup: CUP_EMPTY });
    const { container } = render(<CupRaceBlock race={{ id: 'meia', name: 'Meia', date: '2027-03-14', race_priority: 'a', status: 'agendada' }} />);
    expect(container.innerHTML).toBe('');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('uma prova de uma jornada de outra edição (época antiga): nada', () => {
    hoje('2027-01-19');
    const { container } = render(<CupRaceBlock race={{ ...X3, id: 'velha', cup_round_id: 'r-de-outra-epoca' }} />);
    expect(container.innerHTML).toBe('');
  });

  describe('antes da jornada', () => {
    beforeEach(() => hoje('2027-01-19'));

    it('a migalha "J3 de 5" leva ao ecrã do Troféu, com a folha desta jornada', () => {
      render(<CupRaceBlock race={X3} />);
      const migalha = screen.getByTestId('cup-race-migalha');
      expect(migalha).toHaveTextContent('Troféu de Cascais · J3 de 5');
      expect(migalha.getAttribute('aria-label')).toBe('Abrir o Troféu de Cascais: jornada 3 de 5');
      expect(parseInt(migalha.style.minHeight, 10)).toBe(44);
      fireEvent.click(migalha);
      // O separador primeiro; só com ele aceite se fecha o hub.
      expect(calls).toEqual([
        ['setActiveTab', 'provas'],
        ['setEditingRaceId', null],
        ['requestCupScreen', { roundId: 'r-c3' }],
      ]);
    });

    it('com o separador recusado (alterações por gravar), o hub fica aberto e não fica pedido nenhum pendurado', () => {
      actions.setActiveTab.mockImplementation((...a) => { calls.push(['setActiveTab', ...a]); return false; });
      render(<CupRaceBlock race={X3} />);
      fireEvent.click(screen.getByTestId('cup-race-migalha'));
      expect(actions.requestCupScreen).not.toHaveBeenCalled();
      expect(actions.setEditingRaceId).not.toHaveBeenCalled();
    });

    /* Revisão da Fase 3: a migalha fechava o hub antes de pedir o separador
       — com os "Detalhes da prova" por gravar, o navGuard do hub (RunAgenda)
       recusava a mudança num ecrã que ia desmontar, e as alterações ficavam
       para trás sem a pergunta "sair sem gravar?". Com o setActiveTab e o
       navGuard verdadeiros do store. */
    it('com o navGuard do hub instalado, a pergunta do navGuard é que manda: nada se fecha', () => {
      const guard = vi.fn(() => false);
      const tabAntes = useAppStore.getState().activeTab;
      useAppStore.setState({ setActiveTab: REAL.setActiveTab, navGuard: guard, activeTab: 'calendario', editingRaceId: 'x3' });
      render(<CupRaceBlock race={X3} />);
      fireEvent.click(screen.getByTestId('cup-race-migalha'));
      expect(guard).toHaveBeenCalledWith('provas');
      expect(actions.setEditingRaceId).not.toHaveBeenCalled();
      expect(actions.requestCupScreen).not.toHaveBeenCalled();
      expect(useAppStore.getState().activeTab).toBe('calendario');
      expect(useAppStore.getState().editingRaceId).toBe('x3');

      // Sem alterações por gravar (sem navGuard): Provas, o hub fecha, e o pedido fica.
      useAppStore.setState({ navGuard: null });
      fireEvent.click(screen.getByTestId('cup-race-migalha'));
      expect(useAppStore.getState().activeTab).toBe('provas');
      expect(calls).toEqual([
        ['setEditingRaceId', null],
        ['requestCupScreen', { roundId: 'r-c3' }],
      ]);
      useAppStore.setState({ navGuard: null, activeTab: tabAntes, editingRaceId: null });
    });

    it('o papel "pelas contas" e a previsão com o ícone de cálculo — nada gravado', () => {
      render(<CupRaceBlock race={X3} />);
      expect(screen.getByTestId('cup-plano-papel')).toHaveTextContent('Pelas contas: atacar');
      const prev = screen.getByTestId('cup-previsao');
      expect(prev).toHaveTextContent('previsão calculada: 32:42');
      expect(prev.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
      expect(calls).toEqual([]);
      expect(useAppStore.getState().raceEvents[0].target_time).toBeUndefined();
    });

    it('"Não vou" pede confirmação, fecha o hub e só depois grava', async () => {
      render(<CupRaceBlock race={X3} />);
      fireEvent.click(screen.getByTestId('cup-race-nao-vou'));
      expect(screen.getByRole('dialog', { name: 'Não vais à jornada 3?' })).toHaveTextContent('A prova sai do calendário e a jornada fica «Não vou».');
      expect(calls).toEqual([]);
      fireEvent.click(screen.getByTestId('cup-race-nao-vou-confirmar'));
      await waitFor(() => expect(actions.setCupParticipation).toHaveBeenCalled());
      expect(calls).toEqual([
        ['setEditingRaceId', null],
        ['setCupParticipation', 'r-c3', { decision: 'nao_vou', decision_source: 'atleta' }],
      ]);
    });

    /* Revisão da Fase 3 (acessibilidade de teclado): nos rádios nativos as
       setas mudam a seleção e disparam `change`. Gravar no `change` fazia de
       cada papel por onde as setas passavam uma escrita com aviso, e em
       "Saltar" abria o diálogo sem ele ter escolhido nada. */
    it('teclado: as setas só mudam a escolha — nada se grava até "Guardar", e o foco volta a "Mudar o papel"', async () => {
      const user = userEvent.setup();
      render(<CupRaceBlock race={X3} />);
      await user.click(screen.getByTestId('cup-mudar-papel'));
      const grupo = screen.getByRole('radiogroup', { name: 'Papel na jornada 3' });
      expect(screen.getByLabelText(/^Atacar/)).toBeChecked();
      expect(screen.queryByTestId('cup-papel-guardar')).not.toBeInTheDocument();

      screen.getByLabelText(/^Atacar/).focus();
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
      expect(screen.getByLabelText(/^Saltar/)).toBeChecked();
      expect(actions.setCupRoundIntent).not.toHaveBeenCalled();
      expect(screen.queryByTestId('cup-saltar-dialog')).not.toBeInTheDocument();
      // O foco fica no grupo (nenhum rádio se desativa).
      expect(grupo.contains(document.activeElement)).toBe(true);

      await user.keyboard('{ArrowUp}');
      expect(screen.getByLabelText(/^Em trote/)).toBeChecked();
      const guardar = screen.getByTestId('cup-papel-guardar');
      expect(guardar).toHaveTextContent('Guardar: em trote');
      expect(parseInt(guardar.style.minHeight, 10)).toBe(44);
      await user.click(guardar);
      await waitFor(() => expect(screen.queryByTestId('cup-papeis')).not.toBeInTheDocument());
      expect(actions.setCupRoundIntent).toHaveBeenCalledTimes(1);
      expect(actions.setCupRoundIntent).toHaveBeenCalledWith('r-c3', 'trote');
      expect(document.activeElement).toBe(screen.getByTestId('cup-mudar-papel'));
    });

    it('voltar ao papel que já estava não pede "Guardar"', async () => {
      const user = userEvent.setup();
      useAppStore.setState({ cup: cupState({ participations: [{ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou', decision_source: 'atleta', intent: 'controlar', intent_source: 'atleta' }] }) });
      render(<CupRaceBlock race={X3} />);
      await user.click(screen.getByTestId('cup-mudar-papel'));
      expect(screen.getByLabelText(/^Controlar/)).toBeChecked();
      await user.click(screen.getByLabelText(/^Em trote/));
      expect(screen.getByTestId('cup-papel-guardar')).toBeInTheDocument();
      await user.click(screen.getByLabelText(/^Controlar/));
      expect(screen.queryByTestId('cup-papel-guardar')).not.toBeInTheDocument();
      expect(actions.setCupRoundIntent).not.toHaveBeenCalled();
    });

    // Revisão da Fase 3: a prova que ele já tinha nesse dia e a sincronização
    // ligou à jornada não sai do calendário (cup_release_race repõe-na).
    it('numa prova dele ligada pela sincronização, "Não vou" e "Saltar" não dizem que ela sai do calendário', async () => {
      const ligada = { ...X3, cup_link_origin: { date: '2027-01-24', location: 'Cascais', distance_km: 7.4 } };
      useAppStore.setState({ raceEvents: [ligada] });
      render(<CupRaceBlock race={ligada} />);
      fireEvent.click(screen.getByTestId('cup-race-nao-vou'));
      const naoVou = screen.getByRole('dialog', { name: 'Não vais à jornada 3?' });
      expect(naoVou).toHaveTextContent('A jornada fica «Não vou». A prova já era tua antes da jornada: não sai do calendário, volta a ser uma prova normal.');
      expect(naoVou).not.toHaveTextContent('sai do calendário e');
      fireEvent.click(screen.getByText('Cancelar'));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Não vais à jornada 3?' })).not.toBeInTheDocument());

      fireEvent.click(screen.getByTestId('cup-mudar-papel'));
      fireEvent.click(screen.getByLabelText(/^Saltar/));
      fireEvent.click(screen.getByTestId('cup-papel-guardar'));
      expect(screen.getByTestId('cup-saltar-dialog')).toHaveTextContent('Fica «Não vou». A prova já era tua antes da jornada: não sai do calendário, volta a ser uma prova normal. Podes voltar a dizer «Vou» enquanto não passar.');
      expect(calls).toEqual([]);
    });

    it('"Saltar" no hub também fecha o hub antes de gravar', async () => {
      render(<CupRaceBlock race={X3} />);
      fireEvent.click(screen.getByTestId('cup-mudar-papel'));
      fireEvent.click(screen.getByLabelText(/^Saltar/));
      // Escolher não grava nem abre nada: é o "Guardar" que pede a confirmação.
      expect(screen.queryByTestId('cup-saltar-dialog')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('cup-papel-guardar'));
      expect(screen.getByTestId('cup-saltar-dialog')).toHaveTextContent('Sai do calendário e fica «Não vou».');
      fireEvent.click(screen.getByTestId('cup-saltar-confirmar'));
      await waitFor(() => expect(actions.setCupRoundIntent).toHaveBeenCalled());
      expect(calls).toEqual([
        ['setEditingRaceId', null],
        ['setCupRoundIntent', 'r-c3', 'saltar'],
      ]);
    });
  });

  it('passou e não registou: "Não fui" pede confirmação, fecha o hub e só depois grava', async () => {
    hoje('2027-01-25');
    render(<CupRaceBlock race={X3} />);
    expect(screen.getByTestId('cup-race-block')).toHaveTextContent('Por registar');
    expect(screen.queryByTestId('cup-race-nao-vou')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cup-race-nao-fui'));
    expect(screen.getByTestId('cup-nao-fui-dialog')).toHaveTextContent('Não foste à jornada 3?');
    fireEvent.click(screen.getByTestId('cup-nao-fui-confirmar'));
    await waitFor(() => expect(actions.markCupRoundNotAttended).toHaveBeenCalled());
    expect(calls).toEqual([
      ['setEditingRaceId', null],
      ['markCupRoundNotAttended', 'r-c3'],
    ]);
  });

  describe('depois da jornada', () => {
    const DONE = { ...X3, status: 'concluida' };
    const RUN = { id: 'run3', race_id: 'x3', kind: 'competicao', date: '2027-01-24', distance_km: 7.4, duration_seconds: 2180, details: { bib_number: '4321', age_group_position: 29 } };

    beforeEach(() => {
      hoje('2027-01-25');
      useAppStore.setState({ raceEvents: [DONE], runs: [...RUNS, RUN] });
    });

    it('o tempo oficial, o lugar no escalão, os pontos e o link; a coletiva do clube dele', () => {
      useAppStore.setState({
        cup: cupState({
          results: {
            status: 'ready', enrollmentId: 'enr1', teamId: 't-ccd',
            rows: [{ round_id: 'r-c3', position: 120, category_code: 'M45', category_position: 29, points: 5, official_time_s: 2172, match_status: 'confirmada' }],
            teamRows: [{ round_id: 'r-c3', position: 6, points: 412 }],
          },
        }),
      });
      render(<CupRaceBlock race={DONE} />);
      const res = screen.getByTestId('cup-race-resultado');
      expect(res).toHaveTextContent('Tempo oficial 36:12 · 29.º no escalão M45 · 5 pontos');
      const link = screen.getByTestId('cup-race-link-classificacao');
      expect(link.getAttribute('href')).toBe('https://example.org/j3');
      expect(link).toHaveTextContent('Classificação da J3');
      expect(link.getAttribute('aria-label')).toBe('Classificação da J3 (abre o site oficial)');
      expect(screen.getByTestId('cup-race-coletiva')).toHaveTextContent('O teu clube ficou em 6.º na coletiva desta jornada · 412 pontos');
      expect(screen.getByTestId('cup-race-link-coletiva').getAttribute('href')).toBe('https://example.org/j3-coletiva');
      expect(screen.getByTestId('cup-race-block')).toHaveTextContent('Feita');
      expect(screen.queryByTestId('cup-race-nao-fui')).not.toBeInTheDocument();
    });

    it('sem linha oficial: "Ainda sem classificação oficial." e o lugar que ele registou — nunca o dorsal', () => {
      render(<CupRaceBlock race={DONE} />);
      const res = screen.getByTestId('cup-race-resultado');
      expect(res).toHaveTextContent('Ainda sem classificação oficial.');
      expect(screen.getByTestId('cup-race-lugar-proprio')).toHaveTextContent('Lugar no escalão (registado por ti): 29.º');
      const text = screen.getByTestId('cup-race-block').textContent;
      expect(text).not.toContain('4321');
      expect(text).not.toMatch(/dorsal/i);
    });
  });

  /* Revisão da Fase 3, aviso [c]: "Não vou", "Não fui" e "Saltar" fecham o
     hub — com os "Detalhes da prova" por gravar, o navGuard pergunta
     primeiro, e recusado nada abre, nada se grava e o hub fica. */
  describe('com alterações por gravar no hub (navGuard que recusa)', () => {
    let guard;
    beforeEach(() => {
      guard = vi.fn(() => false);
      useAppStore.setState({ navGuard: guard, activeTab: 'calendario' });
    });

    it('"Não vou": pede o navGuard antes do diálogo — recusado, nada abre, nada grava, o hub fica', () => {
      hoje('2027-01-19');
      render(<CupRaceBlock race={X3} />);
      fireEvent.click(screen.getByTestId('cup-race-nao-vou'));
      expect(guard).toHaveBeenCalledWith('calendario');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(calls).toEqual([]);
    });

    it('"Não fui": o mesmo', () => {
      hoje('2027-01-25');
      render(<CupRaceBlock race={X3} />);
      fireEvent.click(screen.getByTestId('cup-race-nao-fui'));
      expect(guard).toHaveBeenCalled();
      expect(screen.queryByTestId('cup-nao-fui-dialog')).not.toBeInTheDocument();
      expect(calls).toEqual([]);
    });

    it('"Saltar": confirmado o salto, o navGuard recusa — o diálogo fecha, nada grava, o hub fica', async () => {
      hoje('2027-01-19');
      render(<CupRaceBlock race={X3} />);
      fireEvent.click(screen.getByTestId('cup-mudar-papel'));
      fireEvent.click(screen.getByLabelText(/^Saltar/));
      fireEvent.click(screen.getByTestId('cup-papel-guardar'));
      fireEvent.click(screen.getByTestId('cup-saltar-confirmar'));
      await waitFor(() => expect(screen.queryByTestId('cup-saltar-dialog')).not.toBeInTheDocument());
      expect(guard).toHaveBeenCalled();
      expect(actions.setCupRoundIntent).not.toHaveBeenCalled();
      expect(actions.setEditingRaceId).not.toHaveBeenCalled();
    });

    it('sem nada por gravar (navGuard que aceita): segue como antes', async () => {
      hoje('2027-01-19');
      guard.mockReturnValue(true);
      render(<CupRaceBlock race={X3} />);
      fireEvent.click(screen.getByTestId('cup-race-nao-vou'));
      fireEvent.click(screen.getByTestId('cup-race-nao-vou-confirmar'));
      await waitFor(() => expect(actions.setCupParticipation).toHaveBeenCalled());
      expect(calls).toEqual([
        ['setEditingRaceId', null],
        ['setCupParticipation', 'r-c3', { decision: 'nao_vou', decision_source: 'atleta' }],
      ]);
    });
  });

  /* ── Fase 4 (2026-09-27): a correspondência com a classificação oficial ── */
  describe('Fase 4 — "És tu?" e a frase de falha', () => {
    const DONE = { ...X3, status: 'concluida' };
    const PROPOSTA = { round_id: 'r-c3', position: 120, category_code: 'M45', category_position: 29, points: 5, official_time_s: 2172, match_status: 'proposta', points_source: 'calculado' };
    const publicar = (results, extra = {}) => cupState({
      edition: { sync_mode: 'publicar' },
      results: { status: 'ready', enrollmentId: 'enr1', teamId: 't-ccd', teamRows: [], standing: null, publication: {}, m2: true, rows: [], ...results },
      ...extra,
    });

    beforeEach(() => {
      hoje('2027-01-25');
      useAppStore.setState({ raceEvents: [DONE], runs: [...RUNS, { id: 'run3', race_id: 'x3', date: '2027-01-24', distance_km: 7.4, duration_seconds: 2180 }] });
    });

    it('com uma linha por confirmar: o "És tu?" no lugar da linha oficial', async () => {
      useAppStore.setState({ cup: publicar({ rows: [PROPOSTA] }) });
      render(<CupRaceBlock race={DONE} />);
      expect(screen.getByTestId('cup-match')).toHaveTextContent('J3 · Corrida CCD Cascais: 29.º no escalão M45, 36:12.');
      expect(screen.getByTestId('cup-race-resultado')).not.toHaveTextContent('Ainda sem classificação oficial.');
      expect(screen.getByTestId('cup-race-resultado')).not.toHaveTextContent('Tempo oficial');
      fireEvent.click(screen.getByTestId('cup-match-sim'));
      await waitFor(() => expect(actions.confirmCupResult).toHaveBeenCalledWith('r-c3'));
      // O foco fica na migalha (a pergunta sai).
      await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('cup-race-migalha')));
    });

    it('a pergunta aparece mesmo com a prova por registar (o "Registar" do hub continua)', () => {
      useAppStore.setState({ raceEvents: [X3], runs: RUNS, cup: publicar({ rows: [PROPOSTA] }) });
      render(<CupRaceBlock race={X3} />);
      expect(screen.getByTestId('cup-match')).toBeInTheDocument();
      expect(screen.getByTestId('cup-race-nao-fui')).toBeInTheDocument();
    });

    it('confirmada: os pontos calculados pela app dizem-se provisórios', () => {
      useAppStore.setState({ cup: publicar({ rows: [{ ...PROPOSTA, match_status: 'confirmada' }], teamRows: [{ round_id: 'r-c3', position: 6, points: 412, points_source: 'calculado' }] }) });
      render(<CupRaceBlock race={DONE} />);
      expect(screen.getByTestId('cup-race-resultado')).toHaveTextContent('Tempo oficial 36:12 · 29.º no escalão M45 · 5 pontos (provisórios)');
      expect(screen.getByTestId('cup-race-coletiva')).toHaveTextContent('O teu clube ficou em 6.º na coletiva desta jornada · 412 pontos (conta da app a partir da geral oficial)');
    });

    it('confirmada com os pontos oficiais da geral: sem a marca de provisórios', () => {
      useAppStore.setState({ cup: publicar({ rows: [{ ...PROPOSTA, match_status: 'confirmada', points: 7, points_source: 'oficial' }] }) });
      render(<CupRaceBlock race={DONE} />);
      const res = screen.getByTestId('cup-race-resultado');
      expect(res).toHaveTextContent('Tempo oficial 36:12 · 29.º no escalão M45 · 7 pontos');
      expect(res).not.toHaveTextContent('provisórios');
    });

    it('rever_dorsal: a frase exata e [Rever o dorsal] → o Troféu com o "Gerir inscrição" aberto, pelo caminho da migalha', () => {
      useAppStore.setState({ cup: publicar({ publication: { 'r-c3': '2027-01-24T18:37:00Z' } }) });
      render(<CupRaceBlock race={DONE} />);
      expect(screen.getByTestId('cup-race-correspondencia')).toHaveTextContent('Não consegui confirmar. Revê o dorsal ou fala com o suporte.');
      // Nunca o dorsal dele nem outro.
      expect(screen.getByTestId('cup-race-block').textContent).not.toContain('4321');
      const btn = screen.getByTestId('cup-race-rever-dorsal');
      expect(parseInt(btn.style.minHeight, 10)).toBe(44);
      fireEvent.click(btn);
      expect(calls).toEqual([
        ['setActiveTab', 'provas'],
        ['setEditingRaceId', null],
        ['requestCupScreen', { mode: 'gerir' }],
      ]);
    });

    it('[Rever o dorsal] com o separador recusado (alterações por gravar): o hub fica e não fica pedido nenhum', () => {
      actions.setActiveTab.mockImplementation((...a) => { calls.push(['setActiveTab', ...a]); return false; });
      useAppStore.setState({ cup: publicar({ publication: { 'r-c3': '2027-01-24T18:37:00Z' } }) });
      render(<CupRaceBlock race={DONE} />);
      fireEvent.click(screen.getByTestId('cup-race-rever-dorsal'));
      expect(actions.requestCupScreen).not.toHaveBeenCalled();
      expect(actions.setEditingRaceId).not.toHaveBeenCalled();
    });

    it('sem_dorsal: a outra frase', () => {
      useAppStore.setState({ cup: publicar({ publication: { 'r-c3': '2027-01-24T18:37:00Z' } }, { enrollment: { ...ENR, bib: null } }) });
      render(<CupRaceBlock race={DONE} />);
      expect(screen.getByTestId('cup-race-correspondencia')).toHaveTextContent('Sem dorsal não consigo ler o teu resultado oficial. Junta-o em «Gerir inscrição».');
    });

    it('a observar (ou sem a M2): nem pergunta nem frase de falha', () => {
      for (const cup of [
        cupState({ edition: { sync_mode: 'observar' }, results: { status: 'ready', enrollmentId: 'enr1', rows: [], teamRows: [], publication: { 'r-c3': '2027-01-24T18:37:00Z' }, m2: true } }),
        publicar({ publication: { 'r-c3': '2027-01-24T18:37:00Z' }, m2: false }),
      ]) {
        useAppStore.setState({ cup });
        const { unmount } = render(<CupRaceBlock race={DONE} />);
        expect(screen.queryByTestId('cup-race-correspondencia')).not.toBeInTheDocument();
        expect(screen.queryByTestId('cup-match')).not.toBeInTheDocument();
        unmount();
      }
    });
  });
});
