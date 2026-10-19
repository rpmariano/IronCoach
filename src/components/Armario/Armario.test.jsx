import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAppStore } from '../../store';
import Armario from './Armario';

const mocks = vi.hoisted(() => ({ calls: [], error: null }));
vi.mock('../../lib/supabase', () => {
  const chainFor = (table, op) => {
    const chain = {
      eq: () => chain,
      select: () => chain,
      single: () => Promise.resolve(mocks.error ? { data: null, error: mocks.error } : { data: { id: 'novo' }, error: null }),
      then: (resolve) => resolve({ error: mocks.error }),
    };
    return chain;
  };
  return {
    supabase: {
      from: (table) => ({
        select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }), then: (r) => r({ data: [], error: null }) }), then: (r) => r({ data: [], error: null }) }),
        insert: (row) => { mocks.calls.push({ table, op: 'insert', row }); return chainFor(table, 'insert'); },
        update: (row) => { mocks.calls.push({ table, op: 'update', row }); return chainFor(table, 'update'); },
        delete: () => { mocks.calls.push({ table, op: 'delete' }); return chainFor(table, 'delete'); },
      }),
    },
    invokeEdgeFunctionWithTimeout: vi.fn(),
  };
});
vi.mock('../shared/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const ROWS = [
  { id: 'e1', name: 'Leg Press', name_key: 'leg press', category: 'Pernas Inferiores', block_type: 'forca', last_weight: 100, last_reps: 10, personal_record_weight: 120, times_performed: 4, machine_settings: 'banco furo 3', last_performed_at: '2026-10-17T12:00:00.000Z' },
  { id: 'e2', name: 'Supino', name_key: 'supino', category: 'Peito', block_type: 'forca', last_weight: 60, last_reps: 8, personal_record_weight: 70, times_performed: 2, machine_settings: null, last_performed_at: '2026-10-10T12:00:00.000Z' },
  { id: 'e3', name: 'Bicicleta', name_key: 'bicicleta', category: 'Cardio', block_type: 'cardio', times_performed: 1, last_performed_at: '2026-10-12T12:00:00.000Z' },
];

describe('Armário — submenus por secção (decisão 14)', () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.error = null;
    localStorage.clear();
    useAppStore.setState({
      profile: { id: 'u1' }, session: { user: { id: 'u1' } },
      exerciseLocker: ROWS, exerciseLockerUserId: 'u1', loadExerciseLocker: vi.fn(),
      pantryFoods: [], foodRules: [], mealTemplates: [], pantryLoaded: true, pantryUserId: 'u1', loadPantry: vi.fn(),
      loadExerciseLockerCalls: 0,
    });
  });

  it('três secções, a primeira (Treino) aberta; cada uma mostra só o seu painel', () => {
    render(<Armario />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Treino', 'Alimentação', 'Equipamento']);
    expect(screen.getByRole('tab', { name: 'Treino' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('exercise-locker-section')).toBeInTheDocument();
    expect(screen.queryByTestId('pantry-section')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Alimentação' }));
    expect(screen.getByTestId('pantry-section')).toBeInTheDocument();
    expect(screen.queryByTestId('exercise-locker-section')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Equipamento' }));
    expect(screen.getByRole('button', { name: 'Adicionar sapatilhas' })).toBeInTheDocument();
  });

  it('lembra a secção aberta da última vez', () => {
    const { unmount } = render(<Armario />);
    fireEvent.click(screen.getByRole('tab', { name: 'Alimentação' }));
    unmount();
    render(<Armario />);
    expect(screen.getByRole('tab', { name: 'Alimentação' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Treino: os exercícios com a última carga, o recorde e a afinação; os mais recentes primeiro', () => {
    render(<Armario />);
    const items = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(items[0]).toMatch(/Leg Press.*Pernas Inferiores.*100 kg × 10.*recorde 120 kg.*4 vezes.*Afinação: banco furo 3/);
    expect(items[1]).toMatch(/Bicicleta.*Cardio/);
    expect(items[2]).toMatch(/Supino/);
  });

  it('Treino: procura por nome e filtra por grupo muscular', () => {
    render(<Armario />);
    fireEvent.change(screen.getByPlaceholderText('Procurar exercício'), { target: { value: 'sup' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText('Procurar exercício'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Peito' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Supino')).toBeInTheDocument();
  });

  it('Treino vazio explica como se enche', () => {
    useAppStore.setState({ exerciseLocker: [] });
    render(<Armario />);
    expect(screen.getByText(/Ainda vazio\. Cada exercício que registares fica cá/)).toBeInTheDocument();
  });

  it('o Armário de outra conta não aparece', () => {
    useAppStore.setState({ exerciseLockerUserId: 'outra' });
    render(<Armario />);
    expect(screen.queryByText('Leg Press')).not.toBeInTheDocument();
  });

  it('tocar num exercício abre a ficha; guardar a afinação grava só nesse exercício', async () => {
    render(<Armario />);
    fireEvent.click(screen.getByText('Supino'));
    expect(screen.getByTestId('exercise-sheet')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Afinação da máquina/), { target: { value: ' banco furo 5, pino 2 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.calls).toHaveLength(1));
    expect(mocks.calls[0]).toMatchObject({ table: 'athlete_exercises', op: 'update', row: { name: 'Supino', machine_settings: 'banco furo 5, pino 2', category: 'Peito', block_type: 'forca' } });
    expect(mocks.calls[0].row.user_id).toBeUndefined();
  });

  it('"+" junta um exercício novo à mão (0 vezes) e o nome repetido avisa', async () => {
    render(<Armario />);
    fireEvent.click(screen.getByTestId('locker-add-exercise'));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Remada baixa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Costas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Juntar ao Armário' }));
    await waitFor(() => expect(mocks.calls).toHaveLength(1));
    expect(mocks.calls[0]).toMatchObject({ op: 'insert', row: { name: 'Remada baixa', name_key: 'remada baixa', category: 'Costas', user_id: 'u1', times_performed: 0 } });
  });

  it('um nome que já existe mostra a frase certa', async () => {
    mocks.error = { code: '23505', message: 'duplicate' };
    render(<Armario />);
    fireEvent.click(screen.getByTestId('locker-add-exercise'));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Supino' } });
    fireEvent.click(screen.getByRole('button', { name: 'Juntar ao Armário' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Já tens um exercício com esse nome.');
  });

  it('tirar do Armário pede confirmação antes de apagar', async () => {
    render(<Armario />);
    fireEvent.click(screen.getByText('Supino'));
    fireEvent.click(screen.getByRole('button', { name: 'Tirar do Armário' }));
    expect(mocks.calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Tirar' }));
    await waitFor(() => expect(mocks.calls).toEqual([{ table: 'athlete_exercises', op: 'delete' }]));
  });
});

describe('Armário — navegação por setas nos separadores', () => {
  it('as setas, Home e End movem entre as secções e o foco acompanha', () => {
    render(<Armario />);
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();
    fireEvent.keyDown(tabs[0].parentElement, { key: 'ArrowRight' });
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1].parentElement, { key: 'End' });
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tabs[2].parentElement, { key: 'ArrowRight' });
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    // Só o separador ativo está na ordem de tabulação.
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
  });
});
