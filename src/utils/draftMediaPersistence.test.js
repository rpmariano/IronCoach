import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { useState } from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { draftMediaStore, usePersistedDraftMedia, clearDraftMedia } from './draftMediaPersistence';

/* As fotos de um rascunho sobrevivem a um recarregamento (relatado
   2026-09-13). O IndexedDB é substituído por um Map para o teste. */

const memory = new Map();
const original = { ...draftMediaStore };

function Form({ draftKey = 'rascunho:nova' }) {
  const [photos, setPhotos] = useState([]);
  usePersistedDraftMedia(draftKey, 'photos', photos, setPhotos);
  return React.createElement('div', null,
    React.createElement('span', { 'data-testid': 'count' }, String(photos.length)),
    React.createElement('button', { onClick: () => setPhotos((p) => [...p, { dataUrl: `data:image/jpeg;base64,${p.length}` }]) }, 'juntar'),
  );
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

describe('usePersistedDraftMedia', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    memory.clear();
    draftMediaStore.load = vi.fn(async (key) => memory.get(key));
    draftMediaStore.save = vi.fn(async (key, value) => { memory.set(key, value); });
    draftMediaStore.remove = vi.fn(async (key) => { memory.delete(key); });
    draftMediaStore.removeAllFor = vi.fn(async (draftKey) => {
      [...memory.keys()].filter((k) => k.startsWith(`${draftKey}::`)).forEach((k) => memory.delete(k));
    });
  });

  afterEach(() => {
    Object.assign(draftMediaStore, original);
    vi.useRealTimers();
  });

  it('guarda as fotos escolhidas e devolve-as a um formulário remontado', async () => {
    const { unmount } = render(React.createElement(Form));
    await flush();
    fireEvent.click(screen.getByText('juntar'));
    fireEvent.click(screen.getByText('juntar'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(memory.get('rascunho:nova::photos')).toHaveLength(2);

    // A página recarrega (ou o ecrã desmonta e volta): as fotos regressam.
    unmount();
    render(React.createElement(Form));
    await flush();
    expect(screen.getByTestId('count')).toHaveTextContent('2');
  });

  it('não pisa as fotos que o formulário já tem quando a leitura chega', async () => {
    memory.set('rascunho:nova::photos', [{ dataUrl: 'antiga' }]);
    let resolveLoad;
    draftMediaStore.load = vi.fn(() => new Promise((r) => { resolveLoad = r; }));
    render(React.createElement(Form));
    // A leitura arranca numa microtarefa depois de montar; o atleta escolhe
    // uma foto enquanto ela ainda não voltou.
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByText('juntar'));
    await act(async () => { resolveLoad(memory.get('rascunho:nova::photos')); });
    await flush();
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    // E as que já estavam escolhidas passam a estar guardadas.
    expect(draftMediaStore.save).toHaveBeenCalledWith('rascunho:nova::photos', [{ dataUrl: 'data:image/jpeg;base64,0' }]);
  });

  it('apagar o rascunho apaga as fotos, e um save agendado antes não as ressuscita', async () => {
    render(React.createElement(Form));
    await flush();
    fireEvent.click(screen.getByText('juntar'));
    // Grava-se (e apaga-se o rascunho) antes de o debounce disparar.
    clearDraftMedia('rascunho:nova');
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(memory.has('rascunho:nova::photos')).toBe(false);
    expect(draftMediaStore.removeAllFor).toHaveBeenCalledWith('rascunho:nova');
  });

  it('descartar enquanto a leitura corre não deixa as fotos voltar', async () => {
    memory.set('rascunho:nova::photos', [{ dataUrl: 'antiga' }]);
    let resolveLoad;
    draftMediaStore.load = vi.fn(() => new Promise((r) => { resolveLoad = r; }));
    render(React.createElement(Form));
    await act(async () => { await Promise.resolve(); });
    vi.advanceTimersByTime(5);
    clearDraftMedia('rascunho:nova');
    await act(async () => { resolveLoad([{ dataUrl: 'antiga' }]); });
    await flush();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('sem IndexedDB (o adaptador original no jsdom) não rebenta e não mexe no estado', async () => {
    Object.assign(draftMediaStore, original);
    render(React.createElement(Form));
    await flush();
    fireEvent.click(screen.getByText('juntar'));
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(() => clearDraftMedia('rascunho:nova')).not.toThrow();
  });
});
