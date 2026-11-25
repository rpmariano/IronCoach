import { assertEquals } from "jsr:@std/assert@1";
import {
  FEATURE_FLAG_DEFAULTS, FEATURE_FLAG_KEYS, FEATURE_FLAGS_CACHE_MS, getFeatureFlags, memoryFlagOpts, mergeFeatureFlags, resetFeatureFlagsCache,
} from "./featureFlags.ts";

const db = (result: { data?: unknown; error?: unknown } | Error, calls: { n: number } = { n: 0 }) => ({
  from: (t: string) => {
    assertEquals(t, "app_feature_flags");
    return {
      select: () => {
        calls.n++;
        if (result instanceof Error) throw result;
        return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
      },
    };
  },
});

Deno.test("os defeitos são o estado do lançamento (v1 lite) — os mesmos da migration", async () => {
  assertEquals(FEATURE_FLAG_DEFAULTS, {
    cup: false, race_memories: false, badges: false, water: false, pantry_advanced: false, advanced_charts: false, tutorial: false,
    shoes: true, load_profile_choice: true,
  });
  const sql = await Deno.readTextFile(new URL("../../migrations/20261122193722_app_feature_flags.sql", import.meta.url));
  for (const k of FEATURE_FLAG_KEYS) assertEquals(sql.includes(`('${k}', ${FEATURE_FLAG_DEFAULTS[k]})`), true, k);
});

Deno.test("mergeFeatureFlags: só chaves conhecidas e booleanos, sobre os defeitos", () => {
  const f = mergeFeatureFlags([
    { key: "cup", enabled: true }, { key: "shoes", enabled: false }, { key: "inventada", enabled: true },
    { key: "water", enabled: "sim" }, null, "lixo",
  ]);
  assertEquals([f.cup, f.shoes, f.water, "inventada" in f], [true, false, false, false]);
  assertEquals(mergeFeatureFlags(null), FEATURE_FLAG_DEFAULTS);
});

Deno.test("getFeatureFlags: lê, guarda 60 s, e numa falha nunca liga tudo", async () => {
  resetFeatureFlagsCache();
  const calls = { n: 0 };
  const on = db({ data: FEATURE_FLAG_KEYS.map((key) => ({ key, enabled: true })) }, calls);
  const t0 = Date.parse("2026-11-22T10:00:00Z");
  assertEquals((await getFeatureFlags({ db: on, nowMs: t0 })).cup, true);
  await getFeatureFlags({ db: on, nowMs: t0 + 30_000 });
  assertEquals(calls.n, 1); // da cache
  await getFeatureFlags({ db: on, nowMs: t0 + FEATURE_FLAGS_CACHE_MS + 1 });
  assertEquals(calls.n, 2); // expirou
  // Uma falha depois de uma leitura boa: a última boa desta instância.
  assertEquals((await getFeatureFlags({ db: db({ error: { message: "x" } }), nowMs: t0 + 3 * FEATURE_FLAGS_CACHE_MS })).cup, true);
  // Sem nenhuma leitura boa (a tabela não existe): os defeitos — a Taça desligada.
  resetFeatureFlagsCache();
  assertEquals(await getFeatureFlags({ db: db({ error: { message: "relation does not exist" } }), nowMs: t0 }), FEATURE_FLAG_DEFAULTS);
  resetFeatureFlagsCache();
  assertEquals(await getFeatureFlags({ db: db(new Error("rede")), nowMs: t0 }), FEATURE_FLAG_DEFAULTS);
  resetFeatureFlagsCache();
});

Deno.test("v1 lite: as analyze-* não levam a vitrina com os badges desligados; o diploma desliga-se com as memórias", async () => {
  for (const f of ["analyze-run", "analyze-meal", "analyze-gym", "analyze-body"]) {
    const src = await Deno.readTextFile(new URL(`../${f}/index.ts`, import.meta.url));
    assertEquals(src.includes("memoryFlagOpts(await getFeatureFlags())"), true, f);
  }
  const run = await Deno.readTextFile(new URL("../analyze-run/index.ts", import.meta.url));
  assertEquals(run.includes("const seriesPromise = (await getFeatureFlags()).cup"), true);
  // O diploma lê-se sempre, mesmo com as memórias desligadas: preenche o resultado da prova (tempo
  // oficial, posição, dorsal, escalão) — é núcleo. A memória (guardar o diploma, a legenda) é da app.
  const diploma = await Deno.readTextFile(new URL("../analyze-diploma/index.ts", import.meta.url));
  assertEquals(diploma.includes("race_memories") || diploma.includes("getFeatureFlags"), false);
  const tick = await Deno.readTextFile(new URL("../coach-proactive-tick/index.ts", import.meta.url));
  assertEquals(tick.includes("lastWaterDate: flags.water ? (lastWater?.date ?? null) : null,"), true);
  assertEquals(tick.includes("vitrina: flags.badges ? vitrina : null,"), true);
  const chat = await Deno.readTextFile(new URL("../coach-chat/index.ts", import.meta.url));
  assertEquals(chat.includes("const captionOutcome = withoutOffAchievements(parseRaceOutcome(body.race_outcome), flags);"), true);
  assertEquals(chat.includes("water_reminder_enabled: flags.water ?"), true);
  assertEquals(chat.includes("waterGoalMl:   flags.water ?"), true);
});

Deno.test("memoryFlagOpts: a vitrina com os badges e a nota das áreas desligadas", () => {
  assertEquals(memoryFlagOpts(FEATURE_FLAG_DEFAULTS).vitrina, false);
  assertEquals(typeof memoryFlagOpts(FEATURE_FLAG_DEFAULTS).offNote, "string");
  const allOn = Object.fromEntries(FEATURE_FLAG_KEYS.map((k) => [k, true])) as typeof FEATURE_FLAG_DEFAULTS;
  assertEquals(memoryFlagOpts(allOn), { vitrina: true, offNote: null });
});
