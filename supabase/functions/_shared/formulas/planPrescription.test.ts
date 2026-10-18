import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildPrescription, describePrescription, MAX_PRESCRIPTION_BLOCKS, stripPrescribedLoad } from "./planPrescription.ts";
import { cardioSpecFor, normalizeCardioFields } from "./cardioFields.ts";

// specs/plano-registo-plano-coach.md §2.1 e §2.4 (decisões 1, 4 e 5).

Deno.test("buildPrescription: força e cardio válidos dão os blocos normalizados", () => {
  const { prescription, issue } = buildPrescription([
    { type: "forca", name: "  Extensões de pernas ", sets: 3, reps: 12, goal: "chegar às 12 sem falhar" },
    { type: "cardio", name: "Bicicleta", duration_min: 20, goal: "Z2, cadência 85-90" },
  ]);
  assertEquals(issue, null);
  assertEquals(prescription, {
    blocks: [
      { type: "forca", name: "Extensões de pernas", sets: 3, reps: 12, goal: "chegar às 12 sem falhar" },
      { type: "cardio", name: "Bicicleta", fields: ["duration", "distance"], duration_min: 20, distance_km: null, laps: null, goal: "Z2, cadência 85-90" },
    ],
  });
});

Deno.test("buildPrescription: sem blocos é null sem issue (plano antigo ou só notes)", () => {
  assertEquals(buildPrescription(undefined), { prescription: null, issue: null });
  assertEquals(buildPrescription([]), { prescription: null, issue: null });
});

Deno.test("buildPrescription: nunca kg — campos de peso são ignorados e um objetivo com kg cai", () => {
  const { prescription } = buildPrescription([
    { type: "forca", name: "Agachamento", sets: 4, reps: 5, weight_kg: 60, goal: "4×5 a 60 kg" },
  ]);
  assertEquals(prescription?.blocks[0], { type: "forca", name: "Agachamento", sets: 4, reps: 5, goal: null });
});

Deno.test("buildPrescription: força sem séries ou reps válidas anula a prescrição inteira", () => {
  for (const bad of [{ sets: 0, reps: 10 }, { sets: 3 }, { sets: 3, reps: 80 }, { sets: "3", reps: 10 }]) {
    const r = buildPrescription([
      { type: "forca", name: "Prensa", sets: 3, reps: 10 },
      { type: "forca", name: "Remada", ...bad },
    ]);
    assertEquals(r.prescription, null);
    assertStringIncludes(r.issue ?? "", "Remada");
  }
});

Deno.test("buildPrescription: tipo desconhecido, nome vazio ou forma errada anulam", () => {
  assertEquals(buildPrescription([{ type: "mobilidade", name: "Alongar" }]).prescription, null);
  assertEquals(buildPrescription([{ type: "forca", name: "  ", sets: 3, reps: 10 }]).prescription, null);
  assertEquals(buildPrescription(["Prensa 3x10"]).prescription, null);
  assertEquals(buildPrescription({ blocks: [] }).prescription, null);
});

Deno.test("buildPrescription: mais exercícios do que o limite é recusado", () => {
  const muitos = Array.from({ length: MAX_PRESCRIPTION_BLOCKS + 1 }, (_, i) => ({ type: "forca", name: `Ex ${i}`, sets: 3, reps: 10 }));
  assertEquals(buildPrescription(muitos).prescription, null);
});

Deno.test("buildPrescription: cardio — fields do modelo mandam; um alvo acrescenta o seu campo", () => {
  const remo = buildPrescription([{ type: "cardio", name: "Remo", fields: ["laps", "duration", "duration", "x"], distance_km: 2 }]);
  assertEquals(remo.prescription?.blocks[0], {
    type: "cardio", name: "Remo", fields: ["duration", "distance", "laps"], duration_min: null, distance_km: 2, laps: null, goal: null,
  });
});

Deno.test("buildPrescription: cardio sem fields usa o catálogo, e o desconhecido fica só com tempo", () => {
  const p = buildPrescription([
    { type: "cardio", name: "Piscina" },
    { type: "cardio", name: "Assault air" },
  ]).prescription;
  // deno-lint-ignore no-explicit-any
  assertEquals((p?.blocks[0] as any).fields, ["duration", "laps"]);
  // deno-lint-ignore no-explicit-any
  assertEquals((p?.blocks[1] as any).fields, ["duration"]);
});

Deno.test("cardioSpecFor: reconhece sem acentos nem maiúsculas; desconhecido é null", () => {
  assertEquals(cardioSpecFor("Bicicleta estática")?.fields, ["duration", "distance"]);
  assertEquals(cardioSpecFor("ELÍPTICA")?.fields, ["duration", "distance"]);
  assertEquals(cardioSpecFor("Remo")?.distanceUnit, "m");
  assertEquals(cardioSpecFor("Natação")?.fields, ["duration", "laps"]);
  assertEquals(cardioSpecFor("Saltar à corda")?.fields, ["duration", "laps"]);
  assertEquals(cardioSpecFor("Leg press"), null);
  assertEquals(cardioSpecFor(""), null);
});

Deno.test("normalizeCardioFields: ordem canónica, sem repetidos nem valores estranhos", () => {
  assertEquals(normalizeCardioFields(["laps", "duration", "laps", 3, "kg"]), ["duration", "laps"]);
  assertEquals(normalizeCardioFields("duration"), []);
});

Deno.test("describePrescription: uma linha legível; null sem blocos", () => {
  assertEquals(
    describePrescription({ blocks: [
      { type: "forca", name: "Extensões de pernas", sets: 3, reps: 12, goal: "chegar às 12" },
      { type: "cardio", name: "Bicicleta", fields: ["duration"], duration_min: 20, goal: "Z2" },
    ] }),
    "Extensões de pernas 3×12 (chegar às 12); Bicicleta 20 min (Z2)",
  );
  assertEquals(describePrescription(null), null);
  assertEquals(describePrescription({ blocks: [{ name: "" }] }), null);
});

Deno.test("stripPrescribedLoad e LOAD_RE: kg, kgs e %1RM caem; o resto da nota fica", () => {
  assertEquals(stripPrescribedLoad("Aquece 10 min na bicicleta. Agachamento a 80% 1RM. Termina com alongamentos."),
    "Aquece 10 min na bicicleta. Termina com alongamentos.");
  assertEquals(stripPrescribedLoad("Usa 40kgs na prensa"), null);
  assertEquals(stripPrescribedLoad("3x5 a 85 % do 1RM"), null);
  assertEquals(stripPrescribedLoad("Pernas antes da corrida de amanhã."), "Pernas antes da corrida de amanhã.");
  assertEquals(stripPrescribedLoad(null), null);
  const { prescription } = buildPrescription([{ type: "forca", name: "Agachamento", sets: 3, reps: 5, goal: "a 80% 1RM" }]);
  assertEquals(prescription?.blocks[0].goal, null);
});
