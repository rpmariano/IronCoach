import { assert, assertEquals } from "jsr:@std/assert@1";
import { findRaceRunServer, isWithinProactiveWindow, pickServerProactive, proactivePushMessage } from "./proactiveTriggers.ts";

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
