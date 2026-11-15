import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

/* O service worker (public/sw.js) com uma cache e uma rede de mentira (bug #97): os ficheiros com
   hash de /assets/ servem-se da cache depois da primeira vez; o index.html e o version.json vão
   SEMPRE à rede — é por eles que uma versão nova chega —; e mudar de versão limpa as antigas. */

const SCOPE = 'https://app.pt/ironcoach/';
const SRC = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');

function fakeCaches() {
  const stores = new Map();
  const keyOf = (r) => (typeof r === 'string' ? new URL(r, SCOPE + 'sw.js').href : r.url);
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (r) => { const v = m.get(keyOf(r)); return v ? v.clone() : undefined; },
      put: async (r, res) => { m.set(keyOf(r), res.clone()); },
      delete: async (r) => m.delete(keyOf(r)),
      keys: async () => [...m.keys()].map((url) => ({ url })),
    };
  };
  return { open, stores };
}

function loadSw({ caches = fakeCaches() } = {}) {
  const listeners = {};
  const fetch = vi.fn(async (req) => {
    const url = typeof req === 'string' ? req : req.url;
    const r = new Response(`conteúdo de ${url}`, { status: 200 });
    Object.defineProperty(r, 'type', { value: 'basic' });
    return r;
  });
  const self = {
    registration: { scope: SCOPE, showNotification: vi.fn(), pushManager: {} },
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => []) },
    skipWaiting: vi.fn(),
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  vm.runInNewContext(SRC, { self, caches, fetch, Response, Headers, URL, atob, Uint8Array, console });
  const doFetch = async (url) => {
    let p = null;
    const later = [];
    listeners.fetch({ request: { url, method: 'GET' }, respondWith: (x) => { p = x; }, waitUntil: (x) => { later.push(x); } });
    if (!p) return { fromSw: false, res: await fetch(url) };
    const res = await p;
    await Promise.all(later); // a cópia para a cache faz-se depois da resposta
    return { fromSw: true, res };
  };
  const message = async (data) => {
    let p = Promise.resolve();
    listeners.message({ data, waitUntil: (x) => { p = x; } });
    await p;
  };
  // A resposta sem esperar pelos waitUntil.
  const respond = async (url) => {
    let p = null;
    listeners.fetch({ request: { url, method: 'GET' }, respondWith: (x) => { p = x; }, waitUntil: () => {} });
    return p;
  };
  return { doFetch, message, fetch, caches, respond };
}

describe('service worker — cache dos ficheiros com hash (bug #97)', () => {
  let sw;
  beforeEach(() => { sw = loadSw(); });

  it('um ficheiro com hash vai à rede na primeira vez e depois sai da cache', async () => {
    const url = SCOPE + 'assets/index-BIGtwyoQ.js';
    await sw.doFetch(url);
    await sw.doFetch(url);
    expect(sw.fetch).toHaveBeenCalledTimes(1);
    expect(await (await sw.doFetch(url)).res.text()).toBe(`conteúdo de ${url}`);
  });

  it('o index.html, o version.json e a raiz nunca passam pela cache — uma versão nova chega sempre', async () => {
    for (const url of [SCOPE, SCOPE + 'index.html', SCOPE + 'version.json?t=1', SCOPE + '?v=AbC']) {
      const { fromSw } = await sw.doFetch(url);
      expect(fromSw).toBe(false);
    }
    // O index novo aponta para nomes novos: a cache não os tem e vão à rede.
    await sw.doFetch(SCOPE + 'assets/index-AAAAAAAA.js');
    await sw.doFetch(SCOPE + 'assets/index-BBBBBBBB.js');
    expect(sw.fetch).toHaveBeenCalledTimes(2 + 4);
  });

  it('não guarda o que não tem hash, nem de outra origem, nem com query', async () => {
    for (const url of [SCOPE + 'assets/logo.png', 'https://outro.pt/ironcoach/assets/a-AbCdEf12.js', SCOPE + 'assets/a-AbCdEf12.js?x=1', SCOPE + 'icon-192.png']) {
      expect((await sw.doFetch(url)).fromSw).toBe(false);
    }
  });

  it('mudar de versão apaga as entradas de versões antigas e guarda a atual e a anterior', async () => {
    await sw.message({ type: 'app-build', build: 'v1', inUse: [] });
    await sw.doFetch(SCOPE + 'assets/a-11111111.js'); // entra como v1
    await sw.message({ type: 'app-build', build: 'v2', inUse: [] });
    await sw.doFetch(SCOPE + 'assets/b-22222222.js'); // entra como v2
    await sw.message({ type: 'app-build', build: 'v3', inUse: [SCOPE + 'assets/b-22222222.js'] });
    sw.fetch.mockClear();
    await sw.doFetch(SCOPE + 'assets/b-22222222.js'); // ainda na cache (v2 = anterior, e em uso)
    expect(sw.fetch).not.toHaveBeenCalled();
    await sw.doFetch(SCOPE + 'assets/a-11111111.js'); // v1 foi limpa: volta à rede
    expect(sw.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('service worker — a cache nunca impede a app de arrancar', () => {
  it('se o CacheStorage rebentar, o ficheiro vem da rede na mesma', async () => {
    const broken = { open: async () => { throw new Error('QuotaExceededError'); } };
    const sw = loadSw({ caches: broken });
    const { fromSw, res } = await sw.doFetch(SCOPE + 'assets/index-BIGtwyoQ.js');
    expect(fromSw).toBe(true);
    expect(res.status).toBe(200);
    expect(sw.fetch).toHaveBeenCalledTimes(1);
  });

  it('se o match rebentar (cache estragada), também vai à rede', async () => {
    const bad = { open: async () => ({ match: async () => { throw new Error('corrupt'); }, put: async () => {}, keys: async () => [], delete: async () => false }) };
    const sw = loadSw({ caches: bad });
    expect((await sw.doFetch(SCOPE + 'assets/index-BIGtwyoQ.js')).res.status).toBe(200);
  });

  it('a resposta da rede devolve-se sem esperar pela cópia para a cache (que vai em waitUntil)', async () => {
    const base = fakeCaches();
    const slow = { open: async (n) => { const c = await base.open(n); return { ...c, put: () => new Promise(() => {}) }; } };
    const sw = loadSw({ caches: slow });
    // Chama o handler à mão: a resposta tem de chegar com o put ainda por acabar.
    const reqUrl = SCOPE + 'assets/index-BIGtwyoQ.js';
    const res = await sw.respond(reqUrl);
    expect(res.status).toBe(200);
    // Se a resposta esperasse pela cópia, este pedido nunca acabava (o put fica pendurado).
  });
});
