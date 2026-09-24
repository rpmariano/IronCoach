import { assert, assertEquals } from "jsr:@std/assert@1";
import { findRaceRunServer, isWithinProactiveWindow, pickServerProactive, listServerProactive, proactivePushMessage, proactiveTab, shortHash, findEndingBlock, detectRaceConflictServer, findWeekToReview } from "./proactiveTriggers.ts";

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

Deno.test("silêncio: 3 dias sem registo; a chave leva o dia do último registo", () => {
  const c = pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-14" }, TODAY);
  assertEquals(c, { trigger: "silence", key: "silence:2026-09-14", raceId: null, raceName: null, hasRun: false, silenceDays: 4, anchorDate: "2026-09-14", anchorAt: null });
  assertEquals(pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-16" }, TODAY), null);
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
    "Hoje é dia de prova: Meia de Lisboa. Tenho duas coisas para te dizer antes da partida.",
    "Amanhã é dia de prova. Tenho o plano para hoje à noite e para amanhã de manhã.",
    "Vi o registo da prova Meia de Lisboa. Quero fazer o balanço contigo.",
    "Como correu a prova? Conta-me, e regista a corrida.",
    "Não vejo nada teu há 8 dias. Estás bem?",
  ]);
  for (const b of bodies) {
    assert(!/\p{Extended_Pictographic}/u.test(b), b);
    assert(!b.includes("!"), b);
  }
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
    assert(!/\p{Extended_Pictographic}/u.test(body), body);
    assert(!body.includes("!"), body);
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
  assertEquals(list.map((c) => c.trigger), ["intervention", "race_eve", "race_after", "silence"]);
  // Só a prova mais recente conta para o "depois da prova".
  assertEquals(list[2].raceId, "r0");
  assertEquals(pickServerProactive({ raceEvents: [], runs: [], lastRecordDate: null }, TODAY), null);
  assertEquals(listServerProactive({ raceEvents: [], runs: [], lastRecordDate: null }, TODAY), []);
});

Deno.test("findWeekToReview: segunda e terça, a semana de segunda a domingo que acabou", () => {
  // 2026-09-28 é segunda-feira.
  assertEquals(findWeekToReview("2026-09-28", "2026-09-27"), { weekStart: "2026-09-21", weekEnd: "2026-09-27" });
  assertEquals(findWeekToReview("2026-09-29", "2026-09-22"), { weekStart: "2026-09-21", weekEnd: "2026-09-27" });
  // Quarta: já é história.
  assertEquals(findWeekToReview("2026-09-30", "2026-09-29"), null);
  // Domingo: a semana ainda não acabou.
  assertEquals(findWeekToReview("2026-09-27", "2026-09-27"), null);
  // Nada registado desde o início da semana: o momento é o silêncio.
  assertEquals(findWeekToReview("2026-09-28", "2026-09-20"), null);
  assertEquals(findWeekToReview("2026-09-28", null), null);
});

Deno.test("listServerProactive: o balanço da semana é o último da lista, com a chave da segunda-feira", () => {
  const list = listServerProactive({ raceEvents: [], runs: [], lastRecordDate: "2026-09-23" }, "2026-09-28");
  assertEquals(list.map((c) => c.trigger), ["silence", "week_review"]);
  assertEquals(list[1].key, "week_review:2026-09-21");
  assertEquals(proactiveTab("week_review"), "coach");
  const msg = proactivePushMessage(list[1]);
  assertEquals(msg.title, "Carol");
  assert(!msg.body.includes("!"));
});
