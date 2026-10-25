// Os dados da regra «plano a meio» (formulas/planResume.ts), lidos da base de
// dados — um só leitor para o coach-proactive-tick e para o coach-chat, para os
// dois decidirem igual (revisão do 69d1cc8c, A5). O cliente monta os mesmos
// dados a partir do store e corre a mesma função pura.
//
// Uma falha a ler qualquer parte devolve null: sem a certeza, não se retoma.

import { detectPlanResume, type PlanResumeCandidate, type PlanResumeInput, parseStoredContinuation } from "./formulas/planResume.ts";

const DAY_MS = 86400000;
/** O plano que a mensagem propôs foi gravado no mesmo turno, pouco antes dela. */
const SAME_TURN_MS = 5 * 60 * 1000;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Os dados da regra para este atleta, ou null (sem continuação, ou uma leitura falhou). */
// deno-lint-ignore no-explicit-any
export async function fetchPlanResumeInput(sb: any, userId: string): Promise<PlanResumeInput | null> {
  try {
    const { data: msg, error: msgErr } = await sb.from("coach_messages").select("id, created_at, plan_continuation")
      .eq("user_id", userId).eq("role", "model").not("plan_continuation", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (msgErr) throw msgErr;
    if (!msg) return null;
    const c = parseStoredContinuation(msg.plan_continuation);
    if (!c) return null;
    const chainStart = addDays(c.from, -7 * (c.part - 1));
    const at = Date.parse(msg.created_at);
    const sameTurnFrom = new Date(at - SAME_TURN_MS).toISOString();
    const [after, created, own, pending, accepted, race] = await Promise.all([
      sb.from("coach_messages").select("content, created_at").eq("user_id", userId).eq("role", "user")
        .gt("created_at", msg.created_at).order("created_at", { ascending: true }).limit(30),
      // B1: um plano criado depois da mensagem (recusado, aceite ou pendente).
      sb.from("coach_plans").select("id").eq("user_id", userId).gt("created_at", msg.created_at).limit(1),
      // B1: o plano que a própria mensagem propôs (a parte dela).
      sb.from("coach_plans").select("status, created_at").eq("user_id", userId)
        .lte("created_at", msg.created_at).gte("created_at", sameTurnFrom)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("coach_plans").select("id, coach_plan_items(kind)").eq("user_id", userId).eq("status", "proposto"),
      // A5: os aceites desde o início da cadeia (a semana anterior incluída).
      sb.from("coach_plans").select("coach_plan_items(planned_date, kind, status)").eq("user_id", userId)
        .eq("status", "aceite").gte("period_end", chainStart),
      // A prova: a do dia do until, e só se ainda estiver agendada.
      sb.from("race_events").select("name").eq("user_id", userId).eq("date", c.until).eq("status", "agendada").limit(1).maybeSingle(),
    ]);
    for (const r of [after, created, own, pending, accepted, race]) if (r?.error) throw r.error;
    return {
      lastContinuation: msg,
      pendingTrainingPlans: ((pending.data ?? []) as { coach_plan_items?: { kind?: string }[] }[])
        .filter((p) => (p.coach_plan_items || []).some((i) => i?.kind === "corrida" || i?.kind === "ginasio")).length,
      // deno-lint-ignore no-explicit-any
      acceptedItems: ((accepted.data ?? []) as any[]).flatMap((p) => p.coach_plan_items || []),
      userMessagesAfter: after.data ?? [],
      plansCreatedAfter: (created.data ?? []).length,
      continuationPlanStatus: own.data?.status ?? null,
      raceName: race.data?.name ?? null,
    };
  } catch (e) {
    console.warn("plano a meio: dados não lidos:", e instanceof Error ? e.message : (e as { message?: string })?.message ?? e);
    return null;
  }
}

/** O plano a meio deste atleta, agora — a mesma resposta no tick e no chat. */
// deno-lint-ignore no-explicit-any
export async function currentPlanResume(sb: any, userId: string, nowMs: number, todayISO: string): Promise<PlanResumeCandidate | null> {
  const input = await fetchPlanResumeInput(sb, userId);
  return input ? detectPlanResume(input, nowMs, todayISO) : null;
}
