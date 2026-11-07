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
  GEMINI_BUSY_BACKOFF_MS,
  GEMINI_HEDGE_AFTER_MS,
  GEMINI_RETRYABLE_STATUSES,
  geminiBusyMessage,
  hasTimeFor,
  requestDeadlines,
} from "../_shared/geminiFetch.ts";
import { geminiHeaders, geminiUrl, geminiWithFallback, thinkingConfig } from "../_shared/geminiModel.ts";
import { addUsage, emptyUsage, type GeminiUsage, usageFromGemini } from "../_shared/geminiUsage.ts";
import { withUsageRecording } from "../_shared/usageRecorder.ts";
import { findByClientRequestId, insertOnce, parseClientRequestId, settleReplay, STILL_SAVING_MESSAGE } from "../_shared/idempotency.ts";
import {
  applyPantry, type CarolQuestion, type CookingFact, EMPTY_PANTRY, NUTRIENT_COLUMNS, type Pantry, fetchPantry, knowledgeSection, learnFromMeal, learnRules,
  isMicroColumn, microFromModel, optionGrams, parseCookingFacts, portionFacts, quantityAnswerGrams, parseQuestions, pickMealItem, remapQuestionItems, splitKnownWritten,
  withPantryValues, withWrittenFoods,
} from "./pantry.ts";
import {
  learnVariantFood, mergeVariantQuestions, normalizeVariantLabel, renameQuestionItems, resolveVariants, variantAnswer, variantName,
} from "./variants.ts";
import { foodKey } from "../_shared/formulas/foodKey.ts";
import { nextTimeAdditionsSection, withButterQuestions } from "./optionalAdditions.ts";
import { alignItems, alignPhotoAndWritten, mismatchMeta } from "./itemAlignment.ts";
import { NOTES_EMPTY_MESSAGE, NOTES_ITEMS_SCHEMA, notesAreAnalyzable, notesItemsPrompt, parseNotesItems } from "./notesItems.ts";
import { isWalk } from "../_shared/formulas/runKinds.ts";

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
          // Bug #87: o alimento genérico e a variante (VARIANT_RULE). null sem
          // uma qualificação que mude os valores; o servidor resolve o resto.
          generic_name: { type: "STRING", nullable: true },
          variant: { type: "STRING", nullable: true },
          variant_options: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
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
          kind: { type: "STRING", enum: ["preparacao", "quantidade"] },
          topic: { type: "STRING" },
          item_name: { type: "STRING" },
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          assumed: { type: "STRING" },
          impact_kcal: { type: "NUMBER" },
          impact_protein_g: { type: "NUMBER" },
        },
        required: ["kind", "topic", "item_name", "question", "options", "assumed", "impact_kcal"],
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

// Bug #87 (2026-10-25): «coxa de frango com pele» ficava na despensa e a
// coxa sem pele herdava os valores dela. O modelo separa o genérico da
// variante; a pergunta da variante faz-a o servidor (variants.ts).
export const VARIANT_RULE =
  "\n\nVARIANTES (generic_name, variant, variant_options): quando um alimento tem uma qualificação que muda os " +
  "valores por 100 g — com ou sem pele, a gordura da carne ou do leite (gordo, meio-gordo, magro), com ou sem " +
  "açúcar — devolve generic_name = o alimento sem a qualificação (\"Coxa de frango\"), variant = a qualificação " +
  "curta, em minúsculas (\"sem pele\"), e variant_options = 2 a 4 variantes habituais desse alimento, incluindo " +
  "a escolhida ([\"com pele\", \"sem pele\"]); name continua a ser o nome completo (\"Coxa de frango sem pele\"). " +
  "Quando não se vê nem foi escrito qual é, escolhe a mais provável. A forma de cozinhar (frito, grelhado) não é " +
  "variante. Sem qualificação destas, generic_name, variant e variant_options ficam null. Não faças pergunta " +
  "(questions) sobre a variante: essa faz-a o servidor.";

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
    "{topic: \"leite\", value: \"magro\"}. O tema diz SEMPRE a que prato ou alimento se aplica — \"tempero da salada\", " +
    "nunca só \"tempero\" (bug #74: uma colher de azeite num prato não vale para outro). Também as QUANTIDADES que a " +
    "observação diz explicitamente, com o tema \"<alimento> no <prato> · quantidade\": \"um fio de azeite na salada\" → " +
    "{topic: \"azeite na salada · quantidade\", value: \"um fio\"}; \"esparguete com uma colher de azeite\" → " +
    "{topic: \"azeite no esparguete · quantidade\", value: \"1 colher de sopa\"}; \"pouca manteiga no pão\" → " +
    "{topic: \"manteiga no pão · quantidade\", value: \"pouca\"}. " +
    "Nada que tenhas deduzido das fotos. Sem nada explícito, lista vazia.";
}

// Bug #52 (fase B): «em vez de a Carol estar a adivinhar determinadas
// situações, pode perguntar no momento». A refeição grava-se na mesma com o
// mais provável (assumed); a pergunta aparece no ecrã do resultado.
// Dois tipos desde 2026-10-17 (#58/#66): preparação e quantidade. Na de
// quantidade cada opção traz as gramas, para a resposta se aplicar sem voltar
// ao modelo (specs/carol-quantidades-habitos-refeicoes.md §4.1).
const QUESTIONS_RULE =
  "\n\nPERGUNTAS (questions): as que forem precisas, até 5 — mais vale perguntar do que assumir algo muito errado —, " +
  "só quando isso muda a energia em 40 kcal ou mais OU a proteína em 4 g ou mais.\n" +
  // Bug #86: perguntava «que % de gordura tem a carne?», que ninguém sabe.
  "Só perguntas que quem comeu SABE responder sem pesar nem consultar nada: o que se vê, como cozinhou, quanto pôs, " +
  "que tipo ou que peça era. NUNCA percentagens, teores, calorias, gramas de gordura ou de proteína nem valores " +
  "nutricionais — isso estimas tu e dizes em assumed. Pergunta e opções em linguagem do dia a dia.\n" +
  "De dois tipos (kind):\n" +
  "- \"preparacao\": não se vê nem se sabe como um alimento desta refeição foi preparado ou temperado — a gordura " +
  "usada para fritar ou saltear, o tempero da salada, o molho, se o frango levava pele, que peça de carne era " +
  "(peito ou coxa, lombo ou entremeada), o leite gordo ou magro, açúcar no café. Ex.: question \"Os ovos foram " +
  "estrelados em quê?\", options [\"Azeite\", \"Manteiga\", \"Óleo\", \"Sem gordura\"]; carne picada → question " +
  "\"A carne picada era de quê?\", options [\"Vaca\", \"Porco e vaca\", \"Peru ou frango\"] — nunca \"Que % de " +
  "gordura tinha?\".\n" +
  "- \"quantidade\": a quantidade de um alimento não se vê bem nem foi escrita — a espessura das fatias, a camada de " +
  "manteiga ou de doce, quanto molho ou azeite, o tamanho da porção. Cada opção descreve a quantidade E diz as " +
  "gramas, SEMPRE no formato \"(~N g)\". Ex.: manteiga → question \"Quanta manteiga levou o pão?\", options " +
  "[\"Camada fina, um lado (~5 g)\", \"Camada fina, dos dois lados (~10 g)\", \"Camada grossa (~15 g)\"]; fiambre → " +
  "[\"3 fatias finíssimas (~25 g)\", \"3 fatias finas (~35 g)\", \"3 fatias médias (~50 g)\"]. A assumed é a opção " +
  "que usaste em estimated_quantity_grams. Nunca sobre um alimento com gramas indicadas pelo utilizador.\n" +
  "Nunca sobre o que as observações já dizem, sobre um tema de \"Como cozinha, tempera e quanto costuma pôr\", nem sobre um alimento da " +
  "lista que ele tem guardada. EXCEÇÃO — os ingredientes de confeção opcionais (manteiga, margarina, azeite, óleo, " +
  "molhos, maionese): se um alimento desta refeição os pode levar e as observações não dizem, pergunta SEMPRE, " +
  "mesmo num alimento guardado e mesmo que ele já tenha respondido noutra refeição — nunca os assumas do que foi " +
  "antes — sempre como pergunta, NUNCA como um item à parte em items. Uma só pergunta por ingrediente e alimento " +
  "(nunca \"levou manteiga?\" e \"quanta manteiga?\" na mesma refeição). Na estimativa, usa o mais provável e diz qual foi em assumed. Cada pergunta: kind, " +
  "topic (o tema, curto e SEMPRE com o prato ou alimento a que se aplica: \"tempero da salada\", \"ovos fritos\" — nunca só " +
  "\"tempero\" ou \"azeite\"; numa de quantidade, o alimento e o prato: \"azeite na salada\", \"manteiga no pão\"), " +
  "item_name (o nome EXATO do item " +
  "em items), question (curta, na 2.ª pessoa), options (2 a 4 respostas curtas), assumed (uma das options), " +
  "impact_kcal (quanto a resposta pode mudar a energia, em kcal), impact_protein_g (quanto pode mudar a proteína, " +
  "em g; 0 se não muda). Na dúvida, não perguntes: lista vazia.";

function buildPrompt(notes: string | null, knowledge = ""): string {
  return PHOTOS_INTRO +
    "Para cada item, estima a porção total visível em gramas e o seu conteúdo nutricional " +
    "POR 100 GRAMAS (não por porção), usando valores de referência de bases de dados " +
    "nutricionais padrão. O sódio é em mg por 100g. Usa nomes em português de Portugal." +
    LABEL_RULE +
    MICROS_RULE +
    VARIANT_RULE +
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
    "- Devolve UM item para CADA alimento escrito, com source_index igual ao número dele na lista acima — nunca " +
    "partas um alimento escrito em vários itens (\"pão com manteiga\" é um item só) nem acrescentes como item um " +
    "ingrediente que não está na lista (a manteiga, o azeite, o molho vão para as perguntas). " +
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
    VARIANT_RULE +
    notesSection(notes) +
    knowledge +
    cookingFactsRule(notes) +
    QUESTIONS_RULE +
    "\n\nResponde apenas com JSON estruturado conforme o schema.";
}

// Repõe os alimentos escritos pelo source_index: o nome é o que o atleta
// escreveu e as gramas, quando as deu, também (o Gemini só dá os valores).
// Os das fotos vêm primeiro, como na foto; os escritos a seguir. Um índice
// repetido é o mesmo alimento escrito duas vezes — fica o primeiro; as partes
// de um composto juntam-se, e um escrito sem índice fica com o item das fotos
// do mesmo nome (alignPhotoAndWritten, 2026-11-04). null se ainda faltar
// algum dos escritos (quem chama refá-los — analyzePhotosWithItems).
export function mergePhotoAndWrittenItems<T extends { name: string; quantity_grams: number; source_index?: number }>(
  raw: T[],
  written: { name: string; grams: number | null }[],
): Omit<T, "source_index">[] | null {
  const a = alignPhotoAndWritten(raw, written);
  if (a.items.some((x) => !x)) return null;
  return [...a.fromPhotos, ...withWrittenNames(a.items as Omit<T, "source_index">[], written)];
}

/** Os itens dos alimentos escritos com o nome e as gramas do atleta. */
function withWrittenNames<T extends { quantity_grams: number }>(items: T[], written: { name: string; grams: number | null }[]) {
  return written.map((w, i) => ({
    ...items[i], name: w.name.slice(0, 120), quantity_grams: w.grams != null ? w.grams : items[i].quantity_grams,
    // grams_explicit: o atleta deu as gramas — não se lhe pergunta a quantidade
    // (parseQuestions). Não é coluna: pickMealItem deixa-o de fora.
    ...(w.grams != null ? { grams_explicit: true } : {}),
  }));
}

/** Quando os itens não batem certo com o que se pediu: para o próximo
 *  diagnóstico, só contagens e nomes de alimentos (mismatchMeta). Nunca
 *  rejeita — um log que falha não pode partir a gravação. */
// deno-lint-ignore no-explicit-any
export function logItemsMismatch(sb: any, userId: string, meta: Record<string, unknown>): void {
  try {
    sb.from("app_logs").insert({
      user_id: userId,
      level: meta.outcome === "falhou" ? "error" : "info",
      event: "analyze-meal",
      message: "Itens da estimativa não batem certo com os pedidos",
      meta,
    }).then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn("app_logs (analyze-meal) não gravado:", error.message);
    }, () => {});
  } catch (_) { /* nunca rejeita */ }
}

/** Quem quer saber de um desencontro (o handler passa logItemsMismatch). */
type ReportMismatch = ((meta: Record<string, unknown>) => void) | undefined;

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
    MICROS_RULE + VARIANT_RULE + "\n";
  if (notes && notes.trim()) {
    prompt += `\nObservações gerais desta refeição, escritas pelo utilizador: "${notes.trim()}"\n`;
  }
  prompt += knowledge + cookingFactsRule(notes) + QUESTIONS_RULE + "\nSem fotos: from_label=false em todos os itens.\n";
  prompt +=
    '\nDevolve exatamente um item no array "items" para CADA alimento da lista, pela MESMA ' +
    "ORDEM em que aparecem acima — nem mais nem menos. Nunca partas um alimento da lista em vários itens " +
    '("pão com manteiga", "tosta mista" ou "arroz de pato" são UM item cada) e nunca acrescentes como item ' +
    "um ingrediente que não está na lista: a manteiga, o azeite ou o molho que um alimento pode levar vão para " +
    "as perguntas (questions), não para items. Responde apenas com JSON estruturado conforme o schema.";
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
  // Sem resposta em GEMINI_HEDGE_AFTER_MS, pede outra vez em paralelo
  // (_shared/geminiFetch.ts, incidente 2026-10-12).
  return fetchGemini(url, options, timeoutMs, retries, deadline, GEMINI_BUSY_BACKOFF_MS, GEMINI_HEDGE_AFTER_MS);
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
  const geminiRes = await geminiWithFallback((geminiModel, withThinking, attemptDeadline) =>
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
      attemptDeadline,
    )
  , deadline);

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
      // Bug #87 (variants.ts, resolveVariants). Também não são colunas.
      generic_name: typeof it?.generic_name === "string" && it.generic_name.trim() ? it.generic_name.trim().slice(0, 120) : null,
      variant: normalizeVariantLabel(it?.variant) || null,
      variant_options: Array.isArray(it?.variant_options) ? it.variant_options.map(normalizeVariantLabel).filter(Boolean).slice(0, 4) : null,
    }));

  if (items.length === 0) {
    throw new Error(emptyErrorMessage);
  }
  return { items, usage, facts: parseCookingFacts(parsed.cooking_facts), questions: parsed.questions };
}

// Uma refeição só com observações (decisão 15 do registo unificado): a Carol
// tira do texto os alimentos e as quantidades ditas — sem estimar nutrientes,
// isso faz o resto do registo manual, que segue igual. Pedido curto, só texto.
async function extractItemsFromNotes(
  notes: string,
  pantryNames: string[],
  geminiKey: string,
  deadline = Number.POSITIVE_INFINITY,
): Promise<{ items: { name: string; grams: number | null }[]; usage: GeminiUsage }> {
  const geminiRes = await geminiWithFallback((geminiModel, withThinking, attemptDeadline) =>
    fetchGeminiWithTimeout(
      geminiUrl(geminiModel),
      {
        method: "POST",
        headers: geminiHeaders(geminiKey),
        body: JSON.stringify({
          contents: [{ parts: [{ text: notesItemsPrompt(notes, pantryNames) }] }],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: NOTES_ITEMS_SCHEMA,
            ...thinkingConfig("low", withThinking),
          },
        }),
      },
      20000,
      2,
      attemptDeadline,
    )
  , deadline);
  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("Gemini error (observações):", geminiRes.status, errText);
    if (GEMINI_RETRYABLE_STATUSES.has(geminiRes.status)) throw new Error(geminiBusyMessage("ler a refeição que descreveste"));
    throw new Error(upstreamErrorText(geminiRes.status));
  }
  const geminiJson = await geminiRes.json();
  let parsed: unknown;
  try {
    parsed = JSON.parse(geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch {
    throw new Error("A leitura das observações devolveu um formato inesperado. Tenta novamente.");
  }
  return { items: parseNotesItems(parsed), usage: usageFromGemini(geminiJson) };
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
export async function analyzePhotosWithItems(
  images: string[],
  mime: string,
  written: { name: string; grams: number | null }[],
  notes: string | null,
  geminiKey: string,
  deadline = Number.POSITIVE_INFINITY,
  knowledge = "",
  report: ReportMismatch = undefined,
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
  // Os escritos emparelhados (alignPhotoAndWritten, 2026-11-04): as partes de
  // um composto juntas, um repetido uma vez, um sem índice pelo nome.
  const a = alignPhotoAndWritten(raw, written);
  const missing = a.items.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  const meta = (outcome: "emparelhado" | "refeitos" | "falhou") =>
    mismatchMeta("fotos", written.length, raw, { items: a.items, extras: [], combined: a.combined, moved: a.moved }, outcome);
  if (!missing.length && (a.combined || a.moved)) report?.(meta("emparelhado"));
  let allUsage = usage;
  // deno-lint-ignore no-explicit-any
  let extraQuestions: any[] = [];
  if (missing.length) {
    // Os que faltam, numa chamada curta só de texto (sem refazer as fotos).
    // Sem tempo para ela, ou se também falhar, falha como antes.
    if (!hasTimeFor(deadline)) {
      report?.(meta("falhou"));
      throw new Error("A análise não devolveu todos os alimentos que escreveste. Tenta novamente.");
    }
    try {
      const redo = await analyzeManualItems(missing.map((i) => written[i]), notes, geminiKey, deadline, knowledge, undefined, false);
      missing.forEach((i, j) => (a.items[i] = redo.items[j]));
      allUsage = addUsage(allUsage, redo.usage);
      if (Array.isArray(redo.questions)) extraQuestions = redo.questions;
    } catch (e) {
      report?.(meta("falhou"));
      throw e;
    }
    report?.(meta("refeitos"));
  }
  // deno-lint-ignore no-explicit-any
  const items = [...a.fromPhotos, ...withWrittenNames(a.items as any[], written)];
  // Os escritos ficam com o nome do atleta — as perguntas seguem-no.
  const finalNames = items.map((it) => String((it as { name?: unknown }).name ?? ""));
  const allQuestions = [...(Array.isArray(questions) ? remapQuestionItems(questions, a.pairs, finalNames) as unknown[] : []), ...extraQuestions];
  return { items, usage: allUsage, facts, questions: allQuestions };
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
  const geminiRes = await geminiWithFallback((geminiModel, withThinking, attemptDeadline) =>
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
      attemptDeadline,
    )
  , deadline);
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
export async function analyzeManualItems(
  items: { name: string; grams: number | null }[],
  notes: string | null,
  geminiKey: string,
  deadline = Number.POSITIVE_INFINITY,
  knowledge = "",
  report: ReportMismatch = undefined,
  // Refazer, numa chamada curta, os alimentos que faltarem (uma vez só).
  redoMissing = true,
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
  // Um item a mais ou a menos já não impede a gravação (2026-11-04,
  // itemAlignment.ts): pelo nome, as partes de um composto juntas, os
  // ingredientes acrescentados fora; os que faltam, refeitos à parte.
  const a = alignItems(rawItems, items);
  const missing = a.items.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  const meta = (outcome: "emparelhado" | "refeitos" | "falhou") => mismatchMeta("manual", items.length, rawItems, a, outcome);
  if (!missing.length && rawItems.length !== items.length) report?.(meta("emparelhado"));
  let allUsage = usage;
  // deno-lint-ignore no-explicit-any
  let extraQuestions: any[] = [];
  if (missing.length) {
    // Sem a chamada curta (já é ela, ou não há tempo), falha como antes.
    if (!redoMissing || !hasTimeFor(deadline)) {
      report?.(meta("falhou"));
      throw new Error("A estimativa não devolveu todos os alimentos pedidos. Tenta novamente.");
    }
    try {
      const redo = await analyzeManualItems(missing.map((i) => items[i]), notes, geminiKey, deadline, knowledge, undefined, false);
      missing.forEach((i, j) => (a.items[i] = redo.items[j]));
      allUsage = addUsage(allUsage, redo.usage);
      if (Array.isArray(redo.questions)) extraQuestions = redo.questions;
    } catch (e) {
      report?.(meta("falhou"));
      throw e;
    }
    report?.(meta("refeitos"));
  }
  // deno-lint-ignore no-explicit-any
  const merged = (a.items as any[]).map((it, i) => ({
    ...it,
    name: items[i].name.slice(0, 120),
    quantity_grams: items[i].grams != null ? items[i].grams : it.quantity_grams,
  }));
  // O nome passa a ser o escrito — as perguntas seguem-no.
  const mainQuestions = Array.isArray(questions) ? remapQuestionItems(questions, a.pairs, merged.map((m) => m.name)) as unknown[] : [];
  return { items: merged, usage: allUsage, facts, questions: [...mainQuestions, ...extraQuestions] };
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

/* 2026-10-23 (conversa da Patty com a Carol): a 48 h de uma prova de 10 km, a
   análise do almoço apontou "faltaram legumes… junta bróculos". A prova de
   referência (fetchFrameRace) é a próxima PRINCIPAL — a dela era a meia de
   novembro, não os 10 km de domingo (prioridade b) — e com plano nem essa
   entrava no prompt. Esta secção olha para QUALQUER prova agendada nos 2 dias
   seguintes à refeição, seja qual for a prioridade: a regra das 48 h vale
   para todas. */
export const RACE_PROXIMITY_DAYS = 2;
export type NearRace = { name: string | null; date: string; distance_km: number | string | null };
export function raceProximitySection(race: NearRace | null | undefined, mealDate: string): string {
  if (!race?.date || !mealDate) return "";
  const days = Math.round((Date.parse(race.date) - Date.parse(mealDate)) / 86400000);
  if (!Number.isFinite(days) || days < 0 || days > RACE_PROXIMITY_DAYS) return "";
  const when = days === 0 ? "hoje" : days === 1 ? "amanhã" : `daqui a ${days} dias`;
  const km = Number(String(race.distance_km ?? "").replace(",", "."));
  const dist = Number.isFinite(km) && km > 0 ? `, ${String(Number(km.toFixed(2))).replace(".", ",")} km` : "";
  // O nome vem do atleta: sem aspas nem quebras de linha, para não fingir instruções.
  const name = (race.name || "").replace(/[\r\n"«»`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "uma prova";
  return `\nPROVA MUITO PRÓXIMA: "${name}" (${race.date}${dist}) é ${when}. Nas 48 horas antes de uma prova a ` +
    `prioridade da alimentação é a digestão leve: hidratos simples e de fácil digestão, pouca fibra e pouca ` +
    `gordura. NUNCA apontes como falha a ausência de legumes, salada, fruta com casca ou cereais integrais, e ` +
    `NUNCA sugiras legumes volumosos, crucíferas (bróculos, couve, couve-flor), leguminosas ou fibra extra — ` +
    `se a refeição os tiver em quantidade, é isso que deves sinalizar. A recuperação dos treinos feitos fica em ` +
    `segundo plano face à prova.` +
    (days === 0 ? ` Se esta refeição for DEPOIS da prova (vê os treinos realizados de hoje), já é recuperação e ` +
      `volta o critério normal.` : "") +
    `\n`;
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
/* A referência "do costume" para este TIPO de refeição (lanche, jantar…).
   Bug relatado em 2026-10-06: com 3 lanches anteriores (16,5 g, 1,3 g e
   5,3 g de proteína) a Carol escreveu "a média habitual de 8 g de proteína
   para esta refeição" — a conta estava certa, mas 3 lanches tão diferentes
   não são um hábito, e "esta refeição" fazia crer que era a mesma refeição.
   Agora:
   - só há "costume" com MEAL_BASELINE_MIN refeições do tipo nos últimos
     MEAL_BASELINE_DAYS dias; abaixo disso diz-se ao modelo que não há
     padrão e proíbe-se falar em média/habitual;
   - usa-se a MEDIANA (um lanche de 1 g não puxa tudo para baixo);
   - o texto diz que é a referência do tipo, nunca desta refeição. */
export const MEAL_BASELINE_MIN = 4;
export const MEAL_BASELINE_DAYS = 28;

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function mealTypeBaselineLine(
  previousMeals: Array<{ date: string } & MealTotals>,
  typeLabel: string,
  mealDate: string,
): string {
  const type = typeLabel.toLowerCase();
  const cutoff = new Date(new Date(`${mealDate}T00:00:00Z`).getTime() - MEAL_BASELINE_DAYS * 86400000)
    .toISOString().slice(0, 10);
  const recent = previousMeals.filter((m) => m.date >= cutoff && m.calories > 0);
  if (recent.length < MEAL_BASELINE_MIN) {
    return `Refeições do tipo "${type}" nos últimos ${MEAL_BASELINE_DAYS} dias: ${recent.length} — poucas para haver um padrão. ` +
      `NÃO fales em média, "habitual", "costume" nem compares com refeições anteriores: comenta só o que estes números por si só revelam.`;
  }
  const med = (k: keyof MealTotals) => median(recent.map((m) => m[k])).toFixed(0);
  return `Referência do tipo "${type}" (mediana das últimas ${recent.length} refeições deste TIPO em ${MEAL_BASELINE_DAYS} dias — ` +
    `não é esta refeição nem a mesma comida): ${med("calories")} kcal, P ${med("protein")}g, H ${med("carbs")}g, G ${med("fat")}g. ` +
    `Se comparares, diz "ao ${type} costumas ter…" (o teu ${type} típico), nunca "a média desta refeição".`;
}

/** O que ela assumiu e ainda vai perguntar (perguntas em aberto), para o
 *  comentário não criticar uma suposição dela — no bug #58 escreveu "corta os
 *  10 g de manteiga" sobre uma manteiga cuja quantidade estava a perguntar.
 *  "" sem perguntas em aberto (specs/carol-quantidades-habitos-refeicoes.md §4.5). */
export function assumedValuesSection(questions: CarolQuestion[] | null | undefined): string {
  const open = (questions || []).filter((q) => q && !q.answer && q.item_name && q.assumed);
  if (!open.length) return "";
  return `POR CONFIRMAR — assumiste isto e ainda lhe vais perguntar: ` +
    open.map((q) => `${q.item_name}: ${q.assumed}`).join("; ") + ".\n" +
    `São suposições tuas, não dele: NÃO critiques nem mandes cortar, reduzir ou trocar uma quantidade ou preparação por ` +
    `confirmar, e não a ponhas em "O que corrigir". Podes dizer o que assumiste ("assumi ~10 g de manteiga"). ` +
    `O comentário definitivo vem depois de ele responder.\n`;
}

/** O que ele já respondeu às perguntas dela (bug #102, almoço de 30-10:
 *  respondeu «Vaca» e o comentário dizia «Assumi que os hambúrgueres são de
 *  vaca»). É dele, não uma suposição. "" sem respostas. */
export function answeredValuesSection(questions: CarolQuestion[] | null | undefined): string {
  const answered = (questions || []).filter((q) => q && q.answer && q.item_name);
  if (!answered.length) return "";
  return `CONFIRMADO POR ELE — respondeu às tuas perguntas: ` +
    answered.map((q) => `${q.item_name}: ${q.answer}`).join("; ") + ".\n" +
    `Isto é o que ele disse, não uma suposição tua: usa-o como facto e nunca escrevas que assumiste, supuseste ou ` +
    `estimaste estes pontos.\n`;
}

/** Depois das respostas, o comentário refaz-se se algum alimento mudou — ou se
 *  o comentário de antes falava de uma suposição que ele entretanto confirmou
 *  (bug #102: uma resposta igual à assumida não refazia nada, e o «assumi»
 *  ficava). */
export function shouldRefreshMealComment(changes: number, coachNotes: string | null | undefined): boolean {
  return changes > 0 || /\bassum\w*/i.test(coachNotes ?? "");
}

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
  // As perguntas: o que assumiu e está em aberto não se critica
  // (assumedValuesSection); o que ele já respondeu é facto (answeredValuesSection).
  openQuestions: CarolQuestion[] = [],
  // A prova agendada mais próxima nos RACE_PROXIMITY_DAYS seguintes (raceProximitySection).
  nearRace: NearRace | null = null,
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

  const avgLine = mealTypeBaselineLine(previousMeals, typeLabel, meal.date);

  const restricoes = dietaryRestrictionsPromptBlock(diet.dietary_restrictions, diet.dietary_notes);

  const yesterdayISO = new Date(new Date(meal.date).getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const todayRuns = (recentCompletedWorkouts.runs || []).filter(r => r.date === meal.date);
  const yesterdayRuns = (recentCompletedWorkouts.runs || []).filter(r => r.date === yesterdayISO);
  const todayGym = (recentCompletedWorkouts.gym || []).filter(g => g.date === meal.date);
  const yesterdayGym = (recentCompletedWorkouts.gym || []).filter(g => g.date === yesterdayISO);

  let workoutsText = `\nHistórico de Treinos REALIZADOS (efetivamente concluídos e registados):\n`;
  if (yesterdayRuns.length || yesterdayGym.length) {
    workoutsText += `- Ontem (${yesterdayISO}): ` + [
      ...yesterdayRuns.map(r => `${isWalk(r) ? 'Caminhada' : 'Corrida'} (${r.distance_km}km, ${Math.round((r.duration_seconds || 0)/60)}m, RPE ${r.effort_rpe || '?'}/10)`),
      ...yesterdayGym.map(g => `Ginásio ${g.name || ''} (${Math.round((g.duration_seconds || 0)/60)}m, RPE ${g.exertion || '?'}/10)`),
    ].join(", ") + "\n";
  }
  if (todayRuns.length || todayGym.length) {
    workoutsText += `- Hoje (${meal.date}): ` + [
      ...todayRuns.map(r => `${isWalk(r) ? 'Caminhada' : 'Corrida'} (${r.distance_km}km, ${Math.round((r.duration_seconds || 0)/60)}m, RPE ${r.effort_rpe || '?'}/10)`),
      ...todayGym.map(g => `Ginásio ${g.name || ''} (${Math.round((g.duration_seconds || 0)/60)}m, RPE ${g.exertion || '?'}/10)`),
    ].join(", ") + "\n";
  } else {
    workoutsText += `- Hoje (${meal.date}): ainda NENHUM treino foi realizado até ao momento.\n`;
  }

  const raceNear = raceProximitySection(nearRace, meal.date);

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
    assumedValuesSection(openQuestions) +
    answeredValuesSection(openQuestions) +
    nextTimeAdditionsSection(openQuestions) +
    (meal.notes ? `Nota do utilizador: "${meal.notes}"\n` : "") +
    restricoes +
    workoutsText +
    planSection +
    raceNear +
    `\nREGRAS CRÍTICAS:\n` +
    (raceNear
      ? `- A "PROVA MUITO PRÓXIMA" acima manda sobre tudo o resto nesta análise, incluindo a doutrina abaixo: não sugiras as fontes ricas em fibra que ela lista (ex.: lentilhas, grão).\n`
      : "") +
    `- Usa os números que provam o que dizes — não despejes a ficha toda.\n` +
    `- DISTINÇÃO ENTRE TREINOS FEITOS vs. PREVISTOS: NUNCA digas 'após o teu treino de X' de um treino que apenas está no plano para hoje e que ainda NÃO consta na lista de treinos REALIZADOS! Se o treino de hoje ainda não foi feito, refere-te a ele como 'o teu próximo treino de X' ou 'o treino que terás mais tarde'.\n` +
    `- CEIA / REFEIÇÕES ANTES DE DORMIR: A Ceia é uma refeição noturna tomada antes de ir dormir (mesmo que registada na madrugada). Numa Ceia, o treino do próprio dia da data ainda está por realizar mais tarde quando o atleta acordar. A Ceia foca-se no aporte proteico de absorção lenta (caseína, skyr, iogurte grego, queijo fresco) para manter a síntese proteica e regeneração muscular durante o sono.\n` +
    `- Se a proteína desta refeição for baixa para o tipo de refeição, ou a gordura/hidratos muito acima da referência do tipo (só se ela existir acima), diz isso — ` +
    `exceto a proteína quando "O DIA ATÉ AGORA" disser que o dia já chega ao alvo: aí o dia manda e não é ponto a corrigir.\n` +
    `- "O que corrigir" nunca contradiz "O que esteve bem": o mesmo número não pode ser elogio num bloco e falha no outro.\n` +
    `- Nunca tragas frases genéricas de louvor sem estarem ancoradas num alimento ou num número concreto.\n` +
    `- O bloco "Para a próxima" é uma sugestão pequena e concreta (ex.: um alimento a acrescentar/reduzir na próxima refeição do mesmo tipo; ou, se "O DIA ATÉ AGORA" disser que a ceia é a única hipótese que resta hoje, o que pôr nessa ceia)` +
    (restricoes ? `, sempre dentro das restrições alimentares do atleta indicadas acima.\n` : `.\n`) +
    `\n${MEAL_ANALYSIS_RULES}\n` +
    `\nDevolve a resposta obrigatoriamente no formato JSON com: "text" (análise), "intervention_needed" (boolean, true se justificar intervenção) e "intervention_reason" (string, justificação).\n` +
    `\n${MEAL_DOCTRINE}\n`;

  try {
    const res = await geminiWithFallback((geminiModel, withThinking, attemptDeadline) =>
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
        attemptDeadline,
      )
    , deadline);
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
    // As perguntas da Carol em aberto sobre esta refeição: o comentário não
    // critica o que ela assumiu e ainda vai perguntar (assumedValuesSection).
    questions?: CarolQuestion[];
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
      // Até 8: a referência do tipo só existe com MEAL_BASELINE_MIN (4)
      // nos últimos 28 dias — ver mealTypeBaselineLine.
      .limit(8);

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
    // Qualquer prova agendada nos próximos 2 dias (raceProximitySection). Best-effort.
    const nearLimit = new Date(new Date(ctx.date).getTime() + RACE_PROXIMITY_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: nearRows } = await sb
      .from("race_events")
      .select("name, date, distance_km")
      .eq("user_id", userId)
      .eq("status", "agendada")
      .gte("date", ctx.date)
      .lte("date", nearLimit)
      .order("date", { ascending: true })
      .limit(1);
    const nearRace: NearRace | null = nearRows?.[0] ?? null;

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
      ctx.questions ?? [],
      nearRace,
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
/** A resposta de uma tentativa repetida: a mesma forma das duas respostas
 *  de registo — `meal.meal_items` (manual) e `items` (fotos). */
// deno-lint-ignore no-explicit-any
/** O que o tratamento das respostas e o registo revisto pedem ao Gemini —
 *  injetado, para os testes correrem sem a rede. */
export type MealDeps = {
  analyzePhotos: (images: string[], mime: string, written: { name: string; grams: number | null }[], notes: string | null, knowledge: string) =>
    // deno-lint-ignore no-explicit-any
    Promise<{ items: any[]; usage: GeminiUsage; facts: CookingFact[]; questions: unknown }>;
  estimateManual: (written: { name: string; grams: number | null }[], notes: string | null, knowledge: string) =>
    // deno-lint-ignore no-explicit-any
    Promise<{ items: any[]; usage: GeminiUsage }>;
  // deno-lint-ignore no-explicit-any
  attachComment: (meal: any, ctx: Parameters<typeof attachMealCoachNotes>[3]) => Promise<GeminiUsage | null>;
};

// deno-lint-ignore no-explicit-any
export type MealAnswersResult =
  // deno-lint-ignore no-explicit-any
  | { ok: true; meal: any; items: any[]; learned: unknown; usage: GeminiUsage; unapplied: string[] }
  | { ok: false; status: number; error: string };

/**
 * As respostas do atleta às perguntas da Carol numa refeição gravada (o modo
 * "answer", e o registo revisto — #106 nas refeições, 2026-11-07). Uma
 * resposta igual à que ela assumiu só confirma; uma diferente volta a estimar
 * o alimento a que se refere (com a resposta no nome) e refaz o comentário.
 * `meal` traz meal_items. `forceComment`: o comentário faz-se sempre (o
 * registo revisto ainda não tem nenhum). `factOnly`: perguntas que ficam
 * respondidas sem mexer no alimento (o atleta já editou as gramas no registo
 * revisto — a edição dele manda). `keepOnEstimateFailure`: se a reestimativa
 * falhar, o resto aplica-se na mesma e as perguntas dela ficam por responder
 * (`unapplied`), para o modo answer as aplicar depois.
 */
export async function applyMealAnswers(
  // deno-lint-ignore no-explicit-any
  sb: any, userId: string, meal: any, rawAnswers: unknown, pantry: Pantry, deps: Pick<MealDeps, "estimateManual" | "attachComment">,
  opts: { forceComment?: boolean; factOnly?: Set<string>; keepOnEstimateFailure?: boolean } = {},
): Promise<MealAnswersResult> {
  const questions: CarolQuestion[] = Array.isArray(meal.carol_questions) ? meal.carol_questions : [];
  const wanted = new Map<string, string>(
    (Array.isArray(rawAnswers) ? rawAnswers : [])
      // deno-lint-ignore no-explicit-any
      .map((a: any) => [String(a?.id ?? ""), String(a?.answer ?? "").trim().slice(0, 60)] as [string, string])
      .filter(([id, answer]: [string, string]) => id && answer),
  );
  const answered = questions.filter((q) => !q.answer && wanted.has(q.id)).map((q) => ({ ...q, answer: wanted.get(q.id)! }));
  if (!answered.length) return { ok: false, status: 400, error: "Não há perguntas por responder nesta refeição." };

  // Os alimentos a mexer: só onde a resposta não é a assumida. Uma
  // resposta de quantidade com gramas (fase B dos #58/#66, 2026-10-17)
  // troca só as gramas do alimento — os valores por 100 g ficam, sem
  // chamada ao modelo. Uma de preparação, ou uma quantidade escrita à mão
  // sem gramas ("Outro…"), volta a estimar o alimento no modelo.
  // deno-lint-ignore no-explicit-any
  const mealItems: any[] = meal.meal_items || [];
  // deno-lint-ignore no-explicit-any
  type Change = {
    item: any; answers: string[]; facts: string[]; grams: number | null; reestimate: boolean; estimateGrams: boolean; qids: string[];
    // Bug #87: a variante escolhida (com a linha dela, se já tem valores) e o nome novo do alimento.
    // deno-lint-ignore no-explicit-any
    variant?: { generic: string; label: string; stored: any | null }; rename?: string;
  };
  const changes = new Map<string, Change>();
  for (const q of answered) {
    if (opts.factOnly?.has(q.id)) continue;
    if (foodKey(q.answer) === foodKey(q.assumed)) continue;
    const item = mealItems.find((it) => foodKey(it.name) === foodKey(q.item_name));
    if (!item) continue;
    const c = changes.get(item.id) ?? { item, answers: [], facts: [], grams: null, reestimate: false, estimateGrams: false, qids: [] };
    c.qids.push(q.id);
    const answerGrams = q.kind === "quantidade" ? optionGrams(q.answer) : null;
    if (q.kind === "variante") {
      // Bug #87: os valores da variante escolhida vêm da base de dados, sem o
      // modelo. Só uma variante sem valores guardados («Outro…») vai ao modelo.
      const { generic, label, stored, rename } = variantAnswer(q.topic, q.answer, pantry.variants);
      c.variant = { generic, label, stored };
      c.rename = rename;
      if (!stored) {
        c.reestimate = true;
        c.facts.push(`${q.topic}: ${q.answer}`);
      }
    } else if (answerGrams != null) {
      // Aplica-se a DIFERENÇA entre a resposta e o que ela assumiu, não as
      // gramas da resposta: num prato que veio num só item ("Tosta mista",
      // 120 g) a pergunta "quanto fiambre?" mexe só na parte do fiambre —
      // trocar pelas gramas da opção (35 g) punha a tosta toda a 35 g
      // (revisão pré-master de 2026-10-17). Sem gramas na assumida, troca.
      c.grams = quantityAnswerGrams(c.grams ?? (Number(item.quantity_grams) || 0), q.answer, q.assumed);
    } else {
      c.answers.push(q.answer);
      c.facts.push(`${q.topic}: ${q.answer}`);
      c.reestimate = true;
      if (q.kind === "quantidade") c.estimateGrams = true;
    }
    changes.set(item.id, c);
  }

  // O nome com que o alimento fica: o da variante, e as respostas de preparação entre parênteses.
  const newName = (c: Change) => {
    const base = c.rename ?? c.item.name;
    return (c.answers.length ? `${base} (${c.answers.join(", ")})` : base).slice(0, 120);
  };
  // deno-lint-ignore no-explicit-any
  const variantLearn: any[] = [];
  for (const c of changes.values()) {
    if (c.reestimate || (c.grams == null && !c.variant?.stored)) continue;
    // Uma variante guardada: os valores dela, sem o modelo (e as gramas, se também mudaram).
    const next = c.variant?.stored
      ? withPantryValues({ ...c.item, quantity_grams: c.grams ?? c.item.quantity_grams }, c.variant.stored)
      : null;
    const patch = next ? pickMealItem({ ...next, name: newName(c) }) : { quantity_grams: c.grams };
    const { error: upErr } = await sb.from("meal_items").update(patch).eq("id", c.item.id);
    if (upErr) return { ok: false, status: 500, error: `Falha a gravar o alimento: ${upErr.message}` };
    if (next && c.variant) variantLearn.push({ ...next, name: c.variant.stored.name, variant_of: c.variant.generic, variant_label: c.variant.label });
  }

  let usage: GeminiUsage = emptyUsage();
  let list = [...changes.values()].filter((c) => c.reestimate);
  // As perguntas cuja reestimativa falhou (keepOnEstimateFailure): ficam por responder.
  const failed = new Set<string>();
  if (list.length) {
    const written = list.map((c) => ({
      name: c.variant ? variantName(c.variant.generic, c.variant.label) : `${c.item.name} (${c.answers.join(", ")})`.slice(0, 120),
      // Sem gramas na resposta ("Outro…" numa quantidade), o modelo estima a porção.
      grams: c.estimateGrams ? null : (c.grams ?? (Number(c.item.quantity_grams) || null)),
    }));
    const answersNote = `Respostas do atleta: ${list.flatMap((c) => c.facts).join("; ")}.`;
    let est;
    try {
      est = await deps.estimateManual(
        written, [meal.notes, answersNote].filter(Boolean).join("\n"), knowledgeSection(pantry.foods, pantry.rules, pantry.variants),
      );
    } catch (e) {
      if (!opts.keepOnEstimateFailure) return { ok: false, status: 502, error: e instanceof Error ? e.message : "Falha na estimativa." };
      console.warn("analyze-meal: a reestimativa das respostas falhou — ficam por responder:", e instanceof Error ? e.message : e);
      for (const c of list) {
        for (const id of c.qids) failed.add(id);
        changes.delete(c.item.id);
      }
      list = [];
      est = { items: [], usage: emptyUsage() };
    }
    usage = est.usage;
    for (let i = 0; i < list.length; i++) {
      const grams = list[i].estimateGrams ? est.items[i].quantity_grams : (list[i].grams ?? list[i].item.quantity_grams);
      const c = list[i];
      const { error: upErr } = await sb.from("meal_items")
        .update(pickMealItem({ ...est.items[i], quantity_grams: grams, ...(c.variant ? { name: newName(c) } : {}) }))
        .eq("id", c.item.id);
      if (upErr) return { ok: false, status: 500, error: `Falha a gravar o alimento: ${upErr.message}` };
      // Uma variante nova: os valores estimados agora ficam guardados nela.
      if (c.variant) {
        variantLearn.push({
          ...est.items[i], quantity_grams: grams, name: variantName(c.variant.generic, c.variant.label),
          variant_of: c.variant.generic, variant_label: c.variant.label,
        });
      }
    }
  }

  const nowISO = new Date().toISOString();
  const applied = answered.filter((q) => !failed.has(q.id));
  const byId = new Map(applied.map((q) => [q.id, q]));
  // Um alimento reestimado ganhou a resposta no nome: uma pergunta ainda
  // por responder sobre ele passa a apontar para o nome novo — senão,
  // respondida mais tarde, já não o encontrava (revisão pré-master).
  const renamed = new Map(
    [...changes.values()].filter((c) => c.reestimate || c.variant?.stored).map((c) => [foodKey(c.item.name), newName(c)]),
  );
  const updatedQuestions = questions.map((q) => {
    if (byId.has(q.id)) return { ...q, answer: byId.get(q.id)!.answer, answered_at: nowISO };
    const to = !q.answer ? renamed.get(foodKey(q.item_name)) : undefined;
    return to ? { ...q, item_name: to } : q;
  });
  const { error: qErr } = await sb.from("meals").update({ carol_questions: updatedQuestions }).eq("id", meal.id);
  if (qErr) return { ok: false, status: 500, error: `Falha a gravar as respostas: ${qErr.message}` };

  const { data: freshItems } = await sb.from("meal_items").select("*").eq("meal_id", meal.id);
  const [coachUsage, learned] = await Promise.all([
    // Também quando a resposta só confirma mas o comentário falava de uma
    // suposição (bug #102). As perguntas vão todas: as respondidas são factos.
    opts.forceComment || shouldRefreshMealComment(changes.size, meal.coach_notes)
      ? deps.attachComment(meal, {
        date: meal.date, meal_type: meal.meal_type, meal_time: meal.meal_time ?? null, notes: meal.notes ?? null,
        totals: totalsFromItems(freshItems || []), items: freshItems || [],
        questions: updatedQuestions,
      })
      : Promise.resolve(null),
    // A variante pergunta-se sempre: a resposta não vira regra (uma regra por
    // confirmar sobre o genérico mandava-o ao modelo em todos os registos).
    learnRules(sb, userId, applied.filter((q) => q.kind !== "variante").map((q) => ({ topic: q.topic, value: q.answer })), "resposta", nowISO),
    // Bug #87: a variante escolhida fica na despensa, ligada ao genérico.
    Promise.all(variantLearn.map((it) => learnVariantFood(sb, userId, it, nowISO, { countSeen: false }))),
  ]);
  const { data: freshMeal } = await sb.from("meals").select("*").eq("id", meal.id).maybeSingle();
  return {
    ok: true,
    meal: { ...(freshMeal ?? { ...meal, carol_questions: updatedQuestions }), meal_items: freshItems || mealItems },
    items: freshItems || mealItems,
    learned,
    usage: addUsage(usage, coachUsage),
    unapplied: [...failed],
  };
}

// ─── O registo revisto das fotos (#106 nas refeições, 2026-11-07) ──────────
// Como no ginásio, na corrida e na avaliação: «Ler e preencher» (mode
// "preview") lê as fotos e devolve os alimentos e as perguntas, sem gravar;
// o atleta revê, responde, e «Gravar e analisar» (reviewed: true) grava os
// alimentos revistos sem voltar a ler as fotos, com as respostas como factos.
// O caminho de antes (fotos → grava logo) fica para as apps antigas.

/** A leitura das fotos (com os alimentos escritos, se os há), tal como o
 *  registo direto a faz: as variantes, a despensa, as perguntas. */
export async function readMealPhotos(
  args: { images: string[]; mime: string; written: { name: string; grams: number | null }[]; notes: string | null; pantry: Pantry },
  deps: Pick<MealDeps, "analyzePhotos">,
  // deno-lint-ignore no-explicit-any
): Promise<{ items: any[]; questions: CarolQuestion[]; facts: CookingFact[]; usage: GeminiUsage }> {
  const { pantry, notes } = args;
  const knowledge = knowledgeSection(pantry.foods, pantry.rules, pantry.variants);
  const read = await deps.analyzePhotos(args.images, args.mime, args.written, notes, knowledge);
  // Bug #87: as variantes primeiro — uma variante nova fica com os valores
  // que o modelo estimou para ela, não com os do genérico da despensa.
  const variantsOut = resolveVariants(read.items, pantry.variants);
  const items = applyPantry(variantsOut.items, pantry.byKey, pantry.rules);
  // A pergunta da variante faz-se sempre e não conta para as 5 do modelo.
  // Bug #109: e a manteiga no pão, se o modelo não perguntou.
  const questions = withButterQuestions(
    mergeVariantQuestions(
      parseQuestions(renameQuestionItems(read.questions, variantsOut.renames), items, pantry.rules),
      variantsOut.questions,
      variantsOut.renames,
    ),
    items, notes,
  );
  return { items, questions, facts: read.facts || [], usage: read.usage };
}

/** Um alimento do preview, para o cliente: o que se grava, mais o from_label
 *  e preview_grams — as gramas que a leitura deu, que o cliente devolve tal e
 *  qual no gravar (revisão do lote 8aaa3eb9): é por elas que se sabe se ele
 *  editou as gramas, e aí a resposta de quantidade não se soma outra vez. */
// deno-lint-ignore no-explicit-any
export function previewMealItem(it: any): Record<string, unknown> {
  const row = pickMealItem(it);
  return { ...row, from_label: it?.from_label === true, preview_grams: row.quantity_grams };
}

/** O impacto de uma pergunta vem do cliente: limitado. */
const MAX_IMPACT_KCAL = 2000;
const MAX_IMPACT_PROTEIN_G = 200;
const clampAbs = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-max, Math.min(max, n)) : 0;
};
/** Proteína + hidratos + gordura por 100 g: mais do que isto é impossível (com folga de arredondamento). */
const MAX_MACROS_PER_100G = 100.5;

const REVIEWED_MAX_GRAMS = 5000;
/** Por 100 g: macros e fibra/açúcar em g (≤ 100), energia em kcal (≤ 950). */
const REVIEWED_PER100_MAX: Record<string, number> = {
  calories_per_100g: 950, protein_per_100g: 100, carbs_per_100g: 100, fat_per_100g: 100, fiber_per_100g: 100, sugar_per_100g: 100,
};

/** Os alimentos revistos que voltam do cliente: o que vem de lá não se confia.
 *  Nome e gramas obrigatórios; valores por 100 g não negativos (os micros em
 *  falta ficam null, como no resto). Fora dos limites → null (a lista toda é
 *  recusada: um valor impossível é um erro do cliente, não do atleta). */
// deno-lint-ignore no-explicit-any
export function parseReviewedMealItems(raw: unknown): any[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_WRITTEN_ITEMS) return null;
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  // deno-lint-ignore no-explicit-any
  for (const it of raw as any[]) {
    const name = typeof it?.name === "string" ? it.name.trim().slice(0, 120) : "";
    const grams = Number(it?.quantity_grams);
    if (!name || !Number.isFinite(grams) || grams <= 0 || grams > REVIEWED_MAX_GRAMS) return null;
    const previewGrams = Number(it?.preview_grams);
    const row: Record<string, unknown> = {
      name, quantity_grams: Math.round(grams * 10) / 10, from_label: it?.from_label === true,
      // As gramas da leitura (preview_grams): null num cliente que não as manda.
      preview_grams: Number.isFinite(previewGrams) && previewGrams > 0 ? previewGrams : null,
    };
    for (const k of NUTRIENT_COLUMNS) {
      const v = it?.[k];
      if (v == null || v === "") {
        if (!isMicroColumn(k)) return null;
        row[k] = null;
        continue;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > (REVIEWED_PER100_MAX[k] ?? 100000)) return null;
      row[k] = n;
    }
    // Coerência: os macros não passam de 100 g por 100 g.
    if (Number(row.protein_per_100g) + Number(row.carbs_per_100g) + Number(row.fat_per_100g) > MAX_MACROS_PER_100G) return null;
    out.push(row);
  }
  return out;
}

const QUESTION_KINDS = new Set(["preparacao", "quantidade", "variante"]);
const qText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** As perguntas do preview que voltam com as respostas (`carol_questions`):
 *  limpas, e separadas em perguntas (sem resposta — é como se gravam antes de
 *  as aplicar) e respostas {id, answer}. */
export function parseReviewedMealQuestions(raw: unknown): { questions: CarolQuestion[]; answers: { id: string; answer: string }[] } {
  const questions: CarolQuestion[] = [];
  const answers: { id: string; answer: string }[] = [];
  // deno-lint-ignore no-explicit-any
  for (const q of (Array.isArray(raw) ? raw.slice(0, 12) : []) as any[]) {
    const id = qText(q?.id, 64);
    const topic = qText(q?.topic, 60);
    const question = qText(q?.question, 200);
    const options = (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => qText(o, 60)).filter(Boolean).slice(0, 8);
    if (!id || !topic || !question || options.length < 2 || questions.some((x) => x.id === id)) continue;
    questions.push({
      id, kind: QUESTION_KINDS.has(q?.kind) ? q.kind : "preparacao", topic, item_name: qText(q?.item_name, 120) || topic,
      question, options, assumed: qText(q?.assumed, 60),
      impact_kcal: clampAbs(q?.impact_kcal, MAX_IMPACT_KCAL),
      impact_protein_g: clampAbs(q?.impact_protein_g, MAX_IMPACT_PROTEIN_G),
      answer: null, answered_at: null,
    });
    const answer = qText(q?.answer, 60);
    if (answer) answers.push({ id, answer });
  }
  return { questions, answers };
}

/** Os factos de como ele cozinha que o preview leu (voltam para a despensa aprender). */
export function parseReviewedFacts(raw: unknown): CookingFact[] {
  // deno-lint-ignore no-explicit-any
  return (Array.isArray(raw) ? raw.slice(0, 10) : []).map((f: any) => ({ topic: qText(f?.topic, 60), value: qText(f?.value, 80) }))
    .filter((f: CookingFact) => f.topic && f.value);
}

export type ReviewedMealInput = {
  date: unknown; meal_type: unknown; notes: string | null; mealTimeField: Record<string, unknown>;
  images: string[]; mime: string; items: unknown; carol_questions: unknown; facts: unknown;
  written: { name: string; grams: number | null }[]; clientRequestId: string | null;
};

// deno-lint-ignore no-explicit-any
export type ReviewedMealResult =
  // deno-lint-ignore no-explicit-any
  | { ok: true; meal: any; items: any[]; usage: GeminiUsage; pantry_added: string[]; unapplied_question_ids: string[] }
  | { ok: false; status: number; error: string }
  // deno-lint-ignore no-explicit-any
  | { existing: any };

/**
 * Grava o registo revisto: as fotos sobem para o storage como no registo
 * direto, os alimentos são os que o atleta reviu (não se voltam a ler as
 * fotos) e as respostas aplicam-se como no modo "answer" — uma resposta
 * diferente da assumida acerta o alimento — com o comentário feito com elas
 * como factos. Uma resposta que não se aplicou (a reestimativa falhou, ou a
 * gravação falhou a meio) fica por responder e vem em
 * `unapplied_question_ids`, para o cliente a voltar a pedir pelo modo
 * "answer". `{ existing }` quando outra tentativa com o mesmo
 * client_request_id já a gravou (as fotos desta saem).
 */
export async function saveReviewedMeal(
  // deno-lint-ignore no-explicit-any
  sb: any, userId: string, input: ReviewedMealInput, pantry: Pantry, deps: Pick<MealDeps, "estimateManual" | "attachComment">,
): Promise<ReviewedMealResult> {
  const { date, meal_type, notes } = input;
  if (!MEAL_TYPES.includes(meal_type as string)) return { ok: false, status: 400, error: "Tipo de refeição inválido" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(typeof date === "string" ? date : "")) return { ok: false, status: 400, error: "Data inválida (esperado YYYY-MM-DD)" };
  if (input.images.length === 0) return { ok: false, status: 400, error: "Nenhuma imagem recebida" };
  if (input.images.length > MAX_PHOTOS) return { ok: false, status: 400, error: `Máximo de ${MAX_PHOTOS} fotos por refeição` };
  const items = parseReviewedMealItems(input.items);
  if (!items) return { ok: false, status: 400, error: "Os alimentos revistos não são válidos — volta a ler as fotos." };
  const { questions, answers } = parseReviewedMealQuestions(input.carol_questions);

  // As fotos sobem como no registo direto.
  const ext = input.mime === "image/png" ? "png" : input.mime === "image/webp" ? "webp" : "jpg";
  const photoPaths: string[] = [];
  for (const b64 of input.images) {
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await sb.storage.from("meal-photos").upload(path, base64ToBytes(b64), { contentType: input.mime });
    if (uploadError) {
      if (photoPaths.length) await sb.storage.from("meal-photos").remove(photoPaths);
      return { ok: false, status: 500, error: `Falha no upload da foto: ${uploadError.message}` };
    }
    photoPaths.push(path);
  }

  const { data: meal, existing, error: mealError } = await insertOnce(sb, "meals", userId, {
    user_id: userId, date, meal_type, photo_paths: photoPaths, status: "ready", notes, ...input.mealTimeField,
    carol_questions: questions.length ? questions : null,
  }, input.clientRequestId);
  if (existing) {
    await sb.storage.from("meal-photos").remove(photoPaths);
    return { existing };
  }
  if (mealError) {
    await sb.storage.from("meal-photos").remove(photoPaths);
    return { ok: false, status: 500, error: `Falha a gravar refeição: ${mealError.message}` };
  }
  const { data: savedItems, error: itemsError } = await sb.from("meal_items")
    .insert(items.map((it) => ({ ...pickMealItem(it), meal_id: meal.id, user_id: userId })))
    .select();
  if (itemsError) {
    await sb.from("meals").delete().eq("id", meal.id);
    await sb.storage.from("meal-photos").remove(photoPaths);
    return { ok: false, status: 500, error: `Falha a gravar itens: ${itemsError.message}` };
  }

  // As respostas: como no modo "answer", com o comentário sempre (ainda não há).
  // Sem respostas, ou se aplicá-las falhar a meio, o comentário faz-se com as
  // perguntas por responder (unapplied_question_ids).
  // Uma resposta de quantidade a um alimento cujas gramas ele editou fica
  // como facto: a edição dele manda, e somar a diferença da resposta por cima
  // contava-a duas vezes (revisão do lote 8aaa3eb9: 150 assumidos, 200
  // respondidos e 200 escritos davam 250).
  const factOnly = new Set<string>();
  for (const q of questions) {
    if (q.kind !== "quantidade") continue;
    const it = items.find((x) => foodKey(x.name) === foodKey(q.item_name));
    if (it && it.preview_grams != null && Math.abs(Number(it.quantity_grams) - Number(it.preview_grams)) > 0.5) factOnly.add(q.id);
  }
  let finalMeal = { ...meal, meal_items: savedItems || [] };
  let finalItems = savedItems || [];
  let usage: GeminiUsage = emptyUsage();
  let applied = false;
  let unapplied: string[] = [];
  if (answers.length) {
    const r = await applyMealAnswers(sb, userId, finalMeal, answers, pantry, deps, { forceComment: true, factOnly, keepOnEstimateFailure: true });
    if (r.ok) {
      finalMeal = r.meal;
      finalItems = r.items;
      usage = r.usage;
      unapplied = r.unapplied;
      applied = true;
    } else {
      console.warn("analyze-meal: as respostas do registo revisto não se aplicaram — ficam por responder:", r.error);
    }
  }
  if (!applied) {
    // Sem respostas, ou a aplicá-las falhou a meio: os alimentos relidos da BD
    // (parte pode já ter mudado) e as perguntas por responder — o modo answer
    // aplica-as depois (revisão do lote 8aaa3eb9).
    const { data: freshItems } = await sb.from("meal_items").select("*").eq("meal_id", meal.id);
    if (freshItems) finalItems = freshItems;
    unapplied = answers.map((a) => a.id);
    const coachUsage = await deps.attachComment(meal, {
      date: meal.date ?? date, meal_type: meal.meal_type ?? meal_type, meal_time: meal.meal_time ?? null, notes,
      totals: totalsFromItems(finalItems), items: finalItems, questions,
    });
    usage = addUsage(usage, coachUsage);
    const { data: fresh } = await sb.from("meals").select("*").eq("id", meal.id).maybeSingle();
    finalMeal = { ...(fresh ?? finalMeal), meal_items: finalItems };
  }

  // A despensa aprende com os alimentos revistos (com o from_label do preview)
  // e com os factos que o preview leu.
  const learned = await learnFromMeal(sb, userId, items, [...parseReviewedFacts(input.facts), ...portionFacts(input.written, pantry.byKey, pantry.rules)]);
  return { ok: true, meal: finalMeal, items: finalItems, usage, pantry_added: learned.fromLabel, unapplied_question_ids: unapplied };
}

/** As fotos do pedido: `images` (array) ou `image_base64` (formato antigo, 1 foto). */
// deno-lint-ignore no-explicit-any
export function parseMealImages(body: any): string[] {
  if (Array.isArray(body?.images)) return body.images.filter((x: unknown) => typeof x === "string" && x.length > 0);
  if (typeof body?.image_base64 === "string" && body.image_base64) return [body.image_base64];
  return [];
}

export function mealImageMime(mime: unknown): string {
  return ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(mime as string) ? mime as string : "image/jpeg";
}

// deno-lint-ignore no-explicit-any
export function mealReplayBody(meal: any, items: any[] | null | undefined) {
  return { meal: { ...meal, meal_items: items ?? [] }, items: items ?? [], replayed: true };
}

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
    // O que se pede ao Gemini fora da leitura direta (applyMealAnswers, o registo revisto).
    const mealDeps: MealDeps = {
      analyzePhotos: (images, mime, written, notes, knowledge) => written.length
        ? analyzePhotosWithItems(images, mime, written, notes, geminiKey, extractionDeadline, knowledge, (m) => logItemsMismatch(sb, userId, m))
        : analyzeWithGemini(images, mime, notes, geminiKey, extractionDeadline, knowledge),
      estimateManual: (written, notes, knowledge) =>
        analyzeManualItems(written, notes, geminiKey, extractionDeadline, knowledge, (m) => logItemsMismatch(sb, userId, m)),
      attachComment: (meal, ctx) => attachMealCoachNotes(sb, userId, meal, ctx, geminiKey, coachDeadline),
    };

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

      const r = await applyMealAnswers(sb, userId, meal, body.answers, await pantryPromise, mealDeps);
      if (!r.ok) return jsonResponse({ error: r.error }, r.status);
      return jsonResponse({ meal: r.meal, learned: r.learned, usage: r.usage });
    }

    // ── Modo "preview": «Ler e preencher» com fotos (#106 nas refeições) ──
    // Lê as fotos (e os alimentos escritos e as observações) como o registo
    // direto, mas não grava: devolve os alimentos e as perguntas, para o
    // atleta rever e responder antes de «Gravar e analisar» (reviewed).
    if (body.mode === "preview") {
      const images = parseMealImages(body);
      if (images.length === 0) return jsonResponse({ error: "Nenhuma imagem recebida" }, 400);
      if (images.length > MAX_PHOTOS) return jsonResponse({ error: `Máximo de ${MAX_PHOTOS} fotos por refeição` }, 400);
      const written = parseWrittenItems(body.items);
      if (written.length > MAX_WRITTEN_ITEMS) return jsonResponse({ error: `Máximo de ${MAX_WRITTEN_ITEMS} alimentos por refeição.` }, 400);
      const pantry = await withWrittenFoods(sb, userId, await pantryPromise, written.map((w) => w.name));
      try {
        const read = await readMealPhotos({ images, mime: mealImageMime(body.mime_type), written, notes: rawNotes, pantry }, mealDeps);
        return jsonResponse({
          items: read.items.map(previewMealItem),
          questions: read.questions,
          facts: read.facts,
          readable: read.items.length > 0,
          usage: read.usage,
        });
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha na leitura." }, 502);
      }
    }

    // Idempotência (incidente de 2026-10-31, _shared/idempotency.ts): a mesma
    // tentativa reenviada devolve a refeição já gravada, sem gravar outra.
    // Daqui para baixo só há registo novo, edição e reanálise (meal_id).
    const clientRequestId = parseClientRequestId(body.client_request_id);
    // A refeição de outra tentativa, já com os alimentos (settleReplay espera
    // por eles se acabou de ser gravada); null se essa tentativa a desfez. A
    // resposta serve os dois caminhos: o manual lê meal.meal_items e o das
    // fotos lê items (MealRegistration.jsx) — sem `items` a refeição entrava
    // com 0 kcal (revisão de 2026-11-01).
    // deno-lint-ignore no-explicit-any
    const settled = async (meal: any) => {
      const s = await settleReplay(sb, "meals", meal.id, "meal_items", "meal_id");
      return "gone" in s ? null : jsonResponse(mealReplayBody(s.row, s.children));
    };
    // deno-lint-ignore no-explicit-any
    const replay = async (meal: any) =>
      (await settled(meal)) ?? jsonResponse({ error: STILL_SAVING_MESSAGE, retry: true }, 409);
    const alreadySaved = !body.meal_id ? await findByClientRequestId(sb, "meals", userId, clientRequestId) : null;
    // Desfeita entretanto: este pedido grava-a de novo, como se fosse o primeiro.
    const alreadyReply = alreadySaved ? await settled(alreadySaved) : null;
    if (alreadyReply) return alreadyReply;

    // ── Registo revisto: fotos + alimentos revistos + respostas (#106) ──
    // Não volta a ler as fotos: grava o que o atleta reviu no preview.
    if (body.reviewed === true && !body.mode && !body.meal_id) {
      const written = parseWrittenItems(body.items_written);
      const pantry = await withWrittenFoods(sb, userId, await pantryPromise, written.map((w) => w.name));
      const r = await saveReviewedMeal(sb, userId, {
        date: body.date, meal_type: body.meal_type, notes: rawNotes, mealTimeField,
        images: parseMealImages(body), mime: mealImageMime(body.mime_type),
        items: body.items, carol_questions: body.carol_questions, facts: body.facts, written, clientRequestId,
      }, pantry, mealDeps);
      if ("existing" in r) return await replay(r.existing);
      if (!r.ok) return jsonResponse({ error: r.error }, r.status);
      return jsonResponse({
        meal: r.meal, items: r.items, usage: r.usage,
        // As respostas que não se aplicaram: as perguntas ficam por responder (modo answer).
        unapplied_question_ids: r.unapplied_question_ids,
        ...(r.pantry_added.length ? { pantry_added: r.pantry_added } : {}),
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
      let items = parseWrittenItems(body.items);
      // Só observações, sem alimentos (decisão 15): a Carol tira-os do texto e
      // o resto segue igual. Os tokens desta leitura somam-se aos da estimativa.
      let notesUsage: GeminiUsage | null = null;
      if (items.length === 0 && notesAreAnalyzable(rawNotes)) {
        try {
          const read = await extractItemsFromNotes(
            rawNotes!, (await pantryPromise).foods.filter((f) => f.in_pantry).map((f) => f.name), geminiKey, extractionDeadline,
          );
          items = read.items;
          notesUsage = read.usage;
        } catch (e) {
          return jsonResponse({ error: e instanceof Error ? e.message : "Falha a ler as observações." }, 502);
        }
        if (items.length === 0) return jsonResponse({ error: NOTES_EMPTY_MESSAGE }, 400);
      }
      if (items.length === 0) {
        return jsonResponse({ error: "Adiciona pelo menos um alimento, ou descreve a refeição nas observações." }, 400);
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
            unknown.map((u) => u.item), rawNotes, geminiKey, extractionDeadline, knowledgeSection(pantry.foods, pantry.rules, pantry.variants),
            (m) => logItemsMismatch(sb, userId, m),
          );
          const byIndex = new Map(unknown.map((u, i) => [u.index, u.food ? withPantryValues(est.items[i], u.food, u.pending) : est.items[i]]));
          // grams_explicit: as gramas são do atleta — sem pergunta de quantidade.
          const all = items.map((w, i) => ({ ...(known.get(i) ?? byIndex.get(i)), ...(w.grams != null ? { grams_explicit: true } : {}) }));
          // Bug #87: a variante de cada genérico, e a pergunta dela (sempre).
          const v = resolveVariants(all, pantry.variants);
          estimated = {
            items: v.items, usage: est.usage, facts: est.facts,
            // Bug #109: a manteiga no pão pergunta-se sempre (optionalAdditions.ts).
            questions: withButterQuestions(
              mergeVariantQuestions(parseQuestions(renameQuestionItems(est.questions, v.renames), v.items, pantry.rules), v.questions, v.renames),
              v.items, rawNotes,
            ),
          };
        } else {
          // Só da despensa, sem o modelo: a pergunta da variante sai na mesma (da base de dados).
          const v = resolveVariants(items.map((_, i) => known.get(i)!), pantry.variants);
          // Bug #109: sem o modelo, a pergunta da manteiga no pão vem do servidor.
          estimated = { items: v.items, usage: emptyUsage(), facts: [], questions: withButterQuestions(v.questions, v.items, rawNotes) };
        }
      } catch (e) {
        return jsonResponse({ error: e instanceof Error ? e.message : "Falha na estimativa." }, 502);
      }
      if (notesUsage) estimated.usage = addUsage(estimated.usage, notesUsage);

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
          totals: totalsFromItems(savedItems || []), items: savedItems || [], questions: estimated.questions,
        }, geminiKey, coachDeadline);

        return jsonResponse({ meal: { ...updatedMeal, meal_items: savedItems }, usage: addUsage(estimated.usage, coachUsage) });
      }

      const { data: meal, existing: savedMeanwhile, error: mealError } = await insertOnce(sb, "meals", userId, {
        user_id: userId, date: body.date, meal_type: body.meal_type, photo_paths: [], status: "ready", notes: rawNotes, ...mealTimeField,
        carol_questions: estimated.questions.length ? estimated.questions : null,
      }, clientRequestId);
      // Outra tentativa do mesmo formulário gravou entretanto: é essa.
      if (savedMeanwhile) return await replay(savedMeanwhile);
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
          totals: totalsFromItems(savedItems || []), items: savedItems || [], questions: estimated.questions,
        }, geminiKey, coachDeadline),
        // Bug #75: o peso escrito de um alimento da despensa também ensina —
        // só o que veio de body.items, nunca as gramas que a Carol tirou das
        // observações (essas são estimativa, não hábito).
        learnFromMeal(sb, userId, estimated.items as unknown[], [...estimated.facts, ...portionFacts(parseWrittenItems(body.items), pantry.byKey, pantry.rules)]),
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
    const images = parseMealImages(body);

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
    const mime = mealImageMime(mime_type);
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
    // deno-lint-ignore no-explicit-any
    let items: any[], usage: GeminiUsage, facts: CookingFact[], questions: CarolQuestion[];
    try {
      // A mesma leitura do preview (readMealPhotos): variantes, despensa, perguntas.
      ({ items, usage, facts, questions } = await readMealPhotos({ images, mime, written, notes: rawNotes, pantry }, mealDeps));
    } catch (e) {
      await sb.storage.from("meal-photos").remove(photoPaths);
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha na análise." }, 502);
    }

    // 3. Gravar refeição + itens
    const { data: meal, existing: savedMeanwhile, error: mealError } = await insertOnce(sb, "meals", userId, {
      user_id: userId, date, meal_type, photo_paths: photoPaths, status: "ready", notes: rawNotes, ...mealTimeField,
      carol_questions: questions.length ? questions : null,
    }, clientRequestId);
    // Outra tentativa gravou entretanto: é essa, e as fotos desta saem.
    if (savedMeanwhile) {
      await sb.storage.from("meal-photos").remove(photoPaths);
      return await replay(savedMeanwhile);
    }
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
        items: savedItems || [], questions,
      }, geminiKey, coachDeadline),
      learnFromMeal(sb, userId, items, [...facts, ...portionFacts(written, pantry.byKey, pantry.rules)]),
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
