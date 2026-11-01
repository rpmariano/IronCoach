import { goalsDeclinedMarker, isGoalsIntervention } from '@formulas/goalsIntervention.ts';
import { INTERVENTION_OUTCOME } from '@formulas/interventionOutcomes.ts';

/* A intervenção da Carol no perfil (coach_intervention_status) — a que acende o botão flutuante
   («Preciso de falar contigo») em todos os ecrãs.

   Bug #111 (2026-11-01): o «Dispensar» do registo (cartão, formulário, «Registo Guardado») só
   gravava a marca local do registo (dismissedInterventions); a intervenção do perfil que a análise
   desse registo tinha aberto ficava «needed», e o botão flutuante continuava a chamar — também
   depois do reload, porque lê o perfil. Agora o registo que a abriu fecha-a também, com o mesmo
   desfecho do «Dispensar este assunto» da janela da Carol. */

export const isProfileInterventionPending = (profile) =>
  profile?.coach_intervention_status === 'needed' || profile?.coach_intervention_status === 'in_progress';

const NEWEST_LIST = { run: 'runs', gym: 'gymSessions', meal: 'meals', body: 'bodyAssessments' };

/** O id do registo mais recente deste tipo no store (o que a análise acabou de ver). */
export function newestRecordId(state, type) {
  const list = state?.[NEWEST_LIST[type]] || [];
  let best = null;
  for (const r of list) {
    if (!r?.id) continue;
    const key = `${r.created_at || ''}|${r.date || ''}`;
    if (!best || key > best.key) best = { id: r.id, key };
  }
  return best?.id ?? null;
}

/** A intervenção pendente do perfil é a deste registo? Pelas marcas que a análise acabou de
 *  devolver (só no registo acabado de gravar), ou pela origem (o tipo) quando é o registo mais
 *  recente desse tipo — os registos não guardam a intervenção, só o perfil a tem. */
export function recordOwnsProfileIntervention(profile, record, type, newestId) {
  if (!record?.id || !isProfileInterventionPending(profile)) return false;
  if (record.intervention_needed || record.coach_intervention_status === 'needed') return true;
  return profile?.coach_intervention_origin === type && record.id === newestId;
}

/** Dispensa a intervenção do perfil no servidor. Dispensar é um desfecho (5.5): fica em
 *  coach_interventions, e a Carol calibra por ele. Só no update — o trigger consome-o. */
export async function dismissProfileIntervention(profile) {
  const { supabase } = await import('../lib/supabase');
  const { error } = await supabase.from('profiles')
    .update({ coach_intervention_status: 'resolved', coach_intervention_reason: null, coach_intervention_outcome: INTERVENTION_OUTCOME.DISPENSADO })
    .eq('id', profile.id);
  if (error) throw error;
  // Dispensar um convite para objetivos é dizer "agora não": fica registado para a Carol não
  // voltar a chamar na próxima pesagem (espera de 14 dias, ver goalsDeclinedMarker).
  if (isGoalsIntervention(profile.coach_intervention_reason)) {
    const { error: markErr } = await supabase.from('coach_goal_proposals').insert(goalsDeclinedMarker(profile.id));
    if (markErr) console.warn('Falha a registar a recusa de objetivos:', markErr);
  }
}

/** O perfil depois da dispensa, para o store. */
export const resolvedProfile = (profile) => ({ ...profile, coach_intervention_status: 'resolved', coach_intervention_reason: null });
