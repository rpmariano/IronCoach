import { assertStringIncludes } from "jsr:@std/assert@1";

// v1 lite (2026-11-22): o tick não lê os avisos da Taça com ela desligada e
// tira os momentos das áreas desligadas (formulas/featureFlags.ts).
Deno.test("v1 lite: os momentos das áreas desligadas saem antes de escolher", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(src, "const flags = await getFeatureFlags({ db: sb });");
  assertStringIncludes(src, "const cupState = flags.cup ? await loadCupNoticeState(sb, [...byUser.keys()], now, today) : null;");
  assertStringIncludes(src, "candidates = candidates.filter((c) => proactiveTriggerAllowed(c.trigger, flags));");
  // O filtro vem antes de qualquer escolha.
  const at = src.indexOf("candidates = candidates.filter((c) => proactiveTriggerAllowed(c.trigger, flags));");
  if (at < 0 || at > src.indexOf("choosePush(candidates")) throw new Error("o filtro tem de vir antes do choosePush");
});
