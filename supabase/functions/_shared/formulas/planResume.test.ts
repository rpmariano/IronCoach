import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { assertCarolVoice } from "../carolTone.ts";
import {
  acceptedTrainingDates,
  detectPlanResume,
  isPlanRequest,
  messageIdOfPlanResumeKey,
  PLAN_RESUME_LATER_REPLY,
  planResumeFacts,
  planResumeKey,
  planResumePushMessage,
  type PlanResumeInput,
  weekText,
} from "./planResume.ts";

// O caso real (pssmartins, 25/10 20:43): a parte 1 de 5 aceite como plano
// normal, e a parte 2 (2–8/11) nunca pedida.
const MSG_ID = "7cd927d8-4e21-4e49-b86d-0c86985cc812";
const MSG = {
  id: MSG_ID,
  created_at: "2026-10-25T20:43:16.000Z",
  plan_continuation: { from: "2026-11-02", to: "2026-11-08", part: 2, of: 5, until: "2026-11-29" },
};
const run = (d: string) => ({ planned_date: d, kind: "corrida", status: "pendente" });
const base = (over: Partial<PlanResumeInput> = {}): PlanResumeInput => ({
  lastContinuation: MSG,
  pendingTrainingPlans: 0,
  // A parte 1 (26/10–1/11) aceite: treinos, mas fora da semana prometida.
  acceptedItems: [run("2026-10-26"), run("2026-10-28"), run("2026-11-01")],
  userMessagesAfter: [],
  plansCreatedAfter: 0,
  continuationPlanStatus: "aceite",
  ...over,
});
const NOW = Date.parse("2026-10-27T10:00:00Z");
const TODAY = "2026-10-27";

Deno.test("plano a meio: a parte 2 prometida e nunca pedida é retomada (uma vez, pela chave da mensagem)", () => {
  const c = detectPlanResume(base(), NOW, TODAY)!;
  assertEquals([c.trigger, c.key], ["plan_resume", `plan_resume:${MSG_ID}`]);
  // A parte 1 (26/10–1/11) está no calendário: a variante (a) do texto dela.
  assertEquals(c.resume, {
    from: "2026-11-02", to: "2026-11-08", part: 2, of: 5, until: "2026-11-29", message_id: MSG_ID,
    prevFrom: "2026-10-26", prevTo: "2026-11-01", applied: true, raceName: null,
  });
  assertEquals(messageIdOfPlanResumeKey(c.key), MSG_ID);
  assertEquals(planResumeKey(MSG_ID), c.key);
  assertEquals(planResumeFacts({ ...c.resume, raceName: "Meia de Lisboa" }),
    "semana anterior: 26/10 a 1/11; a semana anterior está no calendário: sim; semana que falta: 2 a 8/11 (parte 2 de 5); o plano vai até 29/11; prova: Meia de Lisboa");
  assertEquals([weekText("2026-10-26", "2026-11-01"), weekText("2026-11-02", "2026-11-08")], ["26/10 a 1/11", "2 a 8/11"]);
  // Uma mensagem dele que não pede plano não a cala.
  assertEquals(!!detectPlanResume(base({ userMessagesAfter: [{ content: "Como correu a minha semana?", created_at: "2026-10-26T09:00:00Z" }] }), NOW, TODAY), true);
});

Deno.test("plano a meio: a notificação diz se falta uma semana ou várias; as frases dela passam na voz", () => {
  const c = detectPlanResume(base(), NOW, TODAY)!;
  assertEquals(planResumePushMessage(c).body, "O teu plano ficou a meio. Faltam a semana de 2 a 8/11 e as seguintes, e eu preparo-tas quando abrires a conversa.");
  const last = { ...c, resume: { ...c.resume, part: 5, of: 5 } };
  assertEquals(planResumePushMessage(last).body, "O teu plano ficou a meio. Falta a semana de 2 a 8/11, e eu preparo-ta quando abrires a conversa.");
  assertCarolVoice(planResumePushMessage(c).body);
  assertCarolVoice(planResumePushMessage(last).body);
  assertCarolVoice(PLAN_RESUME_LATER_REPLY);
});

Deno.test("plano a meio: não se retoma com proposta pendente, treinos aceites na semana, prazo passado, cedo de mais ou outro pedido dele", () => {
  assertEquals(detectPlanResume(base({ pendingTrainingPlans: 1 }), NOW, TODAY), null);
  assertEquals(detectPlanResume(base({ acceptedItems: [run("2026-11-03")] }), NOW, TODAY), null);
  // Mais de 3 dias depois do início da parte (2/11 + 3 = 5/11).
  assertEquals(detectPlanResume(base(), Date.parse("2026-11-06T10:00:00Z"), "2026-11-06"), null);
  assertEquals(!!detectPlanResume(base(), Date.parse("2026-11-05T10:00:00Z"), "2026-11-05"), true);
  assertEquals(detectPlanResume(base({ lastContinuation: { ...MSG, plan_continuation: { ...MSG.plan_continuation, until: "2026-10-26", to: "2026-10-26", from: "2026-10-26" } } }), NOW, TODAY), null);
  assertEquals(detectPlanResume(base(), Date.parse("2026-10-25T21:30:00Z"), "2026-10-25"), null);
  assertEquals(detectPlanResume(base({ userMessagesAfter: [{ content: "Faz-me um plano novo para a semana", created_at: "2026-10-26T09:00:00Z" }] }), NOW, TODAY), null);
  assertEquals(detectPlanResume(base({ lastContinuation: null }), NOW, TODAY), null);
  assertEquals(detectPlanResume(base({ lastContinuation: { ...MSG, plan_continuation: { from: "x" } } }), NOW, TODAY), null);
});

Deno.test("plano a meio: a cadeia recusada, ou um plano criado depois da mensagem, não se retoma (B1)", () => {
  // A cadeia recusada: o plano da mensagem (a parte dela) ficou recusado.
  assertEquals(detectPlanResume(base({ continuationPlanStatus: "recusado" }), NOW, TODAY), null);
  // A parte 1 aceite à moda antiga e a parte 2 recusada: a última mensagem com
  // continuação é a da parte 2, e o plano dela está recusado.
  const parte2 = { ...MSG, id: "8cd927d8-4e21-4e49-b86d-0c86985cc813", plan_continuation: { from: "2026-11-09", to: "2026-11-15", part: 3, of: 5, until: "2026-11-29" } };
  assertEquals(detectPlanResume(base({ lastContinuation: parte2, continuationPlanStatus: "recusado" }), Date.parse("2026-11-03T10:00:00Z"), "2026-11-03"), null);
  // Um plano novo depois da mensagem (pedido por botão, recusado ou não).
  assertEquals(detectPlanResume(base({ plansCreatedAfter: 1 }), NOW, TODAY), null);
});

Deno.test("plano a meio: só treinos a sério contam para o calendário — nem descanso, nem cancelado (B2)", () => {
  assertEquals(acceptedTrainingDates([
    { planned_date: "2026-10-27", kind: "descanso", status: "pendente" },
    { planned_date: "2026-10-28", kind: "corrida", status: "cancelado" },
    { planned_date: "2026-10-29", kind: "ginasio", status: "concluido" },
  ]), ["2026-10-29"]);
  // Só descanso e cancelados na semana anterior: nada está no calendário (variante b).
  const c = detectPlanResume(base({ acceptedItems: [{ planned_date: "2026-10-27", kind: "descanso" }, { planned_date: "2026-10-28", kind: "corrida", status: "cancelado" }] }), NOW, TODAY)!;
  assertEquals(c.resume.applied, false);
  assertStringIncludes(planResumeFacts(c.resume), "a semana anterior está no calendário: não");
  // Um descanso aceite na semana prometida não a tira.
  assertEquals(!!detectPlanResume(base({ acceptedItems: [{ planned_date: "2026-11-03", kind: "descanso" }] }), NOW, TODAY), true);
  // Sem o dado do calendário, a linha não vai (e ela não fala dele).
  assertEquals(planResumeFacts({ from: "2026-11-02", to: "2026-11-08", part: 2, of: 5, until: "2026-11-29" }).includes("calendário"), false);
});

Deno.test("plano a meio: os chips da própria retoma não contam como outro pedido de plano", () => {
  // «Manda a próxima semana» tem «próxima» e «semana»: sem isto, a regra calava-se no «Manda».
  const after = [{ content: "Manda a próxima semana", created_at: "2026-10-27T09:00:00Z" }, { content: "Agora não.", created_at: "2026-10-27T09:01:00Z" }];
  assertEquals(!!detectPlanResume(base({ userMessagesAfter: after }), NOW, TODAY), true);
});

Deno.test("isPlanRequest: o critério partilhado com o isPlanTurn do coach-chat", () => {
  assertEquals(isPlanRequest("Monta-me o próximo mês"), true);
  assertEquals(isPlanRequest("O plano de ontem foi duro"), false);
  assertEquals(isPlanRequest(null), false);
});
