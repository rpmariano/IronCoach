/* A app atualiza-se sozinha depois de um deploy.

   O problema: instalada no ecrã inicial (display: standalone), a app fica
   aberta dias a fio — sai para segundo plano e volta, mas o JavaScript que
   corre é o do dia em que foi aberta. Nada lhe diz que saiu uma versão nova,
   e o atleta tinha de fechar a app ou puxar para recarregar. Pior: o GitHub
   Pages serve o index.html com Cache-Control max-age=600, por isso mesmo um
   refresh nos primeiros 10 minutos depois do deploy ainda trazia a antiga.

   A solução:
   - Cada build tem um id (__APP_BUILD__, definido no vite.config.mjs) e
     escreve-o também em version.json, ao lado do index.html.
   - A app pergunta pelo version.json (sem cache) ao abrir, quando volta ao
     primeiro plano e de 10 em 10 minutos enquanto está visível.
   - Se o id mudou, recarrega — mas só num momento seguro: nenhuma folha ou
     modal aberta, nenhuma mensagem escrita por enviar, nenhum campo com o
     foco. Com a app já em uso, espera também um minuto sem toques. Senão
     espera pela próxima oportunidade. Nunca se perde um rascunho.
   - A recarga pede o index.html com ?v=<id>, um URL que a cache HTTP nunca
     viu; o parâmetro é retirado da barra de endereço logo no arranque.
   - Uma marca em sessionStorage impede um ciclo se, mesmo assim, a versão
     servida não for a nova (CDN atrasado): tenta uma vez por versão. */

const VERSION_PARAM = 'v';
const RELOAD_MARK = 'ironcoach:update-reload';
const CHECK_EVERY_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
const IDLE_MS = 60 * 1000;

/** O id deste build; '' em desenvolvimento e nos testes (sem verificação). */
export function currentBuild() {
  // eslint-disable-next-line no-undef
  return typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';
}

/** O id publicado agora, ou null se não se conseguiu saber (sem rede, 404…). */
export async function fetchPublishedBuild(fetchImpl = globalThis.fetch, base = import.meta.env.BASE_URL || '/') {
  try {
    // Com prazo: um pedido pendurado (rede má, iOS a suspender a app) deixava
    // o vigia à espera para sempre e ele nunca mais verificava.
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined;
    const res = await fetchImpl(`${base}version.json?t=${Date.now()}`, { cache: 'no-store', signal });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.build === 'string' && data.build ? data.build : null;
  } catch {
    return null;
  }
}

/** Há alguma coisa a meio que uma recarga deitaria fora, pelo DOM?
    Folhas e modais (role="dialog"); a conversa com a Carol, que é uma
    textarea no ecrã; um campo com o foco (o atleta está a escrever); o
    arranque (o rascunho sobrevive a uma recarga, o passo em que ia não).
    Os registos e edições são ecrãs inteiros, não folhas: esses vêem-se pela
    store (utils/navigationRestore.js, isScreenOpen), que main.jsx junta. */
export function isBusy(doc = globalThis.document) {
  if (!doc) return true;
  if (doc.querySelector('[role="dialog"], [aria-modal="true"], [data-testid="onboarding"]')) return true;
  for (const t of doc.querySelectorAll('textarea')) {
    if (typeof t.value === 'string' && t.value.trim()) return true;
  }
  const active = doc.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName || '')) return true;
  if (active && active.isContentEditable) return true;
  return false;
}

/** O URL a pedir para trazer a versão `build` sem passar pela cache.
    `extra`: outros parâmetros a pôr (ex.: { resume }, ver resumeParams). */
export function freshUrl(href, build, extra = {}) {
  const url = new URL(href);
  for (const [k, v] of Object.entries(extra)) {
    // null tira o parâmetro; um valor põe-no.
    if (v === null) url.searchParams.delete(k);
    else if (v) url.searchParams.set(k, v);
  }
  url.searchParams.set(VERSION_PARAM, build || String(Date.now()));
  return url.toString();
}

/** Recarrega a app a partir da rede, não da cache HTTP do index.html. */
export function reloadFresh(build, loc = globalThis.location, extra = {}) {
  loc.replace(freshUrl(loc.href, build, extra));
}

/* ?resume=<separador>: uma recarga técnica (uma atualização, um ecrã que
   falhou a carregar) volta ao separador onde a app estava, em vez de cair no
   Início — o que fazia a recarga parecer um reinício (relatado 2026-09-24).
   Um parâmetro próprio, não o ?tab=: esse diz "a app abriu por uma
   notificação", e o arranque salta as boas-vindas da Carol e dá a faixa do
   dia por vista (revisão pré-deploy de 639c495). O App lê-o no arranque e
   tira-o logo da barra de endereço (stripResumeParam). */
const RESUME_PARAM = 'resume';

/** As bancadas de teste do design system (?tab=design-system /
    ?tab=audit-sandbox): só se chegam por URL e não têm saída. */
export function isBenchTab(tab) {
  return tab === 'design-system' || tab === 'audit-sandbox';
}

/* O App já aplicou o separador de entrada do URL? Até lá o separador da
   store ainda é o de partida ('home'), não o do ?tab= de uma notificação:
   uma recarga nesse instante (o vigia verifica logo no arranque) tem de
   deixar o URL como está. */
let entryApplied = false;
/** O App chama isto depois de aplicar o separador de entrada. */
export function markEntryApplied() { entryApplied = true; }

/* ...e já decidiu as boas-vindas? Até lá o ?tab= de uma notificação ainda
   tem um papel: diz ao arranque para as saltar. Uma recarga antes disso (a
   app aberta a frio por uma notificação, com um index.html da cache logo a
   seguir a uma publicação) tem de o manter — senão as boas-vindas
   apareciam por cima do Coach (revisão pré-deploy de 89e52e5). */
let welcomeHandled = false;
/** O App chama isto depois de decidir as boas-vindas da entrada. */
export function markEntryWelcomeHandled() { welcomeHandled = true; }

/** Os parâmetros de uma recarga técnica para voltar a `tab`: põe o
    ?resume= e, com as boas-vindas já decididas, tira o ?tab= e o ?carol= de
    uma notificação antiga — senão uma sessão aberta por notificação voltava
    sempre a esse separador e sem boas-vindas (revisão pré-deploy de
    7326011). Antes de o App aplicar o separador de entrada, e nas bancadas
    de teste, o URL fica como está. */
export function resumeParams(tab, applied = entryApplied, handled = welcomeHandled) {
  if (!applied) return {};
  if (typeof tab !== 'string' || !tab || isBenchTab(tab)) return {};
  return handled ? { [RESUME_PARAM]: tab, tab: null, carol: null } : { [RESUME_PARAM]: tab };
}

/** O separador por onde a app entra: o da recarga técnica (é onde se
    estava) ou o do ?tab= (notificação, link); null sem nenhum. */
export function entryTabFromSearch(search) {
  try {
    const params = new URLSearchParams(search);
    return params.get(RESUME_PARAM) || params.get('tab') || null;
  } catch {
    return null;
  }
}

/** Tira o ?resume= da barra de endereço, depois de o App o ler. */
export function stripResumeParam(win = globalThis.window) {
  try {
    const url = new URL(win.location.href);
    if (!url.searchParams.has(RESUME_PARAM)) return;
    url.searchParams.delete(RESUME_PARAM);
    win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* sem history — fica o parâmetro, que só repete o separador */ }
}

/** Tira o ?v= da barra de endereço depois de uma recarga (não o do ?tab=). */
export function stripVersionParam(win = globalThis.window) {
  try {
    const url = new URL(win.location.href);
    if (!url.searchParams.has(VERSION_PARAM)) return;
    url.searchParams.delete(VERSION_PARAM);
    win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* sem history — fica o parâmetro, que não faz mal */ }
}

function alreadyTried(build, storage) {
  try { return storage?.getItem(RELOAD_MARK) === build; } catch { return true; }
}
function markTried(build, storage) {
  try { storage?.setItem(RELOAD_MARK, build); } catch { /* sem storage */ }
}

/**
 * Começa a vigiar. Devolve a função que pára; `stop.ready` é a promessa da
 * primeira verificação (para os testes). Tudo injetável para se testar sem
 * browser.
 */
export function startAppUpdateWatcher({
  build = currentBuild(),
  doc = globalThis.document,
  win = globalThis.window,
  storage = (() => { try { return globalThis.sessionStorage; } catch { return null; } })(),
  fetchBuild = () => fetchPublishedBuild(),
  reload = (b) => reloadFresh(b, win.location),
  now = () => Date.now(),
  busy = () => isBusy(doc),
} = {}) {
  const noop = () => {};
  noop.ready = Promise.resolve();
  if (!build || !doc || !win) return noop;

  stripVersionParam(win);

  let pending = null;       // id novo já conhecido, à espera de um momento seguro
  let lastCheck = 0;
  let lastInput = now();
  let checking = false;

  /* `fresh`: acabou de abrir ou de voltar à app — o atleta ainda não começou
     nada, não é preciso esperar que fique parado. */
  const tryApply = (fresh) => {
    if (!pending || doc.hidden) return false;
    if (alreadyTried(pending, storage)) return false;
    if (busy()) return false;
    if (!fresh && now() - lastInput < IDLE_MS) return false;
    markTried(pending, storage);
    reload(pending);
    return true;
  };

  const check = async ({ force = false, fresh = false } = {}) => {
    if (checking || doc.hidden) return;
    if (!force && now() - lastCheck < MIN_GAP_MS) { tryApply(fresh); return; }
    checking = true;
    lastCheck = now();
    try {
      const published = await fetchBuild();
      if (published && published !== build) pending = published;
    } finally {
      checking = false;
    }
    tryApply(fresh);
  };

  const onVisibility = () => {
    if (!doc.hidden) check({ fresh: true });
  };
  const onInput = () => { lastInput = now(); };

  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('pointerdown', onInput, { passive: true });
  doc.addEventListener('keydown', onInput);
  const timer = win.setInterval(() => { check(); }, CHECK_EVERY_MS);
  const ready = check({ force: true, fresh: true });

  const stop = () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('pointerdown', onInput);
    doc.removeEventListener('keydown', onInput);
    win.clearInterval(timer);
  };
  stop.ready = ready;
  return stop;
}
