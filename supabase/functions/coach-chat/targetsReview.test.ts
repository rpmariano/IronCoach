import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  applyTargetDiffs,
  buildTargetsReviewInstruction,
  buildTargetsReviewTurn,
  computeTargetDiffs,
  isTargetsUpdateAnswer,
  parseTargetsReview,
  recentTargetsReview,
  targetsReviewKey,
} from "./targetsReview.ts";

const TODAY = "2026-10-26";
// As corridas do Rui (o caso do #89): a Corrida do Tejo dá 50:52 para 10 km.
const RUNS = [
  { date: "2026-09-13", kind: "competicao", training_type: null, distance_km: 10.11, duration_seconds: 3088 },
  { date: "2026-10-16", kind: "treino", training_type: "continuo", distance_km: 6.04, duration_seconds: 2206 },
];
const race = (over: Record<string, unknown>) => ({
  id: "r1", name: "Cascais Oeiras Lisboa", date: "2026-11-08", distance_km: 10, race_type: "estrada", experience_level: "basico",
  target_time_seconds: 3000, status: "agendada", cup_round_id: null, ...over,
});

Deno.test("revisão dos objetivos: a menos de 3% da previsão não há diferença (sem turno)", () => {
  // Previsão 50:52 (3052 s); 50:00 está a 1,7%.
  assertEquals(computeTargetDiffs([race({})], "basico", RUNS, TODAY), []);
});

Deno.test("revisão dos objetivos: 3% ou mais, ou sem objetivo, é diferença — com o proposto e a referência", () => {
  const diffs = computeTargetDiffs([
    race({ id: "r1", target_time_seconds: 3812 }), // 1:03:32 (o objetivo errado do #89): +25%
    race({ id: "r2", name: "Corrida sem objetivo", date: "2026-11-15", target_time_seconds: null }),
    race({ id: "r3", name: "Jornada", date: "2026-11-22", target_time_seconds: null, cup_round_id: "j1" }), // jornada sem tempo: fica de fora
    race({ id: "r4", name: "Sem distância", date: "2026-11-29", distance_km: null }),
    race({ id: "r5", name: "Já passou", date: "2026-10-20" }),
  ], "basico", RUNS, TODAY);
  assertEquals(diffs.map((d) => d.race_id), ["r1", "r2"]);
  assertEquals([diffs[0].current_s, diffs[0].proposed_s], [3812, 3050]); // 50:52 arredondado a 5 s
  assert(diffs[0].deviation! > 0.24);
  assertEquals(diffs[0].reference, { date: "2026-09-13", distance_km: 10.11, time_s: 3088 });
  assertEquals(diffs[1].current_s, null);
  const text = buildTargetsReviewInstruction(diffs, "plan_accepted");
  assertStringIncludes(text, "«Cascais Oeiras Lisboa» (08/11, 10 km): 1:03:32 (6.21/km) → 50:50 (5.05/km); referência: a corrida de 13/09, 10,11 km em 51:28");
  assertStringIncludes(text, "«Corrida sem objetivo» (15/11, 10 km): sem objetivo → 50:50");
  assertStringIncludes(text, "NÃO chames update_race_event neste turno");
  assertStringIncludes(buildTargetsReviewTurn(diffs), "acabou de aceitar o plano");
});

Deno.test("revisão dos objetivos: «Atualiza os objetivos» grava os números da proposta com update_race_event", async () => {
  const diffs = computeTargetDiffs([race({ target_time_seconds: 3812 })], "basico", RUNS, TODAY);
  const calls: unknown[] = [];
  const out = await applyTargetDiffs(diffs, (args) => {
    calls.push(args);
    return Promise.resolve(`Prova atualizada: "${diffs[0].name}"`);
  });
  assertEquals(calls, [{ race_id: "r1", target_time_seconds: 3050 }]);
  assertEquals(out[0].result.startsWith("Prova atualizada"), true);
  assertEquals([isTargetsUpdateAnswer("Atualiza os objetivos"), isTargetsUpdateAnswer("atualiza os objetivos."), isTargetsUpdateAnswer("Mantém")], [true, true, false]);
});

Deno.test("revisão dos objetivos: o pedido e a chave — uma por plano", () => {
  const id = "0b7c3f5e-1a2b-4c3d-8e9f-001122334455";
  assertEquals(parseTargetsReview({ reason: "plan_accepted", plan_id: id }), { kind: "plan_accepted", plan_id: id });
  for (const bad of [null, {}, { reason: "outra", plan_id: id }, { reason: "plan_accepted", plan_id: "x" }]) assertEquals(parseTargetsReview(bad), null);
  assertEquals(targetsReviewKey({ kind: "plan_accepted", plan_id: id }), `targets_review:${id}`);
  assertEquals(targetsReviewKey({ kind: "race_after", key: "race_after:r9" }), "targets_review:race_after:r9");
});

Deno.test("revisão dos objetivos: o «Atualiza» só vale com uma revisão nas últimas 24 h; uma falha a ler não aplica nada", async () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const sbWith = (rows: unknown[], error: unknown = null) => {
    let gte = "";
    // deno-lint-ignore no-explicit-any
    const q: any = {
      select: () => q, eq: () => q, like: () => q,
      gte: (_c: string, v: string) => { gte = v; return q; },
      limit: () => Promise.resolve({ data: error ? null : rows.filter((r) => (r as { sent_at: string }).sent_at >= gte), error }),
    };
    return { from: () => q };
  };
  assertEquals(await recentTargetsReview(sbWith([{ key: "targets_review:x", sent_at: "2026-10-26T08:00:00.000Z" }]), "u1", now), true);
  assertEquals(await recentTargetsReview(sbWith([{ key: "targets_review:x", sent_at: "2026-10-24T08:00:00.000Z" }]), "u1", now), false);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assertEquals(await recentTargetsReview(sbWith([], { message: "rede" }), "u1", now), false);
  } finally {
    console.warn = warn;
  }
});

Deno.test("handler: a revisão — sem diferenças não há turno, uma por gatilho, só leitura no turno, e o «Atualiza» aplica (ligações no código)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const gate = src.indexOf("const targetsReviewIn = message || planContinuationIn ? null : parseTargetsReview(body.targets_review);");
  assert(gate > 0 && gate < src.indexOf('return jsonResponse({ error: "Mensagem vazia" }, 400);'));
  const block = src.slice(gate, gate + 1500);
  // O mesmo gatilho duas vezes dá um só turno; sem diferenças, nem turno nem Gemini.
  assertStringIncludes(block, 'if (await wasProactiveDelivered(sb, userId, key)) return skipped("already_sent");');
  assertStringIncludes(block, 'if (!diffs.length) return skipped("targets_ok");');
  assert(gate < src.indexOf("async function callGemini("));
  // No turno da revisão, só ferramentas de leitura: não muda nada.
  assertStringIncludes(src, "const allowedTools = proactiveTrigger || chatImages.length || targetsReviewPrompt ? new Set(READ_TOOL_NAMES) : allowedToolsFor(turnCase);");
  assertStringIncludes(src, "const planCheckinPrompt = targetsReviewPrompt ? targetsReviewPrompt :");
  // Registada quando a mensagem fica gravada.
  assert(src.indexOf('if (targetsReviewLogKey && !modelMsgErr) await recordProactiveDelivered(sb, userId, "targets_review", targetsReviewLogKey);') >
    src.indexOf("const { data: modelMsg, error: modelMsgErr } = await insertModelMessage("));
  // O «Atualiza os objetivos» aplica com update_race_event.
  assertStringIncludes(src, "if (message && isTargetsUpdateAnswer(message) && await recentTargetsReview(sb, userId)) {");
  assertStringIncludes(src, "targetsApplied = await applyTargetDiffs(diffs, (args) => runUpdateRaceEvent(sb, userId, args));");
  // O balanço da prova inclui a revisão.
  assertStringIncludes(src, 'if (proactiveTrigger === "race_after" && proactiveKey) {');
  assertStringIncludes(src, 'targetsReviewLogKey = targetsReviewKey({ kind: "race_after", key: proactiveKey });');
});
