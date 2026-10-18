/* Conversões do registo de ginásio: duração escrita ↔ segundos e exercícios →
   linhas de workout_session_sets. Extraído de Gym/GymRegistration.jsx
   (registo unificado, F1-pré) sem mudar o comportamento. */

export function parseDurationInput(val) {
  val = val.trim().toLowerCase();
  if (!val) return null;
  if (val.endsWith('m')) return parseInt(val) * 60;
  const parts = val.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (!isNaN(parts[0])) return parts[0] * 60;
  return null;
}

// Inverso de parseDurationInput, para pré-preencher o campo de texto ao
// editar uma sessão já gravada (duration_seconds vem sempre em segundos).
export function formatDurationInput(totalSeconds) {
  if (!totalSeconds) return '';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Achata exercícios→séries em linhas prontas para workout_session_sets,
// espelhando flattenSets em supabase/functions/analyze-gym/index.ts — mesmas
// colunas (session_id, exercise_name, set_index, reps, weight).
export function flattenExercises(exercises) {
  const rows = [];
  for (const ex of exercises) {
    const name = ex.name.trim();
    if (!name) continue;
    ex.sets.forEach((s, i) => {
      const reps = s.reps === '' || s.reps === null || s.reps === undefined ? null : parseInt(s.reps);
      const weight = s.weight === '' || s.weight === null || s.weight === undefined ? null : parseFloat(s.weight);
      if (reps === null && weight === null) return;
      rows.push({ exercise_name: name, set_index: i, reps, weight });
    });
  }
  return rows;
}
