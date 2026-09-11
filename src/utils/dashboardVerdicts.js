/**
 * Frases de veredicto dos dashboards de módulo — ponto 6 do redesenho 6c
 * ("Frase de veredicto no topo de cada módulo").
 *
 * Uma função pura por módulo. Recebem SÓ dados já calculados pelo biEngine
 * (nada de store, nada de datas do relógio senão as que vêm nos dados) para
 * poderem ser testadas com números à mão e para a frase ser sempre a mesma
 * para os mesmos dados.
 *
 * Devolvem `{ text, tone }`:
 *   ok      — está bem, continua
 *   warn    — está a correr mal e dá para corrigir
 *   danger  — está a correr mal e é urgente
 *   neutral — não dá para dizer (sem dados, ou dados insuficientes)
 *
 * Tom (CAROL.md §2 e "Fundamentos de conteúdo" do design-system):
 * opinião primeiro, número depois como prova; frases curtas e afirmativas;
 * sem "talvez", sem emoji, sem exclamação, sem elogio automático; português
 * europeu na segunda pessoa; vírgula decimal e espaço de milhar.
 *
 * Ordem das regras dentro de cada módulo: primeiro o que é perigoso, depois
 * o que está mal, depois o que está bem. A primeira regra que der match
 * ganha — só sai UMA frase.
 */

/** O que a Carol diz quando não tem nada para dizer. Nunca inventa. */
export const NO_DATA_TEXT = 'Ainda não tenho dados suficientes para te dizer como estás.';

const NO_DATA = { text: NO_DATA_TEXT, tone: 'neutral' };

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

/* ─────────────────────────── Corrida ─────────────────────────── */

/**
 * @param {object} input
 * @param {{ratio:number,status:string,hasEnoughData:boolean}} [input.acwr]
 *   calculateACWR(runs)
 * @param {Array<{weekLabel:string,acuteLoad:number}>} [input.weeklyVolume]
 *   calculateACWRHistory(runs) — `acuteLoad` é o volume (km) da semana
 * @param {Array<{date:string,vdot:number}>} [input.vdotTrend] getVDOTTrend(runs)
 * @param {{lowIntensityPct:number,highIntensityPct:number,targetLowPct:number}} [input.distribution]
 *   calculateTrainingDistribution(runs, nivel)
 * @param {number} [input.runCount] corridas no período mostrado
 */
export function runVerdict({ acwr, weeklyVolume = [], vdotTrend = [], distribution, runCount = 0 } = {}) {
  const weeks = (weeklyVolume || []).map(w => Number(w?.acuteLoad ?? w?.km ?? 0));
  const nonZeroWeeks = weeks.filter(v => v > 0).length;
  if (runCount <= 0 && nonZeroWeeks === 0) return NO_DATA;

  const ratio = Number(acwr?.ratio || 0);
  const hasAcwr = !!acwr?.hasEnoughData;

  // 1. Carga a disparar — o único caso urgente da corrida.
  if (hasAcwr && acwr.status === 'danger') {
    return {
      text: `Subiste o volume depressa demais. A carga desta semana está ${fmtNumber(ratio, 2)} vezes acima da média das últimas quatro — acima de 1,5 é onde aparecem as lesões.`,
      tone: 'danger',
    };
  }

  // 2. A subir mais depressa do que o corpo assenta.
  if (hasAcwr && acwr.status === 'caution') {
    return {
      text: `Estás a subir mais depressa do que o corpo assenta. A carga está em ${fmtNumber(ratio, 2)} e o limite seguro é 1,3.`,
      tone: 'warn',
    };
  }

  // 3. Intensidade a mais — o erro clássico de quem treina sozinho.
  const highPct = Number(distribution?.highIntensityPct || 0);
  const targetHigh = 100 - Number(distribution?.targetLowPct ?? 80);
  if (highPct > 0 && highPct > targetHigh + 10) {
    return {
      text: `Andas a correr forte demais. ${fmtNumber(highPct, 0)}% do tempo em Z3+ quando o teu alvo é no máximo ${fmtNumber(targetHigh, 0)}%.`,
      tone: 'warn',
    };
  }

  // 4. Volume a cair duas ou mais semanas seguidas.
  const vol = streakDirection(weeks);
  if (vol.direction < 0 && vol.weeks >= 2) {
    const last = weeks[weeks.length - 1];
    const before = weeks[weeks.length - 1 - vol.weeks];
    return {
      text: `Ficaste curto ${spellFem(vol.weeks)} semanas seguidas. O volume desceu de ${fmtNumber(before, 1)} para ${fmtNumber(last, 1)} km.`,
      tone: 'warn',
    };
  }

  // 5. Carga demasiado baixa para o que se quer fazer.
  if (hasAcwr && acwr.status === 'undertrained') {
    return {
      text: `A carga está baixa para o que queres fazer. O rácio desta semana é ${fmtNumber(ratio, 2)}, contra os 0,8 mínimos para evoluir.`,
      tone: 'warn',
    };
  }

  // 6. Volume a subir com a carga em zona segura — o cenário bom.
  if (vol.direction > 0 && vol.weeks >= 3) {
    return {
      text: `O volume subiu ${spellFem(vol.weeks)} semanas seguidas e a carga está em zona segura. Podes manter o ritmo.`,
      tone: 'ok',
    };
  }

  // 7. Forma aeróbica a melhorar.
  const vdots = (vdotTrend || []).map(v => Number(v?.vdot)).filter(v => isFinite(v) && v > 0);
  if (vdots.length >= 2 && vdots[vdots.length - 1] - vdots[0] >= 0.5) {
    return {
      text: `A tua forma aeróbica está a subir. O VDOT passou de ${fmtNumber(vdots[0], 1)} para ${fmtNumber(vdots[vdots.length - 1], 1)}.`,
      tone: 'ok',
    };
  }

  // 8. Nada a assinalar, mas com carga medida: dizer que está em ordem.
  if (hasAcwr) {
    return {
      text: `A carga está onde deve estar. O rácio desta semana é ${fmtNumber(ratio, 2)}, dentro da zona segura.`,
      tone: 'ok',
    };
  }

  return {
    text: `Tenho ${spellFem(runCount)} corridas registadas. Preciso de quatro semanas seguidas para te dizer se a carga está certa.`,
    tone: 'neutral',
  };
}

/* ─────────────────────────── Ginásio ─────────────────────────── */

/**
 * @param {object} input
 * @param {Array<{weekLabel:string,volumeLoad:number}>} [input.weeklyBreakdown]
 *   calculateVolumeLoad(gymSessions, range).weeklyBreakdown
 * @param {number} [input.strengthSessions] sessões de força no período
 * @param {number} [input.classes] aulas no período
 * @param {number} [input.weeksInRange] semanas cobertas pelo período
 * @param {number} [input.totalVolumeLoad] kg totais no período
 */
export function gymVerdict({
  weeklyBreakdown = [],
  strengthSessions = 0,
  classes = 0,
  weeksInRange = 4,
  totalVolumeLoad = 0,
} = {}) {
  const totalSessions = Number(strengthSessions) + Number(classes);
  if (totalSessions <= 0) return NO_DATA;

  const weeks = Math.max(1, Number(weeksInRange) || 1);
  const perWeek = totalSessions / weeks;
  const loads = (weeklyBreakdown || []).map(w => Number(w?.volumeLoad || 0));
  const load = streakDirection(loads);

  // 1. Frequência a menos — o ginásio só protege a corrida se for regular.
  if (perWeek < 1) {
    return {
      text: `Vais ao ginásio a menos para isto contar. ${fmtNumber(totalSessions, 0)} ${totalSessions === 1 ? 'sessão' : 'sessões'} em ${spellFem(weeks)} semanas não seguram o volume de corrida; o alvo são duas por semana.`,
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
    return {
      text: `Uma sessão por semana é pouco para aguentares o volume de corrida. O alvo são duas.`,
      tone: 'warn',
    };
  }

  // 4. Duas por semana com carga a subir — o cenário bom.
  if (load.direction > 0) {
    return {
      text: `${capitalize(spellFem(perWeek))} sessões por semana com carga a subir — suficiente para aguentar o volume de corrida.`,
      tone: 'ok',
    };
  }

  // 5. Duas por semana, carga estável.
  return {
    text: `Vais ao ginásio o suficiente: ${fmtNumber(perWeek, 1)} sessões por semana e ${fmtNumber(totalVolumeLoad, 0)} kg de carga no período.`,
    tone: 'ok',
  };
}

/* ─────────────────────────── Nutrição ─────────────────────────── */

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

/* ──────────────────────────── Corpo ──────────────────────────── */

/**
 * @param {object} input
 * @param {{trend:string,weeklyRate:number,movingAverage:Array,rawPoints:Array}} [input.weightTrend]
 *   calculateWeightTrend(bodyAssessments)
 * @param {{dates:string[],fatMassKg:number[],leanMassKg:number[]}} [input.composition]
 *   calculateCompositionTrend(bodyAssessments)
 * @param {number} [input.assessmentCount] avaliações no período
 */
export function bodyVerdict({ weightTrend, composition, assessmentCount = 0 } = {}) {
  const points = weightTrend?.rawPoints || [];
  if (!weightTrend || points.length === 0) {
    if (assessmentCount <= 0) return NO_DATA;
    return {
      text: 'Tenho avaliações sem peso registado. Sem peso não consigo dizer para onde vais.',
      tone: 'neutral',
    };
  }

  if (points.length < 2) {
    return {
      text: `Só tenho uma pesagem, de ${fmtNumber(points[0].weight, 1)} kg. Preciso de mais para te dizer para onde vai o peso.`,
      tone: 'neutral',
    };
  }

  const rate = Number(weightTrend.weeklyRate ?? 0);
  const lean = (composition?.leanMassKg || []).filter(v => isFinite(Number(v)));
  const leanDelta = lean.length >= 2 ? Number(lean[lean.length - 1]) - Number(lean[0]) : null;
  const latest = weightTrend.movingAverage?.length
    ? Number(weightTrend.movingAverage[weightTrend.movingAverage.length - 1].weight)
    : Number(points[points.length - 1].weight);

  // 1. Perder depressa demais queima músculo — é o caso urgente do corpo.
  if (rate <= -1) {
    return {
      text: `Estás a perder peso depressa demais: ${fmtNumber(rate, 1)} kg por semana. Acima de um quilo por semana o que sai é músculo.`,
      tone: 'danger',
    };
  }

  // 2. A perder peso e massa magra ao mesmo tempo.
  if (weightTrend.trend === 'descendo' && leanDelta !== null && leanDelta <= -0.5) {
    return {
      text: `Estás a perder peso, mas também massa magra: ${fmtNumber(leanDelta, 1)} kg de músculo no período. Come mais proteína e não cortes o ginásio.`,
      tone: 'warn',
    };
  }

  // 3. A perder peso com o músculo seguro — o cenário bom.
  if (weightTrend.trend === 'descendo') {
    return {
      text: `Perda lenta e magra: o peso desce ${fmtNumber(rate, 1)} kg por semana e a massa muscular mantém-se.`,
      tone: 'ok',
    };
  }

  // 4. A ganhar peso sem que seja isso que se quer.
  if (weightTrend.trend === 'subindo') {
    return {
      text: `O peso está a subir ${fmtNumber(rate, 1)} kg por semana. Estás em ${fmtNumber(latest, 1)} kg.`,
      tone: 'warn',
    };
  }

  // 5. Estável.
  return {
    text: `O peso estabilizou nas últimas semanas, em ${fmtNumber(latest, 1)} kg.`,
    tone: 'ok',
  };
}

export default { runVerdict, gymVerdict, nutritionVerdict, bodyVerdict, NO_DATA_TEXT };
