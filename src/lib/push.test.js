import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { supabase } from './supabase';
import {
  VAPID_PUBLIC_KEY, SYNC_INTERVAL_MS, SYNC_RETRY_MS, syncPushSubscription, maybeSyncPushSubscription,
  pushWantedFor, resetPushSyncThrottle, forgetPushSubscriptionOnThisDevice, ensurePushSubscription,
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
function installBrowser({ permission = 'granted', reg, sessionUserId = U, optIn = true }) {
  if (optIn) window.localStorage.setItem(`ironcoach:push-optin:${U}`, '1');
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
  window.localStorage.clear();
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

  /* Segunda revisão adversarial: a permissão é do site inteiro e o
     interruptor é da conta — num tablet partilhado, a reparação inscrevia
     quem entrasse a seguir, com a permissão que outra pessoa deu. */
  it('só repara onde o atleta ligou as notificações neste dispositivo', async () => {
    const sub = fakeSub('https://push.example/antigo');
    const reg = fakeRegistration(sub);
    installBrowser({ reg, optIn: false });
    mockServerRow({ data: null, error: null });
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('not-opted-in');
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('um telemóvel de antes desta versão, com a linha no servidor, fica reconhecido como seu', async () => {
    const reg = fakeRegistration(fakeSub('https://push.example/antigo'));
    installBrowser({ reg, optIn: false });
    mockServerRow({ data: { id: 's1' }, error: null });
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('in-sync');
    expect(window.localStorage.getItem(`ironcoach:push-optin:${U}`)).toBe('1');
  });

  it('a que o service worker acabou de renovar grava-se tal como está, sem a trocar', async () => {
    const sub = fakeSub('https://push.example/renovada');
    const reg = fakeRegistration(sub);
    installBrowser({ reg });
    mockServerRow({ data: null, error: null });
    expect(await syncPushSubscription({ enabled: true, userId: U, fresh: true })).toBe('saved');
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('save-push-subscription', expect.objectContaining({
      body: expect.objectContaining({ endpoint: 'https://push.example/renovada' }),
    }));
  });

  it('a sessão acaba a meio da renovação: não grava a subscrição em nome de quem saiu', async () => {
    const reg = fakeRegistration(null);
    installBrowser({ reg });
    getSession
      .mockResolvedValueOnce({ data: { session: { user: { id: U } } }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await syncPushSubscription({ enabled: true, userId: U })).toBe('no-session');
    expect(invoke).not.toHaveBeenCalled();
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

/** O apagar direto em push_subscriptions (RLS: só as do próprio). */
function mockServerDelete(result = { error: null }) {
  const eq = vi.fn(async () => result);
  const del = vi.fn(() => ({ eq }));
  vi.spyOn(supabase, 'from').mockReturnValue({ delete: del });
  return { del, eq };
}

describe('uma verificação de cada vez, e nenhuma durante a saída', () => {
  it('um aviso do service worker a meio de uma verificação espera por ela', async () => {
    const order = [];
    const reg = fakeRegistration(null);
    let release;
    reg.pushManager.subscribe
      .mockImplementationOnce(() => new Promise((r) => { release = () => { order.push('1.º fim'); r(fakeSub('https://push.example/a')); }; }))
      .mockImplementationOnce(async () => { order.push('2.º começo'); return fakeSub('https://push.example/b'); });
    installBrowser({ reg });
    const first = maybeSyncPushSubscription({ enabled: true, userId: U, now: 1 });
    await vi.waitFor(() => expect(reg.pushManager.subscribe).toHaveBeenCalledTimes(1));
    const second = maybeSyncPushSubscription({ enabled: true, userId: U, force: true, now: 2 });
    await new Promise((r) => setTimeout(r, 10));
    expect(reg.pushManager.subscribe).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['1.º fim', '2.º começo']);
  });

  it('durante a saída, nenhuma verificação repõe a linha de quem está a sair', async () => {
    const reg = fakeRegistration(fakeSub('https://push.example/antigo'));
    installBrowser({ reg });
    vi.spyOn(supabase, 'from').mockReturnValue({ delete: () => ({ eq: () => new Promise(() => {}) }) });
    const forgetting = forgetPushSubscriptionOnThisDevice({ timeoutMs: 50 });
    expect(await maybeSyncPushSubscription({ enabled: true, userId: U, force: true, now: 1 })).toBe('off');
    await forgetting;
  });
});

describe('forgetPushSubscriptionOnThisDevice', () => {
  it('apaga a linha deste endpoint no servidor e cancela a subscrição do browser', async () => {
    const sub = fakeSub('https://push.example/antigo');
    installBrowser({ reg: fakeRegistration(sub) });
    const { eq } = mockServerDelete();
    await forgetPushSubscriptionOnThisDevice();
    expect(eq).toHaveBeenCalledWith('endpoint', 'https://push.example/antigo');
    expect(sub.unsubscribe).toHaveBeenCalled();
    // A marca de quem ligou as notificações aqui fica: ao voltar, repara-se.
    expect(window.localStorage.getItem(`ironcoach:push-optin:${U}`)).toBe('1');
  });

  it('se o apagar falhar (ou já não houver sessão), cancela na mesma: o endpoint morre e o servidor limpa-o', async () => {
    const sub = fakeSub('https://push.example/antigo');
    installBrowser({ reg: fakeRegistration(sub) });
    mockServerDelete({ error: { message: 'JWT expired' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await forgetPushSubscriptionOnThisDevice();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });

  it('nunca atrasa a saída mais do que o limite', async () => {
    const sub = fakeSub('https://push.example/antigo');
    installBrowser({ reg: fakeRegistration(sub) });
    vi.spyOn(supabase, 'from').mockReturnValue({ delete: () => ({ eq: () => new Promise(() => {}) }) });
    const t = Date.now();
    await forgetPushSubscriptionOnThisDevice({ timeoutMs: 30 });
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('espera por uma renovação a meio, para ela não gravar a linha de quem sai depois de apagada', async () => {
    const order = [];
    const reg = fakeRegistration(null);
    let finishSubscribe;
    reg.pushManager.subscribe.mockImplementation(() => new Promise((r) => { finishSubscribe = () => r(fakeSub('https://push.example/novo')); }));
    installBrowser({ reg });
    invoke.mockImplementation(async () => { order.push('save'); return { data: {}, error: null }; });
    const syncing = maybeSyncPushSubscription({ enabled: true, userId: U, now: 1 });
    await vi.waitFor(() => expect(reg.pushManager.subscribe).toHaveBeenCalled());
    reg.pushManager.getSubscription.mockResolvedValue(fakeSub('https://push.example/novo'));
    vi.spyOn(supabase, 'from').mockReturnValue({ delete: () => ({ eq: async () => { order.push('delete'); return { error: null }; } }) });
    const forgetting = forgetPushSubscriptionOnThisDevice({ timeoutMs: 2000 });
    finishSubscribe();
    await Promise.all([syncing, forgetting]);
    expect(order).toEqual(['save', 'delete']);
  });

  it('sem suporte ou sem subscrição, não faz nada', async () => {
    await expect(forgetPushSubscriptionOnThisDevice()).resolves.toBeUndefined();
    installBrowser({ reg: fakeRegistration(null) });
    const from = vi.spyOn(supabase, 'from');
    await forgetPushSubscriptionOnThisDevice();
    expect(from).not.toHaveBeenCalled();
  });
});

describe('ensurePushSubscription (o interruptor do Perfil)', () => {
  it('grava e deixa a marca de que foi neste dispositivo que o atleta as ligou', async () => {
    installBrowser({ reg: fakeRegistration(null), optIn: false });
    expect(await ensurePushSubscription()).toEqual({ ok: true, error: null });
    expect(window.localStorage.getItem(`ironcoach:push-optin:${U}`)).toBe('1');
  });

  it('endpoint ainda gravado em nome de outra conta (a RLS recusa): troca-o por um novo e grava', async () => {
    const sub = fakeSub('https://push.example/de-outro');
    const reg = fakeRegistration(sub);
    installBrowser({ reg, optIn: false });
    const rls = { error: 'new row violates row-level security policy (USING expression) for table "push_subscriptions"' };
    invoke
      .mockResolvedValueOnce({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status: 500, json: async () => rls } } })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect(await ensurePushSubscription()).toEqual({ ok: true, error: null });
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(invoke).toHaveBeenLastCalledWith('save-push-subscription', expect.objectContaining({
      body: expect.objectContaining({ endpoint: 'https://push.example/novo' }),
    }));
  });

  it('uma falha de rede ao gravar não cancela uma subscrição que está a funcionar (a da água, por exemplo)', async () => {
    const sub = fakeSub('https://push.example/da-agua');
    const reg = fakeRegistration(sub);
    installBrowser({ reg, optIn: false });
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await ensurePushSubscription()).ok).toBe(false);
    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(reg.pushManager.subscribe).not.toHaveBeenCalled();
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
  it('sem subscrição nova, renova com a chave ATUAL da app (nunca a antiga) e avisa a app aberta', async () => {
    const client = { postMessage: vi.fn() };
    const { self, listeners } = loadServiceWorker({ clients: [client] });
    const antiga = keyBytes('AAAA').buffer;
    await fire(listeners.pushsubscriptionchange, { oldSubscription: { options: { applicationServerKey: antiga } } });
    const { applicationServerKey } = self.registration.pushManager.subscribe.mock.calls[0][0];
    expect(Array.from(applicationServerKey)).toEqual(Array.from(keyBytes()));
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
