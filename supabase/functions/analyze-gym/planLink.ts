// O treino do plano a que um registo de ginásio corresponde, e o planeado vs
// feito dele — registo unificado, F4b (specs/plano-registo-plano-coach.md).
//
// O cliente só liga o item (completePlanItem) DEPOIS de a análise voltar, por
// isso a análise não o acha por completed_session_id num registo novo: o
// cliente manda plan_item_id (e completion_source) no pedido. Numa edição, o
// item já está ligado à sessão e acha-se por aí.

import { computePlanExecution, describePlanExecution, executionNote, type ExerciseMetaIn, type PlanExecution, type SetIn } from "../_shared/formulas/planExecution.ts";

export type PlanLink = { itemId: string | null; source: "plano" | "auto" | null };
/** O planeado vs feito (null sem prescrição ou numa aula) e se o registo foi um
 *  treino livre contado como o do plano — este reconhece-se sempre (decisão 3). */
export type PlanResolution = { exec: PlanExecution | null; autoLinked: boolean };
export const FREE_WORKOUT_NOTE = "Treino livre, contado como o treino do plano.";

/** O que o pedido diz sobre o treino do plano (validado). */
// deno-lint-ignore no-explicit-any
export function parsePlanLink(body: any): PlanLink {
  const id = typeof body?.plan_item_id === "string" && /^[0-9a-f-]{36}$/i.test(body.plan_item_id) ? body.plan_item_id : null;
  const source = body?.completion_source === "plano" || body?.completion_source === "auto" ? body.completion_source : null;
  return { itemId: id, source };
}

/** Calcula o planeado vs feito e grava a execution_note no item. Best-effort:
 *  nunca faz falhar o registo. null sem treino do plano ou sem prescrição. */
export async function resolvePlanExecution(
  // deno-lint-ignore no-explicit-any
  sb: any,
  args: {
    userId: string;
    sessionId: string;
    sessionDate: string;
    sets: SetIn[] | null | undefined;
    meta: ExerciseMetaIn[] | null | undefined;
    link: PlanLink;
    // As sessões anteriores com séries (as mesmas que a Carol lê no histórico).
    // deno-lint-ignore no-explicit-any
    recent: any[] | null | undefined;
    // Uma aula não se compara com séries prescritas: só o reconhecimento.
    kind?: string;
  },
): Promise<PlanResolution> {
  try {
    const cols = "id, prescription, completion_source";
    let item = null;
    if (args.link.itemId) {
      const { data } = await sb.from("coach_plan_items").select(cols)
        .eq("id", args.link.itemId).eq("user_id", args.userId).eq("kind", "ginasio").maybeSingle();
      item = data;
    }
    if (!item) {
      const { data } = await sb.from("coach_plan_items").select(cols)
        .eq("completed_session_id", args.sessionId).eq("user_id", args.userId).maybeSingle();
      item = data;
    }
    if (!item) return { exec: null, autoLinked: false };
    const source = args.link.source ?? item.completion_source ?? null;
    const autoLinked = source === "auto";
    const comparable = !!item.prescription && (args.kind ?? "forca") === "forca";
    if (!comparable) {
      // Sem prescrição (plano antigo) ou numa aula: não há planeado vs feito,
      // mas um treino livre que riscou o do dia diz-se na mesma — na análise,
      // no cartão, no chat e no resumo (revisão pré-deploy de 2026-10-18).
      if (autoLinked) {
        await sb.from("coach_plan_items").update({ execution_note: FREE_WORKOUT_NOTE }).eq("id", item.id).eq("user_id", args.userId);
      }
      return { exec: null, autoLinked };
    }
    const exec = computePlanExecution({
      prescription: item.prescription,
      completionSource: source,
      sessionDate: args.sessionDate,
      sets: args.sets,
      exercisesMeta: args.meta,
      history: (args.recent ?? []).map((r) => ({ date: r?.date, sets: r?.workout_session_sets })),
    });
    const note = executionNote(exec);
    if (note) {
      await sb.from("coach_plan_items").update({ execution_note: note }).eq("id", item.id).eq("user_id", args.userId);
    }
    return { exec, autoLinked };
  } catch (e) {
    console.warn("analyze-gym: planeado vs feito não calculado —", e instanceof Error ? e.message : e);
    return { exec: null, autoLinked: false };
  }
}

/** A secção do prompt da Carol com o planeado vs feito. Vazia sem prescrição.
 *  O que ela prescreveu foram séries × reps e um objetivo — nunca kg: a carga
 *  compara-se com a última vez do atleta. Um treino livre que riscou o do dia
 *  reconhece-se logo na primeira frase, e o plano nunca é alterado sozinha. */
export function planExecutionPromptSection(exec: PlanExecution | null, autoLinked = exec?.autoLinked ?? false): string {
  const text = describePlanExecution(exec);
  if (!text) {
    // Sem prescrição para comparar, mas foi um treino livre que riscou o do dia.
    return autoLinked
      ? `\nESTE TREINO FOI REGISTADO COMO LIVRE e contado como o treino do plano desse dia: a PRIMEIRA frase da análise reconhece-o ` +
        `(ex.: «Registaste como treino livre; contei-o como o treino do plano de hoje»). NÃO alteres tu o plano nem propões um novo: ` +
        `se o que fez justificar adaptá-lo, convida-o a falar contigo (intervenção) — a decisão é dele.\n`
      : "";
  }
  return `\n${text}\n` +
    `EXECUÇÃO DO PLANO: comenta o planeado vs feito com estes números (séries, reps, carga face à última vez, objetivos) sem despejar a ficha toda. ` +
    `Nunca digas que prescreveste uma carga em kg: não prescreveste — a carga lê-se contra a última vez dele.\n` +
    (exec?.autoLinked
      ? `ESTE TREINO FOI REGISTADO COMO LIVRE e contado como o treino do plano desse dia: a PRIMEIRA frase da análise reconhece-o ` +
        `(ex.: «Registaste como treino livre; contei-o como o treino do plano de hoje. Fizeste X e Y, ficou de fora Z»). ` +
        `NÃO alteres tu o plano nem propões um novo: se o que faltou ou mudou justificar adaptá-lo, convida-o a falar contigo (intervenção) — a decisão é dele.\n`
      : "");
}
