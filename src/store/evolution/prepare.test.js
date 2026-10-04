import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../index';
import { usePeriodStore } from '../periodStore';
import {
  createEvolutionPreparer, prepareOrder, MIN_IDLE_MS, FALLBACK_DELAY_MS, INTERACTION_QUIET_MS,
} from './prepare';
import { registerEvolutionView, resetEvolutionRegistry } from './registry';
import {
  getEvolutionView, resetEvolutionCache, evolutionCacheStats, isEvolutionViewCached, hasFingerprint,
} from './cache';

/* Preparação em tempo morto (2026-10-04, F6). requestIdleCallback é trocado
   por uma fila que o teste esvazia à mão, com o timeRemaining que quiser. */
let idleQueue;
let clock;
let day;
let builds;
let preparer;

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

async function runIdle({ remaining = 50, didTimeout = false } = {}) {
  const cb = idleQueue.shift();
  if (!cb) throw new Error('nenhum pedido de tempo morto pendente');
  cb({ didTimeout, timeRemaining: typeof remaining === 'function' ? remaining : () => remaining });
  await flushPromises();
}

function register(tab, slices) {
  registerEvolutionView(tab, {
    slices,
    deps: (s) => [s.runs, s.meals],
    build: (deps, period, todayISO) => {
      builds.push(`${tab}|${period.kind}|${period.offset}`);
      return { tab, period, todayISO, n: deps[0].length };
    },
  });
}

function makePreparer(extra = {}) {
  preparer = createEvolutionPreparer({
    loadViews: () => Promise.resolve(),
    today: () => day,
    now: () => clock,
    ...extra,
  });
  return preparer;
}

// Arranca e esvazia o 1.º tempo morto (o que carrega os módulos das vistas).
async function startReady(extra) {
  makePreparer(extra).start();
  await runIdle();
  await flushPromises();
}

describe('prepareOrder', () => {
  it('último aberto → hub → resto (só os que têm vista)', () => {
    expect(prepareOrder('corpo', ['nutricao', 'hub', 'corpo', 'corrida'])).toEqual(['corpo', 'hub', 'nutricao', 'corrida']);
    expect(prepareOrder('holistica', ['corrida', 'hub'])).toEqual(['hub', 'corrida']);
    expect(prepareOrder(undefined, ['ginasio'])).toEqual(['ginasio']);
  });
});

describe('preparação das vistas em tempo morto', () => {
  beforeEach(() => {
    idleQueue = [];
    clock = 10_000;
    day = '2026-10-04';
    builds = [];
    resetEvolutionCache();
    resetEvolutionRegistry();
    usePeriodStore.getState().reset();
    useAppStore.setState({ runs: [{ id: 'r1', date: '2026-10-01', distance_km: 5 }], meals: [], dataPending: false, loadedSlices: {}, lastDashboardTab: 'corrida' });
    vi.stubGlobal('requestIdleCallback', vi.fn((cb) => { idleQueue.push(cb); return idleQueue.length; }));
    vi.stubGlobal('cancelIdleCallback', vi.fn());
    register('hub', ['runs']);
    register('corrida', ['runs']);
    register('nutricao', ['meals']);
  });
  afterEach(() => {
    preparer?.stop();
    preparer = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('não faz nada até ao primeiro tempo morto (e esse só carrega as vistas)', async () => {
    makePreparer().start();
    expect(builds).toEqual([]);
    expect(idleQueue).toHaveLength(1);
    await runIdle();
    expect(builds).toEqual([]);
  });

  it('UM separador por fatia: último aberto → hub → resto, depois os períodos anteriores', async () => {
    await startReady();
    const order = [];
    while (idleQueue.length) {
      await runIdle();
      order.push(builds.at(-1));
    }
    expect(order).toEqual([
      'corrida|mes|0', 'hub|semana|0', 'nutricao|semana|0',
      'corrida|mes|-1', 'hub|semana|-1', 'nutricao|semana|-1',
    ]);
    expect(builds).toHaveLength(6); // um por fatia, nenhum repetido
    expect(preparer.pending()).toEqual([]);
    expect(preparer.isScheduled()).toBe(false); // sem nada a fazer, não pede mais tempo morto
  });

  it('respeita timeRemaining: com pouco tempo não calcula e volta a pedir', async () => {
    await startReady();
    await runIdle({ remaining: MIN_IDLE_MS - 1 });
    expect(builds).toEqual([]);
    expect(idleQueue).toHaveLength(1);
    // O browser forçou a chamada (timeout): calcula mesmo sem tempo.
    await runIdle({ remaining: 0, didTimeout: true });
    expect(builds).toEqual(['corrida|mes|0']);
  });

  it('pausa enquanto há toque ou scroll recente', async () => {
    await startReady();
    window.dispatchEvent(new Event('touchstart'));
    await runIdle();
    expect(builds).toEqual([]);
    clock += 5000; // dedo ainda em baixo
    await runIdle();
    expect(builds).toEqual([]);
    window.dispatchEvent(new Event('touchend'));
    await runIdle();
    expect(builds).toEqual([]); // acabou agora: espera o sossego
    clock += INTERACTION_QUIET_MS + 1;
    await runIdle();
    expect(builds).toEqual(['corrida|mes|0']);
    window.dispatchEvent(new Event('scroll'));
    await runIdle();
    expect(builds).toHaveLength(1);
    clock += INTERACTION_QUIET_MS + 1;
    await runIdle();
    expect(builds).toHaveLength(2);
  });

  it('espera pelas fatias de cada separador', async () => {
    useAppStore.setState({ dataPending: true, loadedSlices: { meals: true } });
    await startReady();
    while (idleQueue.length) await runIdle();
    expect(builds).toEqual(['nutricao|semana|0', 'nutricao|semana|-1']);
    // Chegam as corridas: entram na fila sozinhas.
    useAppStore.setState({ loadedSlices: { meals: true, training: true } });
    while (idleQueue.length) await runIdle();
    expect(builds.slice(2)).toEqual(['corrida|mes|0', 'hub|semana|0', 'corrida|mes|-1', 'hub|semana|-1']);
  });

  it('depois de uma seta prepara o período vizinho primeiro', async () => {
    await startReady();
    while (idleQueue.length) await runIdle();
    builds = [];
    usePeriodStore.getState().shift('nutricao', -1); // agora -1 (já preparado)
    expect(preparer.pending()[0]).toBe('nutricao|semana|-2');
    while (idleQueue.length) await runIdle();
    expect(builds).toEqual(['nutricao|semana|-2']);
    // E para a frente: de -2 volta a -1; o vizinho seguinte (0) já existe.
    usePeriodStore.getState().shift('nutricao', -1);
    expect(preparer.pending()).toEqual(['nutricao|semana|-3']);
  });

  it('dados novos: refaz só o que depende deles, e o render acerta na cache', async () => {
    await startReady();
    while (idleQueue.length) await runIdle();
    builds = [];
    const runs = [...useAppStore.getState().runs, { id: 'r2', date: '2026-10-03', distance_km: 8 }];
    useAppStore.setState({ runs });
    while (idleQueue.length) await runIdle();
    expect(builds).toHaveLength(6); // todos dependem de runs neste exemplo
    const deps = [runs, useAppStore.getState().meals];
    expect(isEvolutionViewCached('corrida', { kind: 'mes', offset: 0 }, deps, day)).toBe(true);
    const before = evolutionCacheStats().builds;
    expect(getEvolutionView('corrida', { kind: 'mes', offset: 0 }, deps, day).n).toBe(2);
    expect(evolutionCacheStats().builds).toBe(before);
  });

  it('mudança de dia (regresso à app) prepara tudo de novo', async () => {
    await startReady();
    while (idleQueue.length) await runIdle();
    builds = [];
    day = '2026-10-05';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(preparer.pending()).toHaveLength(6);
    while (idleQueue.length) await runIdle();
    expect(builds).toHaveLength(6);
  });

  it('uma vista que rebenta não pára as outras nem se repete', async () => {
    registerEvolutionView('hub', { slices: ['runs'], deps: (s) => [s.runs], build: () => { throw new Error('x'); } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await startReady();
    while (idleQueue.length) await runIdle();
    expect(builds).toEqual(['corrida|mes|0', 'nutricao|semana|0', 'corrida|mes|-1', 'nutricao|semana|-1']);
    useAppStore.setState({ lastDashboardTab: 'nutricao' }); // muda a assinatura, refaz a fila
    expect(preparer.pending()).toEqual([]);
    warn.mockRestore();
  });

  it('stop cancela o pedido pendente e deixa de reagir', async () => {
    await startReady();
    preparer.stop();
    expect(globalThis.cancelIdleCallback).toHaveBeenCalled();
    useAppStore.setState({ runs: [] });
    usePeriodStore.getState().shift('corrida', -1);
    expect(preparer.pending()).toEqual([]);
  });

  /* Revisão 2026-10-04: as impressões digitais só se calculam aqui, em tempo
     morto, retomáveis linha a linha; o render nunca as calcula. */
  const bigRuns = (n = 100) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, date: '2026-09-01', distance_km: i % 9, laps: [{ km: 1, s: 300 + i }] }));
  const MES = { kind: 'mes', offset: 0 };
  function onlyCorrida(runs) {
    resetEvolutionRegistry();
    register('corrida', ['runs']);
    useAppStore.setState({ runs, meals: [] });
  }
  // Uma fatia que acaba ao fim de `calls` consultas ao timeRemaining.
  const shortSlice = (calls) => { let n = 0; return () => (n++ < calls ? 50 : 0); };

  it('vista feita no render (sem impressões): tarefa de primar no fim da fila, e a recarga seguinte acerta sem refazer', async () => {
    const runs = bigRuns();
    onlyCorrida(runs);
    const meals = useAppStore.getState().meals;
    const inRender = getEvolutionView('corrida', MES, [runs, meals], day); // o separador abriu antes
    builds = [];
    expect(evolutionCacheStats().hashed).toBe(0);
    await startReady();
    expect(preparer.pending()).toEqual(['corrida|mes|-1', 'corrida|mes|0|primar']);
    while (idleQueue.length) await runIdle();
    expect(builds).toEqual(['corrida|mes|-1']); // a do render não se refez
    expect(hasFingerprint(runs) && hasFingerprint(meals)).toBe(true);
    expect(preparer.pending()).toEqual([]);
    // Recarga com lista nova e o mesmo conteúdo (o sameList do store desistiu):
    const reloaded = bigRuns();
    useAppStore.setState({ runs: reloaded });
    while (idleQueue.length) await runIdle();
    expect(builds).toEqual(['corrida|mes|-1']); // nada refeito
    expect(evolutionCacheStats().fingerprintHits).toBe(2);
    expect(isEvolutionViewCached('corrida', MES, [reloaded, meals], day)).toBe(true);
    expect(getEvolutionView('corrida', MES, [reloaded, meals], day)).toBe(inRender);
  });

  it('a impressão cede A MEIO quando a fatia acaba (remaining < 1) e retoma na seguinte', async () => {
    const runs = bigRuns();
    onlyCorrida(runs);
    const meals = useAppStore.getState().meals;
    await startReady();
    while (idleQueue.length) await runIdle({ remaining: shortSlice(12) }); // deixa as duas vistas feitas
    builds = [];
    const reloaded = bigRuns();
    useAppStore.setState({ runs: reloaded });
    // Fatia curta: ~10 linhas e cede, sem refazer nem acabar a impressão.
    await runIdle({ remaining: shortSlice(12) });
    expect(builds).toEqual([]);
    expect(hasFingerprint(reloaded)).toBe(false);
    expect(idleQueue).toHaveLength(1); // volta a pedir tempo morto
    let slices = 1;
    while (idleQueue.length) { await runIdle({ remaining: shortSlice(12) }); slices++; }
    expect(slices).toBeGreaterThan(5);
    expect(builds).toEqual([]); // acerto por impressão nas duas
    expect(isEvolutionViewCached('corrida', MES, [reloaded, meals], day)).toBe(true);
  });

  it('lista com outro comprimento: refaz logo, sem primar a antiga antes', async () => {
    const runs = bigRuns();
    onlyCorrida(runs);
    getEvolutionView('corrida', MES, [runs, useAppStore.getState().meals], day); // render, sem impressões
    await startReady();
    while (idleQueue.length) await runIdle({ remaining: shortSlice(3) });
    builds = [];
    useAppStore.setState({ runs: [...runs, { id: 'novo', date: '2026-10-03', distance_km: 5 }] });
    await runIdle({ remaining: shortSlice(1) }); // fatia mínima: só passa a barreira
    expect(builds).toEqual(['corrida|mes|0']);
  });

  it('chamada forçada (didTimeout): as impressões param ao fim do orçamento', async () => {
    const runs = bigRuns();
    onlyCorrida(runs);
    getEvolutionView('corrida', MES, [runs, useAppStore.getState().meals], day);
    makePreparer({ now: () => (clock += 1) }).start(); // cada leitura do relógio = 1 ms
    await runIdle(); // carrega as vistas
    await flushPromises();
    while (idleQueue.length) await runIdle();
    builds = [];
    const reloaded = bigRuns();
    useAppStore.setState({ runs: reloaded });
    await runIdle({ remaining: 0, didTimeout: true });
    expect(hasFingerprint(reloaded)).toBe(false); // ~10 linhas e parou
    expect(builds).toEqual([]);
    while (idleQueue.length) await runIdle({ remaining: 0, didTimeout: true });
    expect(builds).toEqual([]);
    expect(isEvolutionViewCached('corrida', MES, [reloaded, useAppStore.getState().meals], day)).toBe(true);
  });

  it('sem requestIdleCallback: a fatia fictícia de FALLBACK_BUDGET_MS também corta a impressão', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    const runs = bigRuns();
    onlyCorrida(runs);
    getEvolutionView('corrida', MES, [runs, useAppStore.getState().meals], day);
    builds = [];
    let t = 0;
    makePreparer({ now: () => (t += 0.5) }).start(); // o relógio anda 0,5 ms por leitura
    await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS); // carrega as vistas
    for (let i = 0; i < 100 && preparer.isScheduled(); i++) await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS);
    expect(builds).toEqual(['corrida|mes|-1']);
    expect(preparer.isScheduled()).toBe(false);
    const reloaded = bigRuns();
    useAppStore.setState({ runs: reloaded });
    await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS);
    expect(hasFingerprint(reloaded)).toBe(false); // uma fatia não chegou
    let slices = 1;
    while (preparer.isScheduled() && slices < 200) { await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS); slices++; }
    expect(slices).toBeGreaterThan(3);
    expect(builds).toEqual(['corrida|mes|-1']); // acertou por impressão
    expect(isEvolutionViewCached('corrida', MES, [reloaded, useAppStore.getState().meals], day)).toBe(true);
  });

  it('sem requestIdleCallback usa setTimeout com atraso maior', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    makePreparer({ now: () => Date.now() }).start();
    await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS - 1);
    expect(builds).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); // carrega as vistas
    await vi.advanceTimersByTimeAsync(FALLBACK_DELAY_MS);
    expect(builds).toEqual(['corrida|mes|0']);
  });
});
