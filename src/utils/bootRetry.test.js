import { describe, it, expect, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { clearRefreshFailureCache, createBootRetry, probeNetwork } from './bootRetry';

/* Revisão do 0c1a88af (2026-11-09): o retry do arranque sem rede confirma a rede antes, esquece o
   refresh falhado que o auth-js guarda 60 s, e corre um de cada vez. */
describe('probeNetwork', () => {
  it('qualquer resposta é rede; um fetch que falha não é', async () => {
    const ok = vi.fn(async () => ({ ok: false, status: 404 }));
    expect(await probeNetwork({ fetchImpl: ok, base: '/' })).toBe(true);
    expect(ok.mock.calls[0][0]).toMatch(/^\/version\.json\?t=\d+$/);
    expect(ok.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
    expect(await probeNetwork({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } })).toBe(false);
    expect(await probeNetwork({ fetchImpl: null })).toBe(false);
  });
});

describe('clearRefreshFailureCache', () => {
  it('o GoTrueClient desta versão tem lastRefreshFailure — e limpa-se (se uma atualização a tirar, este teste falha)', () => {
    const client = createClient('http://localhost:54321', 'anon', { auth: { persistSession: false, autoRefreshToken: false } });
    expect(Object.prototype.hasOwnProperty.call(client.auth, 'lastRefreshFailure')).toBe(true);
    client.auth.lastRefreshFailure = { refreshToken: 'rt', result: {}, expiresAt: Date.now() + 60000 };
    expect(clearRefreshFailureCache(client.auth)).toBe(true);
    expect(client.auth.lastRefreshFailure).toBeNull();
    expect(clearRefreshFailureCache({})).toBe(false);
  });
});

describe('createBootRetry', () => {
  it('sem rede não tenta nem limpa; com rede limpa o cooldown e tenta', async () => {
    const clearCooldown = vi.fn();
    const attempt = vi.fn(async () => {});
    const busy = [];
    let online = false;
    const r = createBootRetry({ probe: async () => online, clearCooldown, attempt, onBusy: (b) => busy.push(b) });
    expect(await r.run()).toBe('offline');
    expect(attempt).not.toHaveBeenCalled();
    expect(clearCooldown).not.toHaveBeenCalled();
    online = true;
    expect(await r.run()).toBe('attempted');
    expect(clearCooldown).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(clearCooldown.mock.invocationCallOrder[0]).toBeLessThan(attempt.mock.invocationCallOrder[0]);
    expect(busy).toEqual([true, false, true, false]);
  });

  it('uma só tentativa de cada vez: o botão, o online e o temporizador partilham-na', async () => {
    let release;
    const probe = vi.fn(() => new Promise((r) => { release = r; }));
    const attempt = vi.fn(async () => {});
    const r = createBootRetry({ probe, clearCooldown: () => {}, attempt });
    const a = r.run();
    const b = r.run();
    const c = r.run();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(r.isBusy()).toBe(true);
    release(true);
    await a;
    expect(probe).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(r.isBusy()).toBe(false);
  });
});
