// T1 — Planeado vs feito num treino de ginásio do plano: o que a Carol
// prescreveu por exercício (coach_plan_items.prescription) contra as séries
// gravadas (workout_session_sets), exercício a exercício.
//
// @contexto Registo unificado ligado ao plano (specs/plano-registo-plano-coach.md
// F4, decisões 1, 3, 4 e 5). Lido pela análise do treino (o comentário da
// Carol), pelo chat (buildPlanContext), pelo resumo diário e, na F5, pelas
// regras de adaptação — sempre por esta fórmula, nunca por uma cópia.
//
// Decisões:
//   · Casamento bloco ↔ exercício feito: primeiro o nome normalizado e
//     tolerante (looseExerciseKey: plural, acentos, parêntesis), depois o plan_block_index que o registo guardou
//     (exercises_meta — veio do "Usar o plano" ou da leitura dos prints). Um
//     bloco só casa com um exercício e vice-versa.
//   · O que sobra: os blocos sem par ficam "em_falta"; os exercícios sem par
//     são "extra". "Trocado" só existe quando a troca é explícita: a linha do
//     plano (com o plan_block_index) foi renomeada para outro exercício. Saltar
//     um exercício e fazer outro qualquer não é uma troca — é "em_falta" e
//     "extra" (revisão pré-deploy de 2026-10-18: um abdominal no fim não pode
//     passar por substituto do seletor de pernas). A leitura dos prints usa o
//     nome EXATO do plano quando casa (preview.ts), por isso um nome diferente
//     com o índice do plano é mesmo outro exercício.
//   · Força: cumprido = todas as séries prescritas chegaram às reps alvo. A
//     conformidade de reps conta cada série prescrita até ao alvo (séries ou
//     reps a mais não compensam as que faltam) — é a régua dos "< 80 % das
//     reps" da F5.
//   · Cardio: cada alvo dado (tempo, distância, voltas) compara-se com o
//     feito; a conformidade é a do PIOR alvo, até 1. Cumprido dentro da
//     tolerância da adesão (ADHERENCE_TOLERANCE, ±15 %). Sem alvos, basta ter
//     sido feito.
//   · Carga face à última vez (decisão 5: a Carol não prescreve kg): a série
//     mais pesada desta sessão contra a da sessão ANTERIOR mais recente com o
//     mesmo exercício. Sem histórico ou sem kg, null.
//   · O objetivo (goal) é texto. goal_met é misto (decisão 9): se o atleta o
//     confirmou (exercises_meta), vale o que ele disse; senão, um objetivo
//     mensurável (reps, minutos, km, ritmo — goalCheck.ts) julga-se pelas
//     séries gravadas, sempre fresco; o qualitativo fica null até ele confirmar.
//   · Sem prescrição (planos antigos), devolve null: quem chama cai no que já
//     fazia (prescriptionAdherence: duração e tipo).

import { foodKey } from "./foodKey.ts";
import { ADHERENCE_TOLERANCE } from "./prescriptionAdherence.ts";
import { inferGoalMet } from "./goalCheck.ts";

/** A chave tolerante de um exercício: foodKey sem o que vem entre parêntesis
 *  ("Leg Press (Machine)") e sem o plural no fim de cada palavra — "Extensões
 *  de perna" e "Extensões de pernas" são o mesmo exercício. Só para casar o
 *  plano com o feito; o Armário continua a usar foodKey (revisão pré-deploy
 *  de 2026-10-18, N6). */
export function looseExerciseKey(name: unknown): string {
  return foodKey(String(name ?? "").replace(/\([^)]*\)/g, " "))
    .split(" ")
    .map((w) => (w.length > 3 ? w.replace(/(es|s)$/, "") : w))
    .join(" ");
}

/** O mesmo exercício escrito de outra forma? Plural, acentos e a máquina entre
 *  parêntesis de UM dos lados não separam ("Leg Press (Machine)" = "Leg
 *  press"); parêntesis diferentes dos DOIS lados são variantes diferentes —
 *  "Bench Press (Barbell)" ≠ "Bench Press (Dumbbell)", "Supino (barra)" ≠
 *  "Supino (halteres)" (revisão pré-deploy, B2). */
export function sameExercise(a: unknown, b: unknown): boolean {
  const ka = foodKey(a), kb = foodKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const paren = (n: unknown) => (String(n ?? "").match(/\(([^)]*)\)/g) ?? []).map((p) => foodKey(p)).filter(Boolean).join(" ");
  const pa = paren(a), pb = paren(b);
  if (pa && pb && pa !== pb) return false;
  return looseExerciseKey(a) === looseExerciseKey(b);
}

export type BlockStatus = "cumprido" | "parcial" | "trocado" | "em_falta";
export type LoadTrend = "subiu" | "igual" | "desceu";

export interface PrescriptionBlockIn {
  type?: string | null;
  name?: string | null;
  sets?: number | null;
  reps?: number | null;
  goal?: string | null;
  duration_min?: number | null;
  distance_km?: number | null;
  laps?: number | null;
}

export interface SetIn {
  exercise_name?: string | null;
  set_index?: number | null;
  reps?: number | null;
  weight?: number | null;
  duration_seconds?: number | null;
  distance_km?: number | null;
  laps?: number | null;
}

export interface ExerciseMetaIn {
  name?: string | null;
  goal?: string | null;
  block_type?: string | null;
  plan_block_index?: number | null;
  goal_met?: boolean | null;
}

export interface HistorySession { date: string; sets: SetIn[] | null | undefined }

export interface TopSet { weight: number; reps: number | null }

export interface BlockExecution {
  index: number;
  name: string;
  type: "forca" | "cardio";
  status: BlockStatus;
  /** O exercício feito que corresponde (o substituto, se "trocado"); null se em falta. */
  doneName: string | null;
  goal: string | null;
  goalMet: boolean | null;
  /** 0..1 — séries/reps (força) ou o pior alvo (cardio). 0 se em falta. */
  compliance: number;
  // Força
  setsTarget: number | null;
  repsTarget: number | null;
  setsDone: number;
  setsFull: number;
  repsDone: number[];
  topSet: TopSet | null;
  lastTopSet: (TopSet & { date: string }) | null;
  loadDeltaKg: number | null;
  loadTrend: LoadTrend | null;
  // Cardio
  durationTargetMin: number | null;
  durationDoneMin: number | null;
  distanceTargetKm: number | null;
  distanceDoneKm: number | null;
  lapsTarget: number | null;
  lapsDone: number | null;
}

export interface PlanExecution {
  completionSource: "plano" | "auto" | null;
  /** Treino livre que riscou o item do dia (decisão 3). */
  autoLinked: boolean;
  blocks: BlockExecution[];
  extras: string[];
  counts: Record<BlockStatus, number>;
  /** Todos os blocos cumpridos e nada trocado nem em falta. */
  allDone: boolean;
  /** Reps feitas / prescritas, em todos os blocos de força (em falta contam 0). null sem força. */
  strengthRepsCompliance: number | null;
  /** O pior bloco de cardio (em falta conta 0). null sem cardio. */
  cardioCompliance: number | null;
  /** Os blocos cujo objetivo ficou por cumprir (goal_met === false). */
  goalsFailed: string[];
}

const posNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const posInt = (v: unknown): number | null => {
  const n = posNum(v);
  return n === null ? null : Math.round(n);
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Os blocos válidos da prescrição, pela ordem (índice original guardado). */
function readBlocks(prescription: unknown): Array<PrescriptionBlockIn & { index: number; key: string; kind: "forca" | "cardio"; label: string }> {
  // deno-lint-ignore no-explicit-any
  const raw = (prescription as any)?.blocks;
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const [index, b] of raw.entries()) {
    const label = typeof b?.name === "string" ? b.name.trim() : "";
    const key = foodKey(label);
    if (!key) continue;
    out.push({ ...b, index, key, label, kind: b?.type === "cardio" ? "cardio" as const : "forca" as const });
  }
  return out;
}

interface DoneExercise { name: string; key: string; sets: SetIn[]; isCardio: boolean; meta: ExerciseMetaIn | null }

/** As séries agrupadas por exercício, pela ordem em que aparecem. */
function groupDone(sets: SetIn[], meta: ExerciseMetaIn[]): DoneExercise[] {
  const metaByKey = new Map(meta.filter((m) => m?.name).map((m) => [foodKey(m.name), m]));
  const byKey = new Map<string, DoneExercise>();
  for (const s of sets) {
    const name = typeof s?.exercise_name === "string" ? s.exercise_name.trim() : "";
    const key = foodKey(name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { name, key, sets: [], isCardio: false, meta: metaByKey.get(key) ?? null });
    byKey.get(key)!.sets.push(s);
  }
  for (const ex of byKey.values()) {
    ex.sets.sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0));
    const hasLoad = ex.sets.some((s) => posNum(s.reps) !== null || posNum(s.weight) !== null);
    ex.isCardio = ex.meta?.block_type === "cardio" || (!hasLoad && ex.sets.some((s) => posNum(s.duration_seconds) || posNum(s.distance_km) || posNum(s.laps)));
  }
  return [...byKey.values()];
}

/** A série mais pesada; sem kg em nenhuma, null. */
export function topSetOf(sets: SetIn[]): TopSet | null {
  let top: TopSet | null = null;
  for (const s of sets) {
    const w = posNum(s.weight);
    if (w === null) continue;
    const r = posInt(s.reps);
    if (!top || w > top.weight || (w === top.weight && (r ?? 0) > (top.reps ?? 0))) top = { weight: w, reps: r };
  }
  return top;
}

/** A última vez ANTES desta sessão que o exercício foi feito com carga. */
function lastTopBefore(name: string, sessionDate: string, history: HistorySession[]): (TopSet & { date: string }) | null {
  const prior = history
    .filter((h) => typeof h?.date === "string" && h.date < sessionDate)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  // Primeiro o nome exato (foodKey); só sem nenhum, o mesmo exercício escrito
  // de outra forma (sameExercise) — nunca outra variante (barra vs halteres).
  const exact = foodKey(name);
  for (const match of [(n: unknown) => foodKey(n) === exact, (n: unknown) => sameExercise(n, name)]) {
    for (const h of prior) {
      const top = topSetOf((h.sets || []).filter((s) => match(s?.exercise_name)));
      if (top) return { ...top, date: h.date };
    }
  }
  return null;
}

function emptyBlock(b: { index: number; label: string; kind: "forca" | "cardio"; goal?: string | null; sets?: number | null; reps?: number | null; duration_min?: number | null; distance_km?: number | null; laps?: number | null }): BlockExecution {
  return {
    index: b.index,
    name: b.label,
    type: b.kind,
    status: "em_falta",
    doneName: null,
    goal: typeof b.goal === "string" && b.goal.trim() ? b.goal.trim() : null,
    goalMet: null,
    compliance: 0,
    setsTarget: b.kind === "forca" ? posInt(b.sets) : null,
    repsTarget: b.kind === "forca" ? posInt(b.reps) : null,
    setsDone: 0,
    setsFull: 0,
    repsDone: [],
    topSet: null,
    lastTopSet: null,
    loadDeltaKg: null,
    loadTrend: null,
    durationTargetMin: b.kind === "cardio" ? posNum(b.duration_min) : null,
    durationDoneMin: null,
    distanceTargetKm: b.kind === "cardio" ? posNum(b.distance_km) : null,
    distanceDoneKm: null,
    lapsTarget: b.kind === "cardio" ? posInt(b.laps) : null,
    lapsDone: null,
  };
}

function fillStrength(block: BlockExecution, done: DoneExercise, sessionDate: string, history: HistorySession[]) {
  const performed = done.sets.filter((s) => posNum(s.reps) !== null || posNum(s.weight) !== null);
  block.setsDone = performed.length;
  block.repsDone = performed.map((s) => posInt(s.reps) ?? 0);
  const target = block.repsTarget;
  const nSets = block.setsTarget;
  if (target && nSets) {
    // Só as primeiras N séries contam para o prescrito; cada uma até ao alvo.
    const counted = block.repsDone.slice(0, nSets);
    block.setsFull = counted.filter((r) => r >= target).length;
    block.compliance = round2(counted.reduce((t, r) => t + Math.min(r, target), 0) / (nSets * target));
  } else {
    // Prescrição sem números (não devia passar a validação): feito é feito.
    block.setsFull = performed.length;
    block.compliance = performed.length ? 1 : 0;
  }
  block.topSet = topSetOf(performed);
  block.lastTopSet = lastTopBefore(done.name, sessionDate, history);
  if (block.topSet && block.lastTopSet) {
    block.loadDeltaKg = round2(block.topSet.weight - block.lastTopSet.weight);
    block.loadTrend = block.loadDeltaKg > 0 ? "subiu" : block.loadDeltaKg < 0 ? "desceu" : "igual";
  }
}

function fillCardio(block: BlockExecution, done: DoneExercise) {
  const sum = (k: "duration_seconds" | "distance_km" | "laps") => done.sets.reduce((t, s) => t + (posNum(s[k]) ?? 0), 0);
  const secs = sum("duration_seconds"), km = sum("distance_km"), laps = sum("laps");
  block.durationDoneMin = secs ? round2(secs / 60) : null;
  block.distanceDoneKm = km ? round2(km) : null;
  block.lapsDone = laps ? Math.round(laps) : null;
  block.setsDone = done.sets.length;
  const ratios: number[] = [];
  if (block.durationTargetMin) ratios.push((block.durationDoneMin ?? 0) / block.durationTargetMin);
  if (block.distanceTargetKm) ratios.push((block.distanceDoneKm ?? 0) / block.distanceTargetKm);
  if (block.lapsTarget) ratios.push((block.lapsDone ?? 0) / block.lapsTarget);
  block.compliance = ratios.length ? round2(Math.min(1, ...ratios)) : (secs || km || laps ? 1 : 0);
}

export function computePlanExecution(input: {
  prescription: unknown;
  completionSource?: string | null;
  sessionDate: string;
  sets: SetIn[] | null | undefined;
  exercisesMeta?: ExerciseMetaIn[] | null;
  history?: HistorySession[] | null;
}): PlanExecution | null {
  const blocks = readBlocks(input.prescription);
  if (!blocks.length) return null;

  const meta = Array.isArray(input.exercisesMeta) ? input.exercisesMeta : [];
  const done = groupDone(Array.isArray(input.sets) ? input.sets : [], meta);
  const history = Array.isArray(input.history) ? input.history : [];

  const results = blocks.map(emptyBlock);
  const matchedDone = new Set<string>();
  const pair = (bi: number, ex: DoneExercise) => {
    matchedDone.add(ex.key);
    const r = results[bi];
    r.doneName = ex.name;
    r.goalMet = typeof ex.meta?.goal_met === "boolean" ? ex.meta.goal_met : null;
    if (!r.goal && ex.meta?.goal) r.goal = ex.meta.goal;
    if (r.type === "cardio") fillCardio(r, ex); else fillStrength(r, ex, input.sessionDate, history);
    // Só as séries prescritas contam para o objetivo: uma série a mais (de
    // descarga) com menos reps não deixa um bloco cumprido "por cumprir".
    if (r.goalMet === null && r.goal) {
      r.goalMet = inferGoalMet(r.goal, r.type === "forca" && r.setsTarget ? ex.sets.slice(0, r.setsTarget) : ex.sets);
    }
  };

  // 1. O nome: o exercício do plano feito tal e qual.
  for (const [bi, b] of blocks.entries()) {
    const ex = done.find((d) => !matchedDone.has(d.key) && sameExercise(d.name, b.label));
    if (ex) pair(bi, ex);
  }
  // 2. O índice que o registo guardou, para o que sobrou: a linha do plano foi
  //    renomeada — outro exercício no lugar daquele (troca explícita).
  for (const ex of done) {
    if (matchedDone.has(ex.key)) continue;
    const idx = ex.meta?.plan_block_index;
    if (typeof idx !== "number") continue;
    const bi = blocks.findIndex((b) => b.index === idx);
    if (bi < 0 || results[bi].doneName !== null) continue;
    pair(bi, ex);
    results[bi].status = "trocado";
  }

  // O estado de cada bloco casado (os "trocado" já o têm).
  for (const r of results) {
    if (r.doneName === null || r.status === "trocado") continue;
    if (r.type === "forca") {
      r.status = r.setsTarget && r.repsTarget
        ? (r.setsFull >= r.setsTarget ? "cumprido" : r.setsDone > 0 ? "parcial" : "em_falta")
        : (r.setsDone > 0 ? "cumprido" : "em_falta");
    } else {
      r.status = r.compliance >= 1 - ADHERENCE_TOLERANCE ? "cumprido" : r.compliance > 0 ? "parcial" : "em_falta";
    }
  }

  const counts: Record<BlockStatus, number> = { cumprido: 0, parcial: 0, trocado: 0, em_falta: 0 };
  for (const r of results) counts[r.status]++;

  const strength = results.filter((r) => r.type === "forca" && r.status !== "trocado");
  const repsTarget = strength.reduce((t, r) => t + (r.setsTarget && r.repsTarget ? r.setsTarget * r.repsTarget : 0), 0);
  const repsDone = strength.reduce((t, r) => t + (r.setsTarget && r.repsTarget ? r.compliance * r.setsTarget * r.repsTarget : 0), 0);
  const cardio = results.filter((r) => r.type === "cardio" && r.status !== "trocado");

  const source = input.completionSource === "plano" || input.completionSource === "auto" ? input.completionSource : null;
  return {
    completionSource: source,
    autoLinked: source === "auto",
    blocks: results,
    extras: done.filter((d) => !matchedDone.has(d.key)).map((d) => d.name),
    counts,
    allDone: counts.cumprido === results.length,
    strengthRepsCompliance: repsTarget ? round2(repsDone / repsTarget) : null,
    cardioCompliance: cardio.length ? Math.min(...cardio.map((r) => r.compliance)) : null,
    goalsFailed: results.filter((r) => r.goalMet === false).map((r) => r.name),
  };
}

// ── O texto para os prompts (análise, chat, resumo diário) ───────────────

const kg = (n: number) => `${String(round2(n)).replace(".", ",")} kg`;
const num = (n: number) => String(round2(n)).replace(".", ",");

function blockLine(r: BlockExecution): string {
  if (r.status === "em_falta") return `${r.name} — ficou de fora`;
  const swap = r.status === "trocado" ? ` (trocado por ${r.doneName})` : "";
  let what: string;
  if (r.type === "forca") {
    const planned = r.setsTarget && r.repsTarget ? `${r.setsTarget}×${r.repsTarget}` : "sem números";
    const reps = r.repsDone.length ? r.repsDone.join("/") : "0";
    const load = r.topSet ? ` a ${kg(r.topSet.weight)}` : "";
    const vsLast = r.loadDeltaKg === null ? "" : r.loadDeltaKg === 0
      ? ", a mesma carga da última vez"
      : `, ${r.loadDeltaKg > 0 ? "+" : "−"}${kg(Math.abs(r.loadDeltaKg))} face à última vez`;
    what = `planeado ${planned}, feito ${r.setsDone} série(s) de ${reps} reps${load}${vsLast}`;
  } else {
    const parts: string[] = [];
    if (r.durationTargetMin) parts.push(`${num(r.durationDoneMin ?? 0)} de ${num(r.durationTargetMin)} min`);
    if (r.distanceTargetKm) parts.push(`${num(r.distanceDoneKm ?? 0)} de ${num(r.distanceTargetKm)} km`);
    if (r.lapsTarget) parts.push(`${r.lapsDone ?? 0} de ${r.lapsTarget} voltas`);
    what = parts.length ? parts.join(", ") : "feito";
  }
  const goal = r.goal ? `; objetivo "${r.goal}"${r.goalMet === true ? " cumprido" : r.goalMet === false ? " por cumprir" : ""}` : "";
  const mark = r.status === "cumprido" ? "cumprido" : r.status === "parcial" ? "em parte" : "trocado";
  return `${r.name}${swap} — ${what}${goal} [${mark}]`;
}

/** As linhas "planeado vs feito" para um prompt, ou null sem prescrição. */
export function describePlanExecution(exec: PlanExecution | null): string | null {
  if (!exec) return null;
  const lines = exec.blocks.map((r) => `- ${blockLine(r)}`);
  if (exec.extras.length) lines.push(`- Fora do plano: ${exec.extras.join(", ")}`);
  const head = exec.autoLinked
    ? "PLANEADO VS FEITO (registado como treino livre; contou como o treino do plano desse dia):"
    : "PLANEADO VS FEITO:";
  return [head, ...lines].join("\n");
}

/** A nota curta sobre a execução, gravada no item (coach_plan_items.execution_note)
 *  e lida pelo cartão do plano, pelo chat e pelo resumo diário. Determinística:
 *  os mesmos números que a análise lê, sem o Gemini no meio. */
export function executionNote(exec: PlanExecution | null): string | null {
  if (!exec || !exec.blocks.length) return null;
  const n = exec.blocks.length;
  const parts: string[] = [];
  if (exec.autoLinked) parts.push("Treino livre, contado como o treino do plano");
  parts.push(`${exec.counts.cumprido} de ${n} exercício${n === 1 ? "" : "s"} cumprido${exec.counts.cumprido === 1 ? "" : "s"}`);
  if (exec.counts.parcial) parts.push(`${exec.counts.parcial} em parte`);
  const swapped = exec.blocks.filter((b) => b.status === "trocado").map((b) => `${b.name} → ${b.doneName}`);
  if (swapped.length) parts.push(`trocado: ${swapped.join("; ")}`);
  const missing = exec.blocks.filter((b) => b.status === "em_falta").map((b) => b.name);
  if (missing.length) parts.push(`ficou de fora: ${missing.join(", ")}`);
  if (exec.extras.length) parts.push(`fora do plano: ${exec.extras.join(", ")}`);
  if (exec.goalsFailed.length) parts.push(`objetivo por cumprir: ${exec.goalsFailed.join(", ")}`);
  return (parts.join(". ") + ".").slice(0, 400);
}

/** As linhas "o que fez dos treinos do plano" dos últimos dias, para o chat e
 *  o resumo diário: só os treinos concluídos com execution_note, do mais
 *  recente para o mais antigo. O mesmo facto que a análise do treino leu. */
export function recentExecutionLines(
  items: Array<{ planned_date?: string | null; actual_date?: string | null; kind?: string | null; status?: string | null; categories?: string[] | null; execution_note?: string | null }> | null | undefined,
  todayISO: string,
  windowDays = 7,
  max = 5,
): string[] {
  const from = new Date(Date.parse(todayISO + "T00:00:00Z") - windowDays * 86400000).toISOString().slice(0, 10);
  return (items || [])
    .filter((i) => i?.status === "concluido" && typeof i.execution_note === "string" && i.execution_note.trim())
    .map((i) => ({ date: String(i.actual_date || i.planned_date || ""), i }))
    .filter((x) => x.date >= from && x.date <= todayISO)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, max)
    .map(({ date, i }) => {
      const cats = i.categories?.length ? ` (${i.categories.join("/")})` : "";
      return `- ${date}: ${i.kind === "ginasio" ? "ginásio" : i.kind}${cats} — ${String(i.execution_note).trim()}`;
    });
}
