import { assertEquals } from "jsr:@std/assert@1";
import { mergeTypedWithRead, parseExercisesMeta, parseManualSets, recordFromSets, updateExerciseLocker } from "./manualRegistration.ts";
import { formatExerciseLines } from "./index.ts";

Deno.test("parseManualSets: força e cardio; nulos ficam nulos e linhas vazias caem", () => {
  const rows = parseManualSets([
    { exercise_name: " Prensa ", set_index: 0, reps: 10, weight: 80 },
    { exercise_name: "Bicicleta", set_index: 0, reps: null, weight: null, duration_seconds: 1200, distance_km: 8 },
    { exercise_name: "Piscina", duration_seconds: 0, laps: 20.4 },
    { exercise_name: "Remo", reps: null, weight: null },
    { exercise_name: "", reps: 5, weight: 5 },
  ]);
  assertEquals(rows.map((r) => r.exercise_name), ["Prensa", "Bicicleta", "Piscina"]);
  assertEquals([rows[0].reps, rows[0].weight, rows[0].duration_seconds], [10, 80, null]);
  assertEquals([rows[1].duration_seconds, rows[1].distance_km, rows[1].reps], [1200, 8, null]);
  assertEquals([rows[2].duration_seconds, rows[2].laps, rows[2].set_index], [null, 20, 2]);
});

Deno.test("parseManualSets: não é lista → []", () => {
  assertEquals(parseManualSets(undefined), []);
  assertEquals(parseManualSets("x"), []);
});

Deno.test("parseExercisesMeta: valida, deduplica por chave e limpa índices", () => {
  const meta = parseExercisesMeta([
    { name: "Extensões de pernas", goal: " chegar às 12 ", block_type: "forca", plan_block_index: 1, goal_met: true },
    { name: "extensoes de pernas", goal: "repetido" },
    { name: "Bicicleta", block_type: "cardio", plan_block_index: -1 },
    { name: "" },
  ]);
  assertEquals(meta, [
    { name: "Extensões de pernas", goal: "chegar às 12", block_type: "forca", plan_block_index: 1, goal_met: true },
    { name: "Bicicleta", goal: null, block_type: "cardio", plan_block_index: null, goal_met: null },
  ]);
  assertEquals(parseExercisesMeta([]), null);
  assertEquals(parseExercisesMeta(null), null);
});

Deno.test("formatExerciseLines: cardio em tempo/km/voltas, força como antes", () => {
  const lines = formatExerciseLines([
    { exercise_name: "Bicicleta", set_index: 0, reps: null, weight: null, duration_seconds: 1200, distance_km: 8 },
    { exercise_name: "Prensa", set_index: 0, reps: 10, weight: 80 },
  ]);
  assertEquals(lines, ["Bicicleta — 20 min, 8 km", "Prensa — 1 série de 10 reps a 80 kg"]);
});

// deno-lint-ignore no-explicit-any
function lockerSb(existing: any[], opts: { readErr?: any; upErr?: any } = {}) {
  // deno-lint-ignore no-explicit-any
  const calls = { upserts: [] as any[], onConflict: "" };
  const sb = {
    from: (_t: string) => ({
      select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: existing, error: opts.readErr ?? null }) }) }),
      // deno-lint-ignore no-explicit-any
      upsert: (rows: any[], o: { onConflict: string }) => {
        calls.upserts.push(...rows);
        calls.onConflict = o.onConflict;
        return Promise.resolve({ error: opts.upErr ?? null });
      },
    }),
  };
  return { sb, calls };
}

Deno.test("updateExerciseLocker: faz upsert por user_id,name_key", async () => {
  const { sb, calls } = lockerSb([]);
  await updateExerciseLocker(sb, { userId: "u1", sessionDate: "2026-10-18", sessionCategories: ["Peito"], sets: [{ exercise_name: "Supino", reps: 8, weight: 60 }], increment: true });
  assertEquals(calls.onConflict, "user_id,name_key");
  assertEquals(calls.upserts.length, 1);
  assertEquals(calls.upserts[0].name_key, "supino");
});

Deno.test("updateExerciseLocker: um erro não rebenta (o registo segue)", async () => {
  const { sb, calls } = lockerSb([], { readErr: { message: "rede" } });
  await updateExerciseLocker(sb, { userId: "u1", sessionDate: "2026-10-18", sessionCategories: [], sets: [{ exercise_name: "Supino", reps: 8, weight: 60 }], increment: true });
  assertEquals(calls.upserts.length, 0);
});

Deno.test("mergeTypedWithRead: o escrito ganha no mesmo exercício; os só lidos acrescentam-se", () => {
  const typed = [{ exercise_name: "Prancha", set_index: 0, reps: 1 }, { exercise_name: "supino", set_index: 0, reps: 8 }];
  const read = [
    { exercise_name: "Supino", set_index: 0, reps: 10 },
    { exercise_name: "Supino", set_index: 1, reps: 10 },
    { exercise_name: "Remada", set_index: 0, reps: 12 },
  ];
  assertEquals(mergeTypedWithRead(typed, read).map((r) => `${r.exercise_name}:${r.reps}`), ["Prancha:1", "supino:8", "Remada:12"]);
  assertEquals(mergeTypedWithRead([], read).length, 3);
});

// deno-lint-ignore no-explicit-any
function prSb(existing: any[], sets: any[]) {
  // deno-lint-ignore no-explicit-any
  const calls = { upserts: [] as any[] };
  const sb = {
    from: (t: string) => {
      if (t === "workout_session_sets") {
        const q = { select: () => q, eq: () => q, gt: (_c: string, v: number) => { q._gt = v; return q; }, order: () => q,
          // deno-lint-ignore no-explicit-any
          limit: () => Promise.resolve({ data: sets.filter((s: any) => s.weight > q._gt).sort((a: any, b: any) => b.weight - a.weight), error: null }),
          _gt: 0 };
        return q;
      }
      return {
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: existing, error: null }) }) }),
        // deno-lint-ignore no-explicit-any
        upsert: (rows: any[]) => { calls.upserts.push(...rows); return Promise.resolve({ error: null }); },
      };
    },
  };
  return { sb, calls };
}

const PREV = { name_key: "supino", name: "Supino", category: "Peito", block_type: "forca", cardio_fields: null, machine_settings: null,
  last_weight: 400, last_reps: 8, personal_record_weight: 400, times_performed: 3, last_performed_at: "2026-10-18T12:00:00.000Z" };

Deno.test("updateExerciseLocker: corrigir 400 kg para 40 numa edição baixa o recorde para o que as séries dizem", async () => {
  // As séries gravadas já são as corrigidas; noutra sessão, 60 kg.
  const { sb, calls } = prSb([PREV], [{ exercise_name: "Supino", weight: 40 }, { exercise_name: "supino", weight: 60 }, { exercise_name: "Remo", weight: 90 }]);
  await updateExerciseLocker(sb, { userId: "u1", sessionDate: "2026-10-18", sessionCategories: ["Peito"], sets: [{ exercise_name: "Supino", reps: 8, weight: 40 }], increment: false });
  assertEquals(calls.upserts[0].personal_record_weight, 60);
  assertEquals(calls.upserts[0].last_weight, 40);
  assertEquals(calls.upserts[0].times_performed, 3);
});

Deno.test("updateExerciseLocker: num registo novo o recorde nunca desce nem se recalcula", async () => {
  const { sb, calls } = prSb([PREV], []);
  await updateExerciseLocker(sb, { userId: "u1", sessionDate: "2026-10-19", sessionCategories: ["Peito"], sets: [{ exercise_name: "Supino", reps: 8, weight: 40 }], increment: true });
  assertEquals(calls.upserts[0].personal_record_weight, 400);
});

Deno.test("recordFromSets: sem séries mais pesadas fica o da sessão; 0 é null", async () => {
  const { sb } = prSb([], [{ exercise_name: "Supino", weight: 30 }]);
  assertEquals(await recordFromSets(sb, "u1", "supino", 40), 40);
  assertEquals(await recordFromSets(sb, "u1", "supino", 0), 30);
  assertEquals(await recordFromSets(prSb([], []).sb, "u1", "supino", 0), null);
});
