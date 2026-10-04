/**
 * Veredicto do módulo Nutrição.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo).
 *
 * 2026-10-04 (fase 4, N7): UMA só régua — a de @formulas/nutritionPeriod.ts
 * (classifyMacroDay): 90–115% do objetivo é "dentro"; proteína e água sem
 * teto. Antes o veredicto usava 85% (calorias e proteína) e 80% (hidratos)
 * enquanto os KPIs pintavam 85–89% a vermelho: o ecrã dizia "Comes o que
 * precisas" ao lado de um número a vermelho.
 */

import { fmtNumber, capitalize, NO_DATA } from './shared';

/** O limiar de "dentro" da régua única (nutritionCompliance.ts / nutritionPeriod.ts). */
const IN_GOAL_MIN = 90;
const OVER_MAX = 115;

/**
 * Veredicto da vista Dia (hoje). Recebe o que o biEngine já calculou.
 *
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
  if (hasEa && eaAvg < 45 && calPct > 0 && calPct < IN_GOAL_MIN) {
    return {
      text: `Comes a menos para o que treinas. A energia disponível está em ${fmtNumber(eaAvg, 0)} kcal/kg, com ${fmtNumber(calPct, 0)}% do alvo calórico.`,
      tone: 'warn',
    };
  }

  // 3. Proteína curta — é dela que depende a recuperação. (N7: 90, não 85.)
  if (protPct > 0 && protPct < IN_GOAL_MIN) {
    return {
      text: `A proteína anda ${fmtNumber(100 - protPct, 0)}% abaixo do alvo. Sem ela não recuperas do que corres.`,
      tone: 'warn',
    };
  }

  // 4. Calorias curtas. (N7: 90, não 85.)
  if (calPct > 0 && calPct < IN_GOAL_MIN) {
    return {
      text: `Ficas curto nas calorias: ${fmtNumber(calPct, 0)}% do alvo. É aqui que se perde prontidão.`,
      tone: 'warn',
    };
  }

  // 5. Calorias a mais.
  if (calPct > OVER_MAX) {
    return {
      text: `Andas a comer acima do alvo: ${fmtNumber(calPct, 0)}% das calorias. Não é o que precisas nesta fase.`,
      tone: 'warn',
    };
  }

  // 6. Hidratos curtos com o resto em ordem — o detalhe que trava os longos. (N7: 90, não 80.)
  if (carbPct > 0 && carbPct < IN_GOAL_MIN) {
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

/* ── Veredicto de um PERÍODO (fase 4, 2026-10-04) ───────────────────────────
   Factos do mock-up aprovado, só sobre dias fechados (R2) e com o objetivo
   de cada dia (F3): "Calorias no sítio (96%), mas a proteína está curta: 88%
   do objetivo — só 2 de 6 dias lá chegaram." Os números chegam já calculados
   pela vista (src/store/evolution/views/nutrition.js). */

/** Mínimo de dias com refeições antes de um estado (R6). */
export const NUTRITION_VERDICT_MIN_DAYS = 4;
/** "Em N dias de treino comeste abaixo do objetivo" só a partir de N = 3. */
export const TRAINING_BELOW_MIN_DAYS = 3;

const dias = (n) => (Number(n) === 1 ? 'dia' : 'dias');
const pctTxt = (s) => `${fmtNumber(s.pctLabel, 0)}%`;

/* "só 2 de 6 dias lá chegaram" / "nenhum dos 6 dias lá chegou" / "5 de 6
   dias lá chegaram" (sem o "só" quando foi a maioria). */
function reached(k, n) {
  if (k === 0) return `nenhum dos ${n} ${dias(n)} lá chegou`;
  const verb = k === 1 ? 'chegou' : 'chegaram';
  return `${k * 2 < n ? 'só ' : ''}${k} de ${n} ${dias(n)} lá ${verb}`;
}

const WEEKDAY_PLURAL = ['às segundas', 'às terças', 'às quartas', 'às quintas', 'às sextas', 'aos sábados', 'aos domingos'];
const weekdayOf = (iso) => (new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7;

/* ", sobretudo às quartas" — só quando um dia da semana tem mais de metade
   dos casos (e pelo menos 2). */
function mostlyOn(dates) {
  if (!dates || dates.length < 3) return '';
  const count = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dates) count[weekdayOf(d)] += 1;
  const max = Math.max(...count);
  if (max < 2 || max * 2 <= dates.length) return '';
  return `, sobretudo ${WEEKDAY_PLURAL[count.indexOf(max)]}`;
}

/**
 * @param {object} input
 * @param {object} input.summary   summarizeNutritionPeriod(...) dos dias fechados
 * @param {boolean} input.isCurrent  o período está em curso (tempo presente)
 * @param {string} [input.where]   "em setembro" / "na semana passada" / "no 3.º
 *   trimestre" — num período passado abre a frase; no em curso entra só nas
 *   frases de poucos dados ("nesta semana")
 * @param {object} [input.eating]  eatingForTraining(...)
 * @param {object} [input.ea]      energyAvailabilityForDays(...)
 * @param {number} [input.minDays]
 * @returns {{text:string, tone:'ok'|'warn'|'danger'|'neutral'}}
 */
export function nutritionPeriodVerdict({ summary, isCurrent = true, where = '', eating, ea, minDays = NUTRITION_VERDICT_MIN_DAYS } = {}) {
  const n = Number(summary?.nDays || 0);
  const past = !isCurrent;
  const onde = String(where || '').trim();

  if (!summary || n === 0) {
    return past && onde
      ? { text: `${capitalize(onde)} não registaste refeições.`, tone: 'neutral' }
      : { text: 'Ainda não há refeições registadas nos dias fechados.', tone: 'neutral' };
  }
  if (n < minDays) {
    return {
      text: `Só ${n} ${dias(n)} com registo${onde ? ` ${onde}` : ''} — poucos para conclusões.`,
      tone: 'neutral',
    };
  }

  // Num período passado a frase abre com "Em setembro …"; no em curso, não.
  const open = (rest) => (past && onde ? `${capitalize(onde)} ${rest}` : capitalize(rest));
  const t = past
    ? { esta: 'esteve', fica: 'ficou', ficam: 'ficaram', passam: 'passaram', estao: 'ficaram' }
    : { esta: 'está', fica: 'está', ficam: 'estão', passam: 'passam', estao: 'estão' };

  // 1. Energia disponível em zona de risco (só com dias que cheguem).
  if (ea && Number(ea.nDays) >= minDays && ea.average != null && ea.average < 30) {
    const estimate = ea.leanMassSource === 'omissao';
    // 2026-10-04: com avaliação (só peso), o que falta é a gordura dela, não «avaliação de composição».
    return {
      text: open(`a energia que sobra depois do treino ${t.fica} em ${fmtNumber(ea.average, 0)} kcal por kg de massa magra, em média${estimate ? (ea.leanMassDate ? ' (estimativa: a última avaliação não tem gordura medida)' : ' (estimativa: sem avaliação de composição corporal)') : ''}. Abaixo de 30 é onde se perde osso, hormonas e prontidão.`),
      // Sem massa magra medida nem estimada a partir de uma avaliação, é uma
      // estimativa fraca de uma estimativa fraca (energyAvailability.ts):
      // aviso, não alarme.
      tone: estimate ? 'warn' : 'danger',
    };
  }

  const cal = summary.byKey?.calories || {};
  const prot = summary.byKey?.protein || {};
  const carbs = summary.byKey?.carbs || {};

  // 2. Proteína curta (com o estado das calorias na mesma frase, como no mock-up).
  if (prot.status === 'below') {
    const chegaram = reached(prot.daysInGoal, prot.nDays);
    if (cal.status === 'ok') {
      return {
        text: past
          ? open(`as calorias ficaram no sítio (${pctTxt(cal)}), mas a proteína ficou curta: ${pctTxt(prot)} do objetivo — ${chegaram}.`)
          : `Calorias no sítio (${pctTxt(cal)}), mas a proteína está curta: ${pctTxt(prot)} do objetivo — ${chegaram}.`,
        tone: 'warn',
      };
    }
    if (cal.status === 'below') {
      const b = summary.both || { k: 0, n };
      return {
        text: open(`as calorias e a proteína ${t.estao} curtas: ${pctTxt(cal)} e ${pctTxt(prot)} do objetivo — ${b.k === 0 ? 'nenhum dia com as duas no objetivo' : `${b.k * 2 < b.n ? 'só ' : ''}${b.k} de ${b.n} ${dias(b.n)} com as duas no objetivo`}.`),
        tone: 'warn',
      };
    }
    if (cal.status === 'above') {
      return {
        text: open(`as calorias ${t.passam} do objetivo (${pctTxt(cal)}), mas a proteína ${t.fica} curta: ${pctTxt(prot)} — ${chegaram}.`),
        tone: 'warn',
      };
    }
    return { text: open(`a proteína ${t.fica} curta: ${pctTxt(prot)} do objetivo — ${chegaram}.`), tone: 'warn' };
  }

  // 3. Calorias curtas.
  if (cal.status === 'below') {
    return {
      text: open(`as calorias ${t.ficam} curtas: ${pctTxt(cal)} do objetivo — ${cal.daysInGoal} de ${cal.nDays} ${dias(cal.nDays)} no objetivo.`),
      tone: 'warn',
    };
  }

  // 4. Calorias a mais.
  if (cal.status === 'above') {
    return {
      text: open(`as calorias ${t.passam} do objetivo: ${pctTxt(cal)} — ${cal.daysAbove} de ${cal.nDays} ${dias(cal.nDays)} acima.`),
      tone: 'warn',
    };
  }

  // 5. A média no sítio, mas os dias de treino abaixo do objetivo.
  const below = eating?.withTraining?.belowDays || [];
  if (cal.status === 'ok' && below.length >= TRAINING_BELOW_MIN_DAYS) {
    return {
      text: open(`a média ${t.esta} no sítio — ${pctTxt(cal)} das calorias e ${pctTxt(prot)} da proteína —, mas em ${below.length} dias de treino comeste abaixo do objetivo${mostlyOn(below)}.`),
      tone: 'warn',
    };
  }

  // 6. Hidratos curtos com o resto em ordem — o detalhe que trava os longos.
  if (carbs.status === 'below') {
    return {
      text: open(`calorias e proteína no sítio, mas os hidratos ${t.ficam} curtos: ${pctTxt(carbs)} do objetivo. São eles que pagam os treinos longos.`),
      tone: 'warn',
    };
  }

  if (cal.status === 'ok' && prot.status === 'ok') {
    return { text: open(`a média ${t.esta} no sítio: ${pctTxt(cal)} das calorias e ${pctTxt(prot)} da proteína.`), tone: 'ok' };
  }
  return NO_DATA;
}
