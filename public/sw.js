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
      // O separador que o toque abre (a Carol abre o Coach).
      data: { tab: typeof data.tab === 'string' ? data.tab : null },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tab = event.notification.data && event.notification.data.tab;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          // A app já aberta muda de separador (App.jsx ouve esta mensagem).
          if (tab) client.postMessage({ type: 'open-tab', tab });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(self.registration.scope + (tab ? `?tab=${encodeURIComponent(tab)}` : ''));
      }
    })
  );
});
