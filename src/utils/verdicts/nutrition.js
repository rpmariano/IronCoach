/**
 * Veredicto do módulo Nutrição.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo).
 */

import { fmtNumber, NO_DATA } from './shared';

/**
 * @param {object} input
 * @param {object} [input.adherence] calculateMacroAdherence(...)
 * @param {{average:number,isAtRisk:boolean,daysAtRisk:number}} [input.ea]
 *   calculateEnergyAvailability(...)
 */
export function nutritionVerdict({ adherence, ea } = {}) {
  const calActual = Number(adherence?.calories?.actual || 0);
  const days = (adherence?.dailyBreakdown || []).length;
  if (calActual <= 0 && days === 0) return NO_DATA;

  const calPct = Number(adherence?.calories?.compliance_pct || 0);
  const protPct = Number(adherence?.protein?.compliance_pct || 0);
  const carbPct = Number(adherence?.carbs?.compliance_pct || 0);
  const eaAvg = Number(ea?.average || 0);

  /* 1. Disponibilidade energética em zona clínica — o risco real (RED-S).
     `hasEa` distingue "não há EA medida" (média 0 por falta de dados) de
     "a EA é mesmo baixa", incluindo negativa — que acontece a quem treina
     e não regista o que come, e é pior que 29, não melhor. */
  const hasEa = !!ea && ((ea.daily || []).length > 0 || eaAvg !== 0);
  if (hasEa && eaAvg < 30) {
    return {
      text: `Estás a comer abaixo do que gastas. A disponibilidade energética está em ${fmtNumber(eaAvg, 0)} kcal/kg e abaixo de 30 é onde se perde osso, hormonas e prontidão.`,
      tone: 'danger',
    };
  }

  // 2. Zona de vigilância da EA.
  if (hasEa && eaAvg < 45 && calPct > 0 && calPct < 90) {
    return {
      text: `Comes a menos para o que treinas. A energia disponível está em ${fmtNumber(eaAvg, 0)} kcal/kg, com ${fmtNumber(calPct, 0)}% do alvo calórico.`,
      tone: 'warn',
    };
  }

  // 3. Proteína curta — é dela que depende a recuperação.
  if (protPct > 0 && protPct < 85) {
    return {
      text: `A proteína anda ${fmtNumber(100 - protPct, 0)}% abaixo do alvo. Sem ela não recuperas do que corres.`,
      tone: 'warn',
    };
  }

  // 4. Calorias curtas.
  if (calPct > 0 && calPct < 85) {
    return {
      text: `Ficas curto nas calorias: ${fmtNumber(calPct, 0)}% do alvo. É aqui que se perde prontidão.`,
      tone: 'warn',
    };
  }

  // 5. Calorias a mais.
  if (calPct > 115) {
    return {
      text: `Andas a comer acima do alvo: ${fmtNumber(calPct, 0)}% das calorias. Não é o que precisas nesta fase.`,
      tone: 'warn',
    };
  }

  // 6. Hidratos curtos com o resto em ordem — o detalhe que trava os longos.
  if (carbPct > 0 && carbPct < 80) {
    return {
      text: `Os hidratos ficam ${fmtNumber(100 - carbPct, 0)}% abaixo do alvo. São eles que pagam os treinos longos.`,
      tone: 'warn',
    };
  }

  return {
    text: `Comes o que precisas: ${fmtNumber(calPct, 0)}% das calorias e ${fmtNumber(protPct, 0)}% da proteína.`,
    tone: 'ok',
  };
}
