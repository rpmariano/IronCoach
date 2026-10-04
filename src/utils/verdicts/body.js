/**
 * Veredicto do módulo Corpo.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo).
 */

import { fmtNumber, spellFem, capitalize, fmtVsLimit, NO_DATA } from './shared';
import { assessWeightLossRate } from '@formulas/weightLossRate.ts';

/**
 * @param {object} input
 * @param {{trend:string|null,weeklyRate:number|null,sufficient:boolean,movingAverage:Array,rawPoints:Array}} [input.weightTrend]
 *   calculateWeightTrend(bodyAssessments) — contrato de 2026-10-04
 * @param {string} [input.experienceLevel] nível declarado (limiar de perda por nível)
 * @param {boolean} [input.hasWeighInsOutside] há pesagens fora do período mostrado
 * @param {{dates:string[],fatMassKg:number[],leanMassKg:number[]}} [input.composition]
 *   calculateCompositionTrend(bodyAssessments)
 * @param {number} [input.assessmentCount] avaliações no período
 * @param {number} [input.gymSessionCount] sessões de ginásio registadas no
 *   período — sem nenhuma, a frase não fala do ginásio
 */
export function bodyVerdict({ weightTrend, composition, assessmentCount = 0, gymSessionCount = 0, experienceLevel = null, hasWeighInsOutside = false } = {}) {
  const points = weightTrend?.rawPoints || [];
  if (!weightTrend || points.length === 0) {
    if (assessmentCount <= 0) return NO_DATA;
    return {
      text: 'Tenho avaliações sem peso registado. Sem peso não consigo dizer para onde vais.',
      tone: 'neutral',
    };
  }

  const faltaPesagens = 'Preciso de três pesagens espalhadas por pelo menos 10 dias para te dizer para onde vai o peso.';

  if (points.length < 2) {
    // 2026-10-04: com pesagens fora do período, "só tenho uma" era falso.
    const abre = hasWeighInsOutside ? 'Neste período só há uma pesagem' : 'Só tenho uma pesagem';
    return {
      text: `${abre}, de ${fmtNumber(points[0].weight, 1)} kg. ${faltaPesagens}`,
      tone: 'neutral',
    };
  }

  /* Contrato novo de computeWeightTrend (2026-10-04): sem `sufficient` (3
     pesagens em 10 dias na janela recente) não há ritmo nem tendência — nada
     de "estabilizou" nem de "perda lenta e magra" a partir de um 0 inventado. */
  if (!weightTrend.sufficient) {
    const first = Number(points[0].weight);
    const last = Number(points[points.length - 1].weight);
    return {
      text: `Tenho ${spellFem(points.length)} pesagens neste período${first === last ? `, ambas de ${fmtNumber(first, 1)} kg` : `, de ${fmtNumber(first, 1)} a ${fmtNumber(last, 1)} kg`}. ${faltaPesagens}`,
      tone: 'neutral',
    };
  }

  const rate = Number(weightTrend.weeklyRate ?? 0);
  /* Massa magra só das avaliações com a gordura medida (revisão de
     2026-09-26): sem percentagem de gordura, calculateCompositionTrend dá
     gordura 0 e a massa magra passa a ser o próprio peso — o "−1,2 kg de
     músculo" era só o peso a descer. */
  const fat = composition?.fatMassKg || [];
  const lean = (composition?.leanMassKg || []).filter((v, i) => isFinite(Number(v)) && Number(fat[i]) > 0);
  const leanDelta = lean.length >= 2 ? Number(lean[lean.length - 1]) - Number(lean[0]) : null;
  const latest = weightTrend.movingAverage?.length
    ? Number(weightTrend.movingAverage[weightTrend.movingAverage.length - 1].weight)
    : Number(points[points.length - 1].weight);

  /* 1. Perder depressa demais é o caso urgente do corpo. O limiar é em % do
     peso por semana e depende do nível (assessWeightLossRate), não um −1 kg
     absoluto igual para 50 e para 100 kg. */
  const loss = assessWeightLossRate(rate, latest, experienceLevel);
  if (loss?.isTooFast) {
    return {
      text: `Estás a perder peso depressa demais: ${fmtVsLimit(loss.lossPct, loss.maxPct)}% do peso por semana (${fmtNumber(Math.abs(rate), 1)} kg). ${experienceLevel ? `Para o teu nível o máximo saudável é ${fmtNumber(loss.maxPct, 1)}%` : `Sem nível declarado, conto com um máximo de ${fmtNumber(loss.maxPct, 1)}%`}; acima disso arriscas perder também massa magra.`,
      tone: 'danger',
    };
  }

  // 2. A perder peso e massa magra ao mesmo tempo. O ginásio só entra na
  //    frase de quem tem sessões registadas.
  if (weightTrend.trend === 'descendo' && leanDelta !== null && leanDelta <= -0.5) {
    return {
      text: `Estás a perder peso, mas também massa magra: menos ${fmtNumber(-leanDelta, 1)} kg no período. Come mais proteína${Number(gymSessionCount) > 0 ? ' e não cortes o ginásio' : ''}.`,
      tone: 'warn',
    };
  }

  if (weightTrend.trend === 'descendo') {
    // O verbo já diz o sentido: "desce 0,4 kg", não "desce −0,4 kg". Sem
    // ritmo semanal medido, não se inventa um "0,0 kg".
    const desce = Math.abs(rate) >= 0.05
      ? `o peso desce ${fmtNumber(Math.abs(rate), 1)} kg por semana`
      : 'o peso está a descer';

    // 3. A perder peso com a massa magra segura — o cenário bom.
    if (leanDelta !== null) {
      return {
        text: `Perda lenta e magra: ${desce} e a massa magra mantém-se.`,
        tone: 'ok',
      };
    }

    // 4. Sem gordura medida, o peso não diz o que está a sair.
    return {
      text: `${capitalize(desce)}. ${lean.length === 1 ? 'Com uma só medição de gordura, ainda' : 'Sem gordura medida,'} não sei se é gordura ou massa magra.`,
      tone: 'neutral',
    };
  }

  // 5. A ganhar peso sem que seja isso que se quer.
  if (weightTrend.trend === 'subindo') {
    return {
      text: `O peso está a subir ${fmtNumber(rate, 1)} kg por semana. Estás em ${fmtNumber(latest, 1)} kg.`,
      tone: 'warn',
    };
  }

  // 6. Estável.
  return {
    text: `O peso estabilizou nas últimas semanas, em ${fmtNumber(latest, 1)} kg.`,
    tone: 'ok',
  };
}
