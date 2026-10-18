import { foodKey } from '@formulas/foodKey.ts';
import { cardioSpecFor } from '@formulas/cardioFields.ts';

/* O registo de ginásio no cliente: duração escrita ↔ segundos, o modelo de um
   exercício no formulário (força ou cardio, com objetivo) e a conversão para
   o que a analyze-gym grava — workout_session_sets e exercises_meta.
   Registo unificado (specs/plano-registo-plano-coach.md §2.2, F1). */

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

// ── O exercício no formulário ────────────────────────────────────────────
// { key, name, type: 'forca'|'cardio', goal, fields, distanceUnit,
//   planBlockIndex, sets: [{ key, reps, weight, done, durationMin, distance, laps }] }
// Um rascunho antigo (antes do registo unificado) não tem type nem goal:
// lê-se como força, sem objetivo.

let seq = 0;
const uid = (p) => `${p}-${Date.now()}-${seq++}`;

const blank = (v) => v === '' || v === null || v === undefined;
const num = (v) => {
  if (blank(v)) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export const exerciseType = (ex) => (ex?.type === 'cardio' ? 'cardio' : 'forca');

export function newSet(values = {}) {
  return { key: uid('s'), reps: '', weight: '', done: false, durationMin: '', distance: '', laps: '', ...values };
}

/** Os campos de cardio deste exercício: os que ele já tem, senão os do
 *  catálogo, senão só o tempo. */
export function cardioFieldsOf(ex) {
  if (Array.isArray(ex?.fields) && ex.fields.length) return ex.fields;
  return cardioSpecFor(ex?.name)?.fields ?? ['duration'];
}

export function distanceUnitOf(ex) {
  return ex?.distanceUnit || cardioSpecFor(ex?.name)?.distanceUnit || 'km';
}

export function newExercise({ name = '', type, goal = '', fields = null, distanceUnit = null, planBlockIndex = null, sets = null } = {}) {
  const t = type || (cardioSpecFor(name) ? 'cardio' : 'forca');
  return {
    key: uid('e'),
    name,
    type: t,
    goal,
    fields,
    distanceUnit,
    planBlockIndex,
    sets: sets ?? (t === 'cardio' ? [newSet()] : [newSet()]),
  };
}

/** Mudar o nome: um exercício ainda vazio que passe a ser cardio conhecido
 *  ("Bicicleta", "Remo") muda de tipo sozinho. Com valores lá, não se mexe. */
export function renameExercise(ex, name) {
  const untouched = ex.sets.every(s => blank(s.reps) && blank(s.weight) && blank(s.durationMin) && blank(s.distance) && blank(s.laps));
  const spec = cardioSpecFor(name);
  if (untouched && spec && exerciseType(ex) !== 'cardio') return { ...ex, name, type: 'cardio', fields: null, sets: [newSet()] };
  return { ...ex, name };
}

/** Um exercício do Armário pronto a registar: 3 séries vazias na força (os
 *  valores da última vez aparecem como sugestão e o ✓ confirma-os), uma linha
 *  no cardio. */
export function exerciseFromLocker(row) {
  const type = row?.block_type === 'cardio' ? 'cardio' : 'forca';
  return newExercise({
    name: row?.name || '',
    type,
    fields: type === 'cardio' && Array.isArray(row?.cardio_fields) && row.cardio_fields.length ? row.cardio_fields : null,
    sets: type === 'cardio' ? [newSet()] : [newSet(), newSet(), newSet()],
  });
}

/** A sugestão para uma série: a série anterior preenchida, senão a última
 *  vez que o atleta fez o exercício (Armário). Nunca inventa. */
export function setSuggestion(ex, setIdx, last) {
  for (let i = setIdx - 1; i >= 0; i--) {
    const s = ex.sets[i];
    if (s && (!blank(s.reps) || !blank(s.weight))) return { reps: s.reps, weight: s.weight };
  }
  if (last && (last.last_reps != null || last.last_weight != null)) {
    return { reps: last.last_reps ?? '', weight: last.last_weight ?? '' };
  }
  return null;
}

/** O ✓ de uma série no modo Live: marca-a feita e, se estiver vazia,
 *  preenche com a sugestão. Desmarcar não apaga nada. */
export function toggleSetDone(ex, setKey, last) {
  return {
    ...ex,
    sets: ex.sets.map((s, i) => {
      if (s.key !== setKey) return s;
      if (s.done) return { ...s, done: false };
      if (exerciseType(ex) === 'cardio') return { ...s, done: true };
      const sug = setSuggestion(ex, i, last);
      return {
        ...s,
        done: true,
        reps: blank(s.reps) && sug ? String(sug.reps ?? '') : s.reps,
        weight: blank(s.weight) && sug ? String(sug.weight ?? '') : s.weight,
      };
    }),
  };
}

/** Ajuste rápido (+2,5 kg, −1 rep) a partir do valor escrito ou da sugestão. */
export function nudgeSet(ex, setKey, field, delta, last) {
  return {
    ...ex,
    sets: ex.sets.map((s, i) => {
      if (s.key !== setKey) return s;
      const sug = setSuggestion(ex, i, last);
      const base = num(s[field]) ?? num(sug?.[field]) ?? 0;
      const next = Math.max(0, Math.round((base + delta) * 100) / 100);
      return { ...s, [field]: String(next) };
    }),
  };
}

// Achata exercícios→séries em linhas prontas para workout_session_sets,
// espelhando flattenSets em supabase/functions/analyze-gym/index.ts — mesmas
// colunas (exercise_name, set_index, reps, weight), mais as de cardio
// (duration_seconds, distance_km, laps). Uma série sem valor nenhum cai.
export function flattenExercises(exercises) {
  const rows = [];
  for (const ex of exercises) {
    const name = (ex.name || '').trim();
    if (!name) continue;
    const cardio = exerciseType(ex) === 'cardio';
    const metres = distanceUnitOf(ex) === 'm';
    ex.sets.forEach((s, i) => {
      if (cardio) {
        const minutes = num(s.durationMin);
        const dist = num(s.distance);
        const laps = num(s.laps);
        const row = {
          exercise_name: name,
          set_index: i,
          reps: null,
          weight: null,
          duration_seconds: minutes && minutes > 0 ? Math.round(minutes * 60) : null,
          distance_km: dist && dist > 0 ? (metres ? dist / 1000 : dist) : null,
          laps: laps && laps > 0 ? Math.round(laps) : null,
        };
        if (row.duration_seconds === null && row.distance_km === null && row.laps === null) return;
        rows.push(row);
        return;
      }
      const reps = blank(s.reps) ? null : parseInt(s.reps);
      const weight = blank(s.weight) ? null : parseFloat(String(s.weight).replace(',', '.'));
      if (reps === null && weight === null) return;
      rows.push({ exercise_name: name, set_index: i, reps, weight });
    });
  }
  return rows;
}

/** O objetivo e o tipo de cada exercício com nome (workout_sessions.exercises_meta). */
export function buildExercisesMeta(exercises) {
  const out = [];
  const seen = new Set();
  for (const ex of exercises) {
    const name = (ex.name || '').trim();
    const key = foodKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      goal: (ex.goal || '').trim() || null,
      block_type: exerciseType(ex),
      plan_block_index: Number.isInteger(ex.planBlockIndex) ? ex.planBlockIndex : null,
      goal_met: null,
    });
  }
  return out;
}

/** Os exercícios de uma sessão gravada, para a editar: séries agrupadas por
 *  nome, o tipo e o objetivo do exercises_meta (ou deduzidos das séries). */
export function exercisesFromSession(session) {
  const metaByKey = new Map((Array.isArray(session?.exercises_meta) ? session.exercises_meta : [])
    .filter(m => m?.name).map(m => [foodKey(m.name), m]));
  const grouped = new Map();
  for (const s of session?.workout_session_sets || []) {
    const name = s.exercise_name || 'Exercício';
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(s);
  }
  return Array.from(grouped.entries()).map(([name, rows], i) => {
    const meta = metaByKey.get(foodKey(name));
    const isCardioRow = (r) => (r.duration_seconds || r.distance_km || r.laps) && !r.reps && !r.weight;
    const type = meta?.block_type === 'cardio' || meta?.block_type === 'forca'
      ? meta.block_type
      : (rows.every(isCardioRow) ? 'cardio' : 'forca');
    const metres = cardioSpecFor(name)?.distanceUnit === 'm';
    const sorted = rows.slice().sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0));
    const fields = type === 'cardio'
      ? ['duration', 'distance', 'laps'].filter(f => sorted.some(r => (f === 'duration' ? r.duration_seconds : f === 'distance' ? r.distance_km : r.laps)))
      : null;
    return {
      key: `e-${i}-${name}`,
      name,
      type,
      goal: meta?.goal || '',
      fields: fields && fields.length ? fields : null,
      distanceUnit: null,
      planBlockIndex: Number.isInteger(meta?.plan_block_index) ? meta.plan_block_index : null,
      sets: sorted.map((r, j) => ({
        key: r.id || `s-${i}-${j}`,
        reps: r.reps ?? '',
        weight: r.weight ?? '',
        done: false,
        durationMin: r.duration_seconds ? String(Math.round((r.duration_seconds / 60) * 10) / 10) : '',
        distance: r.distance_km ? String(metres ? Math.round(r.distance_km * 1000) : r.distance_km) : '',
        laps: r.laps ?? '',
      })),
    };
  });
}

/** O Armário indexado pelo nome normalizado, para "da última vez". */
export function lockerIndex(rows) {
  const map = new Map();
  for (const r of rows || []) if (r?.name_key) map.set(r.name_key, r);
  return map;
}

export const lockerEntryFor = (index, name) => index?.get(foodKey(name || '')) || null;

/** "40 kg × 10" / "20 min · 8 km" — a última vez, numa linha curta. */
export function describeLast(row) {
  if (!row) return null;
  if (row.block_type === 'cardio') return null;
  const w = row.last_weight != null && Number(row.last_weight) > 0 ? `${String(row.last_weight).replace('.', ',')} kg` : null;
  const r = row.last_reps != null ? `${row.last_reps}` : null;
  if (w && r) return `${w} × ${r}`;
  if (r) return `${r} reps`;
  return w;
}
