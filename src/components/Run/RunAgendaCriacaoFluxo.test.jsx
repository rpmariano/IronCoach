import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { ToastProvider } from '../shared/ToastProvider';
import RunAgenda from './RunAgenda';
import { todayISO, addDaysISO } from '../../lib/utils';

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({}) },
  invokeEdgeFunctionWithTimeout: vi.fn(() => Promise.resolve({ data: null })),
}));

/* Bug #54 (2026-10-05, Android/Chrome, página "provas"): «ao gravar dá
   mensagem de sucesso mas não sai do preenchimento da prova. Ao cancelar, a
   mesma ficou gravada.»
   Os testes antigos de RunAgenda.test.jsx substituem setEditingRaceId por um
   mock que só mexe em editingRaceId e dão um `onClose` vazio — por isso nunca
   viam o fecho real. Aqui usa-se o store a sério e o MESMO montador do App.jsx:
   `(openCreationMode === 'race' || editingRaceId) && <RunAgenda onClose=…/>`. */
function AppLike() {
  const openCreationMode = useAppStore((s) => s.openCreationMode);
  const editingRaceId = useAppStore((s) => s.editingRaceId);
  const setOpenCreationMode = useAppStore((s) => s.setOpenCreationMode);
  const setEditingRaceId = useAppStore((s) => s.setEditingRaceId);
  return (
    <ToastProvider>
      {(openCreationMode === 'race' || editingRaceId) && (
        <RunAgenda onClose={() => { setOpenCreationMode(null); setEditingRaceId(null); }} />
      )}
    </ToastProvider>
  );
}

function preencher() {
  fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
  fireEvent.change(screen.getByPlaceholderText('Ex.: Meia Maratona de Lisboa'), { target: { value: 'Prova Teste' } });
  fireEvent.change(screen.getByPlaceholderText('Ex.: Lisboa'), { target: { value: 'Porto' } });
  const nivel = screen.getAllByRole('combobox').find((s) => s.value === '');
  fireEvent.change(nivel, { target: { value: 'medio' } });
  fireEvent.change(screen.getByPlaceholderText('Ex.: 1:45:00'), { target: { value: '1:00:00' } });
}

describe('RunAgenda — criar prova com o store real (bug #54)', () => {
  const nova = {
    id: 'race-nova', date: addDaysISO(todayISO(), 30), location: 'Porto', name: 'Prova Teste',
    race_type: 'estrada', distance_km: 10, experience_level: 'medio', race_priority: 'a',
    target_time: '1:00:00', target_time_seconds: 3600, target_pace_seconds_per_km: 360,
    website: null, web_info: null, notes: null, status: 'agendada',
  };
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      raceEvents: [], profile: { id: 'user-1' }, runs: [], activeTab: 'provas',
      editingRaceId: null, openCreationMode: 'race', navGuard: null,
    });
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: nova, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  /* O carrossel nativo não existe em jsdom: emula-se com largura 400 e um
     scrollTo que mexe no scrollLeft — o que o Chrome do Android faz de facto.
     A causa do bug #54: a MESMA instância passa de "Nova Prova" (a ler os
     Detalhes, página 2) para o hub da prova gravada, mas o scrollLeft ficava
     na página 2 — o atleta continuava a ver o formulário. */
  it('gravar → o carrossel volta à página do hub (scrollLeft 0), não fica nos Detalhes', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 600, top: 0, left: 0, right: 400, bottom: 600 });
    // offsetWidth também: o haptics.js mede a largura de página por um ou
    // outro caminho conforme a versão; assim o teste não depende disso.
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 400 });
    HTMLElement.prototype.scrollTo = function scrollTo(opts) { this.scrollLeft = opts.left; };
    try {
      render(<AppLike />);
      preencher();
      const carrossel = document.querySelector('.tab-swipe-page').parentElement;
      expect(carrossel.scrollLeft).toBe(400);
      fireEvent.click(screen.getByRole('button', { name: /Guardar prova/i }));
      fireEvent.click(await screen.findByTestId('record-confirmation-close'));
      await waitFor(() => expect(screen.getByTestId('race-hub-screen')).toBeInTheDocument());
      await waitFor(() => expect(carrossel.scrollLeft).toBe(0));
    } finally {
      delete HTMLElement.prototype.scrollTo;
      delete HTMLElement.prototype.offsetWidth;
    }
  });

  it('gravar → confirmação → o formulário de criação fecha e mostra o hub da prova criada', async () => {
    render(<AppLike />);
    preencher();
    fireEvent.click(screen.getByRole('button', { name: /Guardar prova/i }));
    fireEvent.click(await screen.findByTestId('record-confirmation-close'));

    await waitFor(() => expect(screen.queryByTestId('record-confirmation-close')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('race-hub-screen')).toBeInTheDocument());
    // Já não está em modo "criação" (sem rascunho "nova" nem placeholder do formulário de criação).
    expect(useAppStore.getState().editingRaceId).toBe('race-nova');
    expect(screen.queryByText('Nova Prova')).toBeNull();
  });

  it('gravar e depois voltar/cancelar: sai sem avisos de alterações e a prova continua gravada uma só vez', async () => {
    render(<AppLike />);
    preencher();
    fireEvent.click(screen.getByRole('button', { name: /Guardar prova/i }));
    fireEvent.click(await screen.findByTestId('record-confirmation-close'));
    await waitFor(() => expect(screen.getByTestId('race-hub-screen')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Voltar/i }));
    await waitFor(() => expect(screen.queryByTestId('race-hub-screen')).toBeNull());
    expect(screen.queryByText('Tens alterações por gravar')).toBeNull();
    expect(useAppStore.getState().editingRaceId).toBeNull();
    expect(useAppStore.getState().openCreationMode).toBeNull();
    expect(useAppStore.getState().raceEvents).toHaveLength(1);
    expect(localStorage.getItem('ironcoach:prova-rascunho:nova')).toBeNull();
  });
});
