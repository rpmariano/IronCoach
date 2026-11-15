// IronHealth · Service Worker
// Só existe para receber notificações Web Push (lembretes de água e, desde a
// ação P.3, a Carol a chamar pelo atleta) mesmo com a app fechada, e para as
// tornar clicáveis (abrir/focar a app, no separador certo).
// Desde o bug #97 (2026-11-01) guarda em cache os ficheiros com hash de /assets/ (ver abaixo).
// Não guarda o index.html nem o version.json, nem funciona offline: é por eles que as versões
// novas chegam.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/* ── Cache dos ficheiros com hash (bug #97, causa secundária, 2026-11-01) ──────────────────────
   O Android descarta a página da app em segundo plano; ao voltar, arranca a frio e voltava a
   descarregar todos os chunks. Os ficheiros de /assets/ têm o hash do conteúdo no nome
   (index-BIGtwyoQ.js): um nome é sempre o mesmo conteúdo, por isso servem-se da cache primeiro
   (cache-first) e só vão à rede na primeira vez.

   O index.html e o version.json NUNCA entram aqui: é por eles que uma versão nova chega
   (src/lib/appUpdate.js) — um index novo aponta para nomes novos, que a cache não tem, e vêm da
   rede. Nada mais do que /assets/<nome>-<hash>.<ext> é tocado.

   Limpeza: cada entrada leva a versão (build) que estava em uso quando entrou. A app diz ao
   service worker a versão que está a correr (mensagem 'app-build', src/lib/assetCache.js) e os
   ficheiros que já usou nesta sessão. Quando a versão muda, ficam só as entradas da versão nova
   e da anterior (mais as que a página diz estar a usar); o resto apaga-se. */
const ASSET_CACHE = 'ironcoach-assets-v1';
const META_URL = '__ironcoach-asset-meta__';
const BUILD_HEADER = 'x-ironcoach-build';
const HASHED_ASSET = /\/assets\/[^/?#]+-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css|woff2?|ttf|png|jpe?g|svg|webp|avif|gif)$/;

/** É um ficheiro com hash da app (mesma origem, debaixo de <scope>assets/)? */
function isCacheableAsset(url, scope) {
  try {
    const u = new URL(url);
    const s = new URL(scope);
    if (u.origin !== s.origin) return false;
    if (!u.pathname.startsWith(s.pathname + 'assets/')) return false;
    if (u.search) return false;
    return HASHED_ASSET.test(u.pathname);
  } catch (e) {
    return false;
  }
}

async function readMeta(cache) {
  try {
    const res = await cache.match(META_URL);
    if (res) return await res.json();
  } catch (e) { /* meta estragada: começa de novo */ }
  return { current: null, previous: null };
}

async function writeMeta(cache, meta) {
  await cache.put(META_URL, new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
}

/** A resposta com a versão em que entrou na cache (num cabeçalho). */
async function tagged(response, build) {
  const headers = new Headers(response.headers);
  headers.set(BUILD_HEADER, build || '');
  const body = await response.arrayBuffer();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/* A cache nunca pode impedir a app de arrancar: um CacheStorage bloqueado, cheio ou estragado
   faz cair para a rede, como se o service worker não existisse. A resposta da rede devolve-se logo
   (sem esperar pela cópia: mantém o streaming na 1.ª carga); a cópia para a cache faz-se depois,
   em `waitUntil`, e uma falha aí não muda nada. */
async function cacheFirst(request, waitUntil) {
  let cache = null;
  try {
    cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
  } catch (e) {
    cache = null;
  }
  const response = await fetch(request);
  // Só respostas boas e da própria origem (sem opaque, sem erros, sem parciais).
  if (cache && response && response.ok && response.status === 200 && response.type === 'basic') {
    const copy = response.clone();
    const save = (async () => {
      try {
        const meta = await readMeta(cache);
        await cache.put(request, await tagged(copy, meta.current));
      } catch (e) { /* quota ou outro erro: serve-se na mesma */ }
    })();
    if (waitUntil) waitUntil(save);
  }
  return response;
}

/** A app diz que versão corre e que ficheiros já usou. Muda de versão → limpa as antigas. */
async function onAppBuild(build, inUse) {
  if (typeof build !== 'string' || !build) return;
  const cache = await caches.open(ASSET_CACHE);
  const meta = await readMeta(cache);
  const keepUrls = new Set((Array.isArray(inUse) ? inUse : []).filter((u) => typeof u === 'string'));
  if (meta.current !== build) {
    const next = { current: build, previous: meta.current };
    await writeMeta(cache, next);
    const keep = new Set([next.current, next.previous].filter(Boolean));
    for (const req of await cache.keys()) {
      if (req.url.endsWith(META_URL)) continue;
      if (keepUrls.has(req.url)) continue;
      const res = await cache.match(req);
      const tag = res ? res.headers.get(BUILD_HEADER) : null;
      if (!tag || !keep.has(tag)) await cache.delete(req);
    }
  }
  // O que a página está a usar passa a contar como da versão atual.
  for (const url of keepUrls) {
    const res = await cache.match(url);
    if (res && res.headers.get(BUILD_HEADER) !== build) await cache.put(url, await tagged(res, build));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!isCacheableAsset(req.url, self.registration.scope)) return;
  event.respondWith(cacheFirst(req, (p) => event.waitUntil(p)));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'app-build') event.waitUntil(onAppBuild(data.build, data.inUse));
});

self.addEventListener('push', (event) => {
  // Só se o payload não vier em JSON — o texto a sério vem do servidor, na
  // voz da Carol (send-water-reminders/message.ts). Sem emoji, como ela.
  let data = { title: 'Carol', body: 'Bebe um copo de água agora.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) { /* payload não era JSON — usa os valores por omissão */ }

  // A água é a única sem tag (send-water-reminders): tudo o resto — a Carol e
  // o que vier depois — leva o logotipo da app, não a gota (pedido 2026-09-28).
  const isWater = !data.tag || data.tag === 'water-reminder';

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icon-192.png',
      // O Android usa só o canal alfa do badge para desenhar uma silhueta
      // monocromática na barra de estado — um ícone colorido e opaco (como o
      // icon-192.png acima) fica um bloco branco sólido, indistinguível de
      // "sem imagem". badge-96.png é uma gota branca sobre fundo transparente;
      // badge-logo-96.png, o hexágono com as duas setas do logotipo, a branco.
      badge: isWater ? 'badge-96.png' : 'badge-logo-96.png',
      // Cada tipo substitui só a sua: a água não apaga uma mensagem da Carol.
      tag: data.tag || 'water-reminder',
      renotify: true,
      // O separador que o toque abre (a Carol abre o Coach), e a chave do
      // momento (ação P.9) — para o toque abrir exatamente a conversa que
      // esta notificação prometeu, não só o separador.
      data: {
        tab: typeof data.tab === 'string' ? data.tab : null,
        key: typeof data.key === 'string' ? data.key : null,
      },
    })
  );
});

// A mesma chave pública de src/lib/push.js (não é segredo; push.test.js
// garante que as duas não divergem).
const VAPID_PUBLIC_KEY = 'BL4SDjui7uHeUOLvyKOJ-VrcGx3SadjPvz4lw5KABx9NwcL3N3awjiPk__Uhiizupgb_haaMKjaykFu-x1y26v4';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* O browser trocou (ou deixou cair) a subscrição (2026-09-28). Sem isto, a
   antiga morria no servidor ao primeiro envio (404/410) e o atleta ficava
   sem notificações sem saber. Aqui renova-se já a subscrição do browser; quem
   a grava é a app — a gravação precisa da sessão do atleta, que o service
   worker não tem. Com a app aberta, avisa-se já (App.jsx sincroniza nesse
   instante); fechada, a app confirma-a ao abrir (syncPushSubscription). */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    if (!event.newSubscription) {
      try {
        const current = await self.registration.pushManager.getSubscription();
        if (!current) {
          // Sempre a chave atual da app — nunca a da subscrição antiga, que
          // numa troca de chave seria a errada.
          await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }
      } catch (e) { /* sem permissão ou sem rede: a app tenta ao abrir */ }
    }
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: 'push-subscription-changed' });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tab = event.notification.data && event.notification.data.tab;
  const key = event.notification.data && event.notification.data.key;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          // A app já aberta muda de separador (App.jsx ouve esta mensagem).
          // Payloads antigos (sem key) continuam a funcionar — key fica undefined.
          if (tab) client.postMessage({ type: 'open-tab', tab, key });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        const params = tab ? `?tab=${encodeURIComponent(tab)}${key ? `&carol=${encodeURIComponent(key)}` : ''}` : '';
        return self.clients.openWindow(self.registration.scope + params);
      }
    })
  );
});
