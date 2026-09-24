import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildWeeklyVolumeLine, computeRunRecordContext, fetchGeminiWithTimeout, planningFrameSection, resolvePhotoPaths, resolveReanalysisTypes } from "./index.ts";

Deno.test("planningFrameSection: com plano e com prova deve retornar vazio", () => {
  assertEquals(planningFrameSection(true, true), "");
});

Deno.test("planningFrameSection: com plano e sem prova deve retornar nota de enquadramento de manutencao", () => {
  const bloco = planningFrameSection(true, false);
  assertStringIncludes(bloco, "NOTA DE ENQUADRAMENTO");
  assertStringIncludes(bloco, "NÃO serve nenhuma prova");
});

Deno.test("planningFrameSection: sem plano e com prova deve retornar enquadramento de prova sem plano", () => {
  const bloco = planningFrameSection(false, true);
  assertStringIncludes(bloco, "PROVA AGENDADA, SEM PLANO");
  assertStringIncludes(bloco, "NUNCA digas que este registo está");
});

Deno.test("planningFrameSection: sem plano e sem prova deve retornar enquadramento livre", () => {
  const bloco = planningFrameSection(false, false);
  assertStringIncludes(bloco, "SEM PROVA E SEM PLANO");
  assertStringIncludes(bloco, "quer MANTER os seus hábitos");
});

Deno.test("resolvePhotoPaths: sem keep_paths fica tudo; com keep_paths só o que a corrida já tinha", () => {
  assertEquals(resolvePhotoPaths(["u/a.jpg", "u/b.jpg"], undefined), { kept: ["u/a.jpg", "u/b.jpg"], dropped: [] });
  assertEquals(resolvePhotoPaths(["u/a.jpg", "u/b.jpg"], ["u/b.jpg", "u/inventado.jpg"]), { kept: ["u/b.jpg"], dropped: ["u/a.jpg"] });
  assertEquals(resolvePhotoPaths(["u/a.jpg"], []), { kept: [], dropped: ["u/a.jpg"] });
  assertEquals(resolvePhotoPaths(null, ["u/a.jpg"]), { kept: [], dropped: [] });
});

// Régua única do recorde (ação 5.3): computeRunRecordContext substitui o
// antigo min(pace) de qualquer distância — com escalão e margem, a mesma
// régua que @formulas/runRecord.ts usa no cliente (RecordConfirmation), para
// o comentário da corrida e o cartão de confirmação não poderem discordar.
Deno.test("computeRunRecordContext: sem candidatos, tudo null", () => {
  const run = { id: "n", date: "2026-09-20", distance_km: 10, duration_seconds: 2880, details: null };
  assertEquals(computeRunRecordContext(run, []), { bestPacesLine: null, personalRecordKind: null });
});

Deno.test("computeRunRecordContext: bate o ritmo no escalão dos 10 km — recorde de pace", () => {
  const candidates = [{ date: "2026-08-01", distance_km: 10, duration_seconds: 3000 }]; // 5.00/km
  const run = { id: "n", date: "2026-09-20", distance_km: 10, duration_seconds: 2880, details: null }; // 4.48/km
  const { bestPacesLine, personalRecordKind } = computeRunRecordContext(run, candidates);
  assertEquals(personalRecordKind, "pace");
  assertStringIncludes(bestPacesLine!, "10k 5.00 (2026-08-01)");
});

Deno.test("computeRunRecordContext: mais longa do que sempre, com pelo menos três corridas antes — recorde de distância", () => {
  const candidates = [
    { date: "2026-07-01", distance_km: 8, duration_seconds: 2400 },
    { date: "2026-07-08", distance_km: 9, duration_seconds: 2700 },
    { date: "2026-07-15", distance_km: 7, duration_seconds: 2100 },
  ];
  const run = { id: "n", date: "2026-09-20", distance_km: 12.5, duration_seconds: 4500, details: null };
  assertEquals(computeRunRecordContext(run, candidates).personalRecordKind, "distance");
});

Deno.test("computeRunRecordContext: mais lenta do que o melhor não é recorde, mas os melhores por escalão aparecem na mesma", () => {
  const candidates = [{ date: "2026-08-01", distance_km: 10, duration_seconds: 2800 }]; // 4.40/km
  const run = { id: "n", date: "2026-09-20", distance_km: 10, duration_seconds: 3000, details: null }; // 5.00/km
  const { bestPacesLine, personalRecordKind } = computeRunRecordContext(run, candidates);
  assertEquals(personalRecordKind, null);
  assertStringIncludes(bestPacesLine!, "10k 4.40 (2026-08-01)");
});

Deno.test("resolveReanalysisTypes: o corpo válido ganha; inválido ou ausente fica o gravado; tipo de outro kind nunca passa", () => {
  const existing = { kind: "treino", training_type: "continuo", details: { race_type: null } };
  assertEquals(resolveReanalysisTypes(existing, {}), { kind: "treino", trainingType: "continuo", raceType: null });
  assertEquals(resolveReanalysisTypes(existing, { training_type: "longo" }), { kind: "treino", trainingType: "longo", raceType: null });
  assertEquals(resolveReanalysisTypes(existing, { training_type: "inventado" }), { kind: "treino", trainingType: "continuo", raceType: null });
  assertEquals(resolveReanalysisTypes(existing, { kind: "competicao", race_type: "10k" }), { kind: "competicao", trainingType: null, raceType: "10k" });
  assertEquals(resolveReanalysisTypes({ kind: "competicao", training_type: null, details: { race_type: "trail" } }, { kind: "lixo" }), { kind: "competicao", trainingType: null, raceType: "trail" });
});

// ── buildWeeklyVolumeLine ────────────────────────────────────────────────
// Bug relatado 2026-09-21: "A análise diz que terminei o volume semanal...
// Sendo hoje o primeiro dia da semana. Está errado." Havia aqui uma janela
// ROLANTE dos "7 dias terminados hoje": numa segunda-feira essa janela cobre
// quase toda a semana anterior, e a Carol lia o número como a semana
// cumprida — quando a semana de calendário (segunda a domingo) tinha
// acabado de começar.
Deno.test("buildWeeklyVolumeLine: numa segunda-feira, só conta o que se correu HOJE — não a semana anterior inteira", () => {
  const runs = [
    { date: "2026-09-14", distance_km: 10 }, // segunda anterior
    { date: "2026-09-16", distance_km: 8 },
    { date: "2026-09-18", distance_km: 12 },
    { date: "2026-09-20", distance_km: 21 }, // domingo anterior
    { date: "2026-09-21", distance_km: 8 },  // hoje, segunda — a corrida acabada de registar
  ];
  const linha = buildWeeklyVolumeLine(runs, "2026-09-21");
  assertStringIncludes(linha, "8.0 km em 1 corrida(s)");
  assertStringIncludes(linha, "ainda a decorrer (dia 1 de 7, segunda a domingo)");
  // A janela rolante do bug dava 8+21+12+8 = 49 km — não pode voltar a aparecer.
  assertEquals(linha.includes("49.0"), false);
});

Deno.test("buildWeeklyVolumeLine: ao domingo a semana está completa — sem \"ainda a decorrer\"", () => {
  const runs = [
    { date: "2026-09-14", distance_km: 10 },
    { date: "2026-09-20", distance_km: 21 },
  ];
  const linha = buildWeeklyVolumeLine(runs, "2026-09-20");
  assertStringIncludes(linha, "31.0 km em 2 corrida(s)");
  assertEquals(linha.includes("ainda a decorrer"), false);
});

Deno.test("buildWeeklyVolumeLine: a meio da semana (quinta, dia 4 de 7), soma só segunda a quinta", () => {
  const runs = [
    { date: "2026-09-14", distance_km: 10 }, // segunda desta semana
    { date: "2026-09-16", distance_km: 8 },  // quarta
    { date: "2026-09-17", distance_km: 6 },  // quinta, hoje
  ];
  const linha = buildWeeklyVolumeLine(runs, "2026-09-17");
  assertStringIncludes(linha, "24.0 km em 3 corrida(s)");
  assertStringIncludes(linha, "ainda a decorrer (dia 4 de 7, segunda a domingo)");
});

Deno.test("buildWeeklyVolumeLine: sem corridas nenhumas, string vazia — sem crash", () => {
  assertEquals(buildWeeklyVolumeLine([], "2026-09-21"), "");
});

// ── fetchGeminiWithTimeout: o Gemini "ocupado" (incidente 2026-09-24) ──────
// Três análises seguidas falharam com 503 em ~5 s: só havia uma repetição,
// 1,5 s depois. Estes testes simulam o fetch e usam esperas de 1 ms.
async function withFetch(statuses: number[], run: (calls: () => number) => Promise<void>) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls++;
    return Promise.resolve(new Response(status === 200 ? "{}" : "ocupado", { status }));
  }) as typeof fetch;
  try {
    await run(() => calls);
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("fetchGeminiWithTimeout: 503 repete com espera e acaba por passar", async () => {
  await withFetch([503, 503, 200], async (calls) => {
    const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 1, Number.POSITIVE_INFINITY, [1, 1, 1]);
    assertEquals(res.status, 200);
    assertEquals(calls(), 3);
  });
});

Deno.test("fetchGeminiWithTimeout: sempre ocupado, desiste ao fim das esperas e devolve o 503", async () => {
  await withFetch([503], async (calls) => {
    const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 1, Number.POSITIVE_INFINITY, [1, 1, 1]);
    assertEquals(res.status, 503);
    assertEquals(calls(), 4);
  });
});

Deno.test("fetchGeminiWithTimeout: sem tempo antes do prazo, não repete", async () => {
  await withFetch([503, 200], async (calls) => {
    const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 1, Date.now() + 2000, [1, 1, 1]);
    assertEquals(res.status, 503);
    assertEquals(calls(), 1);
  });
});

Deno.test("fetchGeminiWithTimeout: 429 e 400 não se repetem", async () => {
  for (const status of [429, 400]) {
    await withFetch([status, 200], async (calls) => {
      const res = await fetchGeminiWithTimeout("https://gemini.test", {}, 1000, 1, Number.POSITIVE_INFINITY, [1, 1, 1]);
      assertEquals(res.status, status);
      assertEquals(calls(), 1);
    });
  }
});
