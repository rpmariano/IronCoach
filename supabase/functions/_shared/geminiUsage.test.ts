import { assertEquals } from "jsr:@std/assert@1";
import { addUsage, emptyUsage, usageFromGemini } from "./geminiUsage.ts";

Deno.test("usageFromGemini: lê raciocínio, cache e ferramentas", () => {
  const u = usageFromGemini({
    modelVersion: "gemini-3.8-flash",
    usageMetadata: {
      promptTokenCount: 1000,
      toolUsePromptTokenCount: 200,
      candidatesTokenCount: 50,
      cachedContentTokenCount: 400,
      thoughtsTokenCount: 700,
    },
  });
  const counts = { input_tokens: 1200, output_tokens: 50, cached_tokens: 400, thoughts_tokens: 700, calls: 1 };
  assertEquals(u, { ...counts, model: "gemini-3.8-flash", by_model: { "gemini-3.8-flash": counts } });
});

Deno.test("usageFromGemini: resposta sem usageMetadata conta a chamada, com zeros", () => {
  assertEquals(usageFromGemini({}), { ...emptyUsage(), calls: 1, model: null });
  assertEquals(usageFromGemini(null), { ...emptyUsage(), calls: 1, model: null });
});

Deno.test("addUsage: soma campo a campo e ignora null", () => {
  const a = usageFromGemini({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, thoughtsTokenCount: 5 } });
  const b = usageFromGemini({ modelVersion: "m2", usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 4, cachedContentTokenCount: 8 } });
  assertEquals(addUsage(a, b), {
    input_tokens: 40, output_tokens: 6, cached_tokens: 8, thoughts_tokens: 5, calls: 2, model: "m2",
    by_model: { m2: { input_tokens: 30, output_tokens: 4, cached_tokens: 8, thoughts_tokens: 0, calls: 1 } },
  });
  assertEquals(addUsage(a, null), a);
  assertEquals(addUsage(undefined, undefined), { ...emptyUsage(), model: null });
});

Deno.test("addUsage: com o Flash de recurso, os tokens ficam também por modelo (revisão de fa525453)", () => {
  const primary = usageFromGemini({ modelVersion: "gemini-3.8-flash", usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } });
  const fallback = usageFromGemini({ modelVersion: "gemini-3.6-flash", usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 20 } });
  const again = usageFromGemini({ modelVersion: "gemini-3.6-flash", usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5 } });
  const sum = addUsage(addUsage(primary, fallback), again);
  assertEquals(sum.calls, 3);
  assertEquals(sum.by_model, {
    "gemini-3.8-flash": { input_tokens: 100, output_tokens: 10, cached_tokens: 0, thoughts_tokens: 0, calls: 1 },
    "gemini-3.6-flash": { input_tokens: 250, output_tokens: 25, cached_tokens: 0, thoughts_tokens: 0, calls: 2 },
  });
});
