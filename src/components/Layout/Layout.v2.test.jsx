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
});
