import { describePrescription } from '@formulas/planPrescription.ts';
import { cardioSpecFor } from '@formulas/cardioFields.ts';
import { foodKey } from '@formulas/foodKey.ts';
import { newExercise, newSet } from './gymSets';
import { mealsForDay } from './homeModels';

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

/** As refeições que a Carol sugeriu para um dia, nos planos aceites (a nota da
 *  Refeição, specs/plano-registo-plano-coach.md §1): só as que ainda não foram
 *  registadas nesse dia. Com a do tipo escolhido, só essa; sem ela, as outras,
 *  para ele escolher. [{ id, tipo, label, texto }] */
export function mealSuggestionsFor(dateIso, coachPlans, coachPlanItems, meals = [], currentType = null) {
  const accepted = new Map((coachPlans || []).filter(p => p?.status === 'aceite').map(p => [p.id, p]));
  // Os cancelados também: ao aceitar um bloco novo, é o item cancelado que traz
  // a sugestão nova — o mealsForDay escolhe a mais recente, como no Início.
  // Menos os arrumados pelo sistema: cancelados FORA do período do seu plano
  // (o bloco antigo fechado na véspera do novo), como o ecrã Plano os esconde.
  const arrumado = (i) => {
    if (i.status !== 'cancelado') return false;
    const p = accepted.get(i.plan_id);
    const ini = String(p?.period_start || '').slice(0, 10);
    const fim = String(p?.period_end || '').slice(0, 10);
    return !!ini && !!fim && (dateIso < ini || dateIso > fim);
  };
  const dayItems = (coachPlanItems || []).filter(i => accepted.has(i.plan_id) && i.planned_date === dateIso && !arrumado(i));
  const model = mealsForDay(dayItems);
  if (!model) return [];
  const registered = new Set((meals || []).filter(m => m?.date === dateIso).map(m => m.meal_type));
  const open = model.meals
    .filter(m => m.tipo && typeof m.texto === 'string' && m.texto.trim() && !registered.has(m.tipo))
    .map(m => ({ id: `${dateIso}:${m.tipo}`, tipo: m.tipo, label: m.label, texto: m.texto.trim() }));
  // Bug #77 (2026-10-20): só a sugestão do tipo escolhido. Antes, sem
  // sugestão para esse tipo (a Ceia às 23:00, por omissão), mostravam-se as
  // outras todas — o atleta escolhia o jantar e via o dia inteiro. Sem tipo
  // (nenhum escolhido ainda), ficam todas.
  if (currentType == null) return open;
  return open.filter(m => m.tipo === currentType);
}
