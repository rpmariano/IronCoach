import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildPrescription, describePrescription, MAX_PRESCRIPTION_BLOCKS, prescriptionBlockTarget, stripPrescribedLoad } from "./planPrescription.ts";
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

Deno.test("stripPrescribedLoad: sem carga devolve o texto tal e qual; com carga mantém as quebras de linha do resto", () => {
  const lista = "Faz antes da corrida.\n- 10 min de mobilidade\n- 2 séries de prancha";
  assertEquals(stripPrescribedLoad(lista), lista);
  assertEquals(stripPrescribedLoad("Aquece.\n- Prensa a 100 kg\n- Prancha 3x30 s"), "Aquece.\n- Prancha 3x30 s");
  for (const ok of ["1 km de aquecimento", "Acaba a RPE 8", "3x10 controladas", "Trote a 5:30/km", "20 quilómetros esta semana"]) {
    assertEquals(stripPrescribedLoad(ok), ok);
  }
});

// #118 (2026-11-10): «30 reps» num hollow hold — os isométricos em segundos.
Deno.test("buildPrescription: isométricos em segundos (seconds por série); em reps, recusado", () => {
  const ok = buildPrescription([
    { type: "forca", name: "Hollow hold", sets: 3, seconds: 30, goal: "lombar colada ao chão" },
    { type: "forca", name: "Agachamento", sets: 3, reps: 10 },
  ]);
  assertEquals(ok.issue, null);
  assertEquals(ok.prescription!.blocks[0], { type: "forca", name: "Hollow hold", sets: 3, reps: null, seconds: 30, goal: "lombar colada ao chão" });
  assertEquals(ok.prescription!.blocks[1], { type: "forca", name: "Agachamento", sets: 3, reps: 10, goal: null });
  // Os segundos mandam sobre umas reps que viessem com eles.
  assertEquals(buildPrescription([{ type: "forca", name: "Prancha", sets: 3, reps: 30, seconds: 45 }]).prescription!.blocks[0], { type: "forca", name: "Prancha", sets: 3, reps: null, seconds: 45, goal: null });
  // Um isométrico em reps (revisão de 0d76f4d4): as reps passam a segundos, e o resto fica.
  const hollow = buildPrescription([{ type: "forca", name: "Hollow hold", sets: 3, reps: 30 }, { type: "forca", name: "Agachamento", sets: 3, reps: 10 }]);
  assertEquals(hollow.issue, null);
  assertEquals(hollow.prescription!.blocks[0], { type: "forca", name: "Hollow hold", sets: 3, reps: null, seconds: 30, goal: null });
  assertStringIncludes(hollow.adjusted![0], "30 reps passaram a 30 s por série");
  // Revisão de fa7e1a66: seconds inválido tira o bloco; sem unidade nenhuma sai;
  // reps que não podem ser segundos (3) ficam como vieram. Os outros ficam.
  const out = buildPrescription([{ type: "forca", name: "Dead hang", sets: 2, reps: 3 }, { type: "forca", name: "Prancha", sets: 3, seconds: 2 }, { type: "forca", name: "Prancha lateral", sets: 3 }, { type: "forca", name: "Agachamento", sets: 3, reps: 10 }]);
  assertEquals(out.prescription!.blocks.map((b) => [b.name, b.type === "forca" ? (b.seconds ?? `${b.reps} reps`) : null]), [["Dead hang", "3 reps"], ["Agachamento", "10 reps"]]);
  assertEquals(out.adjusted!.length, 2);
  // Só isométricos sem segundos: nada fica.
  assertEquals(buildPrescription([{ type: "forca", name: "Prancha", sets: 3 }]).prescription, null);
  // A ponte de glúteos não é isométrica.
  assertEquals(buildPrescription([{ type: "forca", name: "Ponte de glúteos", sets: 3, reps: 12 }]).issue, null);
  // A leitura: «3×30 s».
  assertEquals(describePrescription(ok.prescription), "Hollow hold 3×30 s (lombar colada ao chão); Agachamento 3×10");
  assertEquals(prescriptionBlockTarget({ sets: 3, seconds: 30 }), "3×30 s");
});

Deno.test("buildPrescription (revisão de 2b51cca7): seconds só num isométrico; num exercício de reps ignora-se, nunca recusa", () => {
  // seconds: 0 (ou outro) num exercício de reps: ignorado.
  assertEquals(buildPrescription([{ type: "forca", name: "Agachamento", sets: 3, reps: 10, seconds: 0 }]).prescription!.blocks[0], { type: "forca", name: "Agachamento", sets: 3, reps: 10, goal: null });
  assertEquals(buildPrescription([{ type: "forca", name: "Remada", sets: 3, reps: 12, seconds: 45 }]).prescription!.blocks[0], { type: "forca", name: "Remada", sets: 3, reps: 12, goal: null });
  // Um exercício que o classificador não conhece como isométrico, só com seconds: fica em segundos.
  assertEquals(buildPrescription([{ type: "forca", name: "Bird dog", sets: 3, seconds: 20 }]).prescription!.blocks[0], { type: "forca", name: "Bird dog", sets: 3, reps: null, seconds: 20, goal: null });
  // As exclusões do classificador: a prancha com toque nos ombros tem reps.
  assertEquals(buildPrescription([{ type: "forca", name: "Prancha com toque nos ombros", sets: 3, reps: 12 }]).issue, null);
  assertEquals(buildPrescription([{ type: "forca", name: "Elevação de pernas em suspensão na barra", sets: 3, reps: 10 }]).issue, null);
});

// Revisão de fa7e1a66: os casos do script dela.
Deno.test("buildPrescription (revisão de fa7e1a66): nunca inventa a unidade", () => {
  const one = (b: Record<string, unknown>) => buildPrescription([{ type: "forca", sets: 3, ...b }]);
  const block = (b: Record<string, unknown>) => one(b).prescription?.blocks[0] ?? null;
  // Forte em reps: passa a segundos.
  assertEquals(block({ name: "Prancha", reps: 30 }), { type: "forca", name: "Prancha", sets: 3, reps: null, seconds: 30, goal: null });
  // Reps que não podem ser segundos: ficam.
  assertEquals(block({ name: "Prancha", reps: 3 }), { type: "forca", name: "Prancha", sets: 3, reps: 3, goal: null });
  // Seconds inválido (2, 900): sai — nunca cai para as reps.
  assertEquals(one({ name: "Prancha", seconds: 2, reps: 30 }).prescription, null);
  assertEquals(one({ name: "Prancha", seconds: 900, reps: 12 }).prescription, null);
  assertStringIncludes(one({ name: "Prancha", seconds: 900, reps: 12 }).issue!, "900 s por série fora de 5-600");
  assertEquals(block({ name: "Prancha", seconds: 45, reps: 12 }), { type: "forca", name: "Prancha", sets: 3, reps: null, seconds: 45, goal: null });
  assertEquals(one({ name: "Prancha" }).prescription, null);
  assertEquals(one({ name: "Prancha", reps: "30" }).prescription, null);
  // Isométrico ambíguo em reps: fica em reps, sem recusa e sem perda.
  assertEquals(block({ name: "Pallof hold", reps: 10 }), { type: "forca", name: "Pallof hold", sets: 3, reps: 10, goal: null });
  assertEquals(block({ name: "Prancha com joelhos apoiados", reps: 30 }), { type: "forca", name: "Prancha com joelhos apoiados", sets: 3, reps: 30, goal: null });
  // Com movimento: reps, como veio.
  assertEquals(block({ name: "Copenhagen adductor raise", reps: 12 }), { type: "forca", name: "Copenhagen adductor raise", sets: 3, reps: 12, goal: null });
  assertEquals(block({ name: "Plank walk", reps: 8 }), { type: "forca", name: "Plank walk", sets: 3, reps: 8, goal: null });
  // Desconhecido em segundos (reps 0 ou nenhumas): segundos.
  assertEquals(block({ name: "Bird dog", seconds: 20 }), { type: "forca", name: "Bird dog", sets: 3, reps: null, seconds: 20, goal: null });
  assertEquals(block({ name: "Bird dog", seconds: 20, reps: 0 }), { type: "forca", name: "Bird dog", sets: 3, reps: null, seconds: 20, goal: null });
  assertEquals(one({ name: "Bird dog", reps: 0 }).prescription, null);
  // De reps com seconds: o seconds ignora-se.
  assertEquals(block({ name: "Agachamento", reps: 10, seconds: 30 }), { type: "forca", name: "Agachamento", sets: 3, reps: 10, goal: null });
  // Um bloco que sai não leva os outros.
  assertEquals(buildPrescription([{ type: "forca", name: "Agachamento", sets: 3, reps: 10 }, { type: "forca", name: "Prancha", sets: 3, seconds: 2 }]).prescription!.blocks.length, 1);
  // Séries inválidas anulam, como sempre.
  assertEquals(buildPrescription([{ type: "forca", name: "Prancha", sets: 0, seconds: 30 }]).prescription, null);
});
