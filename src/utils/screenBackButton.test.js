import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScreenBackButton } from './screenBackButton';
import { useAppStore } from '../store';

// Bug relatado 2026-08-30: o botão/gesto de "voltar" do telemóvel fechava
// a app inteira em vez de voltar ao ecrã de registo/edição anterior,
// porque nenhuma entrada era empilhada no histórico do browser para o
// gesto desfazer primeiro.
function firePopState() {
  window.dispatchEvent(new PopStateEvent('popstate'));
}

describe('useScreenBackButton', () => {
  beforeEach(() => {
    useAppStore.setState({ navGuard: null });
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('abrir o ecrã empilha uma entrada de histórico', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ isOpen }) => useScreenBackButton(isOpen, onClose), {
      initialProps: { isOpen: false },
    });
    expect(window.history.pushState).not.toHaveBeenCalled();

    rerender({ isOpen: true });
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
  });

  it('gesto de voltar (popstate) sem alterações por gravar fecha o ecrã', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ isOpen }) => useScreenBackButton(isOpen, onClose), {
      initialProps: { isOpen: false },
    });
    rerender({ isOpen: true });

    act(() => { firePopState(); });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('BUG CORRIGIDO — gesto de voltar com alterações por gravar (navGuard ativo) NÃO fecha o ecrã, mostra o aviso da própria app e mantém a armadilha de histórico', () => {
    const onClose = vi.fn();
    const guard = vi.fn().mockReturnValue(false); // mesmo contrato do navGuard: false = travar
    useAppStore.setState({ navGuard: guard });

    const { rerender } = renderHook(({ isOpen }) => useScreenBackButton(isOpen, onClose), {
      initialProps: { isOpen: false },
    });
    rerender({ isOpen: true });
    window.history.pushState.mockClear(); // só nos interessa o que acontece a partir daqui

    act(() => { firePopState(); });

    expect(guard).toHaveBeenCalledWith(null);
    expect(onClose).not.toHaveBeenCalled();
    // Repõe a entrada que o "voltar" acabou de consumir — o ecrã continua
    // aberto até o atleta decidir no aviso da própria app.
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
  });

  it('popstate sem ecrã aberto não faz nada (não há nada nosso para fechar)', () => {
    const onClose = vi.fn();
    renderHook(() => useScreenBackButton(false, onClose));

    act(() => { firePopState(); });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('fechar pela própria app (Guardar/Cancelar/X, sem gesto de voltar) consome a entrada empilhada', () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ isOpen }) => useScreenBackButton(isOpen, onClose), {
      initialProps: { isOpen: false },
    });
    rerender({ isOpen: true });
    expect(window.history.back).not.toHaveBeenCalled();

    // Fecha via UI, não via popstate.
    rerender({ isOpen: false });

    expect(window.history.back).toHaveBeenCalledTimes(1);
  });
});
