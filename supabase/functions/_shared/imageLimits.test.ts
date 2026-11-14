import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { hasOversizedImage, MAX_IMAGE_B64_CHARS } from "./imageLimits.ts";

Deno.test("hasOversizedImage: images[] (texto ou {data}) e image", () => {
  const big = "A".repeat(MAX_IMAGE_B64_CHARS + 4);
  const ok = "A".repeat(1000);
  assertEquals(hasOversizedImage({ images: [ok, ok] }), false);
  assertEquals(hasOversizedImage({ images: [ok, big] }), true);
  assertEquals(hasOversizedImage({ images: [{ data: big }] }), true);
  assertEquals(hasOversizedImage({ image: big }), true);
  assertEquals(hasOversizedImage({ image: ok, images: "não é lista" }), false);
  assertEquals(hasOversizedImage(null), false);
});

Deno.test("as analyze-* recusam a imagem grande logo a seguir a ler o corpo", async () => {
  for (const f of ["analyze-meal", "analyze-gym", "analyze-run", "analyze-body"]) {
    const src = await Deno.readTextFile(new URL(`../${f}/index.ts`, import.meta.url));
    assertStringIncludes(src, "const body = await req.json();\n    if (hasOversizedImage(body)) return jsonResponse({ error: IMAGE_TOO_LARGE_TEXT }, 413);".replace(/\n/g, src.includes("\r\n") ? "\r\n" : "\n"), f);
  }
});
