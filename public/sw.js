// IronHealth · Service Worker
// Só existe para receber notificações Web Push (lembretes de água) mesmo
// com a app fechada, e para as tornar clicáveis (abrir/focar a app).
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
      tag: 'water-reminder',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope);
    })
  );
});
