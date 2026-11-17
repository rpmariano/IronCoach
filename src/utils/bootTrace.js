/* O rasto do arranque (bug de 2026-11-17, o Rui: «quase sempre que volto à app ela reinicia e a
   maior parte das vezes fica preso no logotipo»).

   O app_boot de app_logs só se escreve DEPOIS de haver sessão — um arranque preso no logo não deixa
   linha nenhuma, e o report não diz onde parou. Este rasto guarda-se no telemóvel (localStorage),
   uma escrita por fase, para sobreviver a a app ser deitada abaixo a meio:

   · o index.html abre o rasto (bootTraceStart, inline, antes de o JavaScript da app chegar);
   · cada fase regista os ms desde o início da página (performance.now());
   · o arranque fecha-o com o motivo de saída (bootExit).

   Um rasto sem saída é um arranque que nunca acabou. O arranque seguinte manda-o para app_logs
   (boot_stuck), e o report de bug junta os últimos rastos (boot_trace). */

export const BOOT_TRACE_KEY = 'ironcoach:boot-trace';
export const BOOT_TRACE_MAX = 6;

function storage(st) {
  try { return st || globalThis.localStorage || null; } catch { return null; }
}

function nowMs(perf = globalThis.performance) {
  try { return Math.round(perf.now()); } catch { return null; }
}

/** Os rastos guardados, do mais antigo ao mais recente. */
export function readBootTraces(st) {
  const s = storage(st);
  try {
    const list = JSON.parse(s?.getItem(BOOT_TRACE_KEY) || '[]');
    return Array.isArray(list) ? list.filter((t) => t && typeof t === 'object') : [];
  } catch { return []; }
}

function writeBootTraces(list, st) {
  const s = storage(st);
  try { s?.setItem(BOOT_TRACE_KEY, JSON.stringify(list.slice(-BOOT_TRACE_MAX))); } catch { /* sem storage */ }
}

/* O id do rasto deste carregamento da página: o que o index.html abriu (window.__bootTraceAt) ou,
   sem ele (testes, um index.html antigo), um aberto aqui. */
let currentId = null;
function currentTraceId(win = globalThis.window, st) {
  if (currentId != null) return currentId;
  const fromHtml = win && typeof win.__bootTraceAt === 'number' ? win.__bootTraceAt : null;
  if (fromHtml != null && readBootTraces(st).some((t) => t.at === fromHtml)) {
    currentId = fromHtml;
    return currentId;
  }
  currentId = bootTraceStart({ st });
  return currentId;
}

/** Abre um rasto novo (o index.html faz o mesmo, inline). Devolve o id. */
export function bootTraceStart({ st, at = Date.now() } = {}) {
  const list = readBootTraces(st);
  list.push({ at, p: { html: 0 }, exit: null });
  writeBootTraces(list, st);
  return at;
}

function update(fn, st) {
  const id = currentTraceId(undefined, st);
  const list = readBootTraces(st);
  const t = list.find((x) => x.at === id);
  if (!t) return;
  fn(t);
  writeBootTraces(list, st);
}

/** Regista uma fase (só a primeira vez de cada uma). */
export function bootPhase(name, { st, ms = nowMs() } = {}) {
  update((t) => {
    t.p = t.p || {};
    if (t.p[name] == null) t.p[name] = ms;
  }, st);
}

/** Fecha o rasto com o motivo de saída — só o primeiro conta. */
export function bootExit(reason, { st, ms = nowMs() } = {}) {
  update((t) => {
    if (t.exit) return;
    t.exit = reason;
    t.p = t.p || {};
    t.p.exit = ms;
  }, st);
}

/** O rasto anterior que nunca acabou (o arranque preso que o atleta deitou abaixo), ou null. */
export function previousUnfinishedTrace(st) {
  const id = currentTraceId(undefined, st);
  const before = readBootTraces(st).filter((t) => t.at !== id && !t.reported);
  const last = before[before.length - 1];
  return last && !last.exit ? last : null;
}

/** Marca um rasto como já enviado para app_logs, para não o mandar duas vezes. */
export function markTraceReported(at, st) {
  const list = readBootTraces(st);
  const t = list.find((x) => x.at === at);
  if (!t) return;
  t.reported = true;
  writeBootTraces(list, st);
}

/** O rasto deste carregamento (para o app_boot). */
export function currentBootTrace(st) {
  const id = currentTraceId(undefined, st);
  return readBootTraces(st).find((t) => t.at === id) || null;
}

/** Só para testes. */
export function resetBootTrace() { currentId = null; }
