import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import MealRegistration from './MealRegistration';

// analyze-meal é a única coisa que estes testes exercitam de facto —
// "Adicionar alimento" no manual é puramente local (sem chamadas ao
// servidor), só "Analisar Refeição" toca no Gemini, seja por foto ou manual.
// Editar passa pelo Gemini quando os dados analíticos mudam (alimentos ou
// observações); mudar só a data/tipo é update direto de meals.
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), updateMeal: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'meals') {
        return { update: (payload) => ({ eq: (col, val) => mocks.updateMeal(payload, val) }) };
      }
      if (table === 'meal_items') {
        return {
          update: (payload) => ({ eq: (col, val) => mocks.updateItem(payload, val) }),
          delete: () => ({ eq: (col, val) => mocks.deleteItem(val) }),
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
  const file = new File(['conteudo'], 'refeicao.jpg', { type: 'image/jpeg' });
  await fireEvent.change(input, { target: { files: [file] } });
  await screen.findByAltText('Foto 1');
};

describe('MealRegistration — Analisar Refeição por foto (analyze-meal)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  it('envia o payload correto (imagens, data, tipo de refeição, observações)', async () => {
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-1' }, items: [] }, error: null });
    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), { target: { value: 'Big Mac' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.meal_type).toBe('almoco');
    expect(body.notes).toBe('Big Mac');
  });

  it('acrescenta a refeição devolvida (meal + items combinados) ao store e fecha o formulário', async () => {
    const newMeal = { id: 'meal-1', coach_notes: 'Boa proporção de proteína.' };
    const items = [{ id: 'item-1', name: 'Frango' }];
    mocks.invoke.mockResolvedValue({ data: { meal: newMeal, items }, error: null });
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().meals).toEqual([{ ...newMeal, meal_items: items }]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().meals).toEqual([]);
  });
});

describe('MealRegistration — cartão único: alternar entre Foto e Manual', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  it('mostra o upload de fotos por omissão e esconde os campos manuais', () => {
    render(<MealRegistration onClose={onClose} />);
    expect(screen.getByText(/Podes juntar várias fotos/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/peito de frango grelhado/)).not.toBeInTheDocument();
  });

  it('ao escolher Manual, esconde o upload e mostra o formulário de alimentos', () => {
    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Manual/i }));

    expect(screen.queryByText(/Podes juntar várias fotos/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/peito de frango grelhado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analisar Refeição/i })).toBeInTheDocument();
  });
});

describe('MealRegistration — registo manual: adicionar é local, análise só no fim (analyze-meal)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  const goManual = () => fireEvent.click(screen.getByRole('button', { name: /Manual/i }));

  const addItem = (name, grams) => {
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText('g (opcional)'), { target: { value: String(grams) } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));
  };

  it('"Adicionar alimento" só junta à lista local, sem chamar o Gemini/Coach', () => {
    render(<MealRegistration onClose={onClose} />);
    goManual();
    addItem('Peito de frango', 150);

    expect(screen.getByText('Peito de frango')).toBeInTheDocument();
    expect(screen.getByText('150g')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('permite adicionar um alimento sem indicar as gramas — o Coach estima a porção', async () => {
    const finalMeal = { id: 'meal-9', meal_items: [{ id: 'item-9' }] };
    mocks.invoke.mockResolvedValue({ data: { meal: finalMeal }, error: null });
    render(<MealRegistration onClose={onClose} />);
    goManual();
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: '1 fatia de fiambre' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));

    expect(screen.getByText('1 fatia de fiambre')).toBeInTheDocument();
    expect(screen.getByText('Porção estimada pelo Coach')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.items).toEqual([{ name: '1 fatia de fiambre', grams: null }]);
  });

  it('permite adicionar e remover vários alimentos, sempre localmente', () => {
    render(<MealRegistration onClose={onClose} />);
    goManual();
    addItem('Arroz', 100);
    addItem('Feijão', 80);

    expect(screen.getByText('Arroz')).toBeInTheDocument();
    expect(screen.getByText('Feijão')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Remover Arroz/i }));
    expect(screen.queryByText('Arroz')).not.toBeInTheDocument();
    expect(screen.getByText('Feijão')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('ao "Analisar Refeição", envia todos os alimentos numa só chamada em modo manual', async () => {
    const finalMeal = { id: 'meal-2', coach_notes: 'Boa fonte de proteína.', meal_items: [{ id: 'item-1' }, { id: 'item-2' }] };
    mocks.invoke.mockResolvedValue({ data: { meal: finalMeal }, error: null });
    render(<MealRegistration onClose={onClose} />);
    goManual();
    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    addItem('Ovos', 100);
    addItem('Aveia', 40);

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.mode).toBe('manual');
    expect(body.meal_type).toBe('almoco');
    expect(body.items).toEqual([
      { name: 'Ovos', grams: 100 },
      { name: 'Aveia', grams: 40 },
    ]);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().meals).toEqual([finalMeal]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a analisar a refeição.' });
    render(<MealRegistration onClose={onClose} />);
    goManual();
    addItem('Ovos', 100);

    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/i }));

    await screen.findByText('Falha a analisar a refeição.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().meals).toEqual([]);
  });

  it('não deixa finalizar sem nenhum alimento adicionado', () => {
    render(<MealRegistration onClose={onClose} />);
    goManual();

    expect(screen.getByRole('button', { name: /Analisar Refeição/i })).toBeDisabled();
  });
});

/* Editar: alimentos e observações são dados ANALÍTICOS — mudá-los regenera a
   análise do Coach (as observações entram no prompt de estimação: um
   "hambúrguer" caseiro e um do McDonald's não dão os mesmos valores). Mudar
   só a data ou o tipo de refeição é um update direto, sem custo de API. */
describe('MealRegistration — editar refeição existente', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();
  const EXISTING_MEAL = {
    id: 'meal-3',
    date: '2026-01-10',
    meal_type: 'jantar',
    notes: 'nota antiga',
    meal_items: [
      { id: 'item-1', name: 'Arroz', quantity_grams: 100 },
      { id: 'item-2', name: 'Frango', quantity_grams: 150 },
    ],
  };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { meal: EXISTING_MEAL }, error: null });
    mocks.updateMeal.mockReset().mockResolvedValue({ error: null });
    mocks.updateItem.mockReset().mockResolvedValue({ error: null });
    mocks.deleteItem.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    loadInitialData.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [EXISTING_MEAL], loadInitialData });
  });

  it('pré-preenche os campos, esconde o seletor Foto/Manual mas deixa acrescentar alimentos', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    expect(screen.getByText('Editar Refeição')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jantar/i })).toBeInTheDocument();
    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Arroz')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Frango')).toBeInTheDocument();
    // Acrescentar um alimento novo ao editar passou a ser possível: guardar
    // chama o Coach, e é ele que estima os valores nutricionais do novo item.
    expect(screen.getByRole('button', { name: /Adicionar alimento/i })).toBeInTheDocument();
    // Sem nada alterado ainda, guardar não precisa do Coach.
    expect(screen.getByRole('button', { name: /Guardar Alterações/i })).toBeInTheDocument();
  });

  it('mudar só o tipo de refeição faz update direto, sem chamar o Gemini', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar Alterações/i }));

    await waitFor(() => expect(mocks.updateMeal).toHaveBeenCalledTimes(1));
    const [mealPayload, mealId] = mocks.updateMeal.mock.calls[0];
    expect(mealId).toBe('meal-3');
    expect(mealPayload).toEqual({ date: '2026-01-10', meal_type: 'almoco' });
    expect(mocks.invoke).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('mudar as gramas de um alimento passa pelo Coach e reanalisa', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.mode).toBe('manual');
    expect(body.meal_id).toBe('meal-3');
    expect(body.items).toEqual([
      { name: 'Arroz', grams: '120' },
      { name: 'Frango', grams: 150 },
    ]);
    // O update direto não é usado neste caminho — quem grava é a Edge Function.
    expect(mocks.updateMeal).not.toHaveBeenCalled();
    await waitFor(() => expect(loadInitialData).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('mudar só as observações também passa pelo Coach — mudam a análise', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), {
      target: { value: 'hambúrguer do McDonald\'s, não caseiro' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.meal_id).toBe('meal-3');
    expect(body.notes).toBe('hambúrguer do McDonald\'s, não caseiro');
  });

  it('acrescentar um alimento novo ao editar envia-o para o Coach estimar', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'Brócolos' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    // Sem gramas indicadas, o Coach estima a porção típica.
    expect(body.items).toContainEqual({ name: 'Brócolos', grams: null });
    expect(body.items).toHaveLength(3);
  });

  it('remover um alimento passa pelo Coach com a lista já sem ele', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.click(screen.getByRole('button', { name: /Remover Frango/i }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.items).toEqual([{ name: 'Arroz', grams: 100 }]);
    // Já não há delete item-a-item: a Edge Function substitui a lista toda.
    expect(mocks.deleteItem).not.toHaveBeenCalled();
  });

  it('não deixa gravar uma refeição sem alimento nenhum', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.click(screen.getByRole('button', { name: /Remover Arroz/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remover Frango/i }));

    expect(screen.getByRole('button', { name: /Guardar e Reanalisar/ })).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('um erro do Coach não fecha o formulário nem perde as alterações', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na estimativa.' });
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e Reanalisar/ }));

    await screen.findByText('Falha na estimativa.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('120')).toBeInTheDocument();
  });
});

// Regressão dupla: (1) trocar de separador pela barra de navegação com o
// formulário sujo desmontava-o sem aviso — só o X do próprio ecrã estava
// protegido; (2) isFormDirty aqui não tinha NENHUM produtor além do
// useState(false) inicial — nenhum onChange chamava setIsFormDirty(true),
// por isso o aviso nunca disparava, nem pelo X nem pela barra de navegação.
// Corrigido nos pontos onde o atleta perde trabalho real: data, tipo de
// refeição, observações, e adicionar/editar/remover alimentos — nunca no
// efeito que carrega uma refeição existente (é inicialização, não edição).
describe('MealRegistration — guarda de navegação com formulário sujo', () => {
  const onClose = vi.fn();
  const loadInitialData = vi.fn().mockResolvedValue();
  const EXISTING_MEAL = {
    id: 'meal-3',
    date: '2026-01-10',
    meal_type: 'jantar',
    notes: 'nota antiga',
    meal_items: [
      { id: 'item-1', name: 'Arroz', quantity_grams: 100 },
    ],
  };

  beforeEach(() => {
    mocks.invoke.mockReset().mockResolvedValue({ data: { meal: EXISTING_MEAL }, error: null });
    mocks.updateMeal.mockReset().mockResolvedValue({ error: null });
    mocks.updateItem.mockReset().mockResolvedValue({ error: null });
    mocks.deleteItem.mockReset().mockResolvedValue({ error: null });
    onClose.mockClear();
    loadInitialData.mockClear();
    useAppStore.setState({
      profile: PROFILE,
      meals: [EXISTING_MEAL],
      loadInitialData,
      activeTab: 'nutricao',
      navGuard: null,
    });
  });

  const dirtyTheForm = () => {
    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), {
      target: { value: 'com molho extra' },
    });
  };

  // navGuard corre fora de qualquer evento React (é chamado diretamente na
  // store, tal como Layout.jsx faria ao tocar num separador) — sem act(),
  // o setShowUnsavedModal(true) lá dentro não fica refletido no DOM a tempo.
  const attemptLeave = (target) => {
    let navigated;
    act(() => { navigated = useAppStore.getState().setActiveTab(target); });
    return navigated;
  };

  it('sem alterações, não regista navGuard nenhum', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    expect(useAppStore.getState().navGuard).toBeNull();
  });

  it('regista um navGuard assim que o formulário fica sujo', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    dirtyTheForm();
    expect(useAppStore.getState().navGuard).toBeInstanceOf(Function);
  });

  it('trocar de separador com o formulário sujo mostra o aviso em vez de navegar logo', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    dirtyTheForm();

    const navigated = attemptLeave('home');

    expect(navigated).toBe(false);
    expect(useAppStore.getState().activeTab).toBe('nutricao');
    expect(screen.getByText('Tens alterações por gravar')).toBeInTheDocument();
  });

  it('"Sair sem gravar" descarta o formulário E completa a navegação pendente', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    dirtyTheForm();
    attemptLeave('home');

    fireEvent.click(screen.getByRole('button', { name: 'Sair sem gravar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // Sem limpar o navGuard antes de navegar, este setActiveTab ficava preso
    // a bloquear-se a ele mesmo (o guard só é limpo no cleanup do useEffect,
    // que só corre num render seguinte a onClose(), não já a seguir).
    expect(useAppStore.getState().activeTab).toBe('home');
    expect(useAppStore.getState().navGuard).toBeNull();
  });

  it('"Cancelar" fecha o aviso e mantém o formulário aberto, sem navegar', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    dirtyTheForm();
    attemptLeave('home');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeTab).toBe('nutricao');
    await waitFor(() => {
      expect(screen.queryByText('Tens alterações por gravar')).not.toBeInTheDocument();
    });
    expect(attemptLeave('coach')).toBe(false);
  });

  it('adicionar ou remover um alimento também marca o formulário como sujo', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    expect(useAppStore.getState().navGuard).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'Brócolos' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));

    expect(useAppStore.getState().navGuard).toBeInstanceOf(Function);
  });

  it('fechar pelo botão X sem alterações não deixa navGuard nenhum registado', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.click(screen.getByLabelText('Fechar'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().navGuard).toBeNull();
  });
});

// Bug relatado 2026-08-30: formulários perdiam todo o texto ao trocar de app
// e voltar — o Android descarta a página em segundo plano e recarrega do
// zero, apagando o estado em memória. Ver src/utils/formDraftPersistence.js
// e a mesma correção em RunAgenda.jsx (RunAgenda.test.jsx tem o padrão).
describe('MealRegistration — BUG CORRIGIDO (2026-08-30) — rascunho sobrevive a voltar de outra app', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    localStorage.clear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  it('refeição NOVA: texto escrito sobrevive a um "recarregamento" (remount) da app', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<MealRegistration onClose={onClose} />);
      fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), { target: { value: 'A meio de escrever' } });

      // Debounce da persistência (formDraftPersistence.js).
      vi.advanceTimersByTime(700);

      unmount();

      // "Reabrir a app" — nova instância do componente, tal como acontece
      // quando o Android recarrega a página ao voltar de outra app e apaga
      // todo o estado em memória.
      render(<MealRegistration onClose={onClose} />);

      expect(screen.getByPlaceholderText(/Detalhes que mudam os valores/).value).toBe('A meio de escrever');
    } finally {
      vi.useRealTimers();
    }
  });

  it('gravar com sucesso limpa o rascunho — a próxima refeição nova não vem com texto antigo', async () => {
    // Simula um rascunho já persistido de uma sessão anterior (poupa esperar
    // pelo debounce real de formDraftPersistence.js).
    localStorage.setItem('ironcoach:refeicao-rascunho:nova', JSON.stringify({ notes: 'Rascunho Antigo' }));
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-1' }, items: [] }, error: null });

    const { unmount } = render(<MealRegistration onClose={onClose} />);
    expect(screen.getByPlaceholderText(/Detalhes que mudam os valores/).value).toBe('Rascunho Antigo');

    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Analisar Refeição/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    unmount();

    expect(localStorage.getItem('ironcoach:refeicao-rascunho:nova')).toBeNull();

    // Próxima refeição nova: sem vestígios do rascunho gravado.
    render(<MealRegistration onClose={onClose} />);
    expect(screen.getByPlaceholderText(/Detalhes que mudam os valores/).value).toBe('');
  });
});
