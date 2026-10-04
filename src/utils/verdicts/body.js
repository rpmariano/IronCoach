/**
 * Veredicto do módulo Corpo.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo).
 *
 * 2026-10-04 (fase 5, Corpo em períodos de calendário — plano §3 Corpo, C1,
 * C2, C5): o veredicto passa a poder falar de UM período (`period`): "em
 * setembro", "nesta semana", no passado quando o período já fechou. Sem
 * `period` as frases são as de sempre (o Geral e a Carol continuam iguais).
 * O "peso atual" da frase é a última PESAGEM (não o último ponto da EWMA):
 * um só peso atual no ecrã inteiro (C4/plano §3).
 *
 * 2026-10-04, revisão do Corpo:
 * - "Em curso" é a RECÊNCIA da última pesagem, não só do período: com
 *   `todayISO`, uma última pesagem a mais de 14 dias de hoje fala no passado,
 *   com a data ("Até 13 mar perdias peso depressa demais…"), e o perigo desce
 *   a aviso — era um alarme de agora sobre um facto de há 7 meses.
 * - O ritmo pode vir do histórico até à última pesagem do período (a vista
 *   calcula-o assim): com ritmo medido (≥3 pesagens na janela do
 *   weightTrend), uma só pesagem no período já não esconde o ritmo.
 * - O que falta diz-se com os números da janela: a quem tem 7 pesagens em 6
 *   dias não se pede "três pesagens".
 */

import { fmtNumber, spellFem, capitalize, fmtVsLimit, NO_DATA } from './shared';
import { assessWeightLossRate } from '@formulas/weightLossRate.ts';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dia = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]}` : '';
};
const diasEntre = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / 86400000);
/** Uma última pesagem com mais dias do que isto já não é "agora". */
export const BODY_VERDICT_RECENT_DAYS = 14;

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
 * @param {{where:string,isCurrent:boolean}} [input.period] o período de
 *   calendário de que a frase fala ("em setembro", "nesta semana"); num
 *   período fechado as frases vão para o passado e o tom de perigo desce a
 *   aviso (é história, não um alarme de agora)
 * @param {number} [input.goalWeight] objetivo de peso do perfil — subir a
 *   caminho dele não é aviso
 * @param {{date:string,weight:number}} [input.lastOutside] a última pesagem
 *   antes do fim do período, quando o período não tem nenhuma
 * @param {string} [input.todayISO] hoje — com ele, uma última pesagem velha
 *   (> 14 dias) num período em curso fala no passado e nunca em perigo
 */
export function bodyVerdict({
  weightTrend,
  composition,
  assessmentCount = 0,
  gymSessionCount = 0,
  experienceLevel = null,
  hasWeighInsOutside = false,
  period = null,
  goalWeight = null,
  lastOutside = null,
  todayISO = null,
} = {}) {
  const where = period?.where || null;
  const points = weightTrend?.rawPoints || [];
  const lastDate = points.length ? points[points.length - 1].date : null;
  const stale = !!period && period.isCurrent !== false && !!todayISO && !!lastDate
    && diasEntre(lastDate, todayISO) > BODY_VERDICT_RECENT_DAYS;
  const past = !!period && (period.isCurrent === false || stale);
  if (!weightTrend || points.length === 0) {
    if (assessmentCount <= 0) {
      /* C5 (2026-10-04): período sem avaliações, mas com histórico — dizer
         de quando é a última, em vez do "não tenho dados" de quem nunca
         registou nada. */
      if (where && lastOutside && Number(lastOutside.weight) > 0) {
        return {
          text: `${past ? 'Sem' : 'Ainda sem'} avaliações ${where}. A última pesagem ${past ? 'antes disso ' : ''}foi a ${dia(lastOutside.date)}: ${fmtNumber(lastOutside.weight, 1)} kg.`,
          tone: 'neutral',
        };
      }
      return NO_DATA;
    }
    return {
      text: `Tenho avaliações ${where ? `${where} ` : ''}sem peso registado. Sem peso não consigo dizer para onde ${past ? 'foi' : 'vais'}.`,
      tone: 'neutral',
    };
  }

  const inWindow = Number(weightTrend.pointsInWindow);
  const span = Number(weightTrend.spanDays);
  /* Com ≥3 pesagens na janela, o que falta é espaço, não pesagens (revisão
     2026-10-04: "Tenho sete pesagens… Preciso de três"). */
  const faltaPesagens = inWindow >= 3 && Number.isFinite(span) && span < 10
    ? `Para o ritmo preciso de pesagens espalhadas por pelo menos 10 dias — nas duas semanas até à última há ${inWindow}, em ${span} ${span === 1 ? 'dia' : 'dias'}.`
    : 'Preciso de três pesagens espalhadas por pelo menos 10 dias para te dizer para onde vai o peso.';
  // Ritmo medido no histórico até à última pesagem (≥3 na janela): conta
  // mesmo com uma só pesagem no período.
  const hasHistoryRate = weightTrend.sufficient === true && weightTrend.weeklyRate != null && inWindow >= 3;

  if (points.length < 2 && !hasHistoryRate) {
    // 2026-10-04: com pesagens fora do período, "só tenho uma" era falso.
    const abre = hasWeighInsOutside
      ? (where ? `${capitalize(where)} só há uma pesagem` : 'Neste período só há uma pesagem')
      : 'Só tenho uma pesagem';
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
    const n = points.length;
    const ambas = n === 2 ? 'ambas' : 'todas';
    return {
      text: `Tenho ${spellFem(n)} pesagens ${where || 'neste período'}${first === last ? `, ${ambas} de ${fmtNumber(first, 1)} kg` : `, de ${fmtNumber(first, 1)} a ${fmtNumber(last, 1)} kg`}. ${faltaPesagens}`,
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
  // Um só "peso atual": a última pesagem (plano §3 Corpo).
  const latest = Number(points[points.length - 1].weight);
  const Em = stale ? `Até ${dia(lastDate)}, ` : where ? `${capitalize(where)}, ` : '';

  /* 1. Perder depressa demais é o caso urgente do corpo. O limiar é em % do
     peso por semana e depende do nível (assessWeightLossRate), não um −1 kg
     absoluto igual para 50 e para 100 kg. Só PERDA: ganhar depressa não é
     perigo (é o ramo 5, a aviso). */
  const loss = assessWeightLossRate(rate, latest, experienceLevel);
  if (loss?.isTooFast) {
    const limite = `${experienceLevel ? `Para o teu nível o máximo saudável é ${fmtNumber(loss.maxPct, 1)}%` : `Sem nível declarado, conto com um máximo de ${fmtNumber(loss.maxPct, 1)}%`}`;
    if (stale) {
      return {
        text: `Até ${dia(lastDate)} perdias peso depressa demais: ${fmtVsLimit(loss.lossPct, loss.maxPct)}% do peso por semana (${fmtNumber(Math.abs(rate), 1)} kg). ${limite}; acima disso arrisca-se perder também massa magra.`,
        tone: 'warn',
      };
    }
    if (past) {
      return {
        text: `${Em}perdeste peso depressa demais: ${fmtVsLimit(loss.lossPct, loss.maxPct)}% do peso por semana (${fmtNumber(Math.abs(rate), 1)} kg). ${limite}; acima disso arrisca-se perder também massa magra.`,
        tone: 'warn',
      };
    }
    return {
      text: `Estás a perder peso depressa demais: ${fmtVsLimit(loss.lossPct, loss.maxPct)}% do peso por semana (${fmtNumber(Math.abs(rate), 1)} kg). ${limite}; acima disso arriscas perder também massa magra.`,
      tone: 'danger',
    };
  }

  // 2. A perder peso e massa magra ao mesmo tempo. O ginásio só entra na
  //    frase de quem tem sessões registadas.
  if (weightTrend.trend === 'descendo' && leanDelta !== null && leanDelta <= -0.5) {
    return {
      text: past
        ? `${Em}perdeste peso, mas também massa magra: menos ${fmtNumber(-leanDelta, 1)} kg.`
        : `Estás a perder peso, mas também massa magra: menos ${fmtNumber(-leanDelta, 1)} kg ${where || 'no período'}. Come mais proteína${Number(gymSessionCount) > 0 ? ' e não cortes o ginásio' : ''}.`,
      tone: 'warn',
    };
  }

  if (weightTrend.trend === 'descendo') {
    // O verbo já diz o sentido: "desce 0,4 kg", não "desce −0,4 kg". Sem
    // ritmo semanal medido, não se inventa um "0,0 kg".
    const desce = Math.abs(rate) >= 0.05
      ? `o peso ${past ? 'desceu' : 'desce'} ${fmtNumber(Math.abs(rate), 1)} kg por semana`
      : `o peso ${past ? 'esteve' : 'está'} a descer`;

    // 3. A perder peso com a massa magra segura — o cenário bom.
    if (leanDelta !== null) {
      return {
        text: past
          ? `${Em}perda lenta e magra: ${desce} e a massa magra manteve-se.`
          : `Perda lenta e magra: ${desce} e a massa magra mantém-se.`,
        tone: 'ok',
      };
    }

    // 4. Sem gordura medida, o peso não diz o que está a sair.
    return {
      text: past
        ? `${Em}${desce}. ${lean.length === 1 ? 'Com uma só medição de gordura,' : 'Sem gordura medida,'} não sei se foi gordura ou massa magra.`
        : `${capitalize(desce)}. ${lean.length === 1 ? 'Com uma só medição de gordura, ainda' : 'Sem gordura medida,'} não sei se é gordura ou massa magra.`,
      tone: 'neutral',
    };
  }

  // 5. A ganhar peso. Só é aviso se não for para lá que o objetivo aponta.
  if (weightTrend.trend === 'subindo') {
    const goal = Number(goalWeight);
    const towardGoal = goal > 0 && goal > latest;
    if (past) {
      return {
        text: `${Em}o peso subiu ${fmtNumber(rate, 1)} kg por semana, até ${fmtNumber(latest, 1)} kg.`,
        tone: towardGoal ? 'ok' : 'warn',
      };
    }
    if (towardGoal) {
      return {
        text: `O peso sobe ${fmtNumber(rate, 1)} kg por semana, a caminho do objetivo de ${fmtNumber(goal, 1)} kg. Estás em ${fmtNumber(latest, 1)} kg.`,
        tone: 'ok',
      };
    }
    return {
      text: `O peso está a subir ${fmtNumber(rate, 1)} kg por semana. Estás em ${fmtNumber(latest, 1)} kg.`,
      tone: 'warn',
    };
  }

  // 6. Estável.
  if (past) {
    return {
      text: `${Em}o peso esteve estável, em ${fmtNumber(latest, 1)} kg.`,
      tone: 'ok',
    };
  }
  return {
    text: `O peso estabilizou nas últimas semanas, em ${fmtNumber(latest, 1)} kg.`,
    tone: 'ok',
  };
}
