import { describe, it, expect, beforeEach } from 'vitest';
import {
  BOOT_TRACE_KEY, BOOT_TRACE_MAX, bootPhase, bootExit, bootTraceStart, readBootTraces,
  previousUnfinishedTrace, markTraceReported, currentBootTrace, resetBootTrace,
} from './bootTrace';
import { withDeadline } from './bootDeadline';

describe('bootTrace — o rasto do arranque', () => {
  beforeEach(() => {
    localStorage.clear();
    resetBootTrace();
    delete window.__bootTraceAt;
  });

  it('adota o rasto que o index.html abriu, e regista as fases e a saída (só a primeira)', () => {
    window.__bootTraceAt = 111;
    localStorage.setItem(BOOT_TRACE_KEY, JSON.stringify([{ at: 111, p: { html: 40 }, exit: null }]));
    bootPhase('main', { ms: 300 });
    bootPhase('main', { ms: 999 });
    bootPhase('session-start', { ms: 500 });
    bootExit('app', { ms: 2600 });
    bootExit('deadline', { ms: 15000 });
    expect(currentBootTrace()).toEqual({ at: 111, p: { html: 40, main: 300, 'session-start': 500, exit: 2600 }, exit: 'app' });
  });

  it('sem o rasto do index.html, abre um', () => {
    bootPhase('main', { ms: 10 });
    const t = currentBootTrace();
    expect(t.p).toMatchObject({ html: 0, main: 10 });
    expect(readBootTraces()).toHaveLength(1);
  });

  it('um arranque anterior sem saída é o «preso»; marcado, já não volta', () => {
    localStorage.setItem(BOOT_TRACE_KEY, JSON.stringify([
      { at: 1, p: { html: 30, main: 400, 'session-start': 600 }, exit: null },
    ]));
    bootTraceStart({ at: 2 });
    window.__bootTraceAt = 2;
    resetBootTrace();
    const stuck = previousUnfinishedTrace();
    expect(stuck).toMatchObject({ at: 1, exit: null });
    markTraceReported(1);
    expect(previousUnfinishedTrace()).toBeNull();
  });

  it('guarda só os últimos', () => {
    for (let i = 0; i < BOOT_TRACE_MAX + 3; i += 1) bootTraceStart({ at: i });
    expect(readBootTraces()).toHaveLength(BOOT_TRACE_MAX);
    expect(readBootTraces()[0].at).toBe(3);
  });

  it('withDeadline: rejeita com TimeoutError se não acabar a tempo', async () => {
    await expect(withDeadline(new Promise(() => {}), 20, 'import')).rejects.toMatchObject({ name: 'TimeoutError' });
    await expect(withDeadline(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});
