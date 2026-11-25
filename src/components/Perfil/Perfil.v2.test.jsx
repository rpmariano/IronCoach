import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../../store';
import { setDesignV2 } from '../../utils/designV2';
import Perfil from './Perfil';

/* O Perfil no Design v2: secções planas (um painel, sem cartão dentro de cartão), títulos em
   texto simples, nada de rótulos maiúsculos escritos no código, e o «Guardar alterações» neutro
   (o âmbar é só da prova). Com o v2 desligado, a marcação de sempre. */

const mocks = vi.hoisted(() => ({ updates: [] }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload) => {
        mocks.updates.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
      select: () => ({
        eq: () => ({
          order: () => Object.assign(Promise.resolve({ data: [], error: null }), {
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
    auth: { signOut: () => Promise.resolve({ error: null }) },
  },
}));
vi.mock('../../lib/push', () => ({
  ensurePushSubscription: () => Promise.resolve({ ok: true, error: null }),
  forgetPushSubscriptionOnThisDevice: () => Promise.resolve(),
}));

const badge = (over) => ({
  key: 'x', name: 'X', rule: 'A regra.', familia: 'desempenho', cor: 'run', glifo: 'heart',
  state: 'empty', tier: null, ring: 0, centro: '0', centroAria: 'X', linha: null,
  count: 0, niveis: null, sessoes: [], indeterminadas: null, ...over,
});
vi.mock('../../utils/useBadges', () => ({
  default: () => ({
    badges: [
      badge({ key: 'z2', name: 'Mestre da Z2', state: 'won', ring: 1, centro: '94', count: 1, linha: '1 vez' }),
      badge({ key: 'esc', name: 'A Escalada', state: 'progress', ring: 0.5, linha: 'faltam 5 000 m para bronze' }),
    ],
    pending: [],
    marcarVistos: () => {},
  }),
}));

const PROFILE = {
  id: 'user-1', display_name: 'Atleta', gender: 'M', height_cm: 180, weight_kg: 81,
  calorie_goal: 2100, protein_goal: 155, protein_goal_set_by_coach: true, carbs_goal: 205, fat_goal: 71,
  water_goal_ml: 2500,
};

const NOTES = [
  { id: 'n1', category: 'limitacao_fisica', note: 'Tenho epicondilite.', source: 'coach' },
  { id: 'n2', category: 'preferencia_alimentar', note: 'Não como marisco.', source: 'athlete' },
];

beforeEach(() => {
  window.localStorage.clear();
  mocks.updates.length = 0;
  useAppStore.setState({
    profile: PROFILE,
    session: { user: { id: 'user-1', email: 'atleta@ironhealth.app' } },
    navGuard: null,
    activeTab: 'perfil',
    shoes: [], raceEvents: [], runs: [], coachPlans: [], coachPlanItems: [],
    coachNotes: NOTES,
  });
});
afterEach(() => { act(() => setDesignV2(false)); });

const ligarV2 = () => act(() => setDesignV2(true));
// O Armário (src/components/Armario) tem o seu próprio dono: fica fora destas verificações.
const paginasDoPerfil = (container) => [...container.querySelectorAll('.tab-swipe-page')]
  .filter((p) => p.querySelector('h2')?.textContent !== 'Armário');
const algumaTem = (container, sel) => paginasDoPerfil(container).some((p) => p.querySelector(sel));

describe('Perfil — Design v2', () => {
  it('as secções são painéis planos com o título em texto simples; nenhum cartão antigo fica', () => {
    ligarV2();
    const { container } = render(<Perfil />);
    expect(algumaTem(container, '.module-card-contrast')).toBe(false);
    const titulos = [...container.querySelectorAll('h3.v2-perfil-h')].map((h) => h.textContent);
    expect(titulos).toEqual(expect.arrayContaining([
      'Pessoal', 'As tuas metas', 'Objetivos corporais', 'Nutrição e água', 'Notificações',
      'Restrições alimentares', 'Memória da Carol', 'Badges de treino',
    ]));
    // Nenhuma secção dentro de outra.
    expect(container.querySelector('.v2-perfil-sec .v2-perfil-sec')).toBeNull();
  });

  it('nada de maiúsculas espaçadas nem gradientes escritos no código', () => {
    ligarV2();
    const { container } = render(<Perfil />);
    expect(paginasDoPerfil(container).length).toBe(4);
    expect(algumaTem(container, '.uppercase')).toBe(false);
    expect(algumaTem(container, '[class*="tracking-"]')).toBe(false);
    // Os números dos anéis (BadgeRing, partilhado) apertam-se com tracking negativo: não é um rótulo.
    const espacadas = paginasDoPerfil(container)
      .flatMap((p) => [...p.querySelectorAll('[style*="letter-spacing"]')])
      .filter((e) => !String(e.style.letterSpacing).startsWith('-'));
    expect(espacadas.map((e) => e.outerHTML.slice(0, 160))).toEqual([]);
    expect(algumaTem(container, '[style*="gradient"]')).toBe(false);
    expect(algumaTem(container, '[style*="box-shadow"]')).toBe(false);
  });

  it('a meta da Carol leva o nome dela em texto, sem pílula', () => {
    ligarV2();
    render(<Perfil />);
    const tag = screen.getByTitle('Meta definida pela Carol');
    expect(tag).toHaveClass('v2-perfil-carol-tag');
    expect(tag).toHaveTextContent('Carol');
  });

  it('o «Guardar alterações» é neutro (a tinta, com o texto escuro), não âmbar', () => {
    ligarV2();
    render(<Perfil />);
    const guardar = screen.getByRole('button', { name: /Guardar alterações/ });
    expect(guardar.getAttribute('style')).toContain('var(--v2-ink)');
    expect(guardar.getAttribute('style')).toContain('var(--coach-ink)');
    expect(guardar.getAttribute('style')).not.toContain('mod-prova');
  });

  it('o «Guardar alterações» desativado: na v1 como era; no v2 o motivo só para o leitor de ecrã', () => {
    const v1 = render(<Perfil />);
    let guardar = screen.getByRole('button', { name: /Guardar alterações/ });
    expect(guardar).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByTestId('perfil-save-hint')).toBeNull();
    expect(guardar.parentElement).toBe(screen.getByTestId('action-bar'));
    v1.unmount();

    ligarV2();
    render(<Perfil />);
    guardar = screen.getByRole('button', { name: /Guardar alterações/ });
    expect(guardar).toBeDisabled();
    const hint = screen.getByTestId('perfil-save-hint');
    expect(hint).toHaveTextContent('Sem alterações para guardar');
    expect(hint).toHaveClass('sr-only');
    expect(guardar).toHaveAttribute('aria-describedby', 'perfil-save-hint');
  });

  it('as entradas da Vitrina e da Carol são linhas planas; o tutorial sem caixa à volta do ícone', () => {
    ligarV2();
    render(<Perfil />);
    expect(screen.getByTestId('perfil-privacidade-tabelas')).toHaveClass('v2-perfil-row');
    expect(screen.getByTestId('perfil-privacidade-tabelas')).not.toHaveAttribute('style');
    const arranque = screen.getByRole('button', { name: /Rever o arranque com a Carol/ });
    expect(arranque).toHaveClass('v2-perfil-row');
    const tutorial = screen.getByRole('button', { name: /Ver tutorial da app/ });
    expect(tutorial).toHaveClass('v2-perfil-row');
    expect(tutorial.querySelector('div')).toBeNull();
  });

  it('as linhas dos badges e as notas da memória não são caixas dentro do painel', () => {
    ligarV2();
    render(<Perfil />);
    const card = screen.getByTestId('badges-card');
    expect(within(card).getByTestId('badges-progresso')).toHaveClass('v2-perfil-line');
    expect(within(card).getByTestId('badges-por-ganhar')).toHaveClass('v2-perfil-line');
    expect(within(card).getByText('1 de 2')).toHaveClass('v2-perfil-count');

    const nota = screen.getByText('Tenho epicondilite.').closest('.v2-perfil-item');
    expect(nota).toHaveClass('is-carol');
    expect(nota).not.toHaveAttribute('style');
  });

  it('o lembrete de água ligado usa o ciano, não o âmbar', () => {
    ligarV2();
    useAppStore.setState({ profile: { ...PROFILE, water_reminder_enabled: true } });
    render(<Perfil />);
    const toggle = screen.getByRole('button', { name: 'Desativar lembretes de água' });
    expect(toggle.className).toContain('bg-[var(--coach)]');
    expect(toggle.className).not.toContain('mod-prova');
  });

  it('guardar continua a funcionar', async () => {
    ligarV2();
    render(<Perfil />);
    fireEvent.click(screen.getByRole('button', { name: /Metas/ }));
    fireEvent.change(screen.getByDisplayValue('2100'), { target: { value: '2222' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Guardar alterações/ }));
    });
    expect(mocks.updates).toEqual([{ calorie_goal: 2222 }]);
  });
});

describe('Perfil — Design v2 desligado', () => {
  it('mantém a marcação de sempre: cartões, pílula da Carol e o Guardar âmbar', () => {
    const { container } = render(<Perfil />);
    expect(container.querySelector('.v2-perfil-sec')).toBeNull();
    expect(container.querySelectorAll('.module-card-contrast').length).toBeGreaterThan(3);
    expect(screen.getByTitle('Meta definida pela Carol')).toHaveClass('uppercase');
    expect(screen.getByRole('button', { name: /Guardar alterações/ }).getAttribute('style')).toContain('var(--mod-prova)');
    expect(screen.getByTestId('perfil-privacidade-tabelas')).toHaveAttribute('style');
  });
});
