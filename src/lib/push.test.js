import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { supabase } from './supabase';
import {
  VAPID_PUBLIC_KEY, SYNC_INTERVAL_MS, SYNC_RETRY_MS, syncPushSubscription, maybeSyncPushSubscription,
  pushWantedFor, resetPushSyncThrottle, forgetPushSubscriptionOnThisDevice,
} from './push';

/* A subscrição repara-se sozinha (2026-09-28): a 28/09 o serviço de push deu
   as duas subscrições por mortas (404/410), o tick apagou-as — como deve — e
   ninguém voltou a receber notificações, porque a app só gravava a subscrição
   no interruptor do Perfil. */

const functionsProto = Object.getPrototypeOf(supabase.functions);
// Raiz do projeto (a do vitest): em jsdom o import.meta.url não é file://.
const swSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

function keyBytes(b64 = VAPID_PUBLIC_KEY) {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function fakeSub(endpoint, key = keyBytes()) {
  return {
    endpoint,
    options: { applicationServerKey: key.buffer },
    unsubscribe: vi.fn(async () => true),
    toJSON: () => ({ endpoint, keys: { p256dh: `p-${endpoint}`, auth: `a-${endpoint}` } }),
  };
}

function fakeRegistration(current) {
  const reg = {
    pushManager: {
      getSubscription: vi.fn(async () => current),
      subscribe: vi.fn(async () => fakeSub('https://push.example/novo')),
    },
  };
  return reg;
}

/** A leitura de push_subscriptions (RLS: só as do próprio). */
function mockServerRow(result) {
  const maybeSingle = vi.fn(async () => result);
  const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle };
  vi.spyOn(supabase, 'from').mockReturnValue(chain);
  return chain;
}

let invoke;
let requestPermission;
let getSession;
function installBrowser({ permission = 'granted', reg, sessionUserId = U }) {
  getSession = vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
    data: { session: sessionUserId ? { user: { id: sessionUserId } } : null }, error: null,
  });
  requestPermission = vi.fn(async () => permission);
  vi.stubGlobal('Notification', { permission, requestPermission });
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(reg) }, configurable: true,
  });
  invoke = vi.spyOn(functionsProto, 'invoke').mockResolvedValue({ data: { ok: true }, error: null });
}

const U = 'u1';

beforeEach(() => {
  resetPushSyncThrottle();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.navigator.serviceWorker;
});

describe('a chave VAPID', () => {
  it('é a mesma no service worker e na app — uma divergência dava subscrições que o servidor não consegue usar', () => {
    const match = swSource.match(/const VAPID_PUBLIC_KEY = '([^']+)'/);
    expect(match?.[1]).toBe(VAPID_PUBLIC_KEY);
  });
});

describe('pushWantedFor', () => {
  const session = { user: { id: 'u1' } };
  it('dá o id de quem quer notificações: sessão real, o perfil dele carregado, a Carol ou a água ligadas', () => {
    expect(pushWantedFor({ session, profile: { id: 'u1', carol_push_enabled: true } })).toBe('u1');
    expect(pushWantedFor({ session, profile: { id: 'u1', water_reminder_enabled: true } })).toBe('u1');
    expect(pushWantedFor({ session, profile: { id: 'u1' } })).toBeNull();
    expect(pushWantedFor({ session, profile: null })).toBeNull();
    expect(pushWantedFor({ session: null, profile: { id: 'u1', carol_push_enabled: true } })).toBeNull();
    expect(pushWantedFor({ session: { user: { id: 'demo-user' } }, profile: { id: 'demo-user', carol_push_enabled: true } })).toBeNull();
    // O perfil ainda é o da conta anterior (troca de conta a meio): espera.
    expect(pushWantedFor({ session, profile: { id: 'u0', carol_push_enabled: true } })).toBeNull();
  });
});

describe('syncPushSubscription', () => {
  it('desligado no perfil, ou sem suporte no browser, não faz nada', async () => {
    expect(await syncPushSubscription({ enabled: false, userId: U })).toBe('off');
    expect(await syncPushSubscription({ enabled: true, userId: null })).toBe('off');
    // jsdom sem PushManager nem service worker: sem suporte.
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('off');
  });

  it('sem a permissão já dada, nunca a pede — isso é só no Perfil, com um toque', async () => {
    installBrowser({ permission: 'default', reg: fakeRegistration(null) });
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('no-permission');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('o servidor ainda tem a subscrição deste browser: não escreve nada', async () => {
    const sub = fakeSub('https://push.example/antigo');
    const reg = fakeRegistration(sub);
    installBrowser({ reg });
    const chain = mockServerRow({ data: { id: 's1' }, error: null });
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('in-sync');
    // Só as linhas DELE: a política 'admin read all' deixava um admin ver a de outro.
    expect(chain.eq).toHaveBeenCalledWith('user_id', U);
    expect(chain.eq).toHaveBeenCalledWith('endpoint', 'https://push.example/antigo');
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('o servidor apagou-a (morta, 404/410): renova — a mesma voltava a falhar — e grava a nova', async () => {
    const sub = fakeSub('https://push.example/antigo');
    const reg = fakeRegistration(sub);
    installBrowser({ reg });
    mockServerRow({ data: null, error: null });
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('renewed');
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(reg.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(invoke).toHaveBeenCalledWith('save-push-subscription', expect.objectContaining({
      body: { endpoint: 'https://push.example/novo', keys: { p256dh: 'p-https://push.example/novo', auth: 'a-https://push.example/novo' } },
    }));
  });

  it('sem subscrição no browser, com a permissão dada: subscreve e grava', async () => {
    const reg = fakeRegistration(null);
    installBrowser({ reg });
    const from = vi.spyOn(supabase, 'from');
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('renewed');
    expect(from).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('uma leitura falhada não troca uma subscrição que pode estar boa', async () => {
    const sub = fakeSub('https://push.example/antigo');
    const reg = fakeRegistration(sub);
    installBrowser({ reg });
    mockServerRow({ data: null, error: { message: 'rede' } });
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('read-failed');
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  /* Revisão adversarial: sem sessão (refresh falhado, logout global noutro
     dispositivo) o PostgREST responde vazio e SEM erro — parecia "o servidor
     apagou-a" e trocava-se uma subscrição boa por uma que nem se gravava. */
  it('sem a sessão deste atleta no cliente, não lê nem mexe em nada', async () => {
    for (const sessionUserId of [null, 'outro']) {
      const sub = fakeSub('https://push.example/antigo');
      const reg = fakeRegistration(sub);
      installBrowser({ reg, sessionUserId });
      const from = vi.spyOn(supabase, 'from');
      expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('no-session');
      expect(from).not.toHaveBeenCalled();
      expect(sub.unsubscribe).not.toHaveBeenCalled();
      expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('presa a uma chave VAPID antiga: renova sem perguntar ao servidor', async () => {
    const sub = fakeSub('https://push.example/antigo', keyBytes('AAAA'));
    const reg = fakeRegistration(sub);
    installBrowser({ reg });
    const from = vi.spyOn(supabase, 'from');
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('renewed');
    expect(from).not.toHaveBeenCalled();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('o browser recusa subscrever sem um toque (iOS): não rebenta, fica o Perfil', async () => {
    const reg = fakeRegistration(null);
    reg.pushManager.subscribe.mockRejectedValue(new Error('NotAllowedError'));
    installBrowser({ reg });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('error');
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('maybeSyncPushSubscription', () => {
  it('no máximo de 6 em 6 horas; o aviso do service worker passa à frente', async () => {
    const reg = fakeRegistration(fakeSub('https://push.example/antigo'));
    installBrowser({ reg });
    mockServerRow({ data: { id: 's1' }, error: null });
    const t0 = 1_000_000;
    expect(await maybeSyncPushSubscription({ enabled: true, userId: U, now: t0 })).toBe('in-sync');
    expect(await maybeSyncPushSubscription({ enabled: true, userId: U, now: t0 + 60_000 })).toBe('throttled');
    expect(await maybeSyncPushSubscription({ enabled: true, userId: U, now: t0 + 60_000, force: true })).toBe('in-sync');
    expect(await maybeSyncPushSubscription({ enabled: true, userId: U, now: t0 + 60_000 + SYNC_INTERVAL_MS })).toBe('in-sync');
    expect(await maybeSyncPushSubscription({ enabled: false, userId: U, now: t0 + 2 * SYNC_INTERVAL_MS })).toBe('off');
  });

  it('é por atleta: outra conta no mesmo telemóvel não herda a marca da anterior', async () => {
    const reg = fakeRegistration(fakeSub('https://push.example/antigo'));
    installBrowser({ reg, sessionUserId: 'u2' });
    mockServerRow({ data: { id: 's2' }, error: null });
    const t0 = 1_000_000;
    // u1 ficou marcado (a sessão já é de u2: não mexe em nada, mas marca)
    await maybeSyncPushSubscription({ enabled: true, userId: U, now: t0 });
    expect(await maybeSyncPushSubscription({ enabled: true, userId: 'u2', now: t0 + 1000 })).toBe('in-sync');
  });

  it('uma tentativa falhada volta a tentar daqui a 5 minutos, não daqui a 6 horas', async () => {
    const reg = fakeRegistration(fakeSub('https://push.example/antigo'));
    installBrowser({ reg });
    mockServerRow({ data: null, error: { message: 'sem rede' } });
    const t0 = 1_000_000;
    expect(await maybeSyncPushSubscription({ enabled: true, userId: U, now: t0 })).toBe('read-failed');
    expect(await maybeSyncPushSubscription({ enabled: true, userId: U, now: t0 + SYNC_RETRY_MS - 1 })).toBe('throttled');
    expect(await maybeSyncPushSubscription({ enabled: true, userId: U, now: t0 + SYNC_RETRY_MS })).toBe('read-failed');
  });
});

describe('forgetPushSubscriptionOnThisDevice', () => {
  it('apaga a linha deste endpoint no servidor, antes de a sessão acabar', async () => {
    const reg = fakeRegistration(fakeSub('https://push.example/antigo'));
    installBrowser({ reg });
    await forgetPushSubscriptionOnThisDevice();
    expect(invoke).toHaveBeenCalledWith('save-push-subscription', {
      method: 'DELETE', body: { endpoint: 'https://push.example/antigo' },
    });
  });

  it('nunca atrasa a saída mais do que o limite, nem a impede se falhar', async () => {
    const reg = fakeRegistration(fakeSub('https://push.example/antigo'));
    installBrowser({ reg });
    invoke.mockImplementation(() => new Promise(() => {}));
    const t = Date.now();
    await forgetPushSubscriptionOnThisDevice({ timeoutMs: 30 });
    expect(Date.now() - t).toBeLessThan(1000);
    invoke.mockRejectedValue(new Error('rede'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(forgetPushSubscriptionOnThisDevice({ timeoutMs: 30 })).resolves.toBeUndefined();
  });

  it('sem suporte ou sem subscrição, não faz nada', async () => {
    await expect(forgetPushSubscriptionOnThisDevice()).resolves.toBeUndefined();
    installBrowser({ reg: fakeRegistration(null) });
    await forgetPushSubscriptionOnThisDevice();
    expect(invoke).not.toHaveBeenCalled();
  });
});

/* O service worker corre fora do React: carrega-se o ficheiro tal como o
   browser o carrega, com um `self` falso, e dispara-se o evento. */
function loadServiceWorker({ current = null, clients = [] } = {}) {
  const listeners = {};
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: vi.fn(),
    registration: {
      pushManager: {
        getSubscription: vi.fn(async () => current),
        subscribe: vi.fn(async () => fakeSub('https://push.example/novo')),
      },
      showNotification: vi.fn(),
      scope: 'https://app.example/',
    },
    clients: { matchAll: vi.fn(async () => clients), claim: vi.fn(), openWindow: vi.fn() },
  };
  new Function('self', 'atob', swSource)(self, atob);
  return { self, listeners };
}

async function fire(listener, event) {
  let pending;
  listener({ ...event, waitUntil: (p) => { pending = p; } });
  await pending;
}

describe('sw.js — pushsubscriptionchange', () => {
  it('sem subscrição nova, renova com a chave antiga e avisa a app aberta para a gravar', async () => {
    const client = { postMessage: vi.fn() };
    const { self, listeners } = loadServiceWorker({ clients: [client] });
    const oldKey = keyBytes().buffer;
    await fire(listeners.pushsubscriptionchange, { oldSubscription: { options: { applicationServerKey: oldKey } } });
    expect(self.registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: oldKey });
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'push-subscription-changed' });
  });

  it('sem a subscrição antiga (Chrome), usa a chave da app', async () => {
    const { self, listeners } = loadServiceWorker();
    await fire(listeners.pushsubscriptionchange, { oldSubscription: null });
    const { applicationServerKey } = self.registration.pushManager.subscribe.mock.calls[0][0];
    expect(Array.from(applicationServerKey)).toEqual(Array.from(keyBytes()));
  });

  it('o browser já deu a nova (Firefox), ou já há uma: não subscreve outra vez', async () => {
    const withNew = loadServiceWorker();
    await fire(withNew.listeners.pushsubscriptionchange, { newSubscription: fakeSub('https://push.example/novo') });
    expect(withNew.self.registration.pushManager.subscribe).not.toHaveBeenCalled();

    const already = loadServiceWorker({ current: fakeSub('https://push.example/ja') });
    await fire(already.listeners.pushsubscriptionchange, { oldSubscription: null });
    expect(already.self.registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('sem permissão ou sem rede, não rebenta: a app tenta ao abrir', async () => {
    const client = { postMessage: vi.fn() };
    const { self, listeners } = loadServiceWorker({ clients: [client] });
    self.registration.pushManager.subscribe.mockRejectedValue(new Error('NotAllowedError'));
    await fire(listeners.pushsubscriptionchange, { oldSubscription: null });
    expect(client.postMessage).toHaveBeenCalledWith({ type: 'push-subscription-changed' });
  });
});
