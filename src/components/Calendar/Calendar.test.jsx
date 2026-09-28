import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { format, addMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAppStore } from '../../store';
import { ToastProvider } from '../shared/ToastProvider';
import Calendar from './Calendar';

/* Auditoria a11y (passagem "harden"): eliminar uma prova passava por um
   window.confirm — popup do sistema, fora da linguagem da app, sem dizer o
   que se perde e sem os 44px de toque. Passou a usar o Dialog partilhado,
   como "Dispensar o aviso da Carol?" no Início. Este teste fixa as duas
   metades: o confirm do browser nunca é chamado, e nada é apagado enquanto
   o atleta não confirmar no popup da app. */

const mocks = vi.hoisted(() => ({ deleted: [] }));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      delete: () => ({
        eq: (_col, id) => { mocks.deleted.push(id); return Promise.resolve({ error: null }); },
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

const HOJE = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PROVA = {
  id: 'race-1',
  name: 'Meia de Lisboa',
  date: iso(HOJE),
  distance_km: 21.1,
  status: 'planeada',
  race_type: 'estrada',
};

const renderCalendario = () => render(<ToastProvider><Calendar /></ToastProvider>);

describe('Calendário — eliminar prova', () => {
  let confirmSpy;

  beforeEach(() => {
    mocks.deleted.length = 0;
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    useAppStore.setState({
      runs: [], gymSessions: [], meals: [], bodyAssessments: [],
      raceEvents: [PROVA],
      pendingCalendarDate: null,
    });
  });

  afterEach(() => confirmSpy.mockRestore());

  it('pede confirmação no popup da app, não no window.confirm', async () => {
    renderCalendario();
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da prova/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Eliminar/ }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Eliminar esta prova?')).toBeInTheDocument();
    expect(mocks.deleted).toEqual([]);
  });

  it('"Cancelar" fecha o popup e não apaga nada', async () => {
    renderCalendario();
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da prova/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Eliminar/ }));
    await screen.findByText('Eliminar esta prova?');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByText('Eliminar esta prova?')).not.toBeInTheDocument());
    expect(mocks.deleted).toEqual([]);
    expect(useAppStore.getState().raceEvents).toHaveLength(1);
  });

  it('só apaga depois de confirmar', async () => {
    renderCalendario();
    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da prova/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Eliminar/ }));
    const popup = await screen.findByRole('dialog');

    fireEvent.click(within(popup).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(mocks.deleted).toEqual(['race-1']));
    expect(useAppStore.getState().raceEvents).toHaveLength(0);
  });
});

/* A ordem do dia (pedido 2026-09-13): pela hora, entre tipos — o ginásio
   das 07:00 antes do almoço, a corrida das 18:30 depois. */
describe('Calendário — o dia por ordem cronológica', () => {
  it('intercala corridas, treinos e refeições pela hora', () => {
    useAppStore.setState({
      raceEvents: [],
      runs: [{ id: 'run-1', kind: 'treino', name: 'Corrida da tarde', date: iso(HOJE), start_time: '18:30:00', distance_km: 10, duration_seconds: 3000, details: {} }],
      gymSessions: [{ id: 'gym-1', name: 'Ginásio da manhã', date: iso(HOJE), start_time: '07:00:00', categories: ['Pernas'], exercises: [] }],
      meals: [{ id: 'meal-1', date: iso(HOJE), meal_type: 'almoco', name: 'Almoço', meal_items: [], total_calories: 600 }],
      bodyAssessments: [],
      pendingCalendarDate: null,
    });
    renderCalendario();

    const ginasio = screen.getByText('Ginásio da manhã');
    const almoco = screen.getByText('Almoço');
    const corrida = screen.getByText('Corrida da tarde');
    const antes = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(antes(ginasio, almoco)).toBe(true);
    expect(antes(almoco, corrida)).toBe(true);
  });
});

/* O filtro da agenda (pedido 2026-09-27): por tipo de registo e, nas
   provas, por estado — por realizar ou concluídas. A grelha e a lista do
   dia leem a mesma régua (utils/calendarFilter.js). */
describe('Calendário — filtro', () => {
  const HOJE_ISO = iso(HOJE);
  const PROVAS = [
    { id: 'race-a', name: 'Prova por fazer', date: HOJE_ISO, distance_km: 10, status: 'agendada', race_type: 'estrada' },
    { id: 'race-b', name: 'Prova feita', date: HOJE_ISO, distance_km: 5, status: 'concluida', race_type: 'estrada' },
  ];

  beforeEach(() => {
    useAppStore.setState({
      raceEvents: PROVAS,
      runs: [{ id: 'run-1', kind: 'treino', name: 'Corrida da tarde', date: HOJE_ISO, start_time: '18:30:00', distance_km: 10, duration_seconds: 3000, details: {} }],
      gymSessions: [{ id: 'gym-1', name: 'Ginásio da manhã', date: HOJE_ISO, start_time: '07:00:00', categories: ['Pernas'], exercises: [] }],
      meals: [{ id: 'meal-1', date: HOJE_ISO, meal_type: 'almoco', name: 'Almoço', meal_items: [], total_calories: 600 }],
      bodyAssessments: [],
      pendingCalendarDate: null,
      calendarView: null,
      activeTab: 'calendario',
      navGuard: null,
      session: { user: { id: 'u1' } },
    });
  });

  it('sem filtro, "Tudo" está escolhido e o dia mostra tudo', () => {
    renderCalendario();
    expect(screen.getByTestId('calendar-filter-todos')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Prova por fazer')).toBeInTheDocument();
    expect(screen.getByText('Corrida da tarde')).toBeInTheDocument();
    expect(screen.getByText('Almoço')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-filter-clear')).not.toBeInTheDocument();
  });

  it('"Corrida" deixa só as corridas; tocar outra vez volta a "Tudo"', () => {
    renderCalendario();
    fireEvent.click(screen.getByTestId('calendar-filter-corrida'));
    expect(screen.getByTestId('calendar-filter-corrida')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('calendar-filter-todos')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Corrida da tarde')).toBeInTheDocument();
    expect(screen.queryByText('Almoço')).not.toBeInTheDocument();
    expect(screen.queryByText('Ginásio da manhã')).not.toBeInTheDocument();
    expect(screen.queryByText('Prova por fazer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('calendar-filter-corrida'));
    expect(screen.getByTestId('calendar-filter-todos')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Almoço')).toBeInTheDocument();
  });

  /* Pedido 2026-09-27: na "Prova" só há "Por realizar" e "Concluídas" —
     abre em "Por realizar" — e a agenda lista todas as provas desse estado
     em vez das do dia escolhido. */
  it('"Prova" tem só "Por realizar" e "Concluídas", e abre em "Por realizar"', () => {
    renderCalendario();
    expect(screen.queryByTestId('calendar-filter-prova-concluida')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('calendar-filter-prova'));
    expect(screen.getByTestId('calendar-filter-prova-por_realizar')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('calendar-filter-prova-concluida')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('calendar-filter-prova-todas')).not.toBeInTheDocument();
    expect(screen.getByText('Prova por fazer')).toBeInTheDocument();
    expect(screen.queryByText('Prova feita')).not.toBeInTheDocument();
    expect(screen.queryByText('Corrida da tarde')).not.toBeInTheDocument();
    expect(screen.getByTestId('calendar-filter-clear')).toHaveTextContent('Provas por realizar');

    fireEvent.click(screen.getByTestId('calendar-filter-prova-concluida'));
    expect(screen.queryByText('Prova por fazer')).not.toBeInTheDocument();
    expect(screen.getByText('Prova feita')).toBeInTheDocument();

    // Sair da "Prova" esquece o estado: voltar a ela começa em "Por realizar".
    fireEvent.click(screen.getByTestId('calendar-filter-corrida'));
    fireEvent.click(screen.getByTestId('calendar-filter-prova'));
    expect(screen.getByTestId('calendar-filter-prova-por_realizar')).toHaveAttribute('aria-pressed', 'true');
  });

  it('lista todas as provas do estado, não só as do dia, 5 de cada vez', () => {
    // 7 por realizar em meses diferentes e 2 concluídas.
    const porFazer = Array.from({ length: 7 }, (_, i) => ({
      id: `pf-${i}`, name: `Prova futura ${i + 1}`, date: iso(addMonths(HOJE, i + 1)), distance_km: 10, status: 'agendada', race_type: 'estrada',
    }));
    const feitas = [
      { id: 'f-1', name: 'Feita antiga', date: iso(addMonths(HOJE, -6)), distance_km: 10, status: 'concluida', race_type: 'estrada' },
      { id: 'f-2', name: 'Feita recente', date: iso(addMonths(HOJE, -1)), distance_km: 10, status: 'concluida', race_type: 'estrada' },
    ];
    useAppStore.setState({ raceEvents: [...porFazer, ...feitas] });
    renderCalendario();
    fireEvent.click(screen.getByTestId('calendar-filter-prova'));

    expect(screen.getByTestId('calendar-list-title').textContent).toBe('7 provas por realizar');
    // Da mais próxima para a mais distante: as 5 primeiras.
    // Só o nome (o primeiro nó de texto): o resto do parágrafo são as pílulas.
    const nomes = () => screen.queryAllByText(/^Prova futura \d$/).map((n) => n.firstChild.textContent);
    expect(nomes()).toEqual(['Prova futura 1', 'Prova futura 2', 'Prova futura 3', 'Prova futura 4', 'Prova futura 5']);
    expect(screen.getByTestId('race-list-pager')).toHaveTextContent('Página 1 de 2');
    expect(screen.getByRole('button', { name: /Anteriores/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Seguintes/ }));
    expect(nomes()).toEqual(['Prova futura 6', 'Prova futura 7']);
    expect(screen.getByTestId('race-list-pager')).toHaveTextContent('Página 2 de 2');
    expect(screen.getByRole('button', { name: /Seguintes/ })).toBeDisabled();
    // O "Seguintes" desativou-se: o foco foi para o título da lista.
    expect(screen.getByTestId('calendar-list-title')).toHaveFocus();

    // Mudar de estado volta à primeira página; as concluídas, da mais recente.
    fireEvent.click(screen.getByTestId('calendar-filter-prova-concluida'));
    expect(screen.getByTestId('calendar-list-title').textContent).toBe('2 provas concluídas');
    expect(screen.queryAllByText(/^Feita /).map((n) => n.firstChild.textContent)).toEqual(['Feita recente', 'Feita antiga']);
    // Até 5 não há paginação.
    expect(screen.queryByTestId('race-list-pager')).not.toBeInTheDocument();
  });

  it('sem provas no estado, o vazio diz qual', () => {
    useAppStore.setState({ raceEvents: [PROVAS[0]] });
    renderCalendario();
    fireEvent.click(screen.getByTestId('calendar-filter-prova'));
    fireEvent.click(screen.getByTestId('calendar-filter-prova-concluida'));
    expect(screen.getByText('Ainda sem provas concluídas')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-list-title').textContent).toBe('0 provas concluídas');
  });

  it('o dia vazio diz porquê, e o nome do filtro ao lado do dia tira-o', () => {
    renderCalendario();
    fireEvent.click(screen.getByTestId('calendar-filter-corpo'));
    expect(screen.getByText('Sem avaliações neste dia')).toBeInTheDocument();

    const chip = screen.getByTestId('calendar-filter-clear');
    expect(chip).toHaveAccessibleName('Tirar o filtro: Corpo');
    fireEvent.click(chip);
    expect(screen.getByText('Almoço')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-filter-clear')).not.toBeInTheDocument();
  });

  it('a grelha só acende o dia de prova com o que o filtro deixa ver', () => {
    const outro = new Date(HOJE.getFullYear(), HOJE.getMonth(), HOJE.getDate() === 1 ? 2 : 1);
    useAppStore.setState({
      raceEvents: [{ id: 'race-c', name: 'Outra prova', date: iso(outro), distance_km: 10, status: 'agendada', race_type: 'estrada' }],
    });
    renderCalendario();
    const dia = () => screen.getByTestId(`calendar-day-${iso(outro)}`);

    expect(dia().className).toContain('--race-from');
    fireEvent.click(screen.getByTestId('calendar-filter-corrida'));
    expect(dia().className).not.toContain('--race-from');

    fireEvent.click(screen.getByTestId('calendar-filter-prova'));
    fireEvent.click(screen.getByTestId('calendar-filter-prova-concluida'));
    expect(dia().className).not.toContain('--race-from');
    fireEvent.click(screen.getByTestId('calendar-filter-prova-por_realizar'));
    expect(dia().className).toContain('--race-from');
  });

  it('voltar do hub repõe o mês, o dia e o filtro; mudar de separador esquece-os', () => {
    const proximoMes = addMonths(HOJE, 1);
    const dia15 = iso(new Date(proximoMes.getFullYear(), proximoMes.getMonth(), 15));

    const { unmount } = renderCalendario();
    fireEvent.click(screen.getByRole('button', { name: 'Mês seguinte' }));
    fireEvent.click(screen.getByTestId(`calendar-day-${dia15}`));
    fireEvent.click(screen.getByTestId('calendar-filter-corrida'));

    // O hub tapa o Calendário: o separador continua a ser o Calendário.
    unmount();
    expect(useAppStore.getState().calendarView).toEqual({
      month: iso(proximoMes),
      selected: dia15,
      filter: { type: 'corrida', raceStatus: 'todas' },
      racePage: 0,
    });

    renderCalendario();
    expect(screen.getByText(format(proximoMes, 'MMMM yyyy', { locale: pt }))).toBeInTheDocument();
    expect(screen.getByText(format(new Date(`${dia15}T00:00:00`), 'dd MMMM yyyy', { locale: pt }))).toBeInTheDocument();
    expect(screen.getByTestId('calendar-filter-corrida')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('calendar-filter-clear')).toHaveTextContent('Corridas');

    // Mudar de separador esquece o sítio: a visita seguinte começa em hoje.
    expect(useAppStore.getState().setActiveTab('home')).toBe(true);
    expect(useAppStore.getState().calendarView).toBeNull();
  });

  it('voltar do hub repõe também a página da lista de provas', () => {
    const porFazer = Array.from({ length: 7 }, (_, i) => ({
      id: `pf-${i}`, name: `Prova futura ${i + 1}`, date: iso(addMonths(HOJE, i + 1)), distance_km: 10, status: 'agendada', race_type: 'estrada',
    }));
    useAppStore.setState({ raceEvents: porFazer });
    const { unmount } = renderCalendario();
    fireEvent.click(screen.getByTestId('calendar-filter-prova'));
    fireEvent.click(screen.getByRole('button', { name: /Seguintes/ }));
    unmount();
    expect(useAppStore.getState().calendarView).toMatchObject({ filter: { type: 'prova', raceStatus: 'por_realizar' }, racePage: 1 });

    renderCalendario();
    expect(screen.getByTestId('race-list-pager')).toHaveTextContent('Página 2 de 2');
    expect(screen.getByText('Prova futura 6')).toBeInTheDocument();
  });

  it('a lista encolheu: a página guardada acompanha a que se vê', () => {
    const porFazer = Array.from({ length: 6 }, (_, i) => ({
      id: `pf-${i}`, name: `Prova futura ${i + 1}`, date: iso(addMonths(HOJE, i + 1)), distance_km: 10, status: 'agendada', race_type: 'estrada',
    }));
    useAppStore.setState({ raceEvents: porFazer });
    const { unmount } = renderCalendario();
    fireEvent.click(screen.getByTestId('calendar-filter-prova'));
    fireEvent.click(screen.getByRole('button', { name: /Seguintes/ }));
    // A única prova da página 2 sai (concluída noutro ecrã).
    act(() => { useAppStore.setState({ raceEvents: porFazer.slice(0, 5) }); });
    expect(screen.queryByTestId('race-list-pager')).not.toBeInTheDocument();
    expect(screen.getByText('Prova futura 1')).toBeInTheDocument();
    unmount();
    expect(useAppStore.getState().calendarView.racePage).toBe(0);
  });

  it('sem sessão (saiu-se da conta com o Calendário aberto), não guarda nada', () => {
    const { unmount } = renderCalendario();
    fireEvent.click(screen.getByTestId('calendar-filter-corrida'));
    useAppStore.setState({ session: null });
    unmount();
    expect(useAppStore.getState().calendarView).toBeNull();
  });

  it('desmontado por uma mudança de separador, não guarda nada', () => {
    const { unmount } = renderCalendario();
    fireEvent.click(screen.getByTestId('calendar-filter-corrida'));
    useAppStore.getState().setActiveTab('home');
    unmount();
    expect(useAppStore.getState().calendarView).toBeNull();
  });

  it('a data de um registo acabado de gravar manda, e tira o filtro para ele não ficar escondido', () => {
    useAppStore.setState({
      calendarView: { month: iso(addMonths(HOJE, 3)), selected: iso(addMonths(HOJE, 3)), filter: { type: 'nutricao' } },
      pendingCalendarDate: HOJE_ISO,
    });
    renderCalendario();
    expect(screen.getByTestId('calendar-filter-todos')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(format(HOJE, 'MMMM yyyy', { locale: pt }))).toBeInTheDocument();
    expect(screen.getByText('Prova por fazer')).toBeInTheDocument();
  });
});

/* Apagar a corrida que cumpriu um treino do plano solta-o na BD (trigger
   20260928205037): o store tem de trazer o plano de novo, senão o Início
   continuava a dizer "Feito." até recarregar. */
describe('Calendário — apagar uma corrida recarrega o plano e as provas', () => {
  beforeEach(() => {
    mocks.deleted.length = 0;
  });

  it('depois de apagar, pede o plano e as provas outra vez', async () => {
    const reloadAfterRunDeleted = vi.fn(() => Promise.resolve());
    const original = useAppStore.getState().reloadAfterRunDeleted;
    useAppStore.setState({
      runs: [{ id: 'run-1', date: iso(HOJE), name: 'Rodagem', kind: 'treino', training_type: 'continuo', distance_km: 5, duration_seconds: 1800 }],
      gymSessions: [], meals: [], bodyAssessments: [], raceEvents: [], pendingCalendarDate: null,
      reloadAfterRunDeleted,
    });
    try {
      renderCalendario();
      fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da corrida/ }));
      fireEvent.click(await screen.findByRole('button', { name: /^Eliminar$/ }));
      const popup = await screen.findByRole('dialog');
      fireEvent.click(within(popup).getByRole('button', { name: /Eliminar/ }));
      await waitFor(() => expect(mocks.deleted).toEqual(['run-1']));
      await waitFor(() => expect(reloadAfterRunDeleted).toHaveBeenCalledTimes(1));
    } finally {
      useAppStore.setState({ reloadAfterRunDeleted: original });
    }
  });
});
