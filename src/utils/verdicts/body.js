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
 *
 * 2026-10-05 (pedido do dono e auditoria dos limiares, C2) — só com `period`
 * (o separador Corpo); sem ele as frases são as de sempre:
 * - "Preciso de três pesagens espalhadas por pelo menos 10 dias" numa semana
 *   lia-se como impossível. No período em curso diz-se o que falta em
 *   concreto, com `trendNeed` (weightTrendNeed): "Nesta semana só há uma
 *   pesagem, de 76,2 kg; para a tendência preciso de mais duas até 4 out."
 * - Duas pesagens: o facto em vez do pedido, ao lado do gráfico que já mostra
 *   a direção — "Desceste 1,1 kg em 12 dias (≈0,6 kg por semana). Com só 2
 *   pesagens é uma estimativa pouco fiável — mais uma pesagem e passo a
 *   dar-te a tendência a sério." (`weightEstimate`, calculada na vista).
 * - O veredicto diz o facto e o que falta; a REGRA (14 dias, 3 em 10) fica
 *   só no rodapé do gráfico — antes as duas frases diziam a mesma falta.
 */

import { fmtNumber, spellFem, capitalize, fmtVsLimit, NO_DATA } from './shared';
import { assessWeightLossRate } from '@formulas/weightLossRate.ts';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dia = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]}` : '';
};
/** "entre 11 e 15 out" / "entre 28 set e 2 out" (2026-10-05). */
const entreDias = (a, b) => (String(a).slice(0, 7) === String(b).slice(0, 7)
  ? `entre ${Number(String(a).slice(8, 10))} e ${dia(b)}`
  : `entre ${dia(a)} e ${dia(b)}`);
const diasEntre = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / 86400000);
/** "0,6%" ou "0,51%" (fmtVsLimit); colado ao máximo até à 2.ª casa, "um pouco
 *  mais de 0,5%". 2026-10-05: a verificação no browser apanhou "0,504% do peso
 *  por semana" — três casas só para não dizer "0,5%" contra "o máximo é 0,5%".
 *  `isTooFast` garante que o valor está ACIMA do máximo. */
const pctVsMax = (v, max) => (Math.round(Number(v) * 100) === Math.round(Number(max) * 100) && Number(v) > Number(max)
  ? `um pouco mais de ${fmtNumber(Number(max), 1)}%`
  : `${fmtVsLimit(v, max)}%`);
/** Uma última pesagem com mais dias do que isto já não é "agora". */
export const BODY_VERDICT_RECENT_DAYS = 14;
/** Mudança do período inteiro (primeira → última pesagem) a partir da qual
 *  «esteve estável» deixa de ser verdade num período fechado (2026-10-04):
 *  acima do ruído de dia para dia de uma balança doméstica (água, sal). */
export const PERIOD_CHANGE_MIN_KG = 1;
/** Abaixo disto (kg) duas pesagens contam como iguais: o ruído de manhã para
 *  manhã de uma balança doméstica (o mesmo `noise` do peso em utils/body.js). */
const WEIGHT_NOISE_KG = 0.5;

/**
 * "para a tendência preciso de mais duas até 4 out" — o que falta, a partir de
 * weightTrendNeed (2026-10-05). Sem `need`, a regra por extenso.
 */
export function trendNeedText(need) {
  if (!need || !(need.more > 0)) return 'para a tendência preciso de três pesagens espalhadas por pelo menos 10 dias';
  if (need.fresh || need.until == null) {
    /* Nenhuma das pesagens que tens conta: três novas, a 1.ª em `start` e a
       última 10 a 14 dias depois (revisão de 2026-10-05: "a última a partir
       de 15 out" não tinha limite, mas a janela é de 14 dias). Sem nenhuma
       pesagem a contar, `start` é sempre hoje (uma de hoje contaria). */
    const ultima = need.until == null || need.until === need.from ? `a ${dia(need.from)}` : entreDias(need.from, need.until);
    return `para a tendência preciso de três pesagens em 10 a 14 dias — a primeira hoje, a última ${ultima}`;
  }
  const mais = `mais ${need.more === 1 ? 'uma' : spellFem(need.more)}`;
  if (need.from <= need.start) return `para a tendência preciso de ${mais} até ${dia(need.until)}`;
  const quando = need.from === need.until ? `a ${dia(need.from)}` : entreDias(need.from, need.until);
  return `para a tendência preciso de ${mais}, a última ${quando}`;
}

/** "Desceste 1,1 kg em 12 dias (≈0,6 kg por semana)" — a estimativa com poucas pesagens. */
function estimateFact(est, { Em = '' } = {}) {
  const d = Number(est.diff);
  const dias = `${est.days} ${est.days === 1 ? 'dia' : 'dias'}`;
  if (Math.abs(d) < WEIGHT_NOISE_KG) {
    return `${Em ? Em : ''}${Em ? 'e' : 'E'}ntre a primeira e a última pesagem o peso quase não mexeu: ${fmtNumber(est.first.weight, 1)} e ${fmtNumber(est.last.weight, 1)} kg, em ${dias}.`;
  }
  const verbo = d < 0 ? 'desceste' : 'subiste';
  const ritmo = est.weeklyRate != null ? ` (≈${fmtNumber(Math.abs(est.weeklyRate), 1)} kg por semana)` : '';
  const frase = `${verbo} ${fmtNumber(Math.abs(d), 1)} kg em ${dias}${ritmo}.`;
  return Em ? `${Em}${frase}` : capitalize(frase);
}

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
  weightEstimate: estimateIn = undefined,
  trendNeed = null,
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

  /* Separador Corpo, sem tendência (2026-10-05): o facto e o que falta em
     concreto, nunca a regra solta (essa vai no rodapé do gráfico). */
  if (period && !hasHistoryRate && weightTrend.sufficient !== true) {
    const n = points.length;
    const first = Number(points[0].weight);
    const last = Number(points[n - 1].weight);
    // Fechado = já não se completa. Um período em curso com a última pesagem
    // velha (`stale`) ainda se completa: diz-se o que falta a partir de hoje.
    const closed = period.isCurrent === false;
    const falta = closed ? null : trendNeedText(trendNeed);
    const havia = Number.isFinite(span) && inWindow > 1
      ? `nas duas semanas até ${dia(lastDate)} havia ${inWindow}, em ${span} ${span === 1 ? 'dia' : 'dias'} — a tendência precisa de três em pelo menos 10 dias`
      : `nas duas semanas até ${dia(lastDate)} não havia outras — a tendência precisa de três em pelo menos 10 dias`;
    if (n === 1) {
      const abre = hasWeighInsOutside
        ? (where ? `${capitalize(where)} só há uma pesagem` : 'Neste período só há uma pesagem')
        : 'Só tenho uma pesagem';
      return { text: `${abre}, de ${fmtNumber(first, 1)} kg; ${falta || havia}.`, tone: 'neutral' };
    }
    const est = estimateIn !== undefined ? estimateIn : null;
    if (n === 2 && est) {
      const Em = closed && where ? `${capitalize(where)}, ` : stale ? `Até ${dia(lastDate)}, ` : '';
      const facto = estimateFact(est, { Em });
      if (closed) return { text: `${facto} Com só duas pesagens é uma estimativa pouco fiável.`, tone: 'neutral' };
      let fecho;
      if (trendNeed?.more === 1) {
        const quando = trendNeed.until == null ? ''
          : trendNeed.from <= trendNeed.start ? ` até ${dia(trendNeed.until)}`
            : trendNeed.from === trendNeed.until ? ` a ${dia(trendNeed.from)}` : ` ${entreDias(trendNeed.from, trendNeed.until)}`;
        fecho = `mais uma pesagem${quando} e passo a dar-te a tendência a sério`;
      } else if (trendNeed && trendNeed.until == null) {
        // As duas já não contam (velhas): começa de novo.
        fecho = `para a tendência a sério preciso de três pesagens novas, espalhadas por pelo menos 10 dias, a última a partir de ${dia(trendNeed.from)}`;
      } else {
        fecho = `${trendNeedText(trendNeed).replace(/^para a tendência /, '')} para te dar a tendência a sério`;
      }
      return { text: `${facto} Com só duas pesagens é uma estimativa pouco fiável — ${fecho}.`, tone: 'neutral' };
    }
    const ambas = n === 2 ? 'ambas' : 'todas';
    const intervalo = first === last ? `, ${ambas} de ${fmtNumber(first, 1)} kg` : `, de ${fmtNumber(first, 1)} a ${fmtNumber(last, 1)} kg`;
    // ≥3 pesagens mas juntas, num período fechado: faltou espaço, não pesagens
    // (revisão de 2026-10-04). No período em curso, o que falta em concreto.
    const juntas = inWindow >= 3 && Number.isFinite(span) && span < 10
      ? `nas duas semanas até à última havia ${inWindow}, em ${span} ${span === 1 ? 'dia' : 'dias'} — para a tendência eram precisos pelo menos 10 dias entre a primeira e a última`
      : null;
    const resto = closed ? (juntas || havia) : falta;
    return {
      text: `Tenho ${spellFem(n)} pesagens ${where}${intervalo}; ${resto}.`,
      tone: 'neutral',
    };
  }

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
        text: `Até ${dia(lastDate)} perdias peso depressa demais: ${pctVsMax(loss.lossPct, loss.maxPct)} do peso por semana (${fmtNumber(Math.abs(rate), 1)} kg). ${limite}; acima disso arrisca-se perder também massa magra.`,
        tone: 'warn',
      };
    }
    if (past) {
      return {
        text: `${Em}perdeste peso depressa demais: ${pctVsMax(loss.lossPct, loss.maxPct)} do peso por semana (${fmtNumber(Math.abs(rate), 1)} kg). ${limite}; acima disso arrisca-se perder também massa magra.`,
        tone: 'warn',
      };
    }
    return {
      text: `Estás a perder peso depressa demais: ${pctVsMax(loss.lossPct, loss.maxPct)} do peso por semana (${fmtNumber(Math.abs(rate), 1)} kg). ${limite}; acima disso arriscas perder também massa magra.`,
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
  /* 2026-10-04 (revisão no browser, Corpo › jul–set): o ritmo das duas
     últimas semanas dava −0,2 kg/semana (dentro da banda de estável de
     weightTrend.ts) e a frase dizia «esteve estável» ao lado de «−3,3 kg» e
     de um gráfico de 77,5 a 74,3 kg. Num período fechado conta o período
     inteiro: se da primeira à última pesagem mudou mais do que o ruído da
     balança, diz-se quanto, e que no fim estabilizou. A fórmula da Carol não
     muda — isto é só a frase do período. */
  if (past && points.length >= 2) {
    const first = points[0];
    const firstW = Number(first.weight);
    const diff = latest - firstW;
    const days = diasEntre(first.date, lastDate);
    if (Math.abs(diff) >= PERIOD_CHANGE_MIN_KG && days >= 14) {
      const porSemana = Math.abs(diff) / (days / 7);
      return {
        text: `${Em}o peso ${diff < 0 ? 'desceu' : 'subiu'} ${fmtNumber(Math.abs(diff), 1)} kg, de ${fmtNumber(firstW, 1)} a ${fmtNumber(latest, 1)} kg (≈${fmtNumber(porSemana, 2)} kg por semana); nas últimas semanas estabilizou.`,
        tone: 'neutral',
      };
    }
  }
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
