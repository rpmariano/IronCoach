/* #97 (2026-11-04): «a app continua a carregar sempre que é aberta. sempre que estou na app,
   bloqueio o telm e 30seg depois volto a abrir, a app recarrega sempre».

   O regresso com a página viva não mostra ecrã de carregamento (App.jsx: o visibilitychange só
   atualiza os dados por baixo — loadInitialData com o mesmo utilizador não liga o dataPending —,
   e o SIGNED_IN do mesmo utilizador é 'session-only', utils/authEvents.js). O ecrã do logo só
   aparece num arranque a frio. A hipótese é o sistema descartar a página da PWA em segundo plano.
   Esta telemetria confirma-o com dados reais: em cada arranque, uma linha em app_logs (o
   logAppEvent que já existe) com
   · document.wasDiscarded — o Chrome descartou a página (e esta é a recarga);
   · o tipo de navegação (navigate / reload / back_forward / prerender);
   · há quanto tempo a página foi escondida (guardado no pagehide/visibilitychange hidden);
   · se o URL traz o ?v= de uma recarga por versão nova (lib/appUpdate.js). */

export const HIDDEN_AT_KEY = 'ironcoach:hidden-at';

function safeStorage(storage) {
  try { return storage || globalThis.localStorage || null; } catch { return null; }
}

/** Guarda a hora a que a página ficou escondida. Devolve a função que desliga. */
export function trackHiddenAt({ doc = globalThis.document, win = globalThis.window, storage, now = () => Date.now() } = {}) {
  const st = safeStorage(storage);
  if (!doc || !st) return () => {};
  const mark = () => { try { st.setItem(HIDDEN_AT_KEY, String(now())); } catch { /* sem storage */ } };
  const onVisibility = () => { if (doc.visibilityState === 'hidden') mark(); };
  doc.addEventListener?.('visibilitychange', onVisibility);
  win?.addEventListener?.('pagehide', mark);
  return () => {
    doc.removeEventListener?.('visibilitychange', onVisibility);
    win?.removeEventListener?.('pagehide', mark);
  };
}

/** O que se sabe deste arranque. Lê (e apaga) a hora a que a página anterior ficou escondida. */
export function readBootInfo({ doc = globalThis.document, perf = globalThis.performance, storage, loc = globalThis.location, now = () => Date.now() } = {}) {
  const st = safeStorage(storage);
  let hiddenForMs = null;
  try {
    const raw = st?.getItem(HIDDEN_AT_KEY);
    const at = raw == null ? NaN : Number(raw);
    if (Number.isFinite(at) && at > 0) hiddenForMs = Math.max(0, now() - at);
    st?.removeItem(HIDDEN_AT_KEY);
  } catch { /* sem storage */ }
  let navType = null;
  try { navType = perf?.getEntriesByType?.('navigation')?.[0]?.type ?? null; } catch { /* sem a API */ }
  let versionReload = false;
  try { versionReload = !!loc && new URL(loc.href).searchParams.has('v'); } catch { /* URL inválido */ }
  return {
    wasDiscarded: typeof doc?.wasDiscarded === 'boolean' ? doc.wasDiscarded : null,
    navType,
    hiddenForMs,
    versionReload,
    standalone: !!globalThis.matchMedia?.('(display-mode: standalone)')?.matches,
  };
}

/** A mensagem curta da linha (o detalhe vai no meta). */
export function bootMessage(info) {
  if (info?.wasDiscarded) return 'Arranque depois de a página ser descartada';
  if (info?.versionReload) return 'Arranque por versão nova';
  if (info?.navType === 'reload') return 'Recarga da página';
  return 'Arranque da app';
}

// Uma leitura por carregamento da página (o StrictMode chama os inicializadores duas vezes, e a
// segunda já não encontrava a hora apagada pela primeira).
let bootInfoCache = null;
export function bootInfoOnce() {
  if (!bootInfoCache) bootInfoCache = readBootInfo();
  return bootInfoCache;
}
/** Só para testes. */
export function resetBootInfo() { bootInfoCache = null; }
