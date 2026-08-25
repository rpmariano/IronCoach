// Filtro de "período relativo" (dia/semana/mês/trimestre/6 meses/ano) usado
// pelos seletores de intervalo dos dashboards de BI (TimeFilterBar).
//
// @contexto Extraído de src/utils/biEngine.js filterByDateRange
// (specs/formulas-checklist.md Fase E). O original usa `new Date()` (hora
// do dispositivo) e date-fns (subDays/subWeeks/subMonths/subYears +
// isAfter) — impuro, e com um detalhe subtil: como `now` inclui a hora
// exata do render, um registo gravado à meia-noite de "exatamente N dias
// atrás" pode entrar ou não consoante a hora do dia em que o dashboard é
// aberto. Como todas as tabelas que consomem isto guardam `date` (dia, sem
// hora), este módulo simplifica para granularidade de dia — determinístico
// dado `todayISO`, e sem essa dependência da hora do relógio. Meses/anos
// seguem a mesma regra de "clamp" do date-fns subMonths (31 Jan − 1 mês =
// 31 Dez; 31 Mar − 1 mês = 28/29 Fev), calculada em UTC a partir de
// `todayISO` para não depender do fuso do processo.

export type RelativeDateRange = "dia" | "semana" | "mes" | "trimestre" | "6meses" | "ano";

const RANGE_MONTHS: Partial<Record<RelativeDateRange, number>> = {
  mes: 1,
  trimestre: 3,
  "6meses": 6,
  ano: 12,
};

function subMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const totalMonthIndex = y * 12 + (m - 1) - months;
  const targetYear = Math.floor(totalMonthIndex / 12);
  const targetMonth0 = ((totalMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth0 + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInTargetMonth);
  return new Date(Date.UTC(targetYear, targetMonth0, day)).toISOString().slice(0, 10);
}

function subDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Devolve o dia de corte (exclusivo) de um período relativo, ou null se
 * `range` não for uma das seis chaves reconhecidas — nesse caso o chamador
 * deve tratar como "sem filtro" (mesmo comportamento do `default: return
 * data` do biEngine.js original). */
export function relativeRangeCutoffISO(todayISO: string, range: string): string | null {
  switch (range) {
    case "dia":
      return subDaysISO(todayISO, 1);
    case "semana":
      return subDaysISO(todayISO, 7);
    case "mes":
    case "trimestre":
    case "6meses":
    case "ano":
      return subMonthsISO(todayISO, RANGE_MONTHS[range as RelativeDateRange]!);
    default:
      return null;
  }
}

export function filterByRelativeDateRange<T extends { date?: string | null }>(
  rows: T[],
  todayISO: string,
  range: string,
  dateField: keyof T = "date" as keyof T,
): T[] {
  const cutoff = relativeRangeCutoffISO(todayISO, range);
  if (cutoff === null) return rows;
  return rows.filter((r) => {
    const v = r[dateField];
    return typeof v === "string" && v > cutoff;
  });
}
