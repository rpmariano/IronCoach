/**
 * Constantes e helpers comuns aos veredictos dos dashboards.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo).
 */

import { addDaysISO } from '../../lib/utils';
import { segundaDe } from '../badges';

/** O que a Carol diz quando não tem nada para dizer. Nunca inventa. */
export const NO_DATA_TEXT = 'Ainda não tenho dados suficientes para te dizer como estás.';

export const NO_DATA = { text: NO_DATA_TEXT, tone: 'neutral' };

/** 72,4 · 1 980 — vírgula decimal e espaço de milhar (não o ponto anglo). */
export function fmtNumber(value, decimals = 1) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  const fixed = Math.abs(n).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = n < 0 ? '−' : '';
  return decPart ? `${sign}${grouped},${decPart}` : `${sign}${grouped}`;
}

/** "duas semanas seguidas" lê-se melhor que "2 semanas seguidas". */
const WORDS = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
export function spellFem(n) {
  const i = Math.round(Number(n));
  return WORDS[i] || String(i);
}

/** "duas" → "Duas". Só para quando a palavra abre a frase. */
export function capitalize(word) {
  const s = String(word || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* "duas", mas "1,5": só um número redondo se escreve por extenso. O
   spellFem arredondava 1,5 sessões por semana para "uma" (revisão de
   2026-09-26). */
export function countFem(n) {
  const r = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(r) ? spellFem(r) : fmtNumber(r, 1);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* "2026-09-12" → "12 de setembro". null se a data não for AAAA-MM-DD. */
export function fmtDatePt(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m || !MESES[Number(m[2]) - 1]) return null;
  // Com mais de ~11 meses (ou de outro ano) sem ano leria-se como recente.
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  const velha = Date.now() - d.getTime() > 330 * 86400000 || Number(m[1]) !== new Date().getFullYear();
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]}${velha ? ` de ${m[1]}` : ''}`;
}

/* 1,6× — uma casa decimal, como o resto da frase. Se o arredondamento a uma
   casa cair em cima do limiar que a frase cita (1,51 → "1,5×" contra "acima
   de 1,5×"), mostra duas para o número não contradizer o limiar. */
export function fmtTimes(ratio, limit) {
  return `${fmtVsLimit(ratio, limit)}×`;
}

/* Número com uma casa, ou duas se o arredondamento a uma casa igualar o
   limiar citado na mesma frase (0,41% contra "máximo 0,4%", e não "0,4%
   contra 0,4%"). Duas casas também se ainda coincidirem (1,5004). */
export function fmtVsLimit(value, limit) {
  const v = Number(value);
  if (limit === undefined || limit === null || v === limit) return fmtNumber(v, 1);
  const one = Math.round(v * 10) / 10;
  const lim1 = Math.round(Number(limit) * 10) / 10;
  if (one !== lim1) return fmtNumber(v, 1);
  const two = Math.round(v * 100) / 100;
  return fmtNumber(v, two === Math.round(Number(limit) * 100) / 100 ? 3 : 2);
}

/* R10 (2026-10-04): o ACWR são os últimos 7 dias rolantes contra a média
   semanal dos 28 — não "esta semana", e 1,62 é 1,6× o habitual, não "1,62
   vezes acima". Devolve a frase-base; os km entram só quando existem. */
export function loadSentence(acwr, ratio, limit) {
  const acute = Number(acwr?.acuteKm);
  const chronic = Number(acwr?.chronicWeeklyKm);
  const km = isFinite(acute) && isFinite(chronic) && (acute > 0 || chronic > 0)
    ? ` (${fmtNumber(acute, 1)} vs ${fmtNumber(chronic, 1)} km)` : '';
  if (!(ratio > 0)) return 'Nos últimos 7 dias não correste';
  return `Nos últimos 7 dias correste ${fmtTimes(ratio, limit)} a tua média semanal das últimas 4 semanas${km}`;
}

/**
 * Quantas leituras seguidas, a contar do fim, se mantiveram a subir (+1) ou
 * a descer (−1). Devolve 0 se a última variação é nula ou a série é curta.
 * Usa-se para "subiu quatro semanas seguidas" / "desceu duas seguidas".
 */
export function streakDirection(series) {
  const vals = (series || []).map(Number).filter(v => isFinite(v));
  if (vals.length < 2) return { direction: 0, weeks: 0 };
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  if (last === prev) return { direction: 0, weeks: 0 };
  const direction = last > prev ? 1 : -1;
  let weeks = 1;
  for (let i = vals.length - 2; i > 0; i--) {
    const d = vals[i] > vals[i - 1] ? 1 : vals[i] < vals[i - 1] ? -1 : 0;
    if (d !== direction) break;
    weeks++;
  }
  return { direction, weeks };
}

/* Os km de corrida que o plano previa em cada uma das `count` semanas que
   acabam na semana de `today` (a última é a semana em curso). null quando o
   plano não diz nada dessa semana — sem plano não há descida planeada. */
export function plannedRunKmByWeek(planItems, today, count) {
  if (!today) return Array(count).fill(null);
  const monday = segundaDe(today);
  return Array.from({ length: count }, (_, i) => {
    const start = addDaysISO(monday, -7 * (count - 1 - i));
    const end = addDaysISO(start, 6);
    const km = (planItems || [])
      .filter((it) => it && it.kind === 'corrida' && it.status !== 'cancelado'
        && typeof it.planned_date === 'string' && it.planned_date >= start && it.planned_date <= end)
      .reduce((sum, it) => sum + (Number(it.target_distance_km) || 0), 0);
    return km > 0 ? km : null;
  });
}

/* Quantas semanas seguidas, a contar do fim, o volume desceu SEM que o
   plano também descesse. Uma descarga planeada não é ficar aquém. */
export function unplannedDropStreak(weeks, planned) {
  let n = 0;
  for (let i = weeks.length - 1; i > 0; i--) {
    if (!(weeks[i] < weeks[i - 1])) break;
    if (planned[i] !== null && planned[i - 1] !== null && planned[i] < planned[i - 1]) break;
    n++;
  }
  return n;
}
