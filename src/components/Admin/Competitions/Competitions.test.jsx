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

vi.mock('../../../utils/cupAdmin', () => ({
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
}));

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

  it('"Fechar edição" pede confirmação e só fecha depois de confirmar', async () => {
    await openEdition('ed34');
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
