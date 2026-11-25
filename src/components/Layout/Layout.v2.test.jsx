import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { useAppStore } from '../../store';
import { setDesignV2 } from '../../utils/designV2';
import Layout from './Layout';

vi.mock('../shared/ReportIssueButton', () => ({ default: () => null }));
vi.mock('../shared/BugNotificationsHandler', () => ({ default: () => null }));

/* O menu do «+» no Design v2 (pedido do Rui, 25/11): uma folha de baixo com linhas planas, pela
   ordem pedida; desligado, as pílulas de sempre. */

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ activeTab: 'home', openCreationMode: null, navGuard: null });
});
afterEach(() => act(() => setDesignV2(false)));

describe('Layout — o menu do «+» no v2', () => {
  it('desligado: o menu de sempre, sem a folha', () => {
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Registar novo item' }));
    expect(screen.queryByTestId('fab-sheet-v2')).toBeNull();
    expect(screen.getByText('Nova corrida')).toBeInTheDocument();
  });

  it('ligado: uma folha com as linhas pela ordem pedida, e cada uma abre o seu registo', () => {
    act(() => setDesignV2(true));
    const setOpenCreationMode = vi.fn();
    useAppStore.setState({ setOpenCreationMode });
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Registar novo item' }));
    const sheet = screen.getByTestId('fab-sheet-v2');
    expect(sheet).toHaveAttribute('role', 'dialog');
    const linhas = within(sheet).getAllByRole('button').filter((b) => b.getAttribute('aria-label') !== 'Fechar').map((b) => b.textContent);
    expect(linhas.slice(0, 5)).toEqual(['Nova corrida', 'Registar refeição', 'Novo treino', 'Nova avaliação', 'Nova prova']);
    fireEvent.click(within(sheet).getByText('Nova corrida'));
    expect(setOpenCreationMode).toHaveBeenCalledWith('run');
    expect(screen.queryByTestId('fab-sheet-v2')).toBeNull();
  });

  it('o ✕ fecha a folha', () => {
    act(() => setDesignV2(true));
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Registar novo item' }));
    fireEvent.click(within(screen.getByTestId('fab-sheet-v2')).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByTestId('fab-sheet-v2')).toBeNull();
  });

  it('o foco: abre na primeira linha, fica preso na folha, o Escape fecha e volta ao «+»', () => {
    act(() => setDesignV2(true));
    render(<Layout><div /></Layout>);
    const mais = screen.getByRole('button', { name: 'Registar novo item' });
    mais.focus();
    fireEvent.click(mais);
    const sheet = screen.getByTestId('fab-sheet-v2');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(within(sheet).getByTestId('fab-v2-run'));
    // O Tab no fim volta ao princípio (o ✕); o Shift+Tab no princípio vai ao fim.
    const botoes = within(sheet).getAllByRole('button');
    botoes[botoes.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(botoes[0]);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(botoes[botoes.length - 1]);
    // O Escape fecha, e o foco volta ao «+».
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('fab-sheet-v2')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Registar novo item' }));
  });

  it('o separador da Carol: no v2 o balão do Lucide (20 px), com o nome «Carol»; na v1 a cara dela', () => {
    const { unmount } = render(<Layout><div /></Layout>);
    const v1 = screen.getByRole('button', { name: 'Carol' });
    expect(v1.querySelector('svg.lucide-carol')).not.toBeNull();
    expect(within(v1).queryByTestId('nav-carol-icon-v2')).toBeNull();
    unmount();
    act(() => setDesignV2(true));
    render(<Layout><div /></Layout>);
    const v2 = screen.getByRole('button', { name: 'Carol' });
    const icon = within(v2).getByTestId('nav-carol-icon-v2');
    expect(icon).toHaveClass('lucide-message-circle');
    expect(icon).toHaveAttribute('width', '20');
    expect(v2.querySelector('svg.lucide-carol')).toBeNull();
    expect(v2).toHaveTextContent('Carol');
  });

  it('a data do cabeçalho no v2 cabe numa linha: «qua, 25 nov»', async () => {
    const { shortDatePt } = await import('./Layout');
    expect(shortDatePt(new Date(2026, 10, 25))).toBe('qua, 25 nov');
    act(() => setDesignV2(true));
    render(<Layout><div /></Layout>);
    expect(document.querySelector('header[data-app-header] p').textContent).toBe(shortDatePt(new Date()));
  });
});

