import { assertEquals } from "jsr:@std/assert@1";
import { timingSafeEqual } from "./timingSafeEqual.ts";

Deno.test("timingSafeEqual: igual só com o mesmo texto; tamanhos diferentes e nulos são diferentes", () => {
  assertEquals(timingSafeEqual("segredo", "segredo"), true);
  assertEquals(timingSafeEqual("segredo", "segredO"), false);
  assertEquals(timingSafeEqual("segredo", "segred"), false);
  assertEquals(timingSafeEqual("", ""), true);
  assertEquals(timingSafeEqual("a", ""), false);
  assertEquals(timingSafeEqual(null, "a"), false);
  assertEquals(timingSafeEqual("a", undefined), false);
});
