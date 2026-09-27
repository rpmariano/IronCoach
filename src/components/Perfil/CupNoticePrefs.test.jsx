import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Os avisos do Troféu no Perfil › Carol (specs/trofeu.md §8, Fase 5). A
   vista vem do store pelo mesmo hook do Início (useCupForHome), sobre as
   fixtures da 34.ª. O Supabase rebenta se for chamado: sem inscrição, zero
   leituras; com ela, a vista monta-se do que já está em memória, e a gravação
   é a ação do store (updateEnrollment), aqui imitada. */
vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(() => { throw new Error('sem rede nos testes'); }), rpc: vi.fn(() => { throw new Error('sem rede nos testes'); }) },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));
vi.mock('../../lib/utils', async (importOriginal) => ({ ...(await importOriginal()), lisbonTodayISO: () => '2027-01-11' }));

const { supabase } = await import('../../lib/supabase');
const { useAppStore } = await import('../../store');
const { CUP_EMPTY, __resetCupModuleState } = await import('../../store/cupSlice');
const { ToastProvider } = await import('../shared/ToastProvider');
const { default: CupNoticePrefs, CUP_NOTICE_SAVE_ERROR } = await import('./CupNoticePrefs');
const F = await import('@formulas/cup.fixtures.ts');

const USER = 'u-avisos';
const PROFILE = { id: USER, gender: 'M', birth_date: '1982-01-24' };
const REAL_UPDATE = useAppStore.getState().updateEnrollment;
const ENR = {
  id: 'enr-1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', bib: '4321', season_goal: 'participar',
  status: 'ativa', entry_by: 'atleta',
  notify_calendar: false, notify_date_changes: false, notify_entry_deadline: false, notify_results: false,
};
const PROVAVEIS = F.CASCAIS_ROUNDS.map((r) => ({ ...r, date_status: r.date_status === 'confirmada' ? 'provavel' : r.date_status }));

function enrolledCup({ enrollment = {}, edition = {}, rounds = F.CASCAIS_ROUNDS } = {}) {
  return {
    ...CUP_EMPTY,
    status: 'ready',
    userId: USER,
    editions: [{ ...F.CASCAIS_34_ABERTA, ...edition, competition: F.CASCAIS_COMPETITION }],
    enrollments: [{ ...ENR, ...enrollment }],
    participations: [],
    catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
  };
}

const montar = (props = {}) => render(<ToastProvider><CupNoticePrefs pushEnabled {...props} /></ToastProvider>);
const interruptor = (name) => screen.getByRole('switch', { name });

let updateEnrollment;
beforeEach(() => {
  __resetCupModuleState();
  window.localStorage.clear();
  supabase.from.mockClear();
  supabase.rpc.mockClear();
  // A ação do store: grava e põe a linha nova na inscrição (como a RPC).
  updateEnrollment = vi.fn(async (id, patch) => {
    const cup = useAppStore.getState().cup;
    const row = { ...cup.enrollments.find((e) => e.id === id), ...patch };
    useAppStore.setState({ cup: { ...cup, enrollments: cup.enrollments.map((e) => (e.id === id ? row : e)) } });
    return { ok: true, data: row };
  });
  useAppStore.setState({ session: { user: { id: USER } }, profile: PROFILE, raceEvents: [], runs: [], cup: enrolledCup(), updateEnrollment });
});
afterEach(() => {
  useAppStore.setState({ updateEnrollment: REAL_UPDATE, cup: CUP_EMPTY, session: null, profile: null });
});

describe('CupNoticePrefs — sem inscrição, nada', () => {
  it('sem competição lida e sem indício: não desenha nada e não lê nada', () => {
    useAppStore.setState({ cup: CUP_EMPTY });
    montar();
    expect(screen.queryByTestId('perfil-cup-avisos')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('com o convite (edição aberta, sem inscrição), quem saiu, ou uma inscrição concluída: nada', () => {
    for (const cup of [
      { ...enrolledCup(), enrollments: [] },
      enrolledCup({ enrollment: { status: 'saiu' } }),
      enrolledCup({ enrollment: { status: 'concluida' } }),
    ]) {
      useAppStore.setState({ cup });
      const { unmount } = montar();
      expect(screen.queryByTestId('perfil-cup-avisos')).not.toBeInTheDocument();
      unmount();
    }
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('CupNoticePrefs — inscrito', () => {
  it('título, texto e três interruptores com o calendário já saído — todos desligados por omissão', () => {
    montar();
    const bloco = screen.getByTestId('perfil-cup-avisos');
    expect(bloco).toHaveAttribute('role', 'group');
    expect(bloco).toHaveAccessibleName('Avisos · Troféu de Cascais');
    expect(bloco).toHaveTextContent('nunca mais de 3 avisos por jornada, contando a manhã e o balanço da prova');
    expect(bloco).toHaveTextContent('a véspera de uma jornada fica no chat e no cartão do dia, sem notificação');
    const switches = within(bloco).getAllByRole('switch');
    expect(switches.map((s) => s.getAttribute('aria-labelledby') && document.getElementById(s.getAttribute('aria-labelledby')).textContent))
      .toEqual(['Mudanças de data', 'Prazo de inscrição', 'Classificação']);
    for (const s of switches) expect(s).not.toBeChecked();
    expect(interruptor('Mudanças de data')).toHaveAccessibleDescription('Das jornadas em que disseste Vou.');
    expect(interruptor('Prazo de inscrição')).toHaveAccessibleDescription('48 h antes de fechar, se ainda não te inscreveste.');
    expect(interruptor('Classificação')).toHaveAccessibleDescription('Das jornadas que correste, quando sair. O lugar e os pontos ficam para o chat.');
    // Alvo ≥ 44 px: a linha inteira é o rótulo.
    expect(screen.getByTestId('perfil-cup-aviso-notify_results')).toHaveStyle({ minHeight: '44px' });
    // Nada privado: nem dorsal nem clube.
    expect(bloco).not.toHaveTextContent('4321');
    expect(bloco).not.toHaveTextContent('NAZA');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('antes de sair o calendário (nenhuma jornada confirmada): também "Quando sair o calendário"', () => {
    useAppStore.setState({ cup: enrolledCup({ rounds: PROVAVEIS, enrollment: { notify_calendar: true } }) });
    montar();
    const cal = interruptor('Quando sair o calendário');
    expect(cal).toBeChecked();
    expect(cal).toHaveAccessibleDescription('Uma notificação, quando as jornadas forem confirmadas.');
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    // Sem jornadas nenhumas, o mesmo.
    act(() => { useAppStore.setState({ cup: enrolledCup({ rounds: [] }) }); });
    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });

  it('calendário já saído mas o aviso ainda ligado (o "Avisa-me quando sair" da inscrição): aparece, para se poder desligar', async () => {
    useAppStore.setState({ cup: enrolledCup({ enrollment: { notify_calendar: true } }) });
    montar();
    const bloco = screen.getByTestId('perfil-cup-avisos');
    // O texto diz que só os avisos de jornada mudam a véspera — o calendário não.
    expect(bloco).toHaveTextContent('Com um aviso de jornada ligado (mudanças de data, prazo ou classificação), a véspera de uma jornada fica no chat');
    const cal = interruptor('Quando sair o calendário');
    expect(cal).toBeChecked();
    expect(cal).toHaveAccessibleDescription('O calendário já saiu: é só essa notificação, se ainda não te chegou.');
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    fireEvent.click(cal);
    expect(updateEnrollment).toHaveBeenCalledWith('enr-1', { notify_calendar: false });
    // Desligado depois de sair, já não há nada a ligar: desaparece.
    await waitFor(() => expect(screen.queryByRole('switch', { name: 'Quando sair o calendário' })).not.toBeInTheDocument());
    expect(screen.getAllByRole('switch')).toHaveLength(3);
    expect(useAppStore.getState().cup.enrollments[0].notify_calendar).toBe(false);
  });

  it('o valor é o da inscrição', () => {
    useAppStore.setState({ cup: enrolledCup({ enrollment: { notify_date_changes: true, notify_results: true } }) });
    montar();
    expect(interruptor('Mudanças de data')).toBeChecked();
    expect(interruptor('Prazo de inscrição')).not.toBeChecked();
    expect(interruptor('Classificação')).toBeChecked();
  });

  it('tocar grava logo (update_enrollment, só esse campo); a gravar, mostra o pedido e pára os outros', async () => {
    let solta;
    updateEnrollment.mockImplementationOnce((id, patch) => new Promise((resolve) => {
      solta = () => {
        const cup = useAppStore.getState().cup;
        const row = { ...cup.enrollments[0], ...patch };
        useAppStore.setState({ cup: { ...cup, enrollments: [row] } });
        resolve({ ok: true, data: row });
      };
    }));
    montar();
    fireEvent.click(interruptor('Classificação'));
    expect(updateEnrollment).toHaveBeenCalledWith('enr-1', { notify_results: true });
    expect(interruptor('Classificação')).toBeChecked();
    expect(interruptor('Classificação')).toHaveAttribute('aria-busy', 'true');
    for (const s of screen.getAllByRole('switch')) expect(s).toBeDisabled();
    await act(async () => { solta(); });
    await waitFor(() => expect(interruptor('Classificação')).toBeEnabled());
    expect(interruptor('Classificação')).toBeChecked();
    expect(interruptor('Classificação')).not.toHaveAttribute('aria-busy');
    expect(useAppStore.getState().cup.enrollments[0].notify_results).toBe(true);
    expect(updateEnrollment).toHaveBeenCalledTimes(1);
  });

  it('desligar também grava só esse campo', async () => {
    useAppStore.setState({ cup: enrolledCup({ enrollment: { notify_date_changes: true } }) });
    montar();
    fireEvent.click(interruptor('Mudanças de data'));
    await waitFor(() => expect(updateEnrollment).toHaveBeenCalledWith('enr-1', { notify_date_changes: false }));
    await waitFor(() => expect(interruptor('Mudanças de data')).not.toBeChecked());
  });

  it('erro: o aviso e o interruptor volta ao que estava (o store não mudou)', async () => {
    updateEnrollment.mockResolvedValueOnce({ ok: false, error: { code: 'P0001', message: 'Inscrição não encontrada' }, unavailable: false });
    montar();
    fireEvent.click(interruptor('Prazo de inscrição'));
    expect(await screen.findByText(CUP_NOTICE_SAVE_ERROR)).toBeInTheDocument();
    await waitFor(() => expect(interruptor('Prazo de inscrição')).not.toBeChecked());
    expect(interruptor('Prazo de inscrição')).toBeEnabled();
    expect(useAppStore.getState().cup.enrollments[0].notify_entry_deadline).toBe(false);
  });

  it('as notas: Notificações da Carol desligadas, e a edição que ainda não envia', () => {
    const { unmount } = montar({ pushEnabled: false });
    expect(screen.getByTestId('perfil-cup-avisos-sem-push')).toHaveTextContent('As Notificações da Carol estão desligadas: estes avisos só chegam com elas ligadas.');
    expect(screen.getByTestId('perfil-cup-avisos-sem-push')).toHaveAttribute('role', 'note');
    // A 34.ª ainda com notifications_enabled=false (a omissão).
    expect(screen.getByTestId('perfil-cup-avisos-edicao-desligada')).toHaveTextContent('A app ainda não está a enviar os avisos desta edição. O que escolheres fica guardado.');
    // Com as notas, os interruptores continuam a gravar.
    expect(interruptor('Mudanças de data')).toBeEnabled();
    unmount();

    useAppStore.setState({ cup: enrolledCup({ edition: { notifications_enabled: true } }) });
    montar({ pushEnabled: true });
    expect(screen.queryByTestId('perfil-cup-avisos-sem-push')).not.toBeInTheDocument();
    expect(screen.queryByTestId('perfil-cup-avisos-edicao-desligada')).not.toBeInTheDocument();
  });

  it('inscrito pelo clube: o prazo fica parado, desligado, com a razão', () => {
    useAppStore.setState({ cup: enrolledCup({ enrollment: { entry_by: 'clube', notify_entry_deadline: true } }) });
    montar();
    const prazo = interruptor('Prazo de inscrição');
    expect(prazo).toBeDisabled();
    expect(prazo).not.toBeChecked();
    expect(prazo).toHaveAccessibleDescription('Quem te inscreve é o clube: não há prazo a lembrar-te.');
    fireEvent.click(prazo);
    expect(updateEnrollment).not.toHaveBeenCalled();
  });

  it('inscrição por época: sem prazo; sem fonte de resultados: sem classificação', () => {
    useAppStore.setState({ cup: enrolledCup({ edition: { entry_mode: 'epoca', results_source: 'nenhuma' } }) });
    montar();
    expect(screen.queryByRole('switch', { name: 'Prazo de inscrição' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Classificação' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });
});
