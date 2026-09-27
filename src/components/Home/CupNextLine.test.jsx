import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/* A linha e o cartão "Troféu · próxima jornada" (specs/trofeu.md §4.3).
   Revisão da Fase 3, aviso [e] (2026-09-27): o aria-label do botão tapava a
   mudança de data — "mudou de 17 para 24 jan" tem de chegar ao leitor de
   ecrã, pela descrição do botão. (O RaceCard.test.jsx é do Home/RaceCard.jsx,
   que não muda.) */

vi.mock('../../lib/supabase', () => ({
  supabase: { from: vi.fn(() => { throw new Error('sem rede nos testes'); }), rpc: vi.fn() },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { default: CupNextLine, CupNextCard } = await import('./CupNextLine');
const { buildCupView } = await import('../../utils/useCup');
const F = await import('@formulas/cup.fixtures.ts');

const USER = 'u-linha';
const PROFILE = { id: USER, gender: 'M', birth_date: '1982-01-24' };
const ENR = { id: 'enr1', user_id: USER, edition_id: F.CASCAIS_34.id, team_id: 't-naza', season_goal: 'participar', status: 'ativa' };

function view({ previous = '2027-01-17' } = {}) {
  const rounds = F.CASCAIS_ROUNDS.map((r) => (r.id === 'r-c3' ? { ...r, previous_date: previous } : r));
  return buildCupView({
    cup: {
      status: 'ready', userId: USER, dismissals: [],
      editions: [{ ...F.CASCAIS_34_ABERTA, competition: F.CASCAIS_COMPETITION }],
      enrollments: [ENR],
      participations: [{ id: 'p3', enrollment_id: 'enr1', round_id: 'r-c3', decision: 'vou' }],
      catalog: { [F.CASCAIS_34.id]: { status: 'ready', rounds, courses: F.CASCAIS_COURSES, overrides: F.CASCAIS_OVERRIDES, categories: F.CASCAIS_CATEGORIES, teams: F.CASCAIS_TEAMS } },
      results: { status: 'idle', enrollmentId: null, rows: [], teamRows: [] },
    },
    profile: PROFILE, raceEvents: [], runs: [], today: '2027-01-11',
  });
}

describe('CupNextLine — a mudança de data chega ao leitor de ecrã', () => {
  it('a linha: a mudança vai na descrição do botão (não se vê, mas lê-se)', () => {
    const v = view();
    const r3 = v.rounds.find((r) => r.id === 'r-c3');
    render(<CupNextLine view={v} round={r3} onOpen={() => {}} />);
    const btn = screen.getByTestId('race-card-cup-line');
    expect(btn).toHaveAccessibleName(/próxima jornada/);
    expect(btn).toHaveAccessibleDescription('mudou de 17 para 24 jan');
    const desc = document.getElementById(btn.getAttribute('aria-describedby'));
    expect(desc.className).toContain('sr-only');
  });

  it('o cartão: a mudança que se vê é a descrição do botão', () => {
    const v = view();
    const r3 = v.rounds.find((r) => r.id === 'r-c3');
    render(<CupNextCard view={v} round={r3} onOpen={() => {}} />);
    const btn = screen.getByTestId('race-card-cup-body');
    expect(btn).toHaveAccessibleDescription('mudou de 17 para 24 jan');
    expect(btn).toHaveTextContent('mudou de 17 para 24 jan');
  });

  it('sem mudança de data: sem descrição', () => {
    const v = view({ previous: null });
    const r3 = v.rounds.find((r) => r.id === 'r-c3');
    const { unmount } = render(<CupNextLine view={v} round={r3} onOpen={() => {}} />);
    expect(screen.getByTestId('race-card-cup-line').hasAttribute('aria-describedby')).toBe(false);
    unmount();
    render(<CupNextCard view={v} round={r3} onOpen={() => {}} />);
    expect(screen.getByTestId('race-card-cup-body').hasAttribute('aria-describedby')).toBe(false);
  });
});
