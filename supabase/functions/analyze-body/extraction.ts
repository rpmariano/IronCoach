// A leitura dos prints de uma pesagem — o que se testa sem o Deno.serve do
// index.ts: as métricas, as regras de extração (as mesmas no registo e na
// pré-leitura), o schema e o prompt do modo "preview" e a normalização do que
// o Gemini devolve.
//
// Registo unificado do Corpo (specs/plano-registo-plano-coach.md, decisões 2,
// 6 e 12): os prints são opcionais e convivem com os campos. "Ler os prints"
// (mode "preview") preenche o formulário SEM gravar; o que o atleta escreveu
// ganha sempre ao que se leu — também quando se grava direto com prints.

import { FONTE_NAO_RECONHECIDA, normalizarFonte, opcoesDeFonte } from "../_shared/sourceApps.ts";

// Colunas de métricas guardadas na BD e devolvidas pelo Gemini. A ordem/labels
// aqui espelham o que a app Renpho Health mostra num print típico.
// `label` = descrição curta (usada no histórico enviado ao Gemini).
// `renpho` = como o termo aparece na app Renpho Health em português (inclui a
//   grafia real da app, ex.: "Viceral"). `hint` = regra de desambiguação para
//   a extração — calibrado com screenshots reais da Renpho.
export const METRIC_FIELDS: { key: string; label: string; renpho: string; hint?: string }[] = [
  { key: "weight_kg", label: "Peso (kg)", renpho: "Peso", hint: "em kg" },
  { key: "bmi", label: "IMC", renpho: "IMC", hint: "índice (ex.: 25.2)" },
  { key: "body_fat_pct", label: "Gordura corporal (%)", renpho: "Gordura corporal",
    hint: "USA A PERCENTAGEM (ex.: 26.0 %), NÃO o valor em kg que aparece no donut da Visão geral" },
  { key: "skeletal_muscle_pct", label: "Músculo esquelético (%)", renpho: "Músculo esquelético", hint: "em %" },
  { key: "muscle_mass_kg", label: "Massa muscular (kg)", renpho: "Massa Muscular",
    hint: "USA OS KG (ex.: 56.70 kg), não a % que aparece ao lado" },
  { key: "body_water_pct", label: "Água corporal (%)", renpho: "Água corporal",
    hint: "USA A PERCENTAGEM (ex.: 53.4 %), não os kg ao lado" },
  { key: "protein_pct", label: "Proteína (%)", renpho: "Proteína",
    hint: "USA A PERCENTAGEM (ex.: 16.9 %), não os kg ao lado" },
  { key: "bone_mass_kg", label: "Massa óssea (kg)", renpho: "Massa óssea",
    hint: "USA OS KG (ex.: 2.98 kg), não a % ao lado" },
  { key: "bmr_kcal", label: "Metabolismo basal (kcal)", renpho: "TMB (Taxa Metabólica Basal)",
    hint: "em kcal (ex.: 1657)" },
  { key: "visceral_fat", label: "Gordura visceral (índice)", renpho: "Gordura Visceral (por vezes escrito \"Viceral\")",
    hint: "índice inteiro (ex.: 8), não uma percentagem" },
  { key: "subcutaneous_fat_pct", label: "Gordura subcutânea (%)", renpho: "Gordura subcutânea", hint: "em %" },
  { key: "metabolic_age", label: "Idade metabólica (anos)", renpho: "Idade Metabólica", hint: "em anos (ex.: 45)" },
  { key: "lean_body_mass_kg", label: "Massa magra (kg)", renpho: "Peso corporal sem gordura (massa magra / isenta de gordura)",
    hint: "em kg (ex.: 59.68)" },
];

/** As regras de extração dos prints (as mesmas do registo por foto, que as junta ao resumo). */
export function extractionRules(): string {
  const mapping = METRIC_FIELDS
    .map((f) => `- ${f.key} — na Renpho aparece como "${f.renpho}"${f.hint ? ` — ${f.hint}` : ""}`)
    .join("\n");
  return (
    "As imagens seguintes são capturas de ecrã (screenshots) da aplicação Renpho Health, " +
    "em português, que mostram os resultados de uma pesagem de composição corporal " +
    "(ecrãs possíveis: \"Composição corporal / Comparativo\", \"Relatório de métricas / Visão geral\", ou \"Tendências\"). " +
    "Extrai o valor numérico ATUAL de cada métrica. Devolve exatamente estas chaves:\n" +
    mapping +
    "\n\nRegras de extração (importantes — calibradas com a app real):\n" +
    "- Devolve apenas o número, sem unidades nem símbolos. Usa ponto como separador decimal.\n" +
    "- Se uma métrica não aparecer em nenhuma imagem, devolve null nessa chave (não inventes).\n" +
    "- Várias métricas da Renpho mostram DOIS valores (ex.: \"56.70 kg, 70.3 %\"). Segue rigorosamente " +
    "a unidade indicada em cada chave acima (kg ou %).\n" +
    "- Muitas métricas têm ao lado uma ETIQUETA DE ESTADO (ex.: \"Média\", \"Normal\", \"Alto\", " +
    "\"Baixo\", \"Ligeiramente alto\", \"Excelente\", \"Padrão\"). Coloca essa etiqueta, tal e qual " +
    "aparece na imagem, no objeto \"classifications\" sob a MESMA chave da métrica. Se uma métrica " +
    "não tiver etiqueta visível, devolve null nessa chave de \"classifications\". A etiqueta NÃO é " +
    "um valor numérico — nunca a metas em \"metrics\".\n" +
    "- No ecrã \"Comparativo\", cada cartão mostra o valor grande (atual) e por baixo uma variação " +
    "com sinal (ex.: \"−0.40\", \"+0.1\"). Extrai SEMPRE o valor grande atual, NUNCA a variação.\n" +
    "- No ecrã \"Tendências\" (gráfico), usa o valor mais recente/último ponto, não a meta nem os extremos.\n" +
    "- Combina a informação de todas as imagens numa única leitura coerente da mesma pesagem.\n" +
    "- source_app: identifica de QUE APLICAÇÃO são estes prints, pelo cabeçalho, pelo nome visível, pelo tipo " +
    "de letra e pelo estilo do ecrã (cores, ícones, disposição dos cartões) — não pelos valores nem pelo facto " +
    "de serem métricas de composição corporal, que são as mesmas em todas as balanças. Devolve exatamente uma " +
    "destas chaves: " + opcoesDeFonte("corpo").join(", ") + ". A Renpho Health reconhece-se pelo nome no topo, " +
    "pelo donut da Visão geral e pela terminologia própria (ex.: \"Gordura Viceral\" escrito assim, " +
    "\"Peso corporal sem gordura\"). Se as imagens forem de outra app (Withings, Xiaomi Zepp, Tanita, Huawei " +
    "Health...), ou se não tiveres a certeza, devolve \"" + FONTE_NAO_RECONHECIDA + "\" — nunca escolhas a app " +
    "mais parecida por eliminação."
  );
}

export const PREVIEW_SCHEMA = {
  type: "OBJECT",
  properties: {
    metrics: {
      type: "OBJECT",
      properties: Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, { type: "NUMBER", nullable: true }])),
      required: METRIC_FIELDS.map((f) => f.key),
    },
    classifications: {
      type: "OBJECT",
      properties: Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, { type: "STRING", nullable: true }])),
      required: METRIC_FIELDS.map((f) => f.key),
    },
    source_app: { type: "STRING", nullable: true, enum: opcoesDeFonte("corpo") },
  },
  required: ["metrics", "source_app"],
};

/** O prompt da pré-leitura: só ler, sem resumo nem histórico. */
export function buildPreviewPrompt(notes: string | null): string {
  let prompt = extractionRules() +
    "\n\nNesta leitura NÃO escreves resumo nenhum: só os valores, as etiquetas e a app.";
  if (notes && notes.trim()) {
    prompt += "\n\nObservação do utilizador sobre esta pesagem (só contexto — os valores vêm das imagens): " +
      `"${notes.trim()}"`;
  }
  return prompt + "\n\nResponde apenas com JSON estruturado conforme o schema.";
}

export type Metrics = Record<string, number | null>;

/** Aceita apenas números finitos e >= 0; tudo o resto vira null. */
export const metricNum = (v: unknown): number | null =>
  typeof v === "number" && isFinite(v) && v >= 0 ? v : null;

/** Os valores que o atleta escreveu no formulário (null = não escreveu). Nada válido → null. */
export function parseTypedMetrics(raw: unknown): Metrics | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: Metrics = {};
  for (const f of METRIC_FIELDS) out[f.key] = metricNum(r[f.key]);
  return Object.values(out).some((v) => v !== null) ? out : null;
}

/** O lido com o escrito por cima: o atleta ganha sempre. */
export function mergeTyped(read: Metrics, typed: Metrics | null): Metrics {
  const out: Metrics = {};
  for (const f of METRIC_FIELDS) out[f.key] = typed?.[f.key] ?? read[f.key] ?? null;
  return out;
}

/** O que dizer ao modelo quando o atleta já escreveu valores: prevalecem e entram no resumo. */
export function typedMetricsSection(typed: Metrics | null): string {
  if (!typed) return "";
  const lines = METRIC_FIELDS.filter((f) => typed[f.key] !== null).map((f) => `- ${f.key}: ${typed[f.key]}`);
  if (!lines.length) return "";
  return "\n\nVALORES QUE O ATLETA ESCREVEU (prevalecem sobre o que leres nas imagens — o resumo fala destes; " +
    "devolve-os também em \"metrics\" tal e qual):\n" + lines.join("\n");
}

/** As etiquetas de estado só das métricas com valor e que vieram dos prints (escrita por cima, a etiqueta já não é dela). */
export function sanitizeClassifications(raw: unknown, metrics: Metrics, read: Metrics | null = null): Record<string, string> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of METRIC_FIELDS) {
    const label = r[f.key];
    const sameAsRead = !read || read[f.key] === metrics[f.key];
    if (metrics[f.key] !== null && sameAsRead && typeof label === "string" && label.trim()) {
      out[f.key] = label.trim().slice(0, 40);
    }
  }
  return out;
}

/** O que o Gemini leu, normalizado: métricas (com o escrito por cima), etiquetas e a app. */
export function normalizeExtraction(
  parsed: { metrics?: unknown; classifications?: unknown; source_app?: unknown } | null | undefined,
  typed: Metrics | null = null,
): { read: Metrics; metrics: Metrics; classifications: Record<string, string>; sourceApp: string; hasAny: boolean } {
  const rawMetrics = ((parsed?.metrics ?? {}) as Record<string, unknown>);
  const read: Metrics = {};
  for (const f of METRIC_FIELDS) read[f.key] = metricNum(rawMetrics[f.key]);
  const metrics = mergeTyped(read, typed);
  const classifications = sanitizeClassifications(parsed?.classifications, metrics, read);
  /* A fonte NÃO é uma classificação de métrica nenhuma — vai à boleia do
     mesmo jsonb por uma razão prática: `body_assessments` não tem coluna
     `details` (ao contrário de `runs`). `classifications` é indexado pelas
     chaves de METRIC_FIELDS, onde "source_app" nunca pode cair. */
  const sourceApp = normalizarFonte(parsed?.source_app, "corpo");
  classifications.source_app = sourceApp;
  return { read, metrics, classifications, sourceApp, hasAny: Object.values(metrics).some((v) => v !== null) };
}

