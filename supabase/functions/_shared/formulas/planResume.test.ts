import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { detectPlanResume, isPlanRequest, messageIdOfPlanResumeKey, planResumeFacts, planResumeKey, planResumePushMessage, type PlanResumeInput } from "./planResume.ts";

// O caso real (pssmartins, 25/10 20:43): a parte 1 de 5 aceite como plano
// normal, e a parte 2 (2–8/11) nunca pedida.
const MSG_ID = "7cd927d8-4e21-4e49-b86d-0c86985cc812";
const MSG = {
  id: MSG_ID,
  created_at: "2026-10-25T20:43:16.000Z",
  plan_continuation: { from: "2026-11-02", to: "2026-11-08", part: 2, of: 5, until: "2026-11-29" },
};
const base = (over: Partial<PlanResumeInput> = {}): PlanResumeInput => ({
  lastContinuation: MSG,
  pendingTrainingPlans: 0,
  // A parte 1 (26/10–1/11) aceite: tem itens, mas fora da semana prometida.
  acceptedItemDates: ["2026-10-26", "2026-10-28", "2026-11-01"],
  userMessagesAfter: [],
  ...over,
});
const NOW = Date.parse("2026-10-27T10:00:00Z");
const TODAY = "2026-10-27";

Deno.test("plano a meio: a parte 2 prometida e nunca pedida é retomada (uma vez, pela chave da mensagem)", () => {
  const c = detectPlanResume(base(), NOW, TODAY)!;
  assertEquals([c.trigger, c.key], ["plan_resume", `plan_resume:${MSG_ID}`]);
  assertEquals(c.resume, { from: "2026-11-02", to: "2026-11-08", part: 2, of: 5, until: "2026-11-29", message_id: MSG_ID });
  assertEquals(messageIdOfPlanResumeKey(c.key), MSG_ID);
  assertEquals(planResumeKey(MSG_ID), c.key);
  assertStringIncludes(planResumeFacts(c.resume), "a semana de 2/11 a 8/11; o plano vai até 29/11");
  assertStringIncludes(planResumePushMessage(c).body, "2/11 a 8/11");
  // Uma mensagem dele que não pede plano não a cala.
  assertEquals(!!detectPlanResume(base({ userMessagesAfter: [{ content: "Como correu a minha semana?", created_at: "2026-10-26T09:00:00Z" }] }), NOW, TODAY), true);
});

Deno.test("plano a meio: não se retoma com proposta pendente, itens aceites na semana, prazo passado, cedo de mais ou outro pedido dele", () => {
  assertEquals(detectPlanResume(base({ pendingTrainingPlans: 1 }), NOW, TODAY), null);
  assertEquals(detectPlanResume(base({ acceptedItemDates: ["2026-11-03"] }), NOW, TODAY), null);
  // Mais de 3 dias depois do início da parte (2/11 + 3 = 5/11).
  assertEquals(detectPlanResume(base(), Date.parse("2026-11-06T10:00:00Z"), "2026-11-06"), null);
  assertEquals(!!detectPlanResume(base(), Date.parse("2026-11-05T10:00:00Z"), "2026-11-05"), true);
  // until já passou.
  assertEquals(detectPlanResume(base({ lastContinuation: { ...MSG, plan_continuation: { ...MSG.plan_continuation, until: "2026-10-26", to: "2026-10-26", from: "2026-10-26" } } }), NOW, TODAY), null);
  // Menos de 2 h depois da mensagem.
  assertEquals(detectPlanResume(base(), Date.parse("2026-10-25T21:30:00Z"), "2026-10-25"), null);
  // Ele pediu entretanto outro plano.
  assertEquals(detectPlanResume(base({ userMessagesAfter: [{ content: "Faz-me um plano novo para a semana", created_at: "2026-10-26T09:00:00Z" }] }), NOW, TODAY), null);
  // Sem mensagem, ou com uma continuação inválida.
  assertEquals(detectPlanResume(base({ lastContinuation: null }), NOW, TODAY), null);
  assertEquals(detectPlanResume(base({ lastContinuation: { ...MSG, plan_continuation: { from: "x" } } }), NOW, TODAY), null);
});

Deno.test("isPlanRequest: o critério partilhado com o isPlanTurn do coach-chat", () => {
  assertEquals(isPlanRequest("Monta-me o próximo mês"), true);
  assertEquals(isPlanRequest("O plano de ontem foi duro"), false);
  assertEquals(isPlanRequest(null), false);
});
