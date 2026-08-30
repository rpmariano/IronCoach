// Avaliação de desempenho por fase do macrociclo — nota (0-100), estrelas,
// rótulo, cor e comentário, a partir das corridas registadas na janela da
// fase.
//
// @contexto Migrado de `evaluatePhasePerformance` em
// src/utils/racePlanEngine.js (specs/formulas-checklist.md Fase F). No
// original era uma closure dentro de `calculateRaceTrainingPlan`, a capturar
// `runs`/`distanceKm`/`experienceLevel`/`viability` do escopo exterior — o
// que a tornava impossível de partilhar. Aqui essas quatro passam a ser
// parâmetros explícitos; o resto do cálculo é idêntico.
//
// BUG CORRIGIDO ao migrar (2026-08-26, confirmado com o utilizador — MUDA
// as notas/estrelas mostradas no RaceHubView, para cima): a classificação
// Z1/Z2 procurava `training_type === 'regenerativo'` e `'facil'`, dois
// valores que NÃO existem no vocabulário real da app (confirmado contra a
// base de dados: os valores gravados são `continuo`, `longo`, `recuperacao`,
// `intervalos`, `fartlek`, `trail`), e lia `r.rpe`, quando a coluna é
// `effort_rpe`. Resultado: as corridas de RECUPERAÇÃO — o treino mais Z1
// que existe — eram contadas como alta intensidade, e o fallback por RPE
// baixo nunca disparava. Só `longo` alguma vez contou como Z1/Z2.
// Corrigido para `recuperacao` + `longo` + fallback `effort_rpe <= 4`.
// `'facil'` foi removido por não ter equivalente no vocabulário real, e
// `continuo` NÃO foi acrescentado: um treino contínuo pode ser Z2 ou Z3, e
// classificá-lo por omissão seria mudar a doutrina em vez de corrigir o
// bug — o fallback por RPE já apanha os contínuos feitos em esforço fácil.

import { categorizeDistance, MIN_VOLUME_KM } from "./vocabulary.ts";
import { formatPaceMinKm } from "./paceFormat.ts";

export type PhaseId = "base" | "build" | "peak" | "taper" | string;
export type PhaseState = "upcoming" | "active" | "completed" | "skipped";

export interface RunForPhase {
  date: string;
  distance_km?: number | string | null;
  duration_seconds?: number | null;
  training_type?: string | null;
  effort_rpe?: number | null;
}

export interface PhaseMetrics {
  totalKm: number;
  runsCount: number;
  polarizedZ1Z2Pct: number | null;
  avgPace: string | null;
}

export interface PhaseEvaluation {
  score: number | null;
  stars: number;
  gradeLabel: string;
  statusColor: string;
  summary: string;
  metrics: PhaseMetrics;
}

export interface PhaseEvaluationInput {
  phaseId: PhaseId;
  startDateStr: string;
  endDateStr: string;
  phaseState: PhaseState;
  phaseWeeks: number;
  runs: RunForPhase[];
  distanceKm: number;
  experienceLevel: string;
  viabilityFlags: string[];
}

// Tipos de treino que contam como baixa intensidade (Z1/Z2) — ver o
// comentário de topo sobre os valores que aqui estavam antes e não existiam.
const Z1Z2_TRAINING_TYPES = new Set(["recuperacao", "longo"]);
// Abaixo deste RPE, a corrida conta como Z1/Z2 independentemente do tipo.
const Z1Z2_MAX_RPE = 4;
// Alvo de polarização acima do qual não há penalização (Seiler 80/20).
const POLARIZATION_TARGET_PCT = 75;
// Sessões/semana esperadas para a fase ser considerada consistente.
const EXPECTED_RUNS_PER_WEEK = 3;
// Volume semanal por omissão quando a tabela de doutrina não cobre o caso.
const FALLBACK_TARGET_WEEKLY_KM = 20;

function isLowIntensity(r: RunForPhase): boolean {
  if (r.training_type && Z1Z2_TRAINING_TYPES.has(r.training_type)) return true;
  return r.effort_rpe != null && Number(r.effort_rpe) <= Z1Z2_MAX_RPE;
}

function buildCommentary(
  phaseId: PhaseId,
  volumeRatio: number,
  totalKm: number,
  expectedPhaseKm: number,
  runsCount: number,
  polarizedPct: number,
): string {
  switch (phaseId) {
    case "base":
      return volumeRatio < 0.6
        ? `Volume realizado (${Math.round(totalKm)} km) abaixo do alvo da fase (${Math.round(expectedPhaseKm)} km). Prioriza aumentar a quilometragem fácil em Z1/Z2.`
        : `Base aeróbica com ${runsCount} corridas (${Math.round(totalKm)} km de ${Math.round(expectedPhaseKm)} km alvo). ${polarizedPct >= POLARIZATION_TARGET_PCT ? "Excelente disciplina nas zonas de baixa intensidade (Z1/Z2)." : "Atenção: reduz o ritmo nos treinos fáceis para proteger a base aeróbica."}`;
    case "build":
      return volumeRatio < 0.6
        ? `Volume de construção (${Math.round(totalKm)} km) abaixo do previsto para suportar o ritmo de prova. Reforça treinos de limiar e rodagem contínua.`
        : `Fase de construção em bom ritmo (${runsCount} sessões, ${Math.round(totalKm)} km). Foco na tolerância ao limiar e manutenção da progressão semanal.`;
    case "peak":
      return `Pico de carga com simulação de ritmo de prova (${Math.round(totalKm)} km). Volume específico atingido com treinos longos chave concluídos.`;
    case "taper":
      return `Polimento pré-prova. Redução controlada de volume para recarga total de glicogénio sem perda de sensações de ritmo.`;
    default:
      return `Execução consistente e registo regular de esforço.`;
  }
}

export function computePhaseEvaluation(input: PhaseEvaluationInput): PhaseEvaluation {
  const { phaseId, startDateStr, endDateStr, phaseState, phaseWeeks, runs, distanceKm, experienceLevel, viabilityFlags } = input;

  if (phaseState === "upcoming") {
    return {
      score: null,
      stars: 0,
      gradeLabel: "Planeada",
      statusColor: "slate",
      summary: "Aguardar início da fase para cálculo de métricas em tempo real.",
      metrics: { totalKm: 0, runsCount: 0, polarizedZ1Z2Pct: null, avgPace: null },
    };
  }

  // Janela teórica anterior ao início real da preparação (macrociclo
  // comprimido — ver `resolvePhaseState` em racePhases.ts). Sem nota nem
  // pontuação: não houve tempo de a cumprir, não é "sem registos" por falta
  // de disciplina do atleta.
  if (phaseState === "skipped") {
    return {
      score: null,
      stars: 0,
      gradeLabel: "Não Realizada",
      statusColor: "slate",
      summary: "Fase anterior ao início real da preparação — a prova foi registada tarde demais para cumprir todo o macrociclo recomendado.",
      metrics: { totalKm: 0, runsCount: 0, polarizedZ1Z2Pct: null, avgPace: null },
    };
  }

  const phaseRuns = (runs || []).filter((r) => r.date && r.date >= startDateStr && r.date <= endDateStr);

  const totalKm = phaseRuns.reduce((sum, r) => sum + (parseFloat(String(r.distance_km)) || 0), 0);
  const runsCount = phaseRuns.length;

  let z1z2Count = 0;
  let totalSeconds = 0;
  let totalPacedKm = 0;
  for (const r of phaseRuns) {
    if (isLowIntensity(r)) z1z2Count++;
    if (r.duration_seconds && r.distance_km) {
      totalSeconds += Number(r.duration_seconds);
      totalPacedKm += Number(r.distance_km);
    }
  }

  const polarizedPct = runsCount > 0 ? Math.round((z1z2Count / runsCount) * 100) : 0;
  const avgPaceSec = totalPacedKm > 0 ? Math.round(totalSeconds / totalPacedKm) : null;

  const distCategory = categorizeDistance(distanceKm) || "10k";
  const targetWeeklyKm = MIN_VOLUME_KM[experienceLevel]?.[distCategory] || FALLBACK_TARGET_WEEKLY_KM;
  const expectedPhaseKm = targetWeeklyKm * Math.max(1, phaseWeeks);
  const volumeRatio = Math.min(1.0, totalKm / expectedPhaseKm);

  if (runsCount === 0) {
    return {
      score: 40,
      stars: 1,
      gradeLabel: "Sem Registos",
      statusColor: "rose",
      // "Mantém a consistência" presumia uma consistência que não existe
      // ainda — sem uma corrida registada, não há nada a manter. Ver bug
      // relatado 2026-08-30.
      summary: "Sem treinos registados nesta fase. Começa a registar pelo menos 3 sessões semanais para a Carol poder avaliar a tua adaptação.",
      metrics: { totalKm: 0, runsCount: 0, polarizedZ1Z2Pct: 0, avgPace: null },
    };
  }

  // Pontuação proporcional: volume 50%, polarização 30%, consistência 20%.
  const expectedRunsCount = Math.max(1, phaseWeeks * EXPECTED_RUNS_PER_WEEK);
  const frequencyRatio = Math.min(1.0, runsCount / expectedRunsCount);
  const polFactor = polarizedPct >= POLARIZATION_TARGET_PCT ? 1.0 : Math.max(0.4, polarizedPct / POLARIZATION_TARGET_PCT);

  let rawScore = volumeRatio * 50 + polFactor * 30 + frequencyRatio * 20;

  // Ajuste de realismo: um ciclo comprimido reflete-se em cada fase.
  if (viabilityFlags.includes("tempo_insuficiente")) rawScore = rawScore * 0.85;
  if (viabilityFlags.includes("volume_insuficiente") && volumeRatio < 0.7) rawScore = rawScore * 0.9;

  const score = Math.min(98, Math.max(35, Math.round(rawScore)));

  // O original inicializava gradeLabel a 'Abaixo do Alvo', mas todos os
  // ramos o sobrescreviam — esse rótulo nunca chegava a ser devolvido.
  let stars: number;
  let gradeLabel: string;
  let statusColor: string;
  if (score >= 90) {
    stars = 5; gradeLabel = "Excelente"; statusColor = "emerald";
  } else if (score >= 80) {
    stars = 4; gradeLabel = "Muito Bom"; statusColor = "emerald";
  } else if (score >= 68) {
    stars = 3; gradeLabel = "Sólido"; statusColor = "amber";
  } else {
    stars = 2; gradeLabel = "Ajuste Recomendado"; statusColor = "rose";
  }

  return {
    score,
    stars,
    gradeLabel,
    statusColor,
    summary: buildCommentary(phaseId, volumeRatio, totalKm, expectedPhaseKm, runsCount, polarizedPct),
    metrics: {
      totalKm: Math.round(totalKm * 10) / 10,
      runsCount,
      polarizedZ1Z2Pct: polarizedPct,
      avgPace: avgPaceSec ? formatPaceMinKm(avgPaceSec) : null,
    },
  };
}
