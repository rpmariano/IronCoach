/* Os prazos do arranque (bug de 2026-11-17: a app presa no logo ao voltar a ela).

   · BOOT_SESSION_TIMEOUT_MS — quanto o arranque espera pela sessão (getSession) antes de sair do
     logo para o ecrã «a ligação está lenta». A resposta que chegar depois continua a valer.
   · BOOT_DEADLINE_MS — o prazo duro do logo, aconteça o que acontecer.
   · LAZY_IMPORT_TIMEOUT_MS — um import() de um ecrã que nunca responde conta como falhado. */

export const BOOT_SESSION_TIMEOUT_MS = 8000;
export const BOOT_DEADLINE_MS = 15000;
export const LAZY_IMPORT_TIMEOUT_MS = 30000;

/** A promessa, ou uma rejeição (TimeoutError) se não acabar em `ms`. */
export function withDeadline(promise, ms, label = 'pedido') {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label}: sem resposta em ${ms} ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/* O tempo conta só com a página à vista (revisão pré-deploy de a78b80bb): o Android congela a
   página em segundo plano com o temporizador a correr, e ao voltar ele disparava logo — uma recarga
   sem razão, precisamente no regresso à app. E uma rede lenta que ainda avança não é uma rede
   pendurada: se chegou algum ficheiro há pouco (Resource Timing), o prazo estica.

   `doc`, `now` e `lastActivity` são injetáveis para os testes. */
export const IMPORT_ACTIVITY_GRACE_MS = 10000;
export const IMPORT_MAX_VISIBLE_MS = 120000;

/** Há quantos ms terminou o último pedido de rede da página (null sem a API). */
export function msSinceLastResource({ perf = globalThis.performance } = {}) {
  try {
    const entries = perf?.getEntriesByType?.('resource') || [];
    if (!entries.length) return null;
    const last = Math.max(...entries.map((e) => e.responseEnd || 0));
    return Math.max(0, perf.now() - last);
  } catch { return null; }
}

/** Como withDeadline, mas o prazo só corre com a página visível e estica enquanto a rede avança. */
export function withVisibleDeadline(promise, ms, label = 'pedido', {
  doc = globalThis.document,
  now = () => Date.now(),
  lastActivity = () => msSinceLastResource(),
  graceMs = IMPORT_ACTIVITY_GRACE_MS,
  maxVisibleMs = IMPORT_MAX_VISIBLE_MS,
} = {}) {
  let timer = null;
  let remaining = ms;
  let visibleSpent = 0;
  let startedAt = null;
  let onVisibility = null;
  let rejectFn = null;
  const hidden = () => !!doc?.hidden;
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (startedAt != null) {
      const spent = now() - startedAt;
      remaining -= spent;
      visibleSpent += spent;
      startedAt = null;
    }
  };
  const fire = () => {
    timer = null;
    const spent = startedAt != null ? now() - startedAt : 0;
    visibleSpent += spent;
    startedAt = null;
    const since = lastActivity();
    if (since != null && since < graceMs && visibleSpent < maxVisibleMs) {
      remaining = graceMs;
      arm();
      return;
    }
    const err = new Error(`${label}: sem resposta em ${ms} ms com a página à vista`);
    err.name = 'TimeoutError';
    rejectFn?.(err);
  };
  const arm = () => {
    if (hidden() || timer) return;
    startedAt = now();
    timer = setTimeout(fire, Math.max(0, remaining));
  };
  const timeout = new Promise((_, reject) => {
    rejectFn = reject;
    onVisibility = () => { if (hidden()) stop(); else arm(); };
    doc?.addEventListener?.('visibilitychange', onVisibility);
    arm();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
    doc?.removeEventListener?.('visibilitychange', onVisibility);
  });
}
