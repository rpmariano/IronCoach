import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import BodyRegistration from './BodyRegistration';

// analyze-body é a única coisa que estes testes exercitam de facto — tanto
// a foto como o manual gravam a avaliação e geram o comentário do Coach
// numa só chamada à Edge Function. Editar passa pelo Gemini quando as
// métricas ou as observações mudam; mudar só a data é update direto.
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), updateAssessment: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'body_assessments') {
        return { update: (payload) => ({ eq: (col, val) => mocks.updateAssessment(payload, val) }) };
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
  const file = new File(['conteudo'], 'pesagem.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Print 1');
};

describe('BodyRegistration — cartão único: alternar entre Foto e Manual', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, bodyAssessments: [] });
  });

  it('mostra o upload de fotos por omissão e esconde os campos manuais', () => {
    render(<BodyRegistration onClose={onClose} />);
    expect(screen.getByText(/Escolhe os prints da app Renpho Health/)).toBeInTheDocument();
    expect(screen.queryByText('Peso (kg)')).not.toBeInTheDocument();
  });

  it('ao escolher Manual, esconde o upload e mostra os campos de métricas', () => {
    render(<BodyRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Manual/i }));

    expect(screen.queryByText(/Escolhe os prints da app Renpho Health/)).not.toBeInTheDocument();
    expect(screen.getByText('Peso (kg)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analisar Avaliação/i })).toBeInTheDocument();
  });
});

describe('BodyRegistration — Analisar Avaliação por foto (analyze-body)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, bodyAssessments: [] });
  });

  it('envia o payload correto (imagens, data, observações)', async () => {
    mocks.invoke.mockResolvedValue({ data: { assessment: { id: 'assess-1' } }, error: null });
    render(<BodyRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Contexto da pesagem...'), { target: { value: 'em jejum' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-body');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.notes).toBe('em jejum');
  });

  it('acrescenta a avaliação devolvida (já com ai_summary) ao store e fecha o formulário', async () => {
    const newAssessment = { id: 'assess-1', ai_summary: 'O peso desceu 0.4kg desde a última pesagem.' };
    mocks.invoke.mockResolvedValue({ data: { assessment: newAssessment }, error: null });
    render(<BodyRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().bodyAssessments).toEqual([newAssessment]);
  });

  it('avaliação NOVA: ao gravar, navega para o Calendário e deixa a data da avaliação pendente', async () => {
    mocks.invoke.mockResolvedValue({ data: { assessment: { id: 'assess-1' } }, error: null });
    useAppStore.setState({ activeTab: 'holistica', pendingCalendarDate: null });
    render(<BodyRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/ }));

    await waitFor(() => expect(useAppStore.getState().activeTab).toBe('calendario'));
    // BodyRegistration usa a data de hoje por omissão (sem dateIso a prefill).
    expect(useAppStore.getState().pendingCalendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<BodyRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().bodyAssessments).toEqual([]);
  });
});

describe('BodyRegistration — registo manual também passa pelo Coach (analyze-body, modo manual)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, bodyAssessments: [] });
  });

  const goManual = () => fireEvent.click(screen.getByRole('button', { name: /Manual/i }));

  it('envia o registo manual para analyze-body em modo manual, sem imagens', async () => {
    mocks.invoke.mockResolvedValue({ data: { assessment: { id: 'assess-2' } }, error: null });
    render(<BodyRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '78.5' } });
    fireEvent.change(screen.getByLabelText('Gordura corporal (%)'), { target: { value: '18.2' } });

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-body');
    expect(body.mode).toBe('manual');
    expect(body.images).toBeUndefined();
    expect(body.metrics.weight_kg).toBe(78.5);
    expect(body.metrics.body_fat_pct).toBe(18.2);
  });

  it('acrescenta a avaliação devolvida (já com ai_summary) ao store e fecha o formulário', async () => {
    const newAssessment = { id: 'assess-2', ai_summary: 'Boa evolução na massa muscular.' };
    mocks.invoke.mockResolvedValue({ data: { assessment: newAssessment }, error: null });
    render(<BodyRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '78.5' } });

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().bodyAssessments).toEqual([newAssessment]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a gravar avaliação.' });
    render(<BodyRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '78.5' } });

    fireEvent.click(screen.getByRole('button', { name: /Analisar Avaliação/i }));

    await screen.findByText('Falha a gravar avaliação.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

/* Editar: métricas e observações são dados ANALÍTICOS — mudá-los regenera o
   resumo do Coach. Mudar só a data é um update direto, sem custo de API.
   Antes desta iteração o módulo Corpo não tinha edição nenhuma: só dava para
   editar as observações inline no cartão, o que contornava o Coach. */
describe('BodyRegistration — editar avaliação existente', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();
  const EXISTING = {
    id: 'assess-3',
    date: '2026-01-08',
    notes: 'nota antiga',
    weight_kg: 78.5,
    body_fat_pct: 18.2,
  };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { assessment: EXISTING }, error: null });
    mocks.updateAssessment.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    loadInitialData.mockClear();
    useAppStore.setState({ profile: PROFILE, bodyAssessments: [EXISTING], loadInitialData });
  });

  it('pré-preenche os campos e esconde o seletor Foto/Manual', () => {
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);

    expect(screen.getByText('Editar Avaliação')).toBeInTheDocument();
    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Peso (kg)')).toHaveValue(78.5);
    expect(screen.getByRole('button', { name: /Guardar Alterações/i })).toBeInTheDocument();
  });

  it('mudar uma métrica passa pelo Coach e regenera o resumo', async () => {
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);

    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '77.0' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-body');
    expect(body.mode).toBe('manual');
    expect(body.assessment_id).toBe('assess-3');
    expect(body.metrics.weight_kg).toBe(77.0);
    expect(mocks.updateAssessment).not.toHaveBeenCalled();
    await waitFor(() => expect(loadInitialData).toHaveBeenCalledWith('user-1'));
  });

  it('mudar só as observações também passa pelo Coach', async () => {
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);

    fireEvent.change(screen.getByPlaceholderText(/Contexto da pesagem/), { target: { value: 'pesado em jejum' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.notes).toBe('pesado em jejum');
    expect(body.assessment_id).toBe('assess-3');
  });

  it('mudar só a data faz update direto, sem chamar o Gemini', async () => {
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);

    fireEvent.change(document.querySelector('input[type="date"]'), { target: { value: '2026-01-09' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Alterações/i }));

    await waitFor(() => expect(mocks.updateAssessment).toHaveBeenCalledTimes(1));
    const [payload, id] = mocks.updateAssessment.mock.calls[0];
    expect(id).toBe('assess-3');
    expect(payload).toEqual({ date: '2026-01-09' });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('um erro do Coach não fecha o formulário nem perde as alterações', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);

    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '77.0' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Peso (kg)')).toHaveValue(77.0);
  });
});

// Regressão: trocar de separador pela barra de navegação (Início, Calendário,
// Dashboard, Coach) com o formulário sujo desmontava-o sem aviso nenhum — só
// o botão X do próprio ecrã estava protegido. E a primeira versão da
// correção tinha uma segunda armadilha: o próprio navGuard, ainda ativo,
// bloqueava-se a si mesmo quando handleClose() tentava completar a
// navegação pendente (o guard só é limpo no cleanup do useEffect, que só
// corre num render seguinte a onClose(), não já a seguir).
describe('BodyRegistration — guarda de navegação com formulário sujo', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();
  const EXISTING = {
    id: 'assess-3',
    date: '2026-01-08',
    notes: 'nota antiga',
    weight_kg: 78.5,
    body_fat_pct: 18.2,
  };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { assessment: EXISTING }, error: null });
    mocks.updateAssessment.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    loadInitialData.mockClear();
    useAppStore.setState({
      profile: PROFILE,
      bodyAssessments: [EXISTING],
      loadInitialData,
      activeTab: 'corpo',
      navGuard: null,
    });
  });

  const dirtyTheForm = () => {
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '77.0' } });
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
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);
    expect(useAppStore.getState().navGuard).toBeNull();

    dirtyTheForm();
    expect(useAppStore.getState().navGuard).toBeInstanceOf(Function);
  });

  it('trocar de separador com o formulário sujo mostra o aviso em vez de navegar logo', () => {
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);
    dirtyTheForm();

    const navigated = attemptLeave('home');

    expect(navigated).toBe(false);
    expect(useAppStore.getState().activeTab).toBe('corpo');
    expect(screen.getByText('Tens alterações por gravar')).toBeInTheDocument();
  });

  it('"Sair sem gravar" descarta o formulário E completa a navegação pendente', () => {
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);
    dirtyTheForm();
    attemptLeave('home');

    fireEvent.click(screen.getByRole('button', { name: 'Sair sem gravar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().activeTab).toBe('home');
    expect(useAppStore.getState().navGuard).toBeNull();
  });

  it('"Cancelar" fecha o aviso e mantém o formulário aberto, sem navegar', async () => {
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);
    dirtyTheForm();
    attemptLeave('home');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeTab).toBe('corpo');
    await waitFor(() => {
      expect(screen.queryByText('Tens alterações por gravar')).not.toBeInTheDocument();
    });
    expect(attemptLeave('coach')).toBe(false);
  });

  it('fechar pelo botão X sem alterações não deixa navGuard nenhum registado', () => {
    render(<BodyRegistration onClose={onClose} assessmentIdToEdit="assess-3" />);

    fireEvent.click(screen.getByLabelText('Fechar'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().navGuard).toBeNull();
  });
});
