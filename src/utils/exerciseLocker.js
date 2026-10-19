import { foodKey } from '@formulas/foodKey.ts';
import { supabase } from '../lib/supabase';

/* O Armário de Exercícios na app (specs/plano-registo-plano-coach.md §6,
   decisões 10 e 14): a lista dos exercícios que o atleta já fez — a analyze-gym
   enche-a sozinha — com a afinação da máquina, a gestão à mão e o que se
   mostra por exercício. Funções puras e escrita; os ecrãs vivem em
   components/Armario. */

/** Os grupos musculares do registo de ginásio (o vocabulário da Carol). */
export const MUSCLE_GROUPS = ['Peito', 'Costas', 'Pernas Superiores', 'Pernas Inferiores', 'Ombros', 'Bíceps', 'Tríceps', 'Glúteos', 'Core/Abdominais', 'Full Body', 'Cardio', 'Levantamento Olímpico', 'Powerlifting', 'Calistenia', 'Outro'];

export const MAX_MACHINE_SETTINGS = 120;

/** "40 kg × 10" ou, no cardio, o que se sabe — numa linha curta. */
export function exerciseSubline(ex) {
  const parts = [];
  if (ex?.block_type === 'cardio') parts.push('Cardio');
  else if (ex?.last_weight != null && Number(ex.last_weight) > 0) {
    parts.push(`${String(ex.last_weight).replace('.', ',')} kg${ex.last_reps != null ? ` × ${ex.last_reps}` : ''}`);
  } else if (ex?.last_reps != null) parts.push(`${ex.last_reps} reps`);
  if (ex?.personal_record_weight != null && Number(ex.personal_record_weight) > 0) {
    parts.push(`recorde ${String(ex.personal_record_weight).replace('.', ',')} kg`);
  }
  const n = Number(ex?.times_performed) || 0;
  if (n > 0) parts.push(n === 1 ? '1 vez' : `${n} vezes`);
  return parts.join(' · ');
}

/** Procura por nome e filtro por grupo muscular, os mais recentes primeiro. */
export function filterExercises(rows, query = '', group = null) {
  const q = foodKey(query);
  return [...(rows || [])]
    .filter((r) => (!group || r.category === group) && (!q || String(r.name_key || foodKey(r.name)).includes(q)))
    .sort((a, b) => String(b.last_performed_at || '').localeCompare(String(a.last_performed_at || '')) || String(a.name).localeCompare(String(b.name), 'pt'));
}

/** Os grupos presentes na lista, para os filtros. */
export const groupsOf = (rows) => [...new Set((rows || []).map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));

/** Guarda um exercício à mão: novo ou ajustado (nome, grupo, tipo, afinação). */
export async function saveExercise({ userId, values, existing = null }) {
  const name = String(values?.name || '').trim().slice(0, 80);
  if (!foodKey(name)) throw new Error('Dá um nome ao exercício.');
  const settings = String(values?.machine_settings || '').trim().slice(0, MAX_MACHINE_SETTINGS);
  const row = {
    name,
    name_key: foodKey(name),
    category: values?.category || 'Outro',
    block_type: values?.block_type === 'cardio' ? 'cardio' : 'forca',
    machine_settings: settings || null,
    updated_at: new Date().toISOString(),
  };
  // A editar não se manda user_id: a RLS já prende a linha ao dono.
  const q = existing?.id
    ? supabase.from('athlete_exercises').update(row).eq('id', existing.id)
    // Um exercício acrescentado à mão ainda não foi feito: 0 vezes, sem data.
    : supabase.from('athlete_exercises').insert({ ...row, user_id: userId, times_performed: 0 });
  const { data, error } = await q.select().single();
  if (error) throw new Error(error.code === '23505' ? 'Já tens um exercício com esse nome.' : error.message);
  return data;
}

export async function deleteExercise(id) {
  const { error } = await supabase.from('athlete_exercises').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
