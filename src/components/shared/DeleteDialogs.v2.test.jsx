import React from 'react';
import { render, screen, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Os diálogos de eliminar no Design v2 (P1 da crítica de design, 2026-11-25): o painel do v2 com um
   título simples, sem a faixa coral em gradiente; o botão destrutivo em vermelho liso legível; o
   texto de sempre. Desligado, o diálogo de sempre. */

vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) }) },
}));

const { default: ConfirmDeleteModal } = await import('./ConfirmDeleteModal');
const { default: RaceRemoveDialog } = await import('../Run/RaceRemoveDialog');
const { default: PremiumModal } = await import('./PremiumModal');
const { useAppStore } = await import('../../store');
const { setDesignV2 } = await import('../../utils/designV2');

const MSG = 'Tem a certeza que deseja eliminar esta corrida? Esta ação não pode ser desfeita.';

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, raceEvents: [], runs: [] });
});
afterEach(() => act(() => setDesignV2(false)));

describe('ConfirmDeleteModal — Design v2', () => {
  it('ligado: o painel do v2, o título simples, o texto de sempre e o botão vermelho liso', () => {
    act(() => setDesignV2(true));
    render(<ConfirmDeleteModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} message={MSG} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('v2-modal', 'is-dialog');
    expect(within(dialog).getByText('Confirmar eliminação')).toBeInTheDocument();
    expect(within(dialog).getByText(MSG)).toBeInTheDocument();
    // Sem a faixa em gradiente: o cabeçalho é o painel.
    const header = within(dialog).getByText('Confirmar eliminação').closest('[style]').parentElement.closest('[style]');
    expect(header.getAttribute('style')).not.toMatch(/gradient/);
    expect(within(dialog).getByRole('button', { name: 'Eliminar' })).toHaveClass('v2-btn-danger');
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).not.toHaveClass('v2-btn-danger');
  });

  it('desligado: o diálogo de sempre (a faixa em gradiente, o botão de sempre)', () => {
    render(<ConfirmDeleteModal isOpen onClose={vi.fn()} onConfirm={vi.fn()} message={MSG} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveClass('v2-modal');
    expect(dialog.innerHTML).toMatch(/linear-gradient/);
    expect(within(dialog).getByRole('button', { name: 'Eliminar' })).not.toHaveClass('v2-btn-danger');
  });
});

describe('RaceRemoveDialog — Design v2', () => {
  it('«Eliminar prova»: o mesmo texto, no painel do v2, com o botão vermelho liso', () => {
    act(() => setDesignV2(true));
    render(<RaceRemoveDialog isOpen race={{ id: 'r1', name: 'Meia de Lisboa', date: '2026-12-01', status: 'agendada' }} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('v2-modal');
    expect(screen.getByTestId('race-remove-race')).toHaveTextContent('«Meia de Lisboa» sai do calendário');
    expect(within(dialog).getByRole('button', { name: 'Eliminar prova' })).toHaveClass('v2-btn-danger');
    expect(dialog.innerHTML).not.toMatch(/linear-gradient/);
  });
});

describe('PremiumModal — o ícone do tema no v2', () => {
  it('o tema «warning» tem o ícone na cor do aviso', () => {
    act(() => setDesignV2(true));
    render(<PremiumModal isOpen onClose={vi.fn()} title="Atenção" theme="warning" icon={(p) => <svg data-testid="ic" style={p.style} />}>x</PremiumModal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog.innerHTML).toContain('var(--warn)');
  });
});
