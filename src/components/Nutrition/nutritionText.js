/**
 * Textos da Nutrição por período (fase 4 da Evolução, 2026-10-04): datas
 * curtas, intervalos, dias da semana e o treino de um dia, como no mock-up
 * aprovado "Evolução · Nutrição por período" ("ter, 29 set", "21 – 26 set",
 * "corrida 12 km", "às quartas"). Puro (sem React): também o lê a vista
 * pré-calculada (src/store/evolution/views/nutrition.js).
 *
 * Datas sempre em ISO "AAAA-MM-DD" lidas como UTC ao meio-dia — o dia não
 * muda com o fuso nem com a hora de verão.
 */
import { fmtNumber } from '../../utils/verdicts/shared';

export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// Índice 0 = segunda (como calendarPeriod.ts isoWeekday).
export const WD_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
export const WD_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
export const WD_LETTER = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
export const WD_PLURAL = ['segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos'];
export const WD_ON = ['às segundas', 'às terças', 'às quartas', 'às quintas', 'às sextas', 'aos sábados', 'aos domingos'];

export function isoParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [NaN, NaN, NaN];
}

/** 0 = segunda … 6 = domingo. */
export function weekdayIdx(iso) {
  const [y, m, d] = isoParts(iso);
  return (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() + 6) % 7;
}

const yearOf = (iso) => isoParts(iso)[0];

/** Inteiro com espaço nos milhares: "2 290". */
export const fmtInt = (n) => fmtNumber(Math.round(Number(n)), 0);

/** "ter, 29 set" (com o ano quando não é o de hoje). */
export function dayShort(iso, todayISO) {
  const [y, m, d] = isoParts(iso);
  const year = todayISO && yearOf(todayISO) !== y ? ` ${y}` : '';
  return `${WD_SHORT[weekdayIdx(iso)]}, ${d} ${MONTHS_SHORT[m - 1]}${year}`;
}

/** "ter 29" — as pílulas dos dias de treino. */
export function dayChip(iso) {
  return `${WD_SHORT[weekdayIdx(iso)]} ${isoParts(iso)[2]}`;
}

/** "terça, 29 de setembro" (leitor de ecrã). */
export function dayLong(iso, todayISO) {
  const [y, m, d] = isoParts(iso);
  const year = todayISO && yearOf(todayISO) !== y ? ` de ${y}` : '';
  return `${WD_LONG[weekdayIdx(iso)]}, ${d} de ${MONTHS_LONG[m - 1]}${year}`;
}

/** "21 – 26 set", "28 set – 4 out", "29 dez 2025 – 4 jan 2026", "4 out" — a
 * mesma regra de calendarPeriod.ts (ano só quando não é o corrente). */
export function rangeText(startISO, endISO, todayISO) {
  const cur = todayISO ? yearOf(todayISO) : NaN;
  const [sy, sm, sd] = isoParts(startISO);
  const [ey, em, ed] = isoParts(endISO);
  const short = (y, m, d, withYear) => `${d} ${MONTHS_SHORT[m - 1]}${withYear ? ` ${y}` : ''}`;
  if (startISO === endISO) return short(sy, sm, sd, sy !== cur);
  if (sy !== ey) return `${short(sy, sm, sd, true)} – ${short(ey, em, ed, true)}`;
  const yearSuffix = sy !== cur ? ` ${sy}` : '';
  if (sm === em) return `${sd} – ${ed} ${MONTHS_SHORT[em - 1]}${yearSuffix}`;
  return `${short(sy, sm, sd, false)} – ${short(ey, em, ed, false)}${yearSuffix}`;
}

/** Nome de um período inteiro, para "▲ agosto: 11 de 29" e "Ver setembro":
 * semana → o intervalo; mês → "agosto"; trimestre → "jul – set"; ano → "2025".
 * O ano entra quando não é o de hoje. */
export function periodName(kind, startISO, endISO, todayISO) {
  const [y, m] = isoParts(startISO);
  const other = todayISO && yearOf(todayISO) !== y;
  if (kind === 'mes') return `${MONTHS_LONG[m - 1]}${other ? ` ${y}` : ''}`;
  if (kind === 'trimestre') {
    const q = Math.floor((m - 1) / 3);
    return `${MONTHS_SHORT[q * 3]} – ${MONTHS_SHORT[q * 3 + 2]}${other ? ` ${y}` : ''}`;
  }
  if (kind === 'ano') return String(y);
  return rangeText(startISO, endISO, todayISO);
}

/** Onde fica um período passado na frase: "em setembro", "na semana passada",
 * "no 3.º trimestre" (+ o ano quando não é o de hoje). */
export function wherePast(kind, startISO, todayISO, offset) {
  const [y, m, d] = isoParts(startISO);
  const other = todayISO && yearOf(todayISO) !== y;
  if (kind === 'mes') return `em ${MONTHS_LONG[m - 1]}${other ? ` de ${y}` : ''}`;
  if (kind === 'trimestre') return `no ${Math.floor((m - 1) / 3) + 1}.º trimestre${other ? ` de ${y}` : ''}`;
  if (kind === 'ano') return `em ${y}`;
  if (offset === -1) return 'na semana passada';
  return `na semana de ${d} ${MONTHS_SHORT[m - 1]}${other ? ` ${y}` : ''}`;
}

/** "12 km", "8,5 km". */
export function kmText(km) {
  const r = Math.round(Number(km) * 10) / 10;
  return `${fmtNumber(r, Number.isInteger(r) ? 0 : 1)} km`;
}

/** O treino de um dia: "corrida 12 km", "2 corridas, 15 km", "ginásio",
 * "aula", "corrida 8 km · ginásio". Vazio sem treino. */
export function trainingText(t) {
  if (!t) return '';
  const parts = [];
  if (t.runs === 1) parts.push(t.runKm > 0 ? `corrida ${kmText(t.runKm)}` : 'corrida');
  else if (t.runs > 1) parts.push(`${t.runs} corridas${t.runKm > 0 ? `, ${kmText(t.runKm)}` : ''}`);
  if (t.gym > 0) parts.push(t.gym === 1 ? 'ginásio' : `${t.gym} sessões de ginásio`);
  if (t.classes > 0) parts.push(t.classes === 1 ? 'aula' : `${t.classes} aulas`);
  return parts.join(' · ');
}

/** "12 quartas" / "1 quarta" / "8 sábados". */
export function weekdayCount(idx, n) {
  return `${n} ${n === 1 ? WD_LONG[idx] : WD_PLURAL[idx]}`;
}
