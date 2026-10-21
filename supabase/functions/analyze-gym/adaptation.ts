// A adaptação proativa depois de um treino do plano — registo unificado, F5
// (specs/plano-registo-plano-coach.md). As regras vivem em
// _shared/formulas/planAdaptation.ts; aqui só se juntam as execuções do plano
// e se abre a intervenção [adaptacao], que o Início leva ao chat.
//
// Nunca se mexe no plano: a Carol propõe no chat (propose_training_plan a
// substituir o plano ativo) e o atleta aceita ou recusa (decisão 3).

import { computePlanExecution, type ExerciseMetaIn, type PlanExecution, type SetIn } from "../_shared/formulas/planExecution.ts";
import {
  ADAPTATION_INTERVENTION_TAG,
  adaptationInterventionReason,
  detectPlanAdaptation,
  type AdaptationExecution,
} from "../_shared/formulas/planAdaptation.ts";
import { INTERVENTION_ORIGIN } from "../_shared/formulas/interventionOutcomes.ts";

/** Os treinos anteriores que se leem para o "2 vezes seguidas". */
const MAX_PRIOR = 12;

/** Abre a intervenção [adaptacao] se as regras o pedirem. Best-effort: nunca
 *  faz falhar o registo. Devolve o motivo aberto, ou null.
 *  Não abre quando: não há planeado vs feito; o plano não está aceite; já há
 *  outro assunto por resolver (só há um de cada vez); ou este plano já teve
 *  uma adaptação esta semana (a assinatura em coach_interventions). */
export async function maybeOpenPlanAdaptation(
  // deno-lint-ignore no-explicit-any
  sb: any,
  args: {
    userId: string;
    sessionId: string;
    sessionDate: string;
    rpe: number | null | undefined;
    exec: PlanExecution | null;
    item: { id: string; planId: string | null } | undefined;
    todayISO: string;
  },
): Promise<string | null> {
  try {
    const planId = args.item?.planId;
    if (!args.exec || !args.item || !planId) return null;

    const { data: plan } = await sb.from("coach_plans").select("id, status").eq("id", planId).eq("user_id", args.userId).maybeSingle();
    if (plan?.status !== "aceite") return null;

    const { data: profile } = await sb.from("profiles").select("coach_intervention_status").eq("id", args.userId).maybeSingle();
    if (["needed", "in_progress"].includes(profile?.coach_intervention_status)) return null;

    // Os outros treinos do plano já feitos, com prescrição e sessão ligada.
    const { data: items } = await sb.from("coach_plan_items")
      .select("id, prescription, completion_source, completed_session_id")
      .eq("plan_id", planId).eq("user_id", args.userId).eq("kind", "ginasio").eq("status", "concluido")
      .not("prescription", "is", null).not("completed_session_id", "is", null);
    // deno-lint-ignore no-explicit-any
    const prior = ((items || []) as any[]).filter((i) => i.id !== args.item!.id && i.completed_session_id !== args.sessionId);
    const sessionIds = prior.map((i) => i.completed_session_id);
    // deno-lint-ignore no-explicit-any
    let sessions: any[] = [];
    if (sessionIds.length) {
      const { data } = await sb.from("workout_sessions")
        .select("id, date, exertion, exercises_meta, workout_session_sets(exercise_name, set_index, reps, weight, duration_seconds, distance_km, laps)")
        .in("id", sessionIds).eq("user_id", args.userId).lt("date", args.sessionDate)
        .order("date", { ascending: false }).limit(MAX_PRIOR);
      sessions = data || [];
    }
    const byId = new Map(sessions.map((s) => [s.id, s]));

    const executions: AdaptationExecution[] = [];
    for (const i of prior) {
      const s = byId.get(i.completed_session_id);
      if (!s?.date) continue;
      const exec = computePlanExecution({
        prescription: i.prescription,
        completionSource: i.completion_source,
        sessionDate: String(s.date).slice(0, 10),
        sets: (s.workout_session_sets || []) as SetIn[],
        exercisesMeta: (s.exercises_meta || null) as ExerciseMetaIn[] | null,
      });
      if (exec) executions.push({ itemId: i.id, date: String(s.date).slice(0, 10), rpe: s.exertion ?? null, exec });
    }
    executions.push({ itemId: args.item.id, date: args.sessionDate, rpe: args.rpe ?? null, exec: args.exec });

    const adaptation = detectPlanAdaptation({ planId, executions, todayISO: args.todayISO });
    const reason = adaptationInterventionReason(adaptation);
    if (!reason || !adaptation.signature) return null;

    // Uma por plano e por semana: a assinatura já foi aberta (e talvez falada)?
    const { data: seen } = await sb.from("coach_interventions").select("id")
      .eq("user_id", args.userId).like("reason", `${ADAPTATION_INTERVENTION_TAG} ref=${adaptation.signature}%`).limit(1);
    if ((seen || []).length) return null;

    const { data: opened } = await sb.from("profiles")
      .update({ coach_intervention_status: "needed", coach_intervention_reason: reason, coach_intervention_origin: INTERVENTION_ORIGIN.GYM })
      .eq("id", args.userId)
      .or("coach_intervention_status.is.null,coach_intervention_status.in.(none,resolved)")
      .select("id");
    return (opened || []).length ? reason : null;
  } catch (e) {
    console.warn("analyze-gym: adaptação proativa não avaliada —", e instanceof Error ? e.message : e);
    return null;
  }
}
