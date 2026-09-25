// A água espera pela Carol (specs/carol-omnisciencia-omnipresenca.md, P.10).
//
// Um lembrete de água logo a seguir a uma notificação dela eram duas
// notificações seguidas da mesma voz, e a segunda tapava a primeira no ecrã
// bloqueado. Nos 30 minutos depois de uma notificação da Carol
// (coach_proactive_pushes.sent_at) a água não sai; não se grava nada, por
// isso volta a tentar-se na execução seguinte (de 5 em 5 minutos) e sai logo
// que o intervalo passar.

export const CAROL_QUIET_MINUTES = 30;

/** O instante (ISO) a partir do qual uma notificação da Carol ainda cala a água. */
export function carolQuietSince(nowMs: number, minutes = CAROL_QUIET_MINUTES): string {
  return new Date(nowMs - minutes * 60000).toISOString();
}

/** Os atletas com uma notificação da Carol dentro do intervalo. `rows` são
 *  linhas de coach_proactive_pushes (user_id, sent_at). */
export function usersQuietAfterCarol(
  rows: Array<{ user_id?: string | null; sent_at?: string | null }> | null | undefined,
  nowMs: number,
  minutes = CAROL_QUIET_MINUTES,
): Set<string> {
  const since = nowMs - minutes * 60000;
  const out = new Set<string>();
  for (const r of rows || []) {
    const at = r?.sent_at ? Date.parse(r.sent_at) : NaN;
    // Um sent_at no futuro (relógio de outro lado) também conta: é recente.
    if (r?.user_id && Number.isFinite(at) && at >= since) out.add(r.user_id);
  }
  return out;
}
