import { assertEquals } from "jsr:@std/assert@1";
import { addUsage, emptyUsage, usageFromGemini } from "./geminiUsage.ts";

Deno.test("usageFromGemini: lê raciocínio, cache e ferramentas", () => {
  const u = usageFromGemini({
    usageMetadata: {
      promptTokenCount: 1000,
      toolUsePromptTokenCount: 200,
      candidatesTokenCount: 50,
      cachedContentTokenCount: 400,
      thoughtsTokenCount: 700,
    },
  });
  assertEquals(u, { input_tokens: 1200, output_tokens: 50, cached_tokens: 400, thoughts_tokens: 700, calls: 1 });
});

Deno.test("usageFromGemini: resposta sem usageMetadata conta a chamada, com zeros", () => {
  assertEquals(usageFromGemini({}), { ...emptyUsage(), calls: 1 });
  assertEquals(usageFromGemini(null), { ...emptyUsage(), calls: 1 });
});

Deno.test("addUsage: soma campo a campo e ignora null", () => {
  const a = usageFromGemini({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, thoughtsTokenCount: 5 } });
  const b = usageFromGemini({ usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 4, cachedContentTokenCount: 8 } });
  assertEquals(addUsage(a, b), { input_tokens: 40, output_tokens: 6, cached_tokens: 8, thoughts_tokens: 5, calls: 2 });
  assertEquals(addUsage(a, null), a);
  assertEquals(addUsage(undefined, undefined), emptyUsage());
});
