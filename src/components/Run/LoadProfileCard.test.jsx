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

describe('LoadProfileCard — Início', () => {
  it('conflito (a Patty): um só cartão, com os números e as duas opções', () => {
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard />);
    expect(screen.getByTestId('load-profile-conflict')).toBeInTheDocument();
    expect(screen.getByTestId('load-profile-numbers')).toHaveTextContent('Últimos 7 dias: 23,1 km (1,31× o habitual) · corres 19,1 km/semana; a prova pede 35.');
    expect(screen.getByTestId('load-profile-choose-prudente')).toHaveTextContent('A semana fica até 28,4 km; a prova é para completar.');
    expect(screen.getByTestId('load-profile-choose-mais_volume')).toHaveTextContent(/Até 30,8 km, mais perto do que a prova pede, com mais risco\. Volta sozinho a Prudente se aparecer dor, RPE 9\+ em duas corridas fáceis seguidas ou recuperação crítica\./);
  });

  it('escolher Mais volume grava o update da secção 3 e o cartão passa a «perfil»', async () => {
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard />);
    fireEvent.click(screen.getByTestId('load-profile-choose-mais_volume'));
    await waitFor(() => expect(screen.getByTestId('load-profile-card')).toBeInTheDocument());
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe('race_events');
    expect(updates[0].data).toEqual({ load_profile: 'mais_volume', load_profile_at: expect.any(String), load_profile_reverted_at: null, load_profile_revert_reason: null });
    expect(updates[0].filters).toEqual([['id', 'meia'], ['user_id', 'u1']]);
    expect(useAppStore.getState().raceEvents.find((r) => r.id === 'meia').load_profile).toBe('mais_volume');
    expect(screen.getByTestId('load-profile-limit')).toHaveTextContent('Mais volume · até 30,8 km nestes 7 dias (corridos: 23,1).');
    expect(screen.queryByTestId('load-profile-options')).toBeNull();
  });

  it('sem a migration a gravação falha: diz que não gravou e o conflito fica', async () => {
    failUpdate = true;
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard />);
    fireEvent.click(screen.getByTestId('load-profile-choose-prudente'));
    await waitFor(() => expect(screen.getByTestId('load-profile-error')).toBeInTheDocument());
    expect(screen.getByTestId('load-profile-conflict')).toBeInTheDocument();
    expect(useAppStore.getState().raceEvents.find((r) => r.id === 'meia').load_profile).toBeUndefined();
  });

  it('plano que não chega à prova (por planear): nenhum cartão de conflito', () => {
    seed([TRAIL, MEIA]);
    useAppStore.setState({
      coachPlans: [{ id: 'p2', status: 'aceite', period_end: '2026-11-15' }],
      coachPlanItems: PATTY_PLAN_ITEMS.filter((i) => i.planned_date <= '2026-11-15'),
    });
    const { container } = render(<LoadProfileCard />);
    expect(screen.queryByTestId('load-profile-conflict')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('perfil escolhido: o perfil e o limite; «mudar» abre as duas opções', () => {
    seed([TRAIL, { ...MEIA, load_profile: 'prudente', load_profile_at: '2026-11-09T09:00:00Z' }]);
    render(<LoadProfileCard />);
    expect(screen.getByTestId('load-profile-limit')).toHaveTextContent('Prudente · até 28,4 km nestes 7 dias (corridos: 23,1).');
    expect(screen.queryByTestId('load-profile-options')).toBeNull();
    fireEvent.click(screen.getByTestId('load-profile-change'));
    expect(screen.getByTestId('load-profile-choose-prudente')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('load-profile-choose-mais_volume')).toHaveAttribute('aria-pressed', 'false');
  });

  it('voltou sozinho a Prudente: a nota com a razão e «escolher de novo»', () => {
    seed([{ ...MEIA, load_profile: 'prudente', load_profile_at: '2026-11-05T09:00:00Z', load_profile_reverted_at: '2026-11-08T07:00:00Z', load_profile_revert_reason: 'rpe_alto' }]);
    render(<LoadProfileCard />);
    expect(screen.getByTestId('load-profile-reverted')).toHaveTextContent('Voltou sozinho a Prudente em 8 nov (RPE 9 ou mais em duas corridas fáceis seguidas), por segurança.');
    fireEvent.click(screen.getByTestId('load-profile-rechoose'));
    expect(screen.getByTestId('load-profile-options')).toBeInTheDocument();
  });

  it('sem conflito nem escolha (a 13 nov, só o volume): o Início não mostra nada', () => {
    vi.setSystemTime(new Date('2026-11-13T12:00:00'));
    seed([TRAIL, MEIA]);
    const { container } = render(<LoadProfileCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem a migration (provas sem load_profile): Prudente por escolher', () => {
    vi.setSystemTime(new Date('2026-11-13T12:00:00'));
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard variant="hub" raceId="meia" />);
    expect(screen.getByTestId('load-profile-hub-line')).toHaveTextContent('Perfil de carga: Prudente · mudar');
  });
});

describe('LoadProfileCard — Hub da prova', () => {
  it('a linha «Perfil de carga: Mais volume · mudar» na prova que manda; nas outras, nada', () => {
    seed([TRAIL, { ...MEIA, load_profile: 'mais_volume', load_profile_at: '2026-11-09T09:00:00Z' }]);
    const { unmount } = render(<LoadProfileCard variant="hub" raceId="meia" />);
    expect(screen.getByTestId('load-profile-hub-line')).toHaveTextContent('Perfil de carga: Mais volume · mudar');
    fireEvent.click(screen.getByTestId('load-profile-change'));
    expect(screen.getByTestId('load-profile-options')).toBeInTheDocument();
    unmount();
    const { container } = render(<LoadProfileCard variant="hub" raceId="trail" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('em conflito, o Hub mostra o cartão das duas opções', () => {
    seed([TRAIL, MEIA]);
    render(<LoadProfileCard variant="hub" raceId="meia" />);
    expect(screen.getByTestId('load-profile-conflict')).toBeInTheDocument();
    expect(screen.queryByTestId('load-profile-hub-line')).toBeNull();
  });
});
