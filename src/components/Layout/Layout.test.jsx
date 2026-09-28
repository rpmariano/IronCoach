import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '../../store';
import Layout from './Layout';

vi.mock('../shared/ReportIssueButton', () => ({ default: () => null }));
vi.mock('../shared/BugNotificationsHandler', () => ({ default: () => null }));

/* A barra inferior tem de tirar o atleta do ecrã "O plano" (relato
   2026-09-19): o plano abre por cima do separador e, sem isto, tocar em
   Home não fazia nada e tocar noutro separador mudava-o por baixo com o
   plano ainda a tapar tudo. */
describe('Layout — a barra inferior fecha "O plano"', () => {
  beforeEach(() => {
    useAppStore.setState({ activeTab: 'home', openCreationMode: 'plano', navGuard: null });
  });

  it('Início, o separador onde já se estava, fecha o plano', () => {
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Início' }));
    expect(useAppStore.getState().openCreationMode).toBe(null);
    expect(useAppStore.getState().activeTab).toBe('home');
  });

  it('outro separador fecha o plano e muda para lá', () => {
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Carol' }));
    expect(useAppStore.getState().openCreationMode).toBe(null);
    expect(useAppStore.getState().activeTab).toBe('coach');
  });

  it('um registo aberto não é fechado pela barra', () => {
    useAppStore.setState({ openCreationMode: 'meal' });
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Carol' }));
    expect(useAppStore.getState().openCreationMode).toBe('meal');
  });
});

describe('Layout — scroll up ao mudar de tela (menos o chat)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('mudar para outro separador (ex.: corrida) faz scroll up', () => {
    useAppStore.setState({ activeTab: 'home', openCreationMode: null });
    const { rerender } = render(<Layout><div /></Layout>);
    window.scrollTo.mockClear();

    useAppStore.setState({ activeTab: 'corrida' });
    rerender(<Layout><div /></Layout>);

    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0, left: 0 }));
  });

  it('abrir um formulário de criação (openCreationMode) faz scroll up', () => {
    useAppStore.setState({ activeTab: 'home', openCreationMode: null });
    const { rerender } = render(<Layout><div /></Layout>);
    window.scrollTo.mockClear();

    useAppStore.setState({ openCreationMode: 'meal' });
    rerender(<Layout><div /></Layout>);

    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0, left: 0 }));
  });

  it('deslizar entre separadores da Evolução NÃO faz scroll up', () => {
    useAppStore.setState({ activeTab: 'corrida', openCreationMode: null });
    const { rerender } = render(<Layout><div /></Layout>);
    window.scrollTo.mockClear();

    useAppStore.setState({ activeTab: 'nutricao' });
    rerender(<Layout><div /></Layout>);

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('abrir um formulário dentro da Evolução continua a fazer scroll up', () => {
    useAppStore.setState({ activeTab: 'corrida', openCreationMode: null });
    const { rerender } = render(<Layout><div /></Layout>);
    window.scrollTo.mockClear();

    useAppStore.setState({ activeTab: 'nutricao', openCreationMode: 'meal' });
    rerender(<Layout><div /></Layout>);

    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0, left: 0 }));
  });

  it('mudar para o chat (coach) NÃO faz scroll up', () => {
    useAppStore.setState({ activeTab: 'home', openCreationMode: null });
    const { rerender } = render(<Layout><div /></Layout>);
    window.scrollTo.mockClear();

    useAppStore.setState({ activeTab: 'coach' });
    rerender(<Layout><div /></Layout>);

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

