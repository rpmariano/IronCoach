import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CompetitionsTab from './index';

/* Separador "Competições" do Admin (specs/trofeu.md §6, Fase 1b), 2026-09-26.

   utils/cupAdmin.js é a única coisa mockada — um esboço com estado (rounds,
   courses, teams em arrays), para os recarregamentos (load() a seguir a
   cada gravação) verem o que as ações anteriores escreveram, tal como a
   BD real depois de cada RPC/escrita. O que sai do Supabase já está coberto
   em cupAdmin.test.js; aqui interessa o fluxo do ecrã: a pré-visualização
   obrigatória antes de "Confirmar jornada", a confirmação antes de "Fechar
   edição", e que os formulários mostram o erro do servidor tal como vem. */

let editions;
let rounds;
let courses;
let teams;
let series;
let idSeq;
const newId = (p) => `${p}${++idSeq}`;

const EDITION_ABERTA = { id: 'ed34', competition_id: 'comp1', edition_no: 34, season_label: '2026/27', status: 'aberta' };
const EDITION_POR_ANUNCIAR = { id: 'ed33', competition_id: 'comp1', edition_no: 33, season_label: '2025/26', status: 'por_anunciar' };

function resetFixtures() {
  idSeq = 0;
  editions = [{ ...EDITION_ABERTA }, { ...EDITION_POR_ANUNCIAR }];
  rounds = [];
  courses = [];
  teams = [];
  series = [];
}

const mocks = vi.hoisted(() => ({}));

vi.mock('../../../utils/cupAdmin', async (importOriginal) => {
  const actual = await importOriginal();
  return {
  // As puras são as verdadeiras (a guarda do fecho, a validação do ensaio).
  closeEditionBlocker: actual.closeEditionBlocker,
  editionTodayISO: actual.editionTodayISO,
  ensaioLinks: actual.ensaioLinks,
  CUP_SYNC_MODES: actual.CUP_SYNC_MODES,
  // Fase 4 (Classificação).
  updateEditionLinks: (...a) => mocks.updateEditionLinks(...a),
  setEditionSyncMode: (...a) => mocks.setEditionSyncMode(...a),
  listSyncState: (...a) => mocks.listSyncState(...a),
  listRoundPublication: (...a) => mocks.listRoundPublication(...a),
  listAliases: (...a) => mocks.listAliases(...a),
  linkAlias: (...a) => mocks.linkAlias(...a),
  listSyncAlerts: (...a) => mocks.listSyncAlerts(...a),
  markRoundPublished: (...a) => mocks.markRoundPublished(...a),
  runCupSync: (...a) => mocks.runCupSync(...a),
  runCupEnsaio: (...a) => mocks.runCupEnsaio(...a),
  listCompetitions: (...a) => mocks.listCompetitions(...a),
  setEditionStatus: (...a) => mocks.setEditionStatus(...a),
  closeEdition: (...a) => mocks.closeEdition(...a),
  listRaceSeries: (...a) => mocks.listRaceSeries(...a),
  createRaceSeries: (...a) => mocks.createRaceSeries(...a),
  listRounds: (...a) => mocks.listRounds(...a),
  createRound: (...a) => mocks.createRound(...a),
  updateRound: (...a) => mocks.updateRound(...a),
  deleteRound: (...a) => mocks.deleteRound(...a),
  previewRoundChange: (...a) => mocks.previewRoundChange(...a),
  confirmRoundChange: (...a) => mocks.confirmRoundChange(...a),
  listCourses: (...a) => mocks.listCourses(...a),
  createCourse: (...a) => mocks.createCourse(...a),
  updateCourse: (...a) => mocks.updateCourse(...a),
  deleteCourse: (...a) => mocks.deleteCourse(...a),
  listTeams: (...a) => mocks.listTeams(...a),
  createTeam: (...a) => mocks.createTeam(...a),
  updateTeam: (...a) => mocks.updateTeam(...a),
  deleteTeam: (...a) => mocks.deleteTeam(...a),
  };
});

beforeEach(() => {
  resetFixtures();

  mocks.listCompetitions = vi.fn(async () => ({
    ok: true,
    data: [{
      id: 'comp1',
      name: 'Troféu de Atletismo de Cascais',
      short_name: 'Troféu de Cascais',
      editions: editions.map((e) => ({ ...e })),
    }],
  }));

  mocks.setEditionStatus = vi.fn(async (id, status) => {
    const e = editions.find((x) => x.id === id);
    Object.assign(e, { status });
    return { ok: true, data: { ...e } };
  });
  mocks.closeEdition = vi.fn(async (id) => {
    const e = editions.find((x) => x.id === id);
    Object.assign(e, { status: 'encerrada', closed_at: '2026-10-01T00:00:00Z' });
    return { ok: true, data: { edition_id: id, status: 'encerrada', closed_at: e.closed_at } };
  });

  mocks.listRaceSeries = vi.fn(async (competitionId) => ({ ok: true, data: series.filter((s) => s.competition_id === competitionId) }));
  mocks.createRaceSeries = vi.fn(async (competitionId, fields) => {
    const row = { id: newId('s'), competition_id: competitionId, ...fields };
    series.push(row);
    return { ok: true, data: row };
  });

  mocks.listRounds = vi.fn(async (editionId) => ({
    ok: true,
    data: rounds.filter((r) => r.edition_id === editionId).sort((a, b) => (a.round_no || 0) - (b.round_no || 0)).map((r) => ({ ...r })),
  }));
  mocks.createRound = vi.fn(async (editionId, fields) => {
    const row = { id: newId('r'), edition_id: editionId, ...fields };
    rounds.push(row);
    return { ok: true, data: { ...row } };
  });
  mocks.updateRound = vi.fn(async (id, patch) => {
    if (patch && ('date' in patch || 'date_status' in patch)) {
      return { ok: false, error: { message: 'Data e estado da data gravam-se só via confirmRoundChange.' }, unavailable: false };
    }
    const row = rounds.find((r) => r.id === id);
    Object.assign(row, patch);
    return { ok: true, data: { ...row } };
  });
  mocks.deleteRound = vi.fn(async (id) => {
    if (id === 'round-corrida') {
      return { ok: false, error: { code: '23503', message: 'Esta jornada já foi corrida por atletas da app: marca-a como cancelada em vez de a apagar' }, unavailable: false };
    }
    rounds = rounds.filter((r) => r.id !== id);
    return { ok: true, data: null };
  });
  mocks.previewRoundChange = vi.fn(async (id, patch) => ({
    ok: true,
    data: { atletas_vou: '1–19', provas_movidas: '0', provas_criadas: '1–19', provas_apagadas: '0', colisoes: '0', planos_ajustados: '0' },
  }));
  mocks.confirmRoundChange = vi.fn(async (id, patch) => {
    const row = rounds.find((r) => r.id === id);
    Object.assign(row, patch);
    return { ok: true, data: { ...row } };
  });

  mocks.listCourses = vi.fn(async (roundIds) => ({ ok: true, data: courses.filter((c) => (roundIds || []).includes(c.round_id)).map((c) => ({ ...c })) }));
  mocks.createCourse = vi.fn(async (roundId, fields) => {
    const row = { id: newId('c'), round_id: roundId, ...fields };
    courses.push(row);
    return { ok: true, data: { ...row } };
  });
  mocks.updateCourse = vi.fn(async (id, patch) => {
    const row = courses.find((c) => c.id === id);
    Object.assign(row, patch);
    return { ok: true, data: { ...row } };
  });
  mocks.deleteCourse = vi.fn(async (id) => { courses = courses.filter((c) => c.id !== id); return { ok: true, data: null }; });

  mocks.listTeams = vi.fn(async (editionId) => ({ ok: true, data: teams.filter((t) => t.edition_id === editionId).map((t) => ({ ...t })) }));
  mocks.createTeam = vi.fn(async (editionId, fields) => {
    const row = { id: newId('t'), edition_id: editionId, ...fields };
    teams.push(row);
    return { ok: true, data: { ...row } };
  });
  mocks.updateTeam = vi.fn(async (id, patch) => {
    const row = teams.find((t) => t.id === id);
    Object.assign(row, patch);
    return { ok: true, data: { ...row } };
  });
  mocks.deleteTeam = vi.fn(async (id) => {
    if (id === 'team-com-inscritos') {
      return { ok: false, error: { code: '23503', message: 'update or delete on table "cup_teams" violates foreign key constraint' }, unavailable: false };
    }
    teams = teams.filter((t) => t.id !== id);
    return { ok: true, data: null };
  });

  // Fase 4 — a Classificação (com a M2 aplicada, por omissão).
  mocks.updateEditionLinks = vi.fn(async (id, { standings_url }) => {
    const e = editions.find((x) => x.id === id);
    Object.assign(e, { standings_url: standings_url || null });
    return { ok: true, data: { ...e } };
  });
  mocks.setEditionSyncMode = vi.fn(async (id, mode) => {
    const e = editions.find((x) => x.id === id);
    Object.assign(e, { sync_mode: mode });
    return { ok: true, data: { ...e } };
  });
  mocks.listSyncState = vi.fn(async () => ({ ok: true, data: [] }));
  mocks.listRoundPublication = vi.fn(async () => ({ ok: true, data: [] }));
  mocks.listAliases = vi.fn(async () => ({ ok: true, data: [] }));
  mocks.linkAlias = vi.fn(async (id, teamId) => ({ ok: true, data: { id, team_id: teamId } }));
  mocks.listSyncAlerts = vi.fn(async () => ({ ok: true, data: [] }));
  mocks.markRoundPublished = vi.fn(async (roundId) => ({ ok: true, data: { round_id: roundId, results_ready_at: '2026-09-27T10:00:00Z', source: 'manual' } }));
  mocks.runCupSync = vi.fn(async () => ({ ok: true, data: { jornadas: [{ round_no: 1, estado: 'ok', falhas: [], linhas: 596 }] } }));
  mocks.runCupEnsaio = vi.fn(async () => ({ ok: true, data: { modo: 'ensaio', jornadas: [], cruzamento: [] } }));
});

async function openEdition(editionId) {
  render(<CompetitionsTab />);
  const card = await screen.findByText(editionId === 'ed34' ? '34.ª edição' : '33.ª edição', { exact: false });
  fireEvent.click(card.closest('button'));
  return screen.findByText('Jornadas');
}

describe('CompetitionsTab — lista', () => {
  it('mostra as competições com as edições e o estado de cada uma', async () => {
    render(<CompetitionsTab />);
    expect(await screen.findByText('Troféu de Atletismo de Cascais')).toBeInTheDocument();
    expect(screen.getByText(/34\.ª edição/)).toBeInTheDocument();
    expect(screen.getByText(/33\.ª edição/)).toBeInTheDocument();
    expect(screen.getByText('Aberta')).toBeInTheDocument();
    expect(screen.getByText('Por anunciar')).toBeInTheDocument();
  });

  it('mostra aviso de indisponibilidade quando a M1 não está aplicada', async () => {
    mocks.listCompetitions = vi.fn(async () => ({ ok: false, error: { code: 'PGRST205', message: 'missing' }, unavailable: true }));
    render(<CompetitionsTab />);
    expect(await screen.findByText(/ainda não disponível/)).toBeInTheDocument();
  });
});

describe('CompetitionsTab — estado da edição', () => {
  it('"Publicar edição" muda por_anunciar para aberta', async () => {
    await openEdition('ed33');
    expect(await screen.findByText('Publicar edição')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Publicar edição'));
    await waitFor(() => expect(mocks.setEditionStatus).toHaveBeenCalledWith('ed33', 'aberta'));
    expect(await screen.findByText('Fechar edição')).toBeInTheDocument();
  });

  // Pedido do dono (2026-09-27): Aberta ↔ Por anunciar alterna-se quantas
  // vezes for preciso; esconder pede confirmação e não apaga nada.
  it('"Voltar a por anunciar" pede confirmação e alterna com "Publicar edição", ida e volta', async () => {
    await openEdition('ed34');
    fireEvent.click(await screen.findByText('Voltar a "por anunciar"'));
    expect(await screen.findByText(/Quem já está inscrito continua a ver o Troféu/)).toBeInTheDocument();
    // Cancelar não muda nada.
    fireEvent.click(screen.getByText('Cancelar'));
    expect(mocks.setEditionStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Voltar a "por anunciar"'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Voltar a "por anunciar"/ }));
    await waitFor(() => expect(mocks.setEditionStatus).toHaveBeenCalledWith('ed34', 'por_anunciar'));
    expect(await screen.findByText('Publicar edição')).toBeInTheDocument();
    expect(screen.queryByText('Fechar edição')).not.toBeInTheDocument();

    // E de volta a aberta.
    fireEvent.click(screen.getByText('Publicar edição'));
    await waitFor(() => expect(mocks.setEditionStatus).toHaveBeenLastCalledWith('ed34', 'aberta'));
    expect(await screen.findByText('Fechar edição')).toBeInTheDocument();
    expect(mocks.closeEdition).not.toHaveBeenCalled();
  });

  it('"Fechar edição" pede confirmação e só fecha depois de confirmar', async () => {
    // Uma jornada que já passou: a guarda deixa fechar.
    rounds.push({ id: 'r-passada', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: '2025-12-08', date_status: 'confirmada' });
    await openEdition('ed34');
    await waitFor(() => expect(screen.getByText('Fechar edição').closest('button')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Fechar edição'));
    expect(await screen.findByText(/Não há volta atrás/)).toBeInTheDocument();
    // Cancelar não fecha nada.
    fireEvent.click(screen.getByText('Cancelar'));
    expect(mocks.closeEdition).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Fechar edição'));
    await screen.findByText(/Não há volta atrás/);
    const dialogButtons = screen.getAllByText('Fechar edição');
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    await waitFor(() => expect(mocks.closeEdition).toHaveBeenCalledWith('ed34'));
    expect(await screen.findByText(/Encerrada a/)).toBeInTheDocument();
  });
});

describe('CompetitionsTab — jornadas', () => {
  it('cria uma jornada nova sem pré-visualização (ainda sem inscritos)', async () => {
    await openEdition('ed34');
    fireEvent.click(screen.getByText('Nova jornada'));
    fireEvent.change(screen.getByLabelText('Nome da jornada'), { target: { value: 'Padroeira' } });
    fireEvent.click(screen.getByText('Criar jornada'));
    await waitFor(() => expect(mocks.createRound).toHaveBeenCalledTimes(1));
    expect(mocks.createRound.mock.calls[0][0]).toBe('ed34');
    expect(mocks.createRound.mock.calls[0][1]).toMatchObject({ name: 'Padroeira', round_no: 1, date_status: 'provavel' });
    expect(mocks.previewRoundChange).not.toHaveBeenCalled();
    // Depois de criada, os percursos ficam disponíveis no mesmo modal.
    expect(await screen.findByText('Novo percurso')).toBeInTheDocument();
  });

  it('mudar a data de uma jornada existente exige a pré-visualização antes de gravar', async () => {
    rounds.push({ id: 'r1', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: null, date_status: 'provavel' });
    await openEdition('ed34');
    fireEvent.click(await screen.findByText(/Padroeira/));
    const dateInput = await screen.findByLabelText('Data da jornada');
    // Sem mudar nada, o botão está desativado.
    expect(screen.getByText('Confirmar jornada')).toBeDisabled();

    fireEvent.change(dateInput, { target: { value: '2026-12-06' } });
    fireEvent.change(screen.getByLabelText('Estado da data'), { target: { value: 'confirmada' } });
    expect(screen.getByText('Confirmar jornada')).not.toBeDisabled();
    fireEvent.click(screen.getByText('Confirmar jornada'));

    await waitFor(() => expect(mocks.previewRoundChange).toHaveBeenCalledWith('r1', { date: '2026-12-06', date_status: 'confirmada' }));
    // As bandas do impacto aparecem — nunca uma contagem exata.
    expect((await screen.findAllByText('1–19')).length).toBeGreaterThan(0);
    expect(mocks.confirmRoundChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Confirmar e gravar'));
    await waitFor(() => expect(mocks.confirmRoundChange).toHaveBeenCalledWith('r1', { date: '2026-12-06', date_status: 'confirmada' }));
  });

  it('guardar os outros campos não passa por preview_round_change', async () => {
    rounds.push({ id: 'r1', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: null, date_status: 'provavel', location: '' });
    await openEdition('ed34');
    fireEvent.click(await screen.findByText(/Padroeira/));
    fireEvent.change(await screen.findByLabelText('Local'), { target: { value: 'Cascais' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(mocks.updateRound).toHaveBeenCalledWith('r1', expect.objectContaining({ location: 'Cascais' })));
    expect(mocks.previewRoundChange).not.toHaveBeenCalled();
  });

  // Revisão pré-deploy da Fase 1 (2026-09-26): com a releitura a demorar (como
  // na rede), o painel trocava-se por "A carregar jornadas..." e o RoundForm
  // voltava a montar com a jornada de antes. Os mocks imediatos escondiam-no.
  describe('com a releitura lenta (como na rede)', () => {
    const lento = () => {
      const rapido = mocks.listRounds.getMockImplementation();
      mocks.listRounds.mockImplementation(async (...a) => {
        await new Promise((r) => setTimeout(r, 30));
        return rapido(...a);
      });
    };
    const releuVezes = async (n) => {
      await waitFor(() => expect(mocks.listRounds).toHaveBeenCalledTimes(n));
      await new Promise((r) => setTimeout(r, 80));
    };

    it('depois de "Criar jornada" o modal edita a jornada criada — um 2.º toque não a duplica', async () => {
      lento();
      await openEdition('ed34');
      fireEvent.click(await screen.findByText('Nova jornada'));
      fireEvent.change(screen.getByLabelText('Nome da jornada'), { target: { value: 'Padroeira' } });
      fireEvent.click(screen.getByText('Criar jornada'));
      await waitFor(() => expect(mocks.createRound).toHaveBeenCalledTimes(1));
      await releuVezes(2);
      expect(screen.queryByText('Criar jornada')).not.toBeInTheDocument();
      expect(screen.getByText('Novo percurso')).toBeInTheDocument();
      expect(screen.getByLabelText('Nome da jornada')).toHaveValue('Padroeira');
      fireEvent.click(screen.getByText('Guardar'));
      await waitFor(() => expect(mocks.updateRound).toHaveBeenCalledTimes(1));
      expect(mocks.createRound).toHaveBeenCalledTimes(1);
    });

    it('um 2.º "Guardar" não regrava os valores de antes do 1.º', async () => {
      lento();
      rounds.push({ id: 'r1', edition_id: 'ed34', round_no: 1, name: 'A', date: null, date_status: 'provavel', location: '' });
      await openEdition('ed34');
      fireEvent.click(await screen.findByText(/J1 · A/));
      fireEvent.change(await screen.findByLabelText('Nome da jornada'), { target: { value: 'B' } });
      fireEvent.click(screen.getByText('Guardar'));
      await waitFor(() => expect(mocks.updateRound).toHaveBeenCalledTimes(1));
      await releuVezes(2);
      expect(screen.getByLabelText('Nome da jornada')).toHaveValue('B');
      fireEvent.change(screen.getByLabelText('Local'), { target: { value: 'Cascais' } });
      fireEvent.click(screen.getByText('Guardar'));
      await waitFor(() => expect(mocks.updateRound).toHaveBeenCalledTimes(2));
      expect(mocks.updateRound.mock.calls[1][1]).toMatchObject({ name: 'B', location: 'Cascais' });
      expect(rounds[0].name).toBe('B');
    });
  });

  it('apagar uma jornada já corrida mostra o erro do servidor', async () => {
    rounds.push({ id: 'round-corrida', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: '2026-12-06', date_status: 'confirmada' });
    await openEdition('ed34');
    fireEvent.click(await screen.findByText(/Padroeira/));
    fireEvent.click(await screen.findByText('Apagar'));
    fireEvent.click(await screen.findByText('Apagar mesmo assim'));
    expect(await screen.findByText(/marca-a como cancelada em vez de a apagar/)).toBeInTheDocument();
  });

  /* Revisão da Fase 1 (2026-09-26): apagar tira a prova a todos os "Vou" —
     mostra-se primeiro o impacto (§6.2, §9) e sugere-se cancelar. */
  it('apagar pede primeiro a pré-visualização (como cancelada) e só apaga depois de confirmar', async () => {
    rounds.push({ id: 'r1', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: '2026-12-06', date_status: 'confirmada' });
    await openEdition('ed34');
    fireEvent.click(await screen.findByText(/Padroeira/));
    fireEvent.click(await screen.findByText('Apagar'));
    await waitFor(() => expect(mocks.previewRoundChange).toHaveBeenCalledWith('r1', { date_status: 'cancelada' }));
    expect(await screen.findByTestId('round-delete-preview')).toBeInTheDocument();
    expect(mocks.deleteRound).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Apagar mesmo assim'));
    await waitFor(() => expect(mocks.deleteRound).toHaveBeenCalledWith('r1'));
  });

  it('"Marcar como cancelada" em vez de apagar: segue pelo caminho da data, sem apagar nada', async () => {
    rounds.push({ id: 'r1', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: '2026-12-06', date_status: 'confirmada' });
    await openEdition('ed34');
    fireEvent.click(await screen.findByText(/Padroeira/));
    fireEvent.click(await screen.findByText('Apagar'));
    fireEvent.click(await screen.findByText('Marcar como cancelada'));
    fireEvent.click(await screen.findByText('Confirmar e gravar'));
    await waitFor(() => expect(mocks.confirmRoundChange).toHaveBeenCalledWith('r1', { date_status: 'cancelada' }));
    expect(mocks.deleteRound).not.toHaveBeenCalled();
  });
});

describe('CompetitionsTab — clubes', () => {
  it('cria um clube e mostra "por confirmar" quando eligible_final não é dado', async () => {
    await openEdition('ed34');
    fireEvent.click(screen.getByText('Clubes'));
    fireEvent.click(await screen.findByText('Novo clube'));
    fireEvent.change(screen.getByLabelText('Nome do clube'), { target: { value: 'CCD' } });
    const saveButtons = screen.getAllByText('Guardar');
    fireEvent.click(saveButtons[saveButtons.length - 1]);
    await waitFor(() => expect(mocks.createTeam).toHaveBeenCalledWith('ed34', expect.objectContaining({ name: 'CCD', kind: 'clube', eligible_final: null })));
    expect(await screen.findByText('Por confirmar')).toBeInTheDocument();
  });

  it('apagar um clube com inscrições mostra o erro de FK', async () => {
    teams.push({ id: 'team-com-inscritos', edition_id: 'ed34', name: 'CCD', kind: 'clube', eligible_final: null });
    await openEdition('ed34');
    fireEvent.click(screen.getByText('Clubes'));
    await screen.findByText('CCD');
    fireEvent.click(screen.getByLabelText('Apagar CCD'));
    expect(await screen.findByText(/violates foreign key/)).toBeInTheDocument();
  });
});

describe('CompetitionsTab — edição encerrada é só consulta', () => {
  it('não mostra ações de criar jornada nem clube', async () => {
    editions[0].status = 'encerrada';
    editions[0].closed_at = '2026-06-01T00:00:00Z';
    await openEdition('ed34');
    expect(screen.queryByText('Nova jornada')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Clubes'));
    expect(screen.queryByText('Novo clube')).not.toBeInTheDocument();
  });
});

/* ── Fase 4 (2026-09-27) ─────────────────────────────────────────────────
   A guarda do "Fechar edição" (decisão do dono), o link da prova e o da
   geral só no formato do adaptador, e o separador Classificação. */

describe('CompetitionsTab — a guarda do "Fechar edição"', () => {
  const fechar = () => screen.getByText('Fechar edição').closest('button');
  const motivo = () => screen.findByTestId('edition-close-blocker');

  it('sem jornadas: desativado, com o porquê à vista e ligado ao botão', async () => {
    await openEdition('ed34');
    expect(await motivo()).toHaveTextContent('Ainda não dá para fechar: a edição não tem jornadas.');
    expect(fechar()).toBeDisabled();
    expect(fechar()).toHaveAccessibleDescription('Ainda não dá para fechar: a edição não tem jornadas.');
    fireEvent.click(fechar());
    expect(screen.queryByText(/Não há volta atrás/)).not.toBeInTheDocument();
    expect(mocks.closeEdition).not.toHaveBeenCalled();
  });

  it('a última ainda não passou, ou ainda não tem data: desativado com o motivo; as canceladas não contam', async () => {
    rounds.push(
      { id: 'r1', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: '2025-12-08', date_status: 'confirmada' },
      { id: 'r2', edition_id: 'ed34', round_no: 2, name: 'Final', date: '2099-06-13', date_status: 'provavel' },
    );
    const { unmount } = render(<CompetitionsTab />);
    fireEvent.click((await screen.findByText('34.ª edição', { exact: false })).closest('button'));
    expect(await motivo()).toHaveTextContent('Ainda não dá para fechar: a última jornada (2, 13/06) ainda não passou.');
    expect(fechar()).toBeDisabled();
    unmount();

    rounds[1] = { ...rounds[1], date: null };
    const segundo = render(<CompetitionsTab />);
    fireEvent.click((await screen.findByText('34.ª edição', { exact: false })).closest('button'));
    expect(await motivo()).toHaveTextContent('Ainda não dá para fechar: a jornada 2 ainda não tem data.');
    segundo.unmount();

    // A futura cancelada não conta: só passadas → fecha.
    rounds[1] = { ...rounds[1], date: '2099-06-13', date_status: 'cancelada' };
    render(<CompetitionsTab />);
    fireEvent.click((await screen.findByText('34.ª edição', { exact: false })).closest('button'));
    await waitFor(() => expect(fechar()).not.toBeDisabled());
    expect(screen.queryByTestId('edition-close-blocker')).not.toBeInTheDocument();
  });

  it('o diálogo diz o que acontece à geral, e o erro do servidor aparece lá', async () => {
    rounds.push({ id: 'r1', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: '2025-12-08', date_status: 'confirmada' });
    mocks.closeEdition = vi.fn(async () => ({ ok: false, error: { code: '22023', message: 'Ainda não dá para fechar: a última jornada (1, 08/12/2025) ainda não passou.' }, unavailable: false }));
    await openEdition('ed34');
    await waitFor(() => expect(fechar()).not.toBeDisabled());
    fireEvent.click(fechar());
    expect(await screen.findByText(/A classificação geral fica como estiver agora: fecha depois de a da última jornada estar estável/)).toBeInTheDocument();
    const botoes = screen.getAllByText('Fechar edição');
    fireEvent.click(botoes[botoes.length - 1]);
    expect(await screen.findByText('Ainda não dá para fechar: a última jornada (1, 08/12/2025) ainda não passou.')).toBeInTheDocument();
  });
});

describe('CompetitionsTab — o link dos resultados da jornada (formato do adaptador)', () => {
  beforeEach(() => {
    Object.assign(editions[0], { results_source: 'adaptador', results_adapter: 'trofeu_cascais' });
    rounds.push({ id: 'r1', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: '2026-12-06', date_status: 'provavel' });
  });

  it('um link que não é de uma prova do site não se grava: erro por baixo do campo, ao sair e ao gravar', async () => {
    await openEdition('ed34');
    fireEvent.click(await screen.findByText('J1 · Padroeira'));
    const campo = screen.getByLabelText('Link dos resultados individuais');
    expect(campo.getAttribute('placeholder')).toBe('Ex.: https://trofeuatletismocascais.pt/Resultados/727');
    fireEvent.change(campo, { target: { value: 'https://trofeuatletismocascais.pt/Trofeu/17' } });
    fireEvent.blur(campo);
    const erro = await screen.findByRole('alert');
    expect(erro).toHaveTextContent('Cola o link de uma prova do site do Troféu: https://trofeuatletismocascais.pt/Resultados/727');
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo).toHaveAccessibleDescription(/Cola o link de uma prova/);
    fireEvent.click(screen.getByText('Guardar'));
    expect(mocks.updateRound).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: 'https://trofeuatletismocascais.pt/Resultados/727' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(mocks.updateRound).toHaveBeenCalledTimes(1));
    expect(mocks.updateRound.mock.calls[0][1]).toMatchObject({ results_url: 'https://trofeuatletismocascais.pt/Resultados/727' });
  });

  it('o da coletiva fica livre (o site não a dá por GET)', async () => {
    await openEdition('ed34');
    fireEvent.click(await screen.findByText('J1 · Padroeira'));
    fireEvent.change(screen.getByLabelText('Link dos resultados por equipas'), { target: { value: 'https://example.org/coletiva' } });
    fireEvent.click(screen.getByText('Guardar'));
    await waitFor(() => expect(mocks.updateRound).toHaveBeenCalledTimes(1));
    expect(mocks.updateRound.mock.calls[0][1]).toMatchObject({ team_results_url: 'https://example.org/coletiva' });
  });
});

describe('CompetitionsTab — Classificação', () => {
  beforeEach(() => {
    Object.assign(editions[0], {
      results_source: 'adaptador', results_adapter: 'trofeu_cascais', sync_mode: 'desligado', time_zone: 'Europe/Lisbon',
      points_table: [15, 13, 11, 10, 9, 8, 7, 6, 5, 4], standings_url: null,
    });
    rounds.push(
      { id: 'r1', edition_id: 'ed34', round_no: 1, name: 'Padroeira', date: '2025-12-08', date_status: 'confirmada' },
      { id: 'r2', edition_id: 'ed34', round_no: 2, name: 'Final', date: '2099-06-13', date_status: 'provavel' },
    );
    teams.push({ id: 't-naza', edition_id: 'ed34', name: 'Núcleo de Atletismo da Zona da Abóboda (NAZA)', short_name: 'NAZA', kind: 'clube' });
  });

  async function abrirClassificacao() {
    await openEdition('ed34');
    fireEvent.click(screen.getByRole('button', { name: /Classificação/ }));
    return screen.findByTestId('cup-classification-panel');
  }

  it('o link da geral: fora do formato não se grava; o certo grava e reflete-se na edição', async () => {
    await abrirClassificacao();
    const campo = screen.getByTestId('cup-standings-url');
    fireEvent.change(campo, { target: { value: 'https://trofeuatletismocascais.pt/Resultados/727' } });
    fireEvent.click(screen.getByTestId('cup-standings-url-guardar'));
    expect(await screen.findByText('Cola o link da classificação geral: https://trofeuatletismocascais.pt/Trofeu/17')).toBeInTheDocument();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(mocks.updateEditionLinks).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: 'https://trofeuatletismocascais.pt/Trofeu/18' } });
    fireEvent.click(screen.getByTestId('cup-standings-url-guardar'));
    await waitFor(() => expect(mocks.updateEditionLinks).toHaveBeenCalledWith('ed34', { standings_url: 'https://trofeuatletismocascais.pt/Trofeu/18' }, { adapter: 'trofeu_cascais' }));
    expect(await screen.findByText('Link guardado.')).toBeInTheDocument();
  });

  it('o modo: escolher não grava; Observar grava no "Guardar"; Publicar pede confirmação antes', async () => {
    await abrirClassificacao();
    fireEvent.click(screen.getByTestId('cup-sync-observar'));
    expect(mocks.setEditionSyncMode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('cup-sync-guardar'));
    await waitFor(() => expect(mocks.setEditionSyncMode).toHaveBeenCalledWith('ed34', 'observar'));

    fireEvent.click(await screen.findByTestId('cup-sync-publicar'));
    fireEvent.click(screen.getByTestId('cup-sync-guardar'));
    const dialog = await screen.findByTestId('cup-sync-publicar-dialog');
    expect(dialog).toHaveTextContent('Publicar grava a linha de cada inscrito com dorsal e mostra-lha. Só com a autorização da DPAF e depois de o ensaio da 33.ª bater certo.');
    // A marca de "estável" de Observar não conta em Publicar: as jornadas já lidas voltam a ler-se.
    expect(screen.getByTestId('cup-sync-publicar-releitura')).toHaveTextContent('As jornadas já lidas em Observar voltam a ser lidas nas próximas voltas: se a página não mudou, publicam-se logo; se mudou, quando estiver pronta (igual em duas leituras com 6 h).');
    expect(mocks.setEditionSyncMode).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('cup-sync-publicar-confirmar'));
    await waitFor(() => expect(mocks.setEditionSyncMode).toHaveBeenLastCalledWith('ed34', 'publicar'));
  });

  it('sem a M2: os modos desativados, com "Precisa da migração M2 (por aplicar).", e sem "Ler agora"', async () => {
    Object.assign(editions[0], { sync_mode: 'observar' });
    mocks.listSyncState = vi.fn(async () => ({ ok: false, error: { code: '42P01', message: 'relation "public.cup_sync_state" does not exist' }, unavailable: false, m2Missing: true }));
    await abrirClassificacao();
    expect(screen.getByTestId('cup-sync-m2')).toHaveTextContent('Precisa da migração M2 (por aplicar).');
    for (const m of ['desligado', 'observar', 'publicar']) expect(screen.getByTestId(`cup-sync-${m}`)).toBeDisabled();
    expect(screen.queryByTestId('cup-sync-ler-agora')).not.toBeInTheDocument();
    // O ensaio é a exceção: não grava nada que um atleta leia, corre sem a M2 — e a dica di-lo.
    expect(screen.getByTestId('cup-ensaio-correr')).toBeEnabled();
    expect(screen.getByTestId('cup-ensaio-dica')).toHaveTextContent('Não grava nada que os atletas vejam (só um registo agregado, para ti) e por isso corre mesmo sem a migração M2.');
    expect(screen.getByTestId('cup-ensaio-dica')).not.toHaveTextContent('sem gravar nada na base de dados');
  });

  it('"Ler agora" (a observar) chama a função e mostra o resumo', async () => {
    Object.assign(editions[0], { sync_mode: 'observar' });
    await abrirClassificacao();
    fireEvent.click(screen.getByTestId('cup-sync-ler-agora'));
    await waitFor(() => expect(mocks.runCupSync).toHaveBeenCalledWith('ed34'));
    expect(await screen.findByTestId('cup-sync-resumo')).toHaveTextContent('J1 · ok · 596 linhas');
  });

  it('"Ler agora" recusado pelo job: a frase dele', async () => {
    Object.assign(editions[0], { sync_mode: 'publicar' });
    mocks.runCupSync = vi.fn(async () => ({ ok: false, error: { code: 409, message: 'Liga «Observar» ou «Publicar» primeiro.' }, unavailable: false }));
    await abrirClassificacao();
    fireEvent.click(screen.getByTestId('cup-sync-ler-agora'));
    expect(await screen.findByText('Liga «Observar» ou «Publicar» primeiro.')).toBeInTheDocument();
  });

  it('o estado por jornada, e "Classificação publicada" à mão nas que já passaram sem ela', async () => {
    mocks.listSyncState = vi.fn(async () => ({ ok: true, data: [
      { target: 'jornada:r1', round_id: 'r1', last_checked_at: '2025-12-08T18:37:00Z', last_status: 'invariante', last_codes: ['data_da_pagina'], ready_at: null, stable_at: null },
      { target: 'edicao', round_id: null, summary: { dorsais_repetidos_inscricoes: 2 } },
    ] }));
    await abrirClassificacao();
    expect(screen.getByTestId('cup-class-jornada-r1')).toHaveTextContent('J1 Padroeira · 08/12 · lida 08/12 18:37 · invariante: data da página');
    expect(screen.getByTestId('cup-class-jornada-r2')).toHaveTextContent('J2 Final · 13/06 · ainda não lida');
    expect(screen.getByTestId('cup-class-repetidos')).toHaveTextContent('Dorsais repetidos entre inscrições (não ligados): 2');
    // Só a que já passou tem o botão.
    expect(screen.queryByTestId('cup-class-publicada-r2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cup-class-publicada-r1'));
    await waitFor(() => expect(mocks.markRoundPublished).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(screen.queryByTestId('cup-class-publicada-r1')).not.toBeInTheDocument());
    expect(screen.getByTestId('cup-class-jornada-r1')).toHaveTextContent('pronta');
  });

  it('os clubes vistos na geral, por ligar: "Ligar" liga ao clube escolhido', async () => {
    mocks.listAliases = vi.fn(async () => ({ ok: true, data: [
      { id: 'a1', alias_norm: 'nucleo de atletismo da zona da aboboda naza', team_id: null },
      { id: 'a2', alias_norm: 'individual', team_id: 't-ind' },
    ] }));
    await abrirClassificacao();
    expect(screen.queryByTestId('cup-alias-a2')).not.toBeInTheDocument();
    const ligar = screen.getByTestId('cup-alias-ligar-a1');
    expect(ligar).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Clube para "nucleo de atletismo da zona da aboboda naza"'), { target: { value: 't-naza' } });
    fireEvent.click(ligar);
    await waitFor(() => expect(mocks.linkAlias).toHaveBeenCalledWith('a1', 't-naza'));
    await waitFor(() => expect(screen.queryByTestId('cup-alias-a1')).not.toBeInTheDocument());
  });

  it('os alertas recentes desta edição: data, código e jornada', async () => {
    mocks.listSyncAlerts = vi.fn(async () => ({ ok: true, data: [
      { id: 1, level: 'error', message: 'invariante', created_at: '2025-12-08T18:37:00Z', meta: { edition_id: 'ed34', round_id: 'r1', codigos: ['colunas'] } },
      { id: 2, level: 'error', message: 'rede_48h', created_at: '2025-12-09T18:37:00Z', meta: { edition_id: 'outra' } },
    ] }));
    await abrirClassificacao();
    const alertas = screen.getAllByTestId('cup-class-alerta');
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toHaveTextContent('08/12 18:37 · invariante · J1 · colunas');
  });

  it('o ensaio: valida os links antes de enviar; enviado, mostra o relatório (só números)', async () => {
    mocks.runCupEnsaio = vi.fn(async () => ({ ok: true, data: {
      modo: 'ensaio',
      jornadas: [{ url: 'https://trofeuatletismocascais.pt/Resultados/727', estado: 'ok', falhas: [], avisos: [], data: '2025-12-08', k: 1, tabelas: [{}, {}], linhas: 596 }],
      geral: { estado: 'ok', falhas: [], tabelas: 32, linhas: 908, colunas_p: 11, total_igual_soma: 908, ranking_ok: 32, equipas_por_ligar: 27 },
      cruzamento: [{ k: 1, escaloes_que_batem_so_com_pontos: 32, escaloes_que_batem_todos: 2, base_provavel: 'escalao', fora_ocupam_lugar: false, chave_da_geral: { linhas_com_pontos: 438, com_par_unico_na_pagina: 431, ligam_exata: 414, ligam_alternativa: 22, nao_ligam: 2 }, coletiva: { equipas_elegiveis: 14 } }],
    } }));
    await abrirClassificacao();
    fireEvent.change(screen.getByTestId('cup-ensaio-jornadas'), { target: { value: 'https://trofeuatletismocascais.pt/Resultados/727\nhttps://example.org/x' } });
    fireEvent.click(screen.getByTestId('cup-ensaio-correr'));
    expect(await screen.findByText('Cola o link de uma prova do site do Troféu: https://trofeuatletismocascais.pt/Resultados/727')).toBeInTheDocument();
    expect(mocks.runCupEnsaio).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('cup-ensaio-jornadas'), { target: { value: 'https://trofeuatletismocascais.pt/Resultados/727\n\n' } });
    fireEvent.change(screen.getByTestId('cup-ensaio-geral'), { target: { value: 'https://trofeuatletismocascais.pt/Trofeu/17' } });
    fireEvent.click(screen.getByTestId('cup-ensaio-correr'));
    await waitFor(() => expect(mocks.runCupEnsaio).toHaveBeenCalledWith({
      jornadas: ['https://trofeuatletismocascais.pt/Resultados/727'], geral: 'https://trofeuatletismocascais.pt/Trofeu/17',
      pointsTable: [15, 13, 11, 10, 9, 8, 7, 6, 5, 4], adapter: 'trofeu_cascais',
    }));
    const rel = await screen.findByTestId('cup-ensaio-relatorio');
    expect(rel).toHaveTextContent('trofeuatletismocascais.pt/Resultados/727');
    expect(rel).toHaveTextContent('908 de 908');
    expect(rel).toHaveTextContent('32 / 2');
    expect(rel).toHaveTextContent('escalao');
    expect(rel).toHaveTextContent('98%');
    // A chave da geral: quantas ligam pela exata, pela alternativa e quantas não (só números).
    expect(screen.getByTestId('cup-ensaio-chave-geral')).toHaveTextContent('98% · ligam pela exata 414, pela alternativa 22 (por confirmar), não ligam 2');
  });

  it('numa edição encerrada, só consulta: nada se grava nem se corre', async () => {
    Object.assign(editions[0], { status: 'encerrada', closed_at: '2026-06-30T00:00:00Z' });
    await abrirClassificacao();
    expect(screen.getByTestId('cup-standings-url')).toBeDisabled();
    expect(screen.queryByTestId('cup-standings-url-guardar')).not.toBeInTheDocument();
    for (const m of ['desligado', 'observar', 'publicar']) expect(screen.getByTestId(`cup-sync-${m}`)).toBeDisabled();
    expect(screen.queryByTestId('cup-sync-ler-agora')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cup-ensaio-correr')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cup-class-publicada-r1')).not.toBeInTheDocument();
  });
});

