// A Carol propõe objetivos de prova por iniciativa dela (pedido do Rui,
// 2026-10-25). Fora do index.ts para se poder testar.
//
// É sempre um turno À PARTE — nunca dentro do balanço da prova (decisão do
// coordenador na revisão do d609f9ad). O cliente pede-o com
// { targets_review: { reason, … } }:
//   · "plan_accepted" + plan_id — depois de o atleta aceitar um plano;
//   · "race_after" + race_id — depois de chegar um balanço com resultado
//     válido. Essa prova fica fora das contas.
//
// O que se compara é determinístico e sai daqui, sem o Gemini: para cada prova
// agendada DEPOIS de hoje (Lisboa), sem corrida ligada, com distância, a
// previsão com a fórmula do #89 (getRacePrediction, as mesmas corridas do ecrã
// — fetchForecastRuns) contra o objetivo gravado. Há diferença se não houver
// objetivo ou se ele se afastar da previsão 3% ou mais (AMBITIOUS_RATIO: abaixo
// disso o ecrã e a Carol já dizem «alinhado»). Sem diferenças, não há turno.
// Com elas, a Carol escreve a proposta e a proposta fica guardada no registo da
// revisão (coach_proactive_log.payload). O objetivo só muda quando o atleta diz
// «Atualiza os objetivos» — e aí o servidor aplica EXATAMENTE o que foi
// proposto, só nas provas que ainda estão por correr (brief, regra 7).

import { getRacePrediction } from "../_shared/formulas/racePlanning.ts";
import { AMBITIOUS_RATIO } from "../_shared/formulas/racePacing.ts";
import { formatPaceMinKm } from "../_shared/formulas/paceFormat.ts";
import { LOW_CONFIDENCE } from "../_shared/formulas/racePrediction.ts";
import { runsOnly } from "../_shared/formulas/runKinds.ts";

export const TARGETS_REVIEW_DEVIATION = AMBITIOUS_RATIO;
/** As respostas que o turno oferece (os chips). */
export const TARGETS_UPDATE_ANSWER = "Atualiza os objetivos";
export const TARGETS_KEEP_ANSWER = "Mantém";
/** Quanto tempo depois de uma revisão o «Atualiza os objetivos» ainda a aplica. */
export const TARGETS_APPLY_WINDOW_MS = 24 * 3600 * 1000;

export type TargetDiff = {
  race_id: string;
  name: string;
  date: string;
  distance_km: number;
  current_s: number | null;
  proposed_s: number;
  /** (objetivo − previsão) / previsão; null sem objetivo. */
  deviation: number | null;
  low_confidence: boolean;
  reference: { date: string | null; distance_km: number; time_s: number } | null;
};

/** O que fica guardado com a revisão: o que se propôs, prova a prova. */
export type TargetProposal = { race_id: string; proposed_s: number };

export type RaceRow = {
  id: string;
  name: string;
  date: string;
  distance_km: number | string | null;
  elevation_gain_m?: number | string | null;
  race_type?: string | null;
  experience_level?: string | null;
  target_time_seconds?: number | null;
  status?: string | null;
  cup_round_id?: string | null;
};

export type TargetsInputs = { races: RaceRow[]; level: string | null; linkedRaceIds: Set<string> };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O tempo a propor: a previsão arredondada a 5 s (ninguém corre para 49:53). */
export const roundTarget = (s: number): number => Math.round(s / 5) * 5;

export function formatHms(total: number): string {
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = Math.round(total % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Uma prova em que a revisão pode mexer: agendada, DEPOIS de hoje (Lisboa),
 * sem corrida ligada (uma prova corrida não muda de objetivo, seja qual for o
 * status — proteção dupla), e não excluída (a prova do balanço que pediu a
 * revisão).
 */
export function isReviewable(e: RaceRow, todayISO: string, inputs: { linkedRaceIds: Set<string> }, exclude: Set<string> = new Set()): boolean {
  return !!e?.id && ISO_DATE_RE.test(String(e.date)) && e.date > todayISO &&
    (!e.status || e.status === "agendada") && !inputs.linkedRaceIds.has(e.id) && !exclude.has(e.id);
}

/**
 * As provas cujo objetivo não bate com o que o treino aponta. Uma jornada de
 * competição sem objetivo fica de fora: o tempo dela fica vazio até ele o
 * marcar (specs/trofeu.md §2.6).
 */
export function computeTargetDiffs(
  inputs: TargetsInputs,
  // deno-lint-ignore no-explicit-any
  forecastRuns: any[],
  todayISO: string,
  exclude: Set<string> = new Set(),
): TargetDiff[] {
  const runs = runsOnly(forecastRuns || []).map((r) => ({ date: r.date, distance_km: Number(r.distance_km), duration_seconds: Number(r.duration_seconds) }));
  const out: TargetDiff[] = [];
  for (const e of inputs.races || []) {
    const km = Number(e?.distance_km);
    if (!isReviewable(e, todayISO, inputs, exclude) || !(km > 0)) continue;
    const current = Number(e.target_time_seconds) > 0 ? Math.round(Number(e.target_time_seconds)) : null;
    if (e.cup_round_id && current == null) continue;
    const prediction = getRacePrediction(
      { distance_km: km, elevation_gain_m: e.race_type === "trail" ? Number(e.elevation_gain_m) || null : null, race_type: e.race_type ?? null, experience_level: e.experience_level || inputs.level } as never,
      { experience_level: inputs.level } as never,
      runs,
    );
    if (!(prediction.predictedSeconds > 0)) continue;
    const predicted = Math.round(prediction.predictedSeconds);
    const deviation = current == null ? null : (current - predicted) / predicted;
    if (deviation != null && Math.abs(deviation) < TARGETS_REVIEW_DEVIATION) continue;
    const ref = prediction.basedOn;
    out.push({
      race_id: e.id,
      name: e.name,
      date: e.date,
      distance_km: km,
      current_s: current,
      proposed_s: roundTarget(predicted),
      deviation,
      low_confidence: (prediction.confidence ?? 0) < LOW_CONFIDENCE,
      reference: ref ? { date: ref.date ?? null, distance_km: Number(ref.distance), time_s: Math.round(Number(ref.time)) } : null,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const kmText = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Uma linha por prova: o objetivo atual → o proposto, e de onde vem o número. */
export function targetDiffLines(diffs: TargetDiff[]): string {
  return diffs.map((d) => {
    const cur = d.current_s == null ? "sem objetivo" : `${formatHms(d.current_s)} (${formatPaceMinKm(Math.round(d.current_s / d.distance_km))}/km)`;
    const prop = `${formatHms(d.proposed_s)} (${formatPaceMinKm(Math.round(d.proposed_s / d.distance_km))}/km)`;
    const ref = d.reference
      ? `; referência: a corrida${d.reference.date ? ` de ${ddmm(d.reference.date)}` : ""}, ${kmText(d.reference.distance_km)} km em ${formatHms(d.reference.time_s)}`
      : "";
    const low = d.low_confidence ? "; previsão de baixa confiança (a referência é bem mais curta do que a prova) — apresenta-a como estimativa" : "";
    return `- «${d.name}» (${ddmm(d.date)}, ${kmText(d.distance_km)} km): ${cur} → ${prop}${ref}${low}`;
  }).join("\n");
}

export type TargetsReviewRequest = { kind: "plan_accepted"; plan_id: string } | { kind: "race_after"; race_id: string };

/** O pedido do cliente, validado; null se não serve. */
export function parseTargetsReview(raw: unknown): TargetsReviewRequest | null {
  if (!raw || typeof raw !== "object") return null;
  // deno-lint-ignore no-explicit-any
  const r = raw as any;
  if (r.reason === "plan_accepted" && typeof r.plan_id === "string" && UUID_RE.test(r.plan_id)) return { kind: "plan_accepted", plan_id: r.plan_id };
  if (r.reason === "race_after" && typeof r.race_id === "string" && UUID_RE.test(r.race_id)) return { kind: "race_after", race_id: r.race_id };
  return null;
}

/** A chave da revisão em coach_proactive_log: uma por gatilho. */
export function targetsReviewKey(req: TargetsReviewRequest): string {
  return req.kind === "plan_accepted" ? `targets_review:${req.plan_id}` : `targets_review:race:${req.race_id}`;
}

/** O turno da revisão: o que a Carol recebe no lugar da mensagem dele. */
export function buildTargetsReviewTurn(diffs: TargetDiff[], kind: TargetsReviewRequest["kind"]): string {
  const why = kind === "plan_accepted"
    ? "o atleta acabou de aceitar um plano de treino novo"
    : "o atleta acabou de correr uma prova e já viu o balanço dela; o resultado entra nas contas";
  return `A app pediu-te a revisão dos objetivos das provas (${why}). Com as mesmas corridas do ecrã, estes objetivos já não ` +
    `batem com o que o treino aponta (3% ou mais de diferença, ou sem objetivo):\n${targetDiffLines(diffs)}\n` +
    `Diz-lhe, por prova, o objetivo atual → o que propões, e porquê (${kind === "plan_accepted" ? "o plano novo" : "o resultado da prova"} ` +
    `e a corrida de referência). Uma ou duas frases por prova; sem cumprimentar como início de conversa e sem voltar ao balanço. ` +
    `Pergunta-lhe se atualizas. NÃO chames update_race_event neste turno: só muda se ele disser «${TARGETS_UPDATE_ANSWER}»; ` +
    `com «${TARGETS_KEEP_ANSWER}», fica tudo como está.`;
}

// O resultado do update_race_event traz um conselho para o turno normal («Se
// houver plano de treino aceite, confirma… e propõe o ajustado»): aqui ela só
// confirma, por isso sai.
const withoutPlanAdvice = (result: string): string => result.replace(/\s*Se houver plano de treino aceite[^.]*\./g, "").trim();

/**
 * O que a Carol recebe depois de o servidor tentar o «Atualiza»: o que ficou
 * gravado e o que falhou, à parte — para ela dizer a verdade. Só confirma.
 */
export function buildTargetsAppliedInstruction(applied: { name: string; result: string }[]): string {
  const ok = applied.filter((t) => !t.result.startsWith("Erro"));
  const failed = applied.filter((t) => t.result.startsWith("Erro"));
  const parts = [`O atleta respondeu «${TARGETS_UPDATE_ANSWER}».`];
  if (ok.length) parts.push(`O servidor GRAVOU: ${ok.map((t) => `«${t.name}»: ${withoutPlanAdvice(t.result)}`).join(" ")}`);
  if (failed.length) parts.push(`NÃO ficou gravado (diz-lho, sem inventar que mudou): ${failed.map((t) => `«${t.name}»: ${t.result}`).join(" ")}`);
  if (!ok.length) parts.push("Nada mudou nas provas.");
  parts.push("Neste turno só confirmas, numa ou duas frases, o que ficou. Não revês o plano nem propões ajustes, e não chames update_race_event.");
  return parts.join(" ");
}

/** Porque é que um «Atualiza os objetivos» não aplicou nada. */
export type TargetsNotApplied = "no_review" | "nothing_eligible";

/** O «Atualiza» que não aplicou nada: ela diz a verdade, e não muda nada sozinha. */
export function buildTargetsNotAppliedInstruction(reason: TargetsNotApplied): string {
  const why = reason === "no_review"
    ? "não há nenhuma revisão de objetivos dele nas últimas 24 horas com uma proposta guardada"
    : "as provas da proposta já não podem mudar (já foram corridas, têm corrida ligada ou deixaram de estar agendadas)";
  return `O atleta respondeu «${TARGETS_UPDATE_ANSWER}», mas NADA foi aplicado: ${why}. Diz-lho numa frase, com a verdade, e ` +
    `pergunta-lhe se quer rever os objetivos de novo. Não chames update_race_event nem digas que algum objetivo mudou.`;
}

/** A resposta dele é «Atualiza os objetivos»? */
export const isTargetsUpdateAnswer = (message: string): boolean =>
  message.trim().toLowerCase().replace(/[.!]+$/, "") === TARGETS_UPDATE_ANSWER.toLowerCase();

/** O que se guarda com a revisão (coach_proactive_log.payload). */
export const targetsPayload = (diffs: TargetDiff[]): { proposals: TargetProposal[] } =>
  ({ proposals: diffs.map((d) => ({ race_id: d.race_id, proposed_s: d.proposed_s })) });

/** As provas agendadas depois de hoje, as que já têm corrida ligada e o nível. Nunca rejeita. */
// deno-lint-ignore no-explicit-any
export async function fetchTargetsInputs(sb: any, userId: string, todayISO: string): Promise<TargetsInputs> {
  try {
    const [{ data: races, error }, { data: profile }] = await Promise.all([
      sb.from("race_events")
        .select("id, name, date, distance_km, elevation_gain_m, race_type, experience_level, target_time_seconds, status, cup_round_id")
        .eq("user_id", userId)
        .eq("status", "agendada")
        .gt("date", todayISO)
        .order("date", { ascending: true })
        .limit(20),
      sb.from("profiles").select("experience_level").eq("id", userId).maybeSingle(),
    ]);
    if (error) throw error;
    const list = (races ?? []) as RaceRow[];
    const linkedRaceIds = new Set<string>();
    if (list.length) {
      const { data: linked, error: lErr } = await sb.from("runs")
        .select("race_id")
        .eq("user_id", userId)
        .in("race_id", list.map((r) => r.id));
      // Sem saber quais têm corrida ligada, não se mexe em nenhuma.
      if (lErr) throw lErr;
      for (const r of (linked ?? []) as { race_id: string | null }[]) if (r.race_id) linkedRaceIds.add(r.race_id);
    }
    return { races: list, level: (profile?.experience_level as string | null) ?? null, linkedRaceIds };
  } catch (e) {
    console.warn("Revisão dos objetivos: provas não lidas:", e instanceof Error ? e.message : e);
    return { races: [], level: null, linkedRaceIds: new Set() };
  }
}

/** A proposta da revisão mais recente das últimas 24 h (a que o «Atualiza» responde), ou null. */
// deno-lint-ignore no-explicit-any
export async function latestTargetsProposals(sb: any, userId: string, nowMs = Date.now()): Promise<TargetProposal[] | null> {
  try {
    const { data, error } = await sb.from("coach_proactive_log")
      .select("key, payload, sent_at")
      .eq("user_id", userId)
      .like("key", "targets_review:%")
      .gte("sent_at", new Date(nowMs - TARGETS_APPLY_WINDOW_MS).toISOString())
      .order("sent_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const proposals = (data ?? [])[0]?.payload?.proposals;
    if (!Array.isArray(proposals)) return null;
    return proposals.filter((p: TargetProposal) =>
      typeof p?.race_id === "string" && UUID_RE.test(p.race_id) && Number.isFinite(p?.proposed_s) && p.proposed_s > 0
    );
  } catch (e) {
    console.warn("Revisão dos objetivos: registo não lido:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * «Atualiza os objetivos»: grava exatamente o que se propôs, só nas provas que
 * ainda podem mudar (agendadas, depois de hoje, sem corrida ligada) — as
 * contas não se refazem aqui.
 */
export async function applyTargetProposals(
  proposals: TargetProposal[],
  inputs: TargetsInputs,
  todayISO: string,
  updateRace: (args: { race_id: string; target_time_seconds: number }) => Promise<string>,
): Promise<{ race_id: string; name: string; result: string }[]> {
  const byId = new Map(inputs.races.filter((r) => isReviewable(r, todayISO, inputs)).map((r) => [r.id, r]));
  const out = [];
  for (const p of proposals) {
    const race = byId.get(p.race_id);
    if (!race) continue;
    out.push({ race_id: p.race_id, name: race.name, result: await updateRace({ race_id: p.race_id, target_time_seconds: p.proposed_s }) });
  }
  return out;
}
