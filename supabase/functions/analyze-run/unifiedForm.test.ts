import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { cleanTypedArrays, extractionFromForm, hasTypedRunValues, imageOnlyFromRead, mergeRunExtraction } from "./index.ts";

Deno.test("extractionFromForm: números do formulário; inteiros onde a coluna é inteira; lixo vira null", () => {
  const e = extractionFromForm({ distance_km: 8.2, duration_seconds: 2700, avg_heart_rate_bpm: 148.5, cadence_spm: "170", splits: [{ distance_km: 1, time_seconds: 330 }] });
  assertEquals(e.distance_km, 8.2);
  assertEquals(e.duration_seconds, 2700);
  assertEquals(e.avg_heart_rate_bpm, null);
  assertEquals(e.cadence_spm, null);
  assertEquals(e.splits?.length, 1);
  assertEquals(hasTypedRunValues(e), true);
  assertEquals(hasTypedRunValues(extractionFromForm({ splits: [], hr_zones: [] })), false);
  assertEquals(hasTypedRunValues(null), false);
});

Deno.test("mergeRunExtraction: o que o atleta escreveu ganha à leitura; o resto fica o lido", () => {
  const read = extractionFromForm({ distance_km: 8.31, duration_seconds: 2712, avg_heart_rate_bpm: 150, splits: [{ distance_km: 1, time_seconds: 320 }] });
  read.source_app = "garmin";
  const typed = extractionFromForm({ distance_km: 8, splits: [] });
  const m = mergeRunExtraction(read, typed);
  assertEquals(m.distance_km, 8);
  assertEquals(m.duration_seconds, 2712);
  assertEquals(m.avg_heart_rate_bpm, 150);
  assertEquals(m.splits?.length, 1); // parciais vazias não apagam as lidas
  assertEquals(m.source_app, "garmin");
  assertEquals(mergeRunExtraction(read, null), read);
});

Deno.test("imageOnlyFromRead: a app normalizada, números limpos e a temperatura dentro do razoável", () => {
  const r = imageOnlyFromRead({ source_app: "garmin", regularity_score: 82, recommended_hydration_ml: -3, temperature_c: 18.26 });
  assertEquals(r.regularity_score, 82);
  assertEquals(r.recommended_hydration_ml, null);
  assertEquals(r.temperature_c, 18.3);
  assert(typeof r.source_app === "string");
  assertEquals(imageOnlyFromRead({ temperature_c: 80 }).temperature_c, null);
  assertEquals(imageOnlyFromRead(null).regularity_score, null);
});

Deno.test("handler: preview não grava, o revisto não volta a ler e o escrito ganha (ligações no código)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(src, 'if (body.mode === "preview") {');
  assertStringIncludes(src, "const reviewed = body.reviewed === true && typedAny;");
  assertStringIncludes(src, "result = { extraction: { ...typed!, ...imageOnlyFromRead(body.read_details) }, usage: null };");
  assertStringIncludes(src, "if (typedAny) result = { ...result, extraction: mergeRunExtraction(result.extraction, typed) };");
  assertStringIncludes(src, "const extraction: RunExtraction = extractionFromForm(body);");
  const preview = src.slice(src.indexOf('if (body.mode === "preview") {'), src.indexOf('if (body.mode === "manual") {'));
  assertEquals(preview.includes("storage"), false);
  assertEquals(preview.includes(".insert("), false);
});

Deno.test("cleanTypedArrays: parciais com um número, zonas com os dois (decimais ficam); lixo cai", () => {
  const t = cleanTypedArrays(extractionFromForm({
    splits: [{ distance_km: 1, time_seconds: 330 }, { distance_km: "x" }, null, { time_seconds: 300 }],
    hr_zones: [{ zone: 1, minutes: 0.5 }, { zone: 2 }, "z", { zone: 3, minutes: -1 }],
  }));
  assertEquals(t.splits, [{ distance_km: 1, time_seconds: 330 }, { distance_km: null, time_seconds: 300 }]);
  assertEquals(t.hr_zones, [{ zone: 1, minutes: 0.5 }]);
  assertEquals(cleanTypedArrays(extractionFromForm({ splits: [null], hr_zones: [] })).splits, null);
});
