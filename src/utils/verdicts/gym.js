/**
 * Veredicto do módulo Ginásio.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo).
 */

import { fmtNumber, spellFem, capitalize, countFem, NO_DATA, streakDirection } from './shared';

/**
 * @param {object} input
 * @param {Array<{weekLabel:string,volumeLoad:number}>} [input.weeklyBreakdown]
 *   calculateVolumeLoad(gymSessions, range).weeklyBreakdown
 * @param {number} [input.strengthSessions] sessões de força no período
 * @param {number} [input.classes] aulas no período
 * @param {number} [input.weeksInRange] semanas cobertas pelo período
 * @param {number} [input.totalVolumeLoad] kg totais no período
 * @param {number} [input.runCount] corridas registadas — sem nenhuma, o
 *   volume de corrida não entra na frase
 */
export function gymVerdict({
  weeklyBreakdown = [],
  strengthSessions = 0,
  classes = 0,
  weeksInRange = 4,
  totalVolumeLoad = 0,
  runCount = 0,
} = {}) {
  const totalSessions = Number(strengthSessions) + Number(classes);
  if (totalSessions <= 0) return NO_DATA;

  const weeks = Math.max(1, Number(weeksInRange) || 1);
  const perWeek = totalSessions / weeks;
  const loads = (weeklyBreakdown || []).map(w => Number(w?.volumeLoad || 0));
  const load = streakDirection(loads);
  // Um atleta só de ginásio não tem volume de corrida para aguentar
  // (revisão de 2026-09-26).
  const runs = Number(runCount) > 0;

  // 1. Frequência a menos — o ginásio só protege a corrida se for regular.
  if (perWeek < 1) {
    return {
      text: `Vais ao ginásio a menos para isto contar. ${fmtNumber(totalSessions, 0)} ${totalSessions === 1 ? 'sessão' : 'sessões'} em ${spellFem(weeks)} semanas${runs ? ` não ${totalSessions === 1 ? 'segura' : 'seguram'} o volume de corrida` : ''}; o alvo são duas por semana.`,
      tone: 'warn',
    };
  }

  // 2. Carga a cair duas ou mais semanas seguidas.
  if (load.direction < 0 && load.weeks >= 2) {
    const last = loads[loads.length - 1];
    const before = loads[loads.length - 1 - load.weeks];
    return {
      text: `A carga desceu ${spellFem(load.weeks)} semanas seguidas, de ${fmtNumber(before, 0)} para ${fmtNumber(last, 0)} kg. Sem carga a subir não ganhas força.`,
      tone: 'warn',
    };
  }

  // 3. Frequência entre uma e duas — vai lá, mas não chega.
  if (perWeek < 1.7) {
    const n = countFem(perWeek);
    const vezes = n === 'uma' ? 'uma vez' : `${n} vezes`;
    return {
      text: `Vais ${vezes} por semana${runs ? ', pouco para aguentares o volume de corrida' : ''}. O alvo são duas.`,
      tone: 'warn',
    };
  }

  // 4. Duas por semana com carga a subir — o cenário bom.
  if (load.direction > 0) {
    return {
      text: `${capitalize(countFem(perWeek))} sessões por semana com carga a subir${runs ? ' — suficiente para aguentar o volume de corrida.' : '. Podes manter o ritmo.'}`,
      tone: 'ok',
    };
  }

  // 5. Duas por semana, carga estável.
  return {
    text: `Vais ao ginásio o suficiente: ${fmtNumber(perWeek, 1)} sessões por semana e ${fmtNumber(totalVolumeLoad, 0)} kg de carga no período.`,
    tone: 'ok',
  };
}
