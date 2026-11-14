// Que endpoints de Web Push se aceitam, e quantas subscrições cada atleta
// guarda (auditoria de segurança, 2026-11-14, item M2).
//
// O endpoint é um URL para onde o servidor faz POST com a chave VAPID. Sem
// lista fechada, qualquer autenticado gravava `https://o-servidor-dele/…` e o
// send-water-reminders e o coach-proactive-tick passavam a fazer pedidos para
// lá (SSRF), ou para um endereço que nunca responde. Só os serviços de push
// dos browsers que a app suporta:
//   - fcm.googleapis.com                (Chrome, Edge antigo, Android)
//   - jmt17.google.com                  (o FCM de staging do Chromium)
//   - *.push.apple.com                  (Safari / iOS: web.push.apple.com)
//   - updates.push.services.mozilla.com (Firefox)
//   - *.notify.windows.com              (Edge no Windows: wns2-xxx.notify…)
//
// A MESMA expressão está no CHECK da tabela
// (20261114120000_push_subscriptions_hardening.sql): o texto todo, não só o
// host que o `new URL()` devolve, para que o que passa aqui passe sempre lá —
// `https://fcm.googleapis.com:443/…` ou `https://fcm.googleapis.com@x/…` são o
// mesmo host para o URL e ficavam a dar 500 no insert. Se mudar aqui, muda lá.

export const PUSH_ENDPOINT_PATTERN =
  /^https:\/\/(fcm\.googleapis\.com|jmt17\.google\.com|([a-z0-9-]+\.)+push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com)\//i;

// Os endpoints reais andam pelos 150–400 caracteres; isto só trava lixo.
export const PUSH_ENDPOINT_MAX_LENGTH = 2048;
// p256dh (65 bytes) e auth (16 bytes) em base64url: 87 e 22 caracteres.
export const PUSH_KEY_MAX_LENGTH = 256;

// Subscrições por atleta: uma por browser/dispositivo. Dez chega para
// telemóvel, computador e tablet com folga; o que passar disto é lixo de
// reinstalações (ou alguém a encher a tabela).
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

/** O endpoint é https, de um dos serviços de push conhecidos, e um URL válido. */
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string") return false;
  if (endpoint.length === 0 || endpoint.length > PUSH_ENDPOINT_MAX_LENGTH) return false;
  if (/\s/.test(endpoint)) return false;
  if (!PUSH_ENDPOINT_PATTERN.test(endpoint)) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.port === "" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/** Uma chave da subscrição (p256dh ou auth): texto não vazio e curto. */
export function isValidPushKey(key: unknown): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= PUSH_KEY_MAX_LENGTH;
}

/**
 * Os ids a apagar para o atleta ficar com no máximo `max` subscrições:
 * as mais antigas (created_at), nunca a que se acabou de gravar
 * (`keepEndpoint`). `rows` pode vir em qualquer ordem.
 */
export function pushSubscriptionsToPrune(
  rows: ReadonlyArray<{ id: string; endpoint: string; created_at: string | null }>,
  keepEndpoint: string,
  max = MAX_PUSH_SUBSCRIPTIONS_PER_USER,
): string[] {
  if (rows.length <= max) return [];
  const others = rows
    .filter((r) => r.endpoint !== keepEndpoint)
    // Mais recente primeiro; sem data conta como a mais antiga.
    .sort((a, b) => (Date.parse(b.created_at ?? "") || 0) - (Date.parse(a.created_at ?? "") || 0));
  const kept = rows.length - others.length; // 1 se a nova está na lista, 0 se não
  return others.slice(Math.max(0, max - kept)).map((r) => r.id);
}
