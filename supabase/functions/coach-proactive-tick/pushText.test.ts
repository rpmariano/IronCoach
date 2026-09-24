import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildPushPrompt, composePushMessage, describeFacts, extractText, validatePushText } from "./pushText.ts";

const eve = { trigger: "race_eve" as const, key: "race_eve:r1", raceId: "r1", raceName: "Meia de Lisboa", hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };
const balance = { ...eve, trigger: "race_after" as const, key: "race_after:r1:run1", hasRun: true };
const silence = { ...eve, trigger: "silence" as const, key: "silence:2026-09-14", raceId: null, raceName: null, silenceDays: 5 };

Deno.test("describeFacts: só os dados que existem, em linhas", () => {
  assertEquals(describeFacts(eve, { firstName: "Rui", distanceKm: 21.0975, startTime: "09:30:00", targetSeconds: 6300 }), [
    "Nome do atleta: Rui", "Prova: Meia de Lisboa", "Distância: 21.1 km", "Partida: 09:30", "Objetivo de tempo: 1:45:00",
  ]);
  assertEquals(describeFacts(balance, { raceName: "Meia", runSeconds: 6200, targetSeconds: 6300 }), [
    "Prova: Meia", "Objetivo de tempo: 1:45:00", "Tempo feito: 1:43:20", "Bateu o objetivo por 1:40",
  ]);
  assertEquals(describeFacts({ ...balance, hasRun: false }, { raceName: "Meia" }), ["Prova: Meia", "A corrida da prova ainda não está registada."]);
  assertEquals(describeFacts(silence, {}), ["Dias sem registos: 5"]);
});

Deno.test("buildPushPrompt: o tom, as regras e o momento", () => {
  const p = buildPushPrompt(eve, { firstName: "Rui" });
  assertStringIncludes(p, "REGRAS DE TOM");
  assertStringIncludes(p, "no máximo 140 caracteres");
  assertStringIncludes(p, "É a véspera da prova");
  assertStringIncludes(p, "- Nome do atleta: Rui");
  assertStringIncludes(p, "Não uses números que não estejam nos dados");
});

Deno.test("validatePushText: limpa aspas e espaços; recusa emoji, exclamação, curto e longo", () => {
  assertEquals(validatePushText('  "Amanhã é a Meia.\nJantar cedo e cama às 22h."  '), "Amanhã é a Meia. Jantar cedo e cama às 22h.");
  assertEquals(validatePushText("Boa sorte amanhã 💪"), null);
  assertEquals(validatePushText("Amanhã é o grande dia!"), null);
  assertEquals(validatePushText("Olá."), null);
  assertEquals(validatePushText("x".repeat(141)), null);
  assertEquals(validatePushText(null), null);
});

Deno.test("extractText: ignora partes de raciocínio", () => {
  assertEquals(extractText({ candidates: [{ content: { parts: [{ thought: true, text: "a pensar" }, { text: "O texto." }] } }] }), "O texto.");
  assertEquals(extractText({}), null);
});

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (() => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response)) as unknown as typeof fetch;
}

Deno.test("composePushMessage: usa o texto gerado quando serve; senão, a frase fixa", async () => {
  const good = { candidates: [{ content: { parts: [{ text: "Amanhã é a Meia de Lisboa. Jantar até às 20h e o plano da manhã está na app." }] } }] };
  const gen = await composePushMessage(eve, {}, "chave", fakeFetch(good));
  // Sem usageMetadata na resposta, os tokens contam a zero (mas a chamada existiu).
  assertEquals(gen, { title: "Carol", body: "Amanhã é a Meia de Lisboa. Jantar até às 20h e o plano da manhã está na app.", generated: true, usage: { input_tokens: 0, output_tokens: 0 } });

  const fixed = "Amanhã é dia de prova: Meia de Lisboa. Tenho o plano para hoje à noite e para amanhã de manhã.";
  assertEquals((await composePushMessage(eve, {}, "chave", fakeFetch({ candidates: [{ content: { parts: [{ text: "Força amanhã!" }] } }] }))).body, fixed);
  assertEquals((await composePushMessage(eve, {}, "chave", fakeFetch({}, false))).body, fixed);
  assertEquals((await composePushMessage(eve, {}, null)).generated, false);
  const throws = (() => Promise.reject(new Error("rede"))) as unknown as typeof fetch;
  const fromError = await composePushMessage(eve, {}, "chave", throws);
  assert(!fromError.generated);
  assertEquals(fromError.body, fixed);
  assertEquals(fromError.usage, null);
});

Deno.test("composePushMessage: os tokens da chamada vão com o texto — mesmo quando o texto não serve (P.10)", async () => {
  const usageMetadata = { promptTokenCount: 812, candidatesTokenCount: 41 };
  const good = { usageMetadata, candidates: [{ content: { parts: [{ text: "Amanhã é a Meia de Lisboa. Jantar até às 20h e o plano da manhã está na app." }] } }] };
  assertEquals((await composePushMessage(eve, {}, "chave", fakeFetch(good))).usage, { input_tokens: 812, output_tokens: 41 });
  // Texto recusado (exclamação): sai a frase fixa, mas o custo existiu.
  const bad = { usageMetadata, candidates: [{ content: { parts: [{ text: "Força amanhã!" }] } }] };
  const fallback = await composePushMessage(eve, {}, "chave", fakeFetch(bad));
  assertEquals(fallback.generated, false);
  assertEquals(fallback.usage, { input_tokens: 812, output_tokens: 41 });
  // Sem chamada (a intervenção nunca passa pelo gerador), sem tokens.
  assertEquals((await composePushMessage({ ...eve, trigger: "intervention", key: "intervention:x" }, {}, "chave", fakeFetch(good))).usage, null);
  // Erro do servidor: sem resposta para contar.
  assertEquals((await composePushMessage(eve, {}, "chave", fakeFetch({}, false))).usage, null);
});

Deno.test("describeFacts: o balanço da semana leva as datas da semana e nada de provas", () => {
  const week = { ...silence, trigger: "week_review" as const, key: "week_review:2026-09-21", silenceDays: null, weekStart: "2026-09-21", weekEnd: "2026-09-27" };
  assertEquals(describeFacts(week, { firstName: "Rui", raceName: "Meia" }), ["Nome do atleta: Rui", "Semana revista: 2026-09-21 a 2026-09-27"]);
});
