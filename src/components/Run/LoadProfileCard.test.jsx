import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TODAY, PATTY_RUNS, PATTY_PLAN_ITEMS, PATTY_PLANS, TRAIL, MEIA } from '../../test/pattyLoad';

/* Perfil de carga por prova (2026-11-09): o conflito carga × volume num só cartão (Início e Hub
   da prova), a escolha gravada com o update direto da secção 3, o perfil escolhido com «mudar»,
   e a nota da volta sozinha a Prudente. */

const updates = [];
let failUpdate = false;
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const q = { table, data: null, filters: [] };
      const run = () => {
        updates.push({ table, data: q.data, filters: q.filters });
        if (failUpdate) return { data: null, error: { message: 'column "load_profile" does not exist', code: '42703' } };
        return { data: { ...MEIA, ...q.data }, error: null };
      };
      const chain = {
        update: (data) => { q.data = data; return chain; },
        eq: (c, v) => { q.filters.push([c, v]); return chain; },
        select: () => chain,
        maybeSingle: () => Promise.resolve(run()),
      };
      return chain;
    },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore } = await import('../../store');
const { default: LoadProfileCard } = await import('./LoadProfileCard');

function seed(races) {
  useAppStore.setState({
    session: { user: { id: 'u1' } },
    profile: { id: 'u1' },
    raceEvents: races,
    runs: PATTY_RUNS,
    coachPlans: PATTY_PLANS,
    coachPlanItems: PATTY_PLAN_ITEMS,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  updates.length = 0;
  failUpdate = false;
});
afterEach(() => vi.useRealTimers());

/* Revisão do #123: no Início o cartão deu lugar ao aviso da Carol (utils/loadTopic.js); o
   LoadProfileCard fica só no hub da prova — a linha «Perfil de carga · mudar» e, em conflito, as
   duas opções com o que é e o «Porquê?». */
describe('LoadProfileCard — hub da prova, em conflito', () => {
  it('«Porquê?» abre a explicação dos dois perfis, sem jargão', () => {
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard raceId="meia" />);
    expect(screen.queryByTestId('load-profile-why')).toBeNull();
    fireEvent.click(screen.getByTestId('load-profile-why-toggle'));
    const why = screen.getByTestId('load-profile-why');
    expect(why).toHaveTextContent('Prudente: a semana fica perto do teu habitual.');
    expect(why).toHaveTextContent('Mais volume: deixa subir mais depressa');
    expect(why).not.toHaveTextContent(/ACWR/);
    expect(screen.getByTestId('load-profile-why-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('conflito (a Patty): o que é, e as duas opções em linguagem simples', () => {
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard raceId="meia" />);
    expect(screen.getByTestId('load-profile-conflict')).toBeInTheDocument();
    const what = screen.getByTestId('load-profile-what');
    expect(what).toHaveTextContent('Carga: comparo os teus últimos 7 dias (23,1 km) com o teu habitual (~18 km). Subiu depressa — esta semana, mais leve.');
    expect(what).toHaveTextContent('Volume: para a Meia dos Descobrimentos, o ideal são ~35 km/semana; corres 19.');
    expect(screen.getByTestId('load-profile-conflict')).not.toHaveTextContent(/ACWR|RPE/);
    expect(screen.getByTestId('load-profile-choose-prudente')).toHaveTextContent('A semana fica até 28,4 km; a prova é para completar.');
    expect(screen.getByTestId('load-profile-choose-mais_volume')).toHaveTextContent('Até 30,8 km, mais perto do que a prova pede, com mais risco. Volta sozinho a Prudente se aparecer uma dor, se duas corridas fáceis seguidas te custarem muito, ou se andares a recuperar mal.');
  });

  it('escolher Mais volume grava o update da secção 3 e o hub passa à linha do perfil', async () => {
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard raceId="meia" />);
    fireEvent.click(screen.getByTestId('load-profile-choose-mais_volume'));
    await waitFor(() => expect(screen.getByTestId('load-profile-hub-line')).toHaveTextContent('Perfil de carga: Mais volume · mudar'));
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe('race_events');
    expect(updates[0].data).toEqual({ load_profile: 'mais_volume', load_profile_at: expect.any(String), load_profile_reverted_at: null, load_profile_revert_reason: null });
    expect(updates[0].filters).toEqual([['id', 'meia'], ['user_id', 'u1']]);
    expect(useAppStore.getState().raceEvents.find((r) => r.id === 'meia').load_profile).toBe('mais_volume');
    expect(screen.queryByTestId('load-profile-options')).toBeNull();
  });

  it('sem a migration a gravação falha: diz que não gravou e o conflito fica', async () => {
    failUpdate = true;
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard raceId="meia" />);
    fireEvent.click(screen.getByTestId('load-profile-choose-prudente'));
    await waitFor(() => expect(screen.getByTestId('load-profile-error')).toBeInTheDocument());
    expect(screen.getByTestId('load-profile-conflict')).toBeInTheDocument();
    expect(useAppStore.getState().raceEvents.find((r) => r.id === 'meia').load_profile).toBeUndefined();
  });

  it('plano que não chega à prova (por planear): sem conflito, só a linha', () => {
    seed([TRAIL, MEIA]);
    useAppStore.setState({
      coachPlans: [{ id: 'p2', status: 'aceite', period_end: '2026-11-15' }],
      coachPlanItems: PATTY_PLAN_ITEMS.filter((i) => i.planned_date <= '2026-11-15'),
    });
    render(<LoadProfileCard raceId="meia" />);
    expect(screen.queryByTestId('load-profile-conflict')).toBeNull();
    expect(screen.getByTestId('load-profile-hub-line')).toBeInTheDocument();
  });

  it('perfil escolhido: «mudar» abre as duas opções, com a escolhida marcada', () => {
    seed([TRAIL, { ...MEIA, load_profile: 'prudente', load_profile_at: '2026-11-09T09:00:00Z' }]);
    render(<LoadProfileCard raceId="meia" />);
    expect(screen.queryByTestId('load-profile-options')).toBeNull();
    fireEvent.click(screen.getByTestId('load-profile-change'));
    expect(screen.getByTestId('load-profile-choose-prudente')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('load-profile-choose-mais_volume')).toHaveAttribute('aria-pressed', 'false');
  });

  it('voltou sozinho a Prudente: a nota com a razão e «escolher de novo»', () => {
    seed([{ ...MEIA, load_profile: 'prudente', load_profile_at: '2026-11-05T09:00:00Z', load_profile_reverted_at: '2026-11-08T07:00:00Z', load_profile_revert_reason: 'rpe_alto' }]);
    render(<LoadProfileCard raceId="meia" />);
    expect(screen.getByTestId('load-profile-reverted')).toHaveTextContent('Voltou sozinho a Prudente em 8 nov');
    fireEvent.click(screen.getByTestId('load-profile-rechoose'));
    expect(screen.getByTestId('load-profile-options')).toBeInTheDocument();
  });

  it('sem a migration (provas sem load_profile): Prudente por escolher', () => {
    vi.setSystemTime(new Date('2026-11-13T12:00:00'));
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard raceId="meia" />);
    expect(screen.getByTestId('load-profile-hub-line')).toHaveTextContent('Perfil de carga: Prudente · mudar');
  });
});

describe('LoadProfileCard — Hub da prova', () => {
  it('a linha «Perfil de carga: Mais volume · mudar» na prova que manda; nas outras, nada', () => {
    seed([TRAIL, { ...MEIA, load_profile: 'mais_volume', load_profile_at: '2026-11-09T09:00:00Z' }]);
    const { unmount } = render(<LoadProfileCard raceId="meia" />);
    expect(screen.getByTestId('load-profile-hub-line')).toHaveTextContent('Perfil de carga: Mais volume · mudar');
    fireEvent.click(screen.getByTestId('load-profile-change'));
    expect(screen.getByTestId('load-profile-options')).toBeInTheDocument();
    unmount();
    const { container } = render(<LoadProfileCard raceId="trail" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('em conflito, o Hub mostra o cartão das duas opções', () => {
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard raceId="meia" />);
    expect(screen.getByTestId('load-profile-conflict')).toBeInTheDocument();
    expect(screen.queryByTestId('load-profile-hub-line')).toBeNull();
  });
});
