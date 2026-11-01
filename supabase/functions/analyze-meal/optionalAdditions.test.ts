import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  additionFamilies, BUTTER_QUESTION_KCAL, butterQuestions, dedupeAdditionQuestions, isLearnedAdditionRule, nextTimeAdditionsSection,
  questionAdditions, withButterQuestions,
} from "./optionalAdditions.ts";
import { type CarolQuestion, type FoodRule, knowledgeSection, parseQuestions, pendingRulesFor } from "./pantry.ts";

// Bug #109 (2026-11-01): os ingredientes de confeção opcionais nunca se
// assumem do histórico nem de respostas antigas — a Carol pergunta sempre.

let n = 0;
const ids = () => `q${++n}`;
const q = (over: Partial<CarolQuestion> = {}): CarolQuestion => ({
  id: "x", kind: "preparacao", topic: "manteiga na sandes mista", item_name: "Sandes mista", question: "A sandes mista levou manteiga?",
  options: ["Sem manteiga", "Com manteiga (~10 g)"], assumed: "Sem manteiga", impact_kcal: 72, impact_protein_g: 0, answer: null, answered_at: null,
  ...over,
});

Deno.test("additionFamilies / questionAdditions: as famílias, e nada quando o alimento É o ingrediente", () => {
  assertEquals([...additionFamilies("Levou manteiga ou creme vegetal?")], ["manteiga"]);
  assertEquals([...additionFamilies("Óleo, azeite ou molhos")].sort(), ["azeite", "molho"]);
  assertEquals(additionFamilies("Meio-gordo").size, 0);
  // Revisão: tempero e gordura não são família; a manteiga de amendoim não é manteiga.
  assertEquals(additionFamilies("tempero: sal e limão; gordura visível").size, 0);
  assertEquals(additionFamilies("Pão com manteiga de amendoim").size, 0);
  assertEquals(additionFamilies("Torrada com manteiga de caju e manteiga").size, 1);
  assertEquals([...questionAdditions(q())], ["manteiga"]);
  assertEquals(questionAdditions(q({ kind: "quantidade", topic: "manteiga · quantidade", item_name: "Manteiga", question: "Quanta manteiga?" })).size, 0);
  assertEquals([...questionAdditions({ topic: "fritos", item_name: "Ovo estrelado", question: "Em quê?", options: ["Azeite", "Manteiga"] })].sort(), ["azeite", "manteiga"]);
});

Deno.test("isLearnedAdditionRule: o que se aprendeu de manteiga, azeite ou molho não se usa; o manual e a quantidade à parte sim", () => {
  const r = (topic: string, value: string, source = "resposta") => ({ topic, value, source });
  assert(isLearnedAdditionRule(r("manteiga na sandes mista", "Sem manteiga")));    // o caso do Rui
  assert(isLearnedAdditionRule(r("fritos", "azeite", "observacao")));
  assert(isLearnedAdditionRule(r("azeite na salada · quantidade", "um fio")));
  assert(!isLearnedAdditionRule(r("manteiga na sandes", "Sem manteiga", "manual")));
  assert(!isLearnedAdditionRule(r("manteiga · quantidade", "camada fina (~5 g)")));
  assert(!isLearnedAdditionRule(r("pele do frango", "Com pele")));
  assert(!isLearnedAdditionRule(r("leite do galão", "Meio-gordo")));
  // Revisão do #109: o que não é ingrediente opcional continua a aprender-se.
  assert(!isLearnedAdditionRule(r("frango · tempero", "sal e limão")));
  assert(!isLearnedAdditionRule(r("carne picada · gordura", "5%")));
  assert(!isLearnedAdditionRule(r("bife", "com gordura visível")));
  assert(!isLearnedAdditionRule(r("preparação dos ovos mexidos", "Sem gordura / antiaderente")));
  assert(!isLearnedAdditionRule(r("pão · barrado", "manteiga de amendoim")));
});

Deno.test("pendingRulesFor: uma regra de ingrediente opcional já não manda o pão da despensa ao modelo (revisão do #109)", () => {
  const rule = (topic: string, value: string): FoodRule =>
    ({ topic, topic_key: topic, value, value_key: value, confirmations: 1, status: "por_confirmar", source: "resposta" });
  assertEquals(pendingRulesFor("Sandes mista", [rule("manteiga na sandes", "Sem manteiga")]), []);
  assertEquals(pendingRulesFor("Sandes mista", [{ ...rule("manteiga na sandes", "Sem manteiga"), status: "varia" }]), []);
  assertEquals(pendingRulesFor("Coxa de frango", [rule("pele do frango", "Com pele")]).length, 1);
});

Deno.test("parseQuestions: duas respostas «Sem manteiga» e a sandes da despensa — pergunta na mesma (bug #109)", () => {
  n = 0;
  const confirmada: FoodRule = {
    topic: "manteiga na sandes mista", topic_key: "manteiga na sandes mista", value: "Sem manteiga", value_key: "sem manteiga",
    confirmations: 2, status: "confirmado", source: "resposta",
  };
  const sandes = { name: "Sandes mista", from_pantry: true };
  const [pergunta] = parseQuestions([{ ...q(), id: undefined }], [sandes], [confirmada], ids);
  assertEquals([pergunta.topic, pergunta.item_name, pergunta.assumed], ["manteiga na sandes mista", "Sandes mista", "Sem manteiga"]);
  // E o hábito não entra no pedido como «usa isto em vez de adivinhar».
  assert(!knowledgeSection([], [confirmada]).includes("Sem manteiga"));
  assertStringIncludes(knowledgeSection([], [{ ...confirmada, source: "manual" }]), "manteiga na sandes mista: Sem manteiga");
});

Deno.test("parseQuestions + dedupeAdditionQuestions: uma só pergunta de manteiga por alimento", () => {
  n = 0;
  const pao = { name: "Pão" };
  const levou = { topic: "manteiga no pão", item_name: "Pão", question: "O pão levou manteiga?", options: ["Sim", "Não"], assumed: "Não", impact_kcal: 72 };
  const quanta = {
    kind: "quantidade", topic: "manteiga no pão", item_name: "Pão", question: "Quanta manteiga levou o pão?",
    options: ["Camada fina (~5 g)", "Camada grossa (~15 g)"], assumed: "Camada fina (~5 g)", impact_kcal: 80,
  };
  const qs = parseQuestions([levou, quanta], [pao], [], ids);
  assertEquals(qs.map((x) => x.kind), ["quantidade"]); // a de mais impacto
  assertEquals(dedupeAdditionQuestions([q({ item_name: "A" }), q({ item_name: "B" }), q({ item_name: "A", id: "y" })]).length, 2);
});

Deno.test("revisão do #109: a pergunta da gordura da carne não cai no dedupe, nem com a do molho no mesmo prato", () => {
  n = 0;
  const carne = { name: "Carne picada com molho" };
  const gordura = {
    topic: "gordura da carne picada", item_name: "Carne picada com molho", question: "A carne picada era magra?",
    options: ["Magra", "Normal"], assumed: "Normal", impact_kcal: 90,
  };
  const molho = { topic: "molho da carne", item_name: "Carne picada com molho", question: "Que molho era?", options: ["Tomate", "Natas"], assumed: "Tomate", impact_kcal: 60 };
  const qs = parseQuestions([gordura, molho, { ...gordura, topic: "gordura visível", question: "Tinha gordura visível?" }], [carne], [], ids);
  assertEquals(qs.map((x) => x.topic), ["gordura da carne picada", "gordura visível", "molho da carne"]);
});

Deno.test("butterQuestions: o pão da despensa sem pergunta ganha a da manteiga; nada se ele já disse", () => {
  n = 0;
  // A refeição de 30-10 do Rui: só da despensa, sem o modelo, sem pergunta nenhuma.
  const meal = [{ name: "2 fatias pão branco" }, { name: "Meio queijo fresco cabra" }, { name: "Fiambre de peru" }];
  const [b] = butterQuestions(meal, null, [], ids);
  assertEquals(b, {
    id: "q1", kind: "preparacao", topic: "manteiga em 2 fatias pão branco", item_name: "2 fatias pão branco",
    question: "2 fatias pão branco: levou manteiga ou margarina?", options: ["Sem manteiga", "Com manteiga (~10 g)"],
    assumed: "Sem manteiga", impact_kcal: BUTTER_QUESTION_KCAL, impact_protein_g: 0, answer: null, answered_at: null,
  });
  assertEquals(butterQuestions(meal, "pão sem manteiga", [], ids), []);
  assertEquals(butterQuestions([{ name: "Duas fatias de pão branco com pouca manteiga e doce de tomate" }], null, [], ids), []);
  assertEquals(butterQuestions([...meal, { name: "Manteiga" }], null, [], ids), []);
  assertEquals(butterQuestions(meal, null, [q({ item_name: "2 fatias pão branco" })], ids), []);
  assertEquals(butterQuestions([{ name: "Pão de ló" }, { name: "Iogurte" }], null, [], ids), []);
  assertEquals(butterQuestions([{ name: "Tosta mista" }, { name: "Torradas" }, { name: "Sandes de atum" }], null, [], ids).length, 2);
  // Revisão: não é pão; a manteiga das notas ou de outro alimento só conta se for a do pão.
  assertEquals(butterQuestions([{ name: "Pão ralado" }, { name: "Pudim de pão" }, { name: "Pão de Deus" }], null, [], ids), []);
  assertEquals(butterQuestions([{ name: "Ovos mexidos" }, { name: "Torrada" }], "ovos mexidos com manteiga e torrada", [], ids).length, 1);
  assertEquals(butterQuestions([{ name: "Ovos mexidos com manteiga" }, { name: "Torrada" }], null, [], ids).length, 1);
  assertEquals(butterQuestions([{ name: "Pão" }, { name: "Manteiga de amendoim" }], "pão com manteiga de amendoim", [], ids).length, 1);
  assertEquals(butterQuestions([{ name: "Torrada" }], "torrada sem manteiga", [], ids), []);
  assertEquals(butterQuestions([{ name: "Pão" }, { name: "Fiambre" }], "pão com fiambre e manteiga", [], ids), []);
  assertEquals(butterQuestions([{ name: "Pão" }], "Sem manteiga.", [], ids), []);
  assertEquals(butterQuestions([{ name: "Pão" }, { name: "Margarina Becel" }], null, [], ids), []);
  // O modelo já perguntou noutro alimento: o pão ganha a sua.
  assertEquals(withButterQuestions([q({ item_name: "Ovos mexidos", topic: "gordura dos ovos", question: "Em quê?", options: ["Azeite", "Manteiga"], assumed: "Azeite" })], [{ name: "Ovos mexidos" }, { name: "Pão de mistura torrado" }], null, ids).length, 2);
});

Deno.test("nextTimeAdditionsSection: pode pedir que da próxima vez diga logo; nunca assumir do histórico", () => {
  const s = nextTimeAdditionsSection([q({ answer: "Sem manteiga" })]);
  assertStringIncludes(s, "perguntaste-lhe por manteiga");
  assertStringIncludes(s, "nunca assumas que pôs ou que não pôs por causa de outras refeições");
  assertStringIncludes(s, "da próxima vez escreva logo nas observações se pôs ou não");
  assertEquals(nextTimeAdditionsSection([q({ topic: "pele do frango", question: "Com pele?", options: ["Sim", "Não"], item_name: "Frango" })]), "");
  assertEquals(nextTimeAdditionsSection(null), "");
});

Deno.test("index.ts: a manteiga no pão nos três caminhos, a exceção no prompt das perguntas e a sugestão no comentário", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(src.split("withButterQuestions(").length - 1, 3);
  assertStringIncludes(src, "pergunta SEMPRE");
  assertStringIncludes(src, "nextTimeAdditionsSection(openQuestions)");
});
