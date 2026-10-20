import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import GymRegistration from './GymRegistration';
import { todayISO } from '../../lib/utils';
import { dispensarConfirmacao } from '../../test/recordConfirmation';

// O momento do primeiro registo (3 s de leitura) testa-se em utils/firstRecord
// e em RecordConfirmation; aqui o registo de todos os dias sai como sempre.
vi.mock('../../utils/firstRecord', () => ({ firstRecordMoment: () => null }));

// analyze-gym é a única coisa que estes testes exercitam de facto — tanto
// a foto como o manual gravam a sessão e geram o comentário do Coach numa só
// chamada à Edge Function. Editar passa pelo Gemini quando os dados
// analíticos mudam (séries, métricas, categorias, tipo ou observações);
// mudar só a data/nome é update direto de workout_sessions.
// `updates`/`updatePlanItem`: o store's completePlanItem escreve em
// coach_plan_items (Regista sem vir do botão "Registar sessão" — pedido
// 2026-09-14) — mesmo padrão de rastreio do RunRegistration.test.jsx.
const mocks = vi.hoisted(() => ({ locker: [], invoke: vi.fn(), updateSession: vi.fn(), deleteSets: vi.fn(), insertSets: vi.fn(), updates: [], updatePlanItem: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'workout_sessions') {
        return { update: (payload) => ({ eq: (col, val) => mocks.updateSession(payload, val) }) };
      }
      if (table === 'workout_session_sets') {
        return {
          delete: () => ({ eq: (col, val) => mocks.deleteSets(val) }),
          insert: (rows) => mocks.insertSets(rows),
        };
      }
      if (table === 'athlete_exercises') {
        const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => Promise.resolve({ data: mocks.locker || [], error: null }) };
        return chain;
      }
      if (table === 'coach_plan_items') {
        return { update: (payload) => ({ eq: (col, val) => { mocks.updates.push({ table, payload, id: val }); return mocks.updatePlanItem(payload, val); } }) };
      }
      return {};
    },
  },
  invokeEdgeFunctionWithTimeout: (...args) => mocks.invoke(...args),
}));

// Evita FileReader/Image/canvas do jsdom — a compressão em si já está fora
// deste ficheiro, em src/lib/image.js.
vi.mock('../../lib/image', () => ({
  compressImage: () => Promise.resolve({ dataUrl: 'data:image/jpeg;base64,AAA', base64: 'AAA' }),
}));

const PROFILE = { id: 'user-1' };

const selectPhoto = async () => {
  const input = document.querySelector('input[type="file"]');
  const file = new File(['conteudo'], 'treino.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Print 1');
};

// Ao gravar com séries do plano por confirmar aparece um aviso (revisão
// pré-deploy, N2): nos testes que não são sobre ele, grava-se só o confirmado.
const gravarSoConfirmadasSeHouver = () => {
  const b = screen.queryByRole('button', { name: 'Gravar só as confirmadas' });
  if (b) fireEvent.click(b);
};

describe('GymRegistration — formulário único (registo unificado, F1)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  it('prints opcionais, exercícios e métricas à vista ao mesmo tempo — sem "Foto | Manual"', () => {
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByText('Prints da app de treino (opcional)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: 45m')).toBeInTheDocument();
    expect(screen.getByText('Exercícios e séries')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Manual$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analisar treino/i })).toBeInTheDocument();
  });

  /* O caso do backlog (specs/carol-frases-contexto.md): fala só ela, na
     primeira pessoa — nunca «a IA». */
  it('a dica dos prints fala na voz da Carol, sem nomear a IA', () => {
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByText(/eu leio o que não escreveres abaixo/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bIA\b/);
  });

  it('na criação, as séries e o objetivo vão no pedido manual', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-9' }, sets: [] }, error: null });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }));
    fireEvent.change(screen.getByPlaceholderText('Nome do exercício'), { target: { value: 'Extensões de pernas' } });
    fireEvent.change(screen.getByLabelText(/^Objetivo/), { target: { value: 'chegar às 12' } });
    fireEvent.change(screen.getByLabelText(/^Repetições da série 1 —/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/^Peso da série 1 \(kg\) —/), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const { body } = mocks.invoke.mock.calls[0][1];
    expect(body.mode).toBe('manual');
    expect(body.sets).toEqual([{ exercise_name: 'Extensões de pernas', set_index: 0, reps: 12, weight: 40 }]);
    expect(body.exercises_meta).toEqual([{ name: 'Extensões de pernas', goal: 'chegar às 12', block_type: 'forca', plan_block_index: null, goal_met: null }]);
  });

  it('modo Live: o ✓ de uma série vazia confirma a sugestão da série anterior', () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }));
    fireEvent.change(screen.getByPlaceholderText('Nome do exercício'), { target: { value: 'Prensa' } });
    fireEvent.change(screen.getByLabelText(/^Repetições da série 1 —/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/^Peso da série 1 \(kg\) —/), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: /^\+\s*Série$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Série 2 de .* feita$/ }));
    expect(screen.getByLabelText(/^Repetições da série 2 —/)).toHaveValue(10);
    expect(screen.getByLabelText(/^Peso da série 2 \(kg\) —/)).toHaveValue(80);
  });

  it('cardio: "Bicicleta" muda sozinha para cardio e manda tempo e km', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-9' }, sets: [] }, error: null });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }));
    fireEvent.change(screen.getByPlaceholderText('Nome do exercício'), { target: { value: 'Bicicleta' } });
    fireEvent.change(screen.getByLabelText('Tempo (min) — Bicicleta'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Distância (km) — Bicicleta'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const { body } = mocks.invoke.mock.calls[0][1];
    expect(body.sets).toEqual([{ exercise_name: 'Bicicleta', set_index: 0, reps: null, weight: null, duration_seconds: 1200, distance_km: 8, laps: null }]);
    expect(body.exercises_meta[0].block_type).toBe('cardio');
  });

  it('"Da biblioteca" junta um exercício conhecido, com a última vez como referência', async () => {
    mocks.locker = [{ id: 'x1', name: 'Leg Press', name_key: 'leg press', category: 'Pernas Inferiores', block_type: 'forca', last_weight: 100, last_reps: 10 }];
    useAppStore.setState({ exerciseLocker: [], exerciseLockerUserId: null, session: { user: { id: 'user-1' } } });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Da biblioteca/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Leg Press/ }));
    expect(screen.getByDisplayValue('Leg Press')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Repetições da série/)).toHaveLength(3);
    expect(screen.getByText(/da última vez: 100 kg × 10/)).toBeInTheDocument();
    mocks.locker = [];
  });

  it('com prints, o pedido leva também as séries escritas e as métricas', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-9' }, sets: [] }, error: null });
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }));
    fireEvent.change(screen.getByPlaceholderText('Nome do exercício'), { target: { value: 'Supino' } });
    fireEvent.change(screen.getByLabelText(/^Repetições da série 1 —/), { target: { value: '8' } });
    fireEvent.change(screen.getByPlaceholderText('Ex: 45m'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const { body } = mocks.invoke.mock.calls[0][1];
    expect(body.images).toEqual(['AAA']);
    expect(body.mode).toBeUndefined();
    expect(body.sets).toEqual([{ exercise_name: 'Supino', set_index: 0, reps: 8, weight: null }]);
    expect(body.duration_seconds).toBe(2400);
  });
});

describe('GymRegistration — Analisar treino por foto (analyze-gym)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  it('envia o payload correto (imagens, data, tipo, categorias, observações)', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-1' } }, error: null });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Peito/i }));
    fireEvent.change(screen.getByPlaceholderText('Contexto do treino...'), { target: { value: 'treino pesado' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-gym');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.kind).toBe('forca');
    expect(body.categories).toEqual(['Peito']);
    expect(body.notes).toBe('treino pesado');
  });

  it('acrescenta a sessão devolvida (já com coach_notes e séries combinadas) ao store e fecha o formulário', async () => {
    const newSession = { id: 'sess-1', coach_notes: 'Volume consistente com o habitual.' };
    const sets = [{ id: 'set-1', exercise_name: 'Supino' }];
    mocks.invoke.mockResolvedValue({ data: { session: newSession, sets }, error: null });
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/ }));

    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().gymSessions).toEqual([{ ...newSession, workout_session_sets: sets }]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().gymSessions).toEqual([]);
  });
});

describe('GymRegistration — registo manual também passa pelo Coach (analyze-gym, modo manual)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  // Já não há "Foto | Manual" (registo unificado, F1): sem prints, grava o que está escrito.
  const goManual = () => {};

  it('envia o registo manual para analyze-gym em modo manual, sem imagens', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-2' } }, error: null });
    render(<GymRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByPlaceholderText('Ex: 45m'), { target: { value: '50:00' } });
    fireEvent.click(screen.getByRole('button', { name: '7' }));

    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-gym');
    expect(body.mode).toBe('manual');
    expect(body.images).toBeUndefined();
    expect(body.duration_seconds).toBe(3000);
    expect(body.exertion).toBe(7);
    expect(body.kind).toBe('forca');
  });

  it('acrescenta a sessão devolvida (já com coach_notes e séries combinadas) ao store e fecha o formulário', async () => {
    const newSession = { id: 'sess-2', coach_notes: 'Boa consistência de esforço.' };
    const sets = [{ id: 'set-2', exercise_name: 'Agachamento' }];
    mocks.invoke.mockResolvedValue({ data: { session: newSession, sets }, error: null });
    render(<GymRegistration onClose={onClose} />);
    goManual();

    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().gymSessions).toEqual([{ ...newSession, workout_session_sets: sets }]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a gravar treino.' });
    render(<GymRegistration onClose={onClose} />);
    goManual();

    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await screen.findByText('Falha a gravar treino.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* Pedido 2026-09-14: registar um treino de ginásio SEM vir do botão
   "Registar sessão" de um item específico — o caminho por omissão, já que
   sem esse botão o cartão abre em foto — também tem de fazer desaparecer o
   botão no Início quando bate com um treino de GINÁSIO pendente nesse dia;
   uma corrida planeada no mesmo dia continua pendente — tem de bater o
   TIPO, não só o dia. */
describe('GymRegistration — regista sem vir do botão "Registar sessão" (bate por dia+tipo)', () => {
  const onClose = vi.fn();
  /* `todayISO()` (hora LOCAL), não `new Date().toISOString()` (UTC). A app
     decide o dia com todayISO; um teste que calcule "hoje" em UTC discorda
     dela durante a hora a seguir à meia-noite local (apanhado 2026-09-18
     às 00:49, com o teste a dizer 09-17 e o formulário 09-18), e o item do
     plano deixava de bater com a data do registo. */
  const hojeISO = todayISO();
  // Já não há "Foto | Manual" (registo unificado, F1): sem prints, grava o que está escrito.
  const goManual = () => {};

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { session: { id: 'sess-frio' } }, error: null });
    mocks.updatePlanItem.mockReset().mockResolvedValue({ error: null });
    mocks.updates.length = 0;
    onClose.mockClear();
    useAppStore.setState({
      profile: PROFILE, gymSessions: [], planItemPrefill: null,
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: hojeISO, period_end: hojeISO }],
      coachPlanItems: [],
    });
  });

  it('um treino de ginásio pendente nesse dia risca-se sozinho, sem vir do botão', async () => {
    useAppStore.setState({
      coachPlanItems: [{ id: 'item-ginasio', plan_id: 'p1', planned_date: hojeISO, kind: 'ginasio', status: 'pendente' }],
    });
    render(<GymRegistration onClose={onClose} />);
    goManual();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.updates.some(u => u.table === 'coach_plan_items')).toBe(true));
    const itens = mocks.updates.filter(u => u.table === 'coach_plan_items');
    expect(itens).toHaveLength(1);
    expect(itens[0].id).toBe('item-ginasio');
    expect(itens[0].payload).toMatchObject({ status: 'concluido', actual_date: hojeISO, completed_session_id: 'sess-frio' });
  });

  it('não risca uma corrida planeada nesse dia — o tipo tem de bater, não só o dia', async () => {
    useAppStore.setState({
      coachPlanItems: [{ id: 'item-corrida', plan_id: 'p1', planned_date: hojeISO, kind: 'corrida', training_type: 'longo', status: 'pendente' }],
    });
    render(<GymRegistration onClose={onClose} />);
    goManual();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(useAppStore.getState().gymSessions).toHaveLength(1));
    expect(mocks.updates.some(u => u.table === 'coach_plan_items')).toBe(false);
  });

  it('mesma regra pelo caminho de fotos, que é o método por omissão sem vir do plano', async () => {
    useAppStore.setState({
      coachPlanItems: [{ id: 'item-ginasio', plan_id: 'p1', planned_date: hojeISO, kind: 'ginasio', status: 'pendente' }],
    });
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/ }));

    await waitFor(() => expect(mocks.updates.some(u => u.table === 'coach_plan_items')).toBe(true));
    expect(mocks.updates.find(u => u.table === 'coach_plan_items').id).toBe('item-ginasio');
  });

  it('vindo do botão "Registar sessão" (planItemPrefill), continua a completar exatamente esse item — não outro treino de ginásio do mesmo dia', async () => {
    useAppStore.setState({
      planItemPrefill: { id: 'item-especifico', kind: 'ginasio', planned_date: hojeISO, categories: ['Peito'] },
      coachPlanItems: [
        { id: 'item-especifico', plan_id: 'p1', planned_date: hojeISO, kind: 'ginasio', status: 'pendente' },
        { id: 'item-outro', plan_id: 'p1', planned_date: hojeISO, kind: 'ginasio', status: 'pendente' },
      ],
    });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.updates.some(u => u.table === 'coach_plan_items')).toBe(true));
    const itens = mocks.updates.filter(u => u.table === 'coach_plan_items');
    expect(itens).toHaveLength(1);
    expect(itens[0].id).toBe('item-especifico');
  });
});

describe('GymRegistration — editar sessão existente', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();
  const EXISTING_SESSION = {
    id: 'sess-3',
    date: '2026-01-05',
    kind: 'forca',
    name: 'Peito e Tríceps',
    categories: ['Peito'],
    notes: 'nota antiga',
    duration_seconds: 3000,
    calories_kcal: 400,
    avg_hr: 120,
    max_hr: 150,
    exertion: 7,
    workout_session_sets: [
      { id: 'set-1', exercise_name: 'Supino', set_index: 0, reps: 10, weight: 60 },
      { id: 'set-2', exercise_name: 'Supino', set_index: 1, reps: 8, weight: 65 },
    ],
  };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { session: EXISTING_SESSION, sets: [] }, error: null });
    mocks.updateSession.mockReset().mockResolvedValue({ error: null });
    mocks.deleteSets.mockReset().mockResolvedValue({ error: null });
    mocks.insertSets.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    loadInitialData.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [EXISTING_SESSION], loadInitialData });
  });

  it('pré-preenche os campos, sem seletor Foto/Manual, e mostra os exercícios agrupados', () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    expect(screen.getByText('Editar Treino')).toBeInTheDocument();
    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Peito e Tríceps')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('400')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Supino')).toBeInTheDocument();
    const reps = screen.getAllByLabelText(/Repetições da série/);
    expect(reps).toHaveLength(2);
    expect(reps[0]).toHaveValue(10);
    expect(reps[1]).toHaveValue(8);
    expect(screen.getByRole('button', { name: /Guardar alterações/i })).toBeInTheDocument();
  });

  it('mudar só o nome faz update direto, sem chamar o Gemini', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.change(screen.getByDisplayValue('Peito e Tríceps'), { target: { value: 'Push A' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar alterações/i }));

    await waitFor(() => expect(mocks.updateSession).toHaveBeenCalledTimes(1));
    const [payload, sessionId] = mocks.updateSession.mock.calls[0];
    expect(sessionId).toBe('sess-3');
    expect(payload).toEqual({ date: '2026-01-05', name: 'Push A' });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.deleteSets).not.toHaveBeenCalled();
    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('editar uma série e adicionar um exercício novo passa pelo Coach', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    // O exercício novo entra no TOPO (bug #69, 2026-10-19): fica antes do Supino.
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }));
    const nameInputs = screen.getAllByPlaceholderText('Nome do exercício');
    fireEvent.change(nameInputs[0], { target: { value: 'Fondos' } });
    const reps = screen.getAllByLabelText(/Repetições da série/);
    fireEvent.change(reps[0], { target: { value: '15' } });
    fireEvent.change(reps[1], { target: { value: '12' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-gym');
    expect(body.mode).toBe('manual');
    expect(body.session_id).toBe('sess-3');
    expect(body.sets).toContainEqual({ exercise_name: 'Supino', set_index: 0, reps: 12, weight: 60 });
    expect(body.sets).toContainEqual({ exercise_name: 'Fondos', set_index: 0, reps: 15, weight: null });
    // Quem grava é a Edge Function — o cliente já não mexe nas séries.
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(mocks.deleteSets).not.toHaveBeenCalled();
    await waitFor(() => expect(loadInitialData).toHaveBeenCalledWith('user-1'));
  });

  it('mudar o esforço passa pelo Coach — é métrica analítica', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.exertion).toBe(9);
    expect(body.session_id).toBe('sess-3');
  });

  it('mudar só as observações também passa pelo Coach', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.change(screen.getByDisplayValue('nota antiga'), { target: { value: 'dor no ombro a meio' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.notes).toBe('dor no ombro a meio');
  });

  it('um erro do Coach não fecha o formulário nem perde as alterações', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.change(screen.getAllByLabelText(/Repetições da série/)[0], { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText(/Repetições da série/)[0]).toHaveValue(12);
  });
});

// Regressão: trocar de separador pela barra de navegação (Início, Calendário,
// Dashboard, Coach) com o formulário sujo desmontava-o sem aviso nenhum — só
// o botão X do próprio ecrã estava protegido. E na primeira correção, o
// próprio navGuard ainda ativo bloqueava-se a si mesmo quando handleClose()
// tentava completar a navegação pendente (mesma armadilha documentada em
// Perfil.jsx/RunAgenda.jsx: o guard só é limpo no cleanup do useEffect,
// que corre num render seguinte, não já a seguir a onClose()).
describe('GymRegistration — guarda de navegação com formulário sujo', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();
  const EXISTING_SESSION = {
    id: 'sess-3',
    date: '2026-01-05',
    kind: 'forca',
    name: 'Peito e Tríceps',
    categories: ['Peito'],
    notes: 'nota antiga',
    duration_seconds: 3000,
    calories_kcal: 400,
    avg_hr: 120,
    max_hr: 150,
    exertion: 7,
    workout_session_sets: [
      { id: 'set-1', exercise_name: 'Supino', set_index: 0, reps: 10, weight: 60 },
    ],
  };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { session: EXISTING_SESSION, sets: [] }, error: null });
    mocks.updateSession.mockReset().mockResolvedValue({ error: null });
    mocks.deleteSets.mockReset().mockResolvedValue({ error: null });
    mocks.insertSets.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    loadInitialData.mockClear();
    // navGuard/activeTab são estado real da store (não mockado) — o teste
    // exercita exatamente o que Layout.jsx chama ao tocar num separador.
    useAppStore.setState({
      profile: PROFILE,
      gymSessions: [EXISTING_SESSION],
      loadInitialData,
      activeTab: 'ginasio',
      navGuard: null,
    });
  });

  // O campo de nome NÃO marca o formulário como sujo (só duração, calorias,
  // FC média/máx. e esforço o fazem — ver setIsFormDirty(true) no ficheiro
  // fonte); usar o esforço é o caminho real que a UI oferece.
  const dirtyTheForm = () => {
    fireEvent.click(screen.getByRole('button', { name: '9' }));
  };

  // O navGuard corre fora de qualquer evento React (é chamado diretamente
  // na store, tal como Layout.jsx faria ao tocar num separador) — sem act(),
  // o setShowUnsavedModal(true) lá dentro não fica refletido no DOM a tempo
  // da asserção seguinte.
  const attemptLeave = (target) => {
    let navigated;
    act(() => { navigated = useAppStore.getState().setActiveTab(target); });
    return navigated;
  };

  it('regista um navGuard assim que o formulário fica sujo, e limpa-o quando limpo', () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);
    expect(useAppStore.getState().navGuard).toBeNull();

    dirtyTheForm();
    expect(useAppStore.getState().navGuard).toBeInstanceOf(Function);
  });

  it('trocar de separador com o formulário sujo mostra o aviso em vez de navegar logo', () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);
    dirtyTheForm();

    const navigated = attemptLeave('home');

    expect(navigated).toBe(false);
    expect(useAppStore.getState().activeTab).toBe('ginasio');
    expect(screen.getByText('Tens alterações por gravar')).toBeInTheDocument();
  });

  it('"Sair sem gravar" descarta o formulário E completa a navegação pendente', () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);
    dirtyTheForm();
    attemptLeave('home');

    fireEvent.click(screen.getByRole('button', { name: 'Sair sem gravar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // A parte que a correção original esquecia: sem limpar o navGuard antes
    // de navegar, este setActiveTab ficava preso a bloquear-se a ele mesmo.
    expect(useAppStore.getState().activeTab).toBe('home');
    expect(useAppStore.getState().navGuard).toBeNull();
  });

  it('"Cancelar" fecha o aviso e mantém o formulário aberto, sem navegar', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);
    dirtyTheForm();
    attemptLeave('home');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeTab).toBe('ginasio');
    // PremiumModal anima a saída (~400ms) antes de desmontar — o título ainda
    // está no DOM logo a seguir ao clique, só desaparece passado esse tempo.
    await waitFor(() => {
      expect(screen.queryByText('Tens alterações por gravar')).not.toBeInTheDocument();
    });
    // O formulário continua sujo — uma segunda tentativa de sair tem de voltar a avisar.
    expect(attemptLeave('coach')).toBe(false);
  });

  it('fechar pelo botão X sem alterações não deixa navGuard nenhum registado', () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.click(screen.getByLabelText('Fechar'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().navGuard).toBeNull();
  });
});

// Bug relatado 2026-08-30: formulários perdiam todo o texto ao trocar de app
// e voltar — o Android descarta a página em segundo plano e recarrega do
// zero, apagando o estado em memória. Ver src/utils/formDraftPersistence.js
// e a mesma correção em RunAgenda.jsx (RunAgenda.test.jsx tem o padrão).
describe('GymRegistration — BUG CORRIGIDO (2026-08-30) — rascunho sobrevive a voltar de outra app', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    localStorage.clear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  it('treino NOVO: nome escrito sobrevive a um "recarregamento" (remount) da app', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<GymRegistration onClose={onClose} />);
      fireEvent.change(screen.getByPlaceholderText('Nome do treino'), { target: { value: 'Treino a meio de preencher' } });

      // Debounce da persistência (formDraftPersistence.js).
      vi.advanceTimersByTime(700);

      unmount();

      // "Reabrir a app" — nova instância do componente, tal como acontece
      // quando o Android recarrega a página ao voltar de outra app e apaga
      // todo o estado em memória.
      render(<GymRegistration onClose={onClose} />);

      expect(screen.getByPlaceholderText('Nome do treino').value).toBe('Treino a meio de preencher');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gravar com sucesso limpa o rascunho — o próximo treino novo não vem com nome antigo', async () => {
    // Simula um rascunho já persistido de uma sessão anterior (poupa esperar
    // pelo debounce real de formDraftPersistence.js).
    localStorage.setItem('ironcoach:treino-rascunho:nova', JSON.stringify({ name: 'Rascunho Antigo' }));
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-9' }, sets: [] }, error: null });

    const { unmount } = render(<GymRegistration onClose={onClose} />);
    expect(screen.getByPlaceholderText('Nome do treino').value).toBe('Rascunho Antigo');

    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    unmount();

    expect(localStorage.getItem('ironcoach:treino-rascunho:nova')).toBeNull();

    // Próximo treino novo: sem vestígios do rascunho gravado.
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByPlaceholderText('Nome do treino').value).toBe('');
  });
});


// Ponto 2 do handoff: a ação primária de cada ecrã de registo vive na barra
// de ação fixa (ActionBar), não no fim do formulário — antes ficava sempre
// abaixo da dobra.
describe('GymRegistration — ação primária na ActionBar', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: PROFILE, workoutSessions: [] });
  });

  it('renderiza o botão primário dentro da barra de ação fixa', () => {
    render(<GymRegistration onClose={() => {}} />);
    const bar = screen.getByTestId('action-bar');
    expect(bar).toContainElement(screen.getByRole('button', { name: /Analisar treino/i }));
  });
});


/* Hora de início do treino (specs/plano-de-prova.md, "A véspera e a hora").
   Opcional, ao lado da data, e sem valor por omissão. Quem insere a linha em
   `workout_sessions` é a analyze-gym, que não a conhece — a hora é um update
   de uma coluna logo a seguir. */
describe('GymRegistration — hora de início', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();

  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.updateSession.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    loadInitialData.mockClear();
    localStorage.clear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [], loadInitialData });
  });

  it('treino novo: a hora escrita grava-se em workout_sessions.start_time a seguir à análise', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-9' }, sets: [] }, error: null });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Hora do treino'), { target: { value: '19:00' } });

    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.updateSession).toHaveBeenCalledTimes(1));
    expect(mocks.updateSession.mock.calls[0]).toEqual([{ start_time: '19:00' }, 'sess-9']);
    // A análise não leva a hora: a Edge Function não a conhece.
    expect(mocks.invoke.mock.calls[0][1].body.start_time).toBeUndefined();
    expect(useAppStore.getState().gymSessions[0].start_time).toBe('19:00');
  });

  it('sem hora escrita não há update nenhum — o campo é mesmo opcional', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-9' }, sets: [] }, error: null });
    render(<GymRegistration onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.updateSession).not.toHaveBeenCalled();
  });

  it("a editar: a hora da BD ('19:00:00') abre como 19:00 e mudá-la não custa uma reanálise", async () => {
    const SESSION = {
      id: 'sess-10', date: '2026-01-05', kind: 'forca', name: 'Peito e Tríceps',
      categories: ['Peito'], notes: null, duration_seconds: 3000, start_time: '19:00:00',
      workout_session_sets: [],
    };
    useAppStore.setState({ profile: PROFILE, gymSessions: [SESSION], loadInitialData });
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-10" />);

    const campo = screen.getByLabelText('Hora do treino');
    expect(campo.value).toBe('19:00');

    fireEvent.change(campo, { target: { value: '20:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar alterações/i }));

    await waitFor(() => expect(
      mocks.updateSession.mock.calls.some(([payload]) => payload.start_time === '20:30'),
    ).toBe(true));
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

// Desde 2026-09-25 (migration 20260925162654) `categories` são sempre grupos
// musculares; a modalidade de uma aula vai em `class_types`.
describe('GymRegistration — aula: modalidade e grupos musculares à parte', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { session: { id: 'sess-9' }, sets: [] }, error: null });
    mocks.updateSession.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [], loadInitialData });
  });

  // Já não há "Foto | Manual" (registo unificado, F1): sem prints, grava o que está escrito.
  const goManual = () => {};

  it('numa aula há dois seletores, e a modalidade vai em class_types, os grupos em categories', async () => {
    render(<GymRegistration onClose={onClose} />);
    goManual();
    fireEvent.click(screen.getByRole('button', { name: /Aula/ }));

    expect(screen.getByText(/Tipo de aula/)).toBeInTheDocument();
    expect(screen.getByText(/Grupos musculares \(opcional\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'HIIT' }));
    fireEvent.click(screen.getByRole('button', { name: 'Peito' }));
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.kind).toBe('aula');
    expect(body.class_types).toEqual(['HIIT']);
    expect(body.categories).toEqual(['Peito']);
  });

  it('num treino de força não há modalidade, e mudar o tipo não apaga os grupos musculares', async () => {
    render(<GymRegistration onClose={onClose} />);
    goManual();
    fireEvent.click(screen.getByRole('button', { name: /Aula/ }));
    fireEvent.click(screen.getByRole('button', { name: 'HIIT' }));
    fireEvent.click(screen.getByRole('button', { name: 'Costas' }));
    fireEvent.click(screen.getByRole('button', { name: /Força/ }));

    expect(screen.queryByText(/Tipo de aula/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.kind).toBe('forca');
    expect(body.class_types).toEqual([]);
    expect(body.categories).toEqual(['Costas']);
  });

  it('sem grupos musculares escolhidos, avisa que a Carol os tira das observações', () => {
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByText('Se não escolheres, a Carol tira-os das observações.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Peito' }));
    expect(screen.getByRole('button', { name: 'Peito' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Se não escolheres, a Carol tira-os das observações.')).not.toBeInTheDocument();
  });

  it('editar uma aula antiga (modalidade já em class_types) mantém-na e manda os grupos vazios para a Carol os inferir', async () => {
    const AULA = {
      id: 'sess-aula', date: '2026-09-25', kind: 'aula', name: 'Aula funcional',
      class_types: ['Treino Funcional', 'CrossFit'], categories: [],
      notes: 'Wall ball, peso morto com 20kg, remo na máquina', workout_session_sets: [],
    };
    useAppStore.setState({ profile: PROFILE, gymSessions: [AULA], loadInitialData });
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-aula" />);

    // Mudar só o nome não passa pela Carol — nem com os grupos vazios.
    fireEvent.change(screen.getByDisplayValue('Aula funcional'), { target: { value: 'Funcional de sexta' } });
    expect(screen.getByRole('button', { name: /Guardar alterações/ })).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue(/Wall ball/), { target: { value: 'Wall ball, peso morto com 20kg, remo na máquina, flexões' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.mode).toBe('manual');
    expect(body.session_id).toBe('sess-aula');
    expect(body.class_types).toEqual(['Treino Funcional', 'CrossFit']);
    expect(body.categories).toEqual([]);
  });
});

describe('GymRegistration — ler os prints e as notas para o formulário (F2, Opção A)', () => {
  const onClose = vi.fn();
  const PREVIEW = {
    session_name: 'Pernas', categories: ['Pernas Inferiores'], class_types: [],
    metrics: { duration_seconds: 3000, calories_kcal: null, avg_hr: null, max_hr: null, exertion: null },
    exercises: [{ name: 'Extensões de pernas', type: 'forca', plan_block_index: null, sets: [{ reps: 12, weight: 40, duration_seconds: null, distance_km: null, laps: null }] }],
  };

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  // Bug #72 (2026-10-19): já não há botão "Ler os prints e preencher" — a
  // Carol lê os prints ao "Analisar treino" e o que ele escreveu ganha
  // (servidor: mergeMetrics, mergeTypedWithRead).
  it('com prints: sem botão de ler, uma nota diz que a leitura é automática, e gravar lê os prints (reviewed: false)', async () => {
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();
    expect(screen.queryByRole('button', { name: /Ler os prints e preencher/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('photo-auto-read-note')).toHaveTextContent('Ao analisar, leio os prints sozinha');
    expect(screen.getByTestId('photo-auto-read-note')).toHaveTextContent('não apago nada');

    mocks.invoke.mockResolvedValueOnce({ data: { session: { id: 'sess-1' }, sets: [] }, error: null });
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const { body } = mocks.invoke.mock.calls[0][1];
    expect(body.mode).toBeUndefined();
    expect(body.reviewed).toBe(false);
    expect(body.images).toEqual(['AAA']);
  });

  it('só com notas: aparece "Preencher o formulário com isto" e lê sem imagens', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { preview: PREVIEW, readable: true }, error: null });
    render(<GymRegistration onClose={onClose} />);
    expect(screen.queryByRole('button', { name: /Preencher o formulário com isto/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Contexto do treino...'), { target: { value: '3x12 extensões 40kg' } });
    fireEvent.click(screen.getByRole('button', { name: /Preencher o formulário com isto/ }));

    await waitFor(() => expect(screen.getByDisplayValue('Extensões de pernas')).toBeInTheDocument());
    const { body } = mocks.invoke.mock.calls[0][1];
    expect(body).toMatchObject({ mode: 'preview', images: [], notes: '3x12 extensões 40kg' });
    // Só notas não marca nada como "revisto": gravar é o registo normal.
    mocks.invoke.mockResolvedValueOnce({ data: { session: { id: 'sess-1' }, sets: [] }, error: null });
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    expect(mocks.invoke.mock.calls[1][1].body.mode).toBe('manual');
  });

  it('uma leitura das observações sem nada legível avisa', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { preview: { ...PREVIEW, exercises: [], metrics: {}, categories: [], session_name: '' }, readable: false }, error: null });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Contexto do treino...'), { target: { value: 'treino leve' } });
    fireEvent.click(screen.getByRole('button', { name: /Preencher o formulário com isto/ }));
    expect(await screen.findByText(/Não percebi exercícios nas observações/)).toBeInTheDocument();
  });

  it('um erro da leitura aparece e o botão volta a ficar livre', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: 'O Coach está ocupado.' });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Contexto do treino...'), { target: { value: '3x12 extensões' } });
    fireEvent.click(screen.getByRole('button', { name: /Preencher o formulário com isto/ }));
    expect(await screen.findByText('O Coach está ocupado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preencher o formulário com isto/ })).not.toBeDisabled();
  });
});

describe('GymRegistration — plano só com texto (bug #70)', () => {
  const onClose = vi.fn();
  const hojeISO = todayISO();
  const NOTAS = 'Sessão de máquinas guiadas de pernas: cadeira extensora, cadeira flexora e gémeos (3-4 séries de 10-12 reps).';
  const PREVIEW_PLANO = {
    session_name: 'Pernas', categories: ['Pernas Inferiores'], class_types: [],
    metrics: { duration_seconds: null, calories_kcal: null, avg_hr: null, max_hr: null, exertion: null },
    exercises: [
      { name: 'Cadeira extensora', type: 'forca', plan_block_index: null, sets: [12, 12, 12].map(reps => ({ reps, weight: null, duration_seconds: null, distance_km: null, laps: null })) },
      { name: 'Gémeos', type: 'forca', plan_block_index: null, sets: [] },
    ],
  };

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
  });

  it('vindo do Início com um treino do plano sem prescrição, o texto vem para as notas e só é lido ao tocar no botão', async () => {
    useAppStore.setState({
      profile: PROFILE, gymSessions: [], exerciseLocker: [],
      planItemPrefill: { id: 'item-txt', kind: 'ginasio', planned_date: hojeISO, notes: NOTAS, prescription: null },
    });
    mocks.invoke.mockResolvedValueOnce({ data: { preview: PREVIEW_PLANO, readable: true }, error: null });
    render(<GymRegistration onClose={onClose} />);
    expect(await screen.findByDisplayValue(NOTAS)).toBeInTheDocument();
    // Cada leitura é uma chamada ao Gemini: abrir o ecrã não chama nada.
    await new Promise(r => setTimeout(r, 20));
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Preencher o formulário com isto/ }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({ mode: 'preview', images: [], notes: NOTAS });
    expect(await screen.findByDisplayValue('Cadeira extensora')).toBeInTheDocument();
    // Nomeado sem números: entra com uma série vazia para ele preencher.
    expect(screen.getByDisplayValue('Gémeos')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Repetições da série/).length).toBe(4);
  });

  it('com prescrição não lê o texto (já vem preenchido pelos blocos)', async () => {
    useAppStore.setState({
      profile: PROFILE, gymSessions: [], exerciseLocker: [],
      planItemPrefill: { id: 'item-blk', kind: 'ginasio', planned_date: hojeISO, notes: NOTAS, prescription: { blocks: [{ type: 'forca', name: 'Extensões', sets: 3, reps: 12 }] } },
    });
    render(<GymRegistration onClose={onClose} />);
    expect(await screen.findByDisplayValue('Extensões')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});

describe('GymRegistration — pré-preenchimento pelo plano (F3)', () => {
  const onClose = vi.fn();
  const hojeISO = todayISO();
  const PRESCRIPTION = { blocks: [
    { type: 'forca', name: 'Extensões de pernas', sets: 3, reps: 12, goal: 'chegar às 12 sem falhar' },
    { type: 'cardio', name: 'Bicicleta', duration_min: 20, goal: 'Z2' },
  ] };
  const ITEM = { id: 'item-1', plan_id: 'p1', planned_date: hojeISO, kind: 'ginasio', status: 'pendente', categories: ['Pernas Inferiores'], target_duration_min: 45, prescription: PRESCRIPTION };
  const LOCKER = [{ id: 'l1', name: 'Extensões de pernas', name_key: 'extensoes de pernas', category: 'Pernas Inferiores', block_type: 'forca', last_weight: 40, last_reps: 10 }];

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { session: { id: 'sess-plano' }, sets: [] }, error: null });
    mocks.updatePlanItem.mockReset().mockResolvedValue({ error: null });
    mocks.updates.length = 0;
    mocks.locker = LOCKER;
    onClose.mockClear();
    useAppStore.setState({
      profile: PROFILE, gymSessions: [], planItemPrefill: null, exerciseLocker: [], exerciseLockerUserId: null,
      session: { user: { id: 'user-1' } },
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: hojeISO, period_end: hojeISO }],
      coachPlanItems: [ITEM],
    });
  });
  afterEach(() => { mocks.locker = []; });

  it('sem treino do plano nesse dia, não há banner', () => {
    useAppStore.setState({ coachPlanItems: [] });
    render(<GymRegistration onClose={onClose} />);
    expect(screen.queryByRole('region', { name: 'Treino do plano' })).not.toBeInTheDocument();
  });

  it('um treino pendente: banner com o treino; "Usar o plano" preenche exercícios, objetivo e os kg da última vez', async () => {
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByRole('region', { name: 'Treino do plano' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));

    expect(screen.getByText(/A usar o plano/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Extensões de pernas')).toBeInTheDocument();
    expect(screen.getByDisplayValue('chegar às 12 sem falhar')).toBeInTheDocument();
    // Os alvos são SUGESTÃO: vazios, com o alvo e o kg da última vez à vista.
    const reps = screen.getAllByLabelText(/Repetições da série/);
    expect(reps).toHaveLength(3);
    reps.forEach(r => { expect(r).toHaveValue(null); expect(r).toHaveAttribute('placeholder', '12'); });
    // O kg vem da última execução (Armário), que chega depois.
    await waitFor(() => screen.getAllByLabelText(/Peso da série/).forEach(w => expect(w).toHaveAttribute('placeholder', '40')));
    expect(screen.getByLabelText('Tempo (min) — Bicicleta')).toHaveAttribute('placeholder', '20');
    expect(screen.getByText(/Os números do plano são sugestão/)).toBeInTheDocument();
    // "Marcar todas" confirma o exercício inteiro tal e qual.
    fireEvent.click(screen.getByRole('button', { name: /Marcar todas as séries de Extensões de pernas/ }));
    screen.getAllByLabelText(/Repetições da série/).forEach(r => expect(r).toHaveValue(12));
    screen.getAllByLabelText(/Peso da série/).forEach(w => expect(w).toHaveValue(40));
    expect(screen.getByPlaceholderText('Ex: 45m')).toHaveValue('45');
  });

  it('séries do plano por confirmar não se gravam como feitas; só as confirmadas contam', async () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    await waitFor(() => expect(screen.getAllByLabelText(/Peso da série/)[0]).toHaveAttribute('placeholder', '40'));
    // Fez 2 das 3 séries.
    fireEvent.click(screen.getByRole('button', { name: /^Série 1 de Extensões de pernas feita$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Série 2 de Extensões de pernas feita$/ }));
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body.sets).toEqual([
      { exercise_name: 'Extensões de pernas', set_index: 0, reps: 12, weight: 40 },
      { exercise_name: 'Extensões de pernas', set_index: 1, reps: 12, weight: 40 },
    ]);
  });

  it('gravar depois de "Usar o plano": liga o item com completion_source plano e manda o plan_block_index', async () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();

    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0]).toMatchObject({ id: 'item-1', payload: { status: 'concluido', completion_source: 'plano' } });
    const { body } = mocks.invoke.mock.calls[0][1];
    // A análise recebe o treino do plano e a origem, para comparar o planeado com o feito.
    expect(body).toMatchObject({ plan_item_id: 'item-1', completion_source: 'plano' });
    expect(body.exercises_meta).toEqual([
      { name: 'Extensões de pernas', goal: 'chegar às 12 sem falhar', block_type: 'forca', plan_block_index: 0, goal_met: null },
      { name: 'Bicicleta', goal: 'Z2', block_type: 'cardio', plan_block_index: 1, goal_met: null },
    ]);
  });

  it('"Treino livre": campos vazios, e gravar risca o item do dia como automático', async () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Treino livre' }));
    expect(screen.getByText(/Treino livre — conto-o como o treino do plano de hoje/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do exercício')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();

    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0]).toMatchObject({ id: 'item-1', payload: { completion_source: 'auto' } });
  });

  it('sem escolher nada no banner, gravar também conta como automático', async () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0].payload.completion_source).toBe('auto');
    // O pedido à análise leva o mesmo item e a origem 'auto' — o treino livre reconhece-se lá.
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({ plan_item_id: 'item-1', completion_source: 'auto' });
  });

  it('dois treinos no dia: escolhe-se qual, e é esse que se liga', async () => {
    const SEGUNDO = { ...ITEM, id: 'item-2', categories: ['Peito'], target_duration_min: 30, prescription: { blocks: [{ type: 'forca', name: 'Supino', sets: 4, reps: 8 }] } };
    useAppStore.setState({ coachPlanItems: [ITEM, SEGUNDO] });
    render(<GymRegistration onClose={onClose} />);
    const usar = screen.getAllByRole('button', { name: /^Usar o plano/ });
    expect(usar).toHaveLength(2);
    fireEvent.click(usar[1]);
    expect(screen.getByDisplayValue('Supino')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Repetições da série/)).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0]).toMatchObject({ id: 'item-2', payload: { completion_source: 'plano' } });
  });

  it('"Mudar" volta a mostrar a escolha', () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Treino livre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mudar' }));
    expect(screen.getByRole('button', { name: /^Usar o plano/ })).toBeInTheDocument();
  });

  it('vindo de "Registar sessão": ligado, sem banner, com os exercícios do plano e source plano', async () => {
    useAppStore.setState({ planItemPrefill: ITEM });
    render(<GymRegistration onClose={onClose} />);
    expect(screen.queryByRole('region', { name: 'Treino do plano' })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Extensões de pernas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0]).toMatchObject({ id: 'item-1', payload: { completion_source: 'plano' } });
  });

  it('um item de um plano antigo (sem prescrição) segue como antes: grupos e duração, sem exercícios', () => {
    useAppStore.setState({ coachPlanItems: [{ ...ITEM, prescription: null }] });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    expect(screen.getByPlaceholderText('Ex: 45m')).toHaveValue('45');
    expect(screen.queryByLabelText('Nome do exercício')).not.toBeInTheDocument();
  });
});

describe('GymRegistration — a escolha do plano e a data (revisão pré-deploy)', () => {
  const onClose = vi.fn();
  const hojeISO = todayISO();
  const ITEM = { id: 'item-1', plan_id: 'p1', planned_date: hojeISO, kind: 'ginasio', status: 'pendente', categories: ['Peito'], prescription: { blocks: [{ type: 'forca', name: 'Supino', sets: 3, reps: 8 }] } };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { session: { id: 's' }, sets: [] }, error: null });
    mocks.updatePlanItem.mockReset().mockResolvedValue({ error: null });
    mocks.updates.length = 0;
    onClose.mockClear();
    localStorage.clear();
    useAppStore.setState({
      profile: PROFILE, gymSessions: [], planItemPrefill: null, session: { user: { id: 'user-1' } },
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: hojeISO, period_end: hojeISO }],
      coachPlanItems: [ITEM],
    });
  });

  it('mudar a data depois de "Usar o plano" desfaz a escolha — o item de hoje não fica ligado a outro dia', async () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    const ontem = new Date(Date.parse(hojeISO + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText('Data do treino'), { target: { value: ontem } });
    expect(screen.queryByRole('region', { name: 'Treino do plano' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body.plan_item_id).toBeUndefined();
    expect(mocks.updates).toHaveLength(0);
  });

  it('a escolha do plano sobrevive a recarregar a app (rascunho)', async () => {
    const { unmount } = render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    await new Promise(r => setTimeout(r, 700));
    unmount();
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByText(/A usar o plano/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0].payload.completion_source).toBe('plano');
  });
});

describe('GymRegistration — ronda 3 da revisão pré-deploy (N1–N4, N2, N10)', () => {
  const onClose = vi.fn();
  const hojeISO = todayISO();
  const ontemISO = new Date(Date.parse(hojeISO + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const RX = { blocks: [{ type: 'forca', name: 'Prensa', sets: 3, reps: 12 }] };
  const item = (over = {}) => ({ id: 'item-1', plan_id: 'p1', planned_date: hojeISO, kind: 'ginasio', status: 'pendente', categories: ['Pernas'], prescription: RX, ...over });

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { session: { id: 's' }, sets: [] }, error: null });
    mocks.updatePlanItem.mockReset().mockResolvedValue({ error: null });
    mocks.updates.length = 0;
    mocks.locker = [{ id: 'l', name: 'Prensa', name_key: 'prensa', category: 'Pernas', block_type: 'forca', last_weight: 100, last_reps: 10 }];
    onClose.mockClear();
    localStorage.clear();
    useAppStore.setState({
      profile: PROFILE, gymSessions: [], planItemPrefill: null, exerciseLocker: [], exerciseLockerUserId: null,
      session: { user: { id: 'user-1' } },
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: ontemISO, period_end: hojeISO }],
      coachPlanItems: [item()],
    });
  });
  afterEach(() => { mocks.locker = []; });

  it('N2: gravar com séries do plano por confirmar pergunta; "Marcar todas" grava o plano com o kg da última vez', async () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    await waitFor(() => expect(screen.getAllByLabelText(/Peso da série/)[0]).toHaveAttribute('placeholder', '100'));
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    expect(screen.getByRole('alertdialog', { name: 'Há séries do plano por confirmar' })).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como feitas e gravar' }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body.sets.map(r => [r.reps, r.weight])).toEqual([[12, 100], [12, 100], [12, 100]]);
  });

  it('N2: "Voltar" fecha o aviso sem gravar', () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('N10: numa série do plano com as reps escritas e o kg em branco, grava-se o kg que estava à vista', async () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    await waitFor(() => expect(screen.getAllByLabelText(/Peso da série/)[0]).toHaveAttribute('placeholder', '100'));
    fireEvent.change(screen.getByLabelText(/^Repetições da série 1 —/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body.sets).toEqual([{ exercise_name: 'Prensa', set_index: 0, reps: 10, weight: 100 }]);
  });

  it('N1: vindo de "Registar sessão", mudar a data mantém a ligação ao item (o treino passou para outro dia)', async () => {
    useAppStore.setState({ planItemPrefill: item({ planned_date: ontemISO }), coachPlanItems: [item({ planned_date: ontemISO })] });
    render(<GymRegistration onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Data do treino'), { target: { value: hojeISO } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.updates).toHaveLength(1));
    expect(mocks.updates[0]).toMatchObject({ id: 'item-1', payload: { completion_source: 'plano', actual_date: hojeISO } });
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({ plan_item_id: 'item-1', completion_source: 'plano' });
  });

  it('N3: um rascunho que aponta para um item entretanto cancelado não o reabre nem o conclui', async () => {
    const { unmount } = render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    await new Promise(r => setTimeout(r, 700));
    unmount();
    useAppStore.setState({ coachPlanItems: [item({ status: 'cancelado' })] });
    render(<GymRegistration onClose={onClose} />);
    expect(screen.queryByText(/A usar o plano/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    gravarSoConfirmadasSeHouver();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body.plan_item_id).toBeUndefined();
    expect(mocks.updates).toHaveLength(0);
  });

  it('N4: um rascunho de ontem guarda a escolha do plano de ontem ao reabrir', async () => {
    useAppStore.setState({ coachPlanItems: [item({ planned_date: ontemISO })] });
    const { unmount } = render(<GymRegistration onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Data do treino'), { target: { value: ontemISO } });
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    await new Promise(r => setTimeout(r, 700));
    unmount();
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByLabelText('Data do treino')).toHaveValue(ontemISO);
    expect(screen.getByText(/A usar o plano/)).toBeInTheDocument();
  });
});

describe('GymRegistration — revisão final (B1, M1)', () => {
  const onClose = vi.fn();
  const hojeISO = todayISO();
  const ITEM = { id: 'item-1', plan_id: 'p1', planned_date: hojeISO, kind: 'ginasio', status: 'pendente', categories: ['Pernas'], prescription: { blocks: [{ type: 'forca', name: 'Prensa', sets: 3, reps: 12 }] } };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { session: { id: 's' }, sets: [] }, error: null });
    mocks.updatePlanItem.mockReset().mockResolvedValue({ error: null });
    mocks.updates.length = 0;
    onClose.mockClear();
    localStorage.clear();
    useAppStore.setState({
      profile: PROFILE, gymSessions: [], planItemPrefill: null, session: { user: { id: 'user-1' } },
      coachPlans: [{ id: 'p1', status: 'aceite', period_start: hojeISO, period_end: hojeISO }],
      coachPlanItems: [ITEM],
    });
  });

  it('B1: com prints não há aviso — as séries por confirmar não vão no pedido e a leitura dos prints conta', async () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const { body } = mocks.invoke.mock.calls[0][1];
    expect(body.images).toEqual(['AAA']);
    expect(body.sets).toEqual([]);
    expect(body.plan_blocks).toEqual([{ name: 'Prensa', type: 'forca' }]);
  });

  it('M1: Escape fecha o aviso sem gravar', () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Usar o plano/ }));
    fireEvent.click(screen.getByRole('button', { name: /Analisar treino/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
