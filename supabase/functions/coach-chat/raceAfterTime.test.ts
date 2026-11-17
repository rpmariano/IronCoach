import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildProactiveInstruction, buildRaceOutcomeContext, parseRaceOutcome, RACE_AFTER_SUSPECT_TIME_INSTRUCTION, raceAfterDecision,
  raceAfterInstruction, raceAfterStampOf, raceOutcomeHasBalance, recordProactiveDelivered, replayRaceBalance,
} from "./index.ts";
import { raceBalanceFingerprint } from "../_shared/formulas/raceBalanceFingerprint.ts";

// O caso de 2026-11-15: um trail de 10,97 km, objetivo 56:40, previsão 53:26,
// e o tempo oficial «1:23» lido como 83 s pela app.
const BUG = {
  race_id: "r1", name: "Atlantic Cliff Adventure", date: "2026-11-15", race_type: "trail", distance_km: 10.97, category: "10k",
  official_seconds: 83, target_seconds: 3400, predicted_seconds: 3206, verdict: "superado", basis: "objetivo", vs_training: "acima",
  achievements_new: ["objetivo_batido", "prova_concluida"],
};

Deno.test("tempo impossível (app antiga): nem factos nem conquistas — a pergunta de confirmação", () => {
  const o = parseRaceOutcome(BUG)!;
  assertEquals([o.time_suspect, o.achievements_new], [true, []]);
  const ctx = buildRaceOutcomeContext(o);
  assertStringIncludes(ctx, "Tempo oficial registado: 1:23 — ERRO DE ENTRADA");
  assertStringIncludes(ctx, "A pergunta a fazer-lhe: «1:23 parece minutos — querias dizer 1:23:00?»");
  for (const fact of ["ABAIXO do objetivo", "55:17", "52:03", "Veredicto", "Conquistas"]) assertEquals(ctx.includes(fact), false, fact);
  assertEquals(raceAfterInstruction(o), RACE_AFTER_SUSPECT_TIME_INSTRUCTION);
  assertStringIncludes(buildProactiveInstruction("race_after", null, o), RACE_AFTER_SUSPECT_TIME_INSTRUCTION);
});

Deno.test("tempo impossível (app nova): vem marcado e sem veredicto — o servidor trata-o igual", () => {
  const o = parseRaceOutcome({ ...BUG, verdict: "sem_registo", basis: null, vs_training: null, achievements_new: [], time_suspect: true })!;
  assertEquals(o.time_suspect, true);
  assertEquals(raceOutcomeHasBalance(o), true);
  assertStringIncludes(buildRaceOutcomeContext(o), "querias dizer 1:23:00?");
  // Menos de metade do objetivo, mesmo sem distância: também é erro.
  assertEquals(parseRaceOutcome({ ...BUG, distance_km: null, official_seconds: 1600 })!.time_suspect, true);
  // Sem registo de verdade (sem tempo): o race_after de sempre.
  const none = parseRaceOutcome({ verdict: "sem_registo" })!;
  assertEquals([none.time_suspect, raceOutcomeHasBalance(none)], [false, false]);
});

Deno.test("corrigido para 1:23:00 em 10 km: o balanço de sempre, 26:20 acima do objetivo", () => {
  const ok = parseRaceOutcome({ ...BUG, distance_km: 10, official_seconds: 4980, verdict: "aquem", vs_training: "abaixo", achievements_new: [] })!;
  assertEquals(ok.time_suspect, false);
  const ctx = buildRaceOutcomeContext(ok);
  assertStringIncludes(ctx, "Tempo oficial: 1:23:00");
  assertStringIncludes(ctx, "26:20 ACIMA do objetivo");
  assertStringIncludes(ctx, "Veredicto: AQUÉM DO OBJETIVO.");
});

Deno.test("raceAfterDecision: um balanço por impressão digital (tempo, distância, objetivo, tipo)", () => {
  const o = parseRaceOutcome({ ...BUG, distance_km: 10, official_seconds: 4980, verdict: "aquem" })!;
  const fp = raceBalanceFingerprint(o)!;
  assertEquals(raceAfterDecision(o, null, false), "generate");
  const same = { payload: { fingerprint: fp, message_id: "m1", note: "n" } };
  assertEquals(raceAfterDecision(o, same, false), "skip");
  assertEquals(raceAfterDecision(o, same, true), "replay"); // o hub e o chat: o mesmo balanço, sem gerar outro
  for (const before of [{ official_seconds: 83 }, { distance_km: 10.97 }, { target_seconds: 3300 }, { race_type: "estrada" }]) {
    const other = { payload: { fingerprint: raceBalanceFingerprint({ ...o, ...before }), message_id: "m1", note: "n" } };
    assertEquals(raceAfterDecision(o, other, false), "redo", JSON.stringify(before));
    assertEquals(raceAfterDecision(o, other, true), "redo", JSON.stringify(before));
  }
  // Linha de antes da impressão digital: conta como a mesma.
  assertEquals(raceAfterDecision(o, { payload: null }, true), "replay");
  assertEquals(raceAfterDecision(o, { payload: null }, false), "skip");
  assertEquals(raceAfterStampOf({ fingerprint: 5, message_id: "", note: "x" }), { fingerprint: null, message_id: null, note: "x" });
});

Deno.test("replayRaceBalance: devolve o balanço guardado, marcado replayed; sem ele, gera-se", async () => {
  const sb = (balance: string | null) => ({
    from: () => {
      // deno-lint-ignore no-explicit-any
      const c: any = { select: () => c, eq: () => c, maybeSingle: () => Promise.resolve({ data: { coach_balance: balance, coach_balance_at: "2026-11-15T19:39:49Z" }, error: null }) };
      return c;
    },
  });
  const r = await replayRaceBalance(sb("Fechaste-a em 1:23:00."), "u", "r1", { fingerprint: "v1|4980|10|3400|trail", message_id: "m1", note: null });
  assertEquals([r?.replayed, r?.model_message.id, r?.model_message.content], [true, "m1", "Fechaste-a em 1:23:00."]);
  assertEquals(await replayRaceBalance(sb(null), "u", "r1", null), null);
  assertEquals(await replayRaceBalance(sb("x"), "u", null, null), null);
});

Deno.test("o handler: decide antes do Gemini, refaz substituindo, carimba com a impressão digital", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const decideAt = src.indexOf("const decision = raceAfterDecision(raceOutcome, log, raceAfterForce);");
  assert(decideAt > 0 && decideAt < src.indexOf("async function callGemini("));
  assertStringIncludes(src, `await sb.from("coach_messages").delete().eq("id", raceAfterRedo.message_id).eq("user_id", userId);`);
  assertStringIncludes(src, `await sb.from("coach_notes").delete().eq("user_id", userId).eq("note", raceAfterRedo.note);`);
  assertStringIncludes(src, "const stamp: RaceAfterStamp = { fingerprint: raceBalanceFingerprint(raceOutcome), message_id: modelMsg?.id ?? null, note: raceAfterNote };");
  assertStringIncludes(src, "await recordProactiveDelivered(sb, userId, proactiveTrigger, proactiveKey, stamp, { replace: true });");
  // Tempo impossível: sem nota para a memória dela. O coach_balance é reescrito (o mesmo update de sempre).
  assert(src.indexOf("if (!raceOutcome.time_suspect) {") < src.indexOf("raceAfterNote = raceOutcomeNote(raceOutcome);"));
  assertStringIncludes(src, ".update({ coach_balance: replyText, coach_balance_at: new Date().toISOString() })");
});

// ── B1 (revisão pré-deploy de 2026-11-15): o carimbo tem de mudar mesmo ──
// Uma tabela coach_proactive_log simulada com a RLS de produção: o upsert que
// atualiza uma linha existente só passa com a política de UPDATE.
function logTable(opts: { updatePolicy: boolean }) {
  const rows = new Map<string, Record<string, unknown>>();
  const sb = {
    from(table: string) {
      assertEquals(table, "coach_proactive_log");
      return {
        upsert(row: Record<string, unknown>, o: { onConflict: string; ignoreDuplicates: boolean }) {
          const id = `${row.user_id}|${row.key}`;
          if (!rows.has(id)) { rows.set(id, { ...row }); return Promise.resolve({ error: null }); }
          if (o.ignoreDuplicates) return Promise.resolve({ error: null }); // ON CONFLICT DO NOTHING
          if (!opts.updatePolicy) {
            return Promise.resolve({ error: { code: "42501", message: 'new row violates row-level security policy (USING expression) for table "coach_proactive_log"' } });
          }
          rows.set(id, { ...rows.get(id), ...row });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { sb, rows };
}

Deno.test("B1: com a política de UPDATE, a segunda gravação muda a impressão digital e o message_id", async () => {
  const { sb, rows } = logTable({ updatePolicy: true });
  const key = "race_after:r1:run1";
  assertEquals(await recordProactiveDelivered(sb, "u1", "race_after", key, { fingerprint: "v1|83|10.97|3400|trail", message_id: "m-old", note: "n-old" }, { replace: true }), true);
  assertEquals(await recordProactiveDelivered(sb, "u1", "race_after", key, { fingerprint: "v1|4980|10|3400|trail", message_id: "m-new", note: "n-new" }, { replace: true }), true);
  assertEquals(rows.get(`u1|${key}`)!.payload, { fingerprint: "v1|4980|10|3400|trail", message_id: "m-new", note: "n-new" });
  // E o pedido seguinte com a mesma prova já não refaz: devolve o guardado.
  const o = parseRaceOutcome({ ...BUG, distance_km: 10, official_seconds: 4980, verdict: "aquem" })!;
  assertEquals(raceAfterDecision(o, { payload: rows.get(`u1|${key}`)!.payload }, true), "replay");
});

Deno.test("B1: sem a política, o 42501 não passa por gravado — devolve false e fica no log como erro", async () => {
  const { sb, rows } = logTable({ updatePolicy: false });
  const key = "race_after:r1:run1";
  await recordProactiveDelivered(sb, "u1", "race_after", key, { fingerprint: "a", message_id: "m-old", note: null }, { replace: true });
  const errors: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    assertEquals(await recordProactiveDelivered(sb, "u1", "race_after", key, { fingerprint: "b", message_id: "m-new", note: null }, { replace: true }), false);
  } finally {
    console.error = orig;
  }
  assertEquals((rows.get(`u1|${key}`)!.payload as { fingerprint: string }).fingerprint, "a");
  assertEquals(errors.length, 1);
  assertStringIncludes(String(errors[0][0]), "sem permissão de UPDATE");
  assertStringIncludes(String(errors[0][1]), '"code":"42501"');
});

Deno.test("B1: a migration cria a política de UPDATE do dono", async () => {
  const sql = await Deno.readTextFile(new URL("../../migrations/20261115120000_coach_proactive_log_update_policy.sql", import.meta.url));
  assertStringIncludes(sql.replace(/\s+/g, " "), 'create policy "own proactive log update" on public.coach_proactive_log for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);');
});
