import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import GymRegistration from './GymRegistration';

// analyze-gym é a única coisa que estes testes exercitam de facto — tanto
// a foto como o manual gravam a sessão e geram o comentário do Coach numa só
// chamada à Edge Function. Editar passa pelo Gemini quando os dados
// analíticos mudam (séries, métricas, categorias, tipo ou observações);
// mudar só a data/nome é update direto de workout_sessions.
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), updateSession: vi.fn(), deleteSets: vi.fn(), insertSets: vi.fn() }));
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

describe('GymRegistration — cartão único: alternar entre Foto e Manual', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, gymSessions: [] });
  });

  it('mostra o upload de fotos por omissão e esconde os campos manuais', () => {
    render(<GymRegistration onClose={onClose} />);
    expect(screen.getByText(/Escolhe os prints da app de treino/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Ex: 45m')).not.toBeInTheDocument();
  });

  it('ao escolher Manual, esconde o upload e mostra as métricas do relógio', () => {
    render(<GymRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Manual/i }));

    expect(screen.queryByText(/Escolhe os prints da app de treino/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: 45m')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analisar Treino/i })).toBeInTheDocument();
  });
});

describe('GymRegistration — Analisar Treino por foto (analyze-gym)', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-gym');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.kind).toBe('forca');
    expect(body.categories).toEqual(['Peito']);
    expect(body.notes).toBe('treino pesado');
  });

  it('acrescenta a sessão devolvida (já com coach_notes) ao store e fecha o formulário', async () => {
    const newSession = { id: 'sess-1', coach_notes: 'Volume consistente com o habitual.' };
    mocks.invoke.mockResolvedValue({ data: { session: newSession }, error: null });
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().gymSessions).toEqual([newSession]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<GymRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/ }));

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

  const goManual = () => fireEvent.click(screen.getByRole('button', { name: /Manual/i }));

  it('envia o registo manual para analyze-gym em modo manual, sem imagens', async () => {
    mocks.invoke.mockResolvedValue({ data: { session: { id: 'sess-2' } }, error: null });
    render(<GymRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByPlaceholderText('Ex: 45m'), { target: { value: '50:00' } });
    fireEvent.click(screen.getByRole('button', { name: '7' }));

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-gym');
    expect(body.mode).toBe('manual');
    expect(body.images).toBeUndefined();
    expect(body.duration_seconds).toBe(3000);
    expect(body.exertion).toBe(7);
    expect(body.kind).toBe('forca');
  });

  it('acrescenta a sessão devolvida (já com coach_notes) ao store e fecha o formulário', async () => {
    const newSession = { id: 'sess-2', coach_notes: 'Boa consistência de esforço.' };
    mocks.invoke.mockResolvedValue({ data: { session: newSession }, error: null });
    render(<GymRegistration onClose={onClose} />);
    goManual();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().gymSessions).toEqual([newSession]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a gravar treino.' });
    render(<GymRegistration onClose={onClose} />);
    goManual();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Treino/i }));

    await screen.findByText('Falha a gravar treino.');
    expect(onClose).not.toHaveBeenCalled();
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

  it('pré-preenche os campos, esconde o seletor Foto/Manual e mostra os exercícios agrupados', () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    expect(screen.getByText('Editar Treino')).toBeInTheDocument();
    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Peito e Tríceps')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('400')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Supino')).toBeInTheDocument();
    const reps = screen.getAllByPlaceholderText('Reps');
    expect(reps).toHaveLength(2);
    expect(reps[0]).toHaveValue(10);
    expect(reps[1]).toHaveValue(8);
    expect(screen.getByRole('button', { name: /Guardar Alterações/i })).toBeInTheDocument();
  });

  it('mudar só o nome faz update direto, sem chamar o Gemini', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.change(screen.getByDisplayValue('Peito e Tríceps'), { target: { value: 'Push A' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Alterações/i }));

    await waitFor(() => expect(mocks.updateSession).toHaveBeenCalledTimes(1));
    const [payload, sessionId] = mocks.updateSession.mock.calls[0];
    expect(sessionId).toBe('sess-3');
    expect(payload).toEqual({ date: '2026-01-05', name: 'Push A' });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.deleteSets).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('editar uma série e adicionar um exercício novo passa pelo Coach', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    const reps = screen.getAllByPlaceholderText('Reps');
    fireEvent.change(reps[0], { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar exercício/ }));
    const nameInputs = screen.getAllByPlaceholderText('Nome do exercício');
    fireEvent.change(nameInputs[nameInputs.length - 1], { target: { value: 'Fondos' } });
    fireEvent.change(screen.getAllByPlaceholderText('Reps')[2], { target: { value: '15' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-gym');
    expect(body.mode).toBe('manual');
    expect(body.session_id).toBe('sess-3');
    expect(body.sets[0]).toEqual({ exercise_name: 'Supino', set_index: 0, reps: 12, weight: 60 });
    expect(body.sets).toContainEqual({ exercise_name: 'Fondos', set_index: 0, reps: 15, weight: null });
    // Quem grava é a Edge Function — o cliente já não mexe nas séries.
    expect(mocks.updateSession).not.toHaveBeenCalled();
    expect(mocks.deleteSets).not.toHaveBeenCalled();
    await waitFor(() => expect(loadInitialData).toHaveBeenCalledWith('user-1'));
  });

  it('mudar o esforço passa pelo Coach — é métrica analítica', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.exertion).toBe(9);
    expect(body.session_id).toBe('sess-3');
  });

  it('mudar só as observações também passa pelo Coach', async () => {
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.change(screen.getByDisplayValue('nota antiga'), { target: { value: 'dor no ombro a meio' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.notes).toBe('dor no ombro a meio');
  });

  it('um erro do Coach não fecha o formulário nem perde as alterações', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<GymRegistration onClose={onClose} sessionIdToEdit="sess-3" />);

    fireEvent.change(screen.getAllByPlaceholderText('Reps')[0], { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByPlaceholderText('Reps')[0]).toHaveValue(12);
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
