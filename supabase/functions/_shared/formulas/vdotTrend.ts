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
import { runsOnly } from "./runKinds.ts";
import { categorizeElevationRatio } from "./vocabulary.ts";

export interface RunForVdot {
  date: string;
  distance_km: number | null;
  duration_seconds: number | null;
  kind?: string | null;
  training_type?: string | null;
  effort_rpe?: number | null;
  name?: string | null;
  /** O D+ e a disciplina da prova (runs.details) — para o trail e as corridas
   *  com desnível ficarem de fora (2026-11-01). */
  details?: { elevation_gain_m?: number | string | null; race_type?: string | null } | null;
}

export interface VdotPoint {
  date: string;
  vdot: number;
  label: string;
}

const MIN_TIME_TRIAL_KM = 3;
const MIN_QUALIFYING_RPE = 7;

/** Treinos cujo ritmo é do terreno, não da forma: o trail, o técnico (trilho)
 *  e as subidas. */
export const VDOT_TERRAIN_TRAINING_TYPES: ReadonlySet<string> = new Set(["trail", "tecnico", "subidas"]);

/**
 * O ritmo desta corrida é do terreno (2026-11-01, o «VDOT 28,0» do Rui: o
 * trail de 1-11, 15,92 km em 1:51 a RPE 9 com 499 m D+, entrou como treino de
 * qualidade pelo RPE e o desnível derrubou o VDOT de ~43 para 28). Fica de
 * fora o trail (tipo de treino ou disciplina da prova), o técnico, as
 * subidas e qualquer corrida que não seja «rolante» na banda de terreno da
 * doutrina (vocabulary.ts, categorizeElevationRatio: 25 m de D+ por km ou
 * mais). Sem D+ registado, decide só o tipo.
 *
 * Exclui-se em vez de ajustar o ritmo ao desnível (GAP): o GAP precisa da
 * inclinação troço a troço, subidas e descidas, e o que se grava é o D+ total
 * (por volta só desde o #101, sem descidas); e num trail o piso técnico
 * abranda tanto quanto o declive — um GAP só com o D+ continuava a errar.
 */
export function isTerrainPacedRun(r: RunForVdot): boolean {
  if (r.training_type && VDOT_TERRAIN_TRAINING_TYPES.has(r.training_type)) return true;
  if (r.details?.race_type === "trail") return true;
  const gain = r.details?.elevation_gain_m;
  const band = categorizeElevationRatio(r.distance_km, gain == null || gain === "" ? null : Number(gain));
  return band != null && band !== "rolante";
}

function qualifiesAsTimeTrial(r: RunForVdot): boolean {
  if (!(Number(r.distance_km) >= MIN_TIME_TRIAL_KM)) return false;
  if (!(Number(r.duration_seconds) > 0)) return false;
  if (isTerrainPacedRun(r)) return false;
  return (
    r.kind === "competicao" ||
    r.training_type === "tempo" ||
    r.training_type === "intervalos" ||
    Number(r.effort_rpe) >= MIN_QUALIFYING_RPE
  );
}

export function computeVdotTrend(runs: RunForVdot[]): VdotPoint[] {
  // Caminhadas fora (runKinds.ts, 2026-10-05): uma caminhada a RPE 7 num
  // pós-operatório não diz nada sobre a forma aeróbica de corrida.
  return runsOnly(runs)
    .filter(qualifiesAsTimeTrial)
    .map((r) => ({
      date: r.date,
      vdot: calculateVDOT(Number(r.distance_km), Number(r.duration_seconds)),
      label: r.name || r.kind || "",
    }))
    .filter((p) => p.vdot > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}
