import { fmtNumber } from '../../utils/verdicts/shared';
import { plural } from '../BI/period';

/**
 * Pequenos textos do Ginásio da Evolução (2026-10-04), para o dashboard e os
 * cartões escreverem as mesmas frases (vírgula decimal, plurais certos).
 */

/** "1,7" / "2" — uma casa decimal, sem ",0" num número redondo. */
export function perWeekNum(n) {
  const r = Math.round(Number(n) * 10) / 10;
  return fmtNumber(r, Number.isInteger(r) ? 0 : 1);
}

export const diasFechados = (n) => `${n} ${plural(n, 'dia fechado', 'dias fechados')}`;
export const semanasFechadas = (n) => `${n} ${plural(n, 'semana fechada', 'semanas fechadas')}`;
export const treinosForca = (n) => `${n} ${plural(n, 'treino de força', 'treinos de força')}`;
export const aulasN = (n) => `${n} ${plural(n, 'aula', 'aulas')}`;
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
