import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useAppStore } from '../../store';
import { setDesignV2 } from '../../utils/designV2';
import Layout from './Layout';

vi.mock('../shared/ReportIssueButton', () => ({ default: () => null }));
vi.mock('../shared/BugNotificationsHandler', () => ({ default: () => null }));

/* 2.ª crítica do Design v2 (2026-11-25), P1.3: fechar um registo levava a outro ecrã. No v2 o +
   abre o registo sem trocar de separador; fechar volta ao ecrã de onde se partiu (o hub da prova,
   se foi daí); tocar no separador ativo volta à raiz dele. Na v1, como sempre. */

const BASE = {
  activeTab: 'provas', openCreationMode: null, editingRaceId: null, editingRunId: null,
  runRacePrefill: null, runRegistrationReturn: null, navGuard: null,
};
beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState(BASE);
});
afterEach(() => act(() => setDesignV2(false)));

const abrirNovaCorrida = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Registar novo item' }));
  const folha = screen.queryByTestId('fab-sheet-v2');
  fireEvent.click(folha ? within(folha).getByText('Nova corrida') : screen.getByText('Nova corrida'));
};

describe('O + e o separador', () => {
  it('v2: abre a Nova corrida por cima, sem trocar de separador; fechar volta a ele', () => {
    act(() => setDesignV2(true));
    render(<Layout><div /></Layout>);
    abrirNovaCorrida();
    expect(useAppStore.getState().activeTab).toBe('provas');
    expect(useAppStore.getState().openCreationMode).toBe('run');
    act(() => useAppStore.getState().closeRunRegistration());
    expect(useAppStore.getState().activeTab).toBe('provas');
    expect(useAppStore.getState().openCreationMode).toBeNull();
  });

  it('v1: o + passa pelo Calendário, como sempre', () => {
    render(<Layout><div /></Layout>);
    abrirNovaCorrida();
    expect(useAppStore.getState().activeTab).toBe('calendario');
    expect(useAppStore.getState().openCreationMode).toBe('run');
  });

  it('v2, com um formulário por gravar à frente: o caminho de sempre, que pergunta', () => {
    act(() => setDesignV2(true));
    const guard = vi.fn(() => false);
    useAppStore.setState({ navGuard: guard });
    render(<Layout><div /></Layout>);
    abrirNovaCorrida();
    expect(guard).toHaveBeenCalledWith('calendario');
    expect(useAppStore.getState().openCreationMode).toBeNull();
  });
});

describe('O registo da prova aberto do hub', () => {
  const noHub = () => useAppStore.setState({ ...BASE, activeTab: 'provas', openCreationMode: 'race', editingRaceId: 'r1' });

  it('v2: abre por cima do hub sem ir para a Evolução, e fechar volta ao hub', () => {
    act(() => setDesignV2(true));
    noHub();
    expect(useAppStore.getState().openRaceRun('r1')).toBe(true);
    let s = useAppStore.getState();
    expect(s.activeTab).toBe('provas');
    expect(s.openCreationMode).toBe('run');
    expect(s.runRacePrefill).toEqual({ raceId: 'r1' });
    act(() => useAppStore.getState().closeRunRegistration());
    s = useAppStore.getState();
    expect(s.activeTab).toBe('provas');
    expect(s.openCreationMode).toBe('race');
    expect(s.editingRaceId).toBe('r1');
  });

  it('v2: aberto do Início, fechar volta ao Início', () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ ...BASE, activeTab: 'home' });
    useAppStore.getState().openRaceRun('r1');
    act(() => useAppStore.getState().closeRunRegistration());
    const s = useAppStore.getState();
    expect(s.activeTab).toBe('home');
    expect(s.openCreationMode).toBeNull();
    expect(s.editingRaceId).toBeNull();
  });

  it('v1: vai para a Evolução (corrida) e fechar fica lá, como sempre', () => {
    noHub();
    useAppStore.getState().openRaceRun('r1');
    expect(useAppStore.getState().activeTab).toBe('corrida');
    act(() => useAppStore.getState().closeRunRegistration());
    const s = useAppStore.getState();
    expect(s.activeTab).toBe('corrida');
    expect(s.openCreationMode).toBeNull();
    expect(s.runRegistrationReturn).toBeNull();
  });
});

describe('Tocar no separador ativo', () => {
  it('v2: com um registo ou o hub por cima, volta à raiz do separador', () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ ...BASE, activeTab: 'provas', openCreationMode: 'race', editingRaceId: 'r1' });
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Provas' }));
    const s = useAppStore.getState();
    expect(s.activeTab).toBe('provas');
    expect(s.openCreationMode).toBeNull();
    expect(s.editingRaceId).toBeNull();
  });

  it('v2: um registo com alterações pergunta antes (o navGuard dele) e fica', () => {
    act(() => setDesignV2(true));
    const guard = vi.fn(() => false);
    useAppStore.setState({ ...BASE, activeTab: 'home', openCreationMode: 'run', navGuard: guard });
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Início' }));
    expect(guard).toHaveBeenCalledWith('home');
    expect(useAppStore.getState().openCreationMode).toBe('run');
  });

  it('v1: tocar no separador ativo com um registo por cima não o fecha, como sempre', () => {
    useAppStore.setState({ ...BASE, activeTab: 'home', openCreationMode: 'meal' });
    render(<Layout><div /></Layout>);
    fireEvent.click(screen.getByRole('button', { name: 'Início' }));
    expect(useAppStore.getState().openCreationMode).toBe('meal');
  });
});

describe('P1.1 · os estilos v2 das ilhas', () => {
  const css = (f) => readFileSync(resolve(__dirname, '../../styles', f), 'utf8');
  it('o navegador da semana do Geral volta a ver-se dentro do .v2-evo-body', () => {
    expect(css('v2-geral.css')).toContain('.v2-evo-body .v2-geral-period [data-testid="period-nav"] { display: block !important; }');
  });
  it('«O que falta para começar» e o check-in no painel do v2, sem borda, raio 8', () => {
    const c = css('v2-components.css');
    expect(c).toMatch(/\[data-testid="getting-started"\] > div:nth-child\(2\) \{ background: var\(--v2-panel\) !important; border: 0 !important; border-radius: var\(--v2-radius\)/);
    expect(c).toMatch(/\[data-testid="checkin-card"\] \{ background: var\(--v2-panel\) !important; border: 0 !important; border-radius: var\(--v2-radius\)/);
  });
});

describe('Revisão · fechar ao trocar de separador não repõe o hub', () => {
  it('v2: closeRunRegistration({ navigating }) fecha sem repor o hub', () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ ...BASE, activeTab: 'provas', openCreationMode: 'race', editingRaceId: 'r1' });
    useAppStore.getState().openRaceRun('r1');
    act(() => useAppStore.getState().closeRunRegistration({ navigating: true }));
    const s = useAppStore.getState();
    expect(s.openCreationMode).toBeNull();
    expect(s.editingRaceId).toBeNull();
    expect(s.runRegistrationReturn).toBeNull();
  });

  it('v2: o registo aberto do hub, tocar noutro separador sem alterações: fecha e o hub não volta', async () => {
    act(() => setDesignV2(true));
    const { default: useRegistrationExit } = await import('../shared/registration/useRegistrationExit');
    useAppStore.setState({ ...BASE, activeTab: 'provas', openCreationMode: 'race', editingRaceId: 'r1' });
    useAppStore.getState().openRaceRun('r1');
    function Reg() {
      useRegistrationExit({ isDirty: false, onClose: (o) => useAppStore.getState().closeRunRegistration(o) });
      return null;
    }
    render(<Reg />);
    act(() => { useAppStore.getState().setActiveTab('home'); });
    const s = useAppStore.getState();
    expect(s.activeTab).toBe('home');
    expect(s.openCreationMode).toBeNull();
    expect(s.editingRaceId).toBeNull();
  });

  it('v2: com alterações, «Sair sem gravar» para outro separador fecha sem repor o hub', async () => {
    act(() => setDesignV2(true));
    const { default: useRegistrationExit } = await import('../shared/registration/useRegistrationExit');
    useAppStore.setState({ ...BASE, activeTab: 'provas', openCreationMode: 'race', editingRaceId: 'r1' });
    useAppStore.getState().openRaceRun('r1');
    let exit;
    function Reg() {
      exit = useRegistrationExit({ isDirty: true, onClose: (o) => useAppStore.getState().closeRunRegistration(o) });
      return null;
    }
    render(<Reg />);
    act(() => { useAppStore.getState().setActiveTab('home'); });
    expect(useAppStore.getState().activeTab).toBe('provas');
    act(() => exit.close());
    const s = useAppStore.getState();
    expect(s.activeTab).toBe('home');
    expect(s.openCreationMode).toBeNull();
    expect(s.editingRaceId).toBeNull();
  });

  it('o X do registo (sem destino pendente) volta ao hub', async () => {
    act(() => setDesignV2(true));
    const { default: useRegistrationExit } = await import('../shared/registration/useRegistrationExit');
    useAppStore.setState({ ...BASE, activeTab: 'provas', openCreationMode: 'race', editingRaceId: 'r1' });
    useAppStore.getState().openRaceRun('r1');
    let exit;
    function Reg() {
      exit = useRegistrationExit({ isDirty: false, onClose: (o) => useAppStore.getState().closeRunRegistration(o) });
      return null;
    }
    render(<Reg />);
    act(() => exit.requestClose());
    expect(useAppStore.getState().openCreationMode).toBe('race');
    expect(useAppStore.getState().editingRaceId).toBe('r1');
  });
});

describe('Revisão · o regresso velho limpa-se', () => {
  it('abrir a prova pelo hub, voltar com o telemóvel, «Começar a corrida» no Início e fechar: fica no Início', () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ ...BASE, activeTab: 'provas', openCreationMode: 'race', editingRaceId: 'r1' });
    useAppStore.getState().openRaceRun('r1');
    const s0 = useAppStore.getState();
    s0.setOpenCreationMode(null); s0.setEditingRaceId(null); s0.setEditingRunId(null);
    expect(useAppStore.getState().runRegistrationReturn).toBeNull();
    useAppStore.getState().setActiveTab('home');
    useAppStore.getState().setOpenCreationMode('run');
    act(() => useAppStore.getState().closeRunRegistration());
    const s = useAppStore.getState();
    expect(s.activeTab).toBe('home');
    expect(s.openCreationMode).toBeNull();
    expect(s.editingRaceId).toBeNull();
  });

  it('setOpenCreationMode e setEditingRaceId esquecem o regresso', () => {
    useAppStore.setState({ runRegistrationReturn: { openCreationMode: 'race', editingRaceId: 'r1' } });
    useAppStore.getState().setOpenCreationMode('meal');
    expect(useAppStore.getState().runRegistrationReturn).toBeNull();
    useAppStore.setState({ runRegistrationReturn: { openCreationMode: 'race', editingRaceId: 'r1' } });
    useAppStore.getState().setEditingRaceId('r2');
    expect(useAppStore.getState().runRegistrationReturn).toBeNull();
  });
});
