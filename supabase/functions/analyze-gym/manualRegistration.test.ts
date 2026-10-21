import { assertEquals } from "jsr:@std/assert@1";
import { mergeTypedWithRead, normalizeReadExercises, parseExercisesMeta, parseManualSets, recordFromSets, updateExerciseLocker } from "./manualRegistration.ts";
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
  const calls = { upserts: [] as any[], updates: [] as any[], queries: 0 };
  const sb = {
    from: (t: string) => {
      if (t === "workout_session_sets") {
        // deno-lint-ignore no-explicit-any
        const q: any = { names: [] as string[] };
        q.select = () => q; q.eq = () => q; q.gt = () => q; q.order = () => q;
        q.in = (_c: string, names: string[]) => { q.names = names; return q; };
        q.limit = () => {
          calls.queries++;
          // deno-lint-ignore no-explicit-any
          const rows = sets.filter((s: any) => q.names.includes(s.exercise_name) && s.weight > 0).sort((x: any, y: any) => y.weight - x.weight);
          return Promise.resolve({ data: rows.slice(0, 1), error: null });
        };
        return q;
      }
      return {
        select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: existing, error: null }) }) }),
        // deno-lint-ignore no-explicit-any
        upsert: (rows: any[]) => { calls.upserts.push(...rows); return Promise.resolve({ error: null }); },
        // deno-lint-ignore no-explicit-any
        update: (payload: any) => ({ eq: () => ({ eq: (_c: string, key: string) => { calls.updates.push({ key, payload }); return Promise.resolve({ error: null }); } }) }),
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

Deno.test("recordFromSets: a maior carga com um destes nomes (e as minúsculas); sem nada, null", async () => {
  const { sb, calls } = prSb([], [{ exercise_name: "supino", weight: 30 }, { exercise_name: "Remo", weight: 90 }]);
  assertEquals(await recordFromSets(sb, "u1", ["Supino"]), 30);
  assertEquals(calls.queries, 1);
  assertEquals(await recordFromSets(sb, "u1", ["Agachamento"]), null);
  assertEquals(await recordFromSets(sb, "u1", []), null);
});

Deno.test("updateExerciseLocker: um exercício apagado numa edição baixa o recorde para o das outras sessões", async () => {
  const prevPrensa = { ...PREV, name_key: "prensa", name: "Prensa", personal_record_weight: 400, last_weight: 400 };
  // Já sem as séries de 400 desta sessão; noutra sessão, 120.
  const { sb, calls } = prSb([prevPrensa], [{ exercise_name: "Prensa", weight: 120 }]);
  await updateExerciseLocker(sb, {
    userId: "u1", sessionDate: "2026-10-18", sessionCategories: ["Pernas"], sets: [{ exercise_name: "Supino", reps: 8, weight: 40 }],
    increment: false, previousNames: ["Prensa", "Supino"],
  });
  assertEquals(calls.updates, [{ key: "prensa", payload: { personal_record_weight: 120, updated_at: calls.updates[0].payload.updated_at } }]);
});

Deno.test("parseExercisesMeta: a afinação passa (limpa e limitada) só quando vem como texto", () => {
  const meta = parseExercisesMeta([
    { name: "Leg Press", machine_settings: "  banco furo 3  " },
    { name: "Supino" },
    { name: "Remo", machine_settings: "" },
    { name: "Prensa", machine_settings: 5 },
    { name: "Agachamento", machine_settings: "x".repeat(300) },
  ])!;
  assertEquals(meta[0].machine_settings, "banco furo 3");
  assertEquals("machine_settings" in meta[1], false);
  assertEquals(meta[2].machine_settings, "");
  assertEquals("machine_settings" in meta[3], false);
  assertEquals(meta[4].machine_settings?.length, 120);
});

Deno.test("bug #80: o cardio lido nos prints traz tempo e distância; séries vazias caem", () => {
  const read = normalizeReadExercises([
    { name: "Bicicleta estacionária", sets: [{ reps: null, weight: null, duration_seconds: 2700, distance_km: 15.2 }] },
    { name: "Supino", sets: [{ reps: 10, weight: 40 }, { reps: null, weight: null }] },
  ]);
  assertEquals(read.map((e) => e.name), ["Bicicleta estacionária", "Supino"]);
  assertEquals(read[0].sets, [{ reps: null, weight: null, one_rep_max_est: null, duration_seconds: 2700, distance_km: 15.2, laps: null }]);
  assertEquals(read[1].sets.length, 1);
});

Deno.test("bug #80: o único exercício de cardio sem números fica com a duração da sessão", () => {
  const vazio = [{ name: "Bicicleta estacionária", sets: [{ reps: null, weight: null }] }];
  assertEquals(normalizeReadExercises(vazio, 2700)[0].sets[0].duration_seconds, 2700);
  assertEquals(normalizeReadExercises(vazio, null), []);
  // Com mais exercícios, não se adivinha de quem é a duração.
  assertEquals(normalizeReadExercises([...vazio, { name: "Supino", sets: [{ reps: 10, weight: 40 }] }], 2700).map((e) => e.name), ["Supino"]);
  // Valores absurdos viram null (os CHECKs da tabela).
  assertEquals(normalizeReadExercises([{ name: "Remo", sets: [{ duration_seconds: 999999, distance_km: 5000 }] }]), []);
});

Deno.test("bug #80 (revisão): um tempo ou voltas que arredondam a 0 viram null (CHECK > 0)", () => {
  assertEquals(normalizeReadExercises([{ name: "Remo", sets: [{ duration_seconds: 0.3, laps: 0.4 }] }]), []);
  assertEquals(parseManualSets([{ exercise_name: "Remo", duration_seconds: 0.3, distance_km: 2 }])[0].duration_seconds, null);
});
