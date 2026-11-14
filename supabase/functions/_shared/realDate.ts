// Uma data YYYY-MM-DD que existe no calendário (auditoria de segurança,
// 2026-11-14): o regex /^\d{4}-\d{2}-\d{2}$/ deixava passar «2026-13-40», o
// Gemini era chamado (e pago) e o INSERT falhava depois — sem o consumo
// contar. Valida-se antes da chamada.

/** A data é YYYY-MM-DD e existe (2026-02-29 não; 2028-02-29 sim). */
export function isRealDateISO(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
