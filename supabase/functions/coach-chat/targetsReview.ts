// A Carol propõe objetivos de prova por iniciativa dela (pedido do Rui,
// 2026-10-25). Fora do index.ts para se poder testar.
//
// Dois gatilhos:
//   · depois de uma prova concluída (race_after): o balanço inclui a revisão
//     dos objetivos das provas por correr;
//   · depois de o atleta aceitar um plano: o cliente pede um turno
//     { targets_review: { reason: "plan_accepted", plan_id } }.
//
// O que se compara é determinístico e sai daqui, sem o Gemini: para cada prova
// agendada com distância, a previsão com a fórmula do #89 (getRacePrediction,
// as mesmas corridas do ecrã — fetchForecastRuns) contra o objetivo gravado.
// Há diferença se não houver objetivo ou se ele se afastar da previsão 3% ou
// mais (AMBITIOUS_RATIO: abaixo disso o ecrã e a Carol já dizem «alinhado»).
// Sem diferenças, não há turno. Com elas, a Carol escreve a proposta; o
// objetivo só muda quando o atleta diz «Atualiza os objetivos» — e aí é o
// servidor que aplica estes mesmos números (update_race_event), sem
// depender de o modelo chamar a ferramenta (brief, regra 7: nada muda sem ele).

import { getRacePrediction } from "../_shared/formulas/racePlanning.ts";
import { AMBITIOUS_RATIO } from "../_shared/formulas/racePacing.ts";
import { formatPaceMinKm } from "../_shared/formulas/paceFormat.ts";
import { LOW_CONFIDENCE } from "../_shared/formulas/racePrediction.ts";
import { runsOnly } from "../_shared/formulas/runKinds.ts";

export const TARGETS_REVIEW_DEVIATION = AMBITIOUS_RATIO;
/** As respostas que o turno oferece (os chips). */
export const TARGETS_UPDATE_ANSWER = "Atualiza os objetivos";
export const TARGETS_KEEP_ANSWER = "Mantém";
/** Quanto tempo depois de uma revisão «Atualiza os objetivos» ainda a aplica. */
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

type RaceRow = {
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O tempo a propor: a previsão arredondada a 5 s (ninguém corre para 49:53). */
export const roundTarget = (s: number): number => Math.round(s / 5) * 5;

export function formatHms(total: number): string {
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = Math.round(total % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * As provas cujo objetivo não bate com o que o treino aponta. `races`: as
 * agendadas a partir de hoje. Uma jornada de competição sem objetivo fica de
 * fora: o tempo dela fica vazio até ele o marcar (specs/trofeu.md §2.6).
 */
export function computeTargetDiffs(
  races: RaceRow[],
  profileLevel: string | null,
  // deno-lint-ignore no-explicit-any
  forecastRuns: any[],
  todayISO: string,
): TargetDiff[] {
  const runs = runsOnly(forecastRuns || []).map((r) => ({ date: r.date, distance_km: Number(r.distance_km), duration_seconds: Number(r.duration_seconds) }));
  const out: TargetDiff[] = [];
  for (const e of races || []) {
    const km = Number(e?.distance_km);
    if (!e?.id || !ISO_DATE_RE.test(String(e.date)) || e.date < todayISO || !(km > 0)) continue;
    if (e.status && e.status !== "agendada") continue;
    const current = Number(e.target_time_seconds) > 0 ? Math.round(Number(e.target_time_seconds)) : null;
    if (e.cup_round_id && current == null) continue;
    const prediction = getRacePrediction(
      { distance_km: km, elevation_gain_m: e.race_type === "trail" ? Number(e.elevation_gain_m) || null : null, race_type: e.race_type ?? null, experience_level: e.experience_level || profileLevel } as never,
      { experience_level: profileLevel } as never,
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

export type TargetsReviewReason = { kind: "plan_accepted"; plan_id: string } | { kind: "race_after"; key: string };

/** O pedido do cliente, validado; null se não serve. */
export function parseTargetsReview(raw: unknown): { kind: "plan_accepted"; plan_id: string } | null {
  if (!raw || typeof raw !== "object") return null;
  // deno-lint-ignore no-explicit-any
  const r = raw as any;
  return r.reason === "plan_accepted" && typeof r.plan_id === "string" && UUID_RE.test(r.plan_id)
    ? { kind: "plan_accepted", plan_id: r.plan_id }
    : null;
}

/** A chave da revisão em coach_proactive_log: uma por gatilho. */
export function targetsReviewKey(reason: TargetsReviewReason): string {
  return reason.kind === "plan_accepted" ? `targets_review:${reason.plan_id}` : `targets_review:${reason.key}`.slice(0, 200);
}

/** O que a Carol recebe para escrever a proposta. */
export function buildTargetsReviewInstruction(diffs: TargetDiff[], reason: TargetsReviewReason["kind"]): string {
  const why = reason === "plan_accepted"
    ? "o atleta acabou de aceitar um plano de treino novo"
    : "o atleta acabou de correr uma prova, e o resultado dela entra nas contas";
  return `REVISÃO DOS OBJETIVOS DAS PROVAS (por iniciativa tua: ${why}). Com as mesmas corridas do ecrã, estes objetivos já não ` +
    `batem com o que o treino aponta (3% ou mais de diferença, ou sem objetivo):\n${targetDiffLines(diffs)}\n` +
    `Diz-lhe, por prova, o objetivo atual → o que propões, e porquê (${reason === "plan_accepted" ? "o plano novo" : "o resultado desta prova"} ` +
    `e a corrida de referência). Pergunta-lhe se atualizas. NÃO chames update_race_event neste turno: só muda se ele disser ` +
    `«${TARGETS_UPDATE_ANSWER}»; com «${TARGETS_KEEP_ANSWER}», fica tudo como está.`;
}

/** O turno pedido pelo cliente depois de aceitar um plano. */
export function buildTargetsReviewTurn(diffs: TargetDiff[]): string {
  return `O atleta acabou de aceitar o plano e a app pediu-te a revisão dos objetivos das provas. ` +
    buildTargetsReviewInstruction(diffs, "plan_accepted") +
    ` Uma ou duas frases por prova, sem cumprimentar como início de conversa.`;
}

/** A resposta dele é «Atualiza os objetivos»? */
export const isTargetsUpdateAnswer = (message: string): boolean =>
  message.trim().toLowerCase().replace(/[.!]+$/, "") === TARGETS_UPDATE_ANSWER.toLowerCase();

/** As provas agendadas e o nível do atleta, para as contas. Nunca rejeita. */
// deno-lint-ignore no-explicit-any
export async function fetchTargetsInputs(sb: any, userId: string, todayISO: string): Promise<{ races: RaceRow[]; level: string | null }> {
  try {
    const [{ data: races, error }, { data: profile }] = await Promise.all([
      sb.from("race_events")
        .select("id, name, date, distance_km, elevation_gain_m, race_type, experience_level, target_time_seconds, status, cup_round_id")
        .eq("user_id", userId)
        .eq("status", "agendada")
        .gte("date", todayISO)
        .order("date", { ascending: true })
        .limit(20),
      sb.from("profiles").select("experience_level").eq("id", userId).maybeSingle(),
    ]);
    if (error) throw error;
    return { races: races ?? [], level: (profile?.experience_level as string | null) ?? null };
  } catch (e) {
    console.warn("Revisão dos objetivos: provas não lidas:", e instanceof Error ? e.message : e);
    return { races: [], level: null };
  }
}

/** Houve uma revisão nas últimas 24 h (a que o «Atualiza» responde)? */
// deno-lint-ignore no-explicit-any
export async function recentTargetsReview(sb: any, userId: string, nowMs = Date.now()): Promise<boolean> {
  try {
    const { data, error } = await sb.from("coach_proactive_log")
      .select("key")
      .eq("user_id", userId)
      .like("key", "targets_review:%")
      .gte("sent_at", new Date(nowMs - TARGETS_APPLY_WINDOW_MS).toISOString())
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  } catch (e) {
    console.warn("Revisão dos objetivos: registo não lido:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** «Atualiza os objetivos»: os números da proposta, gravados prova a prova. */
export async function applyTargetDiffs(
  diffs: TargetDiff[],
  updateRace: (args: { race_id: string; target_time_seconds: number }) => Promise<string>,
): Promise<{ race_id: string; name: string; result: string }[]> {
  const out = [];
  for (const d of diffs) {
    out.push({ race_id: d.race_id, name: d.name, result: await updateRace({ race_id: d.race_id, target_time_seconds: d.proposed_s }) });
  }
  return out;
}
