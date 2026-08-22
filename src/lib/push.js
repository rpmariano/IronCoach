// Notificações Web Push — lembretes de água.
//
// O service worker (public/sw.js) existe só para receber estas notificações
// com a app fechada e para as tornar clicáveis. Não faz cache nem offline.
//
// A chave pública VAPID não é segredo: vai no pedido de subscrição do
// browser. A privada vive apenas nos secrets da Edge Function.

import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = 'BL4SDjui7uHeUOLvyKOJ-VrcGx3SadjPvz4lw5KABx9NwcL3N3awjiPk__Uhiizupgb_haaMKjaykFu-x1y26v4';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export function pushSupported() {
  // Notification faz parte do teste: em iOS Safari fora de uma PWA instalada
  // existe serviceWorker e PushManager mas não Notification, e sem isto o
  // requestPermission abaixo rebentava com um ReferenceError apresentado como
  // "tenta novamente" — um convite a repetir uma condição permanente.
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && 'PushManager' in window
    && 'Notification' in window;
}

// navigator.serviceWorker.ready nunca resolve se o registo falhou (MIME type
// errado, rewrite do host). Sem limite, o interruptor ficava preso em "a
// subscrever" sem saída a não ser recarregar a página.
async function serviceWorkerReady(timeoutMs = 10000) {
  let timer;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('service worker não ficou pronto')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Independente do login: registar não exige sessão nem mostra nada. Sem isto,
// navigator.serviceWorker.ready nunca resolve e a subscrição fica pendurada.
function sameApplicationServerKey(sub, expected) {
  const current = sub.options?.applicationServerKey;
  if (!current) return true; // browser não expõe a chave — não dá para comparar
  const bytes = new Uint8Array(current);
  if (bytes.length !== expected.length) return false;
  return bytes.every((b, i) => b === expected[i]);
}

export function registerServiceWorker() {
  if (!pushSupported()) return;
  /* BASE_URL, não "/sw.js": no GitHub Pages a app vive em /ironcoach/, onde um
     caminho absoluto dá 404. Registar em /ironcoach/sw.js também dá ao service
     worker o scope certo, que é o da app. */
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((e) => {
    console.error('Registo do service worker falhou:', e);
  });
}

/* Pede permissão, subscreve o PushManager (ou reaproveita a subscrição que já
   exista) e guarda-a no servidor através da Edge Function
   save-push-subscription. Devolve { ok, error } — quem chama decide a
   mensagem a mostrar. */
export async function ensurePushSubscription() {
  if (!pushSupported()) {
    return { ok: false, error: 'Este browser não suporta notificações push.' };
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        error: 'Notificações bloqueadas. Ativa-as nas definições do browser para receberes lembretes.',
      };
    }

    const reg = await serviceWorkerReady();
    const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    let sub = await reg.pushManager.getSubscription();
    /* Uma subscrição existente pode estar presa a uma chave VAPID antiga —
       nesse caso o servidor não consegue enviar-lhe nada e reaproveitá-la
       daria um "ativado" falso. Se a chave não bater, cria-se de novo. */
    if (sub && !sameApplicationServerKey(sub, appServerKey)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }

    const json = sub.toJSON();
    const { error } = await supabase.functions.invoke('save-push-subscription', {
      body: { endpoint: json.endpoint, keys: json.keys },
    });
    if (error) throw error;

    return { ok: true, error: null };
  } catch (e) {
    console.error('Não foi possível ativar as notificações:', e);
    return { ok: false, error: 'Não foi possível ativar as notificações. Tenta novamente.' };
  }
}
