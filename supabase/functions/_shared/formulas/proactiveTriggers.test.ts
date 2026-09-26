import { assert, assertEquals } from "jsr:@std/assert@1";
import { findRaceRunServer, isWithinProactiveWindow, pickServerProactive, listServerProactive, proactivePushMessage, proactiveTab, shortHash, findEndingBlock, detectRaceConflictServer, findWeekToReview, weekToReviewBounds, startTimeMinutes, interventionKey, raceConflictKey, findMissedWorkout, missedWorkoutInReview, missedWorkoutLabel, silenceCandidate, ALL_PROACTIVE_TRIGGERS, type TriggerRace } from "./proactiveTriggers.ts";
import { assertCarolVoice } from "../carolTone.ts";

const TODAY = "2026-09-18";
const race = (over: Record<string, unknown> = {}) => ({ id: "r1", name: "Meia de Lisboa", date: TODAY, status: "agendada", ...over });

Deno.test("prioridade: manhã da prova antes da véspera, do balanço e do silêncio", () => {
  const c = pickServerProactive({ raceEvents: [race(), race({ id: "r2", date: "2026-09-19" })], runs: [], lastRecordDate: "2026-09-01" }, TODAY);
  assertEquals(c?.trigger, "race_morning");
  assertEquals(c?.key, "race_morning:r1");
});

Deno.test("véspera: prova amanhã e ainda não concluída", () => {
  assertEquals(pickServerProactive({ raceEvents: [race({ date: "2026-09-19" })], runs: [], lastRecordDate: TODAY }, TODAY)?.key, "race_eve:r1");
  assertEquals(pickServerProactive({ raceEvents: [race({ date: "2026-09-19", status: "concluida" })], runs: [], lastRecordDate: TODAY }, TODAY), null);
});

Deno.test("depois da prova: com corrida ligada até 7 dias; sem corrida só de 1 a 3", () => {
  const withRun = pickServerProactive({ raceEvents: [race({ date: "2026-09-13" })], runs: [{ id: "run9", race_id: "r1", date: "2026-09-13" }], lastRecordDate: TODAY }, TODAY);
  assertEquals(withRun?.key, "race_after:r1:run9");
  assertEquals(withRun?.hasRun, true);
  assertEquals(pickServerProactive({ raceEvents: [race({ date: "2026-09-16" })], runs: [], lastRecordDate: TODAY }, TODAY)?.key, "race_after:r1:sem-registo");
  assertEquals(pickServerProactive({ raceEvents: [race({ date: "2026-09-13" })], runs: [], lastRecordDate: TODAY }, TODAY), null);
  // No próprio dia sem corrida é a manhã da prova, não o balanço.
  assertEquals(pickServerProactive({ raceEvents: [race({ status: "concluida" })], runs: [], lastRecordDate: TODAY }, TODAY), null);
});

Deno.test("findRaceRunServer: por data só numa prova concluída, e só uma competição sem ligação", () => {
  const runs = [{ id: "a", date: TODAY, kind: "competicao", race_id: null }];
  assertEquals(findRaceRunServer(runs, race())?.id, undefined);
  assertEquals(findRaceRunServer(runs, race({ status: "concluida" }))?.id, "a");
  assertEquals(findRaceRunServer([{ id: "b", date: TODAY, kind: "treino" }], race({ status: "concluida" })), null);
});

/* Revisão de 2026-09-26: sem plano nenhum a cobrir o período, o limiar sobe
   de SILENCE_DAYS (3) para SILENCE_DAYS_SEM_PLANO (7) — três dias sem plano
   nem registo é normal. Com um plano aceite no período, o limiar volta a
   ser 3 (ver os testes plannedTrainingsBetween abaixo). */
Deno.test("silêncio: sem plano, só a partir de 7 dias; a chave leva o dia do último registo", () => {
  const c = pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-11" }, TODAY);
  assertEquals(c, { trigger: "silence", key: "silence:2026-09-11", raceId: null, raceName: null, hasRun: false, silenceDays: 7, anchorDate: "2026-09-11", anchorAt: null });
  assertEquals(pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-14" }, TODAY), null);
  assertEquals(pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: null }, TODAY), null);
});

Deno.test("o texto da notificação: com e sem nome, sem emoji nem exclamação", () => {
  const all = [
    pickServerProactive({ raceEvents: [race()], runs: [], lastRecordDate: TODAY }, TODAY)!,
    pickServerProactive({ raceEvents: [race({ date: "2026-09-19", name: null })], runs: [], lastRecordDate: TODAY }, TODAY)!,
    pickServerProactive({ raceEvents: [race({ date: "2026-09-16" })], runs: [{ id: "x", race_id: "r1" }], lastRecordDate: TODAY }, TODAY)!,
    pickServerProactive({ raceEvents: [race({ date: "2026-09-16", name: "" })], runs: [], lastRecordDate: TODAY }, TODAY)!,
    pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-10" }, TODAY)!,
  ];
  const bodies = all.map((c) => proactivePushMessage(c).body);
  assertEquals(bodies, [
    // Sem plano de ritmo nem hora de partida (revisão de 2026-09-26).
    "Hoje é dia de prova: Meia de Lisboa. Fala comigo antes da partida.",
    "Amanhã é dia de prova. Tenho o plano para hoje à noite e para amanhã.",
    "Vi o registo da prova Meia de Lisboa. Quero fazer o balanço contigo.",
    "Como correu a prova? Conta-me, e regista a corrida.",
    "Não vejo nada teu há 8 dias. Estás bem?",
  ]);
  for (const b of bodies) assertCarolVoice(b);
  assertEquals(proactivePushMessage(all[0]).title, "Carol");
});

Deno.test("janela: a manhã da prova sai a partir das 6h, o resto das 9h às 21h", () => {
  assert(isWithinProactiveWindow("race_morning", 6));
  assert(!isWithinProactiveWindow("race_eve", 8));
  assert(isWithinProactiveWindow("silence", 9));
  assert(!isWithinProactiveWindow("silence", 21));
});

Deno.test("janela do atleta (P.6): respeita a dele, a manhã da prova pode adiantar-se até às 6h", () => {
  const prefs = { startHour: 10, endHour: 19 };
  assert(!isWithinProactiveWindow("silence", 9, prefs));
  assert(isWithinProactiveWindow("silence", 10, prefs));
  assert(!isWithinProactiveWindow("race_eve", 19, prefs));
  assert(isWithinProactiveWindow("race_morning", 7, prefs));
  assert(!isWithinProactiveWindow("race_morning", 5, prefs));
  assert(!isWithinProactiveWindow("race_morning", 20, prefs));
  // Janela que já começa antes das 6h: a manhã da prova segue-a.
  assert(isWithinProactiveWindow("race_morning", 5, { startHour: 5, endHour: 22 }));
  // Início igual ao fim: a janela por omissão, nunca 24 horas.
  assert(!isWithinProactiveWindow("silence", 3, { startHour: 0, endHour: 0 }));
  assert(isWithinProactiveWindow("silence", 12, { startHour: 9, endHour: 9 }));
  // A atravessar a meia-noite.
  assert(isWithinProactiveWindow("silence", 23, { startHour: 22, endHour: 2 }));
  assert(!isWithinProactiveWindow("silence", 12, { startHour: 22, endHour: 2 }));
});

Deno.test("P.5: um assunto por resolver passa à frente de tudo, com chave pelo motivo", () => {
  const c = pickServerProactive({ raceEvents: [race()], runs: [], lastRecordDate: TODAY, intervention: { status: "needed", reason: "Check-in: dor 6/10" } }, TODAY)!;
  assertEquals(c.trigger, "intervention");
  assertEquals(c.key, `intervention:${shortHash("Check-in: dor 6/10")}`);
  assert(shortHash("a") !== shortHash("b"));
  // Resolvida ou em curso não chama.
  assertEquals(pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: TODAY, intervention: { status: "in_progress", reason: "x" } }, TODAY), null);
  // O texto não diz o motivo (pode ser de saúde) e o toque abre o Início.
  assert(!proactivePushMessage(c).body.includes("dor"));
  assertEquals(proactiveTab("intervention"), "home");
});

Deno.test("P.5: conflito de provas — a mesma régua do cliente, depois da véspera", () => {
  const plans = [{ id: "p1", status: "aceite", race_id: "alvo", period_start: "2026-09-01", period_end: "2026-10-20" }];
  const races = [
    { id: "alvo", name: "Maratona", date: "2026-10-20", status: "agendada", race_priority: "a" },
    { id: "meio", name: "Meia", date: "2026-10-04", status: "agendada", race_priority: "a" },
  ];
  const c = pickServerProactive({ raceEvents: races, runs: [], lastRecordDate: TODAY, plans }, TODAY)!;
  assertEquals(c.trigger, "race_conflict");
  assertEquals(c.key, "race_conflict:p1:meio");
  assertEquals(c.conflictRaceNames, ["Meia"]);
  assertEquals(proactiveTab("race_conflict"), "home");
  // Secundária, reconhecida ou fora do bloco: nada.
  assertEquals(detectRaceConflictServer(plans, [races[0], { ...races[1], race_priority: "b" }], TODAY), null);
  assertEquals(detectRaceConflictServer(plans, [races[0], { ...races[1], conflict_acknowledged_at: "2026-09-10" }], TODAY), null);
  assertEquals(detectRaceConflictServer(plans, [races[0], { ...races[1], date: "2026-10-21" }], TODAY), null);
});

Deno.test("P.5: fim de bloco — plano de treino sem prova a acabar, sem outro a seguir", () => {
  const block = { id: "b1", status: "aceite", race_id: null, period_start: "2026-09-06", period_end: "2026-09-20", hasTraining: true };
  const c = pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: TODAY, plans: [block] }, TODAY)!;
  assertEquals(c.trigger, "block_end");
  assertEquals(c.key, "block_end:b1");
  assertEquals(c.blockEnd, "2026-09-20");
  assertEquals(proactiveTab("block_end"), "coach");
  // Mais de 2 dias para o fim: ainda não.
  assertEquals(findEndingBlock([{ ...block, period_end: "2026-09-21" }], TODAY), null);
  // Já há outro bloco (aceite ou proposto) a seguir: não.
  assertEquals(findEndingBlock([block, { id: "b2", status: "proposto", period_end: "2026-10-04", hasTraining: true }], TODAY), null);
  // Plano só de refeições, ou vinculado a prova: não.
  assertEquals(findEndingBlock([{ ...block, hasTraining: false }], TODAY), null);
  assertEquals(findEndingBlock([{ ...block, race_id: "r1" }], TODAY), null);
  // O silêncio fica para depois do fim de bloco.
  assertEquals(pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-10", plans: [block] }, TODAY)?.trigger, "block_end");
});

Deno.test("P.5: os textos novos, sem emoji nem exclamação", () => {
  for (const trigger of ["intervention", "race_conflict", "block_end"] as const) {
    const body = proactivePushMessage({ trigger, key: "k", raceId: null, raceName: null, hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null }).body;
    assertCarolVoice(body);
  }
});

Deno.test("P.6: um momento desligado não esconde os seguintes", () => {
  const races = [{ id: "r1", name: "Meia", date: "2026-09-16", status: "agendada" }];
  // Sem filtro, o balanço sem registo ganha ao silêncio.
  assertEquals(pickServerProactive({ raceEvents: races, runs: [], lastRecordDate: "2026-09-10" }, TODAY)?.trigger, "race_after");
  // Com o balanço desligado, passa ao silêncio em vez de não dizer nada.
  assertEquals(pickServerProactive({ raceEvents: races, runs: [], lastRecordDate: "2026-09-10", allowed: ["silence"] }, TODAY)?.trigger, "silence");
  // Tudo desligado: nada.
  assertEquals(pickServerProactive({ raceEvents: races, runs: [], lastRecordDate: "2026-09-10", allowed: [] }, TODAY), null);
});


Deno.test("listServerProactive: todos os momentos que se aplicam, por prioridade, um por tipo", () => {
  const list = listServerProactive({
    raceEvents: [race({ id: "r2", date: "2026-09-19" }), race({ id: "r0", date: "2026-09-16", status: "concluida" }), race({ id: "rx", date: "2026-09-15", status: "concluida" })],
    runs: [],
    lastRecordDate: "2026-09-10",
    intervention: { status: "needed", reason: "dor no joelho" },
  }, TODAY);
  // Sem o silêncio: o assunto aberto já explica a falta de registos (jaSabePorque, revisão de 2026-09-26).
  assertEquals(list.map((c) => c.trigger), ["intervention", "race_eve", "race_after"]);
  // Só a prova mais recente conta para o "depois da prova".
  assertEquals(list[2].raceId, "r0");
  assertEquals(pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: null }, TODAY), null);
  assertEquals(listServerProactive({ raceEvents: [], runs: [], lastRecordDate: null }, TODAY), []);
});

Deno.test("weekToReviewBounds: segunda e terça, a semana de segunda a domingo que acabou", () => {
  // 2026-09-28 é segunda-feira.
  assertEquals(weekToReviewBounds("2026-09-28"), { weekStart: "2026-09-21", weekEnd: "2026-09-27" });
  assertEquals(weekToReviewBounds("2026-09-29"), { weekStart: "2026-09-21", weekEnd: "2026-09-27" });
  assertEquals(weekToReviewBounds("2026-09-30"), null); // quarta: já é história
  assertEquals(weekToReviewBounds("2026-09-27"), null); // domingo: a semana ainda não acabou
});

Deno.test("findWeekToReview: só com um registo DENTRO da semana revista", () => {
  assertEquals(findWeekToReview("2026-09-28", ["2026-09-24"]), { weekStart: "2026-09-21", weekEnd: "2026-09-27" });
  assertEquals(findWeekToReview("2026-09-28", ["2026-09-21"]), { weekStart: "2026-09-21", weekEnd: "2026-09-27" });
  assertEquals(findWeekToReview("2026-09-28", ["2026-09-27"]), { weekStart: "2026-09-21", weekEnd: "2026-09-27" });
  // Só um registo de hoje (quem começa numa segunda, ou volta de uma ausência): nada.
  assertEquals(findWeekToReview("2026-09-28", ["2026-09-28"]), null);
  assertEquals(findWeekToReview("2026-09-29", ["2026-09-28", "2026-09-29"]), null);
  // Só antes da semana: nada.
  assertEquals(findWeekToReview("2026-09-28", ["2026-09-20"]), null);
  assertEquals(findWeekToReview("2026-09-28", null), null);
});

// Um plano aceite no período, com um treino previsto entretanto: mantém o
// limiar de SILENCE_DAYS (3) — sem ele, o limiar sobe para uma semana
// (SILENCE_DAYS_SEM_PLANO, revisão de 2026-09-26).
const planoDoSilencio = { plans: [{ id: "sp1", status: "aceite", period_start: "2026-09-01", period_end: "2026-10-05" }], planItems: [{ plan_id: "sp1", planned_date: "2026-09-25", kind: "corrida", status: "pendente" }] };

Deno.test("listServerProactive: o balanço só num dia sem mais nenhum momento", () => {
  // Sozinho: sai, com a chave da segunda-feira da semana revista — também à terça.
  const alone = listServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-27", weekRecordDates: ["2026-09-25"] }, "2026-09-29");
  assertEquals(alone.map((c) => c.key), ["week_review:2026-09-21"]);
  assertEquals(alone[0].weekEnd, "2026-09-27");
  // Com um "Estás bem?" no mesmo dia: fica só o silêncio.
  const silent = listServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-23", weekRecordDates: ["2026-09-23"], ...planoDoSilencio }, "2026-09-28");
  assertEquals(silent.map((c) => c.trigger), ["silence"]);
  // No dia da prova: fica só a prova.
  const raceDay = listServerProactive({ raceEvents: [race({ id: "p1", date: "2026-09-29" })], runs: [], lastRecordDate: "2026-09-28", weekRecordDates: ["2026-09-25"] }, "2026-09-29");
  assertEquals(raceDay.map((c) => c.trigger), ["race_morning"]);
  // Um assunto por resolver também fica com o dia.
  const issue = listServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-27", weekRecordDates: ["2026-09-25"], intervention: { status: "needed", reason: "dor" } }, "2026-09-28");
  assertEquals(issue.map((c) => c.trigger), ["intervention"]);
  // Desligado no Perfil: nada.
  assertEquals(listServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-27", weekRecordDates: ["2026-09-25"], allowed: ["silence"] }, "2026-09-28"), []);
  // O "Estás bem?" desligado mas a aplicar-se continua a ficar com o dia: o
  // balanço não sai no lugar dele (a notificação e o chat não discordam).
  assertEquals(listServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-23", weekRecordDates: ["2026-09-23"], allowed: ["week_review"], ...planoDoSilencio }, "2026-09-28"), []);
  assertEquals(proactiveTab("week_review"), "coach");
  const msg = proactivePushMessage(alone[0]);
  assertEquals(msg.title, "Carol");
  assert(!msg.body.includes("!"));
});

// ── P.10: a manhã da prova com hora de partida ──────────────────────────────
// Confirmado pelo produto a 2026-09-24: de 2 h antes da partida (nunca antes
// das 6h) até à partida, e nunca depois do fim da janela do atleta.

Deno.test("P.10: startTimeMinutes lê a hora de partida", () => {
  assertEquals(startTimeMinutes("09:30:00"), 570);
  assertEquals(startTimeMinutes("8:05"), 485);
  assertEquals(startTimeMinutes("24:00"), null);
  assertEquals(startTimeMinutes(null), null);
  assertEquals(startTimeMinutes("manhã"), null);
});

Deno.test("P.10: a manhã da prova leva a hora de partida no candidato", () => {
  const c = pickServerProactive({ raceEvents: [race({ start_time: "09:30:00" })], runs: [], lastRecordDate: TODAY }, TODAY)!;
  assertEquals(c.trigger, "race_morning");
  assertEquals(c.startMinutes, 570);
  assertEquals(pickServerProactive({ raceEvents: [race()], runs: [], lastRecordDate: TODAY }, TODAY)!.startMinutes, null);
});

Deno.test("P.10: com partida às 9:30, entre as 7:30 e a partida — nem antes, nem a meio da prova", () => {
  const at = (h: number, m: number) => ({ minuteOfDay: h * 60 + m, raceStartMinutes: 570 });
  assert(!isWithinProactiveWindow("race_morning", 7, {}, at(7, 7)));
  assert(isWithinProactiveWindow("race_morning", 8, {}, at(8, 7)));
  assert(isWithinProactiveWindow("race_morning", 9, {}, at(9, 7)));
  assert(!isWithinProactiveWindow("race_morning", 9, {}, at(9, 37)));
  assert(!isWithinProactiveWindow("race_morning", 12, {}, at(12, 7)));
});

Deno.test("P.10: nunca antes das 6h, e a janela do atleta não a adianta mais do que 2 h", () => {
  // Partida às 7:00: das 6h (não das 5h) à partida.
  assert(!isWithinProactiveWindow("race_morning", 5, { startHour: 5, endHour: 22 }, { minuteOfDay: 5 * 60 + 7, raceStartMinutes: 420 }));
  assert(isWithinProactiveWindow("race_morning", 6, { startHour: 5, endHour: 22 }, { minuteOfDay: 6 * 60 + 7, raceStartMinutes: 420 }));
  // Partida às 14:00 com a janela das 9h: só a partir do meio-dia (era às 9h).
  assert(!isWithinProactiveWindow("race_morning", 9, {}, { minuteOfDay: 9 * 60 + 7, raceStartMinutes: 840 }));
  assert(isWithinProactiveWindow("race_morning", 12, {}, { minuteOfDay: 12 * 60 + 7, raceStartMinutes: 840 }));
  // Partida às 6:00: não há um minuto antes dela a partir das 6h.
  assert(!isWithinProactiveWindow("race_morning", 6, {}, { minuteOfDay: 6 * 60 + 7, raceStartMinutes: 360 }));
});

Deno.test("P.10: uma prova à noite respeita o fim da janela", () => {
  // Partida às 22:00, janela até às 21h: das 20h às 21h.
  assert(isWithinProactiveWindow("race_morning", 20, {}, { minuteOfDay: 20 * 60 + 7, raceStartMinutes: 22 * 60 }));
  assert(!isWithinProactiveWindow("race_morning", 21, {}, { minuteOfDay: 21 * 60 + 7, raceStartMinutes: 22 * 60 }));
});

Deno.test("P.10: sem hora de partida fica a regra de antes", () => {
  assert(isWithinProactiveWindow("race_morning", 6, {}, { minuteOfDay: 6 * 60 + 7, raceStartMinutes: null }));
  assert(isWithinProactiveWindow("race_morning", 6));
});

Deno.test("P.10: as chaves que o Início calcula são as do servidor", () => {
  const c = pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: TODAY, intervention: { status: "needed", reason: "Check-in: dor 6/10" } }, TODAY)!;
  assertEquals(interventionKey("Check-in: dor 6/10"), c.key);
  assertEquals(raceConflictKey("p1", ["r3", "r2"]), "race_conflict:p1:r2,r3");
});

// ── P.10, entrega 2: o treino de ontem por registar ─────────────────────────

const plan = { id: "p1", status: "aceite", period_start: "2026-09-01", period_end: "2026-09-30", hasTraining: true };
const ontem = (over: Record<string, unknown> = {}) => ({
  plan_id: "p1", planned_date: "2026-09-17", kind: "corrida", status: "pendente", training_type: "longo", created_at: "2026-09-01T10:00:00Z", ...over,
});
// TODAY é sexta, 2026-09-18: não há balanço da semana.
const missedInput = (over: Record<string, unknown> = {}) => ({
  raceEvents: [], runs: [], lastRecordDate: "2026-09-17", plans: [plan], planItems: [ontem()], trainingDates: [], ...over,
});

Deno.test("P.10: o treino de ontem pendente e sem registo é um momento, com chave pelo dia", () => {
  const list = listServerProactive(missedInput(), TODAY);
  assertEquals(list.map((c) => c.key), ["missed_workout:2026-09-17"]);
  assertEquals(list[0].anchorDate, "2026-09-17");
  // Nomear o treino (revisão de 2026-09-26): "o treino" genérico soava a
  // automatismo — ontem() é uma corrida (longo), missedWorkoutLabel devolve isso.
  assertEquals(list[0].missedLabel, "corrida (longo)");
  assertEquals(proactivePushMessage(list[0]).body, "Não vi o treino de ontem (corrida (longo)) registado. Aconteceu alguma coisa?");
  assertCarolVoice(proactivePushMessage(list[0]).body);
  assert(ALL_PROACTIVE_TRIGGERS.includes("missed_workout"));
});

Deno.test("P.10: não conta se houve corrida ou ginásio registado ontem, ou se o item já não está pendente", () => {
  assertEquals(findMissedWorkout(missedInput({ trainingDates: ["2026-09-17"] }), TODAY), null);
  assertEquals(findMissedWorkout(missedInput({ planItems: [ontem({ status: "concluido" })] }), TODAY), null);
  assertEquals(findMissedWorkout(missedInput({ planItems: [ontem({ kind: "descanso" })] }), TODAY), null);
  // Um plano só proposto não conta.
  assertEquals(findMissedWorkout(missedInput({ plans: [{ ...plan, status: "proposto" }] }), TODAY), null);
});

Deno.test("P.10: nunca num dia de prova, nem pelo item que é a própria prova", () => {
  assertEquals(findMissedWorkout(missedInput({ raceEvents: [race()] }), TODAY), null);
  assertEquals(findMissedWorkout(missedInput({ planItems: [ontem({ training_type: "prova" })] }), TODAY), null);
});

Deno.test("P.10: o que foi planeado antes da última reescrita do plano já foi visto por ela", () => {
  // Um item criado hoje: o plano foi reescrito depois do treino de ontem.
  const reescrito = [ontem(), { plan_id: "p1", planned_date: "2026-09-20", kind: "corrida", status: "pendente", created_at: "2026-09-18T08:00:00Z" }];
  assertEquals(findMissedWorkout(missedInput({ planItems: reescrito }), TODAY), null);
});

Deno.test("P.10: à segunda, o balanço da semana fica com o dia — o treino de domingo é assunto dele", () => {
  const monday = "2026-09-21";
  const domingo = missedInput({ lastRecordDate: "2026-09-19", planItems: [ontem({ planned_date: "2026-09-20" })], weekRecordDates: ["2026-09-16"] });
  assertEquals(listServerProactive(domingo, monday).map((c) => c.trigger), ["week_review"]);
  // Sem registos nessa semana, não há balanço: vale a pergunta.
  assertEquals(listServerProactive({ ...domingo, weekRecordDates: [] }, monday).map((c) => c.trigger), ["missed_workout"]);
});

Deno.test("P.10: à terça, o treino de segunda entra a seguir ao balanço — já é da semana nova", () => {
  // Revisão pré-deploy de 2026-09-25: à terça o balanço continuava na lista e
  // tapava o treino de segunda, que à quarta já era de anteontem.
  const tuesday = "2026-09-22";
  // Registou uma refeição na segunda (sem silêncio), mas não o treino.
  const segunda = missedInput({ lastRecordDate: "2026-09-21", planItems: [ontem({ planned_date: "2026-09-21" })], weekRecordDates: ["2026-09-16"] });
  const list = listServerProactive(segunda, tuesday);
  assertEquals(list.map((c) => c.key), ["week_review:2026-09-14", "missed_workout:2026-09-21"]);
  assertEquals(missedWorkoutInReview("2026-09-20", { weekStart: "2026-09-14", weekEnd: "2026-09-20" }), true);
  assertEquals(missedWorkoutInReview("2026-09-21", { weekStart: "2026-09-14", weekEnd: "2026-09-20" }), false);
  assertEquals(missedWorkoutInReview("2026-09-20", null), false);
});

Deno.test("P.10: o silêncio vem antes do treino de ontem", () => {
  const list = listServerProactive(missedInput({ lastRecordDate: "2026-09-10" }), TODAY);
  assertEquals(list.map((c) => c.trigger), ["silence", "missed_workout"]);
});

// ── P.10, entrega 2: o silêncio com check-ins ──────────────────────────────

// Um plano aceite no período (2026-09-15 a 17), com um treino previsto: sem
// ele, o limiar sobe para SILENCE_DAYS_SEM_PLANO e o gap de 4 dias destes
// testes deixaria de acionar o silêncio (revisão de 2026-09-26).
const planoDaJanela = { plans: [{ id: "sp2", status: "aceite", period_start: "2026-09-01", period_end: "2026-09-30" }], planItems: [{ plan_id: "sp2", planned_date: "2026-09-16", kind: "corrida", status: "pendente" }] };

Deno.test("P.10: com check-in depois do último registo, o silêncio fala dos treinos — os dias contam do último treino", () => {
  const c = pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-14", lastCheckinDate: "2026-09-17", lastTrainingDate: "2026-09-08", ...planoDaJanela }, TODAY)!;
  assertEquals(c.key, "silence:2026-09-14");
  assertEquals(c.lastCheckinDate, "2026-09-17");
  assertEquals(c.trainingSilenceDays, 10);
  const body = proactivePushMessage(c).body;
  assertEquals(body, "Não vejo nenhum treino teu há 10 dias. Está tudo bem?");
  assertCarolVoice(body);
  // Sem nenhum treino registado não há dias a contar: os 4 dias eram desde a
  // última refeição, e o chat diz "não há treinos registados" (revisão
  // pré-deploy de 2026-09-25).
  const semTreino = pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-14", lastCheckinDate: "2026-09-17", lastTrainingDate: null, ...planoDaJanela }, TODAY)!;
  assertEquals(semTreino.trainingSilenceDays, null);
  assertEquals(proactivePushMessage(semTreino).body, "Ainda não vejo nenhum treino teu registado. Está tudo bem?");
  assertCarolVoice(proactivePushMessage(semTreino).body);
});

Deno.test("P.10: um check-in antigo não muda nada", () => {
  const c = pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-14", lastCheckinDate: "2026-09-12", lastTrainingDate: "2026-09-14", ...planoDaJanela }, TODAY)!;
  assertEquals(c.lastCheckinDate, undefined);
  // Com o plano da janela, diz o treino que o plano tinha — pergunta, não
  // acusa: pode ter treinado sem registar (revisão de 2026-09-26).
  assertEquals(proactivePushMessage(c).body, "O plano tinha 1 treino desde terça e não o vejo registado. Está tudo bem?");
});

// ── A Vitrina (2026-09-25) ────────────────────────────────────────────────
const RUI_SEG = { ageBand: "M40", gender: "M", terrain: "estrada" };
const vsnap = (age_band: string, window_start: string) =>
  ({ age_band, gender: "M", terrain: "estrada", window_start, window_end: "x" });
const vitrinaInput = (over: Record<string, unknown> = {}) => ({
  snapshots: [vsnap("M40", "2026-08-31")],
  own: RUI_SEG,
  statsPoolConsent: true,
  leaderboardConsent: true,
  leaderboardEntries: [{ window_start: "2026-08-31", rank: 2 }],
  ...over,
});

Deno.test("Vitrina: tabelas e percentil entram no fim, depois do treino por registar, com frases fixas na voz dela", () => {
  const list = listServerProactive(missedInput({ vitrina: vitrinaInput() }), TODAY);
  assertEquals(list.map((c) => c.key), [
    "missed_workout:2026-09-17",
    "leaderboard:entrou:2026-08-31",
    "percentile_ready:meu:M40.M.estrada",
  ]);
  const board = list[1];
  assertEquals(board.vitrinaStage, "entrou");
  assertEquals(board.leaderboardRank, 2);
  // A posição fica no candidato (para o chat), nunca na notificação.
  const body = proactivePushMessage(board).body;
  assertEquals(body, "Entraste nas tabelas do teu escalão. Vem ver onde ficaste.");
  assert(!/\d/.test(body));
  for (const c of list.slice(1)) assertCarolVoice(proactivePushMessage(c).body);
  assertEquals(proactiveTab("leaderboard"), "coach");
  assert(ALL_PROACTIVE_TRIGGERS.includes("leaderboard") && ALL_PROACTIVE_TRIGGERS.includes("percentile_ready"));
});

Deno.test("Vitrina: não tira o dia ao balanço da semana (entra depois de ele ser decidido)", () => {
  // Segunda-feira 2026-09-21, com registos na semana revista: o balanço sai, e a Vitrina a seguir.
  const list = listServerProactive({
    raceEvents: [], runs: [], lastRecordDate: "2026-09-20", weekRecordDates: ["2026-09-16"],
    vitrina: vitrinaInput({ leaderboardEntries: [] }),
  }, "2026-09-21");
  assertEquals(list.map((c) => c.trigger), ["week_review", "percentile_ready"]);
});

Deno.test("Vitrina: saiu das tabelas e 'perto' — as outras frases fixas, sem números", () => {
  const saiu = listServerProactive({
    raceEvents: [], runs: [], lastRecordDate: TODAY,
    vitrina: vitrinaInput({ snapshots: [vsnap("M40", "2026-09-14")], leaderboardEntries: [{ window_start: "2026-08-31", rank: 9 }] }),
  }, TODAY).find((c) => c.trigger === "leaderboard")!;
  assertEquals(saiu.key, "leaderboard:saiu:2026-09-14");
  // Sai à terça, sobre a quinzena que fechou — "nesta" já era a nova (revisão de 2026-09-26).
  assertEquals(proactivePushMessage(saiu).body, "Na quinzena que fechou saíste das tabelas do teu escalão. Vem ver comigo o que mudou.");

  const perto = listServerProactive({
    raceEvents: [], runs: [], lastRecordDate: TODAY,
    vitrina: vitrinaInput({ snapshots: [vsnap("M45", "2026-09-14")], leaderboardEntries: [] }),
  }, TODAY);
  assertEquals(perto.map((c) => c.key), ["percentile_ready:perto:M40.M.estrada"]);
  assertEquals(proactivePushMessage(perto[0]).body, "O teu escalão ainda não tem números, mas o escalão ao lado já tem. Vem ver onde ficas nesse.");
  assertCarolVoice(proactivePushMessage(perto[0]).body);
});

Deno.test("Vitrina: desligados no Perfil, não entram; sem consentimento, nem existem", () => {
  const base = { raceEvents: [], runs: [], lastRecordDate: TODAY };
  assertEquals(listServerProactive({ ...base, vitrina: vitrinaInput(), allowed: ["silence"] }, TODAY), []);
  assertEquals(listServerProactive({ ...base, vitrina: vitrinaInput({ statsPoolConsent: false, leaderboardConsent: false }) }, TODAY), []);
});

// ── Revisão de 2026-09-26: contexto antes de perguntar ──────────────────────
// P.10 e P.5 juntos: uma corrida no dia da prova ainda por ligar, o plano no
// período do silêncio a nomear os treinos, e a dor/o assunto aberto a calar
// perguntas cuja resposta ela já sabe — sempre com a mesma tónica: nunca
// perguntar o que o contexto já responde.

Deno.test("race_after: uma corrida nesse dia sem race_id nem kind competicao pede para a ligar, não o registo", () => {
  const races = [race({ status: "concluida", date: "2026-09-15" })];
  const runs = [{ id: "run1", date: "2026-09-15", kind: "normal", race_id: null }];
  const c = pickServerProactive({ raceEvents: races, runs, lastRecordDate: TODAY }, TODAY)!;
  assertEquals(c.trigger, "race_after");
  assertEquals(c.unlinkedRun, true);
  assertEquals(c.hasRun, true);
  assertEquals(proactivePushMessage(c).body, "Vi uma corrida no dia da prova Meia de Lisboa. É ela? Vem confirmar e faço o balanço contigo.");
  assertCarolVoice(proactivePushMessage(c).body);
});

Deno.test("silenceCandidate: a mesma régua do servidor, para o cliente nunca discordar", () => {
  const plans = [{ id: "sp3", status: "aceite", period_start: "2026-09-01", period_end: "2026-09-30" }];
  const planItems = [
    { plan_id: "sp3", planned_date: "2026-09-15", kind: "corrida", status: "pendente" },
    { plan_id: "sp3", planned_date: "2026-09-16", kind: "ginasio", status: "pendente" },
  ];
  const c = silenceCandidate({ raceEvents: [], runs: [], lastRecordDate: "2026-09-14", plans, planItems }, TODAY)!;
  assertEquals(c.plannedTrainingsSince, 2);
  assert(c.sinceWeekday);
  assertEquals(proactivePushMessage(c).body, `O plano tinha 2 treinos desde ${c.sinceWeekday} e não vejo nenhum registado. Está tudo bem?`);
  // Plano no período, mas nenhum treino previsto (descanso decidido): não é assunto.
  const descanso = silenceCandidate({ raceEvents: [], runs: [], lastRecordDate: "2026-09-14", plans, planItems: [] }, TODAY);
  assertEquals(descanso, null);
});

Deno.test("missedWorkoutLabel: nomeia o tipo, não só 'treino'", () => {
  assertEquals(missedWorkoutLabel([{ kind: "corrida", training_type: "longo" }]), "corrida (longo)");
  assertEquals(missedWorkoutLabel([{ kind: "ginasio", training_type: null }]), "ginásio");
  assertEquals(missedWorkoutLabel([{ kind: "corrida", training_type: "intervalado" }, { kind: "ginasio", training_type: "força" }]), "corrida (intervalado) + ginásio (força)");
});

Deno.test("jaSabePorque: dor acima do alarme, ou assunto já aberto, calam o silêncio e o treino de ontem por registar", () => {
  const semPlano = { raceEvents: [], runs: [], lastRecordDate: "2026-09-10" };
  // A dor conta se o check-in é de hoje ou de ontem.
  assertEquals(listServerProactive({ ...semPlano, lastCheckinPain: 6, lastCheckinDate: "2026-09-17" }, TODAY).some((c) => c.trigger === "silence"), false);
  // Uma dor de há semanas, sem nada depois, não cala o "Estás bem?" para sempre.
  assertEquals(listServerProactive({ ...semPlano, lastCheckinPain: 6, lastCheckinDate: "2026-08-01" }, TODAY).some((c) => c.trigger === "silence"), true);
  assertEquals(listServerProactive({ ...semPlano, lastCheckinPain: 6 }, TODAY).some((c) => c.trigger === "silence"), true);
  assertEquals(listServerProactive({ ...semPlano, intervention: { status: "in_progress", reason: "x" } }, TODAY).some((c) => c.trigger === "silence"), false);
  // Sem dor nem assunto, o silêncio continua a valer.
  assertEquals(listServerProactive(semPlano, TODAY).some((c) => c.trigger === "silence"), true);

  const comMissed = missedInput({ lastCheckinPain: 5, lastCheckinDate: TODAY });
  assertEquals(listServerProactive(comMissed, TODAY).some((c) => c.trigger === "missed_workout"), false);
  assertEquals(listServerProactive(missedInput(), TODAY).some((c) => c.trigger === "missed_workout"), true);
});

// ── Revisão de 2026-09-26: as frases das notificações ──────────────────────
// specs/carol-frases-contexto.md: cada frase diz o que o contexto já sabe, e
// não sai quando deixou de ser verdade.

Deno.test("manhã da prova: o ritmo do primeiro km só com plano de ritmo; sem hora de partida, não sai a partir das 10h", () => {
  const comPlano = pickServerProactive({ raceEvents: [race({ start_time: "09:30:00", distance_km: 21.1, target_time_seconds: 6300 })], runs: [], lastRecordDate: TODAY }, TODAY)!;
  assertEquals(comPlano.hasFirstKmPace, true);
  assertEquals(proactivePushMessage(comPlano).body, "Hoje é dia de prova: Meia de Lisboa. Deixei-te o ritmo do primeiro km.");
  // Sem objetivo não há plano de ritmo: não se promete o ritmo.
  const semPlano = pickServerProactive({ raceEvents: [race({ start_time: "09:30:00", distance_km: 21.1 })], runs: [], lastRecordDate: TODAY }, TODAY)!;
  assertEquals(semPlano.hasFirstKmPace, false);
  assertEquals(proactivePushMessage(semPlano).body, "Hoje é dia de prova: Meia de Lisboa. Fala comigo antes da partida.");
  for (const c of [comPlano, semPlano]) assertCarolVoice(proactivePushMessage(c).body);
  // Sem hora de partida: às 9h ainda sai; às 10h a prova pode já estar a decorrer.
  assert(isWithinProactiveWindow("race_morning", 9));
  assert(!isWithinProactiveWindow("race_morning", 10));
  assert(!isWithinProactiveWindow("race_morning", 10, { startHour: 10, endHour: 22 }));
  assert(!isWithinProactiveWindow("race_morning", 23, { startHour: 22, endHour: 2 }));
  // Com hora de partida manda a partida: uma prova às 14h recebe-a ao meio-dia.
  assert(isWithinProactiveWindow("race_morning", 12, {}, { minuteOfDay: 12 * 60 + 7, raceStartMinutes: 840 }));
});

Deno.test("véspera: a partida à tarde entra na frase, sem hora não há 'de manhã', e de madrugada não sai", () => {
  const tarde = pickServerProactive({ raceEvents: [race({ name: "São Silvestre", date: "2026-09-19", start_time: "17:30:00" })], runs: [], lastRecordDate: TODAY }, TODAY)!;
  assertEquals(tarde.startMinutes, 1050);
  assertEquals(proactivePushMessage(tarde).body, "Amanhã é dia de prova: São Silvestre, partida às 17:30. Tenho o plano para hoje à noite e para amanhã até à partida.");
  const manha = pickServerProactive({ raceEvents: [race({ date: "2026-09-19", start_time: "09:00" })], runs: [], lastRecordDate: TODAY }, TODAY)!;
  assertEquals(proactivePushMessage(manha).body, "Amanhã é dia de prova: Meia de Lisboa. Tenho o plano para hoje à noite e para amanhã de manhã.");
  const semHora = pickServerProactive({ raceEvents: [race({ date: "2026-09-19" })], runs: [], lastRecordDate: TODAY }, TODAY)!;
  assertEquals(semHora.startMinutes, null);
  assertEquals(proactivePushMessage(semHora).body, "Amanhã é dia de prova: Meia de Lisboa. Tenho o plano para hoje à noite e para amanhã.");
  for (const c of [tarde, manha, semHora]) assertCarolVoice(proactivePushMessage(c).body);
  // Nem numa janela que atravessa a meia-noite, nem numa que começa às 5h.
  assert(isWithinProactiveWindow("race_eve", 23, { startHour: 22, endHour: 2 }));
  assert(!isWithinProactiveWindow("race_eve", 0, { startHour: 22, endHour: 2 }));
  assert(!isWithinProactiveWindow("race_eve", 5, { startHour: 5, endHour: 22 }));
  assert(isWithinProactiveWindow("race_eve", 6, { startHour: 5, endHour: 22 }));
});

Deno.test("depois da prova: o nome por omissão não é nome — diz-se o dia e a distância", () => {
  // TODAY (2026-09-18) é sexta; 2026-09-13 foi domingo.
  const corrida = { id: "run9", race_id: "r1", date: "2026-09-13" };
  for (const nome of ["Corrida de Hoje", "Prova", " ", null]) {
    const c = pickServerProactive({ raceEvents: [race({ name: nome, date: "2026-09-13", distance_km: 10 })], runs: [corrida], lastRecordDate: TODAY }, TODAY)!;
    assertEquals(proactivePushMessage(c).body, "Vi o registo da tua prova de domingo, 10 km. Quero fazer o balanço contigo.");
  }
  const ontem = pickServerProactive({ raceEvents: [race({ name: "corrida de hoje", date: "2026-09-17", distance_km: 21.1 })], runs: [{ ...corrida, date: "2026-09-17" }], lastRecordDate: TODAY }, TODAY)!;
  assertEquals(proactivePushMessage(ontem).body, "Vi o registo da tua prova de ontem, 21,1 km. Quero fazer o balanço contigo.");
  assertCarolVoice(proactivePushMessage(ontem).body);
  // Com nome próprio, fica o nome.
  const nomeada = pickServerProactive({ raceEvents: [race({ date: "2026-09-13", distance_km: 10 })], runs: [corrida], lastRecordDate: TODAY }, TODAY)!;
  assertEquals(proactivePushMessage(nomeada).body, "Vi o registo da prova Meia de Lisboa. Quero fazer o balanço contigo.");
});

Deno.test("silêncio: com água registada depois do último registo, não é 'nada teu'", () => {
  const semPlano = { raceEvents: [], runs: [], lastRecordDate: "2026-09-10" };
  const c = pickServerProactive({ ...semPlano, lastWaterDate: "2026-09-17" }, TODAY)!;
  assertEquals(c.key, "silence:2026-09-10");
  assertEquals(c.lastWaterDate, "2026-09-17");
  assertEquals(proactivePushMessage(c).body, "Vejo a água registada, mas nenhum treino nem refeição há 8 dias. Está tudo bem?");
  assertCarolVoice(proactivePushMessage(c).body);
  // Água de antes do último registo não diz nada de novo.
  const antiga = pickServerProactive({ ...semPlano, lastWaterDate: "2026-09-09" }, TODAY)!;
  assertEquals(antiga.lastWaterDate, undefined);
  assertEquals(proactivePushMessage(antiga).body, "Não vejo nada teu há 8 dias. Estás bem?");
  // Com um check-in depois do último registo, manda o check-in.
  const comCheckin = pickServerProactive({ ...semPlano, lastWaterDate: "2026-09-17", lastCheckinDate: "2026-09-16", lastTrainingDate: "2026-09-08" }, TODAY)!;
  assertEquals(proactivePushMessage(comCheckin).body, "Não vejo nenhum treino teu há 10 dias. Está tudo bem?");
});

Deno.test("assunto por resolver: a frase diz de onde veio, nunca o motivo, e não espera por 'quando puderes'", () => {
  const msg = (reason: string, origin?: string) =>
    proactivePushMessage(pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: TODAY, intervention: { status: "needed", reason, origin } }, TODAY)!).body;
  const bodies = [
    msg("Check-in de 2026-09-17: Dor 7/10 (joelho)."),
    msg("[carga] Carga de corrida: 30 km nos últimos 7 dias, quando o plano previa 16 km; a média das últimas 4 semanas é 12,5 km/semana (ACWR 2,4)."),
    msg("[carga] Carga de corrida: 30 km nos últimos 7 dias, sem corridas no plano para esses dias; a média das últimas 4 semanas é 12,5 km/semana (ACWR 2,4)."),
    msg("[objetivos] Os objetivos precisam de revisão."),
    // A origem guardada, quando vem, manda.
    msg("Dor no joelho", "checkin"),
  ];
  assertEquals(bodies, [
    "Li o teu check-in. Quero falar contigo antes do próximo treino.",
    "A carga destes dias subiu acima do plano. Quero ver isso contigo antes do próximo treino.",
    "A carga destes dias subiu acima do habitual. Quero ver isso contigo antes do próximo treino.",
    "Quero falar contigo antes do próximo treino.",
    "Li o teu check-in. Quero falar contigo antes do próximo treino.",
  ]);
  for (const b of bodies) {
    assert(!/dor|joelho|quando puderes/i.test(b));
    assertCarolVoice(b);
  }
});

Deno.test("conflito de provas: nomeia a outra principal; com mais do que uma, conta-as", () => {
  const plans = [{ id: "p1", status: "aceite", race_id: "alvo", period_start: "2026-09-01", period_end: "2026-10-20" }];
  const alvo = { id: "alvo", name: "Maratona", date: "2026-10-20", status: "agendada", race_priority: "a" };
  const meia = { id: "meio", name: "Meia", date: "2026-10-04", status: "agendada", race_priority: "a" };
  const body = (raceEvents: TriggerRace[]) =>
    proactivePushMessage(pickServerProactive({ raceEvents, runs: [], lastRecordDate: TODAY, plans }, TODAY)!).body;
  assertEquals(body([alvo, meia]), "Há outra prova principal a meio deste bloco: Meia. Temos de decidir qual é o objetivo.");
  assertEquals(body([alvo, { ...meia, name: null }]), "Há outra prova principal a meio deste bloco. Temos de decidir qual é o objetivo.");
  assertEquals(body([alvo, meia, { ...meia, id: "meio2", name: "10K do Porto", date: "2026-10-11" }]), "Tens mais duas provas principais a meio deste bloco. Temos de decidir qual é o objetivo.");
});

Deno.test("Vitrina 'perto': diz qual é o grupo que já tem números, sem 'grupos ao lado'", () => {
  const perto = (snapshots: Record<string, string>[], own = RUI_SEG) => listServerProactive({
    raceEvents: [], runs: [], lastRecordDate: TODAY,
    vitrina: vitrinaInput({ own, snapshots, leaderboardEntries: [] }),
  }, TODAY).find((c) => c.trigger === "percentile_ready")!;
  // Prepara trail; o escalão dele em estrada já tem.
  const trail = perto([vsnap("M40", "2026-09-14")], { ...RUI_SEG, terrain: "trail" });
  assertEquals(trail.nearSegment, { step: "modalidade", terrain: "estrada", gender: "M" });
  const bodies = [
    proactivePushMessage(trail).body,
    proactivePushMessage(perto([vsnap("M45", "2026-09-14")])).body,
    proactivePushMessage(perto([{ age_band: "F40", gender: "F", terrain: "estrada", window_start: "2026-09-14", window_end: "x" }])).body,
  ];
  assertEquals(bodies, [
    "O teu escalão ainda não tem números, mas o de estrada já tem. Vem ver onde ficas nesse.",
    "O teu escalão ainda não tem números, mas o escalão ao lado já tem. Vem ver onde ficas nesse.",
    "O teu escalão ainda não tem números, mas o feminino da tua idade já tem. Vem ver onde ficas nesse.",
  ]);
  for (const b of bodies) {
    assert(!b.includes("grupos ao lado"));
    assertCarolVoice(b);
  }
});

/* Fase 0 do Troféu (2026-09-26): duas provas no mesmo dia — uma de treino ou
   uma jornada de taça e a principal. A véspera e a manhã são da principal,
   seja qual for a ordem em que as provas chegam. */
Deno.test("véspera e manhã: com duas provas no mesmo dia, a principal ganha (em qualquer ordem)", () => {
  const treino = race({ id: "z-treino", name: "Corrida do clube", race_priority: "c" });
  const principal = race({ id: "a-principal", name: "Meia de Lisboa", race_priority: "a" });
  for (const raceEvents of [[treino, principal], [principal, treino]]) {
    assertEquals(pickServerProactive({ raceEvents, runs: [], lastRecordDate: TODAY }, TODAY)?.key, "race_morning:a-principal");
    const amanha = raceEvents.map((r) => ({ ...r, date: "2026-09-19" }));
    assertEquals(pickServerProactive({ raceEvents: amanha, runs: [], lastRecordDate: TODAY }, TODAY)?.key, "race_eve:a-principal");
  }
  // Sem race_priority conta como principal (o default da coluna): contra uma 'b', ganha.
  const semPrioridade = race({ id: "z-sem", race_priority: null });
  const b = race({ id: "a-b", race_priority: "b" });
  assertEquals(pickServerProactive({ raceEvents: [b, semPrioridade], runs: [], lastRecordDate: TODAY }, TODAY)?.key, "race_morning:z-sem");
  // Duas do mesmo nível: pelo id, sem depender da ordem do select.
  const b2 = race({ id: "b-b", race_priority: "b" });
  assertEquals(pickServerProactive({ raceEvents: [b2, b], runs: [], lastRecordDate: TODAY }, TODAY)?.key, "race_morning:a-b");
  // Uma principal já concluída não conta: fica a outra do dia.
  assertEquals(pickServerProactive({ raceEvents: [{ ...principal, status: "concluida" }, treino], runs: [], lastRecordDate: TODAY }, TODAY)?.key, "race_morning:z-treino");
});

/* Fase 0 do Troféu (2026-09-26): o "como correu?" com corrida fica na lista
   7 dias, mesmo depois de dito. Já entregue, não tira o dia ao balanço da
   semana; por entregar, continua a tirar. */
Deno.test("balanço da semana: o \"como correu?\" com corrida já entregue deixa-o sair", () => {
  const monday = "2026-09-28";
  const prova = race({ id: "p1", date: "2026-09-26", status: "concluida" });
  const runs = [{ id: "run1", race_id: "p1", date: "2026-09-26", created_at: "2026-09-26T12:00:00Z" }];
  const base = { runs, lastRecordDate: "2026-09-27", weekRecordDates: ["2026-09-26"] };
  // Por entregar: fica só o balanço da prova, como antes.
  assertEquals(listServerProactive({ ...base, raceEvents: [prova] }, monday).map((c) => c.trigger), ["race_after"]);
  // Entregue pelo log (só o tick o tem): os dois, o da prova primeiro (decide.ts cala-o).
  const pelaChave = listServerProactive({ ...base, raceEvents: [prova], deliveredKeys: ["race_after:p1:run1"] }, monday);
  assertEquals(pelaChave.map((c) => c.key), ["race_after:p1:run1", "week_review:2026-09-21"]);
  // Entregue pelo balanço gravado na prova (o que o cliente também vê).
  const peloBalanco = listServerProactive({ ...base, raceEvents: [{ ...prova, coach_balance: "Foi uma boa prova." }] }, monday);
  assertEquals(peloBalanco.map((c) => c.trigger), ["race_after", "week_review"]);
  // A chave de outra corrida não conta como entregue.
  assertEquals(listServerProactive({ ...base, raceEvents: [prova], deliveredKeys: ["race_after:p1:outra"] }, monday).map((c) => c.trigger), ["race_after"]);
  // O "como correu?" SEM registo continua a ficar com o dia, mesmo com a chave entregue.
  const semRegisto = listServerProactive({ runs: [], lastRecordDate: "2026-09-27", weekRecordDates: ["2026-09-25"], raceEvents: [race({ id: "p2", date: "2026-09-27" })], deliveredKeys: ["race_after:p2:sem-registo"] }, monday);
  assertEquals(semRegisto.map((c) => c.trigger), ["race_after"]);
  // Outro momento no mesmo dia continua a mandar: um assunto por resolver tapa o balanço.
  const comDor = listServerProactive({ ...base, raceEvents: [prova], deliveredKeys: ["race_after:p1:run1"], intervention: { status: "needed", reason: "dor" } }, monday);
  assertEquals(comDor.map((c) => c.trigger), ["intervention", "race_after"]);
});

/* Revisão pré-deploy de 2026-09-26: o treino de ontem feito hoje de manhã
   (pelo "+") não é "por registar", e de madrugada não se pergunta por
   "ontem"; e um bloco que acabou a meio do silêncio não o cala para sempre. */
Deno.test("treino de ontem: feito hoje não se pergunta, e nunca antes das 6h", () => {
  assertEquals(findMissedWorkout(missedInput({ trainingDates: [TODAY] }), TODAY), null);
  assert(!isWithinProactiveWindow("missed_workout", 0, { startHour: 22, endHour: 2 }));
  assert(!isWithinProactiveWindow("missed_workout", 5, { startHour: 5, endHour: 22 }));
  assert(isWithinProactiveWindow("missed_workout", 9));
});

Deno.test("silêncio: um plano que acabou antes de ontem não conta como plano em vigor", () => {
  const acabou = [{ id: "velho", status: "aceite", period_start: "2026-08-15", period_end: "2026-09-14" }];
  // Último registo a 14/09, hoje 18/09: o bloco não está em vigor — sem plano, 7 dias.
  assertEquals(silenceCandidate({ raceEvents: [], runs: [], lastRecordDate: "2026-09-14", plans: acabou, planItems: [] }, TODAY), null);
  // Doze dias depois, o "Estás bem?" sai (antes calava-se para sempre).
  const c = silenceCandidate({ raceEvents: [], runs: [], lastRecordDate: "2026-09-06", plans: acabou, planItems: [] }, TODAY);
  assertEquals(c?.trigger, "silence");
  assertEquals(c?.plannedTrainingsSince, undefined);
});
