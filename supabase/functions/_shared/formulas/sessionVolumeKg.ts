// Volume-carga (kg) de uma sessão de ginásio: Σ peso × repetições de todas
// as séries.
//
// @contexto Migrado de src/utils/biEngine.js sessionVolumeKg
// (specs/formulas-checklist.md Fase E). `workout_session_sets` é o campo
// real gravado pelo registo (GymRegistration.jsx); `volume_kg` existe como
// coluna no esquema (migração 20260815155000_gym_advanced_metrics.sql) mas
// nenhum caminho de gravação alguma vez lá escreveu — fica sempre NULL. Por
// isso o cálculo é sempre feito a partir das séries reais; `volume_kg` fica
// só como atalho, caso algum dia passe a ser escrito.

export interface WorkoutSet {
  reps: number | null;
  weight: number | null;
}

export interface SessionForVolume {
  volume_kg?: number | null;
  workout_session_sets?: WorkoutSet[] | null;
}

export function computeSessionVolumeKg(session: SessionForVolume | null | undefined): number {
  if (typeof session?.volume_kg === "number" && session.volume_kg > 0) return session.volume_kg;
  return (session?.workout_session_sets || []).reduce(
    (sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0),
    0,
  );
}
