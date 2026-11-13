// A comparação de segredos em tempo constante (auditoria de segurança,
// 2026-11-13): `a !== b` pára no primeiro carácter diferente, e o tempo da
// resposta diz quantos acertou. Usado nos cabeçalhos x-cron-secret
// (send-water-reminders, coach-proactive-tick, compute-percentile-snapshots,
// cup-standings-sync) e na assinatura dos links do race-calendar.
//
// Percorre sempre o comprimento do mais comprido: um segredo de outro tamanho
// também não responde mais depressa.

export function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
