/**
 * biEngine.js
 * Todas as funções de cálculo para os dashboards de BI do IronHealth.
 */
import { subDays, subWeeks, subMonths, subYears, isAfter, startOfWeek, differenceInDays, parseISO, isValid, format } from 'date-fns';
import * as Constants from './biConstants';
import { shoesNeedingAttention, shoeLabel } from './shoes';
import { assessRaceViability, recentWeeklyVolume } from './raceViability';
import { getRecommendedPrepWeeks, resolveExperienceLevel } from './racePlanEngine';
import { getRacePrediction as sharedGetRacePrediction, computeEffectivePrepStart } from '@formulas/racePlanning.ts';
import { todayISO } from '../lib/utils';
// mealNutrients removido daqui — as duas únicas chamadas migraram para
// @formulas/macroAdherence.ts e @formulas/energyAvailabilityWindow.ts (Fase E).
import { normalizeGender } from '@formulas/vocabulary.ts';
import { computeAcwr, classifyAcwrZone } from '@formulas/acwr.ts';
import { classifyVisceralFat, VISCERAL_FAT_ALERT_MIN, VISCERAL_FAT_HIGH_RISK_MIN } from '@formulas/bodyComposition.ts';
import { computeWeightTrend } from '@formulas/weightTrend.ts';
import { getTaperDays } from '@formulas/taper.ts';
import { computeEnergyAvailability } from '@formulas/energyAvailability.ts';
import { assessWeightLossRate } from '@formulas/weightLossRate.ts';
import { classifyCalorieCompliance } from '@formulas/nutritionCompliance.ts';
import { computeTrainingDistribution } from '@formulas/trainingDistribution.ts';
import { computeVdotTrend } from '@formulas/vdotTrend.ts';
import { computeSessionVolumeKg } from '@formulas/sessionVolumeKg.ts';
import { computeGymVolumeLoad } from '@formulas/volumeLoad.ts';
import { computeMuscleGroupVolume as sharedComputeMuscleGroupVolume } from '@formulas/muscleGroupVolume.ts';
import { computeMacroAdherence as sharedComputeMacroAdherence } from '@formulas/macroAdherence.ts';
import { computeEnergyAvailabilityWindow } from '@formulas/energyAvailabilityWindow.ts';
import { computeCompositionTrend } from '@formulas/compositionTrend.ts';
import { computeRunAcwr } from '@formulas/runAcwr.ts';
import { computeCrossMetrics } from '@formulas/crossMetrics.ts';
import { computeReadinessIndex as sharedComputeReadinessIndex } from '@formulas/readinessIndex.ts';

/**
 * Filtra dados por um intervalo de datas relativo à data atual.
 * @param {Array} data - Lista de objetos.
 * @param {string} range - 'dia' | 'semana' | 'mes' | 'trimestre' | '6meses' | 'ano'
 * @param {string} dateField - Campo de data no objeto.
 * @returns {Array}
 */
export function filterByDateRange(data, range, dateField = 'date') {
  if (!Array.isArray(data)) return [];
  const now = new Date();
  let startDate = now;

  switch (range) {
    case 'dia': startDate = subDays(now, 1); break;
    case 'semana': startDate = subWeeks(now, 1); break;
    case 'mes': startDate = subMonths(now, 1); break;
    case 'trimestre': startDate = subMonths(now, 3); break;
    case '6meses': startDate = subMonths(now, 6); break;
    case 'ano': startDate = subYears(now, 1); break;
    default: return data;
  }

  return data.filter(item => {
    try {
      if (!item[dateField]) return false;
      const d = typeof item[dateField] === 'string' ? parseISO(item[dateField]) : item[dateField];
      return isValid(d) && isAfter(d, startDate);
    } catch (e) {
      return false;
    }
  });
}

/**
 * Classifica um rácio agudo:crónico nos 4 estados da doutrina — usada tanto
 * pelo ACWR de corrida (km) como por calculateVolumeLoad (ginásio, kg): a
 * classificação por zona é a mesma fórmula independentemente da grandeza
 * de carga, só o rácio de entrada muda. Delega em
 * @formulas/acwr.ts (T1), a mesma fórmula que as Edge Functions usam — ver
 * specs/formulas-checklist.md Fase C (P0-2 já estava corrigido aqui na
 * Fase A; esta migração só move a fórmula de casa).
 */
function resolveAcwrStatus(ratio) {
  return classifyAcwrZone(ratio);
}

const ACWR_STATUS_COLOR = { safe: 'green', undertrained: 'yellow', caution: 'orange', danger: 'red', unknown: 'gray' };

/**
 * Traduz um estado de ACWR para algo que a UI possa mostrar sem inventar
 * "Perigo" para quem não tem dados. Auditoria de 23/08: o RunDashboard
 * mostrava "ACWR Status: Perigo" a um atleta com zero corridas, porque
 * `undertrained` (carga baixa — estado seguro) e `unknown` (sem dados)
 * caíam no "senão" de um ternário que só cobria safe/caution. `undertrained`
 * é tratado à parte de `safe`: informar "carga baixa" é útil, mas não é o
 * mesmo que dizer "estás no ponto ideal".
 */
export function acwrStatusLabel(status, hasEnoughData = true) {
  if (!hasEnoughData || status === 'unknown') return { label: 'Sem dados', tone: 'neutral' };
  if (status === 'undertrained') return { label: 'Carga baixa', tone: 'neutral' };
  if (status === 'danger') return { label: 'Perigo', tone: 'danger' };
  if (status === 'caution') return { label: 'Atenção', tone: 'caution' };
  return { label: 'Ideal', tone: 'safe' };
}

/**
 * Running Analytics: Calcula ACWR (Acute:Chronic Workload Ratio) em km —
 * agudo: total dos últimos 7 dias (hoje incluído); crónico: média semanal
 * dos últimos 28 dias. Era sRPE (duração×RPE) até à Fase C — grandeza
 * diferente da usada pelas Edge Functions e da doutrina, que enquadra o
 * ACWR em volume (ver specs/formulas-centralizacao.md §5.1,
 * specs/formulas-checklist.md P0-3/Fase C). `today` usa todayISO() local
 * por omissão, não UTC (mesma razão do P0-5).
 */
// Delega em @formulas/runAcwr.ts (T1.5) — única implementação, partilhada
// com a Carol (specs/formulas-checklist.md Fase E, P0-3 finalmente
// resolvido: o coach-chat tinha uma janela 8/29 dias diferente desta,
// unificadas nesta migração na janela exata de 7/28 dias que já era esta).
export function calculateACWR(runs, today = todayISO()) {
  try {
    const { acuteKm, chronicWeeklyKm, ratio, status, hasEnoughData } = computeRunAcwr(runs, today);
    const color = ACWR_STATUS_COLOR[status] || ACWR_STATUS_COLOR.unknown;
    return { acuteKm, chronicWeeklyKm, ratio, status, color, hasEnoughData };
  } catch (e) {
    return { acuteKm: 0, chronicWeeklyKm: 0, ratio: 0, status: 'unknown', color: 'gray', hasEnoughData: false };
  }
}

/**
 * Calcula o histórico de ACWR (para as últimas 12 semanas) para apresentar
 * no gráfico. Carga = distância (km) — era duração×RPE até à Fase C, mesma
 * migração de calculateACWR acima (specs/formulas-checklist.md Fase C).
 */
export function calculateACWRHistory(runs, weeksCount = 12) {
  try {
    const now = new Date();
    
    // Gerar as últimas `weeksCount` semanas
    const weeks = [];
    for (let i = weeksCount - 1; i >= 0; i--) {
      const wStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      weeks.push({ start: wStart, label: format(wStart, 'dd MMM'), load: 0 });
    }

    // Gerar as 3 semanas anteriores para ter base para a Carga Crónica da primeira semana
    const historyWeeks = [];
    for (let i = weeksCount + 2; i >= weeksCount; i--) {
      const wStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      historyWeeks.push({ start: wStart, load: 0 });
    }
    
    const allWeeks = [...historyWeeks, ...weeks];

    runs.forEach(run => {
      const d = parseISO(run.date);
      if (!isValid(d)) return;

      const load = Number(run.distance_km) || 0;

      const wStart = startOfWeek(d, { weekStartsOn: 1 }).getTime();
      const targetWeek = allWeeks.find(w => w.start.getTime() === wStart);
      if (targetWeek) {
        targetWeek.load += load;
      }
    });

    const result = [];
    for (let i = historyWeeks.length; i < allWeeks.length; i++) {
      const acuteLoad = allWeeks[i].load;
      const w1 = allWeeks[i].load;
      const w2 = allWeeks[i-1].load;
      const w3 = allWeeks[i-2].load;
      const w4 = allWeeks[i-3].load;

      const chronicLoad = (w1 + w2 + w3 + w4) / 4;
      const { ratio } = computeAcwr(acuteLoad, chronicLoad);

      result.push({
        weekLabel: allWeeks[i].label,
        acuteLoad: Math.round(acuteLoad * 10) / 10,
        chronicLoad: Math.round(chronicLoad * 10) / 10,
        ratio: ratio !== null ? Math.round(ratio * 100) / 100 : 0
      });
    }

    return result;
  } catch (e) {
    return [];
  }
}

/**
 * Calcula a distribuição de treino em zonas de intensidade.
 */
// Delega em @formulas/trainingDistribution.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function calculateTrainingDistribution(runs, level = 'medio') {
  try {
    return computeTrainingDistribution(runs, level);
  } catch (e) {
    return { lowIntensityPct: 0, highIntensityPct: 0, z1Minutes: 0, z2Minutes: 0, z3Minutes: 0, z4Minutes: 0, z5Minutes: 0, isCompliant: false, targetLowPct: 80 };
  }
}

/**
 * Calcula Pace vs Frequência Cardíaca para gráficos de dispersão.
 */
export function calculatePaceVsHR(runs) {
  try {
    return runs.filter(r => r.distance_km > 0 && r.duration_seconds > 0 && r.details?.avg_heart_rate_bpm > 0)
      .map(r => ({
        date: r.date,
        paceSecondsPerKm: r.duration_seconds / r.distance_km,
        avgHR: r.details.avg_heart_rate_bpm,
        label: r.kind || 'Corrida'
      }));
  } catch (e) {
    return [];
  }
}

/**
 * Previsão de tempo/pace para UMA prova (race_events ou rascunho do
 * RunAgenda) — ponto único que resolve nível de experiência e distância
 * equivalente ITRA antes de chamar predictRaceTime, para todos os
 * consumidores (RaceHubView, RunDashboard, insights do Dashboard, semáforo
 * de prontidão) lerem sempre o mesmo número. Antes disto, cada um repetia
 * essa resolução à sua maneira e divergia sem ninguém reparar — foi assim
 * que o gráfico de Evolução VDOT do Dashboard e a "Previsão (VDOT)" do
 * RaceHubView chegaram a mostrar tempos diferentes para a mesma prova.
 */
// Delega em @formulas/racePlanning.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function getRacePrediction(race, profile, runs) {
  return sharedGetRacePrediction(race, profile, runs || []);
}

/**
 * Calcula a tendência de VDOT ao longo do tempo.
 * Filtra apenas corridas que qualificam como "time trials" (competição ou treinos de qualidade >= 3km).
 */
// Delega em @formulas/vdotTrend.ts (T1.5) — única implementação, partilhada
// com a Carol (specs/formulas-checklist.md Fase E).
export function getVDOTTrend(runs) {
  try {
    return computeVdotTrend(runs);
  } catch (e) {
    return [];
  }
}

/**
 * Volume-carga (kg) de uma sessão de ginásio: Σ peso × repetições de todas
 * as séries. `workout_session_sets` é o campo real gravado pelo registo
 * (GymRegistration.jsx); `volume_kg` existe como coluna no esquema
 * (migração 20260815155000_gym_advanced_metrics.sql) mas nenhum caminho de
 * gravação alguma vez lá escreveu — ficava sempre NULL. Por isso o KPI
 * "Vol. Carga", o ACWR de ginásio e a Análise Cruzada mostravam sempre 0/
 * "—", mesmo com sessões registadas (ver Visão Geral, cartão Ginásio).
 * Calcular a partir das séries reais evita depender de uma coluna morta e
 * de uma migração de backfill — `volume_kg` fica só como atalho, caso
 * algum dia passe a ser escrito.
 */
// Delega em @formulas/sessionVolumeKg.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function sessionVolumeKg(session) {
  return computeSessionVolumeKg(session);
}

/** Gym Analytics */
// Delega em @formulas/volumeLoad.ts (T1.5) — única implementação, partilhada
// com a Carol (specs/formulas-checklist.md Fase E). `todayISO()` (fuso
// local) substitui o `new Date()` impuro do original — ver o comentário em
// relativeDateRange.ts sobre a simplificação para granularidade de dia.
export function calculateVolumeLoad(gymSessions, dateRange) {
  try {
    return computeGymVolumeLoad(gymSessions || [], todayISO(), dateRange);
  } catch (e) {
    return { totalVolumeLoad: 0, weeklyBreakdown: [], acwr: 0, acwrStatus: 'unknown', acwrHasEnoughData: false };
  }
}

// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function calculateMuscleGroupVolume(gymSessions, dateRange) {
  try {
    return sharedComputeMuscleGroupVolume(gymSessions || [], todayISO(), dateRange);
  } catch (e) {
    return {};
  }
}

/** Body Analytics */

/**
 * Calcula a tendência real de peso com Média Móvel Exponencialmente Ponderada (EWMA).
 * Suaviza o ruído diário (retenção de água, glicogénio) para mostrar a tendência real.
 * @param {Array} bodyAssessments - Avaliações corporais do store.
 * @returns {{ rawPoints, movingAverage, trend, weeklyRate }}
 */
// Delega em @formulas/weightTrend.ts (T1) — a mesma fórmula EWMA α≈0,25
// que a Fase C escolheu como única (era a já usada aqui; coach-chat usava
// média simples de 7 dias e coach-daily-summary regressão de 2 pontos —
// ver specs/formulas-centralizacao.md §5.3, specs/formulas-checklist.md
// Fase C). Esta função só prepara os pontos (filtra/ordena, que é leitura
// de dados, não fórmula) e devolve `rawPoints` a par do resultado — os
// consumidores existentes (gráfico de peso) precisam dos pontos brutos,
// não só da série suavizada.
export function calculateWeightTrend(bodyAssessments) {
  try {
    if (!bodyAssessments || bodyAssessments.length === 0) return null;
    const sorted = [...bodyAssessments]
      .filter(a => a.weight_kg > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) return null;

    const rawPoints = sorted.map(a => ({ date: a.date, weight: a.weight_kg }));
    const result = computeWeightTrend(rawPoints);
    if (!result) return null;

    return { rawPoints, ...result };
  } catch (e) {
    return null;
  }
}

// Delega em @formulas/compositionTrend.ts (T1.5) — única implementação,
// partilhada com a Carol (specs/formulas-checklist.md Fase E).
export function calculateCompositionTrend(bodyAssessments) {
  try {
    return computeCompositionTrend(bodyAssessments);
  } catch(e) {
    return { dates: [], fatMassKg: [], leanMassKg: [] };
  }
}

/** Nutrition Analytics */

/**
 * Calcula a aderência real às macros usando os dados de refeições.
 * Delega em @formulas/macroAdherence.ts (T1.5) — única implementação,
 * partilhada com a Carol (specs/formulas-checklist.md Fase E, resolve o
 * P0-6 original de uma vez por todas).
 */
export function calculateMacroAdherence(meals, profile, bodyAssessments, dateRange) {
  try {
    return sharedComputeMacroAdherence(meals, profile, bodyAssessments || [], todayISO(), dateRange);
  } catch (e) {
    return null;
  }
}

/**
 * Calcula a Disponibilidade Energética (EA) para deteção de RED-S.
 * EA = (Kcal Ingeridas - Kcal Gasto Exercício) / Massa Magra (kg)
 * Limiar crítico: < 30 kcal/kg FFM/dia
 *
 * Delega em @formulas/energyAvailabilityWindow.ts (T1.5) — única
 * implementação, partilhada com a Carol (specs/formulas-checklist.md Fase
 * E). A limitação de doutrina do denominador (massa magra por BIA) já
 * estava documentada em @formulas/energyAvailability.ts desde a Fase C e
 * continua a aplicar-se — não é resolvida por esta migração de casa.
 */
export function calculateEnergyAvailability(meals, bodyAssessments, runs, gymSessions, dateRange) {
  try {
    return computeEnergyAvailabilityWindow(meals, bodyAssessments || [], runs || [], gymSessions || [], todayISO(), dateRange);
  } catch (e) {
    return { daily: [], average: 0, isAtRisk: false, daysAtRisk: 0, leanMass: 0 };
  }
}

/**
 * Calcula métricas cruzadas entre módulos para a vista holística.
 * Delega em @formulas/crossMetrics.ts (T1.5) — única implementação,
 * partilhada com a Carol (specs/formulas-checklist.md Fase E). `meals` não
 * é usado por este cálculo (nunca foi — mantido no parâmetro só para não
 * quebrar os chamadores existentes).
 */
export function calculateCrossMetrics(runs, gymSessions, meals, bodyAssessments, dateRange) {
  try {
    return computeCrossMetrics(runs, gymSessions, bodyAssessments, todayISO(), dateRange);
  } catch (e) {
    return { weightVsPace: [], gymLoadVsRunRPE: [], combinedACWR: 0 };
  }
}

/**
 * Deteta insights proativos do Coach baseados nos limiares da doutrina.
 * Verifica múltiplas dimensões e retorna alertas ordenados por severidade.
 * @param {{ runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems }} data
 * @param {object} profile
 * @returns {Array<{ id, severity, title, message, metric, value, threshold, module }>}
 */
export function detectCoachInsights(data, profile) {
  try {
    const insights = [];
    const level = profile?.experience_level || 'medio';
    const gender = normalizeGender(profile?.gender) || 'M';

    // 0. Adesão ao Plano (Treinos em atraso)
    if (data.coachPlanItems?.length > 0 && data.coachPlans?.length > 0) {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const past14DaysStr = format(subDays(now, 14), 'yyyy-MM-dd');
      
      const activePlanIds = data.coachPlans.filter(p => p.status === 'ativo').map(p => p.id);

      const overdueWorkouts = data.coachPlanItems.filter(i => {
        if (!activePlanIds.includes(i.plan_id)) return false;
        if (i.kind === 'descanso' || i.status !== 'pendente') return false;
        if (i.planned_date >= todayStr || i.planned_date < past14DaysStr) return false;
        
        // Verifica se o atleta registou algum treino nesse dia independentemente do plano
        const hasRun = (data.runs || []).some(r => format(parseISO(r.date), 'yyyy-MM-dd') === i.planned_date);
        const hasGym = (data.gymSessions || []).some(s => format(parseISO(s.date), 'yyyy-MM-dd') === i.planned_date);
        
        return !hasRun && !hasGym;
      });

      if (overdueWorkouts.length >= 3) {
        insights.push({
          id: 'low_adherence', severity: 'warning',
          title: 'Baixa adesão ao plano',
          message: `Tens ${overdueWorkouts.length} treinos em atraso nas últimas 2 semanas. O plano atual pode estar desajustado da tua rotina. Avalia se precisas de reduzir o volume.`,
          metric: 'Treinos pendentes', value: overdueWorkouts.length, threshold: 3, module: 'coach'
        });
      }
    }

    // 1. ACWR de Corrida
    if (data.runs?.length > 0) {
      const acwr = calculateACWR(data.runs);
      if (acwr.hasEnoughData && acwr.status === 'danger') {
        insights.push({
          id: 'acwr_danger', severity: 'critical',
          title: 'Carga de treino perigosa',
          // Até à Fase C isto dizia "ACWR (sRPE)" — o ACWR do frontend usava
          // carga sRPE (min × RPE), grandeza diferente do ACWR em km do
          // backend, e o rótulo evitava que os dois se confundissem no
          // prompt da Carol (P0-3, Fase A). A Fase C unificou os dois em km
          // (specs/formulas-centralizacao.md §5.1) — já não há grandezas
          // distintas para rotular.
          message: `O teu ACWR está em ${acwr.ratio.toFixed(2)} — acima do limiar de ${Constants.ACWR_DANGER}. Risco elevado de lesão. Considera reduzir o volume esta semana.`,
          metric: 'ACWR', value: acwr.ratio, threshold: Constants.ACWR_DANGER, module: 'corrida'
        });
      } else if (acwr.hasEnoughData && acwr.status === 'caution') {
        insights.push({
          id: 'acwr_caution', severity: 'warning',
          title: 'Carga de treino elevada',
          message: `O teu ACWR está em ${acwr.ratio.toFixed(2)} — na zona de cautela. Monitoriza a fadiga e não aumentes a intensidade.`,
          metric: 'ACWR', value: acwr.ratio, threshold: Constants.ACWR_CAUTION_MAX, module: 'corrida'
        });
      }

      // 2. Distribuição 80/20
      const dist = calculateTrainingDistribution(data.runs, level);
      const totalMinutes = dist.z1Minutes + dist.z2Minutes + dist.z3Minutes + dist.z4Minutes + dist.z5Minutes;
      if (totalMinutes > 60 && !dist.isCompliant && dist.highIntensityPct > 30) {
        insights.push({
          id: 'intensity_imbalance', severity: 'warning',
          title: 'Demasiada intensidade',
          message: `Estás com ${Math.round(dist.highIntensityPct)}% do tempo em intensidade média/alta. O objetivo para o teu nível é no máximo ${Math.round(100 - dist.targetLowPct)}%. Treina mais em Z1/Z2.`,
          metric: '80/20', value: dist.highIntensityPct, threshold: 100 - dist.targetLowPct, module: 'corrida'
        });
      }
    }

    // 3. Composição Corporal — Gordura demasiado baixa
    if (data.bodyAssessments?.length > 0) {
      const latest = [...data.bodyAssessments].sort((a, b) => b.date.localeCompare(a.date))[0];
      const bfAlarm = gender === 'F' ? Constants.BF_ALARM_WOMEN : Constants.BF_ALARM_MEN;
      if (latest.body_fat_pct && latest.body_fat_pct < bfAlarm) {
        insights.push({
          id: 'bf_low', severity: 'critical',
          title: 'Gordura corporal criticamente baixa',
          message: `A tua gordura corporal está em ${latest.body_fat_pct}% — abaixo do limiar seguro de ${bfAlarm}%. Risco hormonal e de saúde óssea (RED-S).`,
          metric: 'BF%', value: latest.body_fat_pct, threshold: bfAlarm, module: 'corpo'
        });
      }

      // Gordura visceral elevada. Delega em @formulas/bodyComposition.ts
      // (T1) — antes só verificava `>= 14` (VISCERAL_FAT_ALERT_MAX), saltando
      // a faixa de alerta 10-13 por completo e sem distinguir "risco
      // elevado" (≥15) do simples "alerta" (10-14) que coach-chat já tinha
      // certo (ver specs/formulas-checklist.md Fase C).
      const visceralZone = classifyVisceralFat(latest.visceral_fat);
      if (visceralZone === 'high_risk') {
        insights.push({
          id: 'visceral_high', severity: 'critical',
          title: 'Gordura visceral em risco elevado',
          message: `A tua gordura visceral está em ${latest.visceral_fat} — na faixa de risco elevado (≥${VISCERAL_FAT_HIGH_RISK_MIN}, escala Renpho). Risco cardiovascular aumentado.`,
          metric: 'Visceral', value: latest.visceral_fat, threshold: VISCERAL_FAT_HIGH_RISK_MIN, module: 'corpo'
        });
      } else if (visceralZone === 'alert') {
        insights.push({
          id: 'visceral_alert', severity: 'warning',
          title: 'Gordura visceral em alerta',
          message: `A tua gordura visceral está em ${latest.visceral_fat} — na faixa de alerta (${VISCERAL_FAT_ALERT_MIN}-${VISCERAL_FAT_HIGH_RISK_MIN - 1}, escala Renpho).`,
          metric: 'Visceral', value: latest.visceral_fat, threshold: VISCERAL_FAT_ALERT_MIN, module: 'corpo'
        });
      }

      // Perda de peso rápida demais — delega em @formulas/weightLossRate.ts
      // (T1), já correta aqui (só mudou de casa, specs/formulas-checklist.md
      // Fase C). Distinto de propósito do "Sinal #1" do coach-chat (queda
      // súbita >1,5-2% em 48-72h, Bloco 5 #11) — este é o ritmo sustentado
      // de défice calórico (Bloco 4.2 #3), não um sinal agudo.
      const weightTrend = calculateWeightTrend(data.bodyAssessments);
      if (weightTrend) {
        const currentWeight = weightTrend.rawPoints[weightTrend.rawPoints.length - 1]?.weight || 70;
        const rate = assessWeightLossRate(weightTrend.weeklyRate, currentWeight, level);
        if (rate && rate.isTooFast) {
          insights.push({
            id: 'weight_loss_fast', severity: 'warning',
            title: 'Perda de peso demasiado rápida',
            message: `Estás a perder ~${Math.abs(weightTrend.weeklyRate).toFixed(1)} kg/semana (${rate.lossPct.toFixed(1)}% do peso). O máximo seguro para o teu nível é ${rate.maxPct}%.`,
            metric: 'Peso', value: rate.lossPct, threshold: rate.maxPct, module: 'corpo'
          });
        }
      }
    }

    // 4. Disponibilidade Energética (RED-S)
    if (data.meals?.length > 0 && data.bodyAssessments?.length > 0) {
      const ea = calculateEnergyAvailability(data.meals, data.bodyAssessments, data.runs || [], data.gymSessions || [], 'semana');
      if (ea && ea.isAtRisk) {
        insights.push({
          id: 'reds_risk', severity: 'critical',
          title: 'Risco de RED-S detetado',
          message: `A tua disponibilidade energética média é de ${ea.average} kcal/kg FFM — abaixo do limiar crítico de ${Constants.EA_CRITICAL}. Isto pode causar supressão hormonal e perda óssea. Aumenta a ingestão calórica.`,
          metric: 'EA', value: ea.average, threshold: Constants.EA_CRITICAL, module: 'nutricao'
        });
      } else if (ea && ea.average > 0 && ea.average < Constants.EA_OPTIMAL && ea.daysAtRisk >= 2) {
        insights.push({
          id: 'ea_subclinical', severity: 'info',
          title: 'Disponibilidade energética subótima',
          message: `A tua EA média é ${ea.average} kcal/kg FFM — entre 30 e 45. Aceitável a curto prazo mas monitoriza de perto.`,
          metric: 'EA', value: ea.average, threshold: Constants.EA_OPTIMAL, module: 'nutricao'
        });
      }
    }

    // 5. Marcos de Preparação e Volume para Provas Futuras
    if (data.raceEvents?.length > 0) {
      const now = new Date();
      const futureRaces = data.raceEvents
        .filter(r => r.status === 'agendada' && (isAfter(parseISO(r.date), now) || format(parseISO(r.date), 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (futureRaces.length > 0) {
        const next = futureRaces[0];
        const raceDate = parseISO(next.date);
        const daysLeft = Math.max(0, differenceInDays(raceDate, now));
        const dist = Number(next.distance_km) || 10;
        const raceName = next.name || 'a prova';
        // Usado no ramo de Tapering abaixo — calculado aqui para não
        // repetir a chamada (resolveExperienceLevel/getTaperDays são
        // baratas, mas uma só chamada é mais claro que duas).
        const taperDaysForNext = getTaperDays(dist, next.race_priority || 'a', resolveExperienceLevel(next, profile), next.race_type || 'estrada');

        // 5a. Marcos Temporais da Preparação (Timeline da Prova)
        if (daysLeft === 0) {
          insights.push({
            id: `race_day_${next.id || 'next'}`,
            severity: 'info',
            title: `Dia da Prova: ${raceName}`,
            message: `Chegou o grande dia de ${raceName} (${dist} km)! Executa o teu plano de ritmo e nutrição com confiança.`,
            metric: 'Prova', value: 0, threshold: 0, module: 'corrida'
          });
        } else if (daysLeft >= 1 && daysLeft <= 7) {
          insights.push({
            id: `race_final_week_${next.id || 'next'}`,
            severity: 'warning',
            title: `Reta Final: ${raceName}`,
            message: `Faltam apenas ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} para ${raceName} (${dist} km)! Foco em treinos curtos de ativação, hidratação, sono e descanso.`,
            metric: 'Prova', value: daysLeft, threshold: 7, module: 'corrida'
          });
        } else if (daysLeft >= 8 && daysLeft <= taperDaysForNext) {
          // Limiar delega em @formulas/taper.ts (T1) — eram 3 limiares fixos
          // em km (35/15) que nem batiam com categorizeDistance e ignoravam
          // nível/prioridade por completo (ver specs/formulas-checklist.md
          // Fase C). daysLeft 1-7 fica coberto pelo ramo "Reta Final" acima,
          // por isso o limiar inferior aqui mantém-se em 8.
          insights.push({
            id: `race_tapering_${next.id || 'next'}`,
            severity: 'info',
            title: `Fase de Polimento (Tapering): ${raceName}`,
            message: `Fase de carga máxima terminada para ${raceName}! Faltam ${Math.ceil(daysLeft / 7)} semanas (${daysLeft} dias). O volume vai descer para o corpo recuperar e supercompensar.`,
            metric: 'Tapering', value: daysLeft, threshold: taperDaysForNext, module: 'corrida'
          });
        } else if ((dist >= 35 && daysLeft >= 90 && daysLeft <= 126) || (dist >= 15 && dist < 35 && daysLeft >= 56 && daysLeft <= 84) || (dist < 15 && daysLeft >= 35 && daysLeft <= 56)) {
          insights.push({
            id: `race_cycle_start_${next.id || 'next'}`,
            severity: 'info',
            title: `Início da Preparação: ${raceName}`,
            message: `Arranque do ciclo específico para ${raceName} (${dist} km) — faltam ~${Math.ceil(daysLeft / 7)} semanas. O foco principal é a base aeróbica e a consistência.`,
            metric: 'Ciclo', value: daysLeft, threshold: 84, module: 'corrida'
          });
        }

        // 5b. Avaliação Tática Completa (Viabilidade + Ritmo)
        if (data.runs?.length > 0) {
          const weeklyVol = recentWeeklyVolume(data.runs, format(now, 'yyyy-MM-dd'));
          const expLevel = resolveExperienceLevel(next, profile);
          // dist em bruto para semanas de preparação e viabilidade — as
          // tabelas MIN_PREP_WEEKS/MIN_VOLUME_KM não têm categoria de trail
          // própria, e usar o equivalente ITRA cria um "penhasco" de
          // categoria por poucos km de D+ convertido (ver racePlanEngine.js).
          const totalWeeks = getRecommendedPrepWeeks(dist, expLevel);
          // effectiveStartISO/effectiveWeeksAvailable tratam o caso da prova
          // ter sido registada depois do início ideal do macrociclo — usar
          // sempre totalWeeks quando "em curso" fabricava semanas de
          // preparação que nunca existiram e escondia 'tempo_insuficiente'
          // num ciclo comprimido (bug relatado 2026-08-29, ver
          // racePlanEngine.js e specs/formulas-checklist.md P0-7).
          const { effectiveStartISO, effectiveWeeksAvailable } = computeEffectivePrepStart(next.date, totalWeeks, next.created_at || null);
          const inProgress = effectiveStartISO <= format(now, 'yyyy-MM-dd');
          const prepWeeksForViability = inProgress ? effectiveWeeksAvailable : Math.floor(daysLeft / 7);

          const viability = assessRaceViability({
            distanceKm: dist,
            experienceLevel: expLevel,
            weeksToRace: prepWeeksForViability,
            weeklyVolumeKm: weeklyVol > 0 ? weeklyVol : null,
            racePriority: next.race_priority || 'a',
          });

          // getRacePrediction já resolve nível (prioriza next.experience_level,
          // não só o do perfil) e distância equivalente ITRA — ponto único,
          // mesmo usado em RaceHubView/RunDashboard, para não voltar a
          // divergir por cada chamador repetir a lógica à sua maneira.
          const prediction = getRacePrediction(next, profile, data.runs);
          const predictedPaceReal = prediction.predictedPaceReal;
          const targetPace = next.target_pace_seconds_per_km;

          if (viability.flags.includes('ultra_para_iniciante')) {
            insights.push({
              id: 'race_tactic_ultra', severity: 'critical',
              title: `Risco Elevado: Ultra-Trail`,
              message: `Falta-te histórico de corrida de fundo (maratona) para suportar as cargas de uma Ultra. A recomendação da Carol é reduzir a distância para evitar sobrecargas articulares.`,
              metric: 'Viabilidade', value: 0, threshold: 0, module: 'corrida'
            });
          } else if (viability.flags.includes('tempo_insuficiente')) {
            insights.push({
              id: 'race_tactic_time', severity: 'warning',
              title: `Calendário Apertado: ${raceName}`,
              message: `O tempo de preparação restante é demasiado curto para a distância de ${dist}km. A Carol sugere que foques os treinos apenas em adaptação e ajustes as tuas expectativas de tempo.`,
              metric: 'Tempo', value: daysLeft, threshold: 0, module: 'corrida'
            });
          } else if (viability.flags.includes('volume_insuficiente')) {
            insights.push({
              id: 'race_volume', severity: 'warning',
              title: `Volume de Treino Insuficiente: ${raceName}`,
              message: `O teu volume semanal médio (${weeklyVol} km) não suporta em segurança a distância de ${dist}km. A Carol recomenda aumentar a carga gradualmente (regra dos 10%/semana) ou rever a distância.`,
              metric: 'Volume', value: weeklyVol, threshold: 0, module: 'corrida'
            });
          } else if (targetPace && predictedPaceReal > 0) {
            const paceDiffPct = (predictedPaceReal - targetPace) / targetPace;
            if (paceDiffPct > 0.10) {
              insights.push({
                id: 'race_tactic_pace', severity: 'warning',
                title: `Ritmo-Alvo Irrealista: ${raceName}`,
                message: `O teu alvo de ritmo é excessivamente otimista face ao teu VDOT atual. A Carol avisa que manter esse Pace vai causar quebra a meio da prova. Recalcula o alvo!`,
                metric: 'Pace', value: predictedPaceReal, threshold: targetPace, module: 'corrida'
              });
            }
          }
        }
      }
    }

    // 6. Desgaste das sapatilhas
    // Correr com a entressola gasta aumenta o risco de lesão. O limiar é por
    // par e já vem ajustado ao peso do atleta (ver utils/shoes.js); aqui só
    // se escolhe o par mais gasto — avisar sobre três pares ao mesmo tempo
    // enterrava os outros insights.
    if (data.shoes?.length > 0) {
      const [worst] = shoesNeedingAttention(data.shoes, data.runs || [], profile?.weight_kg);
      // 'atencao' (75%) fica de fora de propósito: dá para o armário mostrar
      // a barra a amarelo, mas não chega para ocupar um insight do Coach.
      if (worst && worst.wear.level !== 'atencao') {
        const excedida = worst.wear.level === 'excedida';
        insights.push({
          id: `shoe_wear_${worst.shoe.id}`,
          severity: excedida ? 'warning' : 'info',
          title: excedida ? 'Sapatilhas fora de prazo' : 'Sapatilhas perto do fim',
          message: excedida
            ? `As ${shoeLabel(worst.shoe)} já levam ${worst.wear.km} km — passaste os ${worst.wear.lifespanKm} km de vida útil estimada para o teu peso. A entressola já não absorve como devia; trocar de par é das formas mais baratas de evitar uma lesão.`
            : `As ${shoeLabel(worst.shoe)} vão em ${worst.wear.km} km dos ~${worst.wear.lifespanKm} km estimados para o teu peso. Faltam cerca de ${worst.wear.remainingKm} km — vai pensando no par seguinte para não seres apanhado a meio de um bloco de treino.`,
          metric: 'Km das sapatilhas', value: worst.wear.km, threshold: worst.wear.lifespanKm, module: 'corrida'
        });
      }
    }

    // Ordenar por severidade: critical > warning > info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    insights.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

    return insights;
  } catch (e) {
    return [];
  }
}

/**
 * Índice de Prontidão — composto de 4 pilares (sempre) + 1 pilar tático (só
 * com prova agendada). Delega em @formulas/readinessIndex.ts (T1.5) —
 * única implementação, partilhada com a Carol (specs/formulas-checklist.md
 * Fase E, o gap original que motivou toda a fase).
 */
export function calculateReadinessIndex(runs, meals, bodyAssessments, gymSessions, profile, nextRace = null) {
  try {
    return sharedComputeReadinessIndex(runs || [], meals || [], bodyAssessments || [], gymSessions || [], profile, todayISO(), nextRace);
  } catch (e) {
    return { score: 0, pillars: [], level: 'low' };
  }
}
