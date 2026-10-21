// T1 — Adaptação proativa (registo unificado, F5): o desempenho nos treinos
// do plano diz que o plano já não serve, e a Carol chama o atleta para o
// ajustar com ele. Motivo `desempenho_vs_plano`.
//
// @contexto specs/plano-registo-plano-coach.md F5 e decisão 3: a Carol NUNCA
// edita um plano aceite sozinha. Isto só decide se há conversa a ter; quem a
// abre é o analyze-gym (intervenção [adaptacao] → Início → chat →
// propose_training_plan a substituir o plano → o atleta aceita ou recusa).
// Regras determinísticas, sem IA (doutrina: métricas e desvios vivem em
// fórmulas). Lê sempre o planExecution (F4), nunca uma cópia dele.
//
// Decisões:
//   · As execuções são os treinos de ginásio CONCLUÍDOS do mesmo plano, com
//     prescrição, recalculados a partir das sessões ligadas — sem coluna nova.
//     A mais recente é a que acabou de ser analisada: um sinal só nasce quando
//     ESTA sessão o completa. Padrões antigos já tiveram a sua oportunidade.
//   · "2 vezes seguidas" conta por exercício: as duas últimas vezes em que
//     esse exercício estava prescrito (dias de pernas e de peito não se
//     misturam). O exercício casa-se com sameExercise, como na F4.
//   · progredir: o exercício cumprido nas duas últimas vezes E o RPE da
//     sessão (workout_sessions.exertion) ≤ 7 nas duas. Sem RPE não se sabe
//     se foi fácil: não há progredir (o spec pede o RPE, e um "cumpri" a
//     custo não é sinal para subir).
//   · aliviar: UMA sessão basta (confirmado a 2026-10-21) — reps < 80 % do
//     prescrito OU RPE ≥ 9. As reps contam só os exercícios FEITOS (cumprido
//     ou parcial): um exercício saltado é assunto do "trocar", e somá-lo como
//     0 reps fazia de qualquer exercício saltado um pedido para aliviar.
//   · trocar: o exercício ficou de fora ou foi substituído nas duas últimas
//     vezes.
//   · cardio abaixo do alvo: o bloco de cardio feito mas "parcial" (abaixo da
//     tolerância da adesão, ±15 %) nas duas últimas vezes. Saltado é "trocar".
//   · objetivo falhado: goal_met === false nas duas últimas vezes (o
//     qualitativo por confirmar, null, não conta).
//   · No máximo uma adaptação por plano e por semana (segunda a domingo). A
//     assinatura é o plano e a semana: vai no motivo da intervenção
//     ([adaptacao] ref=…), e o analyze-gym procura-a em coach_interventions
//     antes de abrir outra — como a do planDivergence, que leva o plano e o
//     motivo e muda quando eles mudam.
//
// Os limiares são os do spec. NÃO foram afinados com dados reais: a
// 2026-10-21 havia 0 itens de ginásio com prescrição em produção. A query de
// afinação está no spec (§6, decisão 18); o push fica desligado até lá
// (PLAN_ADAPTATION_PUSH_ENABLED, proactiveTriggers.ts).

import { sameExercise, type PlanExecution } from "./planExecution.ts";

export const ADAPTATION_INTERVENTION_TAG = "[adaptacao]";
export const ADAPTATION_MOTIVE = "desempenho_vs_plano";

/** RPE máximo de uma sessão "folgada" para subir a progressão. */
export const PROGRESS_MAX_RPE = 7;
/** RPE a partir do qual a sessão foi no limite. */
export const RELIEF_MIN_RPE = 9;
/** Abaixo desta fração das reps prescritas (nos exercícios feitos), aliviar. */
export const RELIEF_REPS_COMPLIANCE = 0.8;
/** Quantas vezes seguidas o mesmo padrão tem de aparecer. */
export const REPEAT_TIMES = 2;

export type AdaptationKind = "aliviar" | "trocar" | "cardio_abaixo" | "objetivo_falhado" | "progredir";

export interface AdaptationExecution {
  /** coach_plan_items.id */
  itemId: string;
  /** O dia em que foi feito (YYYY-MM-DD). */
  date: string;
  /** workout_sessions.exertion (1-10), ou null. */
  rpe: number | null;
  exec: PlanExecution;
}

export interface AdaptationSignal {
  kind: AdaptationKind;
  /** Os exercícios a que se refere (vazio no "aliviar" da sessão toda). */
  exercises: string[];
  /** As datas das execuções que o provam. */
  dates: string[];
  /** Para o "aliviar": as reps feitas face às prescritas e o RPE. */
  repsCompliance?: number | null;
  rpe?: number | null;
}

export interface PlanAdaptation {
  signals: AdaptationSignal[];
  /** `planId|segunda-feira da semana` — null sem sinais. */
  signature: string | null;
}

/** A ordem em que se dizem: primeiro o que protege o atleta. */
const ORDER: AdaptationKind[] = ["aliviar", "trocar", "cardio_abaixo", "objetivo_falhado", "progredir"];

const validRpe = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A segunda-feira da semana de um dia (YYYY-MM-DD), em UTC. */
export function weekStartOf(dateISO: string): string {
  const d = new Date(`${dateISO.slice(0, 10)}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}

export function adaptationSignature(planId: string, todayISO: string): string {
  return `${planId}|${weekStartOf(todayISO)}`;
}

/** As reps feitas / prescritas, só nos exercícios de força feitos. null sem nenhum. */
export function doneRepsCompliance(exec: PlanExecution): number | null {
  let target = 0, done = 0;
  for (const b of exec.blocks) {
    if (b.type !== "forca" || (b.status !== "cumprido" && b.status !== "parcial")) continue;
    if (!b.setsTarget || !b.repsTarget) continue;
    target += b.setsTarget * b.repsTarget;
    done += b.compliance * b.setsTarget * b.repsTarget;
  }
  return target ? round2(done / target) : null;
}

export function detectPlanAdaptation(input: {
  planId: string;
  executions: AdaptationExecution[] | null | undefined;
  todayISO: string;
}): PlanAdaptation {
  const runs = (input.executions || [])
    .filter((e) => e && e.exec && typeof e.date === "string")
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!runs.length || !input.planId) return { signals: [], signature: null };

  const latest = runs[runs.length - 1];
  const signals: AdaptationSignal[] = [];

  // aliviar — só a sessão de agora.
  const reps = doneRepsCompliance(latest.exec);
  const rpe = validRpe(latest.rpe);
  if ((reps !== null && reps < RELIEF_REPS_COMPLIANCE) || (rpe !== null && rpe >= RELIEF_MIN_RPE)) {
    signals.push({ kind: "aliviar", exercises: [], dates: [latest.date], repsCompliance: reps, rpe });
  }

  // Por exercício da sessão de agora: as suas últimas REPEAT_TIMES vezes.
  const byKind = new Map<AdaptationKind, { exercises: string[]; dates: Set<string> }>();
  const add = (kind: AdaptationKind, name: string, dates: string[]) => {
    if (!byKind.has(kind)) byKind.set(kind, { exercises: [], dates: new Set() });
    const g = byKind.get(kind)!;
    if (!g.exercises.includes(name)) g.exercises.push(name);
    dates.forEach((d) => g.dates.add(d));
  };
  for (const block of latest.exec.blocks) {
    const times = runs
      .map((r) => ({ r, b: r.exec.blocks.find((x) => sameExercise(x.name, block.name)) }))
      .filter((x): x is { r: AdaptationExecution; b: typeof block } => !!x.b)
      .slice(-REPEAT_TIMES);
    if (times.length < REPEAT_TIMES || times[times.length - 1].r !== latest) continue;
    const dates = times.map((t) => t.r.date);
    const all = (p: (t: { r: AdaptationExecution; b: typeof block }) => boolean) => times.every(p);

    if (all((t) => t.b.status === "em_falta" || t.b.status === "trocado")) add("trocar", block.name, dates);
    else if (block.type === "cardio" && all((t) => t.b.status === "parcial")) add("cardio_abaixo", block.name, dates);
    if (all((t) => t.b.goalMet === false)) add("objetivo_falhado", block.name, dates);
    if (block.type === "forca" && all((t) => {
      const r = validRpe(t.r.rpe);
      return t.b.status === "cumprido" && r !== null && r <= PROGRESS_MAX_RPE;
    })) add("progredir", block.name, dates);
  }
  // Aliviar e progredir na mesma sessão contradizem-se: quem está no limite não sobe.
  if (signals.length) byKind.delete("progredir");
  for (const [kind, g] of byKind) signals.push({ kind, exercises: g.exercises, dates: [...g.dates].sort() });

  signals.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return { signals, signature: signals.length ? adaptationSignature(input.planId, input.todayISO) : null };
}

// ── O motivo da intervenção ──────────────────────────────────────────────

const pct = (n: number) => `${Math.round(n * 100)} %`;
const juntar = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

/** Uma frase por sinal, para a Carol (o motivo é escrito para ela). */
export function adaptationSignalLine(s: AdaptationSignal): string {
  const ex = juntar(s.exercises);
  switch (s.kind) {
    case "aliviar": {
      const parts: string[] = [];
      if (s.repsCompliance != null && s.repsCompliance < RELIEF_REPS_COMPLIANCE) parts.push(`fez ${pct(s.repsCompliance)} das reps prescritas`);
      if (s.rpe != null && s.rpe >= RELIEF_MIN_RPE) parts.push(`RPE ${s.rpe}`);
      return `aliviar: no treino de ${s.dates[0]} ${parts.join(", com ")}`;
    }
    case "trocar": return `trocar: ${ex} ficou de fora ou foi substituído ${REPEAT_TIMES} vezes seguidas`;
    case "cardio_abaixo": return `cardio abaixo do alvo: ${ex}, ${REPEAT_TIMES} vezes seguidas`;
    case "objetivo_falhado": return `objetivo por cumprir: ${ex}, ${REPEAT_TIMES} vezes seguidas`;
    case "progredir": return `progredir: ${ex} cumprido ${REPEAT_TIMES} vezes seguidas com RPE ≤ ${PROGRESS_MAX_RPE}`;
  }
}

/** O motivo gravado em profiles.coach_intervention_reason (≤ 500 na BD). A
 *  assinatura vai logo a seguir à etiqueta, para nunca ser cortada. */
export function adaptationInterventionReason(a: PlanAdaptation): string | null {
  if (!a.signature || !a.signals.length) return null;
  const head = `${ADAPTATION_INTERVENTION_TAG} ref=${a.signature}. ${ADAPTATION_MOTIVE}: `;
  const tail = ". Propõe a adaptação do plano em conjunto; nunca o alteres sem ele aceitar.";
  let body = a.signals.map(adaptationSignalLine).join("; ");
  const room = 480 - head.length - tail.length;
  if (body.length > room) body = body.slice(0, room - 1).trimEnd() + "…";
  return head + body + tail;
}

export function isAdaptationIntervention(reason: string | null | undefined): boolean {
  return typeof reason === "string" && reason.startsWith(ADAPTATION_INTERVENTION_TAG);
}

/** A assinatura que um motivo [adaptacao] traz, ou null. */
export function adaptationSignatureOf(reason: string | null | undefined): string | null {
  if (!isAdaptationIntervention(reason)) return null;
  const m = /ref=([^\s.]+\|\d{4}-\d{2}-\d{2})/.exec(reason as string);
  return m ? m[1] : null;
}

/** O motivo sem a etiqueta nem a referência — o que a Carol lê. */
export function adaptationReasonText(reason: string | null | undefined): string {
  return String(reason ?? "").replace(ADAPTATION_INTERVENTION_TAG, "").replace(/^\s*ref=\S+\.\s*/, "").trim();
}

/** O sinal principal de um motivo, para o Início e o push dizerem do que se trata. */
export function adaptationKindOf(reason: string | null | undefined): AdaptationKind | null {
  if (!isAdaptationIntervention(reason)) return null;
  const text = adaptationReasonText(reason);
  const first = text.replace(`${ADAPTATION_MOTIVE}: `, "").split(":")[0].trim();
  const map: Record<string, AdaptationKind> = {
    "aliviar": "aliviar", "trocar": "trocar", "cardio abaixo do alvo": "cardio_abaixo",
    "objetivo por cumprir": "objetivo_falhado", "progredir": "progredir",
  };
  return map[first] ?? null;
}
