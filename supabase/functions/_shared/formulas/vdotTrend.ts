// Tendência de VDOT (Daniels & Gilbert) ao longo do tempo — só a partir de
// corridas que qualificam como "time trial": competição, treinos de
// qualidade (tempo/intervalos), ou qualquer corrida percebida como forte
// (RPE ≥ 7) com pelo menos 3 km — uma rodagem lenta não estima forma aeróbica.
//
// @contexto Migrado de src/utils/biEngine.js getVDOTTrend
// (specs/formulas-checklist.md Fase E). A fórmula em si (calculateVDOT) já
// vive em racePrediction.ts desde a Fase C; este módulo só isola o critério
// de seleção — igual nos dois consumidores, para "está a subir/descer" dar
// sempre a mesma resposta ao atleta e à Carol.

import { calculateVDOT } from "./racePrediction.ts";

export interface RunForVdot {
  date: string;
  distance_km: number | null;
  duration_seconds: number | null;
  kind?: string | null;
  training_type?: string | null;
  effort_rpe?: number | null;
  name?: string | null;
}

export interface VdotPoint {
  date: string;
  vdot: number;
  label: string;
}

const MIN_TIME_TRIAL_KM = 3;
const MIN_QUALIFYING_RPE = 7;

function qualifiesAsTimeTrial(r: RunForVdot): boolean {
  if (!(Number(r.distance_km) >= MIN_TIME_TRIAL_KM)) return false;
  if (!(Number(r.duration_seconds) > 0)) return false;
  return (
    r.kind === "competicao" ||
    r.training_type === "tempo" ||
    r.training_type === "intervalos" ||
    Number(r.effort_rpe) >= MIN_QUALIFYING_RPE
  );
}

export function computeVdotTrend(runs: RunForVdot[]): VdotPoint[] {
  return runs
    .filter(qualifiesAsTimeTrial)
    .map((r) => ({
      date: r.date,
      vdot: calculateVDOT(Number(r.distance_km), Number(r.duration_seconds)),
      label: r.name || r.kind || "",
    }))
    .filter((p) => p.vdot > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}
