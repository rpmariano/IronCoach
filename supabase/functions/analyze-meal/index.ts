// IronHealth · analyze-meal Edge Function
// Modo normal: recebe 1+ fotos de uma refeição (base64) + data + tipo de
// refeição + alimentos escritos e observações opcionais, analisa tudo com
// Gemini e grava meals + meal_items na BD.
// Modo manual (mode: "manual"): só alimentos escritos, sem fotos.
// Modo reanálise (meal_id presente): repesca as fotos já guardadas dessa
// refeição no Storage, volta a chamar o Gemini com as observações
// atualizadas, e substitui os meal_items existentes pelos novos.
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { INTERVENTION_ORIGIN } from "../_shared/formulas/interventionOutcomes.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CAROL_TONE_RULES_SHORT, carolLanguageRule, carolRecordAnalysisRules, upstreamErrorText } from "../_shared/carolTone.ts";
import { fetchSharedMemoryBlock, memoryPromptSection } from "../_shared/carolMemory.ts";
import { dayProgressSection, mealDayProgress, normalizeMealTime } from "../_shared/formulas/mealDayProgress.ts";
import { fetchFrameRace, type FrameRace, frameRaceSentence } from "../_shared/frameRace.ts";
import {
  fetchGeminiWithTimeout as fetchGemini,
  GEMINI_RETRYABLE_STATUSES,
  geminiBusyMessage,
  hasTimeFor,
  requestDeadlines,
} from "../_shared/geminiFetch.ts";
import { geminiHeaders, geminiUrl, geminiWithFallback, thinkingConfig } from "../_shared/geminiModel.ts";
import { addUsage, emptyUsage, type GeminiUsage, usageFromGemini } from "../_shared/geminiUsage.ts";
import { withUsageRecording } from "../_shared/usageRecorder.ts";
import {
  applyPantry, type CarolQuestion, type CookingFact, EMPTY_PANTRY, fetchPantry, knowledgeSection, learnFromMeal, learnRules,
  isMicroColumn, microFromModel, parseCookingFacts, parseQuestions, pickMealItem, remapQuestionItems, splitKnownWritten,
  withPantryValues, withWrittenFoods,
} from "./pantry.ts";
import { foodKey } from "../_shared/formulas/foodKey.ts";

const MAX_PHOTOS = 6;
const MAX_NOTES_LENGTH = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MEAL_TYPES = ["pequeno-almoco", "lanche-manha", "almoco", "lanche", "jantar", "ceia"];

// Tempo máximo por chamada ao Gemini antes de desistir e tentar mais uma vez.
// A API do Gemini (sobretudo no tier gratuito) tem latência muito variável —
// isto evita que uma chamada presa arraste a função até ao limite rígido da
// plataforma (~150s), o que produz um erro genérico e ilegível no cliente.
const GEMINI_TIMEOUT_MS = 40000;
const GEMINI_RETRIES = 1; // repetições automáticas após timeout, antes de desistir de vez

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          estimated_quantity_grams: { type: "NUMBER" },
          calories_per_100g: { type: "NUMBER" },
          protein_per_100g: { type: "NUMBER" },
          carbs_per_100g: { type: "NUMBER" },
          fat_per_100g: { type: "NUMBER" },
          fiber_per_100g: { type: "NUMBER", nullable: true },
          sugar_per_100g: { type: "NUMBER", nullable: true },
          sodium_per_100g: { type: "NUMBER", nullable: true },
          iron_mg_per_100g: { type: "NUMBER", nullable: true },
          calcium_mg_per_100g: { type: "NUMBER", nullable: true },
          vitamin_c_mg_per_100g: { type: "NUMBER", nullable: true },
          potassium_mg_per_100g: { type: "NUMBER", nullable: true },
          // Bug #48 (fase A): os valores vêm de uma tabela nutricional lida
          // numa foto, não de uma estimativa — o produto entra logo na despensa.
          from_label: { type: "BOOLEAN" },
        },
        required: [
          "name",
          "estimated_quantity_grams",
          "calories_per_100g",
          "protein_per_100g",
          "carbs_per_100g",
          "fat_per_100g",
          // Os micronutrientes deixaram de ser obrigatórios (D6 da Evolução,
          // 2026-10-05): obrigá-los fazia o modelo inventar um número (ou 0)
          // quando não o sabia. Sem valor → null em meal_items (MICROS_RULE).
        ],
      },
    },
    // Bug #52 (fase A): como o atleta cozinha e tempera, tirado SÓ do que ele
    // escreveu nas observações ("bife frito em azeite" → fritos: azeite).
    cooking_facts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { topic: { type: "STRING" }, value: { type: "STRING" } },
        required: ["topic", "value"],
      },
    },
    // Bug #52 (fase B): o que ela pergunta em vez de adivinhar — filtrado no
    // servidor (pantry.ts, parseQuestions) e guardado em meals.carol_questions.
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          topic: { type: "STRING" },
          item_name: { type: "STRING" },
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          assumed: { type: "STRING" },
          impact_kcal: { type: "NUMBER" },
        },
        required: ["topic", "item_name", "question", "options", "assumed", "impact_kcal"],
      },
    },
  },
  required: ["items"],
};

// Fotos + alimentos escritos no mesmo registo (bug #47): cada item diz de
// onde veio — o número do alimento na lista escrita (1..N), ou 0 se só está
// nas fotos. É por aqui que o servidor repõe o nome e as gramas que o atleta
// deu, sem depender da ordem em que o Gemini os devolve.
const RESPONSE_SCHEMA_WITH_SOURCE = {
  ...RESPONSE_SCHEMA,
  properties: {
    ...RESPONSE_SCHEMA.properties,
    items: {
      ...RESPONSE_SCHEMA.properties.items,
      items: {
        ...RESPONSE_SCHEMA.properties.items.items,
        properties: { ...RESPONSE_SCHEMA.properties.items.items.properties, source_index: { type: "INTEGER" } },
        required: [...RESPONSE_SCHEMA.properties.items.items.required, "source_index"],
      },
    },
  },
};

const PHOTOS_INTRO =
  "As fotografias seguintes mostram todas a MESMA refeição (possivelmente de " +
  "ângulos diferentes ou vários pratos/componentes). Combina a informação de todas " +
  "as fotos e identifica cada alimento distinto no conjunto, sem contar o mesmo " +
  "alimento duas vezes por aparecer em várias fotos. ";

function notesSection(notes: string | null): string {
  if (!notes || !notes.trim()) return "";
  return "\n\nO utilizador deixou esta observação sobre a refeição — usa-a para " +
    "identificar com precisão os alimentos e os seus valores nutricionais " +
    "(ex.: um hambúrguer de uma cadeia específica tem valores muito diferentes " +
    "de um feito em casa; cozinhar com manteiga em vez de azeite muda a " +
    "gordura; a marca/tipo de um produto embalado importa). " +
    `Observação do utilizador: "${notes.trim()}"`;
}

// Bug #48 (fase A): uma foto de um rótulo dá os valores exatos do produto —
// e o produto entra logo na despensa (analyze-meal/pantry.ts).
const LABEL_RULE =
  "\n\nRÓTULOS: se uma das fotos mostrar a tabela nutricional (o rótulo) de um produto embalado, " +
  "esse produto usa os valores POR 100 g LIDOS da tabela (não estimes), o nome comercial do produto " +
  "se estiver visível, e from_label=true. Nos outros itens, from_label=false.";

// D6 da Evolução (2026-10-05): os micronutrientes deixaram de ser
// obrigatórios no schema — o que o modelo não sabe fica null em meal_items, e
// a app pode dizer "dado em X% dos alimentos". 0 só quando é mesmo zero.
export const MICROS_RULE =
  "\n\nMICRONUTRIENTES (fibra, açúcar, sódio, ferro, cálcio, vitamina C, potássio): dá o valor por 100 g quando " +
  "há um valor de referência para esse alimento (num rótulo, o lido). Usa 0 só quando o alimento não tem mesmo " +
  "esse nutriente (ex.: vitamina C no azeite). Quando não sabes, deixa esse campo de fora (null) — nunca 0 nem um " +
  "número inventado. Calorias, proteína, hidratos e gordura são sempre obrigatórios.";

// Bug #52 (fase A): o que as observações dizem de como ele cozinha fica a
// valer para as próximas refeições (à segunda vez igual).
function cookingFactsRule(notes: string | null): string {
  if (!notes || !notes.trim()) return "\n\ncooking_facts: lista vazia.";
  return "\n\ncooking_facts: só o que a observação do utilizador diz EXPLICITAMENTE sobre como prepara ou " +
    "tempera os alimentos — um par {topic, value} por facto, em português, curtos e no singular. Temas: " +
    "fritos, grelhados, salada, ovos, carne, frango, peixe, leite, café, pão, arroz, batata, massa (ou outro, " +
    "se for claro). Ex.: \"bife frito em azeite\" → {topic: \"fritos\", value: \"azeite\"}; \"leite magro\" → " +
    "{topic: \"leite\", value: \"magro\"}. Nada que tenhas deduzido das fotos. Sem nada explícito, lista vazia.";
}

// Bug #52 (fase B): «em vez de a Carol estar a adivinhar determinadas
// situações, pode perguntar no momento». A refeição grava-se na mesma com o
// mais provável (assumed); a pergunta aparece no ecrã do resultado.
const QUESTIONS_RULE =
  "\n\nPERGUNTAS (questions): no máximo 2, e só quando não se vê nem se sabe como um alimento desta refeição " +
  "foi preparado ou temperado E isso muda a energia em 50 kcal ou mais — a gordura usada para fritar ou saltear, " +
  "o tempero da salada, o molho, a pele ou o corte da carne, o leite gordo ou magro, açúcar no café. Nunca sobre o " +
  "que as observações já dizem, sobre um tema de \"Como cozinha e tempera\", nem sobre um alimento da lista que ele " +
  "tem guardada. Na estimativa, usa o mais provável e diz qual foi em assumed. Cada pergunta: topic (o tema, curto, " +
  "ex. \"fritos\"), item_name (o nome EXATO do item em items), question (curta, na 2.ª pessoa, ex. \"Os ovos " +
  "foram estrelados em quê?\"), options (2 a 4 respostas curtas, ex. [\"Azeite\", \"Manteiga\", \"Óleo\", " +
  "\"Sem gordura\"]), assumed (uma das options), impact_kcal (quanto a resposta pode mudar a energia, em kcal). " +
  "Na dúvida, não perguntes: lista vazia.";

function buildPrompt(notes: string | null, knowledge = ""): string {
  return PHOTOS_INTRO +
    "Para cada item, estima a porção total visível em gramas e o seu conteúdo nutricional " +
    "POR 100 GRAMAS (não por porção), usando valores de referência de bases de dados " +
    "nutricionais padrão. O sódio é em mg por 100g. Usa nomes em português de Portugal." +
    LABEL_RULE +
    MICROS_RULE +
    notesSection(notes) +
    knowledge +
    cookingFactsRule(notes) +
    QUESTIONS_RULE +
    "\n\nResponde apenas com JSON estruturado conforme o schema.";
}

const writtenItemsList = (items: { name: string; grams: number | null }[]): string =>
  items
    .map((it, i) => `${i + 1}. "${it.name}"${it.grams != null ? ` — ${it.grams}g (valor exato dado pelo utilizador)` : " — sem gramas indicadas"}`)
    .join("\n");

// Fotos e alimentos escritos no mesmo ecrã (bug #47, 2026-10-03): o atleta
// fotografa o prato e escreve o que a foto não mostra (o café com açúcar, o
// molho) ou a quantidade que sabe. O que escreveu vale mais do que o que se
// vê: um alimento escrito que também está na foto é o mesmo, conta uma vez.
export function buildPhotosAndItemsPrompt(items: { name: string; grams: number | null }[], notes: string | null, knowledge = ""): string {
  return PHOTOS_INTRO +
    "\n\nAlém das fotos, o utilizador escreveu estes alimentos desta refeição:\n" +
    `${writtenItemsList(items)}\n\n` +
    "Como juntar as duas fontes:\n" +
    "- Devolve um item para CADA alimento escrito, com source_index igual ao número dele na lista acima. " +
    "O que o utilizador escreveu vale mais do que o que vês: se um alimento escrito também aparece nas fotos, " +
    "é o MESMO alimento — devolve-o uma vez só, com o source_index dele, e não o repitas como alimento das fotos.\n" +
    "- Para cada alimento das fotos que NÃO está na lista escrita, devolve um item com source_index 0.\n" +
    "- Porção (estimated_quantity_grams) de um alimento escrito: com gramas indicadas, usa EXATAMENTE esse valor; " +
    "sem gramas, estima-a pela foto se ele lá estiver, senão a porção típica do alimento descrito. Nunca 0 nem null.\n" +
    "- Porção de um alimento das fotos: a porção total visível em gramas.\n\n" +
    "Para cada item, o conteúdo nutricional é POR 100 GRAMAS (não por porção), com valores de referência de bases " +
    "de dados nutricionais padrão. O sódio é em mg por 100g. Usa nomes em português de Portugal." +
    LABEL_RULE +
    MICROS_RULE +
    notesSection(notes) +
    knowledge +
    cookingFactsRule(notes) +
    QUESTIONS_RULE +
    "\n\nResponde apenas com JSON estruturado conforme o schema.";
}

// Repõe os alimentos escritos pelo source_index: o nome é o que o atleta
// escreveu e as gramas, quando as deu, também (o Gemini só dá os valores).
// Os das fotos vêm primeiro, como na foto; os escritos a seguir. Um índice
// repetido é o mesmo alimento escrito duas vezes — fica o primeiro. null se
// faltar algum dos escritos (quem chama trata como falha da análise).
export function mergePhotoAndWrittenItems<T extends { quantity_grams: number; source_index?: number }>(
  raw: T[],
  written: { name: string; grams: number | null }[],
): Omit<T, "source_index">[] | null {
  const byIndex = new Map<number, Omit<T, "source_index">>();
  const fromPhotos: Omit<T, "source_index">[] = [];
  for (const { source_index, ...item } of raw) {
    const idx = Number(source_index);
    if (Number.isInteger(idx) && idx >= 1 && idx <= written.length) {
      if (!byIndex.has(idx)) byIndex.set(idx, item);
    } else {
      fromPhotos.push(item);
    }
  }
  if (byIndex.size !== written.length) return null;
  const fromWritten = written.map((w, i) => {
    const est = byIndex.get(i + 1)!;
    return { ...est, name: w.name.slice(0, 120), quantity_grams: w.grams != null ? w.grams : est.quantity_grams };
  });
  return [...fromPhotos, ...fromWritten];
}

// Prompt para o registo manual de texto (sem foto): o utilizador só indica
// nome de CADA alimento (uma lista, adicionada localmente no cliente sem
// tocar no Gemini) — as gramas são opcionais; quando não indicadas, o
// Gemini tem de estimar a porção típica a partir da descrição do alimento
// e das observações gerais da refeição (ex.: alimento "fiambre" + observação
// "1 fatia" tem de dar o mesmo resultado que alimento "1 fatia de fiambre"
// sem observação nenhuma — o peso de uma fatia típica). Só ao finalizar é
// que UMA ÚNICA chamada estima o conteúdo nutricional (e a porção, quando
// preciso) de TODOS de uma vez, tal como faria a partir de uma foto, mas
// usando os nomes descritos em vez de reconhecimento visual.
export function buildManualItemsPrompt(items: { name: string; grams: number | null }[], notes: string | null, knowledge = ""): string {
  const list = writtenItemsList(items);
  let prompt =
    "O utilizador registou manualmente os seguintes alimentos (sem foto):\n" +
    `${list}\n\n` +
    "Para CADA alimento da lista, estima o conteúdo nutricional POR 100 GRAMAS (não pela " +
    "porção total), usando valores de referência de bases de dados nutricionais padrão. " +
    "Considera o nome tal como foi escrito (pode incluir marca, forma de confeção, etc.) " +
    "para maior precisão. O sódio é em mg por 100g.\n\n" +
    "Quanto à porção (estimated_quantity_grams): quando o alimento tiver gramas indicadas, " +
    "usa EXATAMENTE esse valor. Quando NÃO tiver, tens de estimar tu a quantidade típica em " +
    "gramas dessa porção, combinando a descrição do alimento com as observações gerais da " +
    "refeição abaixo (se existirem) — os dois juntos descrevem a mesma porção, por isso o " +
    'resultado tem de ser idêntico quer a informação venha do nome do alimento, das observações, ' +
    'ou de ambos. Por exemplo: alimento "fiambre" com observação "1 fatia" tem de dar o mesmo ' +
    'peso que alimento "1 fatia de fiambre" sem observação nenhuma — o peso de uma fatia típica ' +
    "de fiambre (aprox. 20g). Outros exemplos de bom senso: \"1 banana\" ≈ 120g, \"1 ovo\" ≈ 50g, " +
    '"uma posta de bacalhau" ≈ 150g. Nunca devolvas 0 nem null nesta chave — escolhe sempre o ' +
    "valor mais plausível para uma porção normal do alimento descrito." +
    MICROS_RULE + "\n";
  if (notes && notes.trim()) {
    prompt += `\nObservações gerais desta refeição, escritas pelo utilizador: "${notes.trim()}"\n`;
  }
  prompt += knowledge + cookingFactsRule(notes) + QUESTIONS_RULE + "\nSem fotos: from_label=false em todos os itens.\n";
  prompt +=
    '\nDevolve exatamente um item no array "items" para CADA alimento da lista, pela MESMA ' +
    "ORDEM em que aparecem acima. Responde apenas com JSON estruturado conforme o schema.";
  return prompt;
}

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
// com fotos grandes.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Contagem de tokens de uma chamada ao Gemini: GeminiUsage/usageFromGemini em
// _shared/geminiUsage.ts (inclui thoughtsTokenCount, cobrado como output).

// Chama o Gemini com as partes de conteúdo dadas (imagens e/ou texto) e devolve
// os itens já normalizados a partir do RESPONSE_SCHEMA (ou lança um erro com
// uma mensagem amigável), junto com os tokens consumidos. Partilhado entre a
// análise por foto e a estimativa de texto da entrada manual.
async function runGeminiItemsRequest(
  parts: unknown[],
  geminiKey: string,
  emptyErrorMessage: string,
  retries = GEMINI_RETRIES,
  timeoutMs = GEMINI_TIMEOUT_MS,
  deadline = Number.POSITIVE_INFINITY,
  // RESPONSE_SCHEMA_WITH_SOURCE mantém o source_index em cada item (fotos +
  // alimentos escritos); quem o pede tira-o antes de gravar.
  schema: typeof RESPONSE_SCHEMA = RESPONSE_SCHEMA,
  // deno-lint-ignore no-explicit-any
): Promise<{ items: any[]; usage: GeminiUsage; facts: CookingFact[]; questions: unknown }> {
  const withSource = schema === RESPONSE_SCHEMA_WITH_SOURCE;
  const geminiRes = await geminiWithFallback((geminiModel, withThinking) =>
    fetchGeminiWithTimeout(
      geminiUrl(geminiModel),
      {
        method: "POST",
        headers: geminiHeaders(geminiKey),
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: schema,
            ...thinkingConfig("low", withThinking),
          },
        }),
      },
      timeoutMs,
      retries,
      deadline,
    )
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("Gemini error:", geminiRes.status, errText);
    if (GEMINI_RETRYABLE_STATUSES.has(geminiRes.status)) {
      // Já se tentou de novo (fetchGeminiWithTimeout) e continuou ocupado.
      throw new Error(geminiBusyMessage("analisar a refeição"));
    }
    throw new Error(upstreamErrorText(geminiRes.status));
  }

  const geminiJson = await geminiRes.json();
  const usage: GeminiUsage = usageFromGemini(geminiJson);
  const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed: { items?: unknown[]; cooking_facts?: unknown; questions?: unknown };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("Gemini devolveu JSON inválido:", rawText);
    throw new Error("A análise devolveu um formato inesperado. Tenta novamente.");
  }

  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
  // Micronutrientes: o que o modelo não dá fica null, não 0 (D6, 2026-10-05).
  const micro = microFromModel;
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    // deno-lint-ignore no-explicit-any
    .map((it: any) => ({
      name: String(it?.name ?? "").slice(0, 120) || "Alimento",
      quantity_grams: Math.max(1, num(it?.estimated_quantity_grams)),
      calories_per_100g: num(it?.calories_per_100g),
      protein_per_100g: num(it?.protein_per_100g),
      carbs_per_100g: num(it?.carbs_per_100g),
      fat_per_100g: num(it?.fat_per_100g),
      fiber_per_100g: micro(it?.fiber_per_100g),
      sugar_per_100g: micro(it?.sugar_per_100g),
      sodium_per_100g: micro(it?.sodium_per_100g),
      iron_mg_per_100g: micro(it?.iron_mg_per_100g),
      calcium_mg_per_100g: micro(it?.calcium_mg_per_100g),
      vitamin_c_mg_per_100g: micro(it?.vitamin_c_mg_per_100g),
      potassium_mg_per_100g: micro(it?.potassium_mg_per_100g),
      ...(withSource ? { source_index: Math.round(num(it?.source_index)) } : {}),
      // Não é coluna de meal_items: pickMealItem tira-o antes de gravar.
      from_label: it?.from_label === true,
    }));

  if (items.length === 0) {
    throw new Error(emptyErrorMessage);
  }
  return { items, usage, facts: parseCookingFacts(parsed.cooking_facts), questions: parsed.questions };
}

// Chama o Gemini com as imagens (base64) + observações, devolve os itens
// já normalizados + tokens consumidos (ou lança um erro com uma mensagem amigável).
async function analyzeWithGemini(
  images: string[],
  mime: string,
  notes: string | null,
  geminiKey: string,
  deadline = Number.POSITIVE_INFINITY,
  knowledge = "",
  // deno-lint-ignore no-explicit-any
): Promise<{ items: any[]; usage: GeminiUsage; facts: CookingFact[]; questions: unknown }> {
  const parts: unknown[] = [{ text: buildPrompt(notes, knowledge) }];
  for (const b64 of images) {
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }
  return runGeminiItemsRequest(
    parts,
    geminiKey,
    "Não foi possível identificar alimentos nas fotos. Tenta outro ângulo ou mais luz.",
    GEMINI_RETRIES,
    GEMINI_TIMEOUT_MS,
    deadline,
  );
}

// Fotos + alimentos escritos numa só chamada (bug #47). Os escritos voltam
// com o nome e as gramas do atleta (mergePhotoAndWrittenItems); faltando
// algum, a análise falha como as outras — "Tentar de novo" repete-a.
async function analyzePhotosWithItems(
  images: string[],
  mime: string,
  written: { name: string; grams: number | null }[],
  notes: string | null,
  geminiKey: string,
  deadline = Number.POSITIVE_INFINITY,
  knowledge = "",
  // deno-lint-ignore no-explicit-any
): Promise<{ items: any[]; usage: GeminiUsage; facts: CookingFact[]; questions: unknown }> {
  const parts: unknown[] = [{ text: buildPhotosAndItemsPrompt(written, notes, knowledge) }];
  for (const b64 of images) {
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }
  const { items: raw, usage, facts, questions } = await runGeminiItemsRequest(
    parts,
    geminiKey,
    "Não foi possível identificar os alimentos. Tenta outro ângulo ou descreve-os de outra forma.",
    GEMINI_RETRIES,
    GEMINI_TIMEOUT_MS,
    deadline,
    RESPONSE_SCHEMA_WITH_SOURCE,
  );
  const items = mergePhotoAndWrittenItems(raw, written);
  if (!items) {
    throw new Error("A análise não devolveu todos os alimentos que escreveste. Tenta novamente.");
  }
  // Os escritos ficam com o nome do atleta — as perguntas seguem-no. Só o
  // primeiro de cada source_index, como em mergePhotoAndWrittenItems.
  const seen = new Set<number>();
  const pairs = raw
    .filter((r) => {
      const i = Number(r.source_index);
      if (!Number.isInteger(i) || i < 1 || i > written.length || seen.has(i)) return false;
      seen.add(i);
      return true;
    })
    .map((r): [string, string] => [String(r.name), written[Number(r.source_index) - 1].name.slice(0, 120)]);
  const finalNames = items.map((it) => String((it as { name?: unknown }).name ?? ""));
  return { items, usage, facts, questions: remapQuestionItems(questions, pairs, finalNames) };
}

// Bug #48 (fase C): um alimento que o atleta adiciona à despensa — por
// descrição, ou por foto do rótulo / da galeria. A Carol confirma (estima,
// ou lê a tabela nutricional) e devolve; quem grava é a app, depois de ele
// ver e, se quiser, ajustar (mockup "Despensa e perguntas da Carol", ecrã 8).
const PANTRY_FOOD_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    portion_grams: { type: "NUMBER" },
    portion_label: { type: "STRING", nullable: true },
    from_label: { type: "BOOLEAN" },
    ...Object.fromEntries(Object.entries(RESPONSE_SCHEMA.properties.items.items.properties)
      .filter(([k]) => k.endsWith("_per_100g"))),
  },
  required: ["name", "portion_grams", "from_label", "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"],
};

export function buildPantryFoodPrompt(description: string | null, hasImages: boolean): string {
  const base = hasImages
    ? "A(s) foto(s) mostram a embalagem ou o rótulo de UM produto que o atleta quer guardar na despensa dele. " +
      "Se a tabela nutricional estiver legível, usa os valores POR 100 g LIDOS dela (não estimes), o nome comercial " +
      "e, se a embalagem a indicar, a porção (ex.: \"1 barra\", 60 g); from_label=true. Sem tabela legível, " +
      "estima pelo produto que vês, from_label=false."
    : "O atleta quer guardar este alimento na despensa dele e descreveu-o assim: " +
      `"${(description ?? "").trim()}". Dá-lhe um nome claro em português de Portugal (com a marca, se ele a disse), ` +
      "a porção que ele costuma comer em gramas (portion_grams) e, se for uma unidade, o nome dela (portion_label, " +
      "ex. \"1 fatia\"), e os valores nutricionais POR 100 g, de bases de dados padrão. from_label=false.";
  return base + (hasImages && description?.trim() ? ` O atleta acrescentou: "${description.trim()}".` : "") +
    " O sódio é em mg por 100 g. Sem porção indicada, a porção normal desse alimento. " +
    "Responde apenas com JSON estruturado conforme o schema.";
}

async function analyzePantryFood(
  parts: unknown[],
  geminiKey: string,
  deadline: number,
  // deno-lint-ignore no-explicit-any
): Promise<{ food: Record<string, any>; usage: GeminiUsage }> {
  const geminiRes = await geminiWithFallback((geminiModel, withThinking) =>
    fetchGeminiWithTimeout(
      geminiUrl(geminiModel),
      {
        method: "POST",
        headers: geminiHeaders(geminiKey),
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: PANTRY_FOOD_SCHEMA,
            ...thinkingConfig("low", withThinking),
          },
        }),
      },
      GEMINI_TIMEOUT_MS,
      GEMINI_RETRIES,
      deadline,
    )
  );
  if (!geminiRes.ok) {
    console.error("Gemini error:", geminiRes.status, await geminiRes.text());
    if (GEMINI_RETRYABLE_STATUSES.has(geminiRes.status)) throw new Error(geminiBusyMessage("ler este alimento"));
    throw new Error(upstreamErrorText(geminiRes.status));
  }
  const json = await geminiRes.json();
  const usage = usageFromGemini(json);
  // deno-lint-ignore no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(json?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch {
    throw new Error("Não consegui ler este alimento. Tenta descrevê-lo de outra forma.");
  }
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
  const name = String(parsed?.name ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Não consegui ler este alimento. Tenta descrevê-lo de outra forma.");
  const label = typeof parsed?.portion_label === "string" && parsed.portion_label.trim() ? parsed.portion_label.trim().slice(0, 40) : null;
  return {
    food: {
      name,
      portion_grams: Math.max(1, Math.round(num(parsed?.portion_grams)) || 100),
      portion_label: label,
      from_label: parsed?.from_label === true,
      // Os micronutrientes que a Carol não deu voltam null, não 0 (2026-10-05):
      // a app grava-os assim na despensa, por confirmar (src/utils/pantry.js).
      ...Object.fromEntries(Object.keys(PANTRY_FOOD_SCHEMA.properties).filter((k) => k.endsWith("_per_100g"))
        .map((k) => [k, isMicroColumn(k) ? microFromModel(parsed?.[k]) : num(parsed?.[k])])),
    },
    usage,
  };
}

// Os alimentos escritos no pedido: nome (até 120) e gramas opcionais. Sem
// nome, não conta. Partilhado pelo registo manual e pelo das fotos.
// deno-lint-ignore no-explicit-any
export function parseWrittenItems(raw: any): { name: string; grams: number | null }[] {
  return (Array.isArray(raw) ? raw : [])
    // deno-lint-ignore no-explicit-any
    .map((it: any) => {
      const g = Number(it?.grams);
      return {
        name: typeof it?.name === "string" ? it.name.trim().slice(0, 120) : "",
        grams: Number.isFinite(g) && g > 0 ? g : null,
      };
    })
    .filter((it) => it.name);
}
const MAX_WRITTEN_ITEMS = 30;

// Estima o conteúdo nutricional de TODOS os alimentos do registo manual
// numa só chamada ao Gemini (uma por refeição, não uma por alimento). Força
// o nome de cada item de volta para exatamente o que o utilizador escreveu,
// por posição — o Gemini só fornece os valores nutricionais (e a porção,
// quando o utilizador não a indicou), nunca reescreve o que foi pedido.
// Quando o utilizador deu as gramas, usa-se sempre esse valor exato, mesmo
// que o Gemini devolva algo ligeiramente diferente; só quando não deu é que
// se aceita a estimativa de porção do Gemini (ver buildManualItemsPrompt).
// Mais tentativas que a análise por foto (3 em vez de 1): este pedido é só
// texto, sem imagens, por isso cada tentativa é rápida — dá para tentar mais
// vezes quando a chamada fica presa. O prazo do pedido (deadline) corta as
// tentativas antes do que a app espera pela resposta.
async function analyzeManualItems(
  items: { name: string; grams: number | null }[],
  notes: string | null,
  geminiKey: string,
  deadline = Number.POSITIVE_INFINITY,
  knowledge = "",
  // deno-lint-ignore no-explicit-any
): Promise<{ items: any[]; usage: GeminiUsage; facts: CookingFact[]; questions: unknown }> {
  const parts: unknown[] = [{ text: buildManualItemsPrompt(items, notes, knowledge) }];
  const { items: rawItems, usage, facts, questions } = await runGeminiItemsRequest(
    parts,
    geminiKey,
    "Não foi possível estimar valores nutricionais para estes alimentos. Tenta descrevê-los de outra forma.",
    3,
    30000,
    deadline,
  );
  if (rawItems.length !== items.length) {
    throw new Error("A estimativa não devolveu todos os alimentos pedidos. Tenta novamente.");
  }
  const merged = rawItems.map((it, i) => ({
    ...it,
    name: items[i].name.slice(0, 120),
    quantity_grams: items[i].grams != null ? items[i].grams : it.quantity_grams,
  }));
  // O nome passa a ser o escrito — as perguntas seguem-no.
  const pairs = rawItems.map((it, i): [string, string] => [String(it.name), items[i].name.slice(0, 120)]);
  return { items: merged, usage, facts, questions: remapQuestionItems(questions, pairs, merged.map((m) => m.name)) };
}

// Espelha DIETARY_RESTRICTION_INFO em supabase/functions/coach-chat/index.ts
// (que por sua vez espelha DIETARY_RESTRICTIONS em src/utils/diet.js).
// Triplicado, não duplicado — cada Edge Function empacota só a sua própria
// pasta, por isso nenhuma pode importar de fora. Se mexeres numa cópia, mexe
// nas outras duas.
//
// Antes desta correção, generateMealCoachNotes comentava a refeição sem
// nunca saber que o atleta tem uma restrição — o comentário automático podia
// sugerir "acrescenta frango" a um vegetariano. Ver specs/coach-investigacao.md,
// Bloco 7 #5: esta lacuna não deixa o Coach calado, deixa-o ERRADO.
const DIETARY_RESTRICTION_INFO: Record<string, { label: string; rule: string }> = {
  vegetariano: {
    label: "Vegetariano",
    rule: "sem carne nem peixe (come ovos e lacticínios). Alternativas: tofu, tempeh, seitan, ovos, lacticínios, leguminosas com cereais.",
  },
  vegano: {
    label: "Vegano",
    rule: "sem qualquer produto animal — nem ovos nem lacticínios. Alternativas: tofu, tempeh, seitan, proteína de ervilha ou arroz, soja texturizada, leguminosas com cereais.",
  },
  sem_lactose: {
    label: "Sem lactose",
    rule: "evita leite e derivados frescos. Alternativas: produtos sem lactose, queijos curados, bebidas vegetais enriquecidas, whey isolate.",
  },
  sem_gluten: {
    label: "Sem glúten",
    rule: "evita trigo, centeio e cevada. Alternativas: arroz, batata, batata-doce, tapioca, milho, quinoa, trigo sarraceno, aveia certificada.",
  },
};

// Bloco de texto com as restrições do atleta, pronto a entrar no prompt do
// comentário — string vazia quando não há nada a dizer, para não gastar
// tokens a afirmar ausência em todos os pedidos da larga maioria dos
// utilizadores. Exportado para teste direto (sem precisar de mockar o Gemini).
export function dietaryRestrictionsPromptBlock(
  restrictions: string[] | null | undefined,
  notes: string | null | undefined,
): string {
  const linhas: string[] = [];
  for (const key of restrictions ?? []) {
    const info = DIETARY_RESTRICTION_INFO[key];
    if (info) linhas.push(`- ${info.label}: ${info.rule}`);
  }
  const notasLimpas = typeof notes === "string" ? notes.trim() : "";
  if (notasLimpas) {
    linhas.push(
      `- Alergias/recusas declaradas pelo atleta: "${notasLimpas}". Trata isto como ` +
      `restrição absoluta mesmo que não percebas o motivo.`,
    );
  }
  if (linhas.length === 0) return "";
  return (
    `\nRESTRIÇÕES ALIMENTARES DO ATLETA — nunca sugiras, na tua recomendação final, um ` +
    `alimento que as viole. Isto é mais grave do que não sugerir nada:\n${linhas.join("\n")}\n`
  );
}

// Doutrina de nutrição condensada — ver src/coach-knowledge/07-sugestoes-alimentares.md
// (fonte: specs/coach-investigacao.md, Bloco 7). Quarta cópia — mesma razão da
// triplicação de DIETARY_RESTRICTION_INFO, acima.
const MEAL_DOCTRINE =
  `Ao dares a sugestão final, usa esta doutrina (Bloco 7, ACSM/AND 2016, INSA/PortFIR), não ` +
  `o teu conhecimento geral: por refeição, a proteína alvo ronda 0,3-0,4 g/kg do peso do ` +
  `atleta; em dia de treino exigente os hidratos concentram-se antes/depois do treino. ` +
  `Equivalência prática (por 100 g): frango/peru peito 30-31 g proteína, salmão/atum 24-26, ` +
  `ovo 12,5 (≈6 g/ovo), skyr/iogurte grego 0% 10-12, tofu firme 12-15, lentilhas/grão 8-9. ` +
  `A sugestão a acrescentar/reduzir deve ser um alimento comum e uma quantidade redonda ` +
  `("mais 100g de frango"), não uma ementa de precisão — baixo atrito, não adesão obrigatória ` +
  `a um número exato.`;

const MEAL_TYPE_LABELS: Record<string, string> = {
  "pequeno-almoco": "Pequeno-almoço",
  "lanche-manha": "Lanche da manhã",
  "almoco": "Almoço",
  "lanche": "Lanche",
  "jantar": "Jantar",
  "ceia": "Ceia",
};

type MealTotals = { calories: number; protein: number; carbs: number; fat: number };

// deno-lint-ignore no-explicit-any
function totalsFromItems(items: any[]): MealTotals {
  return (items || []).reduce(
    (acc, it) => {
      const factor = (Number(it?.quantity_grams) || 0) / 100;
      acc.calories += factor * (Number(it?.calories_per_100g) || 0);
      acc.protein += factor * (Number(it?.protein_per_100g) || 0);
      acc.carbs += factor * (Number(it?.carbs_per_100g) || 0);
      acc.fat += factor * (Number(it?.fat_per_100g) || 0);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/* Enquadramento da análise conforme a situação do atleta.

   Duplicado em analyze-run / analyze-meal / analyze-gym e espelhado na
   doutrina "Modos de Acompanhamento" do coach-chat — as Edge Functions não
   partilham módulos (ver PRD 3.7). Mexer num obriga a mexer nos outros.

   Porquê: sem plano, planSection ficava a string vazia e a Carol não recebia
   orientação nenhuma — caía na doutrina genérica, que pressupõe plano, e
   falava de "desvio" e "atraso" a atletas que nunca tiveram plano.

   intervention_needed fica SUPRIMIDO nos dois modos sem plano: o fluxo de
   intervenção existe sobretudo para renegociar um plano (resolve_intervention
   aceita "plano_ajustado" ou "atleta_ignorou", ambos dependentes de plano; o
   3º desfecho, "falso_positivo" — desvio sinalizado por engano de registo —,
   não depende de plano, mas mantemos a supressão por simplicidade: sem plano
   nenhum, o botão vermelho não tem uma renegociação do outro lado na maioria
   dos casos. O aviso de risco continua a chegar ao atleta pelo texto da nota. */
/* `race` (2026-09-26, Fase 0 do Troféu): a prova de referência — a próxima
   principal quando existe (fetchFrameRace). Só entra no enquadramento "prova
   agendada, sem plano", que é o que julga o registo contra a prova; sem ela
   o texto fica igual ao de antes. */
export function planningFrameSection(hasPlan: boolean, hasUpcomingRace: boolean, race: FrameRace | null = null): string {
  if (hasPlan) {
    return hasUpcomingRace
      ? ""
      : `\nNOTA DE ENQUADRAMENTO: este plano NÃO serve nenhuma prova — serve manutenção da ` +
        `condição física ou progresso geral. Não fales de taper, pico de forma nem contagem ` +
        `decrescente para uma data. O critério de sucesso é consistência e progressão ` +
        `sustentável, não um tempo-alvo.\n`;
  }
  if (hasUpcomingRace) {
    const ref = frameRaceSentence(race);
    return `\nENQUADRAMENTO — PROVA AGENDADA, SEM PLANO: o atleta tem prova marcada mas NÃO tem ` +
      `plano de treino.${ref ? ` ${ref}` : ""} NUNCA digas que este registo está "fora do plano", "em atraso" ou que ` +
      `"o plano está comprometido" — não existe plano de que desviar. Julga-o pela adequação ao ` +
      `objetivo da prova e à fase de preparação, usando o histórico e o volume semanal como base ` +
      `de comparação. Se houver risco real (carga aguda, fadiga acumulada, progressão rápida ` +
      `demais), diz-o como conselho direto. NÃO marques intervention_needed: a ausência de plano ` +
      `é uma escolha do atleta, não um problema a corrigir.\n`;
  }
  return `\nENQUADRAMENTO — SEM PROVA E SEM PLANO (acompanhamento): o atleta não tem prova ` +
    `agendada nem plano, e não te pediu nada. O pressuposto por omissão é que quer MANTER os ` +
    `seus hábitos — não assumas que quer melhorar, nem que quer plano. A análise é de ` +
    `acompanhamento: diz o que vês neste registo face ao histórico, reforça o que está ` +
    `consistente, avisa do que for risco real (carga aguda, fadiga, lesão) e fica por aí. ` +
    `NUNCA fales de "desvio", "atraso" ou "plano". NÃO marques intervention_needed — sem plano ` +
    `nem objetivo declarado não há nada a renegociar.\n`;
}

// Gera o comentário do Coach sobre uma refeição: compara-a com uma fatia
// proporcional das metas diárias (não há forma leve de somar o dia todo
// aqui sem outra ronda de queries) e com as últimas refeições do mesmo tipo,
// para sinalizar inconsistência (ex.: almoço com muito mais gordura que o
// habitual). Curto de propósito — é um comentário por refeição, não uma
// análise do dia.
// A estrutura comum às análises de registo (_shared/carolTone.ts), com o que
// se lê numa refeição. Mais curta do que a de um treino: há várias por dia.
const MEAL_ANALYSIS_RULES = carolRecordAnalysisRules({
  readingLabel: "O prato",
  readingHint:
    "o que esta refeição entrega — calorias, proteína, hidratos e gordura — face ao tipo de refeição, ao que já comeu " +
    "hoje e aos treinos feitos ou previstos.",
  focusHint:
    "Vai buscá-los aos alimentos concretos (pelo nome, com a quantidade) e ao papel da refeição no dia: recuperar um " +
    "treino feito, preparar um treino previsto. Para o que corrigir, olha para a proteína, os hidratos face ao treino, " +
    "a gordura e o alimento a trocar — sempre dentro das restrições alimentares dele.",
  sentences: "5 e 8",
  interventionInvite: true,
});

/** Os alimentos da refeição, pelo nome e com a quantidade, para ela os poder
 *  comentar um a um — até 2026-09-25 só lhe chegavam os totais. */
export function formatMealItemsLine(items: Array<{ name?: string | null; quantity_grams?: number | null }> | null | undefined): string | null {
  const parts = (items || [])
    .filter((it) => typeof it?.name === "string" && it.name.trim())
    .slice(0, 20)
    .map((it) => {
      const g = Number(it.quantity_grams);
      return g > 0 ? `${it.name!.trim()} (${Math.round(g)} g)` : it.name!.trim();
    });
  return parts.length ? `Alimentos: ${parts.join(", ")}` : null;
}

async function generateMealCoachNotes(
  meal: {
    date: string;
    meal_type: string;
    meal_time?: string | null;
    notes: string | null;
    items?: Array<{ name?: string | null; quantity_grams?: number | null }>;
  },
  totals: MealTotals,
  goals: { calorie_goal?: number | null; protein_goal?: number | null; carbs_goal?: number | null; fat_goal?: number | null },
  previousMeals: Array<{ date: string } & MealTotals>,
  // deno-lint-ignore no-explicit-any
  planItems: any[],
  // Há prova agendada? Decide o enquadramento quando não há plano — ver
  // planningFrameSection.
  // A prova de referência (fetchFrameRace): a próxima principal, senão a
  // próxima — ou null sem prova agendada.
  upcomingRace: FrameRace | null,
  recentCompletedWorkouts: { runs: any[]; gym: any[] } = { runs: [], gym: [] },
  geminiKey: string,
  diet: { dietary_restrictions?: string[] | null; dietary_notes?: string | null } = {},
  memoryBlock: string | null = null,
  // profiles.experience_level — calibra a linguagem (bug #40).
  experienceLevel: string | null = null,
  // Até quando se pode tentar (COACH_BUDGET_MS, em _shared/geminiFetch.ts).
  deadline = Number.POSITIVE_INFINITY,
  // O dia até agora face ao que ela sugeriu (5.5, push 3) — dayProgressSection.
  dayProgress: string | null = null,
  // usage: o consumo desta chamada (null se não chegou a haver resposta).
): Promise<{ text: string | null; intervention_needed?: boolean; intervention_reason?: string | null; usage: GeminiUsage | null }> {
  if (!geminiKey) return { text: null, usage: null };
  // Sem tempo para uma tentativa útil antes do prazo, nem se começa: a
  // refeição já está gravada e a resposta não pode passar o que a app espera.
  if (!hasTimeFor(deadline)) return { text: null, usage: null };
  if (totals.calories <= 0) return { text: null, usage: null }; // sem itens, nada para comentar

  const typeLabel = MEAL_TYPE_LABELS[meal.meal_type] || meal.meal_type;
  const itemsLine = formatMealItemsLine(meal.items);

  // Referência só para dar escala ao modelo (ex.: "isto é XX% da meta diária
  // de proteína") — não é uma meta por refeição real, o utilizador não a
  // define, por isso o prompt já pede para não a tratar como tal.
  const goalLine = [
    goals.calorie_goal ? `Meta diária de calorias: ${goals.calorie_goal} kcal` : null,
    goals.protein_goal ? `Meta diária de proteína: ${goals.protein_goal}g` : null,
    goals.carbs_goal ? `Meta diária de hidratos: ${goals.carbs_goal}g` : null,
    goals.fat_goal ? `Meta diária de gordura: ${goals.fat_goal}g` : null,
  ].filter(Boolean).join("; ");

  const recent = previousMeals.slice(0, 5);
  const avg = recent.length
    ? recent.reduce((a, m) => ({
        calories: a.calories + m.calories, protein: a.protein + m.protein,
        carbs: a.carbs + m.carbs, fat: a.fat + m.fat,
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
    : null;
  const avgLine = avg && recent.length
    ? `Média das últimas ${recent.length} refeições deste tipo: ${(avg.calories / recent.length).toFixed(0)} kcal, ` +
      `P ${(avg.protein / recent.length).toFixed(0)}g, H ${(avg.carbs / recent.length).toFixed(0)}g, G ${(avg.fat / recent.length).toFixed(0)}g.`
    : "Sem refeições anteriores deste tipo para comparar — comenta só o que estes números por si só revelam.";

  const restricoes = dietaryRestrictionsPromptBlock(diet.dietary_restrictions, diet.dietary_notes);

  const yesterdayISO = new Date(new Date(meal.date).getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const todayRuns = (recentCompletedWorkouts.runs || []).filter(r => r.date === meal.date);
  const yesterdayRuns = (recentCompletedWorkouts.runs || []).filter(r => r.date === yesterdayISO);
  const todayGym = (recentCompletedWorkouts.gym || []).filter(g => g.date === meal.date);
  const yesterdayGym = (recentCompletedWorkouts.gym || []).filter(g => g.date === yesterdayISO);

  let workoutsText = `\nHistórico de Treinos REALIZADOS (efetivamente concluídos e registados):\n`;
  if (yesterdayRuns.length || yesterdayGym.length) {
    workoutsText += `- Ontem (${yesterdayISO}): ` + [
      ...yesterdayRuns.map(r => `Corrida (${r.distance_km}km, ${Math.round((r.duration_seconds || 0)/60)}m, RPE ${r.effort_rpe || '?'}/10)`),
      ...yesterdayGym.map(g => `Ginásio ${g.name || ''} (${Math.round((g.duration_seconds || 0)/60)}m, RPE ${g.exertion || '?'}/10)`),
    ].join(", ") + "\n";
  }
  if (todayRuns.length || todayGym.length) {
    workoutsText += `- Hoje (${meal.date}): ` + [
      ...todayRuns.map(r => `Corrida (${r.distance_km}km, ${Math.round((r.duration_seconds || 0)/60)}m, RPE ${r.effort_rpe || '?'}/10)`),
      ...todayGym.map(g => `Ginásio ${g.name || ''} (${Math.round((g.duration_seconds || 0)/60)}m, RPE ${g.exertion || '?'}/10)`),
    ].join(", ") + "\n";
  } else {
    workoutsText += `- Hoje (${meal.date}): ainda NENHUM treino foi realizado até ao momento.\n`;
  }

  const planSection = planItems.length > 0 
    ? `\nPlano de treino PREVISTO/FUTURO (o que está agendado mas ainda não foi feito a menos que conste em 'Treinos REALIZADOS' acima):\n` +
      planItems.map(i => `- ${i.planned_date}: ${i.kind === 'corrida' ? `${i.training_type === 'caminhada' ? 'Caminhada' : `Corrida ${i.training_type || ''}`} (${i.target_distance_km || '?'}km, ${i.target_duration_min || '?'}min)` : i.kind}`).join("\n") +
      `\n\nAVALIAÇÃO DO PLANO E NUTRIÇÃO: Avalia se os alimentos e macros desta refeição estão adequados para a recuperação dos treinos já feitos OU como preparação para os treinos previstos. Se o plano estiver gravemente comprometido e justificar que a Carol intervenha para propor um novo plano, marca intervention_needed=true e indica a reason.\n` +
      planningFrameSection(true, !!upcomingRace, upcomingRace)
    : planningFrameSection(false, !!upcomingRace, upcomingRace);

  const prompt =
    `És a Carol, a treinadora deste atleta amador, a comentar em primeira pessoa a refeição que ele acabou de registar. ` +
    `Escreve em português (PT), tom próximo.\n\n` +
    `${CAROL_TONE_RULES_SHORT}\n\n` +
    `${carolLanguageRule(experienceLevel)}\n\n` +
    memoryPromptSection(memoryBlock) +
    `Refeição: ${typeLabel}, ${meal.date}${normalizeMealTime(meal.meal_time) ? ` às ${normalizeMealTime(meal.meal_time)}` : ""}\n` +
    (itemsLine ? `${itemsLine}\n` : "") +
    `Calorias: ${totals.calories.toFixed(0)} kcal\n` +
    `Proteína: ${totals.protein.toFixed(1)}g · Hidratos: ${totals.carbs.toFixed(1)}g · Gordura: ${totals.fat.toFixed(1)}g\n` +
    (goalLine ? `${goalLine} (referência diária, esta é só uma refeição — não esperes que bata a meta toda).\n` : "") +
    `${avgLine}\n` +
    (dayProgress ?? "") +
    (meal.notes ? `Nota do utilizador: "${meal.notes}"\n` : "") +
    restricoes +
    workoutsText +
    planSection +
    `\nREGRAS CRÍTICAS:\n` +
    `- Usa os números que provam o que dizes — não despejes a ficha toda.\n` +
    `- DISTINÇÃO ENTRE TREINOS FEITOS vs. PREVISTOS: NUNCA digas 'após o teu treino de X' de um treino que apenas está no plano para hoje e que ainda NÃO consta na lista de treinos REALIZADOS! Se o treino de hoje ainda não foi feito, refere-te a ele como 'o teu próximo treino de X' ou 'o treino que terás mais tarde'.\n` +
    `- CEIA / REFEIÇÕES ANTES DE DORMIR: A Ceia é uma refeição noturna tomada antes de ir dormir (mesmo que registada na madrugada). Numa Ceia, o treino do próprio dia da data ainda está por realizar mais tarde quando o atleta acordar. A Ceia foca-se no aporte proteico de absorção lenta (caseína, skyr, iogurte grego, queijo fresco) para manter a síntese proteica e regeneração muscular durante o sono.\n` +
    `- Se a proteína desta refeição for baixa para o tipo de refeição, ou a gordura/hidratos muito acima do habitual, diz isso.\n` +
    `- Nunca tragas frases genéricas de louvor sem estarem ancoradas num alimento ou num número concreto.\n` +
    `- O bloco "Para a próxima" é uma sugestão pequena e concreta (ex.: um alimento a acrescentar/reduzir na próxima refeição do mesmo tipo; ou, se "O DIA ATÉ AGORA" disser que a ceia é a única hipótese que resta hoje, o que pôr nessa ceia)` +
    (restricoes ? `, sempre dentro das restrições alimentares do atleta indicadas acima.\n` : `.\n`) +
    `\n${MEAL_ANALYSIS_RULES}\n` +
    `\nDevolve a resposta obrigatoriamente no formato JSON com: "text" (análise), "intervention_needed" (boolean, true se justificar intervenção) e "intervention_reason" (string, justificação).\n` +
    `\n${MEAL_DOCTRINE}\n`;

  try {
    const res = await geminiWithFallback((geminiModel, withThinking) =>
      fetchGeminiWithTimeout(
        geminiUrl(geminiModel),
        {
          method: "POST",
          headers: geminiHeaders(geminiKey),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              // A análise estruturada é mais longa (feedback de 2026-09-25).
              maxOutputTokens: 8192,
              response_mime_type: "application/json",
              response_schema: {
                type: "OBJECT",
                properties: {
                  text: { type: "STRING" },
                  intervention_needed: { type: "BOOLEAN" },
                  intervention_reason: { type: "STRING" }
                },
                required: ["text", "intervention_needed"]
              },
              ...thinkingConfig("low", withThinking),
            },
          }),
        },
        45000,
        0,
        deadline,
      )
    );
    if (!res.ok) {
      console.warn("Meal coach generation failed:", res.status, await res.text());
      return { text: null, usage: null };
    }
    const json = await res.json();
    // Os tokens foram cobrados mesmo que o texto venha vazio/inválido.
    const usage = usageFromGemini(json);
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return { text: null, usage };

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawText.replace(/```json\n/g, '').replace(/```/g, ''));
    } catch (e) {
      console.error("Coach generation json parse error", e, rawText);
    }
    return { 
      text: parsed.text?.trim() || null, 
      intervention_needed: parsed.intervention_needed,
      intervention_reason: parsed.intervention_reason,
      usage,
    };
  } catch (e) {
    console.warn("Meal coach generation error:", e);
    return { text: null, usage: null };
  }
}

// Busca metas + refeições recentes do mesmo tipo, gera o comentário e grava-o
// — best-effort, tal como em analyze-run: uma falha aqui nunca desfaz a
// refeição já gravada, só fica sem comentário. Devolve o consumo de tokens do
// comentário (null se a chamada não chegou a acontecer) para somar ao usage.
async function attachMealCoachNotes(
  // deno-lint-ignore no-explicit-any
  sb: any,
  userId: string,
  meal: { id: string; coach_notes?: string | null },
  ctx: {
    date: string;
    meal_type: string;
    meal_time?: string | null;
    notes: string | null;
    totals: MealTotals;
    // As linhas de meal_items acabadas de gravar (nome + quantidade).
    items?: Array<{ name?: string | null; quantity_grams?: number | null }>;
  },
  geminiKey: string,
  deadline = Number.POSITIVE_INFINITY,
): Promise<GeminiUsage | null> {
  // Fora do try: se a gravação depois da chamada falhar, os tokens já foram
  // cobrados e continuam a contar.
  let usage: GeminiUsage | null = null;
  try {
    // A memória durável e a conversa recente do chat (Fase 1, ação 1.3): a
    // Carol que comenta este registo é a mesma que falou com ele ontem.
    const memoryPromise = fetchSharedMemoryBlock(sb, userId);
    const { data: profile } = await sb
      .from("profiles")
      .select("calorie_goal, protein_goal, carbs_goal, fat_goal, dietary_restrictions, dietary_notes, experience_level")
      .eq("id", userId)
      .maybeSingle();

    // deno-lint-ignore no-explicit-any
    const { data: previous } = await sb
      .from("meals")
      .select("date, meal_items(quantity_grams, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)")
      .eq("user_id", userId)
      .eq("meal_type", ctx.meal_type)
      .lt("date", ctx.date)
      .order("date", { ascending: false })
      .limit(5);

    // deno-lint-ignore no-explicit-any
    const previousMeals = (previous || []).map((m: any) => ({ date: m.date, ...totalsFromItems(m.meal_items || []) }));

    const { data: activePlans } = await sb
      .from("coach_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "aceite")
      .lte("period_start", ctx.date)
      .gte("period_end", ctx.date)
      .order("created_at", { ascending: false })
      .limit(1);

    let planItems = [];
    if (activePlans && activePlans.length > 0) {
      const { data: items } = await sb
        .from("coach_plan_items")
        .select("planned_date, kind, training_type, target_distance_km, target_duration_min, meal_suggestion, status")
        .eq("user_id", userId)
        .eq("plan_id", activePlans[0].id)
        .gte("planned_date", new Date(new Date(ctx.date).getTime() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10))
        .lte("planned_date", ctx.date);
      planItems = items || [];
    }

    /* Prova agendada? A principal (ou a próxima), numa frase curta via frameRace — serve para
       escolher o enquadramento da análise (planningFrameSection). Inclui o
       próprio dia: uma prova hoje ainda enquadra o registo de hoje. */
    // A próxima principal quando existe, senão a próxima (fetchFrameRace).
    const frameRace = await fetchFrameRace(sb, userId, ctx.date);

    const yesterdayISO = new Date(new Date(ctx.date).getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const [{ data: actualRuns }, { data: actualGym }, { data: todayOthers }, { data: daySuggestions }] = await Promise.all([
      sb
        .from("runs")
        .select("date, training_type, distance_km, duration_seconds, effort_rpe")
        .eq("user_id", userId)
        .gte("date", yesterdayISO)
        .lte("date", ctx.date),
      sb
        .from("workout_sessions")
        .select("date, name, categories, exertion, duration_seconds")
        .eq("user_id", userId)
        .gte("date", yesterdayISO)
        .lte("date", ctx.date),
      // O dia até agora (5.5, push 3): as outras refeições de hoje…
      sb
        .from("meals")
        .select("id, meal_type, meal_time, meal_items(quantity_grams, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)")
        .eq("user_id", userId)
        .eq("date", ctx.date)
        .neq("id", meal.id),
      // …e o que ela sugeriu para hoje (as macros do dia num plano aceite).
      sb
        .from("coach_plan_items")
        .select("meal_macros, coach_plans!inner(status)")
        .eq("user_id", userId)
        .eq("planned_date", ctx.date)
        .eq("coach_plans.status", "aceite")
        .not("meal_macros", "is", null)
        .limit(5),
    ]);
    // deno-lint-ignore no-explicit-any
    const suggestion = (daySuggestions || []).map((i: any) => i?.meal_macros).find((m: any) => Number(m?.kcal) > 0 || Number(m?.protein_g) > 0) ?? null;
    const dayProgress = dayProgressSection(mealDayProgress({
      thisMeal: { ...ctx.totals, meal_type: ctx.meal_type, meal_time: ctx.meal_time },
      // deno-lint-ignore no-explicit-any
      otherMeals: (todayOthers || []).map((m: any) => ({ ...totalsFromItems(m.meal_items || []), meal_type: m.meal_type, meal_time: m.meal_time })),
      suggestion,
      goals: profile || {},
    }));

    const result = await generateMealCoachNotes(
      { date: ctx.date, meal_type: ctx.meal_type, meal_time: ctx.meal_time, notes: ctx.notes, items: ctx.items },
      ctx.totals,
      profile || {},
      previousMeals,
      planItems,
      frameRace,
      { runs: actualRuns || [], gym: actualGym || [] },
      geminiKey,
      {
        dietary_restrictions: (profile?.dietary_restrictions as string[] | null) ?? null,
        dietary_notes: (profile?.dietary_notes as string | null) ?? null,
      },
      await memoryPromise,
      (profile?.experience_level as string | null) ?? null,
      deadline,
      dayProgress,
    );
    usage = result.usage;

    if (result.text) {
      await sb.from("meals").update({ coach_notes: result.text }).eq("id", meal.id);
      meal.coach_notes = result.text;
    }
    
    if (result.intervention_needed && result.intervention_reason) {
      await sb.from("profiles")
        .update({
          coach_intervention_status: "needed",
          coach_intervention_reason: result.intervention_reason,
          // De onde veio o aviso (5.5): o trigger track_coach_intervention
          // copia-a para coach_interventions e limpa-a.
          coach_intervention_origin: INTERVENTION_ORIGIN.MEAL,
        })
        .eq("id", userId);
      (meal as any).coach_intervention_status = "needed";
      (meal as any).intervention_needed = true;
    }
  } catch (e) {
    console.warn("attachMealCoachNotes failed:", e);
  }
  return usage;
}

// O consumo do Gemini que a resposta traz fica gravado em ai_usage pelo
// servidor (_shared/usageRecorder.ts), não pela app.
Deno.serve(withUsageRecording("analyze-meal", async (req) => {
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

    const body = await req.json();
    const rawNotes = typeof body.notes === "string" ? body.notes.slice(0, MAX_NOTES_LENGTH) : null;
    // A hora da refeição (meals.meal_time), gravada aqui para a análise já a
    // ver — até 2026-09-28 a app gravava-a num update à parte, DEPOIS desta
    // função responder, e a Carol nunca a lia. Só conta se vier no pedido: a
    // app antiga não a envia e continua a gravá-la ela (persistMealTime), e
    // numa edição a ausência do campo não apaga a hora que lá está.
    const hasMealTime = Object.prototype.hasOwnProperty.call(body, "meal_time");
    const mealTime = hasMealTime ? normalizeMealTime(body.meal_time) : null;
    const mealTimeField = hasMealTime ? { meal_time: mealTime } : {};

    // Bugs #48/#52 (fase A): o que ela já sabe deste atleta — a despensa e
    // como ele cozinha. Nunca rejeita (analyze-meal/pantry.ts).
    // O modo pantry_food não a usa (revisão pré-master).
    const pantryPromise = body.mode === "pantry_food" ? Promise.resolve(EMPTY_PANTRY) : fetchPantry(sb, userId);

    // ── Modo "pantry_food": confirmar um alimento para a despensa (fase C) ──
    // Não grava nada: devolve o que a Carol leu, e a app grava depois de o
    // atleta ver e ajustar (athlete_foods, RLS own rows).
    if (body.mode === "pantry_food") {
      const description = typeof body.description === "string" ? body.description.slice(0, 300) : null;
      const imgs: string[] = (Array.isArray(body.images) ? body.images : [])
        .filter((s: unknown) => typeof s === "string" && s.length > 0)
        .slice(0, 3);
      if (!imgs.length && !description?.trim()) {
        return jsonResponse({ error: "Descreve o alimento ou junta uma foto do rótulo." }, 400);
      }
      const mime = ["image/jpeg", "image/png", "image/webp"].includes(body.mime_type) ? body.mime_type : "image/jpeg";
      const parts: unknown[] = [{ text: buildPantryFoodPrompt(description, imgs.length > 0) }];
      for (const b64 of imgs) parts.push({ inline_data: { mime_type: mime, data: b64 } });
      try {
        const { food, usage } = await analyzePantryFood(parts, geminiKey, extractionDeadline);
        return jsonResponse({ food, usage });
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Não consegui ler este alimento." }, 502);
      }
    }

    // ── Modo "answer": o atleta responde às perguntas da Carol (fase B) ──
    // Uma resposta igual à que ela assumiu só confirma; uma diferente volta a
    // estimar o alimento a que se refere (com a resposta no nome) e refaz o
    // comentário. Todas somam às regras de como ele cozinha — à 2.ª igual,
    // ela deixa de perguntar (pantry.ts, learnRules).
    if (body.mode === "answer") {
      if (typeof body.meal_id !== "string" || !body.meal_id) {
        return jsonResponse({ error: "Falta a refeição." }, 400);
      }
      const { data: meal, error: mealErr } = await sb
        .from("meals")
        .select("*, meal_items(*)")
        .eq("id", body.meal_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (mealErr) return jsonResponse({ error: `Falha a procurar refeição: ${mealErr.message}` }, 500);
      if (!meal) return jsonResponse({ error: "Refeição não encontrada" }, 404);

      const questions: CarolQuestion[] = Array.isArray(meal.carol_questions) ? meal.carol_questions : [];
      const wanted = new Map<string, string>(
        (Array.isArray(body.answers) ? body.answers : [])
          // deno-lint-ignore no-explicit-any
          .map((a: any) => [String(a?.id ?? ""), String(a?.answer ?? "").trim().slice(0, 60)] as [string, string])
          .filter(([id, answer]: [string, string]) => id && answer),
      );
      const answered = questions.filter((q) => !q.answer && wanted.has(q.id)).map((q) => ({ ...q, answer: wanted.get(q.id)! }));
      if (!answered.length) return jsonResponse({ error: "Não há perguntas por responder nesta refeição." }, 400);

      // Os alimentos a estimar outra vez: só onde a resposta não é a assumida.
      // deno-lint-ignore no-explicit-any
      const mealItems: any[] = meal.meal_items || [];
      // deno-lint-ignore no-explicit-any
      const changes = new Map<string, { item: any; answers: string[]; facts: string[] }>();
      for (const q of answered) {
        if (foodKey(q.answer) === foodKey(q.assumed)) continue;
        const item = mealItems.find((it) => foodKey(it.name) === foodKey(q.item_name));
        if (!item) continue;
        const c = changes.get(item.id) ?? { item, answers: [], facts: [] };
        c.answers.push(q.answer);
        c.facts.push(`${q.topic}: ${q.answer}`);
        changes.set(item.id, c);
      }

      let usage: GeminiUsage = emptyUsage();
      if (changes.size) {
        const pantry = await pantryPromise;
        const list = [...changes.values()];
        const written = list.map((c) => ({
          name: `${c.item.name} (${c.answers.join(", ")})`.slice(0, 120),
          grams: Number(c.item.quantity_grams) || null,
        }));
        const answersNote = `Respostas do atleta: ${list.flatMap((c) => c.facts).join("; ")}.`;
        let est;
        try {
          est = await analyzeManualItems(
            written, [meal.notes, answersNote].filter(Boolean).join("\n"), geminiKey, extractionDeadline,
            knowledgeSection(pantry.foods, pantry.rules),
          );
        } catch (e) {
          return jsonResponse({ error: e instanceof Error ? e.message : "Falha na estimativa." }, 502);
        }
        usage = est.usage;
        for (let i = 0; i < list.length; i++) {
          const { error: upErr } = await sb.from("meal_items")
            .update(pickMealItem({ ...est.items[i], quantity_grams: list[i].item.quantity_grams }))
            .eq("id", list[i].item.id);
          if (upErr) return jsonResponse({ error: `Falha a gravar o alimento: ${upErr.message}` }, 500);
        }
      }

      const nowISO = new Date().toISOString();
      const byId = new Map(answered.map((q) => [q.id, q]));
      // Um alimento reestimado ganhou a resposta no nome: uma pergunta ainda
      // por responder sobre ele passa a apontar para o nome novo — senão,
      // respondida mais tarde, já não o encontrava (revisão pré-master).
      const renamed = new Map(
        [...changes.values()].map((c) => [foodKey(c.item.name), `${c.item.name} (${c.answers.join(", ")})`.slice(0, 120)]),
      );
      const updatedQuestions = questions.map((q) => {
        if (byId.has(q.id)) return { ...q, answer: byId.get(q.id)!.answer, answered_at: nowISO };
        const to = !q.answer ? renamed.get(foodKey(q.item_name)) : undefined;
        return to ? { ...q, item_name: to } : q;
      });
      const { error: qErr } = await sb.from("meals").update({ carol_questions: updatedQuestions }).eq("id", meal.id);
      if (qErr) return jsonResponse({ error: `Falha a gravar as respostas: ${qErr.message}` }, 500);

      const { data: freshItems } = await sb.from("meal_items").select("*").eq("meal_id", meal.id);
      const [coachUsage, learned] = await Promise.all([
        changes.size
          ? attachMealCoachNotes(sb, userId, meal, {
            date: meal.date, meal_type: meal.meal_type, meal_time: meal.meal_time ?? null, notes: meal.notes ?? null,
            totals: totalsFromItems(freshItems || []), items: freshItems || [],
          }, geminiKey, coachDeadline)
          : Promise.resolve(null),
        learnRules(sb, userId, answered.map((q) => ({ topic: q.topic, value: q.answer })), "resposta", nowISO),
      ]);
      const { data: freshMeal } = await sb.from("meals").select("*").eq("id", meal.id).maybeSingle();
      return jsonResponse({
        meal: { ...(freshMeal ?? { ...meal, carol_questions: updatedQuestions }), meal_items: freshItems || mealItems },
        learned,
        usage: addUsage(usage, coachUsage),
      });
    }

    // ── Modo manual: registo sem fotos, todos os alimentos duma vez ────
    // O cliente só acumula {name, grams} localmente ao "Adicionar alimento"
    // — nada é consultado ao Gemini nesse momento. Só ao premir "Analisar
    // Refeição" é que esta UMA ÚNICA chamada estima os valores nutricionais
    // de TODOS os alimentos de uma vez, grava a refeição já completa e gera
    // o comentário do Coach a partir dela (attachMealCoachNotes, partilhada
    // com o caminho de fotos).
    if (body.mode === "manual") {
      if (!MEAL_TYPES.includes(body.meal_type)) {
        return jsonResponse({ error: "Tipo de refeição inválido" }, 400);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")) {
        return jsonResponse({ error: "Data inválida (esperado YYYY-MM-DD)" }, 400);
      }
      // As gramas são opcionais — quando o utilizador não as indica, o
      // Gemini estima a porção típica a partir do nome do alimento e das
      // observações da refeição (ver buildManualItemsPrompt).
      const items = parseWrittenItems(body.items);
      if (items.length === 0) {
        return jsonResponse({ error: "Adiciona pelo menos um alimento." }, 400);
      }
      if (items.length > MAX_WRITTEN_ITEMS) {
        return jsonResponse({ error: `Máximo de ${MAX_WRITTEN_ITEMS} alimentos por refeição.` }, 400);
      }

      // Bugs #48/#52 (fase A): um alimento da despensa entra com os valores
      // dela — a Carol já o conhece; só os outros vão ao Gemini, com o que
      // ela sabe de como ele cozinha.
      // Registar sem o Gemini (2026-10-05): uma refeição só de alimentos da
      // despensa COMPLETOS (os sete micronutrientes dados), sem fotos e sem
      // perguntas da Carol em aberto sobre eles, calcula-se aqui — nenhuma
      // estimativa (splitKnownWritten). Um da despensa que ainda não chega
      // vai ao modelo, mas só se aproveita dele o que falta à despensa (os
      // micronutrientes por confirmar, que a seguir a preenchem — nextFoodRow)
      // e as perguntas em aberto; calorias e macros ficam os dela.
      // O comentário da Carol (attachMealCoachNotes) continua a ser pedido:
      // é a opinião dela sobre a refeição, não o cálculo.
      const pantry = await withWrittenFoods(sb, userId, await pantryPromise, items.map((i) => i.name));
      const { known, unknown } = splitKnownWritten(items, pantry.byKey, pantry.rules);
      let estimated: { items: unknown[]; usage: GeminiUsage; facts: CookingFact[]; questions: CarolQuestion[] };
      try {
        if (unknown.length) {
          const est = await analyzeManualItems(
            unknown.map((u) => u.item), rawNotes, geminiKey, extractionDeadline, knowledgeSection(pantry.foods, pantry.rules),
          );
          const byIndex = new Map(unknown.map((u, i) => [u.index, u.food ? withPantryValues(est.items[i], u.food, u.pending) : est.items[i]]));
          const all = items.map((_, i) => known.get(i) ?? byIndex.get(i));
          estimated = { items: all, usage: est.usage, facts: est.facts, questions: parseQuestions(est.questions, all, pantry.rules) };
        } else {
          estimated = { items: items.map((_, i) => known.get(i)), usage: emptyUsage(), facts: [], questions: [] };
        }
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha na estimativa." }, 502);
      }

      // ── Edição de uma refeição existente (meal_id presente) ──────────
      // Editar alimentos ou observações muda a análise, por isso passa pelo
      // mesmo caminho do registo: estima tudo de novo e regenera a nota do
      // Coach. As observações contam como dado analítico de propósito — o
      // Gemini usa-as para inferir porções e contexto ("hambúrguer" caseiro
      // e do McDonald's não dão os mesmos valores), ver buildManualItemsPrompt.
      // Distingue-se da reanálise (meal_id sem mode) por essa repescar as
      // fotos guardadas; aqui a fonte são os campos que o atleta editou.
      if (typeof body.meal_id === "string" && body.meal_id) {
        const mealId = body.meal_id;
        const { data: existingMeal, error: fetchError } = await sb
          .from("meals")
          .select("id")
          .eq("id", mealId)
          .eq("user_id", userId)
          .maybeSingle();
        if (fetchError) return jsonResponse({ error: `Falha a procurar refeição: ${fetchError.message}` }, 500);
        if (!existingMeal) return jsonResponse({ error: "Refeição não encontrada" }, 404);

        const { data: updatedMeal, error: updateError } = await sb
          .from("meals")
          // As perguntas de antes falavam da refeição de antes.
          .update({ date: body.date, meal_type: body.meal_type, notes: rawNotes, ...mealTimeField, carol_questions: estimated.questions.length ? estimated.questions : null })
          .eq("id", mealId)
          .select()
          .single();
        if (updateError) return jsonResponse({ error: `Falha a atualizar refeição: ${updateError.message}` }, 500);

        const { error: deleteError } = await sb.from("meal_items").delete().eq("meal_id", mealId);
        if (deleteError) return jsonResponse({ error: `Falha a limpar alimentos antigos: ${deleteError.message}` }, 500);

        const { data: savedItems, error: itemsError } = await sb
          .from("meal_items")
          // deno-lint-ignore no-explicit-any
          .insert((estimated.items as any[]).map((it) => ({ ...pickMealItem(it), meal_id: mealId, user_id: userId })))
          .select();
        if (itemsError) return jsonResponse({ error: `Falha a gravar alimentos: ${itemsError.message}` }, 500);

        // Soma o comentário da Carol ao usage da extração — senão esses tokens
        // nunca chegam ao app_logs (ver _shared/geminiUsage.ts).
        const coachUsage = await attachMealCoachNotes(sb, userId, updatedMeal, {
          date: body.date, meal_type: body.meal_type, meal_time: updatedMeal?.meal_time ?? null, notes: rawNotes,
          totals: totalsFromItems(savedItems || []), items: savedItems || [],
        }, geminiKey, coachDeadline);

        return jsonResponse({ meal: { ...updatedMeal, meal_items: savedItems }, usage: addUsage(estimated.usage, coachUsage) });
      }

      const { data: meal, error: mealError } = await sb
        .from("meals")
        .insert({
          user_id: userId, date: body.date, meal_type: body.meal_type, photo_paths: [], status: "ready", notes: rawNotes, ...mealTimeField,
          carol_questions: estimated.questions.length ? estimated.questions : null,
        })
        .select()
        .single();
      if (mealError) return jsonResponse({ error: `Falha a gravar refeição: ${mealError.message}` }, 500);

      const { data: savedItems, error: itemsError } = await sb
        .from("meal_items")
        // deno-lint-ignore no-explicit-any
        .insert((estimated.items as any[]).map((it) => ({ ...pickMealItem(it), meal_id: meal.id, user_id: userId })))
        .select();
      if (itemsError) {
        await sb.from("meals").delete().eq("id", meal.id);
        return jsonResponse({ error: `Falha a gravar alimentos: ${itemsError.message}` }, 500);
      }

      // Comentário da Carol somado ao usage (ver _shared/geminiUsage.ts).
      // A despensa aprende com a refeição nova (a edição de uma refeição não
      // volta a contar — duplicava as vezes).
      const [coachUsage] = await Promise.all([
        attachMealCoachNotes(sb, userId, meal, {
          date: body.date, meal_type: body.meal_type, meal_time: meal?.meal_time ?? null, notes: rawNotes,
          totals: totalsFromItems(savedItems || []), items: savedItems || [],
        }, geminiKey, coachDeadline),
        learnFromMeal(sb, userId, estimated.items as unknown[], estimated.facts),
      ]);

      return jsonResponse({ meal: { ...meal, meal_items: savedItems }, usage: addUsage(estimated.usage, coachUsage) });
    }

    // ── Modo reanálise: meal_id presente ──────────────────────────────
    if (typeof body.meal_id === "string" && body.meal_id) {
      const mealId = body.meal_id;
      const { data: existingMeal, error: fetchError } = await sb
        .from("meals")
        .select("id, photo_paths")
        .eq("id", mealId)
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) return jsonResponse({ error: `Falha a procurar refeição: ${fetchError.message}` }, 500);
      if (!existingMeal) return jsonResponse({ error: "Refeição não encontrada" }, 404);

      const photoPaths: string[] = existingMeal.photo_paths || [];
      if (photoPaths.length === 0) {
        return jsonResponse({ error: "Esta refeição não tem fotos guardadas para reanalisar" }, 400);
      }

      const images: string[] = [];
      for (const path of photoPaths) {
        const { data: fileBlob, error: downloadError } = await sb.storage.from("meal-photos").download(path);
        if (downloadError || !fileBlob) {
          return jsonResponse({ error: `Falha a obter foto guardada: ${downloadError?.message ?? "desconhecida"}` }, 500);
        }
        images.push(bytesToBase64(new Uint8Array(await fileBlob.arrayBuffer())));
      }

      let items: unknown[], usage: GeminiUsage;
      try {
        ({ items, usage } = await analyzeWithGemini(images, "image/jpeg", rawNotes, geminiKey, extractionDeadline));
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha na reanálise." }, 502);
      }

      const { error: deleteError } = await sb.from("meal_items").delete().eq("meal_id", mealId);
      if (deleteError) return jsonResponse({ error: `Falha a limpar itens antigos: ${deleteError.message}` }, 500);

      const { data: savedItems, error: itemsError } = await sb
        .from("meal_items")
        // deno-lint-ignore no-explicit-any
        .insert((items as any[]).map((it) => ({ ...pickMealItem(it), meal_id: mealId, user_id: userId })))
        .select();
      if (itemsError) return jsonResponse({ error: `Falha a gravar itens: ${itemsError.message}` }, 500);

      const { data: updatedMeal, error: updateError } = await sb
        .from("meals")
        .update({ notes: rawNotes })
        .eq("id", mealId)
        .select()
        .single();
      if (updateError) return jsonResponse({ error: `Falha a atualizar refeição: ${updateError.message}` }, 500);

      return jsonResponse({ meal: updatedMeal, items: savedItems, usage });
    }

    // ── Modo normal: nova refeição a partir de fotos ──────────────────
    const { mime_type, date, meal_type } = body;

    // Aceita `images` (array) ou `image_base64` (formato antigo, 1 foto)
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
      return jsonResponse({ error: `Máximo de ${MAX_PHOTOS} fotos por refeição` }, 400);
    }
    if (!MEAL_TYPES.includes(meal_type)) {
      return jsonResponse({ error: "Tipo de refeição inválido" }, 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) {
      return jsonResponse({ error: "Data inválida (esperado YYYY-MM-DD)" }, 400);
    }
    // Os alimentos escritos no mesmo ecrã das fotos (bug #47) — opcionais: a
    // app de antes do #47 não os manda, e sem eles a análise é a de sempre.
    const written = parseWrittenItems(body.items);
    if (written.length > MAX_WRITTEN_ITEMS) {
      return jsonResponse({ error: `Máximo de ${MAX_WRITTEN_ITEMS} alimentos por refeição.` }, 400);
    }
    const mime = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
        .includes(mime_type)
      ? mime_type
      : "image/jpeg";
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

    // 1. Upload de todas as fotos para o bucket privado, pasta do próprio utilizador
    const photoPaths: string[] = [];
    for (const b64 of images) {
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await sb.storage
        .from("meal-photos")
        .upload(path, base64ToBytes(b64), { contentType: mime });
      if (uploadError) {
        if (photoPaths.length) await sb.storage.from("meal-photos").remove(photoPaths);
        return jsonResponse({ error: `Falha no upload da foto: ${uploadError.message}` }, 500);
      }
      photoPaths.push(path);
    }

    // 2. Análise Gemini — todas as fotos numa só chamada (partes múltiplas),
    // com os alimentos escritos quando os há.
    // Bugs #48/#52 (fase A): ela recebe a despensa e como ele cozinha; um
    // alimento que reconhece da despensa fica com os valores dela, e um
    // rótulo lido nas fotos entra logo na despensa.
    const pantry = await withWrittenFoods(sb, userId, await pantryPromise, written.map((w) => w.name));
    const knowledge = knowledgeSection(pantry.foods, pantry.rules);
    // deno-lint-ignore no-explicit-any
    let items: any[], usage: GeminiUsage, facts: CookingFact[], rawQuestions: unknown;
    try {
      ({ items, usage, facts, questions: rawQuestions } = written.length
        ? await analyzePhotosWithItems(images, mime, written, rawNotes, geminiKey, extractionDeadline, knowledge)
        : await analyzeWithGemini(images, mime, rawNotes, geminiKey, extractionDeadline, knowledge));
      items = applyPantry(items, pantry.byKey, pantry.rules);
    } catch (e) {
      await sb.storage.from("meal-photos").remove(photoPaths);
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha na análise." }, 502);
    }

    // 3. Gravar refeição + itens
    const { data: meal, error: mealError } = await sb
      .from("meals")
      .insert({
        user_id: userId, date, meal_type, photo_paths: photoPaths, status: "ready", notes: rawNotes, ...mealTimeField,
        carol_questions: (() => { const q = parseQuestions(rawQuestions, items, pantry.rules); return q.length ? q : null; })(),
      })
      .select()
      .single();
    if (mealError) {
      await sb.storage.from("meal-photos").remove(photoPaths);
      return jsonResponse({ error: `Falha a gravar refeição: ${mealError.message}` }, 500);
    }

    const { data: savedItems, error: itemsError } = await sb
      .from("meal_items")
      // deno-lint-ignore no-explicit-any
      .insert((items as any[]).map((it) => ({ ...pickMealItem(it), meal_id: meal.id, user_id: userId })))
      .select();
    if (itemsError) {
      await sb.from("meals").delete().eq("id", meal.id);
      await sb.storage.from("meal-photos").remove(photoPaths);
      return jsonResponse({ error: `Falha a gravar itens: ${itemsError.message}` }, 500);
    }

    // 4. Comentário do Coach (best-effort — ver attachMealCoachNotes); os seus
    // tokens somam-se ao usage da extração (ver _shared/geminiUsage.ts).
    const [coachUsage, learned] = await Promise.all([
      attachMealCoachNotes(sb, userId, meal, {
        date, meal_type, meal_time: meal?.meal_time ?? null, notes: rawNotes, totals: totalsFromItems(savedItems || []),
        items: savedItems || [],
      }, geminiKey, coachDeadline),
      learnFromMeal(sb, userId, items, facts),
    ]);

    // pantry_added: o que entrou já na despensa por um rótulo (a app mostra-o
    // na fase C; a de hoje ignora o campo).
    return jsonResponse({
      meal, items: savedItems, usage: addUsage(usage, coachUsage),
      ...(learned.fromLabel.length ? { pantry_added: learned.fromLabel } : {}),
    });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
}));
