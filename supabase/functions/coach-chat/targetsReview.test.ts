import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  applyTargetProposals,
  buildTargetsAppliedInstruction,
  buildTargetsNotAppliedInstruction,
  buildTargetsReviewTurn,
  computeTargetDiffs,
  isTargetsUpdateAnswer,
  latestTargetsProposals,
  parseTargetsReview,
  type TargetsInputs,
  targetsPayload,
  targetsReviewKey,
} from "./targetsReview.ts";

const TODAY = "2026-10-26";
// As corridas do Rui (o caso do #89): a Corrida do Tejo dá 50:52 para 10 km.
const RUNS = [
  { date: "2026-09-13", kind: "competicao", training_type: null, distance_km: 10.11, duration_seconds: 3088 },
  { date: "2026-10-16", kind: "treino", training_type: "continuo", distance_km: 6.04, duration_seconds: 2206 },
];
const R1 = "11111111-1111-4111-8111-111111111111";
const R2 = "22222222-2222-4222-8222-222222222222";
const race = (over: Record<string, unknown>) => ({
  id: R1, name: "Cascais Oeiras Lisboa", date: "2026-11-08", distance_km: 10, race_type: "estrada", experience_level: "basico",
  target_time_seconds: 3000, status: "agendada", cup_round_id: null, ...over,
});
const inputs = (races: Record<string, unknown>[], linked: string[] = []): TargetsInputs =>
  ({ races: races as never, level: "basico", linkedRaceIds: new Set(linked) });

Deno.test("revisão dos objetivos: a menos de 3% da previsão não há diferença (sem turno)", () => {
  // Previsão 50:52 (3052 s); 50:00 está a 1,7%.
  assertEquals(computeTargetDiffs(inputs([race({})]), RUNS, TODAY), []);
});

Deno.test("revisão dos objetivos: 3% ou mais, ou sem objetivo, é diferença — com o proposto e a referência", () => {
  const diffs = computeTargetDiffs(inputs([
    race({ id: R1, target_time_seconds: 3812 }), // 1:03:32 (o objetivo errado do #89): +25%
    race({ id: R2, name: "Corrida sem objetivo", date: "2026-11-15", target_time_seconds: null }),
    race({ id: "r3", name: "Jornada", date: "2026-11-22", target_time_seconds: null, cup_round_id: "j1" }), // jornada sem tempo
    race({ id: "r4", name: "Sem distância", date: "2026-11-29", distance_km: null }),
  ]), RUNS, TODAY);
  assertEquals(diffs.map((d) => d.race_id), [R1, R2]);
  assertEquals([diffs[0].current_s, diffs[0].proposed_s], [3812, 3050]); // 50:52 arredondado a 5 s
  assert(diffs[0].deviation! > 0.24);
  assertEquals(diffs[0].reference, { date: "2026-09-13", distance_km: 10.11, time_s: 3088 });
  const text = buildTargetsReviewTurn(diffs, "plan_accepted");
  assertStringIncludes(text, "«Cascais Oeiras Lisboa» (08/11, 10 km): 1:03:32 (6.21/km) → 50:50 (5.05/km); referência: a corrida de 13/09, 10,11 km em 51:28");
  assertStringIncludes(text, "«Corrida sem objetivo» (15/11, 10 km): sem objetivo → 50:50");
  assertStringIncludes(text, "NÃO chames update_race_event neste turno");
  assertStringIncludes(buildTargetsReviewTurn(diffs, "race_after"), "sem voltar ao balanço");
});

Deno.test("revisão dos objetivos: proteção dupla — fora a prova de hoje, a de ontem, a com corrida ligada e a do balanço", () => {
  const diffs = computeTargetDiffs(inputs([
    race({ id: "hoje", date: TODAY, target_time_seconds: 3812 }), // corrida hoje (Lisboa): fora
    race({ id: "ontem", date: "2026-10-25", target_time_seconds: 3812 }),
    race({ id: "ligada", date: "2026-11-01", target_time_seconds: 3812, status: "agendada" }), // corrida já ligada: fora, seja qual for o status
    race({ id: R2, date: "2026-11-15", target_time_seconds: 3812 }), // a do balanço que pediu a revisão
    race({ id: R1, date: "2026-11-08", target_time_seconds: 3812 }),
  ], ["ligada"]), RUNS, TODAY, new Set([R2]));
  assertEquals(diffs.map((d) => d.race_id), [R1]);
});

Deno.test("revisão dos objetivos: o pedido e a chave — uma por plano, uma por prova", () => {
  assertEquals(parseTargetsReview({ reason: "plan_accepted", plan_id: R1 }), { kind: "plan_accepted", plan_id: R1 });
  assertEquals(parseTargetsReview({ reason: "race_after", race_id: R2 }), { kind: "race_after", race_id: R2 });
  for (const bad of [null, {}, { reason: "outra", plan_id: R1 }, { reason: "plan_accepted", plan_id: "x" }, { reason: "race_after", race_id: "x" }]) {
    assertEquals(parseTargetsReview(bad), null);
  }
  assertEquals(targetsReviewKey({ kind: "plan_accepted", plan_id: R1 }), `targets_review:${R1}`);
  assertEquals(targetsReviewKey({ kind: "race_after", race_id: R2 }), `targets_review:race:${R2}`);
});

Deno.test("«Atualiza os objetivos» aplica o payload guardado, não as contas refeitas — e só em provas por correr", async () => {
  const diffs = computeTargetDiffs(inputs([race({ id: R1, target_time_seconds: 3812 })]), RUNS, TODAY);
  const payload = targetsPayload(diffs);
  assertEquals(payload, { proposals: [{ race_id: R1, proposed_s: 3050 }] });
  // Entretanto o treino mudou (as contas hoje dariam outro número): aplica-se o proposto.
  const proposals = [...payload.proposals, { race_id: R2, proposed_s: 6000 }];
  const now = inputs([
    race({ id: R1, target_time_seconds: 3812 }),
    race({ id: R2, name: "Já corrida", date: "2026-10-26", target_time_seconds: 6500 }), // corrida hoje: não se mexe
  ]);
  const calls: unknown[] = [];
  const out = await applyTargetProposals(proposals, now, TODAY, (args) => {
    calls.push(args);
    return Promise.resolve(`Prova atualizada`);
  });
  assertEquals(calls, [{ race_id: R1, target_time_seconds: 3050 }]);
  assertEquals(out.map((o) => o.name), ["Cascais Oeiras Lisboa"]);
  // Com corrida ligada, também não.
  const linked = await applyTargetProposals(payload.proposals, inputs([race({ id: R1 })], [R1]), TODAY, () => Promise.resolve("x"));
  assertEquals(linked, []);
  assertEquals([isTargetsUpdateAnswer("Atualiza os objetivos"), isTargetsUpdateAnswer("atualiza os objetivos."), isTargetsUpdateAnswer("Mantém")], [true, true, false]);
});

Deno.test("«Atualiza os objetivos»: lê a proposta da revisão das últimas 24 h; sem ela (ou sem payload), nada", async () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const sbWith = (rows: unknown[], error: unknown = null) => {
    let gte = "";
    // deno-lint-ignore no-explicit-any
    const q: any = {
      select: () => q, eq: () => q, like: () => q, order: () => q,
      gte: (_c: string, v: string) => { gte = v; return q; },
      limit: () => Promise.resolve({ data: error ? null : rows.filter((r) => (r as { sent_at: string }).sent_at >= gte), error }),
    };
    return { from: () => q };
  };
  const row = (sent_at: string, payload: unknown) => ({ key: `targets_review:${R1}`, sent_at, payload });
  assertEquals(await latestTargetsProposals(sbWith([row("2026-10-26T08:00:00.000Z", { proposals: [{ race_id: R1, proposed_s: 3050 }] })]), "u1", now), [{ race_id: R1, proposed_s: 3050 }]);
  assertEquals(await latestTargetsProposals(sbWith([row("2026-10-24T08:00:00.000Z", { proposals: [{ race_id: R1, proposed_s: 3050 }] })]), "u1", now), null);
  assertEquals(await latestTargetsProposals(sbWith([row("2026-10-26T08:00:00.000Z", null)]), "u1", now), null);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assertEquals(await latestTargetsProposals(sbWith([], { message: "rede" }), "u1", now), null);
  } finally {
    console.warn = warn;
  }
});

Deno.test("confirmação do «Atualiza»: só confirma — sem rever o plano nem propor ajustes (ponto 9)", () => {
  // O texto real do runUpdateRaceEvent traz o conselho do turno normal: sai.
  const real = 'Prova atualizada: "Cascais Oeiras Lisboa" (2026-11-08) — objetivo 50:50 (5.05/km). O plano km a km do hub e a véspera passam a usar estes valores. ' +
    "Diz ao atleta numa frase o que ficou gravado na prova. Se houver plano de treino aceite, confirma se continua a fazer sentido e propõe o ajustado se não fizer.";
  const text = buildTargetsAppliedInstruction([{ name: "Cascais Oeiras Lisboa", result: real }]);
  assertStringIncludes(text, "O servidor GRAVOU: «Cascais Oeiras Lisboa»: Prova atualizada");
  assertStringIncludes(text, "Neste turno só confirmas");
  assertStringIncludes(text, "Não revês o plano nem propões ajustes");
  assertEquals(text.includes("propõe o ajustado"), false);
});

Deno.test("confirmação do «Atualiza»: o que gravou e o que falhou à parte; nada gravado não se diz como gravado", () => {
  const mixed = buildTargetsAppliedInstruction([
    { name: "Cascais Oeiras Lisboa", result: "Prova atualizada: objetivo 50:50." },
    { name: "Meia dos Descobrimentos", result: "Erro: não encontrei nenhuma prova agendada." },
  ]);
  assertStringIncludes(mixed, "O servidor GRAVOU: «Cascais Oeiras Lisboa»");
  assertStringIncludes(mixed, "NÃO ficou gravado (diz-lho, sem inventar que mudou): «Meia dos Descobrimentos»: Erro");
  assertEquals(mixed.includes("Nada mudou"), false);
  const allFailed = buildTargetsAppliedInstruction([{ name: "Meia", result: "Erro: x" }]);
  assertEquals(allFailed.includes("GRAVOU"), false);
  assertStringIncludes(allFailed, "Nada mudou nas provas.");
});

Deno.test("«Atualiza» sem nada aplicado: ela diz porquê e não chama update_race_event", () => {
  assertStringIncludes(buildTargetsNotAppliedInstruction("no_review"), "NADA foi aplicado: não há nenhuma revisão de objetivos dele nas últimas 24 horas");
  assertStringIncludes(buildTargetsNotAppliedInstruction("nothing_eligible"), "já não podem mudar");
  assertStringIncludes(buildTargetsNotAppliedInstruction("no_review"), "Não chames update_race_event");
});

Deno.test("handler: a revisão é um turno à parte — nada no race_after; uma por gatilho; o «Atualiza» aplica o payload (ligações no código)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const gate = src.indexOf("const targetsReviewIn = message || planContinuationIn ? null : parseTargetsReview(body.targets_review);");
  assert(gate > 0 && gate < src.indexOf('return jsonResponse({ error: "Mensagem vazia" }, 400);'));
  const block = src.slice(gate, gate + 4500);
  assertStringIncludes(block, 'if (await wasProactiveDelivered(sb, userId, key)) return skipped("already_sent");');
  assertStringIncludes(block, 'if (!diffs.length) return skipped("targets_ok");');
  assertStringIncludes(block, 'const exclude = new Set(targetsReviewIn.kind === "race_after" ? [targetsReviewIn.race_id] : []);');
  assertStringIncludes(block, "const todayReviewISO = lisbonTodayISO();");
  assertStringIncludes(block, "targetsApplied = await applyTargetProposals(proposals, inputs, todayApplyISO, (args) => runUpdateRaceEvent(sb, userId, args));");
  // Com «Atualiza», sempre só leitura — e sem nada aplicado, ela diz porquê.
  assertStringIncludes(block, "const targetsUpdateAsked = !!message && isTargetsUpdateAnswer(message);");
  assertStringIncludes(block, 'if (!targetsApplied.length) targetsNotApplied = "nothing_eligible";');
  assertStringIncludes(block, 'targetsNotApplied = "no_review";');
  assertStringIncludes(src, 'else if (targetsNotApplied) finalSystemInstruction += "\\n\\n" + buildTargetsNotAppliedInstruction(targetsNotApplied);');
  assert(gate < src.indexOf("async function callGemini("));
  // O balanço da prova (race_after) não leva revisão nenhuma: nem bloco, nem chips, nem registo.
  assertEquals(src.includes('targetsReviewKey({ kind: "race_after"'), false);
  assertEquals(src.includes("buildTargetsReviewInstruction"), false);
  assertEquals(src.split("if (targetsReviewLogKey) suggestions = [TARGETS_UPDATE_ANSWER, TARGETS_KEEP_ANSWER];").length - 1, 1);
  assertEquals((src.match(/targetsReviewLogKey = /g) ?? []).length, 1); // só no turno pedido pelo cliente
  // Só leitura na revisão e na confirmação; o registo leva a proposta e vem com a mensagem gravada.
  assertStringIncludes(src, "const allowedTools = proactiveTrigger || chatImages.length || targetsReviewPrompt || targetsUpdateAsked || planResumeLaterAsked || planResumeSendStale ? new Set(READ_TOOL_NAMES) : allowedToolsFor(turnCase);");
  assert(src.indexOf('if (targetsReviewLogKey && !modelMsgErr) await recordProactiveDelivered(sb, userId, "targets_review", targetsReviewLogKey, targetsReviewPayload);') >
    src.indexOf("const { data: modelMsg, error: modelMsgErr } = await insertModelMessage("));
});
