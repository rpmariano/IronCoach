import { assertEquals, assertObjectMatch, assertStringIncludes } from "jsr:@std/assert@1";
import { computePlanExecution, describePlanExecution } from "./planExecution.ts";

// specs/plano-registo-plano-coach.md F4. As expectativas do golden foram
// escritas à mão, só com os campos que cada caso prova (assertObjectMatch):
// o vetor diz o que DEVE dar, não o que o código calhou de dar.
const golden = JSON.parse(await Deno.readTextFile(new URL("./planExecution.golden.json", import.meta.url)));

for (const { name, input, expect } of golden) {
  Deno.test(`computePlanExecution — ${name}`, () => {
    const result = computePlanExecution(input);
    // deno-lint-ignore no-explicit-any
    assertObjectMatch(result as any, expect);
    // assertObjectMatch aceita um prefixo de um array: o número de blocos e
    // os extras confirmam-se à parte.
    if (expect.blocks) assertEquals(result!.blocks.length, expect.blocks.length);
    if (expect.extras) assertEquals(result!.extras, expect.extras);
  });
}

Deno.test("computePlanExecution — sem prescrição (plano antigo) é null", () => {
  assertEquals(computePlanExecution({ prescription: null, sessionDate: "2026-10-18", sets: [] }), null);
  assertEquals(computePlanExecution({ prescription: { blocks: [] }, sessionDate: "2026-10-18", sets: [] }), null);
  assertEquals(computePlanExecution({ prescription: { blocks: [{ type: "forca", name: "  " }] }, sessionDate: "2026-10-18", sets: [] }), null);
});

Deno.test("computePlanExecution — lixo não rebenta: séries sem nome caem, sem séries tudo em falta", () => {
  const r = computePlanExecution({
    prescription: { blocks: [{ type: "forca", name: "Prensa", sets: 3, reps: 10 }] },
    sessionDate: "2026-10-18",
    sets: [{ exercise_name: null, reps: 10, weight: 50 }],
    exercisesMeta: null,
    history: null,
  })!;
  assertEquals(r.counts, { cumprido: 0, parcial: 0, trocado: 0, em_falta: 1 });
  assertEquals(r.strengthRepsCompliance, 0);
});

Deno.test("describePlanExecution — as linhas que a Carol lê, e o aviso do treino livre ligado ao plano", () => {
  const r = computePlanExecution(golden[3].input)!;
  const text = describePlanExecution(r)!;
  assertStringIncludes(text, "registado como treino livre; contou como o treino do plano desse dia");
  assertStringIncludes(text, "Seletor de pernas (trocado por Leg curl)");
  assertStringIncludes(text, 'objetivo "controlar a descida em 3 s"');
  assertStringIncludes(text, "Bicicleta — ficou de fora");
  assertStringIncludes(text, "Extensões de pernas — planeado 3×12, feito 3 série(s) de 12/12/12 reps a 40 kg [cumprido]");

  const first = describePlanExecution(computePlanExecution(golden[0].input))!;
  assertStringIncludes(first, "+2,5 kg face à última vez");
  assertStringIncludes(first, "Bicicleta — 20 de 20 min");
  assertEquals(first.startsWith("PLANEADO VS FEITO:"), true);
  assertEquals(describePlanExecution(null), null);
});
