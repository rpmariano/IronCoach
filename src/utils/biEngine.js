/**
 * biEngine.js
 * Todas as funções de cálculo para os dashboards de BI do IronHealth.
 */
import { subDays, subWeeks, subMonths, subYears, isAfter, startOfWeek, differenceInSeconds, parseISO, isValid, format } from 'date-fns';
import * as Constants from './biConstants';

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
 * Running Analytics: Calcula ACWR (Acute:Chronic Workload Ratio) baseado na distância ou duração vezes RPE.
 */
export function calculateACWR(runs) {
  try {
    const now = new Date();
    const acuteDate = subDays(now, 7);
    const chronicDate = subDays(now, Constants.ACWR_MIN_HISTORY_DAYS);

    let acuteLoad = 0;
    let chronicLoad = 0;

    runs.forEach(run => {
      const d = parseISO(run.date);
      if (!isValid(d)) return;
      const load = (run.duration_seconds / 60) * (run.effort_rpe || 5); // Exemplo de load = duração (min) * RPE
      
      if (isAfter(d, chronicDate)) {
        chronicLoad += load;
        if (isAfter(d, acuteDate)) {
          acuteLoad += load;
        }
      }
    });

    const acuteAvg = acuteLoad;
    const chronicAvg = chronicLoad / 4; // média de 4 semanas
    const ratio = chronicAvg > 0 ? acuteAvg / chronicAvg : 0;
    const hasEnoughData = runs.some(r => !isAfter(parseISO(r.date), acuteDate));

    let status = 'safe';
    let color = 'green';
    
    if (ratio < Constants.ACWR_UNDER_TRAINING) {
      status = 'undertrained'; color = 'yellow';
    } else if (ratio > Constants.ACWR_DANGER) {
      status = 'danger'; color = 'red';
    } else if (ratio > Constants.ACWR_CAUTION_MAX) {
      status = 'caution'; color = 'orange';
    }

    return { acuteLoad, chronicLoad: chronicAvg, ratio, status, color, hasEnoughData };
  } catch (e) {
    return { acuteLoad: 0, chronicLoad: 0, ratio: 0, status: 'unknown', color: 'gray', hasEnoughData: false };
  }
}

/**
 * Calcula a distribuição de treino em zonas de intensidade.
 */
export function calculateTrainingDistribution(runs, level = 'medio') {
  try {
    let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;
    
    runs.forEach(run => {
      const zones = run.details?.hr_zones || [];
      zones.forEach(z => {
        if (z.zone === 1) z1 += z.minutes;
        if (z.zone === 2) z2 += z.minutes;
        if (z.zone === 3) z3 += z.minutes;
        if (z.zone === 4) z4 += z.minutes;
        if (z.zone === 5) z5 += z.minutes;
      });
    });

    const lowIntensity = z1 + z2;
    const highIntensity = z3 + z4 + z5;
    const total = lowIntensity + highIntensity;
    
    const lowIntensityPct = total > 0 ? (lowIntensity / total) * 100 : 0;
    const highIntensityPct = total > 0 ? (highIntensity / total) * 100 : 0;
    const targetLowPct = Constants.TARGET_LOW_INTENSITY_PCT[level] || 80;
    const isCompliant = lowIntensityPct >= targetLowPct - 5 && lowIntensityPct <= targetLowPct + 5;

    return { lowIntensityPct, highIntensityPct, z1Minutes: z1, z2Minutes: z2, z3Minutes: z3, z4Minutes: z4, z5Minutes: z5, isCompliant, targetLowPct };
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
 * Agrupa o volume semanal.
 */
export function calculateWeeklyVolume(runs) {
  try {
    const weeks = {};
    runs.forEach(r => {
      const d = parseISO(r.date);
      if (!isValid(d)) return;
      const weekStart = startOfWeek(d, { weekStartsOn: 1 }); // Segunda-feira
      const label = format(weekStart, 'yyyy-MM-dd');
      
      if (!weeks[label]) weeks[label] = { weekLabel: label, distanceKm: 0, durationMinutes: 0, sessions: 0 };
      weeks[label].distanceKm += (r.distance_km || 0);
      weeks[label].durationMinutes += (r.duration_seconds || 0) / 60;
      weeks[label].sessions += 1;
    });

    return Object.values(weeks).sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
  } catch (e) {
    return [];
  }
}

/**
 * Race Prediction via fórmula de Riegel.
 */
export function predictRaceTime(runs, targetDistanceKm, experienceLevel = 'medio') {
  try {
    const recentBest = runs.filter(r => r.distance_km > 0).sort((a, b) => {
      const paceA = a.duration_seconds / a.distance_km;
      const paceB = b.duration_seconds / b.distance_km;
      return paceA - paceB; // Pega as corridas mais rápidas
    })[0];

    if (!recentBest) return { predictedSeconds: 0, predictedPace: 0, confidence: 0, basedOn: null };

    const t1 = recentBest.duration_seconds;
    const d1 = recentBest.distance_km;
    const factor = Constants.RIEGEL_FACTOR[experienceLevel] || 1.06;
    
    const t2 = t1 * Math.pow((targetDistanceKm / d1), factor);

    return {
      predictedSeconds: t2,
      predictedPace: t2 / targetDistanceKm,
      confidence: (d1 / targetDistanceKm) > 0.5 ? 0.8 : 0.4,
      basedOn: { distance: d1, time: t1, date: recentBest.date }
    };
  } catch (e) {
    return { predictedSeconds: 0, predictedPace: 0, confidence: 0, basedOn: null };
  }
}

/**
 * Calcula VDOT (aproximação de Daniels) a partir de distância e tempo.
 * Usa a equação de regressão de Daniels & Gilbert (1979).
 * @param {number} distanceKm - Distância em km.
 * @param {number} timeSeconds - Tempo em segundos.
 * @returns {number} Estimativa de VDOT.
 */
export function calculateVDOT(distanceKm, timeSeconds) {
  try {
    if (!distanceKm || distanceKm <= 0 || !timeSeconds || timeSeconds <= 0) return 0;
    const distanceMeters = distanceKm * 1000;
    const timeMinutes = timeSeconds / 60;
    const velocityMPerMin = distanceMeters / timeMinutes;

    // VO2 da corrida (ml/kg/min) — Equação de Daniels:
    // VO2 = -4.60 + 0.182258 * v + 0.000104 * v^2
    // Onde v = velocidade em m/min
    const vo2Run = -4.60 + 0.182258 * velocityMPerMin + 0.000104 * Math.pow(velocityMPerMin, 2);

    // Fração de VO2max utilizada (% VO2max) — função do tempo:
    // %VO2max = 0.8 + 0.1894393 * e^(-0.012778*t) + 0.2989558 * e^(-0.1932605*t)
    // Onde t = tempo em minutos
    const pctVO2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMinutes)
                         + 0.2989558 * Math.exp(-0.1932605 * timeMinutes);

    // VDOT = VO2 da corrida / fração de VO2max
    const vdot = pctVO2max > 0 ? vo2Run / pctVO2max : 0;
    return Math.max(0, Math.round(vdot * 10) / 10);
  } catch (e) {
    return 0;
  }
}

/**
 * Calcula a tendência de VDOT ao longo do tempo.
 * Filtra apenas corridas que qualificam como "time trials" (competição ou treinos de qualidade >= 3km).
 */
export function getVDOTTrend(runs) {
  try {
    return runs
      .filter(r => r.distance_km >= 3 && r.duration_seconds > 0 &&
                   (r.kind === 'competicao' || r.training_type === 'tempo' ||
                    r.training_type === 'intervalos' || r.effort_rpe >= 7))
      .map(r => ({
        date: r.date,
        vdot: calculateVDOT(r.distance_km, r.duration_seconds),
        label: r.name || r.kind
      }))
      .filter(r => r.vdot > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    return [];
  }
}

/** Gym Analytics */
export function calculateVolumeLoad(gymSessions, dateRange) {
  try {
    const filtered = filterByDateRange(gymSessions, dateRange);
    let totalVolumeLoad = 0;
    const weeks = {};

    filtered.forEach(s => {
      const vl = s.volume_kg || 0;
      totalVolumeLoad += vl;
      
      const d = parseISO(s.date);
      if (isValid(d)) {
        const weekStart = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        if (!weeks[weekStart]) weeks[weekStart] = { weekLabel: weekStart, volumeLoad: 0 };
        weeks[weekStart].volumeLoad += vl;
      }
    });

    return {
      totalVolumeLoad,
      weeklyBreakdown: Object.values(weeks).sort((a,b) => a.weekLabel.localeCompare(b.weekLabel)),
      acwr: 1.0, // Simplificação
      acwrStatus: 'safe'
    };
  } catch (e) {
    return { totalVolumeLoad: 0, weeklyBreakdown: [], acwr: 0, acwrStatus: 'unknown' };
  }
}

export function calculate1RMProgression(gymSessions, exerciseName) {
  try {
    const progression = [];
    gymSessions.forEach(session => {
      const sets = session.workout_session_sets?.filter(s => s.exercise_name.toLowerCase() === exerciseName.toLowerCase()) || [];
      if (sets.length > 0) {
        let max1RM = 0;
        let maxWeight = 0;
        let bestReps = 0;
        
        sets.forEach(set => {
          const epley1RM = set.weight * (1 + set.reps / 30);
          if (epley1RM > max1RM) {
            max1RM = epley1RM;
            maxWeight = set.weight;
            bestReps = set.reps;
          }
        });

        progression.push({ date: session.date, estimated1RM: max1RM, maxWeight, bestSetReps: bestReps });
      }
    });
    return progression.sort((a,b) => a.date.localeCompare(b.date));
  } catch (e) {
    return [];
  }
}

export function calculateMuscleGroupVolume(gymSessions, dateRange) {
  try {
    const filtered = filterByDateRange(gymSessions, dateRange);
    const groups = {};
    
    filtered.forEach(s => {
      const cats = s.categories || [];
      cats.forEach(cat => {
        if (!groups[cat]) groups[cat] = { sets: 0, volumeLoad: 0 };
        groups[cat].sets += (s.workout_session_sets?.length || 0);
        groups[cat].volumeLoad += (s.volume_kg || 0);
      });
    });
    return groups;
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
export function calculateWeightTrend(bodyAssessments) {
  try {
    if (!bodyAssessments || bodyAssessments.length === 0) return null;
    const sorted = [...bodyAssessments]
      .filter(a => a.weight_kg > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) return null;

    const rawPoints = sorted.map(a => ({ date: a.date, weight: a.weight_kg }));

    // EWMA com alpha = 2/(N+1), onde N = 7 dias (suavização de 7 dias)
    const alpha = 2 / (7 + 1); // ~0.25
    const movingAverage = [];
    let ewma = rawPoints[0].weight;

    for (const pt of rawPoints) {
      ewma = alpha * pt.weight + (1 - alpha) * ewma;
      movingAverage.push({ date: pt.date, weight: Math.round(ewma * 100) / 100 });
    }

    // Calcular tendência e taxa semanal
    let trend = 'estavel';
    let weeklyRate = 0;
    if (movingAverage.length >= 2) {
      const recent = movingAverage[movingAverage.length - 1];
      // Encontrar ponto de ~7 dias atrás
      const oneWeekAgo = subDays(parseISO(recent.date), 7);
      const weekAgoPoint = movingAverage.find(p => {
        const d = parseISO(p.date);
        return isValid(d) && isAfter(d, subDays(oneWeekAgo, 3));
      });

      if (weekAgoPoint) {
        const diff = recent.weight - weekAgoPoint.weight;
        weeklyRate = Math.round(diff * 100) / 100;
        if (diff < -0.3) trend = 'descendo';
        else if (diff > 0.3) trend = 'subindo';
      } else {
        // Fallback: comparar primeiro e último
        const diff = movingAverage[movingAverage.length - 1].weight - movingAverage[0].weight;
        if (diff < -0.5) trend = 'descendo';
        else if (diff > 0.5) trend = 'subindo';
      }
    }

    return { rawPoints, movingAverage, trend, weeklyRate };
  } catch (e) {
    return null;
  }
}

export function calculateCompositionTrend(bodyAssessments) {
  try {
    const sorted = [...bodyAssessments].sort((a,b) => a.date.localeCompare(b.date));
    const dates = [];
    const fatMassKg = [];
    const leanMassKg = [];

    sorted.forEach(a => {
      dates.push(a.date);
      const fat = a.weight_kg * (a.body_fat_pct / 100);
      fatMassKg.push(fat);
      leanMassKg.push(a.lean_body_mass_kg || (a.weight_kg - fat));
    });

    return { dates, fatMassKg, leanMassKg };
  } catch(e) {
    return { dates: [], fatMassKg: [], leanMassKg: [] };
  }
}

/** Nutrition Analytics */

/**
 * Calcula a aderência real às macros usando os dados de refeições.
 * Retorna valores em g/kg de peso corporal e compliance face aos objetivos.
 */
export function calculateMacroAdherence(meals, profile, bodyAssessments, dateRange) {
  try {
    const filtered = filterByDateRange(meals, dateRange);
    if (filtered.length === 0) return null;

    // Usar peso mais recente das avaliações corporais, ou do perfil
    const sortedBody = bodyAssessments?.length
      ? [...bodyAssessments].sort((a, b) => b.date.localeCompare(a.date))
      : [];
    const weight = sortedBody[0]?.weight_kg || profile?.weight_kg || 70;

    // Agrupar por dia e calcular totais
    const dailyTotals = {};
    filtered.forEach(meal => {
      const day = meal.date;
      if (!dailyTotals[day]) dailyTotals[day] = { cal: 0, prot: 0, carbs: 0, fat: 0 };
      (meal.meal_items || []).forEach(item => {
        const qty = (item.quantity_grams || 0) / 100;
        dailyTotals[day].cal += (item.calories_per_100g || 0) * qty;
        dailyTotals[day].prot += (item.protein_per_100g || 0) * qty;
        dailyTotals[day].carbs += (item.carbs_per_100g || 0) * qty;
        dailyTotals[day].fat += (item.fat_per_100g || 0) * qty;
      });
    });

    const days = Object.values(dailyTotals);
    const numDays = days.length || 1;
    const avgCal = days.reduce((s, d) => s + d.cal, 0) / numDays;
    const avgProt = days.reduce((s, d) => s + d.prot, 0) / numDays;
    const avgCarbs = days.reduce((s, d) => s + d.carbs, 0) / numDays;
    const avgFat = days.reduce((s, d) => s + d.fat, 0) / numDays;

    const protPerKg = Math.round((avgProt / weight) * 10) / 10;
    const carbsPerKg = Math.round((avgCarbs / weight) * 10) / 10;
    const fatPerKg = Math.round((avgFat / weight) * 10) / 10;

    const calTarget = profile?.calorie_goal || 2000;
    const protTarget = profile?.protein_goal || 150;
    const carbsTarget = profile?.carbs_goal || 200;
    const fatTarget = profile?.fat_goal || 70;

    return {
      protein: { actual_g_per_kg: protPerKg, actual_g: Math.round(avgProt), target: protTarget, compliance_pct: Math.round((avgProt / protTarget) * 100) },
      carbs: { actual_g_per_kg: carbsPerKg, actual_g: Math.round(avgCarbs), target: carbsTarget, compliance_pct: Math.round((avgCarbs / carbsTarget) * 100) },
      fat: { actual_g_per_kg: fatPerKg, actual_g: Math.round(avgFat), target: fatTarget, compliance_pct: Math.round((avgFat / fatTarget) * 100) },
      calories: { actual: Math.round(avgCal), target: calTarget, compliance_pct: Math.round((avgCal / calTarget) * 100) },
      weight,
      dailyBreakdown: Object.entries(dailyTotals).map(([date, totals]) => ({
        date,
        protein: Math.round((totals.prot / weight) * 10) / 10,
        carbs: Math.round((totals.carbs / weight) * 10) / 10,
        fat: Math.round((totals.fat / weight) * 10) / 10,
        proteinTarget: protTarget / weight,
        carbsTarget: carbsTarget / weight,
        fatTarget: fatTarget / weight
      })).sort((a, b) => a.date.localeCompare(b.date))
    };
  } catch (e) {
    return null;
  }
}

/**
 * Calcula a Disponibilidade Energética (EA) para deteção de RED-S.
 * EA = (Kcal Ingeridas - Kcal Gasto Exercício) / Massa Magra (kg)
 * Limiar crítico: < 30 kcal/kg FFM/dia
 */
export function calculateEnergyAvailability(meals, bodyAssessments, runs, gymSessions, dateRange) {
  try {
    const filteredMeals = filterByDateRange(meals, dateRange);
    const filteredRuns = filterByDateRange(runs, dateRange);
    const filteredGym = filterByDateRange(gymSessions, dateRange);

    // Massa magra mais recente
    const sortedBody = bodyAssessments?.length
      ? [...bodyAssessments].sort((a, b) => b.date.localeCompare(a.date))
      : [];
    const leanMass = sortedBody[0]?.lean_body_mass_kg || (sortedBody[0]?.weight_kg * (1 - (sortedBody[0]?.body_fat_pct || 20) / 100)) || 55;
    const weight = sortedBody[0]?.weight_kg || 70;

    // Agrupar por dia
    const days = {};
    const addDay = (date) => { if (!days[date]) days[date] = { intake: 0, exercise: 0 }; };

    // Ingestão calórica por dia
    filteredMeals.forEach(meal => {
      addDay(meal.date);
      (meal.meal_items || []).forEach(item => {
        const qty = (item.quantity_grams || 0) / 100;
        days[meal.date].intake += (item.calories_per_100g || 0) * qty;
      });
    });

    // Gasto de exercício por dia — Corrida: ~1 kcal/kg/km
    filteredRuns.forEach(run => {
      addDay(run.date);
      days[run.date].exercise += (run.distance_km || 0) * weight * Constants.RUNNING_COST_KCAL_PER_KG_KM;
    });

    // Gasto de exercício — Ginásio: usar calories_kcal se disponível
    filteredGym.forEach(session => {
      addDay(session.date);
      days[session.date].exercise += session.calories_kcal || 200; // fallback 200 kcal
    });

    // Calcular EA diária
    const daily = Object.entries(days).map(([date, d]) => {
      const ea = leanMass > 0 ? (d.intake - d.exercise) / leanMass : 0;
      let status = 'optimal';
      if (ea < Constants.EA_CRITICAL) status = 'critical';
      else if (ea < Constants.EA_OPTIMAL) status = 'subclinical';
      return { date, ea: Math.round(ea * 10) / 10, status, intake: Math.round(d.intake), exercise: Math.round(d.exercise) };
    }).sort((a, b) => a.date.localeCompare(b.date));

    const average = daily.length > 0 ? Math.round(daily.reduce((s, d) => s + d.ea, 0) / daily.length * 10) / 10 : 0;
    const daysAtRisk = daily.filter(d => d.status === 'critical').length;
    const isAtRisk = daysAtRisk >= Constants.EA_CRITICAL_DURATION_DAYS;

    return { daily, average, isAtRisk, daysAtRisk, leanMass };
  } catch (e) {
    return { daily: [], average: 0, isAtRisk: false, daysAtRisk: 0, leanMass: 0 };
  }
}

/**
 * Calcula métricas cruzadas entre módulos para a vista holística.
 */
export function calculateCrossMetrics(runs, gymSessions, meals, bodyAssessments, dateRange) {
  try {
    const filteredRuns = filterByDateRange(runs, dateRange);
    const filteredBody = filterByDateRange(bodyAssessments, dateRange);

    // Peso vs Pace — encontrar pares temporais
    const weightVsPace = [];
    filteredRuns.forEach(run => {
      if (!run.distance_km || !run.duration_seconds) return;
      const pace = run.duration_seconds / run.distance_km;
      // Encontrar avaliação corporal mais próxima
      const closest = filteredBody.reduce((best, ba) => {
        const diff = Math.abs(parseISO(ba.date) - parseISO(run.date));
        return (!best || diff < best.diff) ? { weight: ba.weight_kg, diff } : best;
      }, null);
      if (closest) {
        weightVsPace.push({ date: run.date, weight: closest.weight, pace: Math.round(pace) });
      }
    });

    // Carga de ginásio vs RPE de corrida (por semana)
    const gymLoadVsRunRPE = [];
    const weeklyGym = {};
    const weeklyRunRPE = {};
    filterByDateRange(gymSessions, dateRange).forEach(s => {
      const d = parseISO(s.date);
      if (!isValid(d)) return;
      const wk = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      weeklyGym[wk] = (weeklyGym[wk] || 0) + (s.volume_kg || 0);
    });
    filteredRuns.forEach(r => {
      const d = parseISO(r.date);
      if (!isValid(d)) return;
      const wk = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      if (!weeklyRunRPE[wk]) weeklyRunRPE[wk] = { total: 0, count: 0 };
      weeklyRunRPE[wk].total += (r.effort_rpe || 5);
      weeklyRunRPE[wk].count += 1;
    });
    Object.keys({ ...weeklyGym, ...weeklyRunRPE }).forEach(wk => {
      const rpe = weeklyRunRPE[wk] ? weeklyRunRPE[wk].total / weeklyRunRPE[wk].count : 0;
      gymLoadVsRunRPE.push({ date: wk, gymVolume: weeklyGym[wk] || 0, runRPE: Math.round(rpe * 10) / 10 });
    });
    gymLoadVsRunRPE.sort((a, b) => a.date.localeCompare(b.date));

    // ACWR combinado (corrida + ginásio)
    const runACWR = calculateACWR(runs);
    const gymVL = calculateVolumeLoad(gymSessions, 'mes');
    const combinedACWR = Math.max(runACWR.ratio, gymVL.acwr || 0);

    return { weightVsPace, gymLoadVsRunRPE, combinedACWR };
  } catch (e) {
    return { weightVsPace: [], gymLoadVsRunRPE: [], combinedACWR: 0 };
  }
}

/**
 * Deteta insights proativos do Coach baseados nos limiares da doutrina.
 * Verifica múltiplas dimensões e retorna alertas ordenados por severidade.
 * @param {{ runs, gymSessions, meals, bodyAssessments, raceEvents }} data
 * @param {object} profile
 * @returns {Array<{ id, severity, title, message, metric, value, threshold, module }>}
 */
export function detectCoachInsights(data, profile) {
  try {
    const insights = [];
    const level = profile?.experience_level || 'medio';
    const gender = profile?.gender || 'M';

    // 1. ACWR de Corrida
    if (data.runs?.length > 0) {
      const acwr = calculateACWR(data.runs);
      if (acwr.hasEnoughData && acwr.status === 'danger') {
        insights.push({
          id: 'acwr_danger', severity: 'critical',
          title: 'Carga de treino perigosa',
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

      // Gordura visceral elevada
      if (latest.visceral_fat && latest.visceral_fat >= Constants.VISCERAL_FAT_ALERT_MAX) {
        insights.push({
          id: 'visceral_high', severity: 'warning',
          title: 'Gordura visceral elevada',
          message: `A tua gordura visceral está em ${latest.visceral_fat} — acima do limiar de alerta (${Constants.VISCERAL_FAT_ALERT_MAX}). Risco cardiovascular aumentado.`,
          metric: 'Visceral', value: latest.visceral_fat, threshold: Constants.VISCERAL_FAT_ALERT_MAX, module: 'corpo'
        });
      }

      // Perda de peso rápida demais
      const weightTrend = calculateWeightTrend(data.bodyAssessments);
      if (weightTrend && weightTrend.weeklyRate < 0) {
        const maxLoss = Constants.MAX_WEIGHT_LOSS_PCT_WEEK[level] || 0.7;
        const currentWeight = weightTrend.rawPoints[weightTrend.rawPoints.length - 1]?.weight || 70;
        const lossPct = Math.abs(weightTrend.weeklyRate / currentWeight) * 100;
        if (lossPct > maxLoss) {
          insights.push({
            id: 'weight_loss_fast', severity: 'warning',
            title: 'Perda de peso demasiado rápida',
            message: `Estás a perder ~${Math.abs(weightTrend.weeklyRate).toFixed(1)} kg/semana (${lossPct.toFixed(1)}% do peso). O máximo seguro para o teu nível é ${maxLoss}%.`,
            metric: 'Peso', value: lossPct, threshold: maxLoss, module: 'corpo'
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

    // 5. Volume insuficiente para próxima prova
    if (data.raceEvents?.length > 0 && data.runs?.length > 0) {
      const now = new Date();
      const futureRaces = data.raceEvents
        .filter(r => r.status === 'agendada' && isAfter(parseISO(r.date), now))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (futureRaces.length > 0) {
        const next = futureRaces[0];
        const weeklyVol = calculateWeeklyVolume(data.runs);
        const recent4 = weeklyVol.slice(-4);
        const avgWeekly = recent4.length > 0 ? recent4.reduce((s, w) => s + w.distanceKm, 0) / recent4.length : 0;

        // Verificar se o volume é adequado (usando limiares simplificados)
        const minVolumes = { 5: 15, 10: 25, 21: 35, 42: 55, 50: 70 };
        const closest = Object.entries(minVolumes).reduce((best, [dist, vol]) => {
          return Math.abs(Number(dist) - next.distance_km) < Math.abs(Number(best[0]) - next.distance_km) ? [dist, vol] : best;
        });
        const minVol = closest[1];

        if (avgWeekly < minVol * 0.7) {
          insights.push({
            id: 'race_volume', severity: 'warning',
            title: `Volume insuficiente para ${next.name || 'a prova'}`,
            message: `O teu volume semanal médio é ${avgWeekly.toFixed(0)} km — abaixo do recomendado (~${minVol} km/semana) para uma prova de ${next.distance_km} km.`,
            metric: 'Volume', value: avgWeekly, threshold: minVol, module: 'corrida'
          });
        }
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
