import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { ToastProvider } from '../shared/ToastProvider';
import ShoeCabinet from './ShoeCabinet';

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const addShoe = vi.fn().mockResolvedValue(true);
const updateShoe = vi.fn().mockResolvedValue(true);
const deleteShoe = vi.fn().mockResolvedValue(true);

const SHOE = {
  id: 'shoe-1', brand: 'Nike', model: 'Pegasus 40',
  started_on: '2026-03-01', initial_km: 100, lifespan_km: 700,
  lifespan_source: 'carol', shoe_category: 'treino diário', status: 'ativa',
};

function seed(over = {}) {
  useAppStore.setState({
    profile: { id: 'u1', weight_kg: 70 },
    shoes: [SHOE],
    runs: [],
    addShoe, updateShoe, deleteShoe,
    ...over,
  });
}

const renderCabinet = () => render(<ToastProvider><ShoeCabinet /></ToastProvider>);

describe('ShoeCabinet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addShoe.mockResolvedValue(true);
    updateShoe.mockResolvedValue(true);
    deleteShoe.mockResolvedValue(true);
    seed();
  });

  it('mostra o estado vazio quando não há sapatilhas', () => {
    seed({ shoes: [] });
    renderCabinet();
    expect(screen.getByText(/Ainda não tens sapatilhas no armário/)).toBeInTheDocument();
  });

  it('mostra os km acumulados = km iniciais + corridas do par', () => {
    seed({ runs: [
      { id: 'r1', shoe_id: 'shoe-1', distance_km: 50 },
      { id: 'r2', shoe_id: 'outro-par', distance_km: 999 },
    ] });
    renderCabinet();
    // 100 iniciais + 50 da corrida = 150 de 700 km
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText(/\/ 700 km/)).toBeInTheDocument();
    expect(screen.getByText('21%')).toBeInTheDocument();
  });

  it('avisa quando o par passou a vida útil', () => {
    seed({ runs: [{ id: 'r1', shoe_id: 'shoe-1', distance_km: 700 }] });
    renderCabinet();
    expect(screen.getByText('Vida útil excedida')).toBeInTheDocument();
    expect(screen.getByText(/está na hora de trocar/)).toBeInTheDocument();
  });

  it('ajusta a vida útil mostrada ao peso do atleta', () => {
    seed({ profile: { id: 'u1', weight_kg: 90 } });
    renderCabinet();
    // 700 * (70/90) = 544
    expect(screen.getByText(/\/ 544 km/)).toBeInTheDocument();
  });

  it('não mostra desgaste para um par sem vida útil definida', () => {
    seed({ shoes: [{ ...SHOE, lifespan_km: null, lifespan_source: null }] });
    renderCabinet();
    expect(screen.getByText(/sem vida útil definida/)).toBeInTheDocument();
    expect(screen.queryByText(/% /)).not.toBeInTheDocument();
  });

  it('separa os pares aposentados dos ativos', () => {
    seed({ shoes: [SHOE, { ...SHOE, id: 'shoe-2', model: 'Vaporfly 3', status: 'aposentada' }] });
    renderCabinet();
    expect(screen.getByText('Aposentadas')).toBeInTheDocument();
    expect(screen.getByText('Nike Vaporfly 3')).toBeInTheDocument();
  });

  it('grava um par novo com os campos do formulário', async () => {
    seed({ shoes: [] });
    renderCabinet();

    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));
    fireEvent.change(screen.getByPlaceholderText('Nike'), { target: { value: 'Asics' } });
    fireEvent.change(screen.getByPlaceholderText('Pegasus 40'), { target: { value: 'Novablast 4' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '80' } });
    fireEvent.change(screen.getByPlaceholderText('Ex.: 700'), { target: { value: '650' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(addShoe).toHaveBeenCalledTimes(1));
    expect(addShoe).toHaveBeenCalledWith(expect.objectContaining({
      brand: 'Asics',
      model: 'Novablast 4',
      initial_km: 80,
      lifespan_km: 650,
      lifespan_source: 'manual',
    }));
  });

  it('recusa gravar sem marca e modelo', async () => {
    seed({ shoes: [] });
    renderCabinet();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('A marca e o modelo são obrigatórios.')).toBeInTheDocument();
    expect(addShoe).not.toHaveBeenCalled();
  });

  describe('estimativa da Carol', () => {
    const openForm = () => {
      renderCabinet();
      fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));
      fireEvent.change(screen.getByPlaceholderText('Nike'), { target: { value: 'Nike' } });
      fireEvent.change(screen.getByPlaceholderText('Pegasus 40'), { target: { value: 'Vaporfly 3' } });
    };

    it('preenche a vida útil com o que a Carol devolve', async () => {
      seed({ shoes: [] });
      invokeEdgeFunctionWithTimeout.mockResolvedValue({
        data: { estimate: { lifespan_km: 300, category: 'competição', rationale: 'Placa de carbono, espuma que perde rápido.' } },
        error: null,
      });
      openForm();
      fireEvent.click(screen.getByRole('button', { name: /Perguntar à Carol/ }));

      await waitFor(() => expect(screen.getByPlaceholderText('Ex.: 700')).toHaveValue(300));
      expect(screen.getByText(/Placa de carbono/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => expect(addShoe).toHaveBeenCalledWith(expect.objectContaining({
        lifespan_km: 300,
        lifespan_source: 'carol',
        shoe_category: 'competição',
      })));
    });

    it('a autoria passa a manual se o atleta corrigir o número da Carol', async () => {
      seed({ shoes: [] });
      invokeEdgeFunctionWithTimeout.mockResolvedValue({
        data: { estimate: { lifespan_km: 300, category: 'competição', rationale: 'x' } },
        error: null,
      });
      openForm();
      fireEvent.click(screen.getByRole('button', { name: /Perguntar à Carol/ }));
      await waitFor(() => expect(screen.getByPlaceholderText('Ex.: 700')).toHaveValue(300));

      fireEvent.change(screen.getByPlaceholderText('Ex.: 700'), { target: { value: '420' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(addShoe).toHaveBeenCalledWith(expect.objectContaining({
        lifespan_km: 420,
        lifespan_source: 'manual',
      })));
    });

    it('quando a Carol não conhece o modelo, avisa e deixa gravar à mão', async () => {
      seed({ shoes: [] });
      invokeEdgeFunctionWithTimeout.mockResolvedValue({
        data: { estimate: null, message: 'Não conheço o modelo "Nike Vaporfly 3".' },
        error: null,
      });
      openForm();
      fireEvent.click(screen.getByRole('button', { name: /Perguntar à Carol/ }));

      expect(await screen.findByText(/Não conheço o modelo/)).toBeInTheDocument();
      // O campo continua editável e vazio — nada foi imposto ao atleta.
      expect(screen.getByPlaceholderText('Ex.: 700')).toHaveValue(null);
    });

    it('exige marca e modelo antes de chamar a Carol', async () => {
      seed({ shoes: [] });
      renderCabinet();
      fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));
      fireEvent.click(screen.getByRole('button', { name: /Perguntar à Carol/ }));

      expect(await screen.findByText('Escreve a marca e o modelo primeiro.')).toBeInTheDocument();
      expect(invokeEdgeFunctionWithTimeout).not.toHaveBeenCalled();
    });
  });

  it('aposenta um par sem o apagar', async () => {
    renderCabinet();
    fireEvent.click(screen.getByRole('button', { name: /Aposentar/ }));

    await waitFor(() => expect(updateShoe).toHaveBeenCalledWith('shoe-1', expect.objectContaining({
      status: 'aposentada',
    })));
    expect(deleteShoe).not.toHaveBeenCalled();
  });

  it('pede confirmação antes de remover, explicando que as corridas ficam', async () => {
    renderCabinet();
    fireEvent.click(screen.getByRole('button', { name: /Remover/ }));

    const dialog = await screen.findByText(/As corridas que fizeste com elas mantêm-se/);
    expect(dialog).toBeInTheDocument();
    expect(deleteShoe).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(deleteShoe).toHaveBeenCalledWith('shoe-1'));
  });
});
