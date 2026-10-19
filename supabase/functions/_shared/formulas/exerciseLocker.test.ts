import { assertEquals } from "jsr:@std/assert@1";
import { buildLockerUpserts, type LockerExisting } from "./exerciseLocker.ts";

// specs/plano-registo-plano-coach.md §2.5 (decisão 7).
const NOW = "2026-10-18T00:00:00.000Z";
const base = { userId: "u1", sessionDate: "2026-10-18", sessionCategories: ["Pernas Inferiores"], existing: [] as LockerExisting[], increment: true, now: NOW };

function prev(over: Partial<LockerExisting> = {}): LockerExisting {
  return {
    name_key: "leg press", name: "Leg Press", category: "Pernas Inferiores", block_type: "forca", cardio_fields: null,
    machine_settings: "banco furo 3", last_weight: 100, last_reps: 10, personal_record_weight: 120, times_performed: 4,
    last_performed_at: "2026-10-10T12:00:00.000Z", ...over,
  };
}

Deno.test("exercício novo: entra com a série mais pesada, o grupo da sessão e 1 execução", () => {
  const [r] = buildLockerUpserts({ ...base, sets: [
    { exercise_name: "Extensões de pernas", reps: 12, weight: 35 },
    { exercise_name: "Extensões de pernas", reps: 10, weight: 40 },
    { exercise_name: "Extensões de pernas", reps: 8, weight: 40 },
  ] });
  assertEquals(r.name_key, "extensoes de pernas");
  assertEquals([r.last_weight, r.last_reps, r.personal_record_weight], [40, 10, 40]);
  assertEquals([r.category, r.block_type, r.times_performed], ["Pernas Inferiores", "forca", 1]);
  assertEquals(r.last_performed_at, "2026-10-18T12:00:00.000Z");
});

Deno.test("exercício conhecido: conta a vez, mantém afinação, nome e recorde maior", () => {
  const [r] = buildLockerUpserts({ ...base, existing: [prev()], sets: [{ exercise_name: "leg  press", reps: 12, weight: 110 }] });
  assertEquals(r.name, "Leg Press");
  assertEquals(r.machine_settings, "banco furo 3");
  assertEquals([r.last_weight, r.last_reps, r.personal_record_weight, r.times_performed], [110, 12, 120, 5]);
});

Deno.test("recorde sobe quando a carga passa o anterior", () => {
  const [r] = buildLockerUpserts({ ...base, existing: [prev()], sets: [{ exercise_name: "Leg Press", reps: 5, weight: 130 }] });
  assertEquals(r.personal_record_weight, 130);
});

Deno.test("uma sessão antiga não reescreve o último, mas conta e pode subir o recorde", () => {
  const [r] = buildLockerUpserts({ ...base, sessionDate: "2026-10-01", existing: [prev()], sets: [{ exercise_name: "Leg Press", reps: 6, weight: 125 }] });
  assertEquals([r.last_weight, r.last_reps, r.last_performed_at], [100, 10, "2026-10-10T12:00:00.000Z"]);
  assertEquals([r.personal_record_weight, r.times_performed], [125, 5]);
});

Deno.test("edição (increment=false) não conta outra vez", () => {
  const [r] = buildLockerUpserts({ ...base, increment: false, existing: [prev()], sets: [{ exercise_name: "Leg Press", reps: 10, weight: 105 }] });
  assertEquals(r.times_performed, 4);
});

Deno.test("cardio: tipo, grupo Cardio e os campos usados", () => {
  const [r] = buildLockerUpserts({ ...base, sets: [{ exercise_name: "Bicicleta", duration_seconds: 1200, distance_km: 8 }] });
  assertEquals([r.block_type, r.category, r.cardio_fields, r.last_weight], ["cardio", "Cardio", ["duration", "distance"], null]);
});

Deno.test("o tipo vem do exercises_meta quando existe", () => {
  const [r] = buildLockerUpserts({ ...base, meta: [{ name: "Corda", block_type: "cardio" }], sets: [{ exercise_name: "Corda", laps: 5 }] });
  assertEquals([r.block_type, r.cardio_fields], ["cardio", ["laps"]]);
});

Deno.test("várias categorias na sessão: o exercício novo fica 'Outro'; nomes vazios caem", () => {
  const rows = buildLockerUpserts({ ...base, sessionCategories: ["Peito", "Costas"], sets: [{ exercise_name: "Supino", reps: 8, weight: 60 }, { exercise_name: "  ", reps: 5, weight: 5 }] });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].category, "Outro");
});

Deno.test("buildLockerUpserts: a afinação escrita no registo grava-se; sem ela, a do Armário fica; '' apaga (decisão 10)", () => {
  const prevSup = { ...prev(), machine_settings: "banco furo 3" };
  const run = (meta?: { name: string; machine_settings?: string }[]) =>
    buildLockerUpserts({ ...base, existing: [prevSup], meta, sets: [{ exercise_name: "Leg Press", reps: 10, weight: 100 }] })[0].machine_settings;
  assertEquals(run(), "banco furo 3");
  assertEquals(run([{ name: "Leg Press" }]), "banco furo 3");
  assertEquals(run([{ name: "Leg Press", machine_settings: " banco furo 5, pino 2 " }]), "banco furo 5, pino 2");
  assertEquals(run([{ name: "Leg Press", machine_settings: "" }]), null);
  // Um exercício novo, com afinação escrita logo à primeira.
  const novo = buildLockerUpserts({ ...base, meta: [{ name: "Remo sentado", machine_settings: "pé na 4" }], sets: [{ exercise_name: "Remo sentado", reps: 10, weight: 40 }] })[0];
  assertEquals(novo.machine_settings, "pé na 4");
});
