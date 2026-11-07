/* #116 (2026-11-07): um log que não chega ao servidor fica guardado no telemóvel e vai depois.
   Às 11:34 do 7-11 uma gravação falhou e não ficou NADA em app_logs — o mais provável é a rede ter
   caído: o pedido de gravação não saiu, e o log do erro, que vai pela mesma rede, também não. Sem
   esta fila, as falhas de rede eram precisamente as que nunca se viam. */

const KEY = 'ironhealth.pendingAppLogs';
const MAX = 20;

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

let flushing = false;

/**
 * Tenta enviar as linhas guardadas. `insert(rows)` devolve { error } (como o supabase-js); com erro,
 * ficam para a próxima. Nunca lança.
 */
export async function flushPendingLogs(insert) {
  if (flushing || typeof insert !== 'function') return 0;
  const rows = read();
  if (!rows.length) return 0;
  flushing = true;
  try {
    const { error } = (await insert(rows)) || {};
    // Sem rede (erro sem código): ficam para a próxima. Recusadas pela base de dados (com código,
    // ex.: RLS): saem — não iam passar nunca, e prendiam as outras.
    if (error && !error.code) return 0;
    // Só se tiram as que foram enviadas: entretanto pode ter entrado outra.
    const sent = new Set(rows.map((r) => r.meta?.queuedAt + '|' + r.event));
    write(read().filter((r) => !sent.has(r.meta?.queuedAt + '|' + r.event)));
    return error ? 0 : rows.length;
  } catch {
    return 0;
  } finally {
    flushing = false;
  }
}

export const __resetPendingLogsForTests = () => { flushing = false; write([]); };
