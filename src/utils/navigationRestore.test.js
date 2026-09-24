import { describe, it, expect, vi } from 'vitest';
import { create } from 'zustand';
import { isScreenOpen, startNavigationPersistence, readRecentNavigation, applyNavigation, clearNavigation, RESTORE_WINDOW_MS } from './navigationRestore';

// Relatado 2026-09-24: sair para outra app a meio de um registo e voltar
// deixava a app no Início — o Android matava-a e o ecrã perdia-se.
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}
function makeStore(extra = {}) {
  return create((set) => ({
    activeTab: 'home', openCreationMode: null, editingRaceId: null, editingRunId: null, onboardingOpen: false, navGuard: null,
    planItemPrefill: null, runRacePrefill: null, racePrefill: null,
    setActiveTab: (tab) => { set({ activeTab: tab }); return true; },
    ...extra,
  }));
}
function fakeDoc() {
  const listeners = {};
  return {
    visibilityState: 'visible',
    addEventListener: (e, f) => { listeners[e] = f; },
    removeEventListener: () => {},
    hide() { this.visibilityState = 'hidden'; listeners.visibilitychange?.(); },
  };
}

describe('isScreenOpen', () => {
  it('um registo, uma edição, o arranque ou um formulário por gravar contam', () => {
    expect(isScreenOpen({ openCreationMode: 'meal' })).toBe(true);
    expect(isScreenOpen({ editingRaceId: 'r1' })).toBe(true);
    expect(isScreenOpen({ onboardingOpen: true })).toBe(true);
    expect(isScreenOpen({ navGuard: () => true })).toBe(true);
    expect(isScreenOpen({ activeTab: 'coach' })).toBe(false);
  });
});

describe('guardar e repor o ecrã onde se estava', () => {
  it('abrir um registo guarda-o com o prefill que ele leu ao abrir; sair da app atualiza a hora', () => {
    const storage = memoryStorage();
    let t = 1000;
    const store = makeStore();
    const doc = fakeDoc();
    startNavigationPersistence(store, { storage, now: () => t, doc, win: null });
    store.setState({ activeTab: 'corrida', planItemPrefill: { id: 'p1', kind: 'corrida' } });
    store.setState({ openCreationMode: 'run' });
    // O registo consome o prefill ao montar — o guardado não o perde.
    store.setState({ planItemPrefill: null });
    t = 5000;
    doc.hide();
    const saved = readRecentNavigation({ storage, now: () => 6000 });
    expect(saved.activeTab).toBe('corrida');
    expect(saved.screen).toEqual({ openCreationMode: 'run', editingRaceId: null, editingRunId: null, planItemPrefill: { id: 'p1', kind: 'corrida' } });
    expect(saved.savedAt).toBe(5000);
  });

  it('fechar o registo esquece-o (continua o separador)', () => {
    const storage = memoryStorage();
    const store = makeStore();
    startNavigationPersistence(store, { storage, now: () => 1, doc: fakeDoc(), win: null });
    store.setState({ openCreationMode: 'meal' });
    store.setState({ openCreationMode: null });
    expect(readRecentNavigation({ storage, now: () => 2 }).screen).toBeNull();
  });

  it('passada a janela, não repõe nada', () => {
    const storage = memoryStorage();
    const store = makeStore();
    startNavigationPersistence(store, { storage, now: () => 0, doc: fakeDoc(), win: null });
    store.setState({ openCreationMode: 'meal' });
    expect(readRecentNavigation({ storage, now: () => RESTORE_WINDOW_MS + 1 })).toBeNull();
    expect(readRecentNavigation({ storage, now: () => RESTORE_WINDOW_MS })).not.toBeNull();
  });

  it('repor: o separador, os prefills e o ecrã, por esta ordem', () => {
    const store = makeStore();
    const setActiveTab = vi.spyOn(store.getState(), 'setActiveTab');
    applyNavigation(store, { activeTab: 'corrida', screen: { openCreationMode: 'run', editingRaceId: null, editingRunId: 'run-1', runRacePrefill: { raceId: 'race-1' } } });
    const s = store.getState();
    expect(setActiveTab).toHaveBeenCalledWith('corrida');
    expect(s.openCreationMode).toBe('run');
    expect(s.editingRunId).toBe('run-1');
    expect(s.runRacePrefill).toEqual({ raceId: 'race-1' });
  });

  it('terminar a sessão esquece o ecrã guardado', () => {
    const storage = memoryStorage();
    const store = makeStore();
    startNavigationPersistence(store, { storage, now: () => 1, doc: fakeDoc(), win: null });
    store.setState({ openCreationMode: 'meal' });
    clearNavigation(storage);
    expect(readRecentNavigation({ storage, now: () => 2 })).toBeNull();
  });
});
