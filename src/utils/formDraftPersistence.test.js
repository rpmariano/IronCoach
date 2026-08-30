import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  usePersistedFormDraft,
  restorePersistedFormDraft,
  clearPersistedFormDraft,
} from './formDraftPersistence';

// Bug relatado 2026-08-30: formulários perdiam todo o texto ao trocar de
// app e voltar — o Android descarta a página em segundo plano e recarrega
// do zero, apagando o estado em memória. localStorage sobrevive a isso.
describe('formDraftPersistence', () => {
  const KEY = 'ironcoach:test-draft';

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('BUG CORRIGIDO — persiste o rascunho (com debounce) enquanto isDirty, e restorePersistedFormDraft lê o valor guardado', () => {
    const draft = { name: 'Corrida do Tejo', notes: 'a meio de preencher' };
    renderHook(() => usePersistedFormDraft(KEY, draft, { isDirty: true, isEnabled: true }));

    // Antes do debounce, ainda não gravou.
    expect(restorePersistedFormDraft(KEY)).toBeNull();

    vi.advanceTimersByTime(600);

    expect(restorePersistedFormDraft(KEY)).toEqual(draft);
  });

  it('não persiste enquanto isDirty é false (rascunho intocado)', () => {
    const draft = { name: '' };
    renderHook(() => usePersistedFormDraft(KEY, draft, { isDirty: false, isEnabled: true }));
    vi.advanceTimersByTime(600);

    expect(restorePersistedFormDraft(KEY)).toBeNull();
  });

  it('não persiste enquanto isEnabled é false (inicialização ainda não restaurou um rascunho anterior)', () => {
    const draft = { name: 'Novo texto' };
    renderHook(() => usePersistedFormDraft(KEY, draft, { isDirty: true, isEnabled: false }));
    vi.advanceTimersByTime(600);

    expect(restorePersistedFormDraft(KEY)).toBeNull();
  });

  it('atualizações rápidas seguidas só gravam a última (debounce), não uma por cada mudança', () => {
    const { rerender } = renderHook(
      ({ draft }) => usePersistedFormDraft(KEY, draft, { isDirty: true, isEnabled: true }),
      { initialProps: { draft: { name: 'C' } } },
    );
    rerender({ draft: { name: 'Co' } });
    vi.advanceTimersByTime(200);
    rerender({ draft: { name: 'Cor' } });
    vi.advanceTimersByTime(200);
    rerender({ draft: { name: 'Corrida' } });
    vi.advanceTimersByTime(600);

    expect(restorePersistedFormDraft(KEY)).toEqual({ name: 'Corrida' });
  });

  it('clearPersistedFormDraft remove o rascunho guardado', () => {
    localStorage.setItem(KEY, JSON.stringify({ name: 'x' }));
    expect(restorePersistedFormDraft(KEY)).toEqual({ name: 'x' });

    clearPersistedFormDraft(KEY);

    expect(restorePersistedFormDraft(KEY)).toBeNull();
  });

  it('restorePersistedFormDraft devolve null para uma key sem nada guardado', () => {
    expect(restorePersistedFormDraft('ironcoach:nunca-guardado')).toBeNull();
  });

  it('restorePersistedFormDraft devolve null para JSON inválido em vez de rebentar', () => {
    localStorage.setItem(KEY, '{isto não é json válido');
    expect(restorePersistedFormDraft(KEY)).toBeNull();
  });
});
