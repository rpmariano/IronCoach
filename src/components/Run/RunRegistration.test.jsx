import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import RunRegistration from './RunRegistration';

// analyze-run é a única coisa que estes testes exercitam de facto — supabase
// (usado só pelo registo manual/Provas, não pelo caminho de IA) fica com um
// stub inerte.
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), updateRun: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      update: (payload) => ({ eq: (col, val) => mocks.updateRun(payload, val) }),
    }),
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
  const file = new File(['conteudo'], 'print.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  // handlePhotoSelected é assíncrono (compressImage) — espera o print aparecer.
  await screen.findByAltText('Print 1');
};

describe('RunRegistration — Analisar Corrida (analyze-run)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [] });
  });

  it('envia o payload correto para um treino, com a chave nova de training_type', async () => {
    mocks.invoke.mockResolvedValue({ data: { run: { id: 'run-1', name: 'Corrida de Hoje' } }, error: null });
    render(<RunRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-run');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.kind).toBe('treino');
    // 'continuo' é o valor por omissão do select — tem de ser uma das chaves
    // que a Edge Function reconhece (TRAINING_TYPE_KEYS), não o enum antigo
    // (intervalado/progressivo/series) que ela descartava em silêncio.
    expect(body.training_type).toBe('continuo');
    expect(body.race_type).toBeNull();
  });

  it('envia race_type (não training_type) para uma competição', async () => {
    mocks.invoke.mockResolvedValue({ data: { run: { id: 'run-1' } }, error: null });
    render(<RunRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Competição/i }));
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.kind).toBe('competicao');
    expect(body.training_type).toBeNull();
    // '10k' é o valor por omissão de completedRaceType — tem de ser uma
    // chave de RACE_TYPE_KEYS da Edge Function (não do RACE_TYPES da Agenda
    // de Provas, que é uma tabela e um enum diferentes).
    expect(body.race_type).toBe('10k');
  });

  it('não invoca a análise sem nome de corrida preenchido', async () => {
    render(<RunRegistration onClose={onClose} />);
    fireEvent.change(screen.getByDisplayValue('Corrida de Hoje'), { target: { value: '' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByText('Preenche o nome da corrida.')).toBeInTheDocument();
  });

  it('acrescenta a corrida devolvida ao store e fecha o formulário', async () => {
    const newRun = {
      id: 'run-1',
      name: 'Corrida de Hoje',
      distance_km: 10,
      duration_seconds: 3600,
      coach_notes: 'Bom ritmo, mantém a recuperação.',
      details: {
        avg_heart_rate_bpm: 145,
        cadence_spm: 160,
        elevation_gain_m: 40,
        sweat_loss_ml: 450,
        ground_contact_time_ms: 220,
        aerobic_threshold_bpm: 135,
        splits: [{ distance_km: 1, time_seconds: 300 }],
        hr_zones: [{ zone: 1, minutes: 10 }],
      },
    };
    mocks.invoke.mockResolvedValue({ data: { run: newRun }, error: null });
    render(<RunRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().runs).toEqual([newRun]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<RunRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().runs).toEqual([]);
  });

  it('abre o Bottom Sheet de métricas em falta se a extração por foto não trouxer métricas essenciais', async () => {
    const incompleteRun = { id: 'run-incomplete', name: 'Corrida Incompleta', details: {} };
    mocks.invoke.mockResolvedValue({ data: { run: incompleteRun }, error: null });
    render(<RunRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/ }));

    await screen.findByTestId('missing-metrics-bottom-sheet');
    expect(screen.getByText('Métricas em falta')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('RunRegistration — cartão único: alternar entre Foto e Manual', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [] });
  });

  it('mostra o upload de fotos por omissão e esconde os campos manuais extra', () => {
    render(<RunRegistration onClose={onClose} />);
    expect(screen.getByText(/Escolhe os prints da app de corrida/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Ex: 48.5')).not.toBeInTheDocument(); // VO2 Max is an extra field
  });

  it('ao escolher Manual, esconde o upload e mostra os campos manuais extra', () => {
    render(<RunRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Manual/i }));

    expect(screen.queryByText(/Escolhe os prints da app de corrida/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex: 48.5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analisar Corrida/i })).toBeInTheDocument();
  });

  it('esconde o seletor e vai direto aos campos manuais quando está a editar', () => {
    // Editar é sempre pelos campos — a IA por foto só cria; "Reanalisar" no
    // cartão da corrida é a ação dedicada a reanalisar uma já criada assim.
    useAppStore.setState({
      profile: PROFILE,
      runs: [{ id: 'run-1', kind: 'treino', training_type: 'continuo', date: '2026-08-01', name: 'Corrida', distance_km: 10, duration_seconds: 3000, effort_rpe: 5, details: null }],
      raceEvents: [],
    });
    render(<RunRegistration onClose={onClose} runIdToEdit="run-1" />);

    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar Alterações/i })).toBeInTheDocument();
  });
});

describe('RunRegistration — registo manual também passa pelo Coach (analyze-run, modo manual)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, runs: [], raceEvents: [] });
  });

  const goManual = () => fireEvent.click(screen.getByRole('button', { name: /Manual/i }));

  it('envia o registo manual para analyze-run em modo manual, sem imagens', async () => {
    mocks.invoke.mockResolvedValue({ data: { run: { id: 'run-2', coach_notes: 'Boa consistência de pace.' } }, error: null });
    render(<RunRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
    fireEvent.change(screen.getByPlaceholderText('00:00'), { target: { value: '50:00' } });

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Prosseguir sem estas métricas/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-run');
    expect(body.mode).toBe('manual');
    expect(body.images).toBeUndefined();
    expect(body.distance_km).toBe(10);
    expect(body.duration_seconds).toBe(3000);
    // 'continuo' é o valor por omissão do select de Tipo de treino — o
    // mesmo enum que o caminho de fotos usa, validado do mesmo modo.
    expect(body.training_type).toBe('continuo');
  });

  it('envia cadência média e máxima, zonas de FC e splits nas métricas do relógio', async () => {
    mocks.invoke.mockResolvedValue({ data: { run: { id: 'run-2' } }, error: null });
    render(<RunRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByPlaceholderText('Ex: 158'), { target: { value: '165' } });
    fireEvent.change(screen.getByPlaceholderText('Ex: 175'), { target: { value: '182' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Zona/i }));
    const zoneSelects = screen.getAllByDisplayValue('Zona');
    fireEvent.change(zoneSelects[zoneSelects.length - 1], { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('Minutos'), { target: { value: '20' } });

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Prosseguir sem estas métricas/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.cadence_spm).toBe(165);
    expect(body.max_cadence_spm).toBe(182);
    expect(body.hr_zones).toEqual([{ zone: 2, minutes: 20 }]);
  });

  it('acrescenta a corrida devolvida (já com coach_notes) ao store e fecha o formulário', async () => {
    const newRun = { id: 'run-2', coach_notes: 'Boa consistência de pace.' };
    mocks.invoke.mockResolvedValue({ data: { run: newRun }, error: null });
    render(<RunRegistration onClose={onClose} />);
    goManual();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Prosseguir sem estas métricas/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().runs).toEqual([newRun]);
  });

  it('não invoca a análise sem nome de corrida preenchido', () => {
    render(<RunRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByDisplayValue('Corrida de Hoje'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/i }));

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByText('Preenche o nome da corrida.')).toBeInTheDocument();
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a gravar corrida.' });
    render(<RunRegistration onClose={onClose} />);
    goManual();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Corrida/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Prosseguir sem estas métricas/i }));

    await screen.findByText('Falha a gravar corrida.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* Editar: distância, duração, RPE, tipo e métricas são dados ANALÍTICOS —
   mudá-los regenera a análise do Coach. Mudar só a data ou o nome é um
   update direto, sem custo de API. Antes desta iteração editar nunca passava
   pelo Coach, o que deixava a "Análise do Coach" a descrever uma corrida que
   já não existia. */
describe('RunRegistration — editar corrida existente', () => {
  const onClose = vi.fn();
  const SHOE_UUID = '11111111-2222-4333-8444-555555555555';
  const EXISTING_RUN = {
    id: 'run-9',
    kind: 'treino',
    training_type: 'continuo',
    date: '2026-08-01',
    name: 'Rodagem',
    distance_km: 10,
    duration_seconds: 3000,
    effort_rpe: 5,
    details: { cadence_spm: 165 },
  };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { run: EXISTING_RUN }, error: null });
    mocks.updateRun.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, runs: [EXISTING_RUN], raceEvents: [] });
  });

  it('mudar só o nome faz update direto, sem chamar o Gemini', async () => {
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);

    fireEvent.change(screen.getByDisplayValue('Rodagem'), { target: { value: 'Rodagem longa' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Alterações/i }));

    await waitFor(() => expect(mocks.updateRun).toHaveBeenCalledTimes(1));
    const [payload, id] = mocks.updateRun.mock.calls[0];
    expect(id).toBe('run-9');
    expect(payload).toEqual({ date: '2026-08-01', name: 'Rodagem longa', shoe_id: null });
    expect(mocks.invoke).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  /* As sapatilhas seguem pelo caminho leve de propósito: trocar o par muda
     o acumulado de km do armário, não a análise da corrida — não faz sentido
     custar uma chamada ao Gemini. */
  it('trocar de sapatilhas é update direto, sem reanálise', async () => {
    useAppStore.setState({
      profile: PROFILE,
      runs: [EXISTING_RUN],
      raceEvents: [],
      shoes: [{ id: SHOE_UUID, brand: 'Nike', model: 'Pegasus 40', status: 'ativa', initial_km: 0, lifespan_km: 700 }],
    });
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);

    fireEvent.change(screen.getByDisplayValue('Não indicar'), { target: { value: SHOE_UUID } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Alterações/i }));

    await waitFor(() => expect(mocks.updateRun).toHaveBeenCalledTimes(1));
    const [payload] = mocks.updateRun.mock.calls[0];
    expect(payload.shoe_id).toBe(SHOE_UUID);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('mudar a distância passa pelo Coach e reanalisa', async () => {
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);

    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Prosseguir sem estas métricas/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-run');
    expect(body.mode).toBe('manual');
    expect(body.run_id).toBe('run-9');
    expect(body.distance_km).toBe(12);
    expect(mocks.updateRun).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('mudar uma métrica do relógio também passa pelo Coach', async () => {
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);

    fireEvent.change(screen.getByDisplayValue('165'), { target: { value: '178' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Prosseguir sem estas métricas/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.cadence_spm).toBe(178);
    expect(body.run_id).toBe('run-9');
  });

  it('um erro do Coach não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);

    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Prosseguir sem estas métricas/i }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

// Regressão: trocar de separador pela barra de navegação (Início, Calendário,
// Dashboard, Coach) com o formulário sujo desmontava-o sem aviso nenhum — só
// o botão X do próprio ecrã estava protegido. E a primeira versão da
// correção tinha uma segunda armadilha: o próprio navGuard, ainda ativo,
// bloqueava-se a si mesmo quando handleClose() tentava completar a
// navegação pendente (o guard só é limpo no cleanup do useEffect, que só
// corre num render seguinte a onClose(), não já a seguir).
describe('RunRegistration — guarda de navegação com formulário sujo', () => {
  const onClose = vi.fn();
  const EXISTING_RUN = {
    id: 'run-9',
    kind: 'treino',
    training_type: 'continuo',
    date: '2026-08-01',
    name: 'Rodagem',
    distance_km: 10,
    duration_seconds: 3000,
    effort_rpe: 5,
    details: { cadence_spm: 165 },
  };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { run: EXISTING_RUN }, error: null });
    mocks.updateRun.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    useAppStore.setState({
      profile: PROFILE,
      runs: [EXISTING_RUN],
      raceEvents: [],
      activeTab: 'corrida',
      navGuard: null,
    });
  });

  // O nome NÃO marca o formulário como sujo (só distância, duração e as
  // métricas do relógio o fazem — ver setIsFormDirty(true) no ficheiro fonte).
  const dirtyTheForm = () => {
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '12' } });
  };

  // navGuard corre fora de qualquer evento React (é chamado diretamente na
  // store, tal como Layout.jsx faria ao tocar num separador) — sem act(),
  // o setShowUnsavedModal(true) lá dentro não fica refletido no DOM a tempo.
  const attemptLeave = (target) => {
    let navigated;
    act(() => { navigated = useAppStore.getState().setActiveTab(target); });
    return navigated;
  };

  it('regista um navGuard assim que o formulário fica sujo, e nenhum antes disso', () => {
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);
    expect(useAppStore.getState().navGuard).toBeNull();

    dirtyTheForm();
    expect(useAppStore.getState().navGuard).toBeInstanceOf(Function);
  });

  it('trocar de separador com o formulário sujo mostra o aviso em vez de navegar logo', () => {
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);
    dirtyTheForm();

    const navigated = attemptLeave('home');

    expect(navigated).toBe(false);
    expect(useAppStore.getState().activeTab).toBe('corrida');
    expect(screen.getByText('Tens alterações por gravar')).toBeInTheDocument();
  });

  it('"Sair sem gravar" descarta o formulário E completa a navegação pendente', () => {
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);
    dirtyTheForm();
    attemptLeave('home');

    fireEvent.click(screen.getByRole('button', { name: 'Sair sem gravar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().activeTab).toBe('home');
    expect(useAppStore.getState().navGuard).toBeNull();
  });

  it('"Cancelar" fecha o aviso e mantém o formulário aberto, sem navegar', async () => {
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);
    dirtyTheForm();
    attemptLeave('home');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeTab).toBe('corrida');
    await waitFor(() => {
      expect(screen.queryByText('Tens alterações por gravar')).not.toBeInTheDocument();
    });
    expect(attemptLeave('coach')).toBe(false);
  });

  it('fechar pelo botão X sem alterações não deixa navGuard nenhum registado', () => {
    render(<RunRegistration onClose={onClose} runIdToEdit="run-9" />);

    fireEvent.click(screen.getByLabelText('Fechar'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().navGuard).toBeNull();
  });
});
