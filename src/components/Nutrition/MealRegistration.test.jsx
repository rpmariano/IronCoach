import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import MealRegistration from './MealRegistration';
import { dispensarConfirmacao } from '../../test/recordConfirmation';

// O momento do primeiro registo (3 s de leitura) testa-se em utils/firstRecord
// e em RecordConfirmation; aqui o registo de todos os dias sai como sempre.
vi.mock('../../utils/firstRecord', () => ({ firstRecordMoment: () => null }));

// analyze-meal é a única coisa que estes testes exercitam de facto —
// "Adicionar alimento" no manual é puramente local (sem chamadas ao
// servidor), só "Analisar refeição" toca no Gemini, seja por foto ou manual.
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
  await screen.findByAltText('Foto da refeição 1');
};

describe('MealRegistration — Analisar refeição por foto (analyze-meal)', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.images).toEqual(['AAA']);
    expect(body.mime_type).toBe('image/jpeg');
    expect(body.meal_type).toBe('almoco');
    expect(body.notes).toBe('Big Mac');
  });

  /* A hora da refeição (pedido 2026-09-13): é a hora a que se comeu, não a
     de introdução — sugerida pelo tipo, segue o tipo até ser tocada. Desde
     2026-09-28 vai no pedido à analyze-meal (para a Carol a ler); o update à
     parte fica como rede de segurança quando a resposta não a traz (servidor
     antigo) — é o caso deste mock. */
  it('a hora é sugerida pelo tipo, segue-o até ser tocada, e grava-se em meals.meal_time a seguir à análise', async () => {
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-1' }, items: [] }, error: null });
    mocks.updateMeal.mockReset().mockResolvedValue({ error: null });
    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Jantar$/i }));
    expect(screen.getByLabelText('Hora da refeição')).toHaveValue('20:00');
    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    expect(screen.getByLabelText('Hora da refeição')).toHaveValue('13:00');
    fireEvent.change(screen.getByLabelText('Hora da refeição'), { target: { value: '13:10' } });
    // Tocada, deixa de seguir o tipo.
    fireEvent.click(screen.getByRole('button', { name: /^Jantar$/i }));
    expect(screen.getByLabelText('Hora da refeição')).toHaveValue('13:10');
    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));

    await waitFor(() => expect(mocks.updateMeal).toHaveBeenCalledWith({ meal_time: '13:10' }, 'meal-1'));
    expect(mocks.invoke.mock.calls[0][1].body.meal_time).toBe('13:10');
    await waitFor(() => expect(useAppStore.getState().meals.find(m => m.id === 'meal-1')?.meal_time).toBe('13:10'));
  });

  it('com a hora já gravada pela analyze-meal, não repete o update à parte', async () => {
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-2', meal_time: '20:00:00' }, items: [] }, error: null });
    mocks.updateMeal.mockReset().mockResolvedValue({ error: null });
    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Jantar$/i }));
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));

    await waitFor(() => expect(useAppStore.getState().meals.find(m => m.id === 'meal-2')).toBeTruthy());
    expect(mocks.invoke.mock.calls[0][1].body.meal_time).toBe('20:00');
    expect(mocks.updateMeal).not.toHaveBeenCalled();
  });

  it('acrescenta a refeição devolvida (meal + items combinados) ao store e fecha o formulário', async () => {
    const newMeal = { id: 'meal-1', coach_notes: 'Boa proporção de proteína.' };
    const items = [{ id: 'item-1', name: 'Frango' }];
    mocks.invoke.mockResolvedValue({ data: { meal: newMeal, items }, error: null });
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));

    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // A hora (meal_time) junta-se por update à parte — parte da hora atual.
    expect(useAppStore.getState().meals).toEqual([{ ...newMeal, meal_items: items, meal_time: expect.stringMatching(/^\d{2}:\d{2}$/) }]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));

    await screen.findByText('Falha na análise.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().meals).toEqual([]);
  });
});

/* Bug #47 (2026-10-03): já não há Foto OU Manual — fotos, alimentos escritos
   e observações no mesmo ecrã, e um só "Analisar refeição". */
describe('MealRegistration — um só ecrã: fotos e alimentos juntos', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  const addItem = (name, grams) => {
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: name } });
    if (grams != null) fireEvent.change(screen.getByPlaceholderText('g (opcional)'), { target: { value: String(grams) } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));
  };

  it('fotos, alimentos e observações à vista ao mesmo tempo, sem seletor Foto/Manual', () => {
    render(<MealRegistration onClose={onClose} />);
    expect(screen.getByTestId('meal-photos')).toBeInTheDocument();
    expect(screen.getByText('Tirar foto')).toBeInTheDocument();
    expect(screen.getByText('Da galeria')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/peito de frango grelhado/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Detalhes que mudam os valores/)).toBeInTheDocument();
    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Manual$/ })).not.toBeInTheDocument();
  });

  /* O caso do backlog (specs/carol-frases-contexto.md, MealRegistration:710): o
     registo por foto nomeava «a IA» ao lado da Carol. Aqui fala só ela. */
  it('fala na voz da Carol, sem nomear a IA', () => {
    render(<MealRegistration onClose={onClose} />);
    expect(screen.getByText(/Tira foto ao prato, escreve os alimentos, ou as duas coisas — eu junto tudo\./)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bIA\b/);
  });

  it('sem foto nem alimento, "Analisar refeição" fica desativado; uma das duas chega', async () => {
    render(<MealRegistration onClose={onClose} />);
    expect(screen.getByRole('button', { name: /Analisar refeição/i })).toBeDisabled();
    await selectPhoto();
    expect(screen.getByRole('button', { name: /Analisar refeição/i })).toBeEnabled();
  });

  it('tirar uma foto e juntar outra da galeria: ficam as duas', async () => {
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();
    const galeria = document.querySelectorAll('input[type="file"]')[1];
    expect(galeria).toHaveAttribute('multiple');
    await fireEvent.change(galeria, { target: { files: [new File(['b'], 'b.jpg', { type: 'image/jpeg' })] } });
    await screen.findByAltText('Foto da refeição 2');
  });

  it('fotos + alimentos escritos + observações vão no mesmo pedido', async () => {
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-1' }, items: [{ id: 'i1' }] }, error: null });
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();
    // Com foto, a ajuda do campo diz que é para o que ela não mostra.
    expect(screen.getByText(/Junta o que a foto não mostra/)).toBeInTheDocument();
    addItem('café com açúcar');
    addItem('Arroz', 150);
    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), { target: { value: 'frito em azeite' } });

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.mode).toBeUndefined();
    expect(body.images).toEqual(['AAA']);
    expect(body.items).toEqual([{ name: 'café com açúcar', grams: null }, { name: 'Arroz', grams: 150 }]);
    expect(body.notes).toBe('frito em azeite');
  });

  it('só fotos: o pedido de sempre, sem lista de alimentos', async () => {
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-1' }, items: [] }, error: null });
    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect('items' in mocks.invoke.mock.calls[0][1].body).toBe(false);
  });
});

describe('MealRegistration — registo manual: adicionar é local, análise só no fim (analyze-meal)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  const addItem = (name, grams) => {
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText('g (opcional)'), { target: { value: String(grams) } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));
  };

  it('"Adicionar alimento" só junta à lista local, sem chamar o Gemini/Coach', () => {
    render(<MealRegistration onClose={onClose} />);
    addItem('Peito de frango', 150);

    expect(screen.getByText('Peito de frango')).toBeInTheDocument();
    expect(screen.getByText('150g')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('permite adicionar um alimento sem indicar as gramas — o Coach estima a porção', async () => {
    const finalMeal = { id: 'meal-9', meal_items: [{ id: 'item-9' }] };
    mocks.invoke.mockResolvedValue({ data: { meal: finalMeal }, error: null });
    render(<MealRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: '1 fatia de fiambre' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));

    expect(screen.getByText('1 fatia de fiambre')).toBeInTheDocument();
    expect(screen.getByText('Porção estimada pela Carol')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.items).toEqual([{ name: '1 fatia de fiambre', grams: null }]);
  });

  it('permite adicionar e remover vários alimentos, sempre localmente', () => {
    render(<MealRegistration onClose={onClose} />);
    addItem('Arroz', 100);
    addItem('Feijão', 80);

    expect(screen.getByText('Arroz')).toBeInTheDocument();
    expect(screen.getByText('Feijão')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Remover Arroz/i }));
    expect(screen.queryByText('Arroz')).not.toBeInTheDocument();
    expect(screen.getByText('Feijão')).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('ao "Analisar refeição", envia todos os alimentos numa só chamada em modo manual', async () => {
    const finalMeal = { id: 'meal-2', coach_notes: 'Boa fonte de proteína.', meal_items: [{ id: 'item-1' }, { id: 'item-2' }] };
    mocks.invoke.mockResolvedValue({ data: { meal: finalMeal }, error: null });
    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    addItem('Ovos', 100);
    addItem('Aveia', 40);

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/i }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body.mode).toBe('manual');
    expect(body.meal_type).toBe('almoco');
    expect(body.items).toEqual([
      { name: 'Ovos', grams: 100 },
      { name: 'Aveia', grams: 40 },
    ]);

    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(useAppStore.getState().meals).toEqual([{ ...finalMeal, meal_time: expect.stringMatching(/^\d{2}:\d{2}$/) }]);
  });

  it('mostra o erro da Edge Function e não fecha o formulário', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha a analisar a refeição.' });
    render(<MealRegistration onClose={onClose} />);
    addItem('Ovos', 100);

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/i }));

    await screen.findByText('Falha a analisar a refeição.');
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().meals).toEqual([]);
  });

  it('não deixa finalizar sem nenhum alimento adicionado', () => {
    render(<MealRegistration onClose={onClose} />);

    expect(screen.getByRole('button', { name: /Analisar refeição/i })).toBeDisabled();
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

  it('pré-preenche os campos, sem fotos novas mas a deixar acrescentar alimentos', () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    expect(screen.getByText('Editar Refeição')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jantar/i })).toBeInTheDocument();
    expect(screen.queryByText('Como queres registar?')).not.toBeInTheDocument();
    expect(screen.queryByTestId('meal-photos')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Arroz')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Frango')).toBeInTheDocument();
    // Acrescentar um alimento novo ao editar passou a ser possível: guardar
    // chama o Coach, e é ele que estima os valores nutricionais do novo item.
    expect(screen.getByRole('button', { name: /Adicionar alimento/i })).toBeInTheDocument();
    // Sem nada alterado ainda, guardar não precisa do Coach.
    expect(screen.getByRole('button', { name: /Guardar alterações/i })).toBeInTheDocument();
  });

  /* Desde 2026-09-28 qualquer mudança num registo regenera a análise — o
     tipo incluído: a Carol usa-o para decidir que refeições ainda podem vir. */
  it('mudar só o tipo de refeição reanalisa com o tipo novo', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body).toMatchObject({ mode: 'manual', meal_id: 'meal-3', meal_type: 'almoco', date: '2026-01-10' });
  });

  /* Desde 2026-09-28 a hora é analítica (a Carol lê-a): corrigi-la reanalisa
     e vai no pedido à analyze-meal, que a grava com a refeição. */
  it('a editar, a hora vem da refeição e mudá-la reanalisa com a hora nova', async () => {
    useAppStore.setState({ meals: [{ ...EXISTING_MEAL, meal_time: '20:00:00' }] });
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-3', meal_time: '20:30:00' }, items: [] }, error: null });
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    expect(screen.getByLabelText('Hora da refeição')).toHaveValue('20:00');
    // A hora gravada, só reformatada ('HH:MM:SS' → 'HH:MM'), não conta como mudança.
    expect(screen.getByRole('button', { name: /Guardar alterações/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Hora da refeição'), { target: { value: '20:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [fnName, { body }] = mocks.invoke.mock.calls[0];
    expect(fnName).toBe('analyze-meal');
    expect(body).toMatchObject({ mode: 'manual', meal_id: 'meal-3', meal_time: '20:30' });
    // A resposta já traz a hora gravada: sem update à parte.
    expect(mocks.updateMeal).not.toHaveBeenCalled();
  });

  it('a editar, apagar a hora reanalisa com meal_time null; sem hora gravada abre sem reanálise', async () => {
    useAppStore.setState({ meals: [{ ...EXISTING_MEAL, meal_time: null }] });
    const { unmount } = render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    expect(screen.getByLabelText('Hora da refeição')).toHaveValue('');
    expect(screen.getByRole('button', { name: /Guardar alterações/i })).toBeInTheDocument();
    unmount();

    useAppStore.setState({ meals: [{ ...EXISTING_MEAL, meal_time: '20:00:00' }] });
    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'meal-3', meal_time: null }, items: [] }, error: null });
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    fireEvent.change(screen.getByLabelText('Hora da refeição'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0][1].body.meal_time).toBeNull();
  });

  it('numa refeição sem alimentos, mudar as observações continua bloqueado', async () => {
    useAppStore.setState({ meals: [{ ...EXISTING_MEAL, meal_items: [] }] });
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    fireEvent.change(screen.getByDisplayValue('nota antiga'), { target: { value: 'nota nova' } });
    expect(screen.getByRole('button', { name: /Guardar e reanalisar/ })).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('reescrever as mesmas gramas não conta como mudança', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    const grams = screen.getByDisplayValue('150');
    fireEvent.change(grams, { target: { value: '' } });
    fireEvent.change(grams, { target: { value: '150' } });
    expect(screen.getByRole('button', { name: /Guardar alterações/i })).toBeInTheDocument();
  });

  it('numa refeição sem alimentos, mudar o tipo grava por update direto', async () => {
    useAppStore.setState({ meals: [{ ...EXISTING_MEAL, meal_items: [] }] });
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar alterações/i }));

    await waitFor(() => expect(mocks.updateMeal).toHaveBeenCalledTimes(1));
    expect(mocks.updateMeal.mock.calls[0]).toEqual([{ date: '2026-01-10', meal_type: 'almoco' }, 'meal-3']);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('numa refeição sem alimentos, mudar só a hora grava por update direto', async () => {
    useAppStore.setState({ meals: [{ ...EXISTING_MEAL, meal_items: [], meal_time: '17:00:00' }] });
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);
    fireEvent.change(screen.getByLabelText('Hora da refeição'), { target: { value: '16:30' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar alterações/i }));

    await waitFor(() => expect(mocks.updateMeal).toHaveBeenCalledTimes(2));
    expect(mocks.updateMeal.mock.calls[1]).toEqual([{ meal_time: '16:30' }, 'meal-3']);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('mudar as gramas de um alimento passa pelo Coach e reanalisa', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

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
    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('mudar só as observações também passa pelo Coach — mudam a análise', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), {
      target: { value: 'hambúrguer do McDonald\'s, não caseiro' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    expect(body.meal_id).toBe('meal-3');
    expect(body.notes).toBe('hambúrguer do McDonald\'s, não caseiro');
  });

  it('acrescentar um alimento novo ao editar envia-o para o Coach estimar', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'Brócolos' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    const [, { body }] = mocks.invoke.mock.calls[0];
    // Sem gramas indicadas, o Coach estima a porção típica.
    expect(body.items).toContainEqual({ name: 'Brócolos', grams: null });
    expect(body.items).toHaveLength(3);
  });

  it('remover um alimento passa pelo Coach com a lista já sem ele', async () => {
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.click(screen.getByRole('button', { name: /Remover Frango/i }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

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

    expect(screen.getByRole('button', { name: /Guardar e reanalisar/ })).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('um erro do Coach não fecha o formulário nem perde as alterações', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na estimativa.' });
    render(<MealRegistration onClose={onClose} mealIdToEdit="meal-3" />);

    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar e reanalisar/ }));

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
    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));

    await dispensarConfirmacao();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    unmount();

    expect(localStorage.getItem('ironcoach:refeicao-rascunho:nova')).toBeNull();

    // Próxima refeição nova: sem vestígios do rascunho gravado.
    render(<MealRegistration onClose={onClose} />);
    expect(screen.getByPlaceholderText(/Detalhes que mudam os valores/).value).toBe('');
  });
});


// Ponto 2 do handoff: a ação primária de cada ecrã de registo vive na barra
// de ação fixa (ActionBar), não no fim do formulário — antes ficava sempre
// abaixo da dobra.
describe('MealRegistration — ação primária na ActionBar', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  it('renderiza o botão primário dentro da barra de ação fixa', () => {
    render(<MealRegistration onClose={() => {}} />);
    const bar = screen.getByTestId('action-bar');
    expect(bar).toContainElement(screen.getByRole('button', { name: /Analisar refeição/i }));
  });
});


/* Ponto 7 do redesenho 6c — os dois estados que faltavam (auditoria, achado
   10: "nenhum estado de espera ou de erro"). Handoff, "Interactions &
   Behavior": «Espera: esqueleto + spinner no botão ("A analisar…"). Erro:
   Warning coral com "Tentar de novo" e alternativa manual; dados do
   utilizador nunca se perdem.» O texto do erro é o do mock "Refeição ·
   análise falhou", na voz da Carol (CAROL.md: nunca "Desculpa, não consegui
   analisar"). */
describe('MealRegistration — espera e erro da análise (ponto 7)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mocks.invoke.mockReset();
    onClose.mockClear();
    localStorage.clear();
    useAppStore.setState({ profile: PROFILE, meals: [] });
  });

  // (a) ESPERA
  it('enquanto analisa: botão "A analisar…" desativado, esqueleto à vista e formulário bloqueado mas visível', async () => {
    let resolveInvoke;
    mocks.invoke.mockReturnValue(new Promise((resolve) => { resolveInvoke = resolve; }));

    render(<MealRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), { target: { value: 'Bife com arroz' } });
    await selectPhoto();

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));

    const busyButton = await screen.findByRole('button', { name: /A analisar/ });
    expect(busyButton).toBeDisabled();
    expect(screen.getByTestId('analysis-skeleton')).toBeInTheDocument();

    // O formulário não desaparece: continua lá, com o que o atleta escreveu.
    const fields = screen.getByTestId('meal-form-fields');
    expect(fields).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByPlaceholderText(/Detalhes que mudam os valores/).value).toBe('Bife com arroz');
    expect(screen.getByAltText('Foto da refeição 1')).toBeInTheDocument();

    await act(async () => {
      resolveInvoke({ data: { meal: { id: 'meal-1' }, items: [] }, error: null });
    });
  });

  // (b) ERRO + "Tentar de novo"
  it('ao falhar: aviso com o texto do mock e "Tentar de novo" que repete a chamada com os mesmos dados', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });

    render(<MealRegistration onClose={onClose} />);
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));

    await screen.findByTestId('analysis-failure');
    expect(screen.getByText('Não consegui analisar')).toBeInTheDocument();
    expect(screen.getByText(/As fotos ficaram guardadas/)).toBeInTheDocument();
    // Nunca pede desculpa (CAROL.md, "O que evitar").
    expect(screen.queryByText(/Desculpa/i)).not.toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    // Ponto 2: as duas ações do aviso respeitam o piso de toque de 44px.
    // (O style do "Tentar de novo" já substituiu o minHeight do
    // WarningAction uma vez — 24px medidos no browser; ver Warning.jsx.)
    const retryButton = screen.getByRole('button', { name: /Tentar de novo/ });
    expect(retryButton).toHaveStyle({ minHeight: 'var(--tap)' });
    expect(screen.getByRole('button', { name: 'Escrever' })).toHaveStyle({ minHeight: 'var(--tap)' });

    const firstBody = mocks.invoke.mock.calls[0][1].body;
    fireEvent.click(retryButton);

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    // Mesmos dados: a mesma foto, a mesma data, o mesmo tipo de refeição.
    expect(mocks.invoke.mock.calls[1][1].body).toEqual(firstBody);
    expect(onClose).not.toHaveBeenCalled();
  });

  // (b) ERRO + "Escrever" (bug #47: no mesmo ecrã, já não há modo manual)
  it('"Escrever" leva ao campo dos alimentos e preserva foto, data, tipo e observações', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Falha na análise.' });

    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), { target: { value: 'Big Mac' } });
    await selectPhoto();
    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));
    await screen.findByTestId('analysis-failure');

    fireEvent.click(screen.getByRole('button', { name: 'Escrever' }));

    // O foco vai para o nome do alimento…
    expect(screen.getByPlaceholderText(/peito de frango grelhado/)).toHaveFocus();
    // …e nada se perdeu: a foto, as observações e o tipo de refeição.
    expect(screen.getByAltText('Foto da refeição 1')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Detalhes que mudam os valores/).value).toBe('Big Mac');
    expect(screen.getByRole('button', { name: /^Almoço$/i })).toBeInTheDocument();
    // O aviso sai assim que há um caminho novo à frente.
    expect(screen.queryByTestId('analysis-failure')).not.toBeInTheDocument();
  });

  // (c) O texto escrito sobrevive ao erro
  it('o que o atleta escreveu sobrevive a uma análise falhada, no ecrã e no rascunho persistido', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: 'Timeout na análise.' });

    render(<MealRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/Detalhes que mudam os valores/), { target: { value: 'com molho extra' } });
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'Ovos' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar alimento/i }));

    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/ }));
    await screen.findByTestId('analysis-failure');

    expect(screen.getByPlaceholderText(/Detalhes que mudam os valores/).value).toBe('com molho extra');
    expect(screen.getByText('Ovos')).toBeInTheDocument();
    expect(useAppStore.getState().meals).toEqual([]);

    // A mensagem técnica fica — é ela que distingue um timeout de um 401
    // num relatório de bug.
    expect(screen.getByTestId('analysis-failure-detail')).toHaveTextContent('Timeout na análise.');

    // E o rascunho persistido cobre o erro: fechar e reabrir não perde nada.
    await waitFor(() => {
      const raw = localStorage.getItem('ironcoach:refeicao-rascunho:nova');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw).notes).toBe('com molho extra');
    }, { timeout: 2000 });
  });
});

/* Bugs #48/#52 (fase C): a despensa no registo — sugestões enquanto se
   escreve, os habituais desta refeição, e um alimento conhecido não é
   analisado (mockup "Despensa e perguntas da Carol", ecrã 4). */
describe('MealRegistration — a despensa ao escrever', () => {
  const onClose = vi.fn();
  // Completos (2026-10-05): os 7 micronutrientes dados. O iogurte natural
  // não tem nenhum — vai à análise buscá-los.
  const MICROS = { fiber_per_100g: 0.1, sugar_per_100g: 3.6, sodium_per_100g: 36, iron_mg_per_100g: 0.1, calcium_mg_per_100g: 110, vitamin_c_mg_per_100g: 0.5, potassium_mg_per_100g: 141 };
  const FOODS = [
    { id: 'i', name: 'Iogurte grego 0%', name_key: 'iogurte grego 0%', times_seen: 6, portion_grams: 170, calories_per_100g: 59, ...MICROS },
    { id: 'n', name: 'Iogurte natural', name_key: 'iogurte natural', times_seen: 2, portion_grams: 125, calories_per_100g: 63 },
    { id: 'a', name: 'Aveia em flocos', name_key: 'aveia em flocos', times_seen: 5, portion_grams: 40, calories_per_100g: 372, ...MICROS },
  ];
  const ontem = (d) => { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); };

  beforeEach(() => {
    mocks.invoke.mockReset();
    localStorage.clear();
    useAppStore.setState({ profile: PROFILE, meals: [], pantryFoods: FOODS, pantryLoaded: true, pantryUserId: PROFILE.id });
  });

  // Revisão pré-master: outra conta no mesmo separador não herda a despensa.
  const realLoadPantry = useAppStore.getState().loadPantry;
  afterEach(() => useAppStore.setState({ loadPantry: realLoadPantry }));

  it('a despensa de outra conta não aparece nas sugestões', () => {
    useAppStore.setState({ pantryUserId: 'outra-conta', loadPantry: vi.fn() });
    render(<MealRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'io' } });
    expect(screen.queryByTestId('pantry-suggestions')).not.toBeInTheDocument();
    expect(useAppStore.getState().loadPantry).toHaveBeenCalled();
  });

  it('ao escrever, sugere da despensa; tocar junta com a porção habitual e diz que não é analisado', () => {
    render(<MealRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'io' } });
    const lista = screen.getByTestId('pantry-suggestions');
    expect(lista).toHaveTextContent('Iogurte grego 0%');
    expect(lista).toHaveTextContent('170 g · 100 kcal');
    fireEvent.click(screen.getByRole('option', { name: /Iogurte grego 0%/ }));
    expect(screen.getByText('170g · já conhecido, não é analisado')).toBeInTheDocument();
    expect(screen.queryByTestId('pantry-suggestions')).not.toBeInTheDocument();
  });

  it('um da despensa com micronutrientes por confirmar diz que a Carol os completa (não que não é analisado)', () => {
    render(<MealRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'iog nat' } });
    fireEvent.click(screen.getByRole('option', { name: /Iogurte natural/ }));
    expect(screen.getByText('125g · já conhecido · a Carol completa os micronutrientes')).toBeInTheDocument();
  });

  it('as gramas já escritas ganham à porção habitual', () => {
    render(<MealRegistration onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('g (opcional)'), { target: { value: '200' } });
    fireEvent.change(screen.getByPlaceholderText(/peito de frango grelhado/), { target: { value: 'iog gr' } });
    fireEvent.click(screen.getByRole('option', { name: /Iogurte grego 0%/ }));
    expect(screen.getByText('200g · já conhecido, não é analisado')).toBeInTheDocument();
  });

  it('o que costuma comer nesta refeição aparece por cima, com um toque', async () => {
    const tipo = 'almoco';
    useAppStore.setState({
      meals: [1, 2].map((d) => ({ id: `m${d}`, date: ontem(d), meal_type: tipo, meal_items: [{ name: 'Aveia em flocos' }] })),
    });
    render(<MealRegistration onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /^Almoço$/i }));
    const chips = screen.getByTestId('meal-habituals');
    expect(chips).toHaveTextContent('O que costumas comer ao almoço');
    fireEvent.click(screen.getByRole('button', { name: /\+ Aveia em flocos · 40 g/ }));
    expect(screen.getByText('40g · já conhecido, não é analisado')).toBeInTheDocument();

    mocks.invoke.mockResolvedValue({ data: { meal: { id: 'm9', meal_items: [] } }, error: null });
    fireEvent.click(screen.getByRole('button', { name: /Analisar refeição/i }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    // Vai com o nome da despensa: é por aí que o servidor o reconhece.
    expect(mocks.invoke.mock.calls[0][1].body.items).toEqual([{ name: 'Aveia em flocos', grams: 40 }]);
  });
});
