import { assert, assertEquals, assertObjectMatch, assertStringIncludes } from "jsr:@std/assert@1";
import { computePlanExecution } from "./planExecution.ts";
import {
  adaptationInterventionReason,
  adaptationKindOf,
  adaptationReasonText,
  adaptationSignatureOf,
  detectPlanAdaptation,
  isAdaptationIntervention,
  weekStartOf,
  type AdaptationExecution,
} from "./planAdaptation.ts";

// specs/plano-registo-plano-coach.md F5. As execuções do golden são registos
// crus (prescrição + séries), passados pelo planExecution da F4 — o mesmo
// caminho do analyze-gym. As expectativas foram escritas à mão.
const golden = JSON.parse(await Deno.readTextFile(new URL("./planAdaptation.golden.json", import.meta.url)));

// deno-lint-ignore no-explicit-any
function build(raw: any[]): AdaptationExecution[] {
  return raw.map((e) => ({
    itemId: e.itemId,
    date: e.date,
    rpe: e.rpe,
    exec: computePlanExecution({ prescription: e.prescription, sessionDate: e.date, sets: e.sets, exercisesMeta: e.exercisesMeta ?? null })!,
  }));
}

for (const { name, today, executions, expect } of golden) {
  Deno.test(`detectPlanAdaptation — ${name}`, () => {
    const r = detectPlanAdaptation({ planId: "p1", executions: build(executions), todayISO: today });
    assertEquals(r.signals.map((s) => s.kind), expect.kinds);
    if ("signature" in expect) assertEquals(r.signature, expect.signature);
    // deno-lint-ignore no-explicit-any
    if (expect.signals) assertObjectMatch(r as any, { signals: expect.signals });
  });
}

Deno.test("detectPlanAdaptation — sem execuções ou sem plano, nada", () => {
  assertEquals(detectPlanAdaptation({ planId: "p1", executions: [], todayISO: "2026-10-21" }), { signals: [], signature: null });
  assertEquals(detectPlanAdaptation({ planId: "", executions: build(golden[0].executions), todayISO: "2026-10-21" }).signature, null);
});

Deno.test("detectPlanAdaptation — a ordem das execuções não importa (ordena por data)", () => {
  const ex = build(golden[3].executions).reverse();
  assertEquals(detectPlanAdaptation({ planId: "p1", executions: ex, todayISO: "2026-10-23" }).signals.map((s) => s.kind), ["trocar"]);
});

Deno.test("weekStartOf — a segunda-feira da semana", () => {
  assertEquals(weekStartOf("2026-10-19"), "2026-10-19");
  assertEquals(weekStartOf("2026-10-25"), "2026-10-19");
  assertEquals(weekStartOf("2026-10-26"), "2026-10-26");
});

Deno.test("adaptationInterventionReason — etiqueta, assinatura legível e ≤ 500", () => {
  const a = detectPlanAdaptation({ planId: "8f0c3b1e-1111-4222-8333-944455556666", executions: build(golden[3].executions), todayISO: "2026-10-23" });
  const reason = adaptationInterventionReason(a)!;
  assert(isAdaptationIntervention(reason));
  assertEquals(adaptationSignatureOf(reason), "8f0c3b1e-1111-4222-8333-944455556666|2026-10-19");
  assertEquals(adaptationKindOf(reason), "trocar");
  assertStringIncludes(adaptationReasonText(reason), "Seletor de pernas");
  assert(!adaptationReasonText(reason).includes("ref="));
  assert(reason.length <= 500);

  const long = { signals: Array.from({ length: 40 }, (_, k) => ({ kind: "trocar" as const, exercises: [`Exercício muito comprido ${k}`], dates: ["2026-10-23"] })), signature: "p|2026-10-19" };
  const cut = adaptationInterventionReason(long)!;
  assert(cut.length <= 500);
  assertEquals(adaptationSignatureOf(cut), "p|2026-10-19");
  assertEquals(adaptationInterventionReason({ signals: [], signature: null }), null);
});

Deno.test("adaptationKindOf — o primeiro sinal; outro motivo é null", () => {
  const a = detectPlanAdaptation({ planId: "p1", executions: build(golden[0].executions), todayISO: "2026-10-21" });
  assertEquals(adaptationKindOf(adaptationInterventionReason(a)), "aliviar");
  assertEquals(adaptationKindOf("[carga] qualquer coisa"), null);
  assertEquals(adaptationSignatureOf("[carga] ref=p|2026-10-19."), null);
});
