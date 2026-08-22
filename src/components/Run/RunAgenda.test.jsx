import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { ToastProvider } from '../shared/ToastProvider';
import RunAgenda from './RunAgenda';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const EXISTING_RACE = {
  id: 'race-1',
  date: '2026-09-16',
  location: 'Lisboa',
  name: 'Corrida do Tejo',
  race_type: 'estrada',
  distance_km: 10,
  elevation_gain_m: null,
  experience_level: 'medio',
  race_priority: 'a',
  target_time: '55:00',
  target_time_seconds: 3300,
  target_pace_seconds_per_km: 330,
  website: 'https://corridadotejo.com/',
  web_info: null,
  notes: null,
};

function renderAgenda() {
  return render(
    <ToastProvider>
      <RunAgenda onClose={() => {}} />
    </ToastProvider>,
  );
}

describe('RunAgenda — "Obter informação do site" & Dual-Page', () => {
  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    useAppStore.setState({
      raceEvents: [EXISTING_RACE],
      profile: { id: 'user-1' },
      runs: [],
      editingRaceId: null,
      activeTab: 'holistica',
      pendingCalendarDate: null,
      setRaceEvents: (events) => useAppStore.setState({ raceEvents: events }),
      setNavGuard: () => {},
      setEditingRaceId: (id) => useAppStore.setState({ editingRaceId: id }),
    });
  });

  it('não mostra o botão de obter do site sem website preenchido', () => {
    renderAgenda();
    expect(screen.queryByRole('button', { name: /Obter Informação/i })).not.toBeInTheDocument();
  });

  it('mostra o botão assim que se escreve um site e se visualiza a aba Treino e Evolução', () => {
    renderAgenda();
    // Vai a Detalhes da prova para adicionar site
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://novaprova.pt' } });
    
    // Volta a Treino e Evolução
    fireEvent.click(screen.getByRole('button', { name: /^Treino e Evolução$/i }));
    expect(screen.getByRole('button', { name: /Obter Informação/i })).toBeInTheDocument();
  });

  it('prova nova: pede em modo rascunho (sem race_event_id) e guarda só no rascunho, sem persistir', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: {
        web_info: {
          schedule: [{ label: 'Partida', when: 'Domingo 09:00', where: null }],
          required_documents: null,
          category_info: null,
          gear_recommendations: null,
          logistics: null,
          route_summary: null,
          route_segments: null,
          caveats: null,
          source_url: 'https://novaprova.pt',
          fetched_at: '2026-08-19T10:00:00.000Z',
        },
      },
      error: null,
    });

    renderAgenda();
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://novaprova.pt' } });
    
    fireEvent.click(screen.getByRole('button', { name: /^Treino e Evolução$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Obter Informação/i }));

    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledWith(
      'enrich-race-event',
      { body: expect.objectContaining({ website: 'https://novaprova.pt' }) },
      expect.any(Number),
    );
    const [, callArgs] = invokeEdgeFunctionWithTimeout.mock.calls[0];
    expect(callArgs.body.race_event_id).toBeUndefined();

    await waitFor(() => {
      expect(screen.getByText('Domingo 09:00')).toBeInTheDocument();
    });
    // Não persistiu nada — a prova ainda nem tem id.
    expect(useAppStore.getState().raceEvents).toEqual([EXISTING_RACE]);
  });

  it('a editar uma prova já gravada: pede com race_event_id e persiste de imediato no store', async () => {
    const updatedEvent = {
      ...EXISTING_RACE,
      web_info: {
        schedule: [{ label: 'Levantamento de dorsais', when: 'Sábado 14h-19h', where: 'Doca de Alcântara' }],
        required_documents: 'Cartão de cidadão.',
        category_info: null,
        gear_recommendations: null,
        logistics: null,
        route_summary: null,
        route_segments: null,
        caveats: null,
        source_url: 'https://corridadotejo.com/',
        fetched_at: '2026-08-19T10:00:00.000Z',
      },
    };
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { race_event: updatedEvent }, error: null });

    useAppStore.setState({ editingRaceId: 'race-1' });
    renderAgenda();

    fireEvent.click(screen.getByRole('button', { name: /Obter Informação/i }));

    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledWith(
      'enrich-race-event',
      { body: { race_event_id: 'race-1' } },
      expect.any(Number),
    );

    await waitFor(() => {
      expect(screen.getByText('Cartão de cidadão.')).toBeInTheDocument();
    });
    expect(screen.getByText(/Doca de Alcântara/)).toBeInTheDocument();
    expect(useAppStore.getState().raceEvents[0].web_info).toEqual(updatedEvent.web_info);
    expect(screen.getByRole('button', { name: /Atualizar Informação/i })).toBeInTheDocument();
  });

  it('mostra o modal de dados incompletos sem rebentar ao gravar com campos obrigatórios em falta', () => {
    renderAgenda();
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    fireEvent.change(screen.getByPlaceholderText('Ex.: Meia Maratona de Lisboa'), { target: { value: 'Prova Teste' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));
    expect(screen.getByText('Dados Incompletos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Entendido/i }));
    expect(screen.queryByText('Dados Incompletos')).not.toBeInTheDocument();
  });

  function fillRequiredFields() {
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    fireEvent.change(screen.getByPlaceholderText('Ex.: Meia Maratona de Lisboa'), { target: { value: 'Prova Teste' } });
    fireEvent.change(screen.getByPlaceholderText('Ex.: Lisboa'), { target: { value: 'Porto' } });
    const nivelSelect = screen.getAllByRole('combobox').find((s) => s.value === '');
    fireEvent.change(nivelSelect, { target: { value: 'medio' } });
    fireEvent.change(screen.getByPlaceholderText('Ex.: 1:45:00'), { target: { value: '1:00:00' } });
  }

  it('prova NOVA: ao gravar, navega para o Calendário e deixa a data da prova pendente — independentemente do separador de origem', async () => {
    useAppStore.setState({ activeTab: 'holistica' });
    renderAgenda();
    fillRequiredFields();
    const dateInput = document.querySelector('input[type="date"]');
    const expectedDate = dateInput.value;

    fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

    await waitFor(() => {
      expect(useAppStore.getState().activeTab).toBe('calendario');
    });
    expect(useAppStore.getState().pendingCalendarDate).toBe(expectedDate);
  });

  it('a editar uma prova: ao gravar, volta ao separador de origem sem tocar no Calendário', async () => {
    useAppStore.setState({ editingRaceId: 'race-1', activeTab: 'holistica' });
    renderAgenda();
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    fireEvent.change(screen.getByPlaceholderText('Ex.: Meia Maratona de Lisboa'), { target: { value: 'Corrida do Tejo (editada)' } });

    fireEvent.click(screen.getByRole('button', { name: /Guardar/i }));

    await waitFor(() => {
      expect(useAppStore.getState().editingRaceId).toBeNull();
    });
    expect(useAppStore.getState().activeTab).toBe('holistica');
    expect(useAppStore.getState().pendingCalendarDate).toBeNull();
  });

  it('permite alternar entre "Treino e Evolução" e "Detalhes da prova"', () => {
    useAppStore.setState({ editingRaceId: 'race-1' });
    renderAgenda();

    // Começa em Treino e Evolução
    expect(screen.getByText(/Contagem para a Prova/i)).toBeInTheDocument();
    expect(screen.getByText(/Análise da Carol · Evolução & Prontidão/i)).toBeInTheDocument();
    expect(screen.getByText(/Macrociclo de Treino/i)).toBeInTheDocument();
    expect(screen.getByText(/Base Aeróbica/i)).toBeInTheDocument();

    // Clica na aba Detalhes da prova
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    expect(screen.getByPlaceholderText('Ex.: Meia Maratona de Lisboa')).toBeInTheDocument();

    // Volta para Treino e Evolução
    fireEvent.click(screen.getByRole('button', { name: /^Treino e Evolução$/i }));
    expect(screen.getByText(/Contagem para a Prova/i)).toBeInTheDocument();
  });
});
