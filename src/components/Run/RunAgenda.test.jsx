import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
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

  afterEach(() => {
    // Alguns testes fazem vi.spyOn(supabase, 'from') para simular um insert
    // com id/website — sem restaurar, esse spy sobrevivia para os testes
    // seguintes e quebrava-os (mock global do módulo é partilhado entre
    // todos os testes deste describe).
    vi.restoreAllMocks();
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

  it('BUG CORRIGIDO (2026-08-30) — prova NOVA com site preenchido mas sem "Obter Informação" pedido: recolhe a informação automaticamente ao gravar', async () => {
    const insertedRace = {
      id: 'race-nova-1', date: '2026-09-13', location: 'Lisboa', name: 'Prova Teste',
      race_type: 'estrada', distance_km: 10, elevation_gain_m: null, experience_level: 'medio',
      race_priority: 'a', target_time: '1:00:00', target_time_seconds: 3600, target_pace_seconds_per_km: 360,
      website: 'https://novaprova.pt', web_info: null, notes: null, user_id: 'user-1', status: 'agendada',
    };
    vi.spyOn(supabase, 'from').mockReturnValue({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: insertedRace, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    });
    invokeEdgeFunctionWithTimeout.mockResolvedValue({
      data: {
        race_event: {
          ...insertedRace,
          web_info: {
            schedule: [{ label: 'Partida', when: 'Domingo 09:00', where: null }],
            required_documents: null, category_info: null, gear_recommendations: null, logistics: null,
            route_summary: null, route_segments: null, caveats: null,
            source_url: 'https://novaprova.pt', fetched_at: '2026-08-30T10:00:00.000Z',
          },
        },
      },
      error: null,
    });

    useAppStore.setState({ editingRaceId: null });
    renderAgenda();
    fillRequiredFields();
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://novaprova.pt' } });

    fireEvent.click(screen.getAllByRole('button', { name: /Guardar Prova/i })[1]);

    // O pedido usa o modo já persistido (race_event_id), tal como "Obter
    // Informação" numa prova existente — não bloqueia a navegação, que já
    // aconteceu (ver waitFor de baixo).
    await waitFor(() => {
      expect(invokeEdgeFunctionWithTimeout).toHaveBeenCalledWith(
        'enrich-race-event',
        { body: { race_event_id: 'race-nova-1' } },
        expect.any(Number),
      );
    });

    await waitFor(() => {
      expect(useAppStore.getState().raceEvents.find(e => e.id === 'race-nova-1')?.web_info?.schedule).toEqual([
        { label: 'Partida', when: 'Domingo 09:00', where: null },
      ]);
    });
  });

  it('BUG CORRIGIDO (2026-08-30) — o Hub embutido ao EDITAR uma prova gravada também respeita o início real da preparação (draft ficava sem created_at)', () => {
    // A correção do macrociclo comprimido (calculateRaceTrainingPlan) só
    // funciona se `race.created_at` chegar até ela. O RaceHubView embutido
    // na aba "Treino e Evolução" recebe `race={draft}` — e o useEffect que
    // popula o draft ao editar uma prova gravada listava os campos do
    // formulário um a um, sem created_at, porque nunca é editável. Isso
    // fazia TODA prova em edição parecer "sem created_at" (nunca
    // comprimida) precisamente na única forma de veres o Hub de uma prova
    // já gravada nesta app — bug ainda visível depois da correção original.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00Z'));
    try {
      const compressedRace = {
        ...EXISTING_RACE,
        id: 'race-comprimida',
        date: '2026-09-13', // 14 dias à frente — 6 semanas recomendadas (10k/medio) não cabem
        distance_km: 10,
        experience_level: 'medio',
        created_at: '2026-08-30T10:14:44.086064+00:00',
      };
      useAppStore.setState({ raceEvents: [compressedRace], editingRaceId: 'race-comprimida' });
      renderAgenda();

      // Aba inicial ao editar já é "Treino e Evolução" (o Hub embutido).
      const baseCard = screen.getByText('Base Aeróbica').closest('.rh-phase-card');
      expect(within(baseCard).getByText('Não Realizada')).toBeInTheDocument();
      expect(within(baseCard).queryByText('Concluída')).not.toBeInTheDocument();
      expect(screen.getByText(/Sem\. 1 de 6/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('mostra o modal de dados incompletos sem rebentar ao gravar com campos obrigatórios em falta', () => {
    renderAgenda();
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    fireEvent.change(screen.getByPlaceholderText('Ex.: Meia Maratona de Lisboa'), { target: { value: 'Prova Teste' } });
    fireEvent.click(screen.getAllByRole('button', { name: /Guardar Prova/i })[1]);
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

    fireEvent.click(screen.getAllByRole('button', { name: /Guardar Prova/i })[1]);

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

    fireEvent.click(screen.getAllByRole('button', { name: /Guardar Prova/i })[1]);

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
    expect(screen.getByText(/Evolução & Prontidão/i)).toBeInTheDocument();
    expect(screen.getByText(/Macrociclo de Treino/i)).toBeInTheDocument();
    expect(screen.getByText(/Base Aeróbica/i)).toBeInTheDocument();

    // Clica na aba Detalhes da prova
    fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));
    expect(screen.getByPlaceholderText('Ex.: Meia Maratona de Lisboa')).toBeInTheDocument();

    // Volta para Treino e Evolução
    fireEvent.click(screen.getByRole('button', { name: /^Treino e Evolução$/i }));
    expect(screen.getByText(/Contagem para a Prova/i)).toBeInTheDocument();
  });

  // Ver specs/nivel-por-prova.md, "Invalidação do nível declarado" — tipo,
  // distância e D+ são os três antecessores da pergunta de nível; mudar de
  // categoria depois de já ter respondido invalida a resposta.
  describe('invalidação do nível ao mudar tipo/distância/D+', () => {
    // Ordem estável dos <select> em "Detalhes da prova": Tipo, Distância,
    // Nível, Prioridade — o D+ é <input type="number">, não combobox, por
    // isso não desloca os índices entre estrada e trail.
    function comboboxes() {
      return screen.getAllByRole('combobox');
    }

    it('prova NOVA: mudar a distância de categoria limpa o nível em silêncio', () => {
      useAppStore.setState({ editingRaceId: null });
      renderAgenda();
      fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));

      // Distância por omissão é '10' (10k) — escolhe o nível para essa categoria.
      fireEvent.change(comboboxes()[2], { target: { value: 'medio' } });
      expect(comboboxes()[2].value).toBe('medio');

      // Muda para meia maratona — categoria diferente (10k → meia).
      fireEvent.change(comboboxes()[1], { target: { value: '21.0975' } });

      expect(comboboxes()[2].value).toBe('');
    });

    it('prova NOVA: mudar a distância DENTRO da mesma categoria não limpa o nível', () => {
      useAppStore.setState({ editingRaceId: null });
      renderAgenda();
      fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));

      fireEvent.change(comboboxes()[2], { target: { value: 'medio' } });
      // 8 km continua categoria "10k" (categorizeDistance: km ≤ 11 → 10k).
      fireEvent.change(comboboxes()[1], { target: { value: '8' } });

      expect(comboboxes()[2].value).toBe('medio');
    });

    it('prova NOVA, trail: mudar o D+ de banda limpa o nível em silêncio', () => {
      useAppStore.setState({ editingRaceId: null });
      renderAgenda();
      fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));

      fireEvent.change(comboboxes()[0], { target: { value: 'trail' } });
      // 10 km com 200 m D+ → 20 m/km → banda "rolante".
      fireEvent.change(screen.getByPlaceholderText('Ex.: 1200'), { target: { value: '200' } });
      fireEvent.change(comboboxes()[2], { target: { value: 'medio' } });
      expect(comboboxes()[2].value).toBe('medio');

      // 10 km com 600 m D+ → 60 m/km → banda "montanha": categoria mudou.
      fireEvent.change(screen.getByPlaceholderText('Ex.: 1200'), { target: { value: '600' } });

      expect(comboboxes()[2].value).toBe('');
    });

    it('a EDITAR uma prova gravada: mudar a distância NÃO limpa o nível, só avisa para reconfirmar', () => {
      useAppStore.setState({ editingRaceId: 'race-1' }); // EXISTING_RACE: estrada, 10 km, nível "medio"
      renderAgenda();
      fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));

      expect(comboboxes()[2].value).toBe('medio');
      expect(screen.queryByText(/Mudaste o tipo, a distância ou o D\+/i)).not.toBeInTheDocument();

      fireEvent.change(comboboxes()[1], { target: { value: '21.0975' } }); // 10k → meia

      // Não apaga uma resposta já gravada — só destaca para reconfirmação.
      expect(comboboxes()[2].value).toBe('medio');
      expect(screen.getByText(/Mudaste o tipo, a distância ou o D\+/i)).toBeInTheDocument();
    });

    it('a EDITAR: reconfirmar o nível (reescolher no select) remove o aviso', () => {
      useAppStore.setState({ editingRaceId: 'race-1' });
      renderAgenda();
      fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));

      fireEvent.change(comboboxes()[1], { target: { value: '21.0975' } });
      expect(screen.getByText(/Mudaste o tipo, a distância ou o D\+/i)).toBeInTheDocument();

      // O próprio atleta reconfirma o nível para a categoria atual (meia).
      fireEvent.change(comboboxes()[2], { target: { value: 'medio' } });

      expect(screen.queryByText(/Mudaste o tipo, a distância ou o D\+/i)).not.toBeInTheDocument();
    });
  });

  // Bug relatado 2026-08-29: uma prova recém-criada com pouco tempo real até
  // à corrida (o macrociclo recomendado não cabe) deixava de mostrar o
  // alerta "Tempo insuficiente" mal o cálculo antigo considerasse a
  // preparação teórica "em curso" — mesmo a prova acabada de nascer, sem um
  // único dia de treino. Ver src/utils/racePlanEngine.test.js para o mesmo
  // bug no motor do plano.
  describe('alerta de viabilidade não desaparece com macrociclo comprimido (bug 2026-08-29)', () => {
    it('prova nova a 17 dias de distância (10k): mostra "Tempo insuficiente" desde a criação, não só quando editada mais tarde', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
      try {
        // experience_level no perfil — sem nível conhecido, assessRaceViability
        // não avalia nada (early return), independentemente da correção.
        useAppStore.setState({ editingRaceId: null, profile: { id: 'user-1', experience_level: 'medio' } });
        renderAgenda();
        fireEvent.click(screen.getByRole('button', { name: /^Detalhes da prova$/i }));

        // Distância por omissão do rascunho novo já é '10' (10k) — só falta
        // a data, a 17 dias (bem menos que as semanas mínimas recomendadas).
        const dateInput = document.querySelector('input[type="date"]');
        fireEvent.change(dateInput, { target: { value: '2026-09-13' } });

        expect(screen.getByText(/Tempo insuficiente para a preparação/i)).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
