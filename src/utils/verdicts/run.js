/**
 * Veredicto do módulo Corrida.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo).
 */

import { fmtNumber, spellFem, capitalize, NO_DATA, NO_DATA_TEXT, fmtDatePt, streakDirection, loadSentence, plannedRunKmByWeek, unplannedDropStreak } from './shared';
import { acwrMissingWeeks } from '../biEngine';

/** Pontos de VDOT em cada período para os comparar. */
const MIN_VDOT_POINTS = 3;

/**
 * @param {object} input
 * @param {{ratio:number,status:string,hasEnoughData:boolean}} [input.acwr]
 *   calculateACWR(runs)
 * @param {Array<{weekLabel:string,acuteLoad:number|null,inProgress?:boolean}>} [input.weeklyVolume]
 *   histórico semanal — `acuteLoad` é o volume (km) da semana. Com `inProgress`
 *   (views/run.js) a última é a semana em curso e `acuteLoad` null é uma
 *   semana inteira antes do 1.º registo (não é zero: sai das contas). Sem as
 *   marcas (chamadores antigos) vale a regra de `today`.
 * @param {{current:number,previous:number,nCurrent:number,nPrevious:number,previousWhere:string}} [input.vdotCompare]
 *   VDOT médio do período contra o do anterior (2026-10-04): compara-se
 *   período com período, com pelo menos 3 pontos em cada — antes comparava a
 *   última corrida com a PRIMEIRA DE SEMPRE, que não diz nada sobre este mês.
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
 * @param {number} [input.km] km do período (só para o veredicto de um período
 *   passado)
 * @param {string} [input.scope] onde cai o período: "nesta semana", "em
 *   setembro" (whereOf) — por omissão "neste período"
 * @param {boolean} [input.isCurrent] false = período fechado: o ACWR e as
 *   semanas de hoje não falam desse período, por isso só contam os factos dele
 */
export function runVerdict({ acwr, weeklyVolume = [], vdotCompare = null, distribution, runCount = 0, km = null, today = null, taper = false, planItems = [], lastRunDate = null, scope = 'neste período', isCurrent = true } = {}) {
  // Semanas inteiras antes do 1.º registo (acuteLoad null) não são semanas a
  // zero: ficam de fora, senão "o volume subiu três semanas seguidas" nascia
  // do 0 → 8 km de quem acabou de começar. Saem sempre do princípio da série,
  // por isso o alinhamento com o plano (a contar do fim) mantém-se.
  const usable = (weeklyVolume || []).filter((w) => w?.acuteLoad !== null);
  const weeks = usable.map(w => Number(w?.acuteLoad ?? w?.km ?? 0));
  const nonZeroWeeks = weeks.filter(v => v > 0).length;
  const quando = fmtDatePt(lastRunDate);
  if (runCount <= 0 && nonZeroWeeks === 0) {
    // R7: com histórico fora do período, "sem dados" seria falso.
    if (quando) {
      return { text: `Sem corridas ${scope} (a última foi a ${quando}).`, tone: 'neutral' };
    }
    return NO_DATA;
  }

  // Intensidade a mais no período — o único alvo que fala do período em si.
  const highPct = Number(distribution?.highIntensityPct || 0);
  const targetHigh = 100 - Number(distribution?.targetLowPct ?? 80);
  const tooIntense = highPct > 0 && highPct > targetHigh + 10;
  const tooIntenseVerdict = {
    text: `Andas a correr forte demais. ${fmtNumber(highPct, 0)}% do tempo em Z3+ quando o teu alvo é no máximo ${fmtNumber(targetHigh, 0)}%.`,
    tone: 'warn',
  };

  // VDOT: média do período contra a do anterior, com pontos que cheguem.
  const vc = vdotCompare;
  const vdotUp = !!vc
    && vc.nCurrent >= MIN_VDOT_POINTS && vc.nPrevious >= MIN_VDOT_POINTS
    && Number(vc.current) - Number(vc.previous) >= 0.5;
  const vdotUpVerdict = vdotUp ? {
    text: `A tua forma aeróbica está a subir. O VDOT médio passou de ${fmtNumber(vc.previous, 1)} ${vc.previousWhere || 'no período anterior'} para ${fmtNumber(vc.current, 1)} ${scope}.`,
    tone: 'ok',
  } : null;

  /* Um período FECHADO (setembro, a semana passada): o ACWR e as semanas de
     hoje são de agora, não de então. Só contam os factos desse período. */
  if (!isCurrent) {
    if (tooIntense) return tooIntenseVerdict;
    if (vdotUpVerdict) return vdotUpVerdict;
    if (runCount <= 0) return { text: `Sem corridas ${scope}${quando ? ` (a última foi a ${quando})` : ''}.`, tone: 'neutral' };
    const kmTxt = Number(km) > 0 ? ` e ${fmtNumber(km, 1)} km` : '';
    return {
      text: `${capitalize(scope)}: ${runCount} ${runCount === 1 ? 'corrida' : 'corridas'}${kmTxt}.`,
      tone: 'neutral',
    };
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
  if (tooIntense) return tooIntenseVerdict;

  /* 4. Volume a cair duas ou mais semanas seguidas. A semana em curso só
     conta ao domingo: à segunda tem 0 km porque mal começou, e dava
     "desceu de 45,0 para 0,0 km". No polimento a descida é o objetivo, e
     uma semana em que o próprio plano também descia (descarga) não é ficar
     aquém (revisão de 2026-09-26). */
  const isSunday = !!today && new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
  /* Com as marcas `inProgress` (views/run.js) a semana em curso é a marcada —
     R2: hoje (domingo incluído) ainda não acabou, a semana só fecha à segunda.
     Sem marcas, a regra antiga de `today`. */
  const hasFlags = usable.some((w) => typeof w?.inProgress === 'boolean');
  const closedWeeks = hasFlags
    ? weeks.filter((_, i) => !usable[i].inProgress)
    : (isSunday ? weeks : weeks.slice(0, -1));
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

  // 7. Forma aeróbica a melhorar (período contra período).
  if (vdotUpVerdict) return vdotUpVerdict;

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
  const registo = runCount > 0
    ? `Tenho ${spellFem(runCount)} ${runCount === 1 ? 'corrida registada' : 'corridas registadas'} ${scope}.`
    : `Sem corridas ${scope}${quando ? ` (a última foi a ${quando})` : ''}.`;
  const falta = acwrMissingWeeks(acwr);
  const resto = falta
    ? ` Para te dizer se a carga está certa preciso de corridas em 3 das últimas 4 semanas: ${falta === 1 ? 'falta uma semana' : `faltam ${spellFem(falta)} semanas`}.`
    : ' Para te dizer se a carga está certa preciso de corridas em 3 das últimas 4 semanas.';
  return { text: registo + resto, tone: 'neutral' };
}
