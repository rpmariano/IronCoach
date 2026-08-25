// Distribuição polarizada 80/20 (Seiler) — quanto do tempo de corrida foi em
// baixa intensidade (zonas 1-2) vs alta intensidade (zonas 3-5), contra o
// alvo por nível de experiência.
//
// @doutrina src/coach-knowledge — regra 80/20 de Seiler, alvo variável por
// nível (iniciante mais conservador, avançado tolera mais intensidade).
// @contexto Migrado de src/utils/biEngine.js calculateTrainingDistribution
// (specs/formulas-checklist.md Fase E). Era P0-8 na auditoria original: o
// `RunDashboard.jsx` chamava esta função sem o 2º argumento (nível), caindo
// sempre no alvo 'medio' (80%) mesmo para atletas iniciantes (alvo 95%) —
// corrigido ao migrar, já que agora há um único sítio a decidir o alvo.

export type ExperienceLevelKey = "iniciante" | "basico" | "medio" | "avancado";

// Mesma tabela de src/utils/biConstants.js TARGET_LOW_INTENSITY_PCT — vive
// aqui porque é parte inseparável do cálculo (o "alvo" não faz sentido sem
// a distribuição), não uma constante de vocabulário genérica.
export const TARGET_LOW_INTENSITY_PCT: Record<ExperienceLevelKey, number> = {
  iniciante: 95,
  basico: 87.5,
  medio: 80,
  avancado: 77.5,
};

const DEFAULT_TARGET_LOW_PCT = 80;
// Tolerância à volta do alvo dentro da qual se considera "conforme" — mesma
// banda de ±5 pontos percentuais do biEngine.js original.
const COMPLIANCE_TOLERANCE_PCT = 5;

export interface HrZoneMinutes {
  zone: number;
  minutes: number;
}

export interface RunWithHrZones {
  details?: { hr_zones?: HrZoneMinutes[] | null } | null;
}

export interface TrainingDistribution {
  lowIntensityPct: number;
  highIntensityPct: number;
  z1Minutes: number;
  z2Minutes: number;
  z3Minutes: number;
  z4Minutes: number;
  z5Minutes: number;
  isCompliant: boolean;
  targetLowPct: number;
}

export function computeTrainingDistribution(
  runs: RunWithHrZones[],
  level: string | null = "medio",
): TrainingDistribution {
  let z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0;

  for (const run of runs) {
    const zones = run.details?.hr_zones || [];
    for (const z of zones) {
      if (z.zone === 1) z1 += z.minutes;
      else if (z.zone === 2) z2 += z.minutes;
      else if (z.zone === 3) z3 += z.minutes;
      else if (z.zone === 4) z4 += z.minutes;
      else if (z.zone === 5) z5 += z.minutes;
    }
  }

  const lowIntensity = z1 + z2;
  const highIntensity = z3 + z4 + z5;
  const total = lowIntensity + highIntensity;

  const lowIntensityPct = total > 0 ? Math.round((lowIntensity / total) * 100) : 0;
  const highIntensityPct = total > 0 ? Math.round((highIntensity / total) * 100) : 0;
  const targetLowPct = (level && TARGET_LOW_INTENSITY_PCT[level as ExperienceLevelKey]) || DEFAULT_TARGET_LOW_PCT;
  const isCompliant =
    lowIntensityPct >= targetLowPct - COMPLIANCE_TOLERANCE_PCT &&
    lowIntensityPct <= targetLowPct + COMPLIANCE_TOLERANCE_PCT;

  return {
    lowIntensityPct,
    highIntensityPct,
    z1Minutes: z1,
    z2Minutes: z2,
    z3Minutes: z3,
    z4Minutes: z4,
    z5Minutes: z5,
    isCompliant,
    targetLowPct,
  };
}
