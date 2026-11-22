import { assertStringIncludes } from "jsr:@std/assert@1";

// v1 lite (2026-11-22): com a água desligada, nenhum lembrete sai.
Deno.test("v1 lite: send-water-reminders não envia com water OFF (antes de ler perfis)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const gate = src.indexOf("if (!(await getFeatureFlags({ db: sb })).water) {");
  assertStringIncludes(src, 'return jsonResponse({ ok: true, skipped: "water_off", sent: 0 });');
  if (gate < 0 || gate > src.indexOf('.from("profiles")')) throw new Error("o interruptor tem de vir antes de ler os perfis");
});
