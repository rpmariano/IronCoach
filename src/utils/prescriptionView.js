/* Os exercícios de um treino de ginásio do plano, prontos a mostrar.
   Lê coach_plan_items.prescription = { blocks: [...] } (a forma que o coach-chat grava,
   supabase/functions/_shared/formulas/planPrescription.ts): força { type:'forca', name,
   sets, reps, goal }, cardio { type:'cardio', name, duration_min, distance_km, laps, goal }.
   Lê o que está gravado sem confiar na forma: um bloco sem nome cai; um alvo em falta
   (sem reps, em cardio sem tempo) deixa o alvo vazio e o exercício fica na mesma. */

// Defesa extra: os mesmos tetos do servidor (planPrescription.ts: 10 séries, 50 reps; cardio até 300 min,
// 100 km, 500 voltas) com folga; um valor fora disto não é um alvo, é lixo — fica de fora.
const MAX = { sets: 20, reps: 100, duration_min: 600, distance_km: 200, laps: 1000 };
const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : null);
const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** O alvo de um bloco: "3×12", "20 min", "2 km · 4 voltas"; '' sem alvo nenhum. */
export function blockTarget(b) {
  const sets = num(b?.sets, MAX.sets);
  const reps = num(b?.reps, MAX.reps);
  if (sets && reps) return `${fmt(sets)}×${fmt(reps)}`;
  const parts = [];
  if (num(b?.duration_min, MAX.duration_min)) parts.push(`${fmt(b.duration_min)} min`);
  if (num(b?.distance_km, MAX.distance_km)) parts.push(`${fmt(b.distance_km)} km`);
  if (num(b?.laps, MAX.laps)) parts.push(`${fmt(b.laps)} ${b.laps === 1 ? 'volta' : 'voltas'}`);
  if (parts.length) return parts.join(' · ');
  if (sets) return `${fmt(sets)} ${sets === 1 ? 'série' : 'séries'}`;
  if (reps) return `${fmt(reps)} reps`;
  return '';
}

/** [{ name, target, goal }] por ordem; [] sem prescrição. */
export function prescriptionExercises(prescription) {
  const blocks = Array.isArray(prescription?.blocks) ? prescription.blocks : [];
  return blocks
    .filter((b) => b && typeof b.name === 'string' && b.name.trim())
    .map((b) => ({
      name: b.name.trim(),
      target: blockTarget(b),
      goal: typeof b.goal === 'string' && b.goal.trim() ? b.goal.trim() : '',
    }));
}

/** "3 exercícios: Cadeira extensora, Leg press, Gémeos" (até `max` nomes, depois «e mais N»).
 *  null sem exercícios. */
export function exercisesSummary(exercises, max = 3) {
  if (!exercises?.length) return null;
  const n = exercises.length;
  const nomes = exercises.slice(0, max).map((e) => e.name).join(', ');
  const resto = n > max ? ` e mais ${n - max}` : '';
  return `${n} ${n === 1 ? 'exercício' : 'exercícios'}: ${nomes}${resto}`;
}
