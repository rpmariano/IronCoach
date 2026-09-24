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
import { getRecommendedPrepWeeks, resolveExperienceLevel, getRacePrediction, type RaceForPlanning, type ProfileForPlanning } from "./racePlanning.ts";
import type { RaceRun } from "./racePrediction.ts";
import { PAIN_ALARM_THRESHOLD } from "./checkinAlarms.ts";

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
}

/** O check-in de HOJE (daily_checkins): sono/energia/stress 1-5, dor 0-10. */
export interface CheckinForReadiness {
  sleep?: number | null;
  energy?: number | null;
  stress?: number | null;
  pain?: number | null;
}

// Uma escala 1-5 em 0-100 (1 → 0, 5 → 100). No stress, 1 é "calmo": inverte-se.
const scale5 = (v: number) => (v - 1) * 25;

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
 */
export function checkinPillar(c: CheckinForReadiness | null | undefined): ReadinessPillar | null {
  const sleep = Number(c?.sleep), energy = Number(c?.energy), stress = Number(c?.stress);
  if (![sleep, energy, stress].every((v) => v >= 1 && v <= 5)) return null;
  const base = (scale5(sleep) + scale5(energy) + scale5(6 - stress)) / 3;
  const pain = Math.max(0, Number(c?.pain) || 0);
  const painAlarm = pain >= PAIN_ALARM_THRESHOLD;
  const score = Math.round(painAlarm ? Math.min(base, 20) : Math.max(0, base - pain * 5));
  const emBaixo = sleep <= 2 || energy <= 2;

  let desc: string;
  if (painAlarm) desc = `Dor de ${pain}/10: hoje nada de impacto. Fala comigo no chat.`;
  else if (emBaixo) desc = sleep <= 2 ? "Dormiste mal. Hoje o treino é mais leve." : "Estás sem energia. Hoje o treino é mais leve.";
  else if (score >= 75) desc = "Acordaste bem: sono, energia e cabeça a favor do treino de hoje.";
  else if (score >= 50) desc = "Dia normal. Treina, mas atento a como te sentes.";
  else desc = "Hoje estás em baixo. Um treino mais leve rende mais.";
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
): ReadinessIndex {
  const pillars: ReadinessPillar[] = [];

  // --- Pilar 1: ACWR ---
  // Só com histórico (corridas em 3 das 4 semanas, runAcwr.ts). Sem ele o
  // pilar não entra — como o tático sem prova e o do check-in sem check-in —
  // em vez de dizer "Carga de risco (2,00)" a quem só registou duas corridas
  // (pedido 2026-09-24: "se a app não tem dados, não apresenta dados").
  const acwr = computeRunAcwr(runs || [], todayISO);
  const acwrRatio = acwr.ratio || 0;
  if (acwr.hasEnoughData) {
    let acwrScore = 60;
    let acwrDesc = `Carga baixa (${acwrRatio.toFixed(2)}). Podes aumentar gradualmente.`;
    if (acwrRatio >= 0.8 && acwrRatio <= 1.3) {
      acwrScore = 100;
      acwrDesc = `Carga ideal (${acwrRatio.toFixed(2)}). Estás no sweet-spot de adaptação.`;
    } else if (acwrRatio > 1.3 && acwrRatio <= 1.5) {
      acwrScore = 50;
      acwrDesc = `Carga elevada (${acwrRatio.toFixed(2)}). Zona de atenção — reduz um pouco.`;
    } else if (acwrRatio > 1.5) {
      acwrScore = 0;
      acwrDesc = `Carga de risco (${acwrRatio.toFixed(2)}). Risco de lesão aumentado.`;
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
  if (nextRace) {
    let tacticScore = 100;
    let tacticDesc = "Preparação alinhada com os objetivos da prova.";

    const distanceKm = parseFloat((nextRace.distance_km ?? "10").toString().replace(",", ".")) || 10;
    const daysToRace = daysBetweenISO(nextRace.date, todayISO);
    const weeksToRace = Math.max(0, Math.floor(daysToRace / 7));
    // Só o volume que a app conhece de facto (com histórico); sem ele, null.
    const weeklyVol = knownWeeklyVolume(runs || [], todayISO);
    const expLevel = resolveExperienceLevel(nextRace, profile);

    // Se o plano já começou, a viabilidade de "tempo insuficiente" avalia o
    // macrociclo todo, não só o tempo que falta (ver comentário completo no
    // original — senão dispara sempre na reta final).
    const totalWeeks = getRecommendedPrepWeeks(distanceKm, expLevel);
    const planStartISO = addDaysISO(nextRace.date, -totalWeeks * 7);
    const inProgress = planStartISO <= todayISO;
    const prepWeeksForViability = inProgress ? totalWeeks : weeksToRace;

    const viability = assessRaceViability({
      distanceKm,
      experienceLevel: expLevel,
      weeksToRace: prepWeeksForViability,
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
    } else {
      tacticScore = 90;
      tacticDesc = "Volume e calendário de preparação adequados à distância.";
    }

    pillars.push({ key: "tactic", label: "Viabilidade Tática", score: tacticScore, desc: tacticDesc });
  }

  // --- Pilar 6: Como acordaste (só com check-in de hoje) ---
  const checkin = checkinPillar(todayCheckin);
  if (checkin) pillars.push(checkin);

  const totalScore = Math.round(pillars.reduce((s, p) => s + p.score, 0) / pillars.length);
  const level = totalScore >= 75 ? "high" : totalScore >= 50 ? "medium" : "low";

  return { score: totalScore, pillars, level };
}
