import { supabase } from '../lib/supabase';
import { buildCourseProfile, sanitizeCourseProfile } from '@formulas/courseProfile.ts';
import { readGpxFile } from './gpxParse';

/* O percurso de uma prova a partir de um GPX (dev-back 1830a73c): o ficheiro lê-se no telemóvel
   (gpxParse.js), o perfil calcula-se com a fórmula partilhada (@formulas/courseProfile.ts) e só o
   perfil resumido se grava em race_events.course_profile (+ course_profile_at). O ficheiro nunca
   sobe. */

export const COURSE_BUILD_ERRORS = {
  poucos_pontos: 'O GPX tem poucos pontos para desenhar o percurso.',
  sem_altitude: 'O GPX não tem altitude.',
  demasiado_curto: 'O percurso tem menos de 500 m.',
  demasiado_longo: 'O percurso tem mais de 300 km.',
};
export const COURSE_COLUMN_MISSING_TEXT = 'O percurso ainda não está disponível no servidor. Tenta mais tarde.';
export const COURSE_SAVE_FAILED_TEXT = 'Não consegui guardar o percurso. Tenta outra vez.';

/** O perfil de um ficheiro GPX. Lança um Error com a frase para o atleta. */
export async function courseProfileFromFile(file) {
  const { points } = await readGpxFile(file);
  const result = buildCourseProfile(points);
  if (!result.ok) throw new Error(COURSE_BUILD_ERRORS[result.error] || COURSE_BUILD_ERRORS.poucos_pontos);
  return result.profile;
}

/** O perfil gravado de uma prova, validado (o jsonb é dado do cliente). */
export const readCourseProfile = (race) => sanitizeCourseProfile(race?.course_profile ?? null);

/* Sem a migration aplicada, o PostgREST não conhece a coluna: PGRST204 («Could not find the
   'course_profile' column … in the schema cache») ou o 42703 do Postgres. */
export function isMissingColumnError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  return code === 'PGRST204' || code === '42703' || /course_profile/.test(String(error.message || ''));
}

/**
 * Grava (ou apaga, com profile null) o perfil do percurso de uma prova já gravada.
 * Devolve { ok: true, patch } ou { ok: false, message }. No modo demo não vai à rede.
 */
export async function saveCourseProfile({ raceId, userId, profile }) {
  const patch = { course_profile: profile || null, course_profile_at: profile ? new Date().toISOString() : null };
  if (!raceId || !userId) return { ok: false, message: COURSE_SAVE_FAILED_TEXT };
  if (userId === 'demo-user') return { ok: true, patch };
  try {
    const { data, error } = await supabase.from('race_events').update(patch).eq('id', raceId).eq('user_id', userId).select('id').maybeSingle();
    if (error) return { ok: false, message: isMissingColumnError(error) ? COURSE_COLUMN_MISSING_TEXT : COURSE_SAVE_FAILED_TEXT };
    if (!data) return { ok: false, message: COURSE_SAVE_FAILED_TEXT };
    return { ok: true, patch };
  } catch {
    return { ok: false, message: COURSE_SAVE_FAILED_TEXT };
  }
}
