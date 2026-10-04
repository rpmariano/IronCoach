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

import { addDaysISO } from '../lib/utils';
import { segundaDe } from './badges';
import { assessWeightLossRate } from '@formulas/weightLossRate.ts';
import { acwrMissingWeeks } from './biEngine';

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

/* "duas", mas "1,5": só um número redondo se escreve por extenso. O
   spellFem arredondava 1,5 sessões por semana para "uma" (revisão de
   2026-09-26). */
function countFem(n) {
  const r = Math.round(Number(n) * 10) / 10;
  return Number.isInteger(r) ? spellFem(r) : fmtNumber(r, 1);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* "2026-09-12" → "12 de setembro". null se a data não for AAAA-MM-DD. */
function fmtDatePt(iso) {
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
function fmtTimes(ratio, limit) {
  return `${fmtVsLimit(ratio, limit)}×`;
}

/* Número com uma casa, ou duas se o arredondamento a uma casa igualar o
   limiar citado na mesma frase (0,41% contra "máximo 0,4%", e não "0,4%
   contra 0,4%"). Duas casas também se ainda coincidirem (1,5004). */
function fmtVsLimit(value, limit) {
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
function loadSentence(acwr, ratio, limit) {
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
function plannedRunKmByWeek(planItems, today, count) {
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
function unplannedDropStreak(weeks, planned) {
  let n = 0;
  for (let i = weeks.length - 1; i > 0; i--) {
    if (!(weeks[i] < weeks[i - 1])) break;
    if (planned[i] !== null && planned[i - 1] !== null && planned[i] < planned[i - 1]) break;
    n++;
  }
  return n;
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
 * @param {string} [input.today] todayISO() — a última semana de
 *   `weeklyVolume` é a semana em curso; sem `today` não se sabe se já fechou
 * @param {boolean} [input.taper] hoje é polimento da próxima prova
 *   (calculateRaceTrainingPlan → currentPhase.id === 'taper')
 * @param {Array} [input.planItems] coach_plan_items dos planos aceites
 * @param {string} [input.lastRunDate] data (AAAA-MM-DD) da última corrida de
 *   todo o histórico — distingue "sem corridas neste período" de "ainda sem
 *   corridas" (R7, 2026-10-04)
 */
export function runVerdict({ acwr, weeklyVolume = [], vdotTrend = [], distribution, runCount = 0, today = null, taper = false, planItems = [], lastRunDate = null } = {}) {
  const weeks = (weeklyVolume || []).map(w => Number(w?.acuteLoad ?? w?.km ?? 0));
  const nonZeroWeeks = weeks.filter(v => v > 0).length;
  if (runCount <= 0 && nonZeroWeeks === 0) {
    // R7: com histórico fora do período, "sem dados" seria falso.
    const quando = fmtDatePt(lastRunDate);
    if (quando) {
      return { text: `Sem corridas neste período (a última foi a ${quando}).`, tone: 'neutral' };
    }
    return NO_DATA;
  }

  const ratio = Number(acwr?.ratio || 0);
  const hasAcwr = !!acwr?.hasEnoughData;

  // 1. Carga a disparar — o único caso urgente da corrida.
  if (hasAcwr && acwr.status === 'danger') {
    return {
      text: `Subiste o volume depressa demais. ${loadSentence(acwr, ratio, 1.5)} — acima de 1,5× é onde aparecem as lesões.`,
      tone: 'danger',
    };
  }

  // 2. A subir mais depressa do que o corpo assenta.
  if (hasAcwr && acwr.status === 'caution') {
    return {
      text: `Estás a subir mais depressa do que o corpo assenta. ${loadSentence(acwr, ratio, 1.3)}, e o limite seguro é 1,3×.`,
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

  /* 4. Volume a cair duas ou mais semanas seguidas. A semana em curso só
     conta ao domingo: à segunda tem 0 km porque mal começou, e dava
     "desceu de 45,0 para 0,0 km". No polimento a descida é o objetivo, e
     uma semana em que o próprio plano também descia (descarga) não é ficar
     aquém (revisão de 2026-09-26). */
  const isSunday = !!today && new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
  const closedWeeks = isSunday ? weeks : weeks.slice(0, -1);
  const shortWeeks = taper
    ? 0
    : unplannedDropStreak(closedWeeks, plannedRunKmByWeek(planItems, today, weeks.length));
  if (shortWeeks >= 2) {
    const last = closedWeeks[closedWeeks.length - 1];
    const before = closedWeeks[closedWeeks.length - 1 - shortWeeks];
    return {
      text: `Ficaste aquém ${spellFem(shortWeeks)} semanas seguidas. O volume desceu de ${fmtNumber(before, 1)} para ${fmtNumber(last, 1)} km.`,
      tone: 'warn',
    };
  }

  // 5. Carga demasiado baixa para o que se quer fazer — no polimento é o
  //    plano a funcionar, não falta de treino (revisão de 2026-09-26).
  if (hasAcwr && acwr.status === 'undertrained') {
    if (taper) {
      return { text: 'Estás no polimento: a carga baixa é de propósito.', tone: 'ok' };
    }
    return {
      text: `A carga está baixa para o que queres fazer. ${loadSentence(acwr, ratio, 0.8)}, contra os 0,8× mínimos para evoluir.`,
      tone: 'warn',
    };
  }

  /* 6. Volume a subir com a carga em zona segura — o cenário bom. R10
     (2026-10-04): só com ACWR com dados e em 'safe' (sem histórico, o rácio
     real podia estar em perigo) e só com semanas fechadas — a semana em curso
     é parcial e entrava na contagem, ao contrário da regra 4. */
  const vol = streakDirection(closedWeeks);
  if (hasAcwr && acwr.status === 'safe' && vol.direction > 0 && vol.weeks >= 3) {
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
      text: `A carga está onde deve estar. ${loadSentence(acwr, ratio)}, dentro da zona segura.`,
      tone: 'ok',
    };
  }

  /* R7 (2026-10-04): concordância ("uma corrida", não "uma corridas"); com o
     período vazio mas histórico, não se diz "zero corridas registadas"; e a
     regra do ACWR é corridas em 3 das últimas 4 semanas, não "quatro seguidas"
     — diz-se quantas faltam. */
  const quando = fmtDatePt(lastRunDate);
  const registo = runCount > 0
    ? `Tenho ${spellFem(runCount)} ${runCount === 1 ? 'corrida registada' : 'corridas registadas'} neste período.`
    : `Sem corridas neste período${quando ? ` (a última foi a ${quando})` : ''}.`;
  const falta = acwrMissingWeeks(acwr);
  const resto = falta
    ? ` Para te dizer se a carga está certa preciso de corridas em 3 das últimas 4 semanas: ${falta === 1 ? 'falta uma semana' : `faltam ${spellFem(falta)} semanas`}.`
    : ' Para te dizer se a carga está certa preciso de corridas em 3 das últimas 4 semanas.';
  return { text: registo + resto, tone: 'neutral' };
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

export default { runVerdict, gymVerdict, nutritionVerdict, bodyVerdict, NO_DATA_TEXT };
