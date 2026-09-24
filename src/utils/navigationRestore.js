/* O ecrã onde se estava sobrevive a o Android matar a app em segundo plano
   (relatado 2026-09-24: "se estiver a criar um registo e sair para ver
   alguma informação noutra app, quando volto já saiu do ecrã de criar").

   Uma app instalada no ecrã inicial vive num separador do Chrome: sair para
   outra app pesada (a câmara, a galeria, o browser) pode levar o Android a
   matá-la, e voltar arranca-a do zero, no Início. Os campos e os prints do
   registo já sobreviviam (os rascunhos, em formDraftPersistence e
   draftMediaPersistence); o ecrã não — o rascunho só voltava ao reabrir o
   registo à mão.

   Aqui guarda-se, em localStorage, o separador e o ecrã de topo abertos
   (registo, edição, prova, "O plano") — com os prefills que o ecrã leu ao
   abrir, que ele consome e limpa da store ao montar. Escreve-se ao abrir e
   fechar um ecrã, ao mudar de separador e ao sair da app. No arranque, se a
   app saiu há menos de RESTORE_WINDOW_MS, repõe-se tudo — e o ecrã reabre
   com o rascunho que já estava guardado. */

const KEY = 'ironcoach:ecra-aberto';
/** Quanto tempo depois de sair da app ainda se volta ao mesmo ecrã. */
export const RESTORE_WINDOW_MS = 30 * 60 * 1000;
const PREFILLS = ['planItemPrefill', 'runRacePrefill', 'racePrefill'];

/** Há um ecrã de topo aberto (ou um formulário com alterações por gravar)?
    Uma recarga ou uma camada por cima deitava-o fora. */
export function isScreenOpen(s) {
  return !!(s && (s.openCreationMode || s.editingRaceId || s.onboardingOpen || s.navGuard));
}

// A corrida em edição só conta dentro do registo de corrida (é como o App a
// mostra); um registo já gravado, com a confirmação à vista, não conta.
function screenOf(s) {
  if (s.recordSaved || (!s.openCreationMode && !s.editingRaceId)) return null;
  return {
    openCreationMode: s.openCreationMode || null,
    editingRaceId: s.editingRaceId || null,
    editingRunId: s.openCreationMode === 'run' ? (s.editingRunId || null) : null,
  };
}

function sameScreen(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Começa a guardar. Devolve a função que pára. */
export function startNavigationPersistence(store, {
  storage = defaultStorage(),
  now = () => Date.now(),
  doc = globalThis.document,
  win = globalThis.window,
} = {}) {
  const withPrefills = (s) => {
    const screen = screenOf(s);
    if (!screen) return null;
    const out = { ...screen };
    for (const k of PREFILLS) if (s[k] != null) out[k] = s[k];
    return out;
  };
  let screen = withPrefills(store.getState());

  const write = () => {
    try {
      storage?.setItem(KEY, JSON.stringify({ activeTab: store.getState().activeTab, screen, savedAt: now() }));
    } catch { /* sem storage — o pior caso é o de antes: volta ao Início */ }
  };

  const unsubscribe = store.subscribe((s, prev) => {
    const cur = screenOf(s);
    if (!sameScreen(cur, screenOf(prev))) {
      // Os prefills leem-se AO ABRIR: o ecrã consome-os e limpa-os ao montar.
      screen = withPrefills(s);
      write();
    } else if (s.activeTab !== prev.activeTab) {
      write();
    }
  });
  // Ao sair da app é que a hora conta: a janela mede o tempo fora dela.
  const onHidden = () => { if (doc?.visibilityState === 'hidden') write(); };
  doc?.addEventListener?.('visibilitychange', onHidden);
  win?.addEventListener?.('pagehide', write);

  return () => {
    unsubscribe();
    doc?.removeEventListener?.('visibilitychange', onHidden);
    win?.removeEventListener?.('pagehide', write);
  };
}

/** O que guardar() deixou, se a app saiu há menos de `maxAgeMs`; senão null. */
export function readRecentNavigation({ storage = defaultStorage(), now = () => Date.now(), maxAgeMs = RESTORE_WINDOW_MS } = {}) {
  try {
    const d = JSON.parse(storage?.getItem(KEY) || 'null');
    if (!d || typeof d.savedAt !== 'number') return null;
    const age = now() - d.savedAt;
    if (age < 0 || age > maxAgeMs) return null;
    return d;
  } catch {
    return null;
  }
}

/** Repõe na store o separador e o ecrã guardados (os prefills primeiro: o
    ecrã lê-os ao montar). */
export function applyNavigation(store, saved) {
  if (!saved) return;
  const s = store.getState();
  // As bancadas de teste não têm saída: só por ?tab=.
  const tab = saved.activeTab;
  if (typeof tab === 'string' && tab && !/^(design-system|audit-sandbox)$/.test(tab)) s.setActiveTab(tab);
  const screen = saved.screen;
  if (!screen) return;
  const prefills = {};
  for (const k of PREFILLS) if (screen[k] != null) prefills[k] = screen[k];
  store.setState({
    ...prefills,
    openCreationMode: screen.openCreationMode || null,
    editingRaceId: screen.editingRaceId || null,
    editingRunId: screen.editingRunId || null,
  });
}

/** O ecrã reposto aponta para uma corrida ou prova que já não existe (ou
    que não carregou — arranque sem rede)? Fecha-o: um formulário em branco
    gravado por cima da corrida real apagava-a (revisão pré-deploy de
    5ce5f31). */
export function dropMissingScreen(store) {
  const s = store.getState();
  const runGone = s.openCreationMode === 'run' && s.editingRunId && !(s.runs || []).some((r) => r.id === s.editingRunId);
  const raceGone = s.editingRaceId && !(s.raceEvents || []).some((e) => e.id === s.editingRaceId);
  if (runGone || raceGone) {
    store.setState({ openCreationMode: null, editingRunId: null, editingRaceId: null, runRacePrefill: null });
  }
}

/** Esquece o ecrã guardado (terminar a sessão: não passa para outra conta). */
export function clearNavigation(storage = defaultStorage()) {
  try { storage?.removeItem(KEY); } catch { /* sem storage */ }
}
