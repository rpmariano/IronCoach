/**
 * Veredicto do módulo Corrida.
 *
 * 2026-10-04: refactoring mecânico de dashboardVerdicts.js para modularização
 * (fases 4–6 trabalhando em paralelo).
 */

import { fmtNumber, spellFem, NO_DATA, NO_DATA_TEXT, fmtDatePt, streakDirection, loadSentence, plannedRunKmByWeek, unplannedDropStreak } from './shared';
import { acwrMissingWeeks } from '../biEngine';

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
