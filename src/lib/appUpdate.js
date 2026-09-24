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

/** Há alguma coisa a meio que uma recarga deitaria fora?
    Os registos e edições abrem todos numa folha ou modal (role="dialog"); a
    conversa com a Carol é uma textarea no ecrã. Um campo com o foco também
    conta: o atleta está a escrever. O arranque também: o rascunho sobrevive
    a uma recarga, o passo em que ia não. */
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
    `extra`: outros parâmetros a pôr (ex.: { tab }, ver tabParams). */
export function freshUrl(href, build, extra = {}) {
  const url = new URL(href);
  for (const [k, v] of Object.entries(extra)) {
    if (v) url.searchParams.set(k, v);
  }
  url.searchParams.set(VERSION_PARAM, build || String(Date.now()));
  return url.toString();
}

/** Recarrega a app a partir da rede, não da cache HTTP do index.html. */
export function reloadFresh(build, loc = globalThis.location, extra = {}) {
  loc.replace(freshUrl(loc.href, build, extra));
}

/** O separador onde a app estava, para uma recarga técnica (uma
    atualização, um ecrã que falhou a carregar) voltar a ele em vez de cair
    no Início — o que fazia a recarga parecer um reinício (relatado
    2026-09-24). As bancadas de teste não contam. */
export function tabParams(tab) {
  return typeof tab === 'string' && tab && !/^(design-system|audit-sandbox)$/.test(tab) ? { tab } : {};
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
