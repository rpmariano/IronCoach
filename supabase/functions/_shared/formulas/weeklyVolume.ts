// Agregação de volume de corrida por semana de calendário (segunda a domingo).
//
// @contexto Bug real (2026-08-25): o atleta perguntou à Carol "quantos km fiz
// de corrida a semana passada" e ela respondeu "zero", apesar de 65 km em 3
// corridas em 2026-08-21 (sexta-feira anterior) estarem na base de dados. A
// raiz não era falta de dados — o ACWR (janela ROLANTE de 7 dias) já continha
// esse número corretamente — mas sim a ausência de um agregado no FORMATO da
// pergunta: "semana passada" é uma semana de CALENDÁRIO (segunda-domingo),
// não uma janela rolante. Ver specs/formulas-checklist.md (Carol — omnisciência).
//
// Esta função existe para dar à Carol (e a qualquer consumidor futuro) o
// mesmo número, pré-calculado, no formato que o atleta realmente usa quando
// fala de "esta semana" / "semana passada" — sem obrigar o modelo a somar a
// lista de corridas linha a linha (fonte do erro original) nem a fazer
// aritmética de datas mentalmente.
//
// Deliberadamente T1 puro: zero dependências, sem `date-fns`, sem `Date`
// dependente de timezone do sistema — todo o cálculo de dia-da-semana é feito
// em UTC sobre a string YYYY-MM-DD, exatamente como o resto de `_shared/formulas`.

export interface WeeklyVolumeRunLike {
  date: string;
  distance_km: number | null;
}

export interface WeekVolume {
  /** Segunda-feira da semana, YYYY-MM-DD. */
  startISO: string;
  /** Domingo da semana, YYYY-MM-DD. */
  endISO: string;
  km: number;
  count: number;
}

export interface CalendarWeeklyVolume {
  currentWeek: WeekVolume;
  previousWeek: WeekVolume;
}

function mondayOfWeek(dateISO: string): string {
  const d = new Date(dateISO + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=domingo .. 6=sábado
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sumWeek(runs: WeeklyVolumeRunLike[], startISO: string, endISO: string): WeekVolume {
  const inRange = runs.filter((r) => r.date && r.date >= startISO && r.date <= endISO);
  const km = Math.round(inRange.reduce((s, r) => s + (Number(r.distance_km) || 0), 0) * 100) / 100;
  return { startISO, endISO, km, count: inRange.length };
}

/**
 * Agrega `runs` em duas semanas de calendário (segunda a domingo): a semana
 * que contém `todayISO` ("esta semana", ainda pode estar a decorrer) e a
 * semana imediatamente anterior ("semana passada", sempre completa).
 */
export function computeCalendarWeeklyVolume(
  runs: WeeklyVolumeRunLike[],
  todayISO: string,
): CalendarWeeklyVolume {
  const currentMonday = mondayOfWeek(todayISO);
  const currentSunday = addDaysISO(currentMonday, 6);
  const previousMonday = addDaysISO(currentMonday, -7);
  const previousSunday = addDaysISO(currentMonday, -1);
  return {
    currentWeek: sumWeek(runs, currentMonday, currentSunday),
    previousWeek: sumWeek(runs, previousMonday, previousSunday),
  };
}
