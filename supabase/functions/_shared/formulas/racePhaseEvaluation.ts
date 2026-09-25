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

// Sempre intensos: sem o esforço registado, um contínuo ou um trail pode ter
// sido fácil; um intervalado ou um fartlek não.
const HARD_TRAINING_TYPES = new Set(["intervalos", "fartlek"]);

/** Sem esforço registado e de um tipo que tanto pode ser fácil como não: a
 *  app não sabe se foi fácil (conta como não fácil na percentagem). */
function isUnknownIntensity(r: RunForPhase): boolean {
  if (isLowIntensity(r) || r.effort_rpe != null) return false;
  return !(r.training_type && HARD_TRAINING_TYPES.has(r.training_type));
}

function isLowIntensity(r: RunForPhase): boolean {
  if (r.training_type && Z1Z2_TRAINING_TYPES.has(r.training_type)) return true;
  return r.effort_rpe != null && Number(r.effort_rpe) <= Z1Z2_MAX_RPE;
}

/* Os resumos de fase aparecem sob o avatar dela, em "Avaliação da Carol"
   (RaceHubView), e o chat recebe-os como o que o atleta leu: falam como ela
   (ação P.12, acabada na revisão pré-deploy de 2026-09-25) — a opinião
   primeiro e o número como prova, sem elogio automático, sem frase de manual
   e sem afirmar o que não se verifica.
   - Uma fase já acabada fala no passado: "Estás no pico de carga" numa fase
     "Concluída" era falso (segunda revisão pré-deploy, 2026-09-25).
   - O texto segue os mesmos números da nota (volume, frequência, fáceis), e o
     "bem feita" só sai com a pílula a 80 ou mais — senão dizia "como deve ser"
     com a pílula em "Ajuste Recomendado". Com a pílula a 80 ou mais, uma
     sessão a menos não é assunto; "poucas sessões" é menos de 3/4 das
     esperadas.
   - "Fáceis" é o que a app consegue classificar (recuperação, longo, ou
     esforço até 4): com o esforço por registar, a corrida não conta. Se é
     isso que deixa a percentagem baixa, pede-se o esforço e não se manda
     abrandar — seria presumir que as corridas foram rápidas (terceira
     revisão, 2026-09-25).
   - Sem adjetivos com género ("curto", "fresco"): a app não sabe a quem fala. */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface CommentaryInput {
  phaseId: PhaseId;
  done: boolean;
  score: number;
  volumeRatio: number;
  frequencyRatio: number;
  totalKm: number;
  expectedPhaseKm: number;
  runsCount: number;
  polarizedPct: number;
  /** Corridas sem esforço registado que tanto podiam ser fáceis como não. */
  unknownCount: number;
}

function buildCommentary(c: CommentaryInput): string {
  const km = Math.round(c.totalKm);
  const alvo = Math.round(c.expectedPhaseKm);
  const corridas = count(c.runsCount, "corrida", "corridas");
  const sessoes = count(c.runsCount, "sessão", "sessões");
  const curto = c.volumeRatio < 0.6;
  const poucasSessoes = c.frequencyRatio < 0.75;
  const bom = c.score >= 80;
  const poucoFacil = c.polarizedPct < POLARIZATION_TARGET_PCT;
  // A percentagem baixa explica-se só pelas corridas sem esforço registado.
  const faltaEsforco = poucoFacil && c.unknownCount > 0 && c.runsCount > 0
    && c.polarizedPct + (c.unknownCount / c.runsCount) * 100 >= POLARIZATION_TARGET_PCT;
  const semEsforco = count(c.unknownCount, "corrida", "corridas");
  const faceis = c.polarizedPct === 0
    ? "nenhuma das tuas corridas desta fase conta como fácil (Z1/Z2)"
    : `só ${c.polarizedPct}% das tuas corridas desta fase contam como fáceis (Z1/Z2)`;
  switch (c.phaseId) {
    case "base":
      if (c.done) {
        if (curto) return `A base ficou com pouco volume: ${km} de ${alvo} km.`;
        if (faltaEsforco) {
          return c.unknownCount === 1
            ? "Na base ficou 1 corrida sem o esforço registado, por isso não sei se foi fácil."
            : `Na base ficaram ${semEsforco} sem o esforço registado, por isso não sei se foram fáceis.`;
        }
        if (poucoFacil) {
          return c.polarizedPct === 0
            ? "Na base, nenhuma das tuas corridas contou como fácil (Z1/Z2), e ela pedia quase todas."
            : `Na base, só ${c.polarizedPct}% das tuas corridas contaram como fáceis (Z1/Z2), e ela pedia quase todas.`;
        }
        if (bom) return `A base foi bem feita: ${corridas}, ${km} de ${alvo} km, quase tudo em ritmo fácil.`;
        if (poucasSessoes) return `A base teve ${km} de ${alvo} km, mas poucas sessões: ${corridas}.`;
        return `A base teve ${corridas} e ${km} de ${alvo} km, quase tudo em ritmo fácil.`;
      }
      if (curto) return `Vais em ${km} de ${alvo} km desta fase. Acrescenta quilómetros fáceis, em Z1/Z2, para lá chegares.`;
      if (faltaEsforco) {
        return `Não sei se as tuas corridas estão a ser fáceis: ${semEsforco} desta fase sem o esforço registado. Regista-o, que a base se faz quase toda em ritmo fácil (Z1/Z2).`;
      }
      if (poucoFacil) {
        const esforco = c.unknownCount > 0 ? ", e regista o esforço das corridas que não o têm" : "";
        return c.polarizedPct === 0
          ? `Nenhuma das tuas corridas desta fase conta como fácil (Z1/Z2), e a base pede quase todas. Faz a maior parte em ritmo fácil, a conversar${esforco}.`
          : `${faceis.charAt(0).toUpperCase()}${faceis.slice(1)}, e a base pede quase todas. Abranda os treinos fáceis${esforco}.`;
      }
      if (bom) return `A base está a ser bem feita: ${corridas}, ${km} de ${alvo} km, quase tudo em ritmo fácil.`;
      if (poucasSessoes) return `Vais em ${km} de ${alvo} km, mas com poucas sessões: ${corridas} nesta fase. A base quer regularidade, três por semana.`;
      return `A base leva ${corridas} e ${km} de ${alvo} km, quase tudo em ritmo fácil.`;
    case "build":
      if (c.done) {
        if (curto) return `A construção ficou com pouco volume: ${km} km.`;
        if (bom) return `A construção correu bem: ${sessoes}, ${km} km.`;
        if (poucasSessoes) return `A construção teve ${km} km em ${sessoes}, menos sessões do que eu queria.`;
        return `A construção teve ${sessoes} e ${km} km.`;
      }
      if (curto) return `Vais em ${km} km nesta fase, pouco para aguentares o ritmo de prova. Reforça o limiar e a rodagem contínua.`;
      if (bom) return `A construção está a correr bem: ${sessoes}, ${km} km. Agora é aguentar o limiar e subir um pouco por semana.`;
      if (poucasSessoes) return `Vais em ${km} km, mas com poucas sessões: ${sessoes} nesta fase. É a regularidade que te leva ao ritmo de prova.`;
      return `A construção leva ${sessoes} e ${km} km. Agora é aguentar o limiar e subir um pouco por semana.`;
    case "peak":
      if (c.done) return curto ? `O pico ficou com pouco volume: ${km} de ${alvo} km.` : `O pico teve ${km} km.`;
      return curto
        ? `Estás no pico com pouco volume: ${km} de ${alvo} km. É nos longos daqui que o ritmo de prova se ensaia; não os saltes.`
        : `Estás no pico de carga: ${km} km nesta fase. É nos longos daqui que o ritmo de prova se ensaia.`;
    case "taper":
      return c.done
        ? `O polimento acabou com ${km} km.`
        : `Estás no polimento: o volume desce para chegares à prova com as pernas frescas, e umas acelerações curtas mantêm o ritmo.`;
    default:
      return `${corridas} ${c.runsCount === 1 ? "registada" : "registadas"} nesta fase.`;
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
      summary: "Esta fase ainda não começou. Avalio-a quando lá chegares.",
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
      summary: "Esta fase ficou antes de começares a preparação: a prova entrou com menos tempo do que o ciclo completo pede. Não conta contra ti.",
      metrics: { totalKm: 0, runsCount: 0, polarizedZ1Z2Pct: null, avgPace: null },
    };
  }

  const phaseRuns = (runs || []).filter((r) => r.date && r.date >= startDateStr && r.date <= endDateStr);

  const totalKm = phaseRuns.reduce((sum, r) => sum + (parseFloat(String(r.distance_km)) || 0), 0);
  const runsCount = phaseRuns.length;

  let z1z2Count = 0;
  let unknownCount = 0;
  let totalSeconds = 0;
  let totalPacedKm = 0;
  for (const r of phaseRuns) {
    if (isLowIntensity(r)) z1z2Count++;
    else if (isUnknownIntensity(r)) unknownCount++;
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
      summary: "Não tenho nenhuma corrida tua registada nesta fase. Regista pelo menos 3 por semana, para eu ver como te estás a adaptar.",
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
    summary: buildCommentary({
      phaseId, done: phaseState === "completed", score, volumeRatio, frequencyRatio,
      totalKm, expectedPhaseKm, runsCount, polarizedPct, unknownCount,
    }),
    metrics: {
      totalKm: Math.round(totalKm * 10) / 10,
      runsCount,
      polarizedZ1Z2Pct: polarizedPct,
      avgPace: avgPaceSec ? formatPaceMinKm(avgPaceSec) : null,
    },
  };
}
