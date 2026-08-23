// IronHealth · analyze-meal Edge Function
// Modo normal: recebe 1+ fotos de uma refeição (base64) + data + tipo de
// refeição + observações opcionais, analisa tudo com Gemini e grava
// meals + meal_items na BD.
// Modo reanálise (meal_id presente): repesca as fotos já guardadas dessa
// refeição no Storage, volta a chamar o Gemini com as observações
// atualizadas, e substitui os meal_items existentes pelos novos.
// A chave Gemini vive apenas aqui (secret GEMINI_API_KEY), nunca no cliente.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_PHOTOS = 6;
const MAX_NOTES_LENGTH = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MEAL_TYPES = ["pequeno-almoco", "lanche-manha", "almoco", "lanche", "jantar", "ceia"];

// Alias que segue sempre o modelo flash estável mais recente — evita 404s
// quando a Google descontinua modelos para contas novas.
const GEMINI_MODEL = "gemini-flash-latest";
// Tempo máximo por chamada ao Gemini antes de desistir e tentar mais uma vez.
// A API do Gemini (sobretudo no tier gratuito) tem latência muito variável —
// isto evita que uma chamada presa arraste a função até ao limite rígido da
// plataforma (~150s), o que produz um erro genérico e ilegível no cliente.
const GEMINI_TIMEOUT_MS = 40000;
const GEMINI_RETRIES = 1; // repetições automáticas após timeout, antes de desistir de vez

const RESPONSE_SCHEMA = {
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
          fiber_per_100g: { type: "NUMBER" },
          sugar_per_100g: { type: "NUMBER" },
          sodium_per_100g: { type: "NUMBER" },
          iron_mg_per_100g: { type: "NUMBER" },
          calcium_mg_per_100g: { type: "NUMBER" },
          vitamin_c_mg_per_100g: { type: "NUMBER" },
          potassium_mg_per_100g: { type: "NUMBER" },
        },
        required: [
          "name",
          "estimated_quantity_grams",
          "calories_per_100g",
          "protein_per_100g",
          "carbs_per_100g",
          "fat_per_100g",
          "fiber_per_100g",
          "sugar_per_100g",
          "sodium_per_100g",
          "iron_mg_per_100g",
          "calcium_mg_per_100g",
          "vitamin_c_mg_per_100g",
          "potassium_mg_per_100g",
        ],
      },
    },
  },
  required: ["items"],
};

function buildPrompt(notes: string | null): string {
  let prompt =
    "As fotografias seguintes mostram todas a MESMA refeição (possivelmente de " +
    "ângulos diferentes ou vários pratos/componentes). Combina a informação de todas " +
    "as fotos e identifica cada alimento distinto no conjunto, sem contar o mesmo " +
    "alimento duas vezes por aparecer em várias fotos. " +
    "Para cada item, estima a porção total visível em gramas e o seu conteúdo nutricional " +
    "POR 100 GRAMAS (não por porção), usando valores de referência de bases de dados " +
    "nutricionais padrão. O sódio é em mg por 100g. Usa nomes em português de Portugal.";
  if (notes && notes.trim()) {
    prompt +=
      "\n\nO utilizador deixou esta observação sobre a refeição — usa-a para " +
      "identificar com precisão os alimentos e os seus valores nutricionais " +
      "(ex.: um hambúrguer de uma cadeia específica tem valores muito diferentes " +
      "de um feito em casa; cozinhar com manteiga em vez de azeite muda a " +
      "gordura; a marca/tipo de um produto embalado importa). " +
      `Observação do utilizador: "${notes.trim()}"`;
  }
  prompt += "\n\nResponde apenas com JSON estruturado conforme o schema.";
  return prompt;
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
function buildManualItemsPrompt(items: { name: string; grams: number | null }[], notes: string | null): string {
  const list = items
    .map((it, i) => `${i + 1}. "${it.name}"${it.grams != null ? ` — ${it.grams}g (valor exato dado pelo utilizador)` : " — sem gramas indicadas"}`)
    .join("\n");
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
    "valor mais plausível para uma porção normal do alimento descrito.\n";
  if (notes && notes.trim()) {
    prompt += `\nObservações gerais desta refeição, escritas pelo utilizador: "${notes.trim()}"\n`;
  }
  prompt +=
    '\nDevolve exatamente um item no array "items" para CADA alimento da lista, pela MESMA ' +
    "ORDEM em que aparecem acima. Responde apenas com JSON estruturado conforme o schema.";
  return prompt;
}

// Estados HTTP de sobrecarga momentânea do lado da Google (500/502/503/504) —
// vale a pena repetir estes, porque costumam resolver-se à segunda. O 429
// (limite de pedidos excedido) fica DE FORA de propósito: repetir logo a
// seguir só volta a bater no mesmo limite por minuto — e até o acelera — por
// isso passa já ao chamador com uma mensagem clara. Erros "permanentes"
// (400, 401, 403...) também passam sempre à primeira.
const GEMINI_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

// fetch com limite de tempo por tentativa + repetições automáticas quando a
// chamada fica presa (AbortError), falha ao nível da rede, ou o Gemini
// devolve um estado transitório (ver GEMINI_RETRYABLE_STATUSES) — por
// exemplo, confirmámos em produção uma resposta 503 (sobrecarga momentânea)
// que a app mostrava como erro imediato, mesmo sem qualquer problema de rede
// ou timeout envolvido. Ao fim das tentativas, devolve a resposta tal como
// veio (o chamador decide a mensagem) ou lança um erro claro se nem chegou
// a haver resposta.
async function fetchGeminiWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = GEMINI_TIMEOUT_MS,
  retries = GEMINI_RETRIES,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok && GEMINI_RETRYABLE_STATUSES.has(res.status) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      if (attempt < retries) continue;
      throw new Error(
        "O Gemini demorou demasiado tempo a responder (mesmo depois de tentar de novo). Tenta outra vez daqui a pouco.",
      );
    }
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
// com fotos grandes.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Contagem de tokens de uma chamada ao Gemini (usageMetadata da resposta),
// usada para estimar o custo real da API — ver admin_logs/painel de custos.
export // cached_tokens: tokens deste pedido servidos por caching implícito
// (automático, sem custo de armazenamento) — instrumentado para decidir
// se vale a pena passar a caching explícito. Ver painel Custos API/Admin.
type GeminiUsage = { input_tokens: number; output_tokens: number; cached_tokens: number };

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
  // deno-lint-ignore no-explicit-any
): Promise<{ items: any[]; usage: GeminiUsage }> {
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
    timeoutMs,
    retries,
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("Gemini error:", geminiRes.status, errText);
    if (geminiRes.status === 429) {
      throw new Error(
        "O Gemini atingiu o limite de pedidos gratuitos neste momento. Espera um pouco e tenta novamente.",
      );
    }
    throw new Error(`Análise falhou (Gemini ${geminiRes.status}). Tenta novamente.`);
  }

  const geminiJson = await geminiRes.json();
  const usage: GeminiUsage = {
    input_tokens: Number(geminiJson?.usageMetadata?.promptTokenCount) || 0,
    output_tokens: Number(geminiJson?.usageMetadata?.candidatesTokenCount) || 0,
    cached_tokens: Number(geminiJson?.usageMetadata?.cachedContentTokenCount) || 0,
  };
  const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed: { items?: unknown[] };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.error("Gemini devolveu JSON inválido:", rawText);
    throw new Error("A análise devolveu um formato inesperado. Tenta novamente.");
  }

  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : 0);
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    // deno-lint-ignore no-explicit-any
    .map((it: any) => ({
      name: String(it?.name ?? "").slice(0, 120) || "Alimento",
      quantity_grams: Math.max(1, num(it?.estimated_quantity_grams)),
      calories_per_100g: num(it?.calories_per_100g),
      protein_per_100g: num(it?.protein_per_100g),
      carbs_per_100g: num(it?.carbs_per_100g),
      fat_per_100g: num(it?.fat_per_100g),
      fiber_per_100g: num(it?.fiber_per_100g),
      sugar_per_100g: num(it?.sugar_per_100g),
      sodium_per_100g: num(it?.sodium_per_100g),
      iron_mg_per_100g: num(it?.iron_mg_per_100g),
      calcium_mg_per_100g: num(it?.calcium_mg_per_100g),
      vitamin_c_mg_per_100g: num(it?.vitamin_c_mg_per_100g),
      potassium_mg_per_100g: num(it?.potassium_mg_per_100g),
    }));

  if (items.length === 0) {
    throw new Error(emptyErrorMessage);
  }
  return { items, usage };
}

// Chama o Gemini com as imagens (base64) + observações, devolve os itens
// já normalizados + tokens consumidos (ou lança um erro com uma mensagem amigável).
async function analyzeWithGemini(
  images: string[],
  mime: string,
  notes: string | null,
  geminiKey: string,
  // deno-lint-ignore no-explicit-any
): Promise<{ items: any[]; usage: GeminiUsage }> {
  const parts: unknown[] = [{ text: buildPrompt(notes) }];
  for (const b64 of images) {
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }
  return runGeminiItemsRequest(
    parts,
    geminiKey,
    "Não foi possível identificar alimentos nas fotos. Tenta outro ângulo ou mais luz.",
  );
}

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
// vezes num burst de 503s da Google sem se aproximar do limite de ~150s da
// plataforma (pior caso: 4 tentativas de 30s + esperas ≈ 125s).
async function analyzeManualItems(
  items: { name: string; grams: number | null }[],
  notes: string | null,
  geminiKey: string,
  // deno-lint-ignore no-explicit-any
): Promise<{ items: any[]; usage: GeminiUsage }> {
  const parts: unknown[] = [{ text: buildManualItemsPrompt(items, notes) }];
  const { items: rawItems, usage } = await runGeminiItemsRequest(
    parts,
    geminiKey,
    "Não foi possível estimar valores nutricionais para estes alimentos. Tenta descrevê-los de outra forma.",
    3,
    30000,
  );
  if (rawItems.length !== items.length) {
    throw new Error("A estimativa não devolveu todos os alimentos pedidos. Tenta novamente.");
  }
  const merged = rawItems.map((it, i) => ({
    ...it,
    name: items[i].name.slice(0, 120),
    quantity_grams: items[i].grams != null ? items[i].grams : it.quantity_grams,
  }));
  return { items: merged, usage };
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
  `ovo 12,5 (≈6 g/ovo), skyr/iogurte grego 0% 10-12, tofu firme 12-15, lentilhas/grão 8-9.`;

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

// Gera o comentário do Coach sobre uma refeição: compara-a com uma fatia
// proporcional das metas diárias (não há forma leve de somar o dia todo
// aqui sem outra ronda de queries) e com as últimas refeições do mesmo tipo,
// para sinalizar inconsistência (ex.: almoço com muito mais gordura que o
// habitual). Curto de propósito — é um comentário por refeição, não uma
// análise do dia.
async function generateMealCoachNotes(
  meal: { date: string; meal_type: string; notes: string | null },
  totals: MealTotals,
  goals: { calorie_goal?: number | null; protein_goal?: number | null; carbs_goal?: number | null; fat_goal?: number | null },
  previousMeals: Array<{ date: string } & MealTotals>,
  // deno-lint-ignore no-explicit-any
  planItems: any[],
  recentCompletedWorkouts: { runs: any[]; gym: any[] } = { runs: [], gym: [] },
  geminiKey: string,
  diet: { dietary_restrictions?: string[] | null; dietary_notes?: string | null } = {},
): Promise<{ text: string | null; intervention_needed?: boolean; intervention_reason?: string | null }> {
  if (!geminiKey) return { text: null };
  if (totals.calories <= 0) return { text: null }; // sem itens, nada para comentar

  const typeLabel = MEAL_TYPE_LABELS[meal.meal_type] || meal.meal_type;

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
      planItems.map(i => `- ${i.planned_date}: ${i.kind === 'corrida' ? `Corrida ${i.training_type || ''} (${i.target_distance_km || '?'}km, ${i.target_duration_min || '?'}min)` : i.kind}`).join("\n") +
      `\n\nAVALIAÇÃO DO PLANO E NUTRIÇÃO: Avalia se os alimentos e macros desta refeição estão adequados para a recuperação dos treinos já feitos OU como preparação para os treinos previstos. Se o plano estiver gravemente comprometido e justificar que a Carol intervenha para propor um novo plano, marca intervention_needed=true e indica a reason.\n`
    : ``;

  const prompt =
    `És um nutricionista/treinador direto, a comentar uma refeição que um atleta amador acabou de registar. ` +
    `Escreve uma análise curta (2-4 frases), em português (PT), tom próximo mas técnico.\n\n` +
    `Refeição: ${typeLabel}, ${meal.date}\n` +
    `Calorias: ${totals.calories.toFixed(0)} kcal\n` +
    `Proteína: ${totals.protein.toFixed(1)}g · Hidratos: ${totals.carbs.toFixed(1)}g · Gordura: ${totals.fat.toFixed(1)}g\n` +
    (goalLine ? `${goalLine} (referência diária, esta é só uma refeição — não esperes que bata a meta toda).\n` : "") +
    `${avgLine}\n` +
    (meal.notes ? `Nota do utilizador: "${meal.notes}"\n` : "") +
    restricoes +
    workoutsText +
    planSection +
    `\nREGRAS CRÍTICAS:\n` +
    `- Não repitas todos os números, escolhe os 2-3 mais relevantes.\n` +
    `- DISTINÇÃO ENTRE TREINOS FEITOS vs. PREVISTOS: NUNCA digas 'após o teu treino de X' de um treino que apenas está no plano para hoje e que ainda NÃO consta na lista de treinos REALIZADOS! Se o treino de hoje ainda não foi feito, refere-te a ele como 'o teu próximo treino de X' ou 'o treino que terás mais tarde'.\n` +
    `- CEIA / REFEIÇÕES ANTES DE DORMIR: A Ceia é uma refeição noturna tomada antes de ir dormir (mesmo que registada na madrugada). Numa Ceia, o treino do próprio dia da data ainda está por realizar mais tarde quando o atleta acordar. A Ceia foca-se no aporte proteico de absorção lenta (caseína, skyr, iogurte grego, queijo fresco) para manter a síntese proteica e regeneração muscular durante o sono.\n` +
    `- Se a proteína desta refeição for baixa para o tipo de refeição, ou a gordura/hidratos muito acima do habitual, diz isso.\n` +
    `- Nunca tragas frases genéricas de louvor sem estarem ancoradas num número concreto.\n` +
    `- Termina com uma sugestão pequena e concreta (ex.: um alimento a acrescentar/reduzir na próxima refeição do mesmo tipo)` +
    (restricoes ? `, sempre dentro das restrições alimentares do atleta indicadas acima.\n` : `.\n`) +
    `\nDevolve a resposta obrigatoriamente no formato JSON com: "text" (análise), "intervention_needed" (boolean, true se justificar intervenção) e "intervention_reason" (string, justificação).\n` +
    `\n${MEAL_DOCTRINE}\n`;

  try {
    const res = await fetchGeminiWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            maxOutputTokens: 4096, 
            response_mime_type: "application/json",
            response_schema: {
              type: "OBJECT",
              properties: {
                text: { type: "STRING" },
                intervention_needed: { type: "BOOLEAN" },
                intervention_reason: { type: "STRING" }
              },
              required: ["text", "intervention_needed"]
            }
          },
        }),
      },
      45000,
      0,
    );
    if (!res.ok) {
      console.warn("Meal coach generation failed:", res.status, await res.text());
      return { text: null };
    }
    const json = await res.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return { text: null };

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawText.replace(/```json\n/g, '').replace(/```/g, ''));
    } catch (e) {
      console.error("Coach generation json parse error", e, rawText);
    }
    return { 
      text: parsed.text?.trim() || null, 
      intervention_needed: parsed.intervention_needed,
      intervention_reason: parsed.intervention_reason
    };
  } catch (e) {
    console.warn("Meal coach generation error:", e);
    return { text: null };
  }
}

// Busca metas + refeições recentes do mesmo tipo, gera o comentário e grava-o
// — best-effort, tal como em analyze-run: uma falha aqui nunca desfaz a
// refeição já gravada, só fica sem comentário.
async function attachMealCoachNotes(
  // deno-lint-ignore no-explicit-any
  sb: any,
  userId: string,
  meal: { id: string; coach_notes?: string | null },
  ctx: { date: string; meal_type: string; notes: string | null; totals: MealTotals },
  geminiKey: string,
): Promise<void> {
  try {
    const { data: profile } = await sb
      .from("profiles")
      .select("calorie_goal, protein_goal, carbs_goal, fat_goal, dietary_restrictions, dietary_notes")
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

    const yesterdayISO = new Date(new Date(ctx.date).getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const [{ data: actualRuns }, { data: actualGym }] = await Promise.all([
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
    ]);

    const result = await generateMealCoachNotes(
      { date: ctx.date, meal_type: ctx.meal_type, notes: ctx.notes },
      ctx.totals,
      profile || {},
      previousMeals,
      planItems,
      { runs: actualRuns || [], gym: actualGym || [] },
      geminiKey,
      {
        dietary_restrictions: (profile?.dietary_restrictions as string[] | null) ?? null,
        dietary_notes: (profile?.dietary_notes as string | null) ?? null,
      },
    );

    if (result.text) {
      await sb.from("meals").update({ coach_notes: result.text }).eq("id", meal.id);
      meal.coach_notes = result.text;
    }
    
    if (result.intervention_needed && result.intervention_reason) {
      await sb.from("profiles")
        .update({ 
          coach_intervention_status: "needed", 
          coach_intervention_reason: result.intervention_reason 
        })
        .eq("id", userId);
      (meal as any).coach_intervention_status = "needed";
      (meal as any).intervention_needed = true;
    }
  } catch (e) {
    console.warn("attachMealCoachNotes failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
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
      const rawItems = Array.isArray(body.items) ? body.items : [];
      // As gramas são opcionais — quando o utilizador não as indica, o
      // Gemini estima a porção típica a partir do nome do alimento e das
      // observações da refeição (ver buildManualItemsPrompt).
      // deno-lint-ignore no-explicit-any
      const items = rawItems
        .map((it: any) => {
          const g = Number(it?.grams);
          return {
            name: typeof it?.name === "string" ? it.name.trim().slice(0, 120) : "",
            grams: Number.isFinite(g) && g > 0 ? g : null,
          };
        })
        .filter((it: { name: string; grams: number | null }) => it.name);
      if (items.length === 0) {
        return jsonResponse({ error: "Adiciona pelo menos um alimento." }, 400);
      }
      if (items.length > 30) {
        return jsonResponse({ error: "Máximo de 30 alimentos por refeição." }, 400);
      }

      let estimated: { items: unknown[]; usage: GeminiUsage };
      try {
        estimated = await analyzeManualItems(items, rawNotes, geminiKey);
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
          .update({ date: body.date, meal_type: body.meal_type, notes: rawNotes })
          .eq("id", mealId)
          .select()
          .single();
        if (updateError) return jsonResponse({ error: `Falha a atualizar refeição: ${updateError.message}` }, 500);

        const { error: deleteError } = await sb.from("meal_items").delete().eq("meal_id", mealId);
        if (deleteError) return jsonResponse({ error: `Falha a limpar alimentos antigos: ${deleteError.message}` }, 500);

        const { data: savedItems, error: itemsError } = await sb
          .from("meal_items")
          // deno-lint-ignore no-explicit-any
          .insert((estimated.items as any[]).map((it) => ({ ...it, meal_id: mealId, user_id: userId })))
          .select();
        if (itemsError) return jsonResponse({ error: `Falha a gravar alimentos: ${itemsError.message}` }, 500);

        await attachMealCoachNotes(sb, userId, updatedMeal, {
          date: body.date, meal_type: body.meal_type, notes: rawNotes, totals: totalsFromItems(savedItems || []),
        }, geminiKey);

        return jsonResponse({ meal: { ...updatedMeal, meal_items: savedItems }, usage: estimated.usage });
      }

      const { data: meal, error: mealError } = await sb
        .from("meals")
        .insert({ user_id: userId, date: body.date, meal_type: body.meal_type, photo_paths: [], status: "ready", notes: rawNotes })
        .select()
        .single();
      if (mealError) return jsonResponse({ error: `Falha a gravar refeição: ${mealError.message}` }, 500);

      const { data: savedItems, error: itemsError } = await sb
        .from("meal_items")
        // deno-lint-ignore no-explicit-any
        .insert((estimated.items as any[]).map((it) => ({ ...it, meal_id: meal.id, user_id: userId })))
        .select();
      if (itemsError) {
        await sb.from("meals").delete().eq("id", meal.id);
        return jsonResponse({ error: `Falha a gravar alimentos: ${itemsError.message}` }, 500);
      }

      await attachMealCoachNotes(sb, userId, meal, {
        date: body.date, meal_type: body.meal_type, notes: rawNotes, totals: totalsFromItems(savedItems || []),
      }, geminiKey);

      return jsonResponse({ meal: { ...meal, meal_items: savedItems }, usage: estimated.usage });
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
        ({ items, usage } = await analyzeWithGemini(images, "image/jpeg", rawNotes, geminiKey));
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha na reanálise." }, 502);
      }

      const { error: deleteError } = await sb.from("meal_items").delete().eq("meal_id", mealId);
      if (deleteError) return jsonResponse({ error: `Falha a limpar itens antigos: ${deleteError.message}` }, 500);

      const { data: savedItems, error: itemsError } = await sb
        .from("meal_items")
        // deno-lint-ignore no-explicit-any
        .insert((items as any[]).map((it) => ({ ...it, meal_id: mealId, user_id: userId })))
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

    // 2. Análise Gemini — todas as fotos numa só chamada (partes múltiplas)
    let items: unknown[], usage: GeminiUsage;
    try {
      ({ items, usage } = await analyzeWithGemini(images, mime, rawNotes, geminiKey));
    } catch (e) {
      await sb.storage.from("meal-photos").remove(photoPaths);
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha na análise." }, 502);
    }

    // 3. Gravar refeição + itens
    const { data: meal, error: mealError } = await sb
      .from("meals")
      .insert({ user_id: userId, date, meal_type, photo_paths: photoPaths, status: "ready", notes: rawNotes })
      .select()
      .single();
    if (mealError) {
      await sb.storage.from("meal-photos").remove(photoPaths);
      return jsonResponse({ error: `Falha a gravar refeição: ${mealError.message}` }, 500);
    }

    const { data: savedItems, error: itemsError } = await sb
      .from("meal_items")
      // deno-lint-ignore no-explicit-any
      .insert((items as any[]).map((it) => ({ ...it, meal_id: meal.id, user_id: userId })))
      .select();
    if (itemsError) {
      await sb.from("meals").delete().eq("id", meal.id);
      await sb.storage.from("meal-photos").remove(photoPaths);
      return jsonResponse({ error: `Falha a gravar itens: ${itemsError.message}` }, 500);
    }

    // 4. Comentário do Coach (best-effort — ver attachMealCoachNotes)
    await attachMealCoachNotes(sb, userId, meal, {
      date, meal_type, notes: rawNotes, totals: totalsFromItems(savedItems || []),
    }, geminiKey);

    return jsonResponse({ meal, items: savedItems, usage });
  } catch (e) {
    console.error("Erro inesperado:", e);
    return jsonResponse({ error: "Erro inesperado no servidor" }, 500);
  }
});

