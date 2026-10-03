import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { missingProfileBasics, missingProfileBasicsInstruction } from "./profileGaps.ts";

const COMPLETO = { gender: "M", birth_date: "1984-05-10", height_cm: 178, weight_kg: 74 };

Deno.test("missingProfileBasics: perfil completo não tem nada em falta", () => {
  assertEquals(missingProfileBasics(COMPLETO), []);
  // Os números chegam às vezes como texto (numeric do Postgres).
  assertEquals(missingProfileBasics({ ...COMPLETO, height_cm: "178", weight_kg: "74.2" }), []);
});

Deno.test("missingProfileBasics: lista pela ordem do Perfil → Pessoal", () => {
  assertEquals(missingProfileBasics(null), ["género", "data de nascimento", "altura", "peso"]);
  assertEquals(missingProfileBasics({ ...COMPLETO, height_cm: null, gender: "" }), ["género", "altura"]);
});

Deno.test("missingProfileBasics: data sem idade e zeros contam como em falta", () => {
  assertEquals(missingProfileBasics({ ...COMPLETO, birth_date: "não é data" }), ["data de nascimento"]);
  assertEquals(missingProfileBasics({ ...COMPLETO, weight_kg: 0, height_cm: "" }), ["altura", "peso"]);
});

Deno.test("missingProfileBasicsInstruction: null com o perfil completo (prompt igual ao de sempre)", () => {
  assertEquals(missingProfileBasicsInstruction(COMPLETO), null);
});

Deno.test("missingProfileBasicsInstruction: nomeia o que falta, manda pedir e proíbe inventar", () => {
  const t = missingProfileBasicsInstruction({ ...COMPLETO, height_cm: null, weight_kg: null })!;
  assertStringIncludes(t, "DADOS DO PERFIL EM FALTA: altura e peso.");
  assertStringIncludes(t, "Não os inventes");
  assertStringIncludes(t, "Perfil → Pessoal");
  // Ela não tem ferramenta para gravar no perfil.
  assertStringIncludes(t, "tu não os gravas");
  assertStringIncludes(t, "avaliação corporal");
});

Deno.test("missingProfileBasicsInstruction: sem idade avisa das zonas de FC; o peso só aparece se faltar", () => {
  const t = missingProfileBasicsInstruction({ ...COMPLETO, birth_date: null })!;
  assertStringIncludes(t, "EM FALTA: data de nascimento.");
  assertStringIncludes(t, "zonas de FC");
  assertEquals(t.includes("avaliação corporal"), false);
});
