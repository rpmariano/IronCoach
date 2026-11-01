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
// «quanta margarina?» são a mesma coisa; o tempero da salada é azeite.
const FAMILY: Record<string, string> = {
  manteiga: "manteiga", margarina: "manteiga", "creme vegetal": "manteiga",
  azeite: "gordura", oleo: "gordura", gordura: "gordura", banha: "gordura", tempero: "gordura",
  molho: "molho", maionese: "molho", ketchup: "molho", natas: "molho",
};
const WORD_RE = new RegExp(`\\b(${Object.keys(FAMILY).join("|")})s?\\b`, "g");

/** As famílias de ingredientes opcionais que um texto nomeia. */
export function additionFamilies(text: unknown): Set<string> {
  const out = new Set<string>();
  for (const m of foodKey(text).matchAll(WORD_RE)) out.add(FAMILY[m[1]]);
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

/** Uma regra aprendida (de observações ou respostas) sobre um ingrediente
 *  opcional: não se usa nem se aprende. Fica a que ele escreveu à mão
 *  (manual) e a quantidade do próprio ingrediente à parte («manteiga ·
 *  quantidade» — é da manteiga quando vem como alimento, não de um prato). */
export function isLearnedAdditionRule(rule: { topic?: unknown; value?: unknown; source?: unknown }): boolean {
  if (rule.source === "manual") return false;
  const topic = String(rule.topic ?? "");
  // «manteiga · quantidade», «manteiga · quantidades», «quantidade de manteiga».
  if (/\bquantidades?\b/i.test(topic)) {
    const food = foodKey(topic.replace(/\bquantidades?\b/gi, " ")).replace(/^(de|do|da|dos|das) /, "");
    if (food in FAMILY) return false;
  }
  return additionFamilies(`${topic} ${rule.value ?? ""}`).size > 0;
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

// O pão de uma sandes, tosta ou torrada pode levar manteiga; pão de ló e pão
// de queijo não são disso.
const BREAD_RE = /\b(pao|paes|sandes|sanduiche|sanduiches|tosta|tostas|torrada|torradas|baguete|carcaca|bagel|broa|regueifa)\b/;
const NOT_BREAD_RE = /\bpao de (lo|queijo)\b/;
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
  if (additionFamilies(notes).has("manteiga")) return [];
  if ((items || []).some((it) => additionFamilies(it?.name).has("manteiga"))) return [];
  const asked = new Set(existing.filter((q) => questionAdditions(q).has("manteiga")).map((q) => foodKey(q.item_name)));
  const out: CarolQuestion[] = [];
  for (const it of items || []) {
    if (out.length >= MAX_BUTTER_QUESTIONS) break;
    const name = String(it?.name ?? "").trim();
    const k = foodKey(name);
    if (!k || !BREAD_RE.test(k) || NOT_BREAD_RE.test(k) || asked.has(k)) continue;
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

const FAMILY_LABEL: Record<string, string> = { manteiga: "manteiga", gordura: "azeite ou outra gordura", molho: "molho" };

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
