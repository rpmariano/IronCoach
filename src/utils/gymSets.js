import { foodKey } from '@formulas/foodKey.ts';
import { cardioSpecFor } from '@formulas/cardioFields.ts';
import { isMeasurableGoal } from '@formulas/goalCheck.ts';

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
  // Uma série que veio do plano: as reps alvo e o kg da última vez (Armário),
  // lido na hora — a Carol não prescreve kg (decisão 5).
  const own = ex.sets[setIdx];
  if (own?.plan) {
    // As reps são o alvo do plano; a carga segue a que ele já usou numa série
    // anterior desta sessão, senão a da última vez (revisão pré-deploy, N10).
    let prevW = '';
    for (let i = setIdx - 1; i >= 0; i--) {
      if (!blank(ex.sets[i]?.weight)) { prevW = ex.sets[i].weight; break; }
    }
    const lastW = last?.last_weight != null && Number(last.last_weight) > 0 ? last.last_weight : '';
    return { reps: own.plan.reps ?? '', weight: !blank(prevW) ? prevW : (!blank(own.plan.weight) ? own.plan.weight : lastW) };
  }
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
      if (exerciseType(ex) === 'cardio') {
        // Cardio do plano: o ✓ confirma os alvos que ficaram por escrever.
        const p = s.plan || {};
        return {
          ...s,
          done: true,
          durationMin: blank(s.durationMin) && !blank(p.durationMin) ? String(p.durationMin) : s.durationMin,
          distance: blank(s.distance) && !blank(p.distance) ? String(p.distance) : s.distance,
          laps: blank(s.laps) && !blank(p.laps) ? String(p.laps) : s.laps,
        };
      }
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

/** "Marcar todas": cada série por confirmar fica feita, com a sugestão onde
 *  estiver vazia — o exercício do plano cumprido tal e qual, num toque. */
export function markAllDone(ex, last) {
  let next = ex;
  for (const s of ex.sets) if (!s.done) next = toggleSetDone(next, s.key, last);
  return next;
}

/** Ao gravar: numa série do plano em que ele escreveu as reps mas deixou o kg
 *  em branco, o kg é o que estava à vista como sugestão — senão gravava-se
 *  10×nada com "40" escrito no campo (revisão pré-deploy, N10). */
export function completePlanSets(exercises, lockerIdx) {
  return exercises.map(ex => {
    if (exerciseType(ex) === 'cardio' || !ex.sets.some(s => s.plan)) return ex;
    const last = lockerEntryFor(lockerIdx, ex.name);
    let next = ex;
    ex.sets.forEach((s, i) => {
      if (!s.plan || blank(s.reps) || !blank(s.weight)) return;
      const sug = setSuggestion(next, i, last);
      if (sug && !blank(sug.weight)) {
        next = { ...next, sets: next.sets.map(x => (x.key === s.key ? { ...x, weight: String(sug.weight) } : x)) };
      }
    });
    return next;
  });
}

/** Há séries vindas do plano ainda por confirmar? (Não contam ao gravar.) */
export const hasUnconfirmedPlanSets = (ex) => ex.sets.some(s => s.plan && !s.done && blank(s.reps) && blank(s.weight) && blank(s.durationMin) && blank(s.distance) && blank(s.laps));

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
      // Decisão 9: o que se mede (reps, minutos, km, ritmo) a Carol julga pelos
      // números; só o qualitativo ("descida em 3 s") leva o que ele confirmou.
      goal_met: !isMeasurableGoal(ex.goal) && typeof ex.goalMet === 'boolean' ? ex.goalMet : null,
      // A afinação da máquina só vai se ele a escreveu ou apagou neste registo
      // (decisão 10): sem mexer, o servidor deixa a que o Armário já tem.
      ...(typeof ex.machineSettings === 'string' ? { machine_settings: ex.machineSettings.trim().slice(0, 120) } : {}),
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
      goalMet: typeof meta?.goal_met === 'boolean' ? meta.goal_met : null,
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

// ── Ler os prints e as notas para o formulário (F2, Opção A) ─────────────

const secToMin = (s) => (s ? String(Math.round((s / 60) * 10) / 10) : '');

/** Os exercícios que a Carol leu (preview da analyze-gym), no modelo do
 *  formulário. `planBlocks` são os blocos da prescrição do item do plano: o
 *  índice que ela devolveu traz o objetivo do plano de volta. */
export function exercisesFromPreview(preview, planBlocks = []) {
  return (preview?.exercises || []).map((pe, i) => {
    const idx = Number.isInteger(pe.plan_block_index) ? pe.plan_block_index : null;
    const goal = (idx !== null && planBlocks[idx]?.goal) || '';
    if (pe.type === 'cardio') {
      const s = pe.sets?.[0] || {};
      const metres = cardioSpecFor(pe.name)?.distanceUnit === 'm';
      const present = ['duration', 'distance', 'laps'].filter(f => (f === 'duration' ? s.duration_seconds : f === 'distance' ? s.distance_km : s.laps));
      const fields = ['duration', 'distance', 'laps'].filter(f => present.includes(f) || (cardioSpecFor(pe.name)?.fields || ['duration']).includes(f));
      return newExercise({
        name: pe.name,
        type: 'cardio',
        goal,
        fields,
        distanceUnit: metres ? 'm' : null,
        planBlockIndex: idx,
        sets: [newSet({
          durationMin: secToMin(s.duration_seconds),
          distance: s.distance_km ? String(metres ? Math.round(s.distance_km * 1000) : s.distance_km) : '',
          laps: s.laps ? String(s.laps) : '',
        })],
      });
    }
    return newExercise({
      name: pe.name,
      type: 'forca',
      goal,
      planBlockIndex: idx,
      // Nomeado sem números (bug #67): uma série vazia para ele preencher.
      sets: (pe.sets || []).length ? pe.sets.map(s => newSet({ reps: s.reps ?? '', weight: s.weight ?? '' })) : null,
    });
  });
}

/** O que a leitura acrescenta ao formulário — só o que o atleta ainda não
 *  escreveu. "O que ele escreveu ganha ao que ela leu": grupos, nome e
 *  métricas só entram se estiverem vazios; os exercícios juntam-se, sem repetir
 *  um nome que já lá esteja. Devolve o que mudar e uma contagem para a frase. */
export function mergePreview(form, preview, planBlocks = []) {
  const patch = {};
  let metrics = 0;
  if (!form.categories.length && preview.categories?.length) patch.categories = preview.categories;
  if (form.kind === 'aula' && !form.classTypes.length && preview.class_types?.length) patch.classTypes = preview.class_types;
  if (!form.name.trim() && preview.session_name) patch.name = preview.session_name;

  const m = preview.metrics || {};
  if (blank(form.durationStr) && m.duration_seconds) { patch.durationStr = formatDurationInput(m.duration_seconds); metrics++; }
  if (blank(form.calories) && m.calories_kcal != null) { patch.calories = String(m.calories_kcal); metrics++; }
  if (blank(form.avgHr) && m.avg_hr) { patch.avgHr = String(m.avg_hr); metrics++; }
  if (blank(form.maxHr) && m.max_hr) { patch.maxHr = String(m.max_hr); metrics++; }
  if ((form.exertion === '' || form.exertion == null || form.exertion === 0) && m.exertion) { patch.exertion = m.exertion; metrics++; }

  const have = new Set(form.exercises.map(e => foodKey(e.name)));
  const incoming = exercisesFromPreview(preview, planBlocks).filter(e => !have.has(foodKey(e.name)));
  // Uma linha em branco que o atleta deixou aberta não é um exercício: sai.
  const kept = form.exercises.filter(e => (e.name || '').trim() || e.sets.some(s => !blank(s.reps) || !blank(s.weight) || !blank(s.durationMin) || !blank(s.distance) || !blank(s.laps)));
  if (incoming.length || kept.length !== form.exercises.length) patch.exercises = [...kept, ...incoming];

  return { patch, exercises: incoming.length, metrics, skipped: (preview.exercises || []).length - incoming.length };
}

/** A frase para o atleta, na voz da Carol, depois de uma leitura. */
export function readSummary({ exercises, metrics, skipped }, source) {
  const parts = [];
  if (exercises) parts.push(exercises === 1 ? '1 exercício' : `${exercises} exercícios`);
  if (metrics) parts.push(metrics === 1 ? '1 métrica' : `${metrics} métricas`);
  if (!parts.length) {
    return skipped
      ? 'Li o que está nos prints, mas já tens esses exercícios no formulário — não mexi em nada.'
      : source === 'foto'
        ? 'Não consegui ler exercícios nem métricas nos prints. Tenta outro print, ou escreve-os abaixo.'
        : 'Não percebi exercícios nas observações. Tenta assim: «3x12 extensões 40 kg, 20 min bicicleta».';
  }
  return `Li ${parts.join(' e ')}. Revê e corrige o que for preciso antes de gravar.`;
}

/** Uma série gravada, em texto, para o cartão: força "12 reps × 40 kg"; cardio
 *  "5 min 18 s · 1 km · 3 voltas" (bug #73, 2026-10-19: uma passadeira com
 *  tempo e km aparecia como "reps × kg"). Só o que a série tem — nunca
 *  "undefined" nem "reps × kg" vazios. */
export function describeSavedSet(set) {
  const secs = Number(set?.duration_seconds);
  const km = Number(set?.distance_km);
  const laps = Number(set?.laps);
  const parts = [];
  if (secs > 0) {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    parts.push(m > 0 ? (s > 0 ? `${m} min ${s} s` : `${m} min`) : `${s} s`);
  }
  if (km > 0) {
    parts.push(km < 1 ? `${Math.round(km * 1000)} m` : `${String(Math.round(km * 100) / 100).replace('.', ',')} km`);
  }
  if (laps > 0) parts.push(`${laps} ${laps === 1 ? 'volta' : 'voltas'}`);
  if (parts.length) return parts.join(' · ');
  const reps = set?.reps;
  const weight = set?.weight;
  const hasReps = reps !== null && reps !== undefined && reps !== '';
  const hasWeight = weight !== null && weight !== undefined && weight !== '';
  if (hasReps && hasWeight) return `${reps} reps × ${weight} kg`;
  if (hasReps) return `${reps} reps`;
  if (hasWeight) return `${weight} kg`;
  return '—';
}
