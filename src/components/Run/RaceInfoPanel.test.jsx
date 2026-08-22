import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { ToastProvider } from '../shared/ToastProvider';
import RaceInfoPanel from './RaceInfoPanel';

vi.mock('../../lib/supabase', () => ({
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const BASE_EVENT = {
  id: 'race-1',
  name: 'Corrida do Tejo',
  website: 'https://corridadotejo.pt',
  web_info: null,
};

// RaceInfoPanel recebe `ev` como prop (não lê o store diretamente para
// desenhar) — no cartão real, RaceCard recebe esse prop já atualizado a
// partir de raceEvents no store depois de setRaceEvents correr. Este wrapper
// replica essa ligação, em vez de passar um objeto estático que nunca muda.
function ConnectedPanel({ id }) {
  const ev = useAppStore((s) => s.raceEvents.find((r) => r.id === id));
  return <RaceInfoPanel ev={ev} />;
}

function renderPanel(ev) {
  useAppStore.setState({ raceEvents: [ev] });
  return render(
    <ToastProvider>
      <ConnectedPanel id={ev.id} />
    </ToastProvider>,
  );
}

describe('RaceInfoPanel', () => {
  beforeEach(() => {
    invokeEdgeFunctionWithTimeout.mockReset();
    useAppStore.setState({ raceEvents: [BASE_EVENT], setRaceEvents: (events) => useAppStore.setState({ raceEvents: events }) });
  });

  it('não renderiza nada se a prova não tiver site definido', () => {
    renderPanel({ ...BASE_EVENT, website: '' });
    expect(screen.queryByText('Informação da Prova')).not.toBeInTheDocument();
  });

  it('mostra "Obter do site" quando ainda não há informação, e "Atualizar" quando já há', () => {
    renderPanel(BASE_EVENT);
    expect(screen.getByRole('button', { name: /Obter do site/i })).toBeInTheDocument();
  });

  it('ao clicar, chama enrich-race-event com o id da prova e atualiza o store com o resultado', async () => {
    const updatedEvent = {
      ...BASE_EVENT,
      web_info: {
        schedule: [{ label: 'Partida', when: 'Domingo 09:00', where: 'Praça do Comércio' }],
        required_documents: 'Cartão de cidadão para levantar o dorsal.',
        category_info: 'Escalão M35: onda B às 09:10.',
        gear_recommendations: 'Chip obrigatório.',
        logistics: 'Parque de estacionamento junto à meta.',
        route_summary: 'Maioritariamente plano.',
        route_segments: [
          { km_marker: 0, description: 'Partida na Praça do Comércio', turn: 'partida', elevation: 'plano' },
          { km_marker: 5, description: 'Vira à esquerda na Av. Central', turn: 'esquerda', elevation: 'plano' },
        ],
        caveats: null,
        source_url: 'https://corridadotejo.pt',
        fetched_at: '2026-08-19T10:00:00.000Z',
      },
    };
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: { race_event: updatedEvent }, error: null });

    renderPanel(BASE_EVENT);
    fireEvent.click(screen.getByRole('button', { name: /Obter do site/i }));

    expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledWith(
      'enrich-race-event',
      { body: { race_event_id: 'race-1' } },
      expect.any(Number),
    );

    await waitFor(() => {
      expect(screen.getByText('Domingo 09:00')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Praça do Comércio/).length).toBeGreaterThan(0);
    expect(screen.getByText('Cartão de cidadão para levantar o dorsal.')).toBeInTheDocument();
    expect(screen.getByText('Escalão M35: onda B às 09:10.')).toBeInTheDocument();
    expect(screen.getByText('Chip obrigatório.')).toBeInTheDocument();
    expect(screen.getByText('Parque de estacionamento junto à meta.')).toBeInTheDocument();
    expect(screen.getByText('Maioritariamente plano.')).toBeInTheDocument();
    expect(screen.getByText(/Partida na Praça do Comércio/)).toBeInTheDocument();
    expect(useAppStore.getState().raceEvents[0].web_info).toEqual(updatedEvent.web_info);
  });

  it('mostra um toast de erro quando a edge function falha, sem atualizar o store', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({ data: null, error: 'Não consegui aceder a este site.' });

    renderPanel(BASE_EVENT);
    fireEvent.click(screen.getByRole('button', { name: /Obter do site/i }));

    await waitFor(() => {
      expect(screen.getByText('Não consegui aceder a este site.')).toBeInTheDocument();
    });
    expect(useAppStore.getState().raceEvents[0].web_info).toBeNull();
  });

  it('mostra a mensagem devolvida quando o site não tem informação relevante', async () => {
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: { web_info: null, message: 'Não encontrei informação relevante neste site.' },
      error: null,
    });

    renderPanel(BASE_EVENT);
    fireEvent.click(screen.getByRole('button', { name: /Obter do site/i }));

    await waitFor(() => {
      expect(screen.getByText('Não encontrei informação relevante neste site.')).toBeInTheDocument();
    });
  });
});
