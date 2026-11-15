import { describe, it, expect, vi } from 'vitest';
import { announceBuildToServiceWorker, assetsInUse } from './assetCache';

describe('assetCache — a versão e os ficheiros em uso vão para o service worker (bug #97)', () => {
  const perf = { getEntriesByType: () => [{ name: 'https://x.pt/assets/index-AbCdEf12.js' }, { name: 'https://x.pt/version.json' }] };

  it('só os de /assets/', () => {
    expect(assetsInUse(perf)).toEqual(['https://x.pt/assets/index-AbCdEf12.js']);
    expect(assetsInUse(null)).toEqual([]);
  });

  it('manda a versão e os ficheiros ao service worker ativo', async () => {
    const postMessage = vi.fn();
    const sw = { ready: Promise.resolve({ active: { postMessage } }), controller: null };
    expect(await announceBuildToServiceWorker({ build: 'AbCdEf12', sw, perf })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'app-build', build: 'AbCdEf12', inUse: ['https://x.pt/assets/index-AbCdEf12.js'] });
  });

  it('sem versão (desenvolvimento) ou sem service worker não manda nada', async () => {
    expect(await announceBuildToServiceWorker({ build: '', sw: { ready: Promise.resolve({}) }, perf })).toBe(false);
    expect(await announceBuildToServiceWorker({ build: 'x', sw: undefined, perf })).toBe(false);
  });
});
