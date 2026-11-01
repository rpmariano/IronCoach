// Gravar duas vezes o mesmo registo (incidente de 2026-10-31): com erros de
// comunicação, o mesmo treino de ginásio do Rui ficou gravado 4 vezes
// (17:14, 17:17, 17:17, 17:35) — cada pedido correu até ao fim no servidor
// (ai_usage tem as 4 análises), mas a resposta não chegou ao telemóvel, e o
// atleta voltou a carregar em Gravar. Cada tentativa inseria uma linha nova.
//
// A app gera um `client_request_id` (uuid) UMA vez por formulário e manda-o
// em todas as tentativas. Aqui:
//   · antes de qualquer trabalho (upload, Gemini), se já há uma linha com esse
//     id, devolve-se essa — sem gravar outra vez nem gastar a análise;
//   · a linha nova grava-se com o id; o índice único (user_id,
//     client_request_id) apanha a corrida entre duas tentativas em paralelo
//     (23505), e aí devolve-se a que ganhou.
// Um cliente antigo não manda o id: tudo como antes.

/** O id do pedido, se for um uuid; senão null (cliente antigo, ou lixo). */
export function parseClientRequestId(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
}

/** O insert bateu no índice único (outra tentativa gravou primeiro). */
// deno-lint-ignore no-explicit-any
export const isUniqueViolation = (error: any): boolean => error?.code === "23505";

/** A coluna client_request_id ainda não existe (migration por aplicar): o
 *  insert repete-se sem ela, para nunca partir a gravação por isto. */
// deno-lint-ignore no-explicit-any
export const isMissingRequestIdColumn = (error: any): boolean =>
  (error?.code === "PGRST204" || error?.code === "42703") && /client_request_id/.test(String(error?.message ?? ""));

/** A linha já gravada com este id, ou null (sem id, sem linha, ou erro). */
export async function findByClientRequestId(
  // deno-lint-ignore no-explicit-any
  sb: any,
  table: string,
  userId: string,
  clientRequestId: string | null,
  select = "*",
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  if (!clientRequestId) return null;
  const { data, error } = await sb.from(table).select(select)
    .eq("user_id", userId).eq("client_request_id", clientRequestId).maybeSingle();
  if (error) {
    if (!isMissingRequestIdColumn(error)) console.warn(`idempotência: ${table} não lida:`, error.message);
    return null;
  }
  return data ?? null;
}

/**
 * Insere `row` (com o client_request_id, se houver) e devolve `{ data }` com
 * a linha nova, `{ existing }` se outra tentativa já a gravou, ou `{ error }`.
 * Sem a coluna (migration por aplicar) repete o insert sem ela.
 */
export async function insertOnce(
  // deno-lint-ignore no-explicit-any
  sb: any,
  table: string,
  userId: string,
  row: Record<string, unknown>,
  clientRequestId: string | null,
  // deno-lint-ignore no-explicit-any
): Promise<{ data?: any; existing?: any; error?: any }> {
  const insert = (r: Record<string, unknown>) => sb.from(table).insert(r).select().single();
  let { data, error } = await insert(clientRequestId ? { ...row, client_request_id: clientRequestId } : row);
  if (error && clientRequestId && isMissingRequestIdColumn(error)) ({ data, error } = await insert(row));
  if (error && clientRequestId && isUniqueViolation(error)) {
    const existing = await findByClientRequestId(sb, table, userId, clientRequestId);
    if (existing) return { existing };
  }
  return error ? { error } : { data };
}
