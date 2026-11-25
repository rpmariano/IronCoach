import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useAppStore } from '../../store';
import { setDesignV2 } from '../../utils/designV2';
import Layout, { navTabV2 } from './Layout';
import ScreenTitleV2 from '../shared/ScreenTitleV2';

vi.mock('../shared/ReportIssueButton', () => ({ default: () => null }));
vi.mock('../shared/BugNotificationsHandler', () => ({ default: () => null }));

/* P2b da crítica de design (2026-11-25): a orientação no v2. O separador aceso é o do ecrã à frente
   (o registo da prova é das Provas, não da Evolução); o Calendário e o Perfil levam título e voltar;
   e os flutuantes não tapam a barra de ações. Na v1 nada muda. */

beforeEach(() => {
  window.localStorage.clear();
  useAppStore.setState({ activeTab: 'home', openCreationMode: null, runRacePrefill: null, navGuard: null });
});
afterEach(() => act(() => setDesignV2(false)));

const aceso = () => document.querySelector('[data-testid="bottom-nav"] [aria-current="page"]')?.getAttribute('aria-label') ?? null;

describe('navTabV2', () => {
  it('sem registo aberto, o separador de sempre', () => {
    expect(navTabV2('corrida', null, null)).toBe('corrida');
    expect(navTabV2('perfil', null, null)).toBe('perfil');
  });
  it('o registo da prova e a ficha da prova são das Provas', () => {
    expect(navTabV2('corrida', 'run', true)).toBe('provas');
    expect(navTabV2('home', 'race', null)).toBe('provas');
  });
  it('os outros registos não acendem nenhum', () => {
    expect(navTabV2('home', 'run', false)).toBeNull();
    expect(navTabV2('nutricao', 'meal', null)).toBeNull();
  });
});

describe('Layout — o separador aceso', () => {
  it('v1: o registo da prova (debaixo de «corrida») acende a Evolução, como sempre', () => {
    useAppStore.setState({ activeTab: 'corrida', openCreationMode: 'run', runRacePrefill: { raceId: 'r1' } });
    render(<Layout><div /></Layout>);
    expect(document.querySelector('[data-vert="dashboard"]')).toHaveAttribute('aria-current', 'page');
  });

  it('v2: o registo da prova acende as Provas', () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ activeTab: 'corrida', openCreationMode: 'run', runRacePrefill: { raceId: 'r1' } });
    render(<Layout><div /></Layout>);
    expect(aceso()).toBe('Provas');
    expect(document.querySelector('[data-vert="dashboard"]')).not.toHaveAttribute('aria-current');
    // O registo consome o pedido ao montar: as Provas continuam acesas enquanto ele estiver aberto.
    act(() => useAppStore.setState({ runRacePrefill: null }));
    expect(aceso()).toBe('Provas');
    act(() => useAppStore.setState({ openCreationMode: null, activeTab: 'corrida' }));
    expect(document.querySelector('[data-vert="dashboard"]')).toHaveAttribute('aria-current', 'page');
  });

  it('v2: a Nova corrida não acende nenhum', () => {
    act(() => setDesignV2(true));
    useAppStore.setState({ activeTab: 'home', openCreationMode: 'run', runRacePrefill: null });
    render(<Layout><div /></Layout>);
    expect(aceso()).toBeNull();
    expect(document.querySelector('[data-vert="dashboard"]')).not.toHaveAttribute('aria-current');
  });

  it('v2: o Calendário e o Perfil não acendem nenhum', () => {
    act(() => setDesignV2(true));
    for (const tab of ['calendario', 'perfil']) {
      useAppStore.setState({ activeTab: tab });
      const { unmount } = render(<Layout><div /></Layout>);
      expect(aceso()).toBeNull();
      unmount();
    }
  });
});

describe('ScreenTitleV2', () => {
  it('o título no topo e um voltar com nome', () => {
    const onBack = vi.fn();
    render(<ScreenTitleV2 title="Calendário" onBack={onBack} testId="t" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Calendário' })).toHaveClass('v2-title');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe('v2.css — os flutuantes não tapam a barra de ações', () => {
  const css = readFileSync(resolve(__dirname, '../../styles/v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('a barra sobe acima do + (só no v2 e sem teclado)', () => {
    expect(css).toMatch(/html\.design-v2:not\(\[data-keyboard="open"\]\) \{ --v2-bar-lift: 24px; \}/);
    expect(css).toMatch(/\[data-testid="action-bar"\] \{\s*padding-bottom: calc\(12px \+ var\(--v2-bar-lift\)\) !important/);
  });

  it('com barra, o reportar e a bolha da Carol sobem por cima dela', () => {
    const rule = css.split('}').find((r) => r.includes('report-issue-button') && r.includes('coach-insight-button') && r.includes('bottom:'));
    expect(rule).toContain('body:has([data-testid="action-bar"])');
    expect(rule).toMatch(/bottom: calc\(var\(--actionbar-bottom\) \+ var\(--v2-bar-lift\) \+ 80px/);
  });

  it('a barra fixa não apanha a margem de um contentor space-y (o Perfil ficava 16 px acima da nav)', () => {
    expect(css).toMatch(/html\.design-v2 \[data-testid="action-bar"\] \{ margin: 0 !important; \}/);
  });

  it('o padding do fundo passa os flutuantes, com e sem barra', () => {
    expect(css).toMatch(/--scroll-pad-bottom: 164px/);
    expect(css).toMatch(/--scroll-pad-bottom-actionbar: calc\(var\(--actionbar-bottom\) \+ var\(--v2-bar-lift\) \+ 80px \+ 48px \+ 16px\)/);
  });
});
