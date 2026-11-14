import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { geminiResponseSummary, redactValues } from "./geminiLog.ts";

Deno.test("redactValues: ficam as chaves e a forma; os valores não", () => {
  assertEquals(
    redactValues('{"items":[{"name":"Arroz \\"basmati\\"","grams":150,"kcal":-1.5e2}],"note":"o Rui pesa 80 kg'),
    '{"items":[{"name":"…","grams":#,"kcal":#}],"note":"…',
  );
});

Deno.test("geminiResponseSummary: tamanho, finishReason e 200 caracteres sem dados", () => {
  const text = JSON.stringify({ items: [{ name: "Bacalhau com natas", grams: 350 }] }) + "x".repeat(500);
  const json = { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text }] } }] };
  const out = JSON.parse(geminiResponseSummary(json, text));
  assertEquals(out.size, text.length);
  assertEquals(out.finishReason, "MAX_TOKENS");
  assertEquals(out.head.includes("Bacalhau"), false);
  assertEquals(out.head.includes("350"), false);
  assertStringIncludes(out.head, '"name":"…"');
  // Sem texto (resposta vazia): só o tamanho do JSON e os motivos.
  const empty = JSON.parse(geminiResponseSummary({ promptFeedback: { blockReason: "SAFETY" } }));
  assertEquals([empty.finishReason, empty.blockReason, "head" in empty], [null, "SAFETY", false]);
});

Deno.test("os logs de erro do Gemini já não guardam a resposta crua", async () => {
  for (const f of ["coach-chat", "analyze-meal", "analyze-body", "analyze-gym", "analyze-run"]) {
    const src = await Deno.readTextFile(new URL(`../${f}/index.ts`, import.meta.url));
    for (const bad of [
      'console.error("Gemini devolveu JSON inválido:", rawText);',
      'console.error("Gemini devolveu JSON inválido/incompleto:", rawText);',
      'console.error("Gemini resposta vazia:", JSON.stringify(geminiJson));',
      'console.error("Coach generation json parse error", e, rawText);',
    ]) assertEquals(src.includes(bad), false, `${f}: ${bad}`);
  }
});
