import { describePrescription } from '@formulas/planPrescription.ts';
import { cardioSpecFor } from '@formulas/cardioFields.ts';
import { foodKey } from '@formulas/foodKey.ts';
import { newExercise, newSet } from './gymSets';

/* O registo a partir do plano da Carol (registo unificado, F3 —
   specs/plano-registo-plano-coach.md §3). Funções puras: o banner "Do plano"
   e o "Usar o plano" do ginásio vivem em cima delas. */

/** Os treinos pendentes de um tipo para um dia, nos planos aceites: 0 → o
 *  registo não mostra nada; 1 → já escolhido; vários → o atleta escolhe. */
export function findPendingPlanItems(kind, dateIso, coachPlans, coachPlanItems) {
  const accepted = new Set((coachPlans || []).filter(p => p?.status === 'aceite').map(p => p.id));
  return (coachPlanItems || [])
    .filter(i => accepted.has(i.plan_id) && i.status === 'pendente' && i.kind === kind && i.planned_date === dateIso)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));
}

/** Uma linha para o atleta reconhecer o treino: grupos, duração e exercícios. */
export function describePlanItem(item) {
  const head = [
    item?.categories?.length ? item.categories.join(' / ') : null,
    item?.target_duration_min ? `${item.target_duration_min} min` : null,
  ].filter(Boolean).join(' · ');
  const body = describePrescription(item?.prescription);
  return [head || 'Treino de ginásio', body].filter(Boolean).join(' — ');
}

const asString = (n) => (n === null || n === undefined ? '' : String(n));

/** "Usar o plano": os exercícios da prescrição como o formulário os mostra.
 *  Os alvos entram como SUGESTÃO (`plan` em cada série), nunca como valores:
 *  uma série só conta quando o atleta a confirma (✓) ou escreve — senão,
 *  quem fizesse 2 de 3 séries gravava 3×12 (revisão pré-deploy de
 *  2026-10-18). Força: as reps alvo; o kg é o da última vez, lido do Armário
 *  na hora (setSuggestion) — a Carol não prescreve kg (decisão 5). Cardio:
 *  os campos do exercício com os alvos. O objetivo vem preenchido. */
export function exercisesFromPrescription(prescription) {
  const blocks = Array.isArray(prescription?.blocks) ? prescription.blocks : [];
  return blocks.map((b, index) => {
    const name = String(b?.name || '').trim();
    if (!name) return null;
    const goal = typeof b.goal === 'string' ? b.goal : '';
    if (b.type === 'cardio') {
      const spec = cardioSpecFor(name);
      const metres = spec?.distanceUnit === 'm';
      const fields = Array.isArray(b.fields) && b.fields.length ? b.fields : (spec?.fields || ['duration']);
      return newExercise({
        name, type: 'cardio', goal, fields, planBlockIndex: index, distanceUnit: metres ? 'm' : null,
        sets: [newSet({ plan: {
          durationMin: asString(b.duration_min),
          distance: b.distance_km ? String(metres ? Math.round(b.distance_km * 1000) : b.distance_km) : '',
          laps: asString(b.laps),
        } })],
      });
    }
    const n = Math.min(Math.max(parseInt(b.sets) || 1, 1), 10);
    return newExercise({
      name, type: 'forca', goal, planBlockIndex: index,
      sets: Array.from({ length: n }, () => newSet({ plan: { reps: asString(b.reps), weight: '' } })),
    });
  }).filter(Boolean);
}

const isBlankSet = (s) => ['reps', 'weight', 'durationMin', 'distance', 'laps'].every(k => s[k] === '' || s[k] == null);

/** Junta exercícios ao formulário sem repetir nomes nem deixar linhas em
 *  branco que o atleta tinha aberto. */
export function appendExercises(existing, incoming) {
  const kept = existing.filter(e => (e.name || '').trim() || e.sets.some(s => !isBlankSet(s)));
  const have = new Set(kept.map(e => foodKey(e.name)));
  return [...kept, ...incoming.filter(e => !have.has(foodKey(e.name)))];
}
