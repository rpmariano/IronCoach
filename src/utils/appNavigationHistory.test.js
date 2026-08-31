import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppNavigationHistory } from './appNavigationHistory';
import { useAppStore } from '../store';

// Bug relatado 2026-08-30: o botão/gesto de "voltar" do telemóvel fechava
// a app inteira em vez de voltar ao ecrã anterior — quer a navegar entre
// separadores (Início, Coach, Dashboard...), quer a sair de um ecrã de
// registo/edição. Uma primeira correção só cobria o segundo caso.
function firePopState() {
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function setup(initialProps) {
  const setActiveTab = vi.fn();
  const closeTopScreen = vi.fn();
  const utils = renderHook(
    (props) => useAppNavigationHistory({ setActiveTab, closeTopScreen, ...props }),
    { initialProps: { activeTab: 'home', isCreatingOrEditing: false, ready: true, ...initialProps } },
  );
  return { ...utils, setActiveTab, closeTopScreen };
}

describe('useAppNavigationHistory', () => {
  beforeEach(() => {
    useAppStore.setState({ navGuard: null });
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('BUG CORRIGIDO — mudar de separador empilha uma entrada de histórico', () => {
    const { rerender } = setup();
    expect(window.history.pushState).not.toHaveBeenCalled();

    rerender({ activeTab: 'coach', isCreatingOrEditing: false, ready: true });

    expect(window.history.pushState).toHaveBeenCalledTimes(1);
  });

  it('BUG CORRIGIDO — gesto de voltar depois de mudar de separador restaura o separador anterior, não sai da app', () => {
    const { rerender, setActiveTab } = setup();
    rerender({ activeTab: 'coach', isCreatingOrEditing: false, ready: true });
    rerender({ activeTab: 'perfil', isCreatingOrEditing: false, ready: true });

    act(() => { firePopState(); });

    expect(setActiveTab).toHaveBeenCalledWith('coach');
  });

  it('vários "voltar" seguidos percorrem a pilha em ordem até ao separador inicial', () => {
    const { rerender, setActiveTab } = setup();
    rerender({ activeTab: 'coach', isCreatingOrEditing: false, ready: true });
    rerender({ activeTab: 'perfil', isCreatingOrEditing: false, ready: true });

    act(() => { firePopState(); }); // → coach
    rerender({ activeTab: 'coach', isCreatingOrEditing: false, ready: true }); // reflete o setActiveTab do teste
    act(() => { firePopState(); }); // → home

    expect(setActiveTab).toHaveBeenNthCalledWith(1, 'coach');
    expect(setActiveTab).toHaveBeenNthCalledWith(2, 'home');
  });

  it('sem nada empilhado (app acabada de abrir), "voltar" não faz nada — deixa sair', () => {
    const { setActiveTab, closeTopScreen } = setup();
    act(() => { firePopState(); });

    expect(setActiveTab).not.toHaveBeenCalled();
    expect(closeTopScreen).not.toHaveBeenCalled();
  });

  it('abrir um ecrã de registo/edição empilha uma entrada; "voltar" fecha-o em vez de sair', () => {
    const { rerender, closeTopScreen } = setup();
    rerender({ activeTab: 'home', isCreatingOrEditing: true, ready: true });

    act(() => { firePopState(); });

    expect(closeTopScreen).toHaveBeenCalledTimes(1);
  });

  it('BUG CORRIGIDO — alterações por gravar (navGuard ativo) travam o "voltar" sobre um ecrã de registo, tal como o X/Cancelar', () => {
    const guard = vi.fn().mockReturnValue(false);
    useAppStore.setState({ navGuard: guard });

    const { rerender, closeTopScreen } = setup();
    rerender({ activeTab: 'home', isCreatingOrEditing: true, ready: true });
    window.history.pushState.mockClear();

    act(() => { firePopState(); });

    expect(guard).toHaveBeenCalledWith(null);
    expect(closeTopScreen).not.toHaveBeenCalled();
    // Repõe a entrada que o "voltar" consumiu — o ecrã continua aberto.
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
  });

  it('só começa a empilhar depois de `ready` — não conta a mudança de separador vinda da inicialização (?tab= da URL)', () => {
    const { rerender } = setup({ activeTab: 'home', isCreatingOrEditing: false, ready: false });
    rerender({ activeTab: 'coach', isCreatingOrEditing: false, ready: false }); // ?tab=coach, ainda a inicializar
    expect(window.history.pushState).not.toHaveBeenCalled();

    rerender({ activeTab: 'coach', isCreatingOrEditing: false, ready: true }); // inicialização terminou
    expect(window.history.pushState).not.toHaveBeenCalled(); // reancora, não empilha

    rerender({ activeTab: 'perfil', isCreatingOrEditing: false, ready: true }); // navegação real, agora sim
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
  });
});
