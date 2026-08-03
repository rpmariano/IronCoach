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
  return typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && typeof window !== 'undefined'
    && 'PushManager' in window;
}

// Independente do login: registar não exige sessão nem mostra nada. Sem isto,
// navigator.serviceWorker.ready nunca resolve e a subscrição fica pendurada.
export function registerServiceWorker() {
  if (!pushSupported()) return;
  navigator.serviceWorker.register('/sw.js').catch((e) => {
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

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
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
