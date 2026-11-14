/* O aviso de quota do resumo diário (dev-back fd125f9e) — a frase da Carol a dizer porque é que o
   «Atualizar» não trouxe um resumo novo. Expira sozinho: com o resumo de hoje em memória, o
   loadDailySummary não volta a pedir (nem a limpar o aviso), e «Tenta outra vez daqui a 12
   minutos» ficava no cartão depois de a quota passar (revisão do af9d2cb4).
   - limite da hora: até agora + retry_after_minutes (sem os minutos, uma hora);
   - limite do dia: até à mudança de dia em Lisboa. */

const HOUR_FALLBACK_MIN = 60;

/** O aviso a guardar: { text, scope, until (ms) | null, day (YYYY-MM-DD de Lisboa) }. */
export function quotaNotice({ text, scope, retryAfterMinutes, nowMs, todayISO }) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const s = scope === 'day' || scope === 'hour' ? scope : null;
  const mins = Number(retryAfterMinutes) > 0 ? Number(retryAfterMinutes) : null;
  const until = s === 'day' ? null : nowMs + (mins ?? HOUR_FALLBACK_MIN) * 60 * 1000;
  return { text, scope: s, until, day: todayISO };
}

/** O aviso ainda vale: antes do `until`, e no mesmo dia de Lisboa em que chegou. */
export function isQuotaNoticeActive(notice, nowMs, todayISO) {
  if (!notice?.text) return false;
  if (notice.day && notice.day !== todayISO) return false;
  if (Number.isFinite(notice.until) && nowMs >= notice.until) return false;
  return true;
}
