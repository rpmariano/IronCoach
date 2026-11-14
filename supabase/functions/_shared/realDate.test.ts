import { assertEquals } from "jsr:@std/assert@1";
import { isRealDateISO } from "./realDate.ts";

Deno.test("isRealDateISO: só datas que existem", () => {
  for (const ok of ["2026-11-14", "2028-02-29", "2026-12-31", "2026-01-01"]) assertEquals(isRealDateISO(ok), true, ok);
  for (const bad of ["2026-13-40", "2026-02-29", "2026-04-31", "2026-00-10", "2026-11-00", "26-11-14", "2026-11-14T00:00", "", null, 20261114, "1800-01-01"]) {
    assertEquals(isRealDateISO(bad), false, String(bad));
  }
});
