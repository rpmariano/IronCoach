import { assert, assertStringIncludes } from "jsr:@std/assert@1";
import { parseFasting, weighingConditions } from "./index.ts";

// Bug #103 (30-10): a análise fechava com «Para a próxima: Estavas em jejum
// quando te pesaste às 08:00?» — a pergunta ficava para depois. O formulário
// passa a perguntá-lo antes de enviar (`fasting`), como nas refeições.

Deno.test("weighingConditions: o jejum respondido no formulário é facto — e não se pergunta no «Para a próxima»", () => {
  const sim = weighingConditions("08:00", null, true);
  assertStringIncludes(sim, "pesou-se em jejum (respondeu no formulário)");
  assertStringIncludes(sim, "NÃO o perguntes, nem no \"Para a próxima\"");
  assert(!sim.includes("usa o bloco \"Para a próxima\" para PERGUNTAR"));

  const nao = weighingConditions("19:00", null, false);
  assertStringIncludes(nao, "NÃO estava em jejum");
  assertStringIncludes(nao, "sem o repreender");
  assert(!nao.includes("usa o bloco \"Para a próxima\" para PERGUNTAR"));
});

Deno.test("weighingConditions: sem o jejum (cliente antigo), fica como antes — pergunta no «Para a próxima»", () => {
  const s = weighingConditions("08:00", null);
  assertStringIncludes(s, "Não sabes se o atleta estava em jejum.");
  assertStringIncludes(s, "usa o bloco \"Para a próxima\" para PERGUNTAR");
  assertStringIncludes(weighingConditions("08:00", "pesei-me em jejum"), "falou do jejum nas observações");
});

Deno.test("parseFasting: só true/false; o resto é «não sabe»", () => {
  assert(parseFasting(true) === true && parseFasting(false) === false);
  for (const v of [null, undefined, "sim", 1, 0, "true"]) assert(parseFasting(v) === null, String(v));
});
