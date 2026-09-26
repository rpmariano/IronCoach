// Índice de Prontidão — composto de 3 pilares (sempre) + o de carga (só com
// histórico de corrida, runAcwr.ts) + 1 pilar tático (só quando há prova
// agendada) + 1 pilar do check-in de hoje (só quando o atleta o fez), score
// 0-100.
//
// @contexto Migrado de src/utils/biEngine.js calculateReadinessIndex
// (specs/formulas-checklist.md Fase E) — o gap original que motivou toda
// a Fase E: antes desta migração, este número só existia no ecrã (Home,
// RaceHubView) e a Carol não tinha acesso nem a ele nem aos componentes.
// Compõe seis módulos já partilhados: runAcwr, energyAvailabilityWindow,
// macroAdherence, nutritionCompliance, vdotTrend, raceViability e
// racePlanning — o mesmo código que a UI usa, não uma reconstrução.

import { computeRunAcwr, type RunForAcwr } from "./runAcwr.ts";
import { computeEnergyAvailabilityWindow, type MealForEA, type GymSessionForEA, type BodyAssessmentForEA } from "./energyAvailabilityWindow.ts";
import { computeMacroAdherence, type MealForAdherence, type ProfileForAdherence, type BodyAssessmentForAdherence } from "./macroAdherence.ts";
import { classifyCalorieCompliance } from "./nutritionCompliance.ts";
import { computeVdotTrend, type RunForVdot } from "./vdotTrend.ts";
import { knownWeeklyVolume, assessRaceViability } from "./raceViability.ts";
import { getRecommendedPrepWeeks, resolveExperienceLevel, getRacePrediction, computeEffectivePrepStart, type RaceForPlanning, type ProfileForPlanning } from "./racePlanning.ts";
import type { RaceRun } from "./racePrediction.ts";
import { PAIN_ALARM_THRESHOLD } from "./checkinAlarms.ts";
import { getTaperDays } from "./taper.ts";

export interface ReadinessPillar {
  key: "acwr" | "ea" | "calories" | "vdot" | "tactic" | "checkin";
  label: string;
  score: number;
  desc: string;
}

export interface ReadinessIndex {
  score: number;
  pillars: ReadinessPillar[];
  level: "high" | "medium" | "low";
}

export interface NextRaceForReadiness extends RaceForPlanning {
  date: string;
  target_pace_seconds_per_km?: number | null;
  race_priority?: string | null;
  // Quando foi marcada — decide se a preparação teve o tempo ideal (T1,
  // racePlanning.ts, computeEffectivePrepStart) ou se o macrociclo nasceu
  // já comprimido. Sem ela, assume-se o início ideal (comportamento antigo).
  created_at?: string | null;
}

/** O check-in de HOJE (daily_checkins): sono/energia/stress 1-5, dor 0-10. */
export interface CheckinForReadiness {
  sleep?: number | null;
  energy?: number | null;
  stress?: number | null;
  pain?: number | null;
}

/** O que se sabe do dia, para o texto do pilar não falar de um treino que
 *  não há, nem tratar a véspera ou o dia de uma prova como um dia qualquer
 *  (revisão de 2026-09-26). `trainingToday`: true com treino previsto,
 *  false num dia de descanso/sem plano/já feito, omitido quando o chamador
 *  não sabe (mantém o texto genérico de sempre). */
export interface ReadinessDayContext {
  trainingToday?: boolean;
  raceTodayOrTomorrow?: boolean;
}

// Uma escala 1-5 em 0-100 (1 → 0, 5 → 100). No stress, 1 é "calmo": inverte-se.
const scale5 = (v: number) => (v - 1) * 25;

/** "0.65" → "0,65", como se escreve em português — em todas as frases fixas
 *  deste ficheiro (revisão de 2026-09-26; toFixed nunca devolve vírgula). */
const virgula = (n: number, casas = 2): string => n.toFixed(casas).replace(".", ",");

/**
 * Pilar "Como acordaste" (2026-09-23): até aqui o atleta dizia que dormiu mal
 * e o índice não mexia. Média do sono, da energia e da calma; a dor tira 5
 * pontos por cada ponto abaixo do limiar do alarme G2/G5 (PAIN_ALARM_THRESHOLD,
 * checkinAlarms.ts) e, a partir dele, o pilar fica no máximo em 20. Sem
 * check-in de hoje, o pilar não existe (não há dado, não há nota inventada).
 *
 * O texto usa o mesmo corte do resumo do dia e das boas-vindas: sono ou
 * energia ≤2 é um dia em baixo, seja qual for a média — nunca "acordaste bem"
 * a quem dormiu mal. E é lido também pela Carol (buildReadinessPanel), por
 * isso fala na voz dela.
 *
 * Revisão de 2026-09-26: "Hoje o treino é mais leve." e "a favor do treino
 * de hoje" presumiam um treino que num dia de descanso, sem plano, ou na
 * véspera/dia de uma prova não existe — e o cartão do Início (que lê o
 * mesmo check-in) já dizia o dia certo ao lado. `ctx` (ReadinessDayContext)
 * é opcional: sem ele, o texto genérico de sempre.
 */
export function checkinPillar(c: CheckinForReadiness | null | undefined, ctx: ReadinessDayContext = {}): ReadinessPillar | null {
  const sleep = Number(c?.sleep), energy = Number(c?.energy), stress = Number(c?.stress);
  if (![sleep, energy, stress].every((v) => v >= 1 && v <= 5)) return null;
  const base = (scale5(sleep) + scale5(energy) + scale5(6 - stress)) / 3;
  const pain = Math.max(0, Number(c?.pain) || 0);
  const painAlarm = pain >= PAIN_ALARM_THRESHOLD;
  const score = Math.round(painAlarm ? Math.min(base, 20) : Math.max(0, base - pain * 5));
  const emBaixo = sleep <= 2 || energy <= 2;
  const { trainingToday, raceTodayOrTomorrow } = ctx;

  let desc: string;
  if (painAlarm) {
    desc = `Dor de ${pain}/10: hoje nada de impacto. Fala comigo no chat.`;
  } else if (emBaixo) {
    if (raceTodayOrTomorrow) desc = "Dormiste mal. Na véspera de uma prova é normal; não mexe na prova.";
    else if (trainingToday === false) desc = "Dormiste mal. Hoje é descanso: recupera o sono.";
    else desc = sleep <= 2 ? "Dormiste mal. Hoje o treino é mais leve." : "Estás sem energia. Hoje o treino é mais leve.";
  } else if (raceTodayOrTomorrow) {
    // A prova manda sobre o plano do dia: sem plano aceite, trainingToday
    // vinha false e a véspera (ou o próprio dia) passava por "descanso"
    // (revisão pré-deploy de 2026-09-26).
    desc = score >= 75 ? "Acordaste bem. Com a prova tão perto, é isto que se quer."
      : score >= 50 ? "Dia normal. Com a prova tão perto, não mudes nada."
        : "Hoje estás em baixo. Perto de uma prova é normal; não mexe na prova.";
  } else if (score >= 75) {
    desc = trainingToday === false
      ? "Acordaste bem. Hoje é descanso; guarda isso para o próximo treino."
      : "Acordaste bem: sono, energia e cabeça a favor do treino de hoje.";
  } else if (score >= 50) {
    // Sem o adjetivo com género ("atento"): "com atenção" serve qualquer atleta.
    desc = trainingToday === false ? "Dia normal. Hoje é descanso." : "Dia normal. Treina, com atenção a como te sentes.";
  } else {
    desc = trainingToday === false ? "Hoje estás em baixo. Ainda bem que é dia de descanso." : "Hoje estás em baixo. Um treino mais leve rende mais.";
  }
  return { key: "checkin", label: "Como acordaste", score, desc };
}

type RunInput = RunForAcwr & RunForVdot & RaceRun;
type MealInput = MealForEA & MealForAdherence;
type BodyInput = BodyAssessmentForEA & BodyAssessmentForAdherence;
type GymInput = GymSessionForEA;

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenISO(laterISO: string, earlierISO: string): number {
  const a = new Date(laterISO + "T00:00:00Z").getTime();
  const b = new Date(earlierISO + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

export function computeReadinessIndex(
  runs: RunInput[],
  meals: MealInput[],
  bodyAssessments: BodyInput[],
  gymSessions: GymInput[],
  profile: ProfileForAdherence & ProfileForPlanning,
  todayISO: string,
  nextRace: NextRaceForReadiness | null = null,
  todayCheckin: CheckinForReadiness | null = null,
  // Há treino previsto hoje (revisão de 2026-09-26)? Omitido quando o
  // chamador não tem o plano à mão — o pilar do check-in fica com o texto
  // genérico de sempre; `raceTodayOrTomorrow` já se sabe por `nextRace`.
  trainingToday?: boolean,
): ReadinessIndex {
  const pillars: ReadinessPillar[] = [];
  const raceTodayOrTomorrow = !!nextRace && (nextRace.date === todayISO || nextRace.date === addDaysISO(todayISO, 1));

  // Viabilidade da prova (T1, racePlanning.ts): quantas semanas a preparação
  // teve mesmo, e não as ideais — o mesmo cálculo do hub (effectiveWeeksAvailable,
  // computeEffectivePrepStart). Calculado aqui, uma vez, para o pilar da
  // carga (o polimento) e o tático (mais abaixo) não divergirem.
  const distanceKm = nextRace ? (parseFloat((nextRace.distance_km ?? "10").toString().replace(",", ".")) || 10) : null;
  const expLevel = nextRace ? resolveExperienceLevel(nextRace, profile) : null;
  const daysToRace = nextRace ? daysBetweenISO(nextRace.date, todayISO) : null;
  const totalWeeks = distanceKm != null && expLevel ? getRecommendedPrepWeeks(distanceKm, expLevel) : null;
  const effectiveWeeksAvailable = nextRace && totalWeeks != null
    ? computeEffectivePrepStart(nextRace.date, totalWeeks, nextRace.created_at ?? null).effectiveWeeksAvailable
    : null;
  // No polimento de uma prova A, a carga baixa é o plano, não um alerta.
  const emPolimento = !!(nextRace && daysToRace != null && daysToRace >= 0
    && daysToRace <= getTaperDays(distanceKm, nextRace.race_priority || "a", expLevel || "iniciante", nextRace.race_type ?? null));

  // --- Pilar 1: ACWR ---
  // Só com histórico (corridas em 3 das 4 semanas, runAcwr.ts). Sem ele o
  // pilar não entra — como o tático sem prova e o do check-in sem check-in —
  // em vez de dizer "Carga de risco (2,00)" a quem só registou duas corridas
  // (pedido 2026-09-24: "se a app não tem dados, não apresenta dados").
  const acwr = computeRunAcwr(runs || [], todayISO);
  const acwrRatio = acwr.ratio || 0;
  if (acwr.hasEnoughData) {
    let acwrScore = 60;
    let acwrDesc = emPolimento
      ? `Carga baixa (${virgula(acwrRatio)}), como deve ser no polimento.`
      : `Carga baixa (${virgula(acwrRatio)}). Podes aumentar gradualmente.`;
    if (acwrRatio >= 0.8 && acwrRatio <= 1.3) {
      acwrScore = 100;
      acwrDesc = `Carga ideal (${virgula(acwrRatio)}). Estás no sweet-spot de adaptação.`;
    } else if (acwrRatio > 1.3 && acwrRatio <= 1.5) {
      acwrScore = 50;
      acwrDesc = `Carga elevada (${virgula(acwrRatio)}). Zona de atenção — reduz um pouco.`;
    } else if (acwrRatio > 1.5) {
      acwrScore = 0;
      acwrDesc = `Carga de risco (${virgula(acwrRatio)}). Risco de lesão aumentado.`;
    }
    pillars.push({ key: "acwr", label: "Carga de Treino", score: acwrScore, desc: acwrDesc });
  }

  // --- Pilar 2: Disponibilidade Energética ---
  const ea = computeEnergyAvailabilityWindow(meals || [], bodyAssessments || [], runs || [], gymSessions || [], todayISO, "semana");
  const eaAvg = ea?.average ?? 0;
  let eaScore = 0;
  let eaDesc = "Sem dados nutricionais suficientes.";
  if (eaAvg >= 45) {
    eaScore = 100;
    eaDesc = `EA de ${eaAvg} kcal/kg. Energia adequada para o treino.`;
  } else if (eaAvg >= 30) {
    eaScore = 60;
    eaDesc = `EA de ${eaAvg} kcal/kg. Subótima — come mais para sustentar o volume.`;
  } else if (eaAvg > 0) {
    eaScore = 10;
    eaDesc = `EA de ${eaAvg} kcal/kg. Crítico — risco de RED-S. Aumenta a ingestão.`;
  }
  pillars.push({ key: "ea", label: "Disponibilidade Energética", score: eaScore, desc: eaDesc });

  // --- Pilar 3: Compliance Calórica ---
  const macros = computeMacroAdherence(meals || [], profile, bodyAssessments || [], todayISO, "semana");
  const calPct = macros?.calories?.compliance_pct ?? 0;
  const calZone = classifyCalorieCompliance(calPct);
  let calScore = 0;
  let calDesc = "Sem dados de nutrição suficientes.";
  if (calZone === "ok") {
    calScore = 100;
    calDesc = `${calPct}% do alvo calórico. Nutrição alinhada com o esforço.`;
  } else if (calZone === "low" || calZone === "over") {
    calScore = 65;
    calDesc = `${calPct}% do alvo calórico. Podes melhorar a consistência nutricional.`;
  } else if (calZone === "critical") {
    calScore = 20;
    calDesc = `${calPct}% do alvo calórico. Ingestão muito baixa para o volume de treino.`;
  }
  pillars.push({ key: "calories", label: "Nutrição", score: calScore, desc: calDesc });

  // --- Pilar 4: Tendência VDOT ---
  const vdotTrend = computeVdotTrend(runs || []);
  let vdotScore = 0;
  let vdotDesc = "Sem corridas qualificadas para calcular VDOT.";
  if (vdotTrend.length >= 2) {
    const last = vdotTrend[vdotTrend.length - 1].vdot;
    const prev = vdotTrend.slice(0, -1).reduce((s, d) => s + d.vdot, 0) / (vdotTrend.length - 1);
    if (last > prev) {
      vdotScore = 100;
      vdotDesc = `VDOT ${last.toFixed(1)} (↑ melhoria). A tua capacidade aeróbica está a crescer.`;
    } else if (last >= prev * 0.97) {
      vdotScore = 70;
      vdotDesc = `VDOT ${last.toFixed(1)} (→ estável). A manter a forma — adiciona um treino de qualidade.`;
    } else {
      vdotScore = 30;
      vdotDesc = `VDOT ${last.toFixed(1)} (↓ queda). A forma aeróbica desceu ligeiramente.`;
    }
  }
  pillars.push({ key: "vdot", label: "Forma Aeróbica (VDOT)", score: vdotScore, desc: vdotDesc });

  // --- Pilar 5: Viabilidade Tática (só com prova agendada) ---
  if (nextRace && distanceKm != null && expLevel) {
    let tacticScore = 100;
    let tacticDesc = "Preparação alinhada com os objetivos da prova.";

    const weeksToRace = Math.max(0, Math.floor((daysToRace ?? 0) / 7));
    // Só o volume que a app conhece de facto (com histórico); sem ele, null.
    const weeklyVol = knownWeeklyVolume(runs || [], todayISO);

    // effectiveWeeksAvailable (calculado acima, T1) mede o macrociclo pelo
    // que ele teve mesmo — a preparação de um plano em curso desde o início
    // ideal, ou os dias reais de uma prova marcada tarde de mais (revisão
    // de 2026-09-26: um iniciante com maratona a 8 semanas media aqui as 16
    // semanas ideais, e nunca acusava tempo insuficiente).
    const viability = assessRaceViability({
      distanceKm,
      experienceLevel: expLevel,
      weeksToRace: effectiveWeeksAvailable ?? weeksToRace,
      weeklyVolumeKm: weeklyVol,
      racePriority: nextRace.race_priority || "a",
    });

    const prediction = getRacePrediction(nextRace, profile, runs || []);
    const predictedPaceReal = prediction.predictedPaceReal;
    const targetPace = nextRace.target_pace_seconds_per_km;

    if (viability.flags.includes("ultra_para_iniciante")) {
      tacticScore = 0;
      tacticDesc = "Distância (Ultra) desaconselhada para iniciantes.";
    } else if (viability.flags.includes("tempo_insuficiente")) {
      tacticScore = 30;
      tacticDesc = "Tempo de calendário insuficiente para preparar a prova.";
    } else if (viability.flags.includes("volume_insuficiente")) {
      tacticScore = 50;
      tacticDesc = `Volume de treino (${weeklyVol}km/sem) insuficiente para a distância.`;
    } else if (targetPace && predictedPaceReal > 0) {
      // Um ritmo-alvo avaliado contra corridas recentes é um sinal próprio,
      // independente do volume semanal: mantém-se mesmo sem `weeklyVol`.
      const paceDiffPct = (predictedPaceReal - targetPace) / targetPace;
      if (paceDiffPct > 0.10) {
        tacticScore = 40;
        tacticDesc = "Ritmo-alvo demasiado otimista face às corridas recentes.";
      } else if (paceDiffPct > 0.03) {
        tacticScore = 70;
        tacticDesc = "Ritmo-alvo exigente, mas alcançável num bom dia.";
      } else {
        tacticScore = 100;
        tacticDesc = "O ritmo-alvo está alinhado com a tua capacidade aeróbica.";
      }
    } else if (weeklyVol == null) {
      // Sem corridas que digam o volume, e sem ritmo-alvo para avaliar:
      // dizer que "está adequado" (e pontuar 90) era inventar um dado que não há.
      tacticScore = 0;
      tacticDesc = "Ainda não tenho corridas para saber se o volume chega.";
    } else {
      tacticScore = 90;
      tacticDesc = "Volume e calendário de preparação adequados à distância.";
    }

    pillars.push({ key: "tactic", label: "Viabilidade Tática", score: tacticScore, desc: tacticDesc });
  }

  // --- Pilar 6: Como acordaste (só com check-in de hoje) ---
  const checkin = checkinPillar(todayCheckin, { trainingToday, raceTodayOrTomorrow });
  if (checkin) pillars.push(checkin);

  const totalScore = Math.round(pillars.reduce((s, p) => s + p.score, 0) / pillars.length);
  const level = totalScore >= 75 ? "high" : totalScore >= 50 ? "medium" : "low";

  return { score: totalScore, pillars, level };
}
