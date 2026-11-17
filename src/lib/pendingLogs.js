/* #116 (2026-11-07): um log que não chega ao servidor fica guardado no telemóvel e vai depois.
   Às 11:34 do 7-11 uma gravação falhou e não ficou NADA em app_logs — o mais provável é a rede ter
   caído: o pedido de gravação não saiu, e o log do erro, que vai pela mesma rede, também não. Sem
   esta fila, as falhas de rede eram precisamente as que nunca se viam.

   Logs sem sessão (revisão pré-deploy de a78b80bb): a RLS de app_logs recusa uma linha com user_id
   null — e, num insert de várias linhas, recusava o lote inteiro e deitava fora as boas. Uma linha
   sem sessão (o arranque que passou do prazo antes de a sessão chegar) fica na fila à espera de
   sessão e só sai com o user_id de quem entrar a seguir, desde que tenha entrado há pouco
   (AWAITING_SESSION_MAX_MS: o que ficou de outro dia não se atribui a ninguém). E uma recusa da
   base de dados trata-se linha a linha: só sai a linha recusada. */

const KEY = 'ironhealth.pendingAppLogs';
const MAX = 20;
export const AWAITING_SESSION_MAX_MS = 6 * 60 * 60 * 1000;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
    else localStorage.removeItem(KEY);
  } catch { /* sem storage: perde-se, como antes */ }
}

/** Guarda uma linha de app_logs que não se conseguiu gravar (as mais recentes, até MAX). */
export function queuePendingLog(row) {
  if (!row || typeof row !== 'object') return;
  write([...read(), { ...row, meta: { ...(row.meta || {}), queuedAt: new Date().toISOString() } }]);
}

export function pendingLogs() {
  return read();
}

const keyOf = (r) => `${r.meta?.queuedAt}|${r.event}`;

let flushing = false;

/**
 * Tenta enviar as linhas guardadas. `insert(rows)` devolve { error } (como o supabase-js).
 * `userId`: a sessão de agora — as linhas sem user_id saem com ele (se forem recentes); sem ele,
 * ficam. Sem rede (erro sem código), tudo fica para a próxima. Recusada pela base de dados (com
 * código), tenta-se linha a linha e só saem as recusadas. Nunca lança.
 */
export async function flushPendingLogs(insert, { userId = null, now = () => Date.now() } = {}) {
  if (flushing || typeof insert !== 'function') return 0;
  const queued = read();
  if (!queued.length) return 0;
  const isStale = (r) => {
    const at = Date.parse(r.meta?.queuedAt || '');
    return !Number.isFinite(at) || now() - at > AWAITING_SESSION_MAX_MS;
  };
  // As sem sessão e velhas demais saem sem ir a lado nenhum; as recentes esperam por uma sessão.
  const dropped = new Set(queued.filter((r) => !r.user_id && isStale(r)).map(keyOf));
  const ready = queued
    .filter((r) => !dropped.has(keyOf(r)))
    .filter((r) => r.user_id || userId)
    .map((r) => (r.user_id ? r : { ...r, user_id: userId }));
  if (!ready.length) {
    if (dropped.size) write(read().filter((r) => !dropped.has(keyOf(r))));
    return 0;
  }
  flushing = true;
  const done = new Set(dropped);
  let sent = 0;
  try {
    const { error } = (await insert(ready)) || {};
    if (!error) {
      ready.forEach((r) => done.add(keyOf(r)));
      sent = ready.length;
    } else if (error.code) {
      // O lote foi recusado: linha a linha, para uma má não levar as outras.
      for (const row of ready) {
        try {
          const { error: rowError } = (await insert([row])) || {};
          if (!rowError) { done.add(keyOf(row)); sent += 1; }
          else if (rowError.code) done.add(keyOf(row)); // recusada: não ia passar nunca
          else break; // a rede caiu a meio: o resto fica para a próxima
        } catch { break; }
      }
    }
    // Só se tiram as tratadas: entretanto pode ter entrado outra.
    write(read().filter((r) => !done.has(keyOf(r))));
    return sent;
  } catch {
    return 0;
  } finally {
    flushing = false;
  }
}

export const __resetPendingLogsForTests = () => { flushing = false; write([]); };
