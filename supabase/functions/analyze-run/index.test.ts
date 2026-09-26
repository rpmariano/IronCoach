import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildWeeklyVolumeLine,
  computeRunRecordContext,
  formatHrZonesLine,
  formatSplitsLine,
  keepImageOnlyDetails,
  planningFrameSection,
  resolvePhotoPaths,
  resolveReanalysisTypes,
} from "./index.ts";
import { seriesPromptSection } from "../_shared/seriesBlock.ts";

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

Deno.test("keepImageOnlyDetails: editar à mão não apaga a app de origem nem o que só os prints dão", () => {
  const antes = { source_app: "samsung_health", regularity_score: 82, recommended_hydration_ml: 600, avg_heart_rate_bpm: 140 };
  const formulario = { avg_heart_rate_bpm: 150, cadence_spm: 170 };
  assertEquals(keepImageOnlyDetails(antes, formulario), {
    avg_heart_rate_bpm: 150, cadence_spm: 170,
    source_app: "samsung_health", regularity_score: 82, recommended_hydration_ml: 600,
  });
  // O que o formulário traz ganha; sem nada antes, fica como veio.
  assertEquals(keepImageOnlyDetails(antes, { source_app: "garmin" })?.source_app, "garmin");
  assertEquals(keepImageOnlyDetails(null, formulario), formulario);
  // Sem métricas no formulário (details null): fica só o que os prints davam.
  assertEquals(keepImageOnlyDetails({ source_app: "strava" }, null), { source_app: "strava" });
  assertEquals(keepImageOnlyDetails({}, null), null);
});

Deno.test("keepImageOnlyDetails: a temperatura do relógio sobrevive a uma edição manual — incluindo 0 °C (5.6)", () => {
  assertEquals(keepImageOnlyDetails({ temperature_c: 0, source_app: "garmin" }, { cadence_spm: 170 }), { cadence_spm: 170, temperature_c: 0, source_app: "garmin" });
  assertEquals(keepImageOnlyDetails({ temperature_c: -3 }, null), { temperature_c: -3 });
  // Uma temperatura nova (reanálise) ganha à antiga.
  assertEquals(keepImageOnlyDetails({ temperature_c: 12 }, { temperature_c: 24 }), { temperature_c: 24 });
});

// ── A gestão do esforço ao longo da corrida (feedback de 2026-09-25) ──────

Deno.test("formatSplitsLine: o ritmo de cada volta, com o número da volta mesmo quando uma falha", () => {
  assertEquals(
    formatSplitsLine([
      { distance_km: 1, time_seconds: 300 },
      { distance_km: 1, time_seconds: null },
      { distance_km: 1, time_seconds: 312 },
      { distance_km: 0.5, time_seconds: 160 },
    ]),
    "Parciais (ritmo de cada volta, por km): 1: 5'00\" · 3: 5'12\" · 4: 5'20\"",
  );
});

Deno.test("formatSplitsLine: sem parciais, ou com um só, não há nada a ler", () => {
  assertEquals(formatSplitsLine(null), null);
  assertEquals(formatSplitsLine([]), null);
  assertEquals(formatSplitsLine([{ distance_km: 1, time_seconds: 300 }]), null);
});

Deno.test("formatHrZonesLine: minutos por zona, sem as zonas vazias", () => {
  assertEquals(
    formatHrZonesLine([{ zone: 1, minutes: 4.6 }, { zone: 2, minutes: 31 }, { zone: 3, minutes: 0 }, { zone: null, minutes: 3 }]),
    "Tempo por zona de FC: Z1 5 min, Z2 31 min",
  );
  assertEquals(formatHrZonesLine(null), null);
});

Deno.test("formatSplitsLine: 4'59,6\" arredonda para 5'00\", não 4'60\"", () => {
  assertEquals(
    formatSplitsLine([{ distance_km: 1, time_seconds: 299.6 }, { distance_km: 1, time_seconds: 305 }]),
    "Parciais (ritmo de cada volta, por km): 1: 5'00\" · 2: 5'05\"",
  );
});

// Fase 0 do Troféu (2026-09-26): a prova de referência vai no enquadramento
// "prova agendada, sem plano" — e só lá; sem ela, o texto fica igual.
Deno.test("planningFrameSection: sem plano e com prova, diz qual é a prova de referência", () => {
  const principal = { id: "m1", name: "Maratona de Lisboa", date: "2026-10-11", distance_km: 42.195, race_priority: "a" };
  const bloco = planningFrameSection(false, true, principal);
  assertStringIncludes(bloco, `A prova de referência é "Maratona de Lisboa" (2026-10-11, 42,2 km), a próxima prova principal.`);
  assertEquals(planningFrameSection(false, true, null), planningFrameSection(false, true));
  assertEquals(planningFrameSection(true, true, principal), "");
});

// ── Competição por jornadas (specs/trofeu.md §5, Fase 2, 2026-09-26) ──────
// O comentário da corrida leva o bloco da competição logo a seguir à
// memória — e, sem inscrição, uma secção vazia (o prompt fica igual).
Deno.test("jornadas: o bloco da competição entra no prompt do comentário só quando existe", async () => {
  assertEquals(seriesPromptSection(null), "");
  assertEquals(seriesPromptSection(undefined), "");
  // generateCoachNotes não é exportável sem refatorar: confirma-se a montagem no código.
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(src, "memoryPromptSection(memoryBlock) + seriesPromptSection(seriesBlock) +\n    `REGRAS OBRIGATÓRIAS:");
  assertStringIncludes(src, 'const seriesPromise = fetchSeriesBlock(sb, userId, ctx.date, { channel: "run", statusTodayISO: lisbonTodayISO() });');
  // O bloco é o último argumento, DEPOIS do prazo (passado por posição).
  assertStringIncludes(src, "      deadline,\n      (await seriesPromise)?.text ?? null,\n    );");
  assertStringIncludes(src, "  deadline = Number.POSITIVE_INFINITY,\n  // O bloco da competição por jornadas");
});
