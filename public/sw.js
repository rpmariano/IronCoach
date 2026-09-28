// IronHealth · Service Worker
// Só existe para receber notificações Web Push (lembretes de água e, desde a
// ação P.3, a Carol a chamar pelo atleta) mesmo com a app fechada, e para as
// tornar clicáveis (abrir/focar a app, no separador certo).
// Não faz cache nem funciona offline — isso é propositadamente fora de
// âmbito aqui, para não complicar a invalidação de cache do index.html.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Só se o payload não vier em JSON — o texto a sério vem do servidor, na
  // voz da Carol (send-water-reminders/message.ts). Sem emoji, como ela.
  let data = { title: 'Carol', body: 'Bebe um copo de água agora.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) { /* payload não era JSON — usa os valores por omissão */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icon-192.png',
      // O Android usa só o canal alfa do badge para desenhar uma silhueta
      // monocromática na barra de estado — um ícone colorido e opaco (como o
      // icon-192.png acima) fica um bloco branco sólido, indistinguível de
      // "sem imagem". badge-96.png é uma gota branca sobre fundo transparente,
      // pensada só para isto.
      badge: 'badge-96.png',
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
      const oldKey = event.oldSubscription && event.oldSubscription.options
        && event.oldSubscription.options.applicationServerKey;
      try {
        const current = await self.registration.pushManager.getSubscription();
        if (!current) {
          await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: oldKey || urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
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
