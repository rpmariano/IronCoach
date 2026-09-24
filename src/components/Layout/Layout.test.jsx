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
