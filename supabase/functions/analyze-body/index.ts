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
import { geminiHeaders, geminiUrl, geminiWithFallback, thinkingConfig } from "../_shared/geminiModel.ts";
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
import { normalizarFonte, opcoesDeFonte } from "../_shared/sourceApps.ts";
import {
  buildPreviewPrompt,
  extractionRules,
  METRIC_FIELDS,
  type Metrics,
  metricNum,
  normalizeExtraction,
  parseTypedMetrics,
  PREVIEW_SCHEMA,
  sanitizeClassifications,
  typedMetricsSection,
} from "./extraction.ts";
import {
  fetchGeminiWithTimeout as fetchGemini,
  GEMINI_BUSY_BACKOFF_MS,
  GEMINI_HEDGE_AFTER_MS,
  GEMINI_RETRYABLE_STATUSES,
  geminiBusyMessage,
  hasTimeFor,
  requestDeadlines,
} from "../_shared/geminiFetch.ts";
import { type GeminiUsage, usageFromGemini } from "../_shared/geminiUsage.ts";
import { withUsageRecording } from "../_shared/usageRecorder.ts";

const MAX_PHOTOS = 6;
const MAX_NOTES_LENGTH = 500;
const HISTORY_FOR_CONTEXT = 5; // avaliações anteriores enviadas ao Gemini para comparação

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Modelo fixo + nível de raciocínio por chamada vêm de _shared/geminiModel.ts
// (antes era o alias "gemini-flash-latest", para evitar 404s quando a Google
// descontinua modelos para contas novas — o alias continua lá como fallback
// automático, via geminiWithFallback).
// Tempo máximo por chamada ao Gemini antes de desistir e tentar mais uma vez.
// A API do Gemini (sobretudo no tier gratuito) tem latência muito variável —
// isto evita que uma chamada presa arraste a função até ao limite rígido da
// plataforma (~150s), o que produz um erro genérico e ilegível no cliente.
const GEMINI_TIMEOUT_MS = 40000;
const GEMINI_RETRIES = 1; // repetições automáticas após timeout, antes de desistir de vez


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
  // Sem resposta em GEMINI_HEDGE_AFTER_MS, pede outra vez em paralelo
  // (_shared/geminiFetch.ts, incidente 2026-10-12).
  return fetchGemini(url, options, timeoutMs, retries, deadline, GEMINI_BUSY_BACKOFF_MS, GEMINI_HEDGE_AFTER_MS);
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

/* As condições da pesagem que a Carol sabe, e a regra de não presumir as que
   não sabe. Relatado a 2026-10-01: ela fechou com "pesa-te na mesma rotina
   matinal e em jejum" a quem já o fazia — assumiu que não, sem ter como
   saber. A hora é obrigatória no formulário; o jejum só se sabe se o atleta
   o escreveu nas observações, por isso, não o sabendo, pergunta. */
function weighingConditions(time: string | null, notes: string | null): string {
  const quando = time
    ? `A pesagem foi feita às ${time} (hora local do atleta).`
    : "A hora da pesagem não foi indicada.";
  const jejum = /jejum/i.test(notes ?? "")
    ? "O atleta falou do jejum nas observações — usa o que ele disse."
    : "Não sabes se o atleta estava em jejum.";
  return `CONDIÇÕES DA PESAGEM: ${quando} ${jejum}\n` +
    "- NUNCA presumas as condições em que o atleta se pesa (hora, jejum, rotina, balança). Não lhe digas " +
    "para se pesar \"de manhã\" ou \"em jejum\" como se não o fizesse: não sabes se faz.\n" +
    "- Se as condições importam para ler a evolução (ex.: a hora é tardia, ou varia, ou não sabes se estava " +
    "em jejum), usa o bloco \"Para a próxima\" para PERGUNTAR — por exemplo se estava em jejum — em vez de " +
    "dares uma instrução.\n" +
    "- Se a pesagem foi de manhã cedo e o atleta já disse que estava em jejum, não voltes a perguntar nem a recomendar.\n\n";
}

function buildPrompt(notes: string | null, history: unknown[], memoryBlock: string | null = null, goalsCtx: GoalsContext | null = null, assessmentTime: string | null = null, typed: Metrics | null = null): string {

  let prompt =
    extractionRules() + typedMetricsSection(typed) + "\n\n" +
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
    weighingConditions(assessmentTime, notes) +
    BODY_ANALYSIS_RULES + "\n" +
    carolLanguageRule(goalsCtx?.level ?? null) + "\n\n" +
    goalsReviewSection(goalsCtx?.goals ?? null, goalsCtx ?? {});
  if (notes && notes.trim()) {
    prompt +=
      "\n\nObservação do utilizador sobre esta pesagem (usa-a como contexto): " +
      `"${notes.trim()}"`;
  }
  prompt += "\n\nResponde apenas com JSON estruturado conforme o schema.";
  return prompt;
}

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
  assessmentTime: string | null = null,
  // O que o atleta escreveu no formulário: ganha à leitura (registo unificado).
  typed: Metrics | null = null,
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
  const parts: unknown[] = [{ text: buildPrompt(notes, history, memoryBlock, goalsCtx, assessmentTime, typed) }];
  for (const b64 of images) {
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }
  const geminiRes = await geminiWithFallback((model, withThinking) => fetchGeminiWithTimeout(
    geminiUrl(model),
    {
      method: "POST",
      headers: geminiHeaders(geminiKey),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          ...thinkingConfig("low", withThinking),
          response_mime_type: "application/json",
          response_schema: RESPONSE_SCHEMA,
        },
      }),
    },
    GEMINI_TIMEOUT_MS,
    GEMINI_RETRIES,
    deadline,
  ));

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
  // Tokens desta chamada, incl. thoughts (ver _shared/geminiUsage.ts).
  const usage: GeminiUsage = usageFromGemini(geminiJson);
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

  const { metrics, classifications, sourceApp, hasAny } = normalizeExtraction(parsed, typed);
  if (!hasAny) {
    throw new Error(
      "Não foi possível ler valores nas imagens. Confirma que é um print da Renpho Health, com boa nitidez.",
    );
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  return { metrics, classifications, summary, sourceApp, usage, goalsReview: parseGoalsReview(parsed.goals_review) };
}

// A pré-leitura (mode "preview"): só os valores, as etiquetas e a app — sem
// resumo e sem gravar. Lança um erro com mensagem amigável.
async function previewWithGemini(
  images: string[],
  mime: string,
  notes: string | null,
  geminiKey: string,
  deadline = Number.POSITIVE_INFINITY,
): Promise<{ preview: { metrics: Metrics; classifications: Record<string, string>; source_app: string }; usage: GeminiUsage }> {
  const parts: unknown[] = [{ text: buildPreviewPrompt(notes) }];
  for (const b64 of images) parts.push({ inline_data: { mime_type: mime, data: b64 } });
  const res = await geminiWithFallback((model, withThinking) => fetchGeminiWithTimeout(
    geminiUrl(model),
    {
      method: "POST",
      headers: geminiHeaders(geminiKey),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          ...thinkingConfig("low", withThinking),
          response_mime_type: "application/json",
          response_schema: PREVIEW_SCHEMA,
        },
      }),
    },
    GEMINI_TIMEOUT_MS,
    GEMINI_RETRIES,
    deadline,
  ));
  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini error (preview):", res.status, errText);
    if (GEMINI_RETRYABLE_STATUSES.has(res.status)) throw new Error(geminiBusyMessage("ler os prints"));
    throw new Error(upstreamErrorText(res.status));
  }
  const json = await res.json();
  const usage: GeminiUsage = usageFromGemini(json);
  let parsed;
  try {
    parsed = JSON.parse(json?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch {
    throw new Error("A leitura devolveu um formato inesperado. Tenta novamente.");
  }
  const { metrics, classifications, sourceApp } = normalizeExtraction(parsed);
  return { preview: { metrics, classifications, source_app: sourceApp }, usage };
}

const normalizarFonteCorpo = (v: unknown) => normalizarFonte(v, "corpo");

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
  assessmentTime: string | null = null,
  // Os valores vieram de prints que o atleta leu e reviu (registo unificado, `reviewed`).
  fromPrints = false,
  // `usage`: tokens desta chamada (null se não houve resposta do Gemini) —
  // antes não era devolvido, e o registo manual não contava para os custos.
): Promise<{ text: string | null; goalsReview: GoalsReview; usage: GeminiUsage | null }> {
  const hasAny = Object.values(metrics).some((v) => v !== null && v !== undefined);
  if (!hasAny) return { text: null, goalsReview: null, usage: null };
  // Sem tempo para uma tentativa útil antes do prazo, grava-se sem resumo:
  // é best-effort, e a resposta não pode passar o que a app espera.
  if (!hasTimeFor(deadline)) return { text: null, goalsReview: null, usage: null };

  const metricLines = METRIC_FIELDS
    .filter((f) => metrics[f.key] !== null && metrics[f.key] !== undefined)
    .map((f) => `- ${f.label}: ${metrics[f.key]}`)
    .join("\n");

  const prompt =
    "És a Carol, a treinadora deste atleta amador, a comentar em primeira pessoa a avaliação corporal que ele acabou de registar.\n" +
    `${CAROL_TONE_RULES_SHORT}\n\n` +
    memoryPromptSection(memoryBlock) +
    weighingConditions(assessmentTime, notes) +
    (fromPrints
      ? "O atleta registou os seguintes valores de uma avaliação de composição corporal, lidos dos prints da " +
        `balança e revistos por ele:\n${metricLines}\n\n`
      : "O atleta registou manualmente os seguintes valores de uma avaliação de composição " +
        `corporal (sem foto):\n${metricLines}\n\n`) +
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
    goalsReviewSection(goalsCtx?.goals ?? null, goalsCtx ?? {}) +
    "Responde em JSON: \"summary\" com a avaliação, \"goals_review\" com o juízo acima." +
    (notes && notes.trim() ? `\n\nObservação do utilizador sobre esta pesagem: "${notes.trim()}"` : "");

  try {
    const res = await geminiWithFallback((model, withThinking) => fetchGeminiWithTimeout(
      geminiUrl(model),
      {
        method: "POST",
        headers: geminiHeaders(geminiKey),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            // A análise estruturada é mais longa (feedback de 2026-09-25).
            maxOutputTokens: 8192,
            ...thinkingConfig("low", withThinking),
            response_mime_type: "application/json",
            response_schema: MANUAL_SUMMARY_SCHEMA,
          },
        }),
      },
      45000,
      0,
      deadline,
    ));
    if (!res.ok) {
      console.warn("Body manual summary generation failed:", res.status, await res.text());
      return { text: null, goalsReview: null, usage: null };
    }
    const json = await res.json();
    // Contado logo aqui: os tokens pagam-se mesmo que o texto não se aproveite.
    const usage = usageFromGemini(json);
    return { ...parseManualSummary(json?.candidates?.[0]?.content?.parts?.[0]?.text), usage };
  } catch (e) {
    console.warn("Body manual summary generation error:", e);
    return { text: null, goalsReview: null, usage: null };
  }
}

// O consumo do Gemini que a resposta traz fica gravado em ai_usage pelo
// servidor (_shared/usageRecorder.ts), não pela app.
Deno.serve(withUsageRecording("analyze-body", async (req) => {
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
    // 'HH:MM' (ou 'HH:MM:SS' da BD) → 'HH:MM'; qualquer outra coisa = não indicada.
    const rawTime = typeof body.assessment_time === "string" && /^([01]\d|2[0-3]):[0-5]\d/.test(body.assessment_time)
      ? body.assessment_time.slice(0, 5)
      : null;

    const metricSelect =
      "id, date, " + METRIC_FIELDS.map((f) => f.key).join(", ");

    // ── Modo preview: ler os prints para o formulário, SEM gravar ──────
    // Registo unificado (specs/plano-registo-plano-coach.md, decisão 6): o
    // atleta revê o que se leu e só depois grava. Só leitura — sem resumo,
    // sem histórico, sem Storage.
    if (body.mode === "preview") {
      const imgs: string[] = (Array.isArray(body.images) ? body.images : [])
        .filter((x: unknown) => typeof x === "string" && x.length > 0);
      if (imgs.length === 0) return jsonResponse({ error: "Junta pelo menos um print para eu ler." }, 400);
      if (imgs.length > MAX_PHOTOS) return jsonResponse({ error: `Máximo de ${MAX_PHOTOS} imagens por avaliação` }, 400);
      const mime = ["image/jpeg", "image/png", "image/webp"].includes(body.mime_type) ? body.mime_type : "image/jpeg";
      try {
        const { preview, usage } = await previewWithGemini(imgs, mime, rawNotes, geminiKey, extractionDeadline);
        // Ler e depois gravar é o caminho comum: os prints de apps que não se
        // reconhecem chegam ao Admin por aqui (no `reviewed` já não se leem).
        await checkAndLogAppImage(sb, userId, "body", imgs, mime, preview as unknown as Record<string, unknown>);
        return jsonResponse({ preview, usage });
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Não consegui ler os prints." }, 502);
      }
    }

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
      const metrics: Record<string, number | null> = {};
      for (const f of METRIC_FIELDS) metrics[f.key] = metricNum(rawMetrics[f.key]);
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

      const summaryResult = await generateBodySummaryFromMetrics(metrics, rawNotes, history || [], geminiKey, await memoryPromise, await goalsCtxPromise, coachDeadline, rawTime);

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
        // O modo manual só faz esta chamada ao Gemini; o cliente regista o
        // `usage` em app_logs (porquê: _shared/geminiUsage.ts). null = sem chamada.
        return jsonResponse({ assessment: updated, usage: summaryResult.usage });
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
      return jsonResponse({ assessment, usage: summaryResult.usage });
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
        result = await analyzeWithGemini(images, "image/jpeg", rawNotes, history || [], geminiKey, await memoryPromise, await goalsCtxPromise, extractionDeadline, rawTime);
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
    // Registo unificado: o que o atleta escreveu ganha à leitura; com
    // `reviewed` (os prints já foram lidos no "preview" e ele reviu os
    // valores), não se volta a ler — grava-se o que está no formulário.
    const typed = parseTypedMetrics(body.metrics);
    const reviewed = body.reviewed === true && typed !== null;

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

    // 2a. Já revisto: o resumo faz-se dos valores do formulário, sem nova leitura.
    if (reviewed) {
      const summaryResult = await generateBodySummaryFromMetrics(typed!, rawNotes, history || [], geminiKey, await memoryPromise, await goalsCtxPromise, coachDeadline, rawTime, true);
      const classifications = sanitizeClassifications(body.classifications, typed!);
      if (typeof body.classifications?.source_app === "string") {
        classifications.source_app = normalizarFonteCorpo(body.classifications.source_app);
      }
      const { data: assessment, error: insertError } = await sb
        .from("body_assessments")
        .insert({
          user_id: userId,
          date,
          photo_paths: photoPaths,
          status: "ready",
          notes: rawNotes,
          ai_summary: summaryResult.text,
          classifications,
          ...typed!,
        })
        .select()
        .single();
      if (insertError) {
        await sb.storage.from("body-photos").remove(photoPaths);
        return jsonResponse({ error: `Falha a gravar avaliação: ${insertError.message}` }, 500);
      }
      await syncProfileAfterAssessment(sb, userId, assessment, summaryResult.goalsReview);
      return jsonResponse({ assessment, source_app: classifications.source_app ?? null, usage: summaryResult.usage });
    }

    // 2b. Análise Gemini — todas as imagens numa só chamada (partes múltiplas)
    let result;
    try {
      result = await analyzeWithGemini(images, mime, rawNotes, history || [], geminiKey, await memoryPromise, await goalsCtxPromise, extractionDeadline, rawTime, typed);
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
}));
