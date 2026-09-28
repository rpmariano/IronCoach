// Notificações Web Push — lembretes de água.
//
// O service worker (public/sw.js) existe só para receber estas notificações
// com a app fechada e para as tornar clicáveis. Não faz cache nem offline.
//
// A chave pública VAPID não é segredo: vai no pedido de subscrição do
// browser. A privada vive apenas nos secrets da Edge Function.

import { supabase } from './supabase';

// A mesma chave está em public/sw.js (o pushsubscriptionchange renova a
// subscrição sem a app aberta); push.test.js garante que não divergem.
export const VAPID_PUBLIC_KEY = 'BL4SDjui7uHeUOLvyKOJ-VrcGx3SadjPvz4lw5KABx9NwcL3N3awjiPk__Uhiizupgb_haaMKjaykFu-x1y26v4';

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
    if (!sub) sub = await subscribeFresh(reg, appServerKey);

    try {
      await saveSubscription(sub);
    } catch (e) {
      /* O endpoint pode ainda estar gravado em nome de outra conta deste
         telemóvel (uma sessão que acabou sem passar pelo Perfil): a RLS
         recusa o upsert, sempre. Com um endpoint novo não há conflito — e
         aqui há um toque do atleta, que o iOS exige para subscrever. */
      await sub.unsubscribe();
      sub = await subscribeFresh(reg, appServerKey);
      await saveSubscription(sub);
    }

    const { data: { session } = {} } = await supabase.auth.getSession();
    markOptIn(session?.user?.id);
    return { ok: true, error: null };
  } catch (e) {
    console.error('Não foi possível ativar as notificações:', e);
    return { ok: false, error: 'Não foi possível ativar as notificações. Tenta novamente.' };
  }
}

function subscribeFresh(reg, appServerKey) {
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
}

async function saveSubscription(sub) {
  const json = sub.toJSON();
  const { error } = await supabase.functions.invoke('save-push-subscription', {
    body: { endpoint: json.endpoint, keys: json.keys },
  });
  if (error) throw error;
}

/* "Este atleta ligou as notificações NESTE dispositivo" (revisão adversarial
   de 2026-09-28). A permissão do browser é do site inteiro e o interruptor do
   Perfil é da conta — nenhum dos dois diz que foi aqui. Sem esta marca, num
   tablet partilhado a reparação automática inscrevia quem entrasse a seguir,
   com a permissão que outra pessoa deu, e as mensagens da Carol dele (nome,
   treinos, dores) passavam a chegar a um aparelho que nunca escolheu. A marca
   fica ao terminar sessão: quem volta ao seu próprio telemóvel não tem de ir
   outra vez ao Perfil. */
const OPT_IN_PREFIX = 'ironcoach:push-optin:';
function markOptIn(userId) {
  if (!userId) return;
  try { window.localStorage.setItem(`${OPT_IN_PREFIX}${userId}`, '1'); } catch { /* modo privado */ }
}
function hasOptIn(userId) {
  try { return window.localStorage.getItem(`${OPT_IN_PREFIX}${userId}`) === '1'; } catch { return false; }
}

/* A subscrição repara-se sozinha (2026-09-28). Até aqui só se gravava ao
   ligar o interruptor no Perfil: quando o serviço de push a dava por expirada
   (404/410), o servidor apagava-a — é o certo — e o atleta ficava sem
   notificações, com o interruptor ainda ligado e sem nada que o avisasse (as
   duas subscrições caíram assim no balanço da semana de 28/09).

   Ao abrir a app, com as notificações ligadas no perfil e a permissão já
   dada — nunca se pede nada aqui —, confirma-se que o servidor ainda tem a
   subscrição deste browser. Se tiver, não se escreve nada (e fica a marca
   de que foi aqui que ele as ligou — é assim que os telemóveis de antes desta
   versão entram). Se não tiver, só se mexe onde ele as ligou (hasOptIn): ou
   nunca chegou lá, ou o servidor apagou-a por estar morta — renova-se (a
   mesma subscrição morta voltava a falhar no próximo envio) e grava-se.
   `fresh` é para a que o service worker acabou de renovar
   (pushsubscriptionchange): essa é boa, grava-se tal como está.

   A leitura vai como ESTE atleta e só às linhas dele (revisão adversarial):
   - sem sessão (refresh falhado, logout global noutro dispositivo) o
     PostgREST responde vazio e sem erro, e isso passava por "o servidor
     apagou-a" — trocava-se uma subscrição boa por uma que nem se gravava;
   - a política "admin read all" deixava um admin ver a linha de outro atleta
     com o mesmo endpoint e dar tudo por certo.
   Uma falha a ler não mexe em nada. */
export async function syncPushSubscription({ enabled, userId, fresh = false }) {
  if (!enabled || !userId || !pushSupported()) return 'off';
  if (Notification.permission !== 'granted') return 'no-permission';
  const sameSession = async () => {
    const { data: { session } = {} } = await supabase.auth.getSession();
    return session?.user?.id === userId;
  };
  try {
    if (!(await sameSession())) return 'no-session';
    const reg = await serviceWorkerReady();
    const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();
    const usable = !!sub && sameApplicationServerKey(sub, appServerKey);
    if (usable) {
      const { data, error } = await supabase.from('push_subscriptions')
        .select('id').eq('user_id', userId).eq('endpoint', sub.endpoint).maybeSingle();
      if (error) return 'read-failed';
      if (data) { markOptIn(userId); return 'in-sync'; }
    }
    if (!hasOptIn(userId)) return 'not-opted-in';
    if (usable && fresh) {
      try { await saveSubscription(sub); return 'saved'; } catch { /* recusada — renova-se */ }
    }
    if (sub) {
      try { await sub.unsubscribe(); } catch { /* já não existia — segue */ }
      sub = null;
    }
    sub = await subscribeFresh(reg, appServerKey);
    // A sessão pode ter acabado entretanto (terminar sessão a meio).
    if (!(await sameSession())) return 'no-session';
    await saveSubscription(sub);
    return 'renewed';
  } catch (e) {
    // iOS pode recusar subscrever sem um toque do atleta: fica o Perfil.
    console.warn('Não foi possível confirmar a subscrição das notificações:', e);
    return 'error';
  }
}

/** O atleta que quer notificações neste momento (o id), ou null: sessão
 *  real (não a demo), o perfil DELE carregado e a Carol ou a água ligadas no
 *  Perfil. */
export function pushWantedFor({ session, profile } = {}) {
  const userId = session?.user?.id;
  if (!userId || userId === 'demo-user' || profile?.id !== userId) return null;
  return profile.carol_push_enabled || profile.water_reminder_enabled ? userId : null;
}

/* No máximo de SYNC_INTERVAL_MS em SYNC_INTERVAL_MS por atleta, por abertura
   ou regresso à app — a leitura é barata, mas não precisa de correr a cada
   troca de app. `force` é para o aviso do service worker
   (pushsubscriptionchange), que diz que a subscrição mudou agora.
   A marca põe-se antes de correr (uma abertura e um regresso quase ao mesmo
   tempo dão uma só verificação), mas uma tentativa falhada fica só com
   SYNC_RETRY_MS: um telemóvel que volta sem rede não fica 6 h sem reparar a
   subscrição. E é por atleta: outra conta no mesmo telemóvel não herda a
   marca da anterior. */
export const SYNC_INTERVAL_MS = 6 * 3600 * 1000;
export const SYNC_RETRY_MS = 5 * 60 * 1000;
const UNSETTLED = new Set(['error', 'read-failed', 'no-session']);
let lastSync = { userId: null, at: 0 };
let inFlight = null;
export function maybeSyncPushSubscription({ enabled, userId, force = false, fresh = false, now = Date.now() }) {
  if (!enabled || !userId) return Promise.resolve('off');
  const recent = lastSync.userId === userId && lastSync.at && now - lastSync.at < SYNC_INTERVAL_MS;
  if (!force && recent) return Promise.resolve('throttled');
  const stamp = { userId, at: now };
  lastSync = stamp;
  const run = syncPushSubscription({ enabled, userId, fresh }).then((result) => {
    if (UNSETTLED.has(result) && lastSync === stamp) {
      lastSync = { userId, at: now - SYNC_INTERVAL_MS + SYNC_RETRY_MS };
    }
    return result;
  });
  const tracked = run.finally(() => { if (inFlight === tracked) inFlight = null; });
  inFlight = tracked;
  return run;
}
export function resetPushSyncThrottle() {
  lastSync = { userId: null, at: 0 };
}

/* Ao terminar sessão, este telemóvel deixa de receber as notificações de quem
   sai (revisão adversarial): sem isto, as mensagens da Carol (nome, provas,
   treinos, dores) continuavam a chegar a um telemóvel que já pode estar nas
   mãos de outra pessoa. Duas coisas, das duas maneiras que há de a sessão
   acabar:
   - a linha do servidor apaga-se diretamente (a RLS deixa cada um apagar as
     suas), enquanto o JWT ainda vale — no Perfil, antes do signOut;
   - a subscrição do browser cancela-se sempre, e isso não precisa de sessão:
     se o apagar falhou, ou a sessão acabou noutro sítio (logout global a
     partir de outro dispositivo, refresh recusado — App.jsx, SIGNED_OUT), o
     endpoint morre no serviço de push e o próximo envio (404/410) limpa a
     linha.
   Espera por uma sincronização a meio (que podia gravar a linha de quem sai
   depois de apagada). Nunca atrasa a saída mais do que timeoutMs, e uma
   falha não a impede. */
export async function forgetPushSubscriptionOnThisDevice({ timeoutMs = 3000 } = {}) {
  resetPushSyncThrottle();
  if (!pushSupported()) return;
  let timer;
  const deadline = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  try {
    await Promise.race([
      (async () => {
        if (inFlight) await inFlight.catch(() => {});
        const reg = await serviceWorkerReady(timeoutMs);
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        try {
          const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          if (error) console.warn('Não apagou a subscrição deste dispositivo no servidor:', error.message);
        } finally {
          await sub.unsubscribe();
        }
      })(),
      deadline,
    ]);
  } catch (e) {
    console.warn('Não foi possível esquecer a subscrição deste dispositivo:', e);
  } finally {
    clearTimeout(timer);
  }
}
