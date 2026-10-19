import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildPreviewPrompt,
  extractionRules,
  mergeTyped,
  METRIC_FIELDS,
  normalizeExtraction,
  parseTypedMetrics,
  PREVIEW_SCHEMA,
  sanitizeClassifications,
  typedMetricsSection,
} from "./extraction.ts";

const nulls = () => Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, null])) as Record<string, number | null>;

Deno.test("parseTypedMetrics: só números ≥ 0 nas chaves conhecidas; nada válido → null", () => {
  const t = parseTypedMetrics({ weight_kg: 78.5, body_fat_pct: -1, bmi: "25", inventada: 3 })!;
  assertEquals(t.weight_kg, 78.5);
  assertEquals(t.body_fat_pct, null);
  assertEquals(t.bmi, null);
  assertEquals("inventada" in t, false);
  assertEquals(parseTypedMetrics({ weight_kg: null }), null);
  assertEquals(parseTypedMetrics(null), null);
  assertEquals(parseTypedMetrics("x"), null);
});

Deno.test("mergeTyped: o que o atleta escreveu ganha; o resto é o lido", () => {
  const read = { ...nulls(), weight_kg: 79, body_fat_pct: 20 };
  const typed = { ...nulls(), weight_kg: 78.5 };
  const m = mergeTyped(read, typed);
  assertEquals([m.weight_kg, m.body_fat_pct], [78.5, 20]);
  assertEquals(mergeTyped(read, null).weight_kg, 79);
});

Deno.test("normalizeExtraction: etiqueta só nas métricas lidas e não escritas por cima; a app vai junta", () => {
  const parsed = {
    metrics: { weight_kg: 79, body_fat_pct: 20, bmi: -3 },
    classifications: { weight_kg: "Normal", body_fat_pct: " Alto ", bmi: "Baixo" },
    source_app: "renpho",
  };
  const r = normalizeExtraction(parsed, { ...nulls(), weight_kg: 78.5 });
  assertEquals(r.metrics.weight_kg, 78.5);
  assertEquals(r.read.weight_kg, 79);
  assertEquals(r.classifications.weight_kg, undefined); // escrito por cima: a etiqueta já não é dele
  assertEquals(r.classifications.body_fat_pct, "Alto");
  assertEquals(r.classifications.bmi, undefined); // sem valor
  assertEquals(r.classifications.source_app, r.sourceApp);
  assert(r.hasAny);
  assertEquals(normalizeExtraction({ metrics: {} }).hasAny, false);
  // Só com o escrito também há valores.
  assert(normalizeExtraction({ metrics: {} }, { ...nulls(), weight_kg: 70 }).hasAny);
});

Deno.test("sanitizeClassifications: etiquetas curtas e só com valor", () => {
  const c = sanitizeClassifications({ weight_kg: "x".repeat(60), bmi: "Normal", source_app: "renpho" }, { ...nulls(), weight_kg: 70 });
  assertEquals(c.weight_kg.length, 40);
  assertEquals(c.bmi, undefined);
  assertEquals(c.source_app, undefined); // a app trata-se à parte
});

Deno.test("typedMetricsSection: vazio sem nada escrito; com valores, prevalecem e entram no resumo", () => {
  assertEquals(typedMetricsSection(null), "");
  assertEquals(typedMetricsSection(nulls()), "");
  const s = typedMetricsSection({ ...nulls(), weight_kg: 78.5 });
  assertStringIncludes(s, "prevalecem");
  assertStringIncludes(s, "- weight_kg: 78.5");
});

Deno.test("buildPreviewPrompt: as mesmas regras de extração, sem resumo; as observações só como contexto", () => {
  const p = buildPreviewPrompt("em jejum");
  assert(p.startsWith(extractionRules()));
  assertStringIncludes(p, "NÃO escreves resumo");
  assertStringIncludes(p, '"em jejum"');
  assertEquals(buildPreviewPrompt(null).includes("Observação"), false);
});

Deno.test("PREVIEW_SCHEMA: sem resumo, com todas as métricas e sem arrays", () => {
  const props = PREVIEW_SCHEMA.properties as Record<string, unknown>;
  assertEquals(Object.keys(props).sort(), ["classifications", "metrics", "source_app"]);
  assertEquals(JSON.stringify(PREVIEW_SCHEMA).includes('"ARRAY"'), false);
  assertEquals(Object.keys((props.metrics as { properties: object }).properties).length, METRIC_FIELDS.length);
});

Deno.test("handler: preview não grava, o revisto não volta a ler e o escrito chega à leitura (ligações no código)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(src, 'if (body.mode === "preview") {');
  assertStringIncludes(src, "const reviewed = body.reviewed === true && typed !== null;");
  assertStringIncludes(src, "await analyzeWithGemini(images, mime, rawNotes, history || [], geminiKey, await memoryPromise, await goalsCtxPromise, extractionDeadline, rawTime, typed);");
  assertStringIncludes(src, "extractionRules() + typedMetricsSection(typed)");
  // A pré-leitura não toca no Storage nem na tabela.
  const preview = src.slice(src.indexOf('if (body.mode === "preview") {'), src.indexOf('if (body.mode === "manual") {'));
  assertEquals(preview.includes("storage"), false);
  assertEquals(preview.includes("insert("), false);
});
