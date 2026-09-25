// IronHealth · analyze-body Edge Function
// Modo normal: recebe 1+ prints da app Renpho Health (base64) + data +
// observações opcionais, extrai as métricas de composição corporal com o
// Gemini, gera um breve resumo (comparando com o histórico se existir) e
// grava a avaliação em body_assessments.
// Modo reanálise (assessment_id presente): repesca os prints já guardados
// dessa avaliação no Storage e volta a analisar, substituindo os valores.
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { INTERVENTION_ORIGIN } from "../_shared/formulas/interventionOutcomes.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CAROL_TONE_RULES_SHORT, carolLanguageRule, carolRecordAnalysisRules, upstreamErrorText } from "../_shared/carolTone.ts";
import {
  GOALS_REVIEW_SCHEMA,
  MANUAL_SUMMARY_SCHEMA,
  BODY_GOAL_COLUMNS,
  GOALS_MISSING_COOLDOWN_DAYS,
  GOALS_REVIEW_COOLDOWN_DAYS,
  MACRO_GOAL_COLUMNS,
  fetchGoalsContext,
  goalsInterventionFor,
  goalsReviewSection,
  parseGoalsReview,
  parseManualSummary,
  type GoalsContext,
  type GoalsReview,
} from "./goalsReview.ts";
import { fetchSharedMemoryBlock, memoryPromptSection } from "../_shared/carolMemory.ts";
import { FONTE_NAO_RECONHECIDA, normalizarFonte, opcoesDeFonte } from "../_shared/sourceApps.ts";
import {
  fetchGeminiWithTimeout as fetchGemini,
  GEMINI_RETRYABLE_STATUSES,
  geminiBusyMessage,
  hasTimeFor,
  requestDeadlines,
} from "../_shared/geminiFetch.ts";

const MAX_PHOTOS = 6;
const MAX_NOTES_LENGTH = 500;
const HISTORY_FOR_CONTEXT = 5; // avaliações anteriores enviadas ao Gemini para comparação

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Alias que segue sempre o modelo flash estável mais recente — evita 404s
// quando a Google descontinua modelos para contas novas.
const GEMINI_MODEL = "gemini-flash-latest";
// Tempo máximo por chamada ao Gemini antes de desistir e tentar mais uma vez.
// A API do Gemini (sobretudo no tier gratuito) tem latência muito variável —
// isto evita que uma chamada presa arraste a função até ao limite rígido da
// plataforma (~150s), o que produz um erro genérico e ilegível no cliente.
const GEMINI_TIMEOUT_MS = 40000;
const GEMINI_RETRIES = 1; // repetições automáticas após timeout, antes de desistir de vez

// Colunas de métricas guardadas na BD e devolvidas pelo Gemini. A ordem/labels
// aqui espelham o que a app Renpho Health mostra num print típico.
// `label` = descrição curta (usada no histórico enviado ao Gemini).
// `renpho` = como o termo aparece na app Renpho Health em português (inclui a
//   grafia real da app, ex.: "Viceral"). `hint` = regra de desambiguação para
//   a extração — calibrado com screenshots reais da Renpho.
const METRIC_FIELDS: { key: string; label: string; renpho: string; hint?: string }[] = [
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

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    metrics: {
      type: "OBJECT",
      properties: Object.fromEntries(
        METRIC_FIELDS.map((f) => [f.key, { type: "NUMBER", nullable: true }]),
      ),
      // Obriga o Gemini a decidir explicitamente cada chave (mesmo que a
      // resposta seja null) em vez de poder simplesmente omiti-la — sem
      // isto, observámos avaliações em que o resumo em texto menciona
      // valores concretos (ex.: gordura visceral, água corporal) que nunca
      // chegam a aparecer no objeto `metrics` estruturado.
      required: METRIC_FIELDS.map((f) => f.key),
    },
    // Etiqueta de estado que a Renpho mostra ao lado de cada métrica
    // (ex.: "Média", "Alto", "Baixo", "Ligeiramente alto", "Excelente").
    classifications: {
      type: "OBJECT",
      properties: Object.fromEntries(
        METRIC_FIELDS.map((f) => [f.key, { type: "STRING", nullable: true }]),
      ),
      required: METRIC_FIELDS.map((f) => f.key),
    },
    // Que app deu estes prints — ver _shared/sourceApps.ts. Não é uma
    // métrica: é o que permite, um dia, dizer ao atleta QUE ECRÃ traz o que
    // falta em vez de só nomear o campo. O enum inclui sempre "desconhecida":
    // sem essa saída, um print da Withings era arrumado à força na Renpho.
    source_app: { type: "STRING", nullable: true, enum: opcoesDeFonte("corpo") },
    summary: { type: "STRING" },
    goals_review: GOALS_REVIEW_SCHEMA,
  },
  // goals_review fica fora de `required` de propósito: é um juízo, não uma
  // leitura — se o modelo o omitir, a pesagem grava-se na mesma.
  required: ["metrics", "summary", "source_app"],
};

// Repetições quando o Gemini está ocupado ou sem resposta, e o prazo do
// pedido: ver _shared/geminiFetch.ts. Os valores por omissão são os desta função.
function fetchGeminiWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = GEMINI_TIMEOUT_MS,
  retries = GEMINI_RETRIES,
  deadline = Number.POSITIVE_INFINITY,
): Promise<Response> {
  return fetchGemini(url, options, timeoutMs, retries, deadline);
}

/* ── Depois de gravar uma avaliação: o perfil acompanha ────────────────────
   Duas coisas que o registo de uma avaliação corporal deixava por fazer, as
   duas relatadas pelo utilizador a partir do Perfil.

   1. O PESO. `profiles.weight_kg` era escrito à mão no Perfil e no arranque,
      e mais nada — a balança dizia um número, o perfil continuava com outro.
      E é `profiles.weight_kg` que alimenta os hidratos da véspera da prova,
      a vida útil das sapatilhas e o cálculo de TDEE, por isso a divergência
      não é cosmética. Uma avaliação recente (≤ PESO_RECENTE_DIAS) e que seja
      a MAIS RECENTE do atleta passa a repor o peso do perfil. Editar uma
      avaliação antiga não mexe em nada: não é o peso de agora.

   2. OS OBJETIVOS. Esta era a única função analyze-* que nunca levantava uma
      intervenção da Carol — registar o corpo não levava a conversa nenhuma.
      Faltando os objetivos do corpo ou os de macronutrientes, fica marcada
      uma intervenção a pedir que os definam em conjunto. */
const PESO_RECENTE_DIAS = 7;

function daysBetweenISO(fromISO: string, toISO: string): number | null {
  const a = Date.parse(`${String(fromISO).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toISO).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

// deno-lint-ignore no-explicit-any
export async function syncProfileAfterAssessment(sb: any, userId: string, assessment: any, goalsReview: GoalsReview = null): Promise<void> {
  try {
    if (!assessment?.date) return;
    const todayISO = new Date().toISOString().slice(0, 10);
    const patch: Record<string, unknown> = {};

    // ── 1. O peso ──────────────────────────────────────────────────────
    const peso = Number(assessment.weight_kg);
    const idade = daysBetweenISO(assessment.date, todayISO);
    /* `idade >= -1` e não `>= 0`: o servidor conta os dias em UTC e a data da
       avaliação é escrita na hora LOCAL do atleta. Entre a meia-noite e a uma
       da manhã em Lisboa no horário de verão, o "hoje" em UTC ainda é ontem —
       uma pesagem acabada de registar dava idade -1 e o peso do perfil não se
       repunha, sem nada nos logs a dizer porquê. O desencontro é dos fusos a
       ORIENTE de UTC — os que já entraram no dia seguinte enquanto o servidor
       ainda conta o anterior. Um dia de folga cobre qualquer um deles sem
       abrir a janela a datas futuras a sério. */
    const recente = idade !== null && idade >= -1 && idade <= PESO_RECENTE_DIAS;
    /* Só vale como "o corpo de agora" a avaliação recente e sem nenhuma mais
       nova: editar a de há três dias quando a de ontem já entrou não pode
       fazer recuar o peso — nem pedir para rever objetivos com dados velhos. */
    let ehAAtual = false;
    if (recente) {
      const { data: maisRecente, error: erroMaisRecente } = await sb
        .from("body_assessments")
        .select("date")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Sem conseguir confirmar que é a mais recente, não se trata como tal.
      const limite = maisRecente?.date ? String(maisRecente.date).slice(0, 10) : null;
      ehAAtual = !erroMaisRecente && (!limite || String(assessment.date).slice(0, 10) >= limite);
    }
    if (Number.isFinite(peso) && peso > 0 && ehAAtual) {
      patch.weight_kg = peso;
    }

    // ── 2. Os objetivos ────────────────────────────────────────────────
    const { data: perfil, error: erroPerfil } = await sb
      .from("profiles")
      .select([...BODY_GOAL_COLUMNS, ...MACRO_GOAL_COLUMNS, "coach_intervention_status"].join(", "))
      .eq("id", userId)
      .maybeSingle();
    // O supabase-js não LANÇA nestes casos: devolve o erro no objeto. Sem o
    // ler, uma leitura recusada (RLS, coluna em falta) passava por "o atleta
    // não tem perfil" e saltava a intervenção sem deixar rasto nenhum.
    if (erroPerfil) console.warn("syncProfileAfterAssessment: falha a ler o perfil:", erroPerfil);

    if (perfil) {
      /* Períodos de espera depois de uma proposta de objetivos (aceite,
         recusada, por decidir, ou a marca de "agora não"): rever, 14 dias e
         só pela avaliação atual; o convite a definir quando faltam, 7 dias
         (decidido a 2026-09-23 — insiste, mas não a cada pesagem). Sem
         conseguir ler as propostas, não se chama: pior é chamar em
         repetição. */
      const desde = new Date(Date.now() - GOALS_REVIEW_COOLDOWN_DAYS * 86400000).toISOString();
      const { data: recentes, error: erroPropostas } = await sb
        .from("coach_goal_proposals")
        .select("created_at")
        .eq("user_id", userId)
        .gte("created_at", desde);
      if (erroPropostas) console.warn("syncProfileAfterAssessment: falha a ler as propostas:", erroPropostas);
      const ultimaProposta = erroPropostas ? null : (recentes || []).map((r: { created_at: string }) => r.created_at).sort().pop() ?? null;
      const diasDesde = ultimaProposta ? (Date.now() - Date.parse(ultimaProposta)) / 86400000 : Infinity;
      const reviewAllowed = !erroPropostas && ehAAtual && !!goalsReview?.needed && diasDesde >= GOALS_REVIEW_COOLDOWN_DAYS;
      const missingAllowed = !erroPropostas && diasDesde >= GOALS_MISSING_COOLDOWN_DAYS;
      const intervencao = goalsInterventionFor(perfil, goalsReview, { reviewAllowed, missingAllowed });
      if (intervencao) {
        patch.coach_intervention_status = "needed";
        patch.coach_intervention_reason = intervencao;
        // De onde veio o aviso (5.5, coach_interventions).
        patch.coach_intervention_origin = INTERVENTION_ORIGIN.BODY;
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error: erroUpdate } = await sb.from("profiles").update(patch).eq("id", userId);
      if (erroUpdate) console.warn("syncProfileAfterAssessment: falha a gravar o perfil:", erroUpdate);
    }
  } catch (e) {
    // Nunca é motivo para falhar o registo: a avaliação já está gravada.
    console.warn("syncProfileAfterAssessment falhou:", e);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Chunked para evitar exceder o limite de argumentos de String.fromCharCode
// com imagens grandes.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function checkAndLogAppImage(
  sb: any,
  userId: string,
  category: "run" | "gym" | "body",
  imagesB64: string[],
  mime: string,
  extractionResult: Record<string, unknown>
) {
  try {
    const { data: mappings } = await sb
      .from("app_screen_mappings")
      .select("app_name, detection_keywords")
      .eq("category", category)
      .eq("is_trained", true);

    let isKnownApp = false;
    let matchedAppName: string | null = null;
    const extractionStr = JSON.stringify(extractionResult).toLowerCase();

    if (mappings && mappings.length > 0) {
      for (const map of mappings) {
        const keywords: string[] = map.detection_keywords || [];
        if (keywords.length > 0) {
          const matchCount = keywords.filter((kw: string) =>
            extractionStr.includes(kw.toLowerCase())
          ).length;
          if (matchCount >= 2 || (keywords.length === 1 && matchCount === 1)) {
            isKnownApp = true;
            matchedAppName = map.app_name;
            break;
          }
        }
      }
    }

    if (!isKnownApp && imagesB64.length > 0) {
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      const unknownPath = `${userId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await sb.storage
        .from("unknown-app-photos")
        .upload(unknownPath, base64ToBytes(imagesB64[0]), { contentType: mime });

      if (!uploadError) {
        await sb.from("unknown_app_image_logs").insert({
          user_id: userId,
          category,
          image_path: unknownPath,
          detected_app_guess: matchedAppName,
          best_effort_result: extractionResult,
          status: "pending",
        });
      }
    }
  } catch (err) {
    console.warn("checkAndLogAppImage failed silently:", err);
  }
}


// deno-lint-ignore no-explicit-any
function historyContext(history: any[]): string {
  if (!history || history.length === 0) {
    return "O utilizador ainda não tem avaliações anteriores registadas.";
  }
  const lines = history.map((a) => {
    const parts = METRIC_FIELDS
      .filter((f) => a[f.key] !== null && a[f.key] !== undefined)
      .map((f) => `${f.label}: ${a[f.key]}`);
    return `- ${a.date}: ${parts.join(", ") || "sem valores"}`;
  });
  return "Histórico de avaliações anteriores (da mais recente para a mais antiga):\n" +
    lines.join("\n");
}

// A estrutura comum às análises de registo (_shared/carolTone.ts), com o que
// se lê numa avaliação corporal. "O que vigiar" em vez de "O que corrigir":
// uma pesagem não se corrige, acompanha-se. Partilhada pelo resumo do modo
// por foto (buildPrompt) e do modo manual (generateBodySummaryFromMetrics).
const BODY_ANALYSIS_RULES = carolRecordAnalysisRules({
  readingLabel: "Os números",
  readingHint:
    "a leitura dos valores desta avaliação e a evolução face à anterior — peso, gordura corporal, massa muscular, " +
    "água — com o ritmo da mudança.",
  focusHint:
    "Vai buscá-los à evolução face ao histórico e ao objetivo dele: o que desceu ou subiu no sentido certo, e o " +
    "que isso diz do treino e da alimentação das últimas semanas. Para o que vigiar, olha para o que piorou ou não " +
    "mexeu face ao objetivo, sem alarmismos nem diagnósticos médicos.",
  fixLabel: "O que vigiar",
  sentences: "5 e 8",
});

function buildPrompt(notes: string | null, history: unknown[], memoryBlock: string | null = null, goalsCtx: GoalsContext | null = null): string {
  const mapping = METRIC_FIELDS
    .map((f) => `- ${f.key} — na Renpho aparece como "${f.renpho}"${f.hint ? ` — ${f.hint}` : ""}`)
    .join("\n");

  let prompt =
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
    "mais parecida por eliminação.\n\n" +
    // deno-lint-ignore no-explicit-any
    historyContext(history as any[]) +
    "\n\n" +
    (memoryBlock
      ? memoryPromptSection(memoryBlock) +
        "A memória acima serve só para o campo \"summary\". Os valores de \"metrics\" vêm SEMPRE e só das imagens, " +
        "nunca do que o atleta disse no chat nem de notas antigas.\n\n"
      : "") +
    "No campo \"summary\" és a Carol, a treinadora deste atleta, a comentar em primeira pessoa, em português de " +
    "Portugal, os valores desta pesagem. Se existir histórico acima, compara com a avaliação mais recente e comenta a " +
    "evolução (o que melhorou, o que piorou, ex.: peso, gordura corporal, massa muscular). " +
    "Sê direta e prática, sem alarmismos e sem dar diagnósticos médicos.\n" +
    CAROL_TONE_RULES_SHORT + "\n" +
    BODY_ANALYSIS_RULES + "\n" +
    carolLanguageRule(goalsCtx?.level ?? null) + "\n\n" +
    goalsReviewSection(goalsCtx?.goals ?? null);
  if (notes && notes.trim()) {
    prompt +=
      "\n\nObservação do utilizador sobre esta pesagem (usa-a como contexto): " +
      `"${notes.trim()}"`;
  }
  prompt += "\n\nResponde apenas com JSON estruturado conforme o schema.";
  return prompt;
}

// Contagem de tokens de uma chamada ao Gemini (usageMetadata da resposta),
// usada para estimar o custo real da API — ver admin_logs/painel de custos.
// cached_tokens: tokens deste pedido servidos por caching implícito
// (automático, sem custo de armazenamento) — instrumentado para decidir
// se vale a pena passar a caching explícito. Ver painel Custos API/Admin.
type GeminiUsage = { input_tokens: number; output_tokens: number; cached_tokens: number };

// Chama o Gemini com as imagens (base64) + histórico + observações, devolve as
// métricas normalizadas, o resumo e os tokens consumidos (ou lança um erro
// com mensagem amigável).
async function analyzeWithGemini(
  images: string[],
  mime: string,
  notes: string | null,
  history: unknown[],
  geminiKey: string,
  memoryBlock: string | null = null,
  goalsCtx: GoalsContext | null = null,
  deadline = Number.POSITIVE_INFINITY,
): Promise<
  {
    metrics: Record<string, number | null>;
    classifications: Record<string, string>;
    summary: string;
    sourceApp: string;
    usage: GeminiUsage;
    goalsReview: GoalsReview;
  }
> {
  const parts: unknown[] = [{ text: buildPrompt(notes, history, memoryBlock, goalsCtx) }];
  for (const b64 of images) {
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }
  const geminiRes = await fetchGeminiWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          response_mime_type: "application/json",
          response_schema: RESPONSE_SCHEMA,
        },
      }),
    },
    GEMINI_TIMEOUT_MS,
    GEMINI_RETRIES,
    deadline,
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("Gemini error:", geminiRes.status, errText);
    if (GEMINI_RETRYABLE_STATUSES.has(geminiRes.status)) {
      // Já se tentou de novo (fetchGeminiWithTimeout) e continuou ocupado.
      throw new Error(geminiBusyMessage("ler a avaliação"));
    }
    throw new Error(upstreamErrorText(geminiRes.status));
  }

  const geminiJson = await geminiRes.json();
  const usage: GeminiUsage = {
    input_tokens: Number(geminiJson?.usageMetadata?.promptTokenCount) || 0,
    output_tokens: Number(geminiJson?.usageMetadata?.candidatesTokenCount) || 0,
    cached_tokens: Number(geminiJson?.usageMetadata?.cachedContentTokenCount) || 0,
  };
  const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed: {
    metrics?: Record<string, unknown>;
    classifications?: Record<string, unknown>;
    summary?: unknown;
    source_app?: unknown;
    goals_review?: unknown;
  };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("Gemini devolveu JSON inválido:", rawText);
    throw new Error("A análise devolveu um formato inesperado. Tenta novamente.");
  }

  // Aceita apenas números finitos e >= 0; tudo o resto vira null.
  const num = (v: unknown): number | null =>
    typeof v === "number" && isFinite(v) && v >= 0 ? v : null;
  const rawMetrics = (parsed.metrics ?? {}) as Record<string, unknown>;
  const metrics: Record<string, number | null> = {};
  for (const f of METRIC_FIELDS) metrics[f.key] = num(rawMetrics[f.key]);

  const hasAny = Object.values(metrics).some((v) => v !== null);
  if (!hasAny) {
    throw new Error(
      "Não foi possível ler valores nas imagens. Confirma que é um print da Renpho Health, com boa nitidez.",
    );
  }

  // Classificações: só guarda strings não vazias, e só para métricas com valor.
  const rawClass = (parsed.classifications ?? {}) as Record<string, unknown>;
  const classifications: Record<string, string> = {};
  for (const f of METRIC_FIELDS) {
    const label = rawClass[f.key];
    if (metrics[f.key] !== null && typeof label === "string" && label.trim()) {
      classifications[f.key] = label.trim().slice(0, 40);
    }
  }

  /* A fonte NÃO é uma classificação de métrica nenhuma — vai à boleia do
     mesmo jsonb por uma razão prática: `body_assessments` não tem coluna
     `details` (ao contrário de `runs`), e este trabalho não abre migrações.
     `classifications` é indexado pelas chaves de METRIC_FIELDS, onde
     "source_app" nunca pode cair, por isso não colide com nada. Se um dia
     houver coluna própria, é daqui que sai. */
  const sourceApp = normalizarFonte(parsed.source_app, "corpo");
  classifications.source_app = sourceApp;

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  return { metrics, classifications, summary, sourceApp, usage, goalsReview: parseGoalsReview(parsed.goals_review) };
}

// Gera o resumo/comentário do Coach a partir de valores indicados manualmente
// (sem foto) — mesmo texto e regras do resumo gerado no modo normal
// (analyzeWithGemini), só que aqui os valores já são conhecidos, não há nada
// para o Gemini extrair de imagem nenhuma. Best-effort: uma falha aqui nunca
// desfaz a avaliação já gravada, só fica sem comentário.
async function generateBodySummaryFromMetrics(
  metrics: Record<string, number | null>,
  notes: string | null,
  history: unknown[],
  geminiKey: string,
  memoryBlock: string | null = null,
  goalsCtx: GoalsContext | null = null,
  // Até quando se pode tentar (COACH_BUDGET_MS, em _shared/geminiFetch.ts).
  deadline = Number.POSITIVE_INFINITY,
): Promise<{ text: string | null; goalsReview: GoalsReview }> {
  const hasAny = Object.values(metrics).some((v) => v !== null && v !== undefined);
  if (!hasAny) return { text: null, goalsReview: null };
  // Sem tempo para uma tentativa útil antes do prazo, grava-se sem resumo:
  // é best-effort, e a resposta não pode passar o que a app espera.
  if (!hasTimeFor(deadline)) return { text: null, goalsReview: null };

  const metricLines = METRIC_FIELDS
    .filter((f) => metrics[f.key] !== null && metrics[f.key] !== undefined)
    .map((f) => `- ${f.label}: ${metrics[f.key]}`)
    .join("\n");

  const prompt =
    "És a Carol, a treinadora deste atleta amador, a comentar em primeira pessoa a avaliação corporal que ele acabou de registar.\n" +
    `${CAROL_TONE_RULES_SHORT}\n\n` +
    memoryPromptSection(memoryBlock) +
    "O atleta registou manualmente os seguintes valores de uma avaliação de composição " +
    `corporal (sem foto):\n${metricLines}\n\n` +
    // deno-lint-ignore no-explicit-any
    historyContext(history as any[]) +
    "\n\nEscreve a tua avaliação destes valores, em português de Portugal. " +
    BODY_ANALYSIS_RULES + "\n" +
    "Se existir histórico acima, compara com a avaliação " +
    "mais recente e comenta a evolução (o que melhorou, o que piorou, ex.: peso, gordura " +
    "corporal, massa muscular). Sê direta e prática, sem alarmismos e sem dar diagnósticos " +
    "médicos. Se o peso desceu mais de 1 kg face a uma avaliação de há cerca de uma semana (ou a um " +
    "ritmo equivalente), pergunta se é intencional antes de sugerires mexer nas calorias — não ajustes " +
    "nada por tua conta. " +
    carolLanguageRule(goalsCtx?.level ?? null) + "\n\n" +
    goalsReviewSection(goalsCtx?.goals ?? null) +
    "Responde em JSON: \"summary\" com a avaliação, \"goals_review\" com o juízo acima." +
    (notes && notes.trim() ? `\n\nObservação do utilizador sobre esta pesagem: "${notes.trim()}"` : "");

  try {
    const res = await fetchGeminiWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            // A análise estruturada é mais longa (feedback de 2026-09-25).
            maxOutputTokens: 8192,
            thinkingConfig: { thinkingLevel: "minimal" },
            response_mime_type: "application/json",
            response_schema: MANUAL_SUMMARY_SCHEMA,
          },
        }),
      },
      45000,
      0,
      deadline,
    );
    if (!res.ok) {
      console.warn("Body manual summary generation failed:", res.status, await res.text());
      return { text: null, goalsReview: null };
    }
    const json = await res.json();
    return parseManualSummary(json?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch (e) {
    console.warn("Body manual summary generation error:", e);
    return { text: null, goalsReview: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // Prazos deste pedido (ver _shared/geminiFetch.ts).
  const { extraction: extractionDeadline, coach: coachDeadline } = requestDeadlines();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não suportado" }, 405);
  }

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY não configurada no servidor" }, 500);
    }

    // Cliente Supabase com o JWT do chamador: todas as escritas correm sob o RLS dele.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Sem autorização" }, 401);
    }
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Sessão inválida" }, 401);
    }
    const userId = userData.user.id;
    // A memória durável e a conversa recente do chat (Fase 1, ação 1.3), em
    // paralelo com o resto: todos os caminhos abaixo acabam num resumo.
    // Nunca rejeita, por isso pode ficar por esperar num caminho de erro.
    const memoryPromise = fetchSharedMemoryBlock(sb, userId);
    const goalsCtxPromise = fetchGoalsContext(sb, userId);

    const body = await req.json();
    const rawNotes = typeof body.notes === "string" ? body.notes.slice(0, MAX_NOTES_LENGTH) : null;

    const metricSelect =
      "id, date, " + METRIC_FIELDS.map((f) => f.key).join(", ");

    // ── Modo manual: registo sem fotos, com análise do Coach ───────────
    // Os valores já vêm todos do formulário (nada para o Gemini extrair de
    // imagem nenhuma) — grava a avaliação diretamente e gera o comentário do
    // Coach a partir deles, comparando com o histórico
    // (generateBodySummaryFromMetrics). Sem isto, uma avaliação registada
    // manualmente nunca tinha análise nenhuma; agora as duas formas de
    // registo passam pelo Coach.
    if (body.mode === "manual") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")) {
        return jsonResponse({ error: "Data inválida (esperado YYYY-MM-DD)" }, 400);
      }
      const rawMetrics = (body.metrics ?? {}) as Record<string, unknown>;
      const num = (v: unknown): number | null =>
        typeof v === "number" && isFinite(v) && v >= 0 ? v : null;
      const metrics: Record<string, number | null> = {};
      for (const f of METRIC_FIELDS) metrics[f.key] = num(rawMetrics[f.key]);
      const hasAny = Object.values(metrics).some((v) => v !== null);
      if (!hasAny) {
        return jsonResponse({ error: "Preenche pelo menos um valor." }, 400);
      }

      // ── Edição de uma avaliação existente (assessment_id presente) ───
      // Editar métricas ou observações muda o resumo, por isso passa pelo
      // mesmo caminho do registo e regenera-o. Distingue-se da reanálise
      // (assessment_id sem mode) por essa repescar os prints guardados;
      // aqui a fonte são os campos que o atleta editou.
      const editingId = typeof body.assessment_id === "string" && body.assessment_id
        ? body.assessment_id
        : null;

      if (editingId) {
        const { data: existing, error: fetchError } = await sb
          .from("body_assessments")
          .select("id")
          .eq("id", editingId)
          .eq("user_id", userId)
          .maybeSingle();
        if (fetchError) return jsonResponse({ error: `Falha a procurar avaliação: ${fetchError.message}` }, 500);
        if (!existing) return jsonResponse({ error: "Avaliação não encontrada" }, 404);
      }

      // A própria avaliação em edição não entra no histórico de comparação —
      // senão o resumo comparava-a consigo mesma.
      let historyQuery = sb
        .from("body_assessments")
        .select(metricSelect)
        .eq("user_id", userId)
        .lte("date", body.date)
        .order("date", { ascending: false })
        .limit(HISTORY_FOR_CONTEXT);
      if (editingId) historyQuery = historyQuery.neq("id", editingId);
      const { data: history } = await historyQuery;

      const summaryResult = await generateBodySummaryFromMetrics(metrics, rawNotes, history || [], geminiKey, await memoryPromise, await goalsCtxPromise, coachDeadline);

      if (editingId) {
        const { data: updated, error: updateError } = await sb
          .from("body_assessments")
          .update({
            date: body.date,
            notes: rawNotes,
            ai_summary: summaryResult.text,
            status: "ready",
            ...metrics,
          })
          .eq("id", editingId)
          .select()
          .single();
        if (updateError) return jsonResponse({ error: `Falha a atualizar avaliação: ${updateError.message}` }, 500);
        await syncProfileAfterAssessment(sb, userId, updated, summaryResult.goalsReview);
        return jsonResponse({ assessment: updated });
      }

      const { data: assessment, error: insertError } = await sb
        .from("body_assessments")
        .insert({
          user_id: userId,
          date: body.date,
          // A coluna é NOT NULL com default '{}' — null aqui rebentava o
          // insert (violação de not-null) e voltava como 500 genérico (ver
          // o mesmo footgun já corrigido em analyze-run/analyze-meal).
          photo_paths: [],
          status: "ready",
          notes: rawNotes,
          ai_summary: summaryResult.text,
          ...metrics,
        })
        .select()
        .single();
      if (insertError) return jsonResponse({ error: `Falha a gravar avaliação: ${insertError.message}` }, 500);

      await syncProfileAfterAssessment(sb, userId, assessment, summaryResult.goalsReview);
      return jsonResponse({ assessment });
    }

    // ── Modo reanálise por foto: assessment_id presente sem mode manual ─
    if (typeof body.assessment_id === "string" && body.assessment_id && body.mode !== "manual") {
      const assessmentId = body.assessment_id;
      const { data: existing, error: fetchError } = await sb
        .from("body_assessments")
        .select("id, date, photo_paths")
        .eq("id", assessmentId)
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) return jsonResponse({ error: `Falha a procurar avaliação: ${fetchError.message}` }, 500);
      if (!existing) return jsonResponse({ error: "Avaliação não encontrada" }, 404);

      const photoPaths: string[] = existing.photo_paths || [];
      if (photoPaths.length === 0) {
        return jsonResponse({ error: "Esta avaliação não tem imagens guardadas para reanalisar" }, 400);
      }

      const images: string[] = [];
      for (const path of photoPaths) {
        const { data: fileBlob, error: downloadError } = await sb.storage.from("body-photos").download(path);
        if (downloadError || !fileBlob) {
          return jsonResponse({ error: `Falha a obter imagem guardada: ${downloadError?.message ?? "desconhecida"}` }, 500);
        }
        images.push(bytesToBase64(new Uint8Array(await fileBlob.arrayBuffer())));
      }

      // Histórico = avaliações anteriores a esta (por data), para comparação.
      const { data: history } = await sb
        .from("body_assessments")
        .select(metricSelect)
        .eq("user_id", userId)
        .neq("id", assessmentId)
        .lte("date", existing.date)
        .order("date", { ascending: false })
        .limit(HISTORY_FOR_CONTEXT);

      let result;
      try {
        result = await analyzeWithGemini(images, "image/jpeg", rawNotes, history || [], geminiKey, await memoryPromise, await goalsCtxPromise, extractionDeadline);
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha na reanálise." }, 502);
      }

      const { data: updated, error: updateError } = await sb
        .from("body_assessments")
        .update({ ...result.metrics, classifications: result.classifications, ai_summary: result.summary, notes: rawNotes, status: "ready" })
        .eq("id", assessmentId)
        .select()
        .single();
      if (updateError) return jsonResponse({ error: `Falha a atualizar avaliação: ${updateError.message}` }, 500);

      await syncProfileAfterAssessment(sb, userId, updated, result.goalsReview);
      return jsonResponse({ assessment: updated, source_app: result.sourceApp, usage: result.usage });
    }

    // ── Modo normal: nova avaliação a partir de imagens ────────────────
    const { mime_type, date } = body;

    let images: string[] = [];
    if (Array.isArray(body.images)) {
      images = body.images.filter((s: unknown) => typeof s === "string" && s.length > 0);
    } else if (typeof body.image_base64 === "string" && body.image_base64) {
      images = [body.image_base64];
    }

    if (images.length === 0) {
      return jsonResponse({ error: "Nenhuma imagem recebida" }, 400);
    }
    if (images.length > MAX_PHOTOS) {
      return jsonResponse({ error: `Máximo de ${MAX_PHOTOS} imagens por avaliação` }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
      return jsonResponse({ error: "Data inválida (esperado YYYY-MM-DD)" }, 400);
    }
    const mime = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
        .includes(mime_type)
      ? mime_type
      : "image/jpeg";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

    // Histórico para comparação: avaliações até esta data (exclusive é tratado
    // no cliente ao ordenar; aqui usamos <= data e limitamos as mais recentes).
    const { data: history } = await sb
      .from("body_assessments")
      .select(metricSelect)
      .eq("user_id", userId)
      .lte("date", date)
      .order("date", { ascending: false })
      .limit(HISTORY_FOR_CONTEXT);

    // 1. Upload de todas as imagens para o bucket privado, pasta do próprio utilizador
    const photoPaths: string[] = [];
    for (const b64 of images) {
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await sb.storage
        .from("body-photos")
        .upload(path, base64ToBytes(b64), { contentType: mime });
      if (uploadError) {
        if (photoPaths.length) await sb.storage.from("body-photos").remove(photoPaths);
        return jsonResponse({ error: `Falha no upload da imagem: ${uploadError.message}` }, 500);
      }
      photoPaths.push(path);
    }

    // 2. Análise Gemini — todas as imagens numa só chamada (partes múltiplas)
    let result;
    try {
      result = await analyzeWithGemini(images, mime, rawNotes, history || [], geminiKey, await memoryPromise, await goalsCtxPromise, extractionDeadline);
    } catch (e) {
      await sb.storage.from("body-photos").remove(photoPaths);
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha na análise." }, 502);
    }

    // 3. Gravar avaliação
    const { data: assessment, error: insertError } = await sb
      .from("body_assessments")
      .insert({
        user_id: userId,
        date,
        photo_paths: photoPaths,
        status: "ready",
        notes: rawNotes,
        ai_summary: result.summary,
        classifications: result.classifications,
        ...result.metrics,
      })
      .select()
      .single();
    if (insertError) {
      await sb.storage.from("body-photos").remove(photoPaths);
      return jsonResponse({ error: `Falha a gravar avaliação: ${insertError.message}` }, 500);
    }

    await checkAndLogAppImage(sb, userId, "body", images, mime, result as unknown as Record<string, unknown>);

    await syncProfileAfterAssessment(sb, userId, assessment, result.goalsReview);
    /* A fonte também à cabeça da resposta, e não só escondida dentro de
       `classifications` — é onde o cliente a vai buscar sem ter de saber do
       arranjo do jsonb. */
    return jsonResponse({ assessment, source_app: result.sourceApp, usage: result.usage });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
});

