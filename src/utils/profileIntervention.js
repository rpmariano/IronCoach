import { goalsDeclinedMarker, isGoalsIntervention } from '@formulas/goalsIntervention.ts';
import { INTERVENTION_OUTCOME } from '@formulas/interventionOutcomes.ts';

/* A intervenção da Carol no perfil (coach_intervention_status) — a que acende o botão flutuante
   («Preciso de falar contigo») em todos os ecrãs.

   Bug #111 (2026-11-01): o «Dispensar» do registo (cartão, formulário, «Registo Guardado») só
   gravava a marca local do registo (dismissedInterventions); a intervenção do perfil que a análise
   desse registo tinha aberto ficava «needed», e o botão flutuante continuava a chamar — também
   depois do reload, porque lê o perfil. Agora o registo que a abriu fecha-a também, com o mesmo
   desfecho do «Dispensar este assunto» da janela da Carol.

   De quem é a intervenção (revisão do #111): pela linha ABERTA de coach_interventions, nunca por
   marcas em memória — o intervention_needed do registo acabado de gravar fica no store depois de a
   intervenção dele se resolver, e fechava a seguinte, de outro assunto. O perfil não serve: o
   trigger track_coach_intervention limpa profiles.coach_intervention_origin em cada update, por
   isso depois de um reload vem sempre null. A linha não guarda o id do registo; liga-se a ele
   pela origem (o tipo) e pelo tempo: a análise abre-a segundos depois de gravar o registo (4 a
   25 s nos dados reais), e o registo é o último desse tipo gravado até ela abrir. */

export const isProfileInterventionPending = (profile) =>
  profile?.coach_intervention_status === 'needed' || profile?.coach_intervention_status === 'in_progress';

const RECORD_LIST = { run: 'runs', gym: 'gymSessions', meal: 'meals', body: 'bodyAssessments' };
// Entre gravar o registo e a análise abrir a intervenção: segundos. Uma folga larga para uma
// análise lenta, curta que chegue para não apanhar o registo de ontem.
export const OPENED_AFTER_RECORD_MAX_MS = 10 * 60 * 1000;

/** Os registos deste tipo no store (para saber qual foi o último gravado antes da intervenção). */
export const recordsOfType = (state, type) => state?.[RECORD_LIST[type]] || [];

/** A intervenção aberta (coach_interventions, closed_at null) do atleta, ou null. */
export async function readOpenIntervention(userId) {
  if (!userId) return null;
  const { supabase } = await import('../lib/supabase');
  const { data, error } = await supabase.from('coach_interventions')
    .select('origin, reason, opened_at')
    .eq('user_id', userId)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

const timeOf = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : NaN; };

/** A intervenção aberta é a deste registo? Mesma origem (o tipo), aberta até 10 min depois de o
 *  registo ser gravado, e sem outro registo desse tipo gravado entre os dois. */
export function openInterventionIsFromRecord(open, record, type, records = []) {
  if (!open || !record?.id || open.origin !== type) return false;
  const opened = timeOf(open.opened_at);
  const created = timeOf(record.created_at);
  if (!Number.isFinite(opened) || !Number.isFinite(created)) return false;
  if (created > opened || opened - created > OPENED_AFTER_RECORD_MAX_MS) return false;
  return !(records || []).some((r) => r?.id !== record.id && timeOf(r?.created_at) > created && timeOf(r?.created_at) <= opened);
}

/** Dispensa a intervenção do perfil no servidor — só se o motivo ainda for `profile`'s (a guarda
 *  contra uma intervenção nova chegada entretanto, como em store/index.js). Devolve se fechou.
 *  Dispensar é um desfecho (5.5): fica em coach_interventions, e a Carol calibra por ele. Só no
 *  update — o trigger consome-o. */
export async function dismissProfileIntervention(profile) {
  const { supabase } = await import('../lib/supabase');
  let query = supabase.from('profiles')
    .update({ coach_intervention_status: 'resolved', coach_intervention_reason: null, coach_intervention_outcome: INTERVENTION_OUTCOME.DISPENSADO })
    .eq('id', profile.id);
  query = profile.coach_intervention_reason == null
    ? query.is('coach_intervention_reason', null)
    : query.eq('coach_intervention_reason', profile.coach_intervention_reason);
  const { data: rows, error } = await query.select('id');
  if (error) throw error;
  if (!(rows || []).length) return false;
  // Dispensar um convite para objetivos é dizer "agora não": fica registado para a Carol não
  // voltar a chamar na próxima pesagem (espera de 14 dias, ver goalsDeclinedMarker).
  if (isGoalsIntervention(profile.coach_intervention_reason)) {
    const { error: markErr } = await supabase.from('coach_goal_proposals').insert(goalsDeclinedMarker(profile.id));
    if (markErr) console.warn('Falha a registar a recusa de objetivos:', markErr);
  }
  return true;
}

/** O perfil depois da dispensa, para o store. */
export const resolvedProfile = (profile) => ({ ...profile, coach_intervention_status: 'resolved', coach_intervention_reason: null });
