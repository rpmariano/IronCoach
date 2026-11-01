// Bug #109 (2026-11-01): «a carol pergunta duas vezes se, por exemplo, uma
// sandes leva manteiga e depois passa sempre a assumir que leva, errado, não
// pode assumir. vai sempre perguntar.»
//
// Os ingredientes de confeção opcionais — manteiga, azeite, óleo, molhos… —
// nunca se assumem do histórico nem de respostas antigas: a Carol pergunta
// sempre, a não ser que o atleta o diga no registo (observações ou nome do
// alimento). De onde vinha a suposição:
// · duas respostas iguais confirmavam a regra (nextRuleRow) e um tema
//   confirmado deixava de se perguntar (parseQuestions) e entrava como
//   hábito no pedido (knowledgeSection) — «usa isto em vez de adivinhar»;
// · um alimento da despensa nunca se perguntava, e uma refeição só de
//   alimentos da despensa completos nem vai ao modelo: as sandes de pão e
//   fiambre da despensa ficavam sem pergunta nenhuma sobre a manteiga.
// Uma regra que o próprio atleta escreveu no Armário (source "manual") vale:
// foi ele que o disse.
import { foodKey } from "../_shared/formulas/foodKey.ts";
import type { CarolQuestion } from "./pantry.ts";

// Cada palavra conta para uma família: «levou manteiga ou creme vegetal?» e
// «quanta margarina?» são a mesma coisa. Só manteiga, azeite, óleo e molhos
// (revisão do #109): «tempero» e «gordura» apanhavam o que não é ingrediente
// opcional — «frango · tempero: sal e limão», «carne picada · gordura: 5%».
const FAMILY: Record<string, string> = {
  manteiga: "manteiga", margarina: "manteiga", "creme vegetal": "manteiga",
  azeite: "azeite", oleo: "azeite",
  molho: "molho", maionese: "molho", ketchup: "molho",
};
const WORD_RE = new RegExp(`\\b(${Object.keys(FAMILY).join("|")})s?\\b`, "g");
// A manteiga de amendoim e as outras manteigas vegetais são um alimento, não
// a manteiga do pão.
const NUT_BUTTER_RE = /\bmanteigas? de (amendoim|caju|amendoa|amendoas|avela|avelas|noz|nozes|pistacio|cacau|coco|karite|sementes|girassol|sesamo|frutos secos)\b/g;
const keyOf = (text: unknown): string => foodKey(text).replace(NUT_BUTTER_RE, " ");

/** As famílias de ingredientes opcionais que um texto nomeia. */
export function additionFamilies(text: unknown): Set<string> {
  const out = new Set<string>();
  for (const m of keyOf(text).matchAll(WORD_RE)) out.add(FAMILY[m[1]]);
  return out;
}

/** As famílias de uma pergunta sobre um ingrediente opcional que ACOMPANHA o
 *  alimento («O pão levou manteiga?», «Os ovos foram estrelados em quê?»).
 *  Vazio quando o alimento É o ingrediente («Manteiga», 10 g escrita à parte):
 *  aí já se sabe que levou e a quantidade segue as regras de sempre. */
export function questionAdditions(q: { topic?: unknown; question?: unknown; options?: unknown; item_name?: unknown }): Set<string> {
  const said = additionFamilies(
    `${q.topic ?? ""} ${q.question ?? ""} ${Array.isArray(q.options) ? q.options.join(" ") : ""}`,
  );
  for (const f of additionFamilies(q.item_name)) said.delete(f);
  return said;
}

export const isOptionalAdditionQuestion = (q: Parameters<typeof questionAdditions>[0]): boolean =>
  questionAdditions(q).size > 0;

// O tema COMEÇA pelo ingrediente opcional («manteiga na sandes», «azeite na
// salada · quantidade»); no meio é o nome de um alimento composto («atum em
// azeite», «frango com molho de caril») e não conta (revisão do #109).
const HEAD_RE = new RegExp(`^(${Object.keys(FAMILY).join("|")})s?\\b(.*)$`);
// Numa quantidade, o ingrediente tem de estar num prato: «manteiga no pão ·
// quantidade». Sozinho («manteiga · quantidade», «molhos · quantidade») ou com
// «de» («molho de tomate») é o próprio alimento à parte.
const IN_DISH_RE = /^ (no|na|nos|nas|em|sobre|para) \S/;

/** Uma regra aprendida (de observações ou respostas) sobre um ingrediente
 *  opcional: não se usa nem se aprende. Fica a que ele escreveu à mão
 *  (manual), a quantidade do próprio ingrediente à parte e a de um alimento
 *  composto que tem o ingrediente no nome. */
export function isLearnedAdditionRule(rule: { topic?: unknown; value?: unknown; source?: unknown }): boolean {
  if (rule.source === "manual") return false;
  const topic = String(rule.topic ?? "");
  const isQuantity = /\bquantidades?\b/i.test(topic);
  // «manteiga · quantidade», «quantidade de manteiga», «quantidade de azeite na salada».
  const food = keyOf(topic.replace(/\bquantidades?\b/gi, " ")).trim().replace(/^(de|do|da|dos|das) /, "");
  const head = food.match(HEAD_RE);
  if (isQuantity) return !!head && IN_DISH_RE.test(head[2]);
  return !!head || additionFamilies(rule.value).size > 0;
}

/** Uma só pergunta por ingrediente opcional e alimento: «levou manteiga?» e
 *  «quanta manteiga?» na mesma refeição era perguntar duas vezes. Fica a
 *  primeira (a lista já vem pela ordem de impacto). */
export function dedupeAdditionQuestions(questions: CarolQuestion[]): CarolQuestion[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const keys = [...questionAdditions(q)].map((f) => `${foodKey(q.item_name)}|${f}`);
    if (keys.some((k) => seen.has(k))) return false;
    keys.forEach((k) => seen.add(k));
    return true;
  });
}

// O pão de uma sandes, tosta ou torrada pode levar manteiga; pão de ló, pão
// de queijo, pão de Deus, pão ralado e pudim de pão não são disso.
const BREAD_RE = /\b(pao|paes|sandes|sanduiche|sanduiches|tosta|tostas|torrada|torradas|baguete|carcaca|bagel|broa|regueifa)\b/;
const NOT_BREAD_RE = /\bpao de (lo|queijo|deus)\b|\bpao ralado\b|\bpudim de pao\b/;
// Palavras que não nomeiam um alimento: «sem manteiga», «com pouca manteiga»,
// «levou uma camada fina de manteiga» falam da manteiga do pão; «ovos mexidos
// com manteiga» fala dos ovos (revisão do #109).
const FILLER = new Set(
  ("a o as os um uma uns umas de do da dos das no na nos nas em com sem e ou so pouca pouco muita muito bocado " +
    "bocadinho pouquinha pouquinho camada fina grossa fio levou leva levava tinha tem nao sim pus pos coloquei barrei " +
    "barrado barrada lado lados dois duas ambos").split(" "),
);
const CLAUSE_RE = /[,.;:!?\n]|\s(?:e|mas)\s/;

/** As observações falam da manteiga do pão: uma frase com manteiga e pão, ou
 *  com manteiga e nenhum outro alimento («sem manteiga»). */
function notesSayBreadButter(notes: string | null | undefined): boolean {
  for (const clause of String(notes ?? "").split(CLAUSE_RE)) {
    if (!additionFamilies(clause).has("manteiga")) continue;
    const k = keyOf(clause);
    if (BREAD_RE.test(k) && !NOT_BREAD_RE.test(k)) return true;
    const rest = k.replace(WORD_RE, " ").split(" ").filter(Boolean);
    if (rest.every((w) => FILLER.has(w))) return true;
  }
  return false;
}

/** Um alimento que É manteiga («Manteiga», «Margarina Becel»), à parte. */
const isButterItem = (name: unknown): boolean => /^(manteigas?|margarinas?|creme vegetal)\b/.test(keyOf(name).trim());
/** 10 g de manteiga: o que muda entre «sem» e «com». */
export const BUTTER_QUESTION_KCAL = 72;
const MAX_BUTTER_QUESTIONS = 2;

/** A pergunta da manteiga no pão, feita pelo servidor: a refeição só de
 *  alimentos da despensa não vai ao modelo, e o modelo não pergunta sobre um
 *  alimento guardado. Nada se pergunta se ele já disse (observações, nome do
 *  alimento, uma manteiga à parte) ou se já há pergunta da manteiga sobre
 *  esse alimento. A assumida é «Sem manteiga» — é o que os valores contam. */
export function butterQuestions(
  // deno-lint-ignore no-explicit-any
  items: any[],
  notes: string | null | undefined,
  existing: CarolQuestion[],
  newId: () => string = () => crypto.randomUUID(),
): CarolQuestion[] {
  // Ele já o disse: nas observações, sobre o pão; ou registou a manteiga à parte.
  if (notesSayBreadButter(notes)) return [];
  if ((items || []).some((it) => isButterItem(it?.name))) return [];
  const asked = new Set(existing.filter((q) => questionAdditions(q).has("manteiga")).map((q) => foodKey(q.item_name)));
  const out: CarolQuestion[] = [];
  for (const it of items || []) {
    if (out.length >= MAX_BUTTER_QUESTIONS) break;
    const name = String(it?.name ?? "").trim();
    const k = foodKey(name);
    // O nome do próprio pão já o diz («pão com pouca manteiga»).
    if (!k || !BREAD_RE.test(k) || NOT_BREAD_RE.test(k) || asked.has(k) || additionFamilies(name).has("manteiga")) continue;
    asked.add(k);
    out.push({
      id: newId(), kind: "preparacao", topic: `manteiga em ${name}`.slice(0, 40), item_name: name,
      question: `${name}: levou manteiga ou margarina?`.slice(0, 140),
      options: ["Sem manteiga", "Com manteiga (~10 g)"], assumed: "Sem manteiga",
      impact_kcal: BUTTER_QUESTION_KCAL, impact_protein_g: 0, answer: null, answered_at: null,
    });
  }
  return out;
}

/** As perguntas finais de uma refeição: as do modelo (e das variantes) mais a
 *  da manteiga no pão, se faltar. */
export function withButterQuestions(
  // deno-lint-ignore no-explicit-any
  questions: CarolQuestion[], items: any[], notes: string | null | undefined, newId?: () => string,
): CarolQuestion[] {
  return [...questions, ...butterQuestions(items, notes, questions, newId)];
}

const FAMILY_LABEL: Record<string, string> = { manteiga: "manteiga", azeite: "azeite ou óleo", molho: "molho" };

/** Para o comentário: pode pedir-lhe que da próxima vez diga logo se pôs ou
 *  não — é a alternativa a assumir (bug #109). "" sem perguntas destas. */
export function nextTimeAdditionsSection(questions: CarolQuestion[] | null | undefined): string {
  const fams = new Set<string>();
  for (const q of questions || []) if (q) questionAdditions(q).forEach((f) => fams.add(f));
  if (!fams.size) return "";
  return `INGREDIENTES OPCIONAIS — perguntaste-lhe por ${[...fams].map((f) => FAMILY_LABEL[f]).join(", ")}: ` +
    `nunca assumas que pôs ou que não pôs por causa de outras refeições. Podes pedir-lhe, numa frase curta (em ` +
    `"Para a próxima", se couber), que da próxima vez escreva logo nas observações se pôs ou não.\n`;
}
