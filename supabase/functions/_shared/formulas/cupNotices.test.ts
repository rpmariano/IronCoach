// Os avisos do Troféu no tick (specs/trofeu.md §8, §10 Fase 5): omissão tudo
// desligado, invariância sem regime, regras de jornada, teto de 3 por jornada,
// frases sem números nem terceiros.
import { assert, assertEquals, assertStrictEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  CUP_NOTICE_TRIGGERS,
  CUP_ROUND_PUSH_CAP,
  cupCalendarKey,
  cupDateChangeKey,
  cupDayLabel,
  cupEntryDeadlineKey,
  cupHourLabel,
  cupNoticeMessage,
  cupNoticeRoundId,
  cupNoticesOn,
  type CupNoticeState,
  cupRegimeOn,
  cupResultsKey,
  cupRoundText,
  cupTickCandidates,
  isCupNoticeTrigger,
  listCupNotices,
  mergeCupCandidates,
  raceAfterReachedAtOf,
  raceIdOfRaceKey,
  roundPushCountsOf,
  type TickCandidate,
  tickTab,
} from "./cupNotices.ts";
import type { ServerProactiveCandidate } from "./proactiveTriggers.ts";
import { validatePushText } from "../../coach-proactive-tick/pushText.ts";

// ── O estado de teste ────────────────────────────────────────────────────
// A jornada 3 (Corrida CCD) é a 24 jan 2027, um domingo; a 4 a 14 fev.

const D3 = "2027-01-24";

type Over = {
  edition?: Partial<CupNoticeState["edition"]>;
  enrollment?: Partial<CupNoticeState["enrollment"]>;
  round3?: Partial<CupNoticeState["rounds"][number]>;
  part3?: Partial<CupNoticeState["participations"][number]>;
  parts?: Partial<CupNoticeState["parts"]>;
} & Partial<Omit<CupNoticeState, "edition" | "enrollment" | "parts">>;

function state(o: Over = {}): CupNoticeState {
  const { edition, enrollment, round3, part3, parts, ...rest } = o;
  return {
    edition: {
      id: "ed-1", notificationsEnabled: true, status: "aberta", competitionName: "Troféu de Cascais", seasonLabel: "2026/27",
      roundLabel: "Jornada", entryMode: "por_jornada", timeZone: "Europe/Lisbon", calendarOutAt: null, ...edition,
    },
    enrollment: {
      id: "enr-1", status: "ativa", joinedAt: "2026-10-01T10:00:00Z", entryBy: "atleta",
      notifyCalendar: false, notifyDateChanges: true, notifyEntryDeadline: true, notifyResults: true, ...enrollment,
    },
    rounds: [
      {
        id: "rd-3", roundNo: 3, name: "Corrida CCD", date: D3, dateStatus: "confirmada", previousDate: null, dateChangedAt: null,
        entryDeadlineAt: "2027-01-21T00:00:00Z", resultsReadyAt: null, ...round3,
      },
      {
        id: "rd-4", roundNo: 4, name: "Corrida do Farol", date: "2027-02-14", dateStatus: "confirmada", previousDate: null, dateChangedAt: null,
        entryDeadlineAt: "2027-02-11T00:00:00Z", resultsReadyAt: null,
      },
    ],
    participations: [
      { roundId: "rd-3", decision: "vou", intent: "controlar", entryDoneAt: null, decidedAt: "2026-10-01T10:00:00Z", ...part3 },
      { roundId: "rd-4", decision: "vou", intent: null, entryDoneAt: null, decidedAt: "2026-10-01T10:00:00Z" },
    ],
    races: [{ id: "race-3", roundId: "rd-3", priority: "b" }, { id: "race-4", roundId: "rd-4", priority: "b" }],
    ranRaceIds: [],
    roundPushCounts: {},
    raceAfterReachedAt: {},
    seenKeys: [],
    parts: { pushes: true, log: true, seen: true, calendar: true, publication: true, runs: true, ...parts },
    ...rest,
  };
}

const NONE = { raceId: null, raceName: null, hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };
const morning = (raceId = "race-3", o: Partial<ServerProactiveCandidate> = {}): ServerProactiveCandidate => ({
  ...NONE, trigger: "race_morning", key: `race_morning:${raceId}`, raceId, raceName: "Corrida CCD", startMinutes: 570, hasFirstKmPace: false, ...o,
});
const eve = (raceId = "race-3"): ServerProactiveCandidate => ({ ...NONE, trigger: "race_eve", key: `race_eve:${raceId}`, raceId, raceName: "Corrida CCD", startMinutes: 570 });
const after = (raceId = "race-3", o: Partial<ServerProactiveCandidate> = {}): ServerProactiveCandidate => ({
  ...NONE, trigger: "race_after", key: `race_after:${raceId}:run-1`, raceId, raceName: "Corrida CCD", hasRun: true, anchorDate: D3, anchorAt: `${D3}T11:00:00Z`, raceDay: "hoje", ...o,
});
const silence: ServerProactiveCandidate = { ...NONE, trigger: "silence", key: "silence:2027-01-10", silenceDays: 4, anchorDate: "2027-01-10" };
const week: ServerProactiveCandidate = { ...NONE, trigger: "week_review", key: "week_review:2027-01-11", anchorDate: "2027-01-17", weekStart: "2027-01-11", weekEnd: "2027-01-17" };
const board: ServerProactiveCandidate = { ...NONE, trigger: "leaderboard", key: "leaderboard:entrou:2027-01-04", vitrinaStage: "entrou", leaderboardRank: 3 };
const intervention: ServerProactiveCandidate = { ...NONE, trigger: "intervention", key: "intervention:abc", interventionTopic: "checkin" };
const block: ServerProactiveCandidate = { ...NONE, trigger: "block_end", key: "block_end:p1", planId: "p1" };

/** Uma hora de Lisboa num dia (inverno: UTC+0). */
const at = (day: string, hhmm = "10:00") => new Date(`${day}T${hhmm}:00Z`);
const keys = (list: TickCandidate[]) => list.map((c) => c.key);

// ── 1. Omissão tudo desligado ────────────────────────────────────────────

Deno.test("omissão: com os notify_* todos desligados não há regime, e a lista é a mesma (referência)", () => {
  const off = state({ enrollment: { notifyCalendar: false, notifyDateChanges: false, notifyEntryDeadline: false, notifyResults: false } });
  const base = [intervention, morning(), eve(), after(), silence];
  assertEquals(cupRegimeOn(off), false);
  assertStrictEquals(cupTickCandidates(base, off, at(D3), D3), base);
  assertEquals(listCupNotices(off, at("2027-01-19", "12:00"), "2027-01-19"), []);
  for (const s of [
    state({ edition: { notificationsEnabled: false } }),
    state({ edition: { status: "encerrada" } }),
    state({ enrollment: { status: "saiu" } }),
    state({ enrollment: { status: "concluida" } }),
  ]) {
    assertEquals(cupRegimeOn(s), false);
    assertStrictEquals(cupTickCandidates(base, s, at(D3), D3), base);
    assertEquals(listCupNotices(s, at("2027-01-19", "12:00"), "2027-01-19"), []);
  }
  assertStrictEquals(cupTickCandidates(base, undefined, at(D3), D3), base);
  assertStrictEquals(cupTickCandidates(base, null, at(D3), D3), base);
  // Qualquer um dos três avisos de jornada chega para o regime; o calendário
  // só dá avisos (o dele), não o regime.
  const only = (f: string) => ({ notifyCalendar: false, notifyDateChanges: false, notifyEntryDeadline: false, notifyResults: false, [f]: true });
  for (const f of ["notifyDateChanges", "notifyEntryDeadline", "notifyResults"] as const) {
    assert(cupRegimeOn(state({ enrollment: only(f) })), f);
    assert(cupNoticesOn(state({ enrollment: only(f) })), f);
  }
  assertEquals(cupNoticesOn(state({ enrollment: only("notifyCalendar") })), true);
  assertEquals(cupRegimeOn(state({ enrollment: only("notifyCalendar") })), false);
  // O prazo que não se aplica a ele (inscrito pelo clube, inscrição por
  // época) também não: o Perfil mostra-lho desligado e parado, ou nem o mostra.
  assertEquals(cupRegimeOn(state({ enrollment: { ...only("notifyEntryDeadline"), entryBy: "clube" } })), false);
  assertEquals(cupRegimeOn(state({ edition: { entryMode: "epoca" }, enrollment: only("notifyEntryDeadline") })), false);
});

// ── 1b. Só o calendário ("Avisa-me quando sair", §4.2) ───────────────────

Deno.test("só o calendário: sem calendário novo, a MESMA lista; as provas de jornada ficam como sem inscrição", () => {
  // A inscrição sem calendário grava notify_calendar=true sozinha; depois de
  // o calendário sair, o atleta que nunca tocou em nada não pode perder a
  // véspera, nem ficar com o teto ou as frases fixas.
  const cal = state({
    enrollment: { notifyCalendar: true, notifyDateChanges: false, notifyEntryDeadline: false, notifyResults: false },
    edition: { calendarOutAt: "2026-11-02T18:00:00Z" },
    round3: { resultsReadyAt: `${D3}T15:00:00Z` },
    part3: { intent: "trote" },
    ranRaceIds: ["race-3"],
    roundPushCounts: { "rd-3": 9 },
  });
  for (const [base, today, now] of [
    [[eve(), silence], "2027-01-23", at("2027-01-23")],
    [[morning(), silence], D3, at(D3, "07:30")],
    [[after(), silence], "2027-01-25", at("2027-01-25", "12:00")],
    [[], D3, at(D3)],
  ] as Array<[ServerProactiveCandidate[], string, Date]>) {
    assertStrictEquals(cupTickCandidates(base, cal, now, today), base);
  }
  // A leitura das notificações falhada também não mexe nas provas dele.
  const blind = { ...cal, parts: { ...cal.parts, pushes: false } };
  const base = [eve(), silence];
  assertStrictEquals(cupTickCandidates(base, blind, at("2027-01-23"), "2027-01-23"), base);
  // Com o calendário novo: só o aviso dele, e a véspera fica.
  const fresh = { ...cal, rounds: cal.rounds, edition: { ...cal.edition, calendarOutAt: "2027-01-22T18:00:00Z" }, enrollment: { ...cal.enrollment, joinedAt: "2027-01-01T10:00:00Z" } };
  assertEquals(keys(cupTickCandidates(base, fresh, at("2027-01-23"), "2027-01-23")), ["race_eve:race-3", "silence:2027-01-10", "cup_calendar:ed-1"]);
  assertEquals(cupNoticeMessage(cupTickCandidates(base, fresh, at("2027-01-23"), "2027-01-23")[0]), null);
});

// ── 2. Invariância: regime ligado, nada de jornada na lista ──────────────

Deno.test("invariância: com regime mas sem momentos de jornada nem avisos, a mesma lista (referência)", () => {
  // Um dia sem nada do Troféu: prazo já passado, data sem mudança, sem classificação.
  const s = state({ enrollment: { notifyCalendar: true } });
  const today = "2027-01-28";
  const now = at(today);
  const other = (id: string) => ({ raceName: "Meia de Lisboa", raceId: id });
  const lists: ServerProactiveCandidate[][] = [
    [morning("race-x", other("race-x")), eve("race-y")].map((c) => ({ ...c, raceName: "Meia de Lisboa" })),
    [after("race-x", other("race-x"))],
    [silence],
    [week],
    [board, { ...NONE, trigger: "percentile_ready", key: "percentile_ready:meu:2027-01-04", vitrinaStage: "meu" }],
    [],
  ];
  for (const base of lists) {
    const out = cupTickCandidates(base, s, now, today);
    assertStrictEquals(out, base);
    assertEquals(out, base);
  }
});

// ── 3. A véspera ─────────────────────────────────────────────────────────

Deno.test("véspera: sai numa jornada com regime; fica sem regime e numa jornada promovida a principal", () => {
  const today = "2027-01-23";
  const base = [eve(), silence];
  assertEquals(keys(cupTickCandidates(base, state(), at(today), today)), ["silence:2027-01-10"]);
  const off = state({ enrollment: { notifyCalendar: false, notifyDateChanges: false, notifyEntryDeadline: false, notifyResults: false } });
  assertStrictEquals(cupTickCandidates(base, off, at(today), today), base);
  const promoted = state({ races: [{ id: "race-3", roundId: "rd-3", priority: "a" }] });
  assertEquals(keys(cupTickCandidates(base, promoted, at(today), today)), ["race_eve:race-3", "silence:2027-01-10"]);
  // Uma prova normal no mesmo dia não é tocada.
  const normal = { ...eve("race-x"), raceName: "Meia" };
  assertEquals(keys(cupTickCandidates([normal], state(), at(today), today)), ["race_eve:race-x"]);
});

// ── 4. Trote, saltar, Não vou ────────────────────────────────────────────

Deno.test("trote/saltar/não vou: sem manhã, sem balanço e sem avisos dessa jornada; intenção por decidir conta", () => {
  for (const part3 of [{ intent: "trote" }, { intent: "saltar" }, { decision: "nao_vou" }, { decision: null }, { decision: "nao_sei" }]) {
    const s = state({ part3, round3: { resultsReadyAt: `${D3}T15:00:00Z` }, ranRaceIds: ["race-3"] });
    assertEquals(keys(cupTickCandidates([morning(), silence], s, at(D3, "07:30"), D3)), ["silence:2027-01-10"], JSON.stringify(part3));
    assertEquals(keys(cupTickCandidates([after(), silence], s, at("2027-01-25"), "2027-01-25")), ["silence:2027-01-10"], JSON.stringify(part3));
    // Nem o prazo (47 h antes) nem a classificação.
    assertEquals(listCupNotices(s, at("2027-01-19", "01:00"), "2027-01-19").filter((c) => c.cup.roundId === "rd-3"), []);
    assertEquals(listCupNotices(s, at("2027-01-26"), "2027-01-26"), []);
  }
  const undecided = state({ part3: { intent: null } });
  assertEquals(keys(cupTickCandidates([morning()], undecided, at(D3, "07:30"), D3)), ["race_morning:race-3"]);
});

// ── 5. O teto por jornada ────────────────────────────────────────────────

Deno.test("teto: 2 já enviadas deixam passar; 3 tiram tudo o que é dessa jornada, a outra jornada fica", () => {
  const today = D3;
  const base = [morning(), morning("race-4", { raceName: "Corrida do Farol" }), silence];
  const two = cupTickCandidates(base, state({ roundPushCounts: { "rd-3": 2 } }), at(today, "07:30"), today);
  assertEquals(keys(two), ["race_morning:race-3", "race_morning:race-4", "silence:2027-01-10"]);
  const three = cupTickCandidates(base, state({ roundPushCounts: { "rd-3": CUP_ROUND_PUSH_CAP } }), at(today, "07:30"), today);
  assertEquals(keys(three), ["race_morning:race-4", "silence:2027-01-10"]);
  // Os cup_* também: o prazo da jornada 3 com 3 enviadas não sai.
  const deadlineNow = at("2027-01-19", "01:00");
  assertEquals(keys(listCupNotices(state({ roundPushCounts: { "rd-3": 2 } }), deadlineNow, "2027-01-19")), [cupEntryDeadlineKey("rd-3")]);
  assertEquals(listCupNotices(state({ roundPushCounts: { "rd-3": 3 } }), deadlineNow, "2027-01-19"), []);
  // Sem a contagem (leitura falhou): nenhum cup_*, e as race_* de jornada
  // como no teto — nunca uma 4.ª por não se ter lido. O resto fica.
  const blind = state({ roundPushCounts: {}, parts: { pushes: false } });
  assertEquals(listCupNotices(blind, deadlineNow, "2027-01-19"), []);
  const normal = { ...morning("race-x"), raceName: "Meia de Lisboa" };
  assertEquals(keys(cupTickCandidates([...base, normal], blind, at(today, "07:30"), today)), ["silence:2027-01-10", "race_morning:race-x"]);
});

Deno.test("teto numa jornada promovida a principal ('a'): conta e respeita os 3, com a véspera e a frase de sempre", () => {
  const promoted = { races: [{ id: "race-3", roundId: "rd-3", priority: "a" }, { id: "race-4", roundId: "rd-4", priority: "b" }] };
  // Prazo, mudança de data e véspera já saíram: a manhã e o balanço já não.
  const full = state({ ...promoted, roundPushCounts: { "rd-3": CUP_ROUND_PUSH_CAP } });
  assertEquals(keys(cupTickCandidates([morning(), silence], full, at(D3, "07:30"), D3)), ["silence:2027-01-10"]);
  assertEquals(keys(cupTickCandidates([after(), silence], full, at("2027-01-25"), "2027-01-25")), ["silence:2027-01-10"]);
  assertEquals(keys(cupTickCandidates([eve(), silence], full, at("2027-01-23"), "2027-01-23")), ["silence:2027-01-10"]);
  // Abaixo do teto: fica tudo como numa principal (a véspera e o Gemini).
  const two = state({ ...promoted, roundPushCounts: { "rd-3": 2 } });
  const eveOut = cupTickCandidates([eve(), silence], two, at("2027-01-23"), "2027-01-23");
  assertEquals(keys(eveOut), ["race_eve:race-3", "silence:2027-01-10"]);
  assertEquals(cupNoticeMessage(eveOut[0]), null);
  const [m] = cupTickCandidates([morning()], two, at(D3, "07:30"), D3);
  assertEquals(cupNoticeMessage(m), null);
  // Sem a contagem: como no teto.
  const blind = state({ ...promoted, parts: { pushes: false } });
  assertEquals(keys(cupTickCandidates([eve(), silence], blind, at("2027-01-23"), "2027-01-23")), ["silence:2027-01-10"]);
  // A simulação: nunca mais de 3 nessa jornada, a véspera incluída.
  const busy = state({
    ...promoted,
    round3: { previousDate: "2027-01-17", dateChangedAt: "2027-01-18T09:00:00Z", resultsReadyAt: "2027-01-26T10:00:00Z" },
  });
  const r = simulate(busy, { allowEve: true });
  assertEquals(r.rows.map((x) => x.key), [cupDateChangeKey("rd-3", D3), cupEntryDeadlineKey("rd-3"), "race_eve:race-3"]);
  assertEquals(r.perRound["rd-3"], CUP_ROUND_PUSH_CAP);
  const calm = simulate(state({ ...promoted, part3: { entryDoneAt: "2027-01-15T10:00:00Z" }, round3: { resultsReadyAt: "2027-01-26T10:00:00Z" } }), { allowEve: true });
  assertEquals(calm.rows.map((x) => x.key), ["race_eve:race-3", "race_morning:race-3", "race_after:race-3:run-1"]);
  assertEquals(calm.perRound["rd-3"], CUP_ROUND_PUSH_CAP);
});

Deno.test("roundPushCountsOf: cup_* pela jornada da chave, race_* pela prova; calendário e outras provas não contam", () => {
  const counts = roundPushCountsOf([
    { key: "cup_date_change:rd-3:2027-01-24" },
    { key: "cup_entry_deadline:rd-3" },
    { key: "race_morning:race-3" },
    { key: "race_after:race-3:run-1" },
    { key: "cup_results:rd-4" },
    { key: "race_eve:race-4" },
    { key: "cup_calendar:ed-1" },
    { key: "race_morning:race-x" },
    { key: "silence:2027-01-10" },
    { key: null },
  ], [{ id: "race-3", roundId: "rd-3" }, { id: "race-4", roundId: "rd-4" }]);
  assertEquals(counts, { "rd-3": 4, "rd-4": 2 });
  assertEquals(roundPushCountsOf(null, null), {});
});

Deno.test("raceAfterReachedAtOf: o ÚLTIMO instante, do log ou da notificação; só race_after", () => {
  const r = raceAfterReachedAtOf(
    [{ key: "race_after:race-3:run-1", sent_at: "2027-01-25T20:00:00Z" }, { key: "race_morning:race-3", sent_at: "2027-01-26T07:00:00Z" }],
    [
      { key: "race_after:race-3:run-1", sent_at: "2027-01-24T19:00:00Z" },
      { key: "race_after:race-4:sem-registo", sent_at: "bad" },
      { key: "race_after:race-4:run-2", sent_at: "2027-02-14T19:00:00Z" },
    ],
  );
  assertEquals(r, { "race-3": "2027-01-25T20:00:00Z", "race-4": "2027-02-14T19:00:00Z" });
  // A ordem das linhas não conta.
  assertEquals(raceAfterReachedAtOf([], [{ key: "race_after:race-3:b", sent_at: "2027-01-26T10:00:00Z" }, { key: "race_after:race-3:a", sent_at: "2027-01-24T10:00:00Z" }]), { "race-3": "2027-01-26T10:00:00Z" });
  assertEquals(raceAfterReachedAtOf(null, undefined), {});
});

Deno.test("classificação: o balanço notificado antes dela, mas conversado depois, já a levou — não há 2.º aviso", () => {
  // O push race_after sai em D às 19h; a classificação fica pronta em D+1 às
  // 10h; ele toca no push em D+1 às 12h e o chat já lhe diz o lugar e o
  // tempo (coach-chat, a junção) — o log fica com as 12h.
  const s0 = state({ round3: { resultsReadyAt: "2027-01-25T10:00:00Z" }, ranRaceIds: ["race-3"], part3: { entryDoneAt: "2027-01-15T10:00:00Z" } });
  const reached = raceAfterReachedAtOf(
    [{ key: "race_after:race-3:run-1", sent_at: "2027-01-25T12:00:00Z" }],
    [{ key: "race_after:race-3:run-1", sent_at: `${D3}T19:00:00Z` }],
  );
  assertEquals(listCupNotices({ ...s0, raceAfterReachedAt: reached }, at("2027-01-25", "13:00"), "2027-01-25"), []);
  // Sem a conversa (só a notificação, antes da classificação): é notícia.
  const pushOnly = raceAfterReachedAtOf([], [{ key: "race_after:race-3:run-1", sent_at: `${D3}T19:00:00Z` }]);
  assertEquals(keys(listCupNotices({ ...s0, raceAfterReachedAt: pushOnly }, at("2027-01-25", "13:00"), "2027-01-25")), ["cup_results:rd-3"]);
  // A conversa ANTES da classificação também não a levou.
  const early = raceAfterReachedAtOf([{ key: "race_after:race-3:run-1", sent_at: `${D3}T20:00:00Z` }], [{ key: "race_after:race-3:run-1", sent_at: `${D3}T19:00:00Z` }]);
  assertEquals(keys(listCupNotices({ ...s0, raceAfterReachedAt: early }, at("2027-01-25", "13:00"), "2027-01-25")), ["cup_results:rd-3"]);
});

/* A simulação do §10 ("máximo 3 por jornada em teste"): de D−10 a D+14, três
   execuções por dia; em cada uma sai o 1.º candidato ainda não notificado, e
   entra na contagem como o tick a leria na execução seguinte. */
function simulate(s0: CupNoticeState, opts: { runAt?: string; ticks?: string[]; allowEve?: boolean } = {}) {
  const rows: Array<{ key: string; trigger: string; sent_at: string }> = [];
  const bodies: string[] = [];
  const runAt = opts.runAt ?? `${D3}T11:00:00Z`;
  for (let d = -10; d <= 14; d++) {
    const day = new Date(Date.parse(`${D3}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
    for (const hhmm of opts.ticks ?? ["07:30", "12:00", "19:00"]) {
      const now = at(day, hhmm);
      const ran = now.getTime() >= Date.parse(runAt);
      const base: ServerProactiveCandidate[] = [];
      if (d === 0) base.push(morning());
      if (d === -1) base.push(eve());
      if (d >= 0 && d <= 7 && ran) base.push(after());
      const s: CupNoticeState = {
        ...s0,
        ranRaceIds: ran ? ["race-3"] : [],
        roundPushCounts: roundPushCountsOf(rows, s0.races),
        raceAfterReachedAt: raceAfterReachedAtOf([], rows),
      };
      const list = cupTickCandidates(base, s, now, day);
      if (!opts.allowEve) assert(!list.some((c) => c.trigger === "race_eve"), `véspera em ${day}`);
      const sent = new Set(rows.map((r) => r.key));
      const pick = list.find((c) => !sent.has(c.key));
      if (pick) {
        rows.push({ key: pick.key, trigger: pick.trigger, sent_at: now.toISOString() });
        bodies.push(cupNoticeMessage(pick)?.body ?? "(Gemini)");
      }
    }
  }
  return { rows, bodies, perRound: roundPushCountsOf(rows, s0.races) };
}

Deno.test("simulação D−10…D+14: nunca mais de 3 por jornada, e sem véspera", () => {
  // Mudança de data a D−6, prazo quarta às 24h, manhã, balanço e classificação a D+2.
  const busy = state({
    round3: { previousDate: "2027-01-17", dateChangedAt: "2027-01-18T09:00:00Z", resultsReadyAt: "2027-01-26T10:00:00Z" },
  });
  const r1 = simulate(busy);
  assertEquals(r1.rows.map((r) => r.key), [cupDateChangeKey("rd-3", D3), cupEntryDeadlineKey("rd-3"), "race_morning:race-3"]);
  assertEquals(r1.perRound["rd-3"], 3);
  // Sem a mudança de data: prazo, manhã e balanço — a classificação já não cabe.
  const r2 = simulate(state({ round3: { resultsReadyAt: "2027-01-26T10:00:00Z" } }));
  assertEquals(r2.rows.map((r) => r.key), [cupEntryDeadlineKey("rd-3"), "race_morning:race-3", "race_after:race-3:run-1"]);
  assert(r2.perRound["rd-3"] <= CUP_ROUND_PUSH_CAP);
  // Já inscrito, classificação saída antes do balanço: vai junta com ele e não gasta lugar.
  const r3 = simulate(state({ part3: { entryDoneAt: "2027-01-15T10:00:00Z" }, round3: { resultsReadyAt: `${D3}T11:30:00Z` } }));
  assertEquals(r3.rows.map((r) => r.key), ["race_morning:race-3", "race_after:race-3:run-1"]);
  assertStringIncludes(r3.bodies[1], "já saiu a classificação");
  // Classificação depois do balanço: é notícia, sai à parte.
  const r4 = simulate(state({ part3: { entryDoneAt: "2027-01-15T10:00:00Z" }, round3: { resultsReadyAt: "2027-01-26T10:00:00Z" } }));
  assertEquals(r4.rows.map((r) => r.key), ["race_morning:race-3", "race_after:race-3:run-1", cupResultsKey("rd-3")]);
  for (const r of [r1, r2, r3, r4]) for (const n of Object.values(r.perRound)) assert(n <= CUP_ROUND_PUSH_CAP);
});

// ── 6. O prazo de inscrição ──────────────────────────────────────────────

Deno.test("prazo: dentro das 48 h sai com o dia e a hora; fora disso, ou inscrito, ou pelo clube, nada", () => {
  // Prazo à meia-noite de quinta (Lisboa, inverno) = "quarta às 24h".
  const c = listCupNotices(state(), at("2027-01-19", "01:00"), "2027-01-19");
  assertEquals(keys(c), ["cup_entry_deadline:rd-3"]);
  assertEquals(c[0].cup.body, "A inscrição na jornada 3 (Corrida CCD) fecha amanhã às 24h.");
  assertEquals(c[0].cup.tab, "home");
  // Um prazo às 18h de quarta, 47 h antes (segunda às 19h): "quarta às 18h".
  const at18 = state({ round3: { entryDeadlineAt: "2027-01-20T18:00:00Z" } });
  assertEquals(listCupNotices(at18, at("2027-01-18", "19:00"), "2027-01-18")[0].cup.body, "A inscrição na jornada 3 (Corrida CCD) fecha quarta às 18h.");
  // 49 h antes: ainda não.
  assertEquals(listCupNotices(state(), at("2027-01-18", "23:00"), "2027-01-18"), []);
  for (const s of [
    state({ enrollment: { entryBy: "clube" } }),
    state({ part3: { entryDoneAt: "2027-01-10T10:00:00Z" } }),
    state({ edition: { entryMode: "epoca" } }),
    state({ round3: { dateStatus: "provavel" } }),
    state({ part3: { decision: "nao_sei" } }),
    state({ enrollment: { notifyEntryDeadline: false } }),
  ]) {
    assertEquals(listCupNotices(s, at("2027-01-19", "01:00"), "2027-01-19"), []);
  }
  // "não sei" e sem resposta a "quem te inscreve?" contam como ele (§4.2.7).
  assertEquals(keys(listCupNotices(state({ enrollment: { entryBy: "nao_sei" } }), at("2027-01-19", "01:00"), "2027-01-19")), ["cup_entry_deadline:rd-3"]);
  assertEquals(keys(listCupNotices(state({ enrollment: { entryBy: null } }), at("2027-01-19", "01:00"), "2027-01-19")), ["cup_entry_deadline:rd-3"]);
});

// ── 7. A mudança de data ─────────────────────────────────────────────────

Deno.test("data: nas 72 h seguintes a uma mudança numa jornada 'Vou' decidida antes dela", () => {
  const changed = { previousDate: "2027-01-17", dateChangedAt: "2027-01-10T09:00:00Z" };
  const noDeadline = { entryDoneAt: "2027-01-05T10:00:00Z" };
  const s = state({ round3: changed, part3: noDeadline });
  const c = listCupNotices(s, at("2027-01-11"), "2027-01-11");
  assertEquals(keys(c), ["cup_date_change:rd-3:2027-01-24"]);
  assertEquals(c[0].cup.body, "A jornada 3 (Corrida CCD) mudou para domingo, 24 jan.");
  assertEquals(c[0].cup.tab, "home");
  // > 72 h, decidida depois, vista na app, data já passada, sem decisão (colisão), sem a leitura das vistas.
  assertEquals(listCupNotices(s, at("2027-01-13", "10:00"), "2027-01-13"), []);
  assertEquals(listCupNotices(state({ round3: changed, part3: { ...noDeadline, decidedAt: "2027-01-10T12:00:00Z" } }), at("2027-01-11"), "2027-01-11"), []);
  assertEquals(listCupNotices(state({ round3: changed, part3: noDeadline, seenKeys: ["cup_date_change:rd-3:2027-01-24"] }), at("2027-01-11"), "2027-01-11"), []);
  assertEquals(listCupNotices(state({ round3: { previousDate: "2027-01-24", dateChangedAt: "2027-01-09T09:00:00Z", date: "2027-01-10" }, part3: noDeadline }), at("2027-01-11"), "2027-01-11"), []);
  assertEquals(listCupNotices(state({ round3: changed, part3: { ...noDeadline, decision: null } }), at("2027-01-11"), "2027-01-11"), []);
  assertEquals(listCupNotices(state({ round3: changed, part3: noDeadline, parts: { seen: false } }), at("2027-01-11"), "2027-01-11"), []);
  assertEquals(listCupNotices(state({ round3: changed, part3: noDeadline, enrollment: { notifyDateChanges: false } }), at("2027-01-11"), "2027-01-11"), []);
  // A 1.ª data (de null para uma data) não é mudança: o trigger não grava previous_date.
  assertEquals(listCupNotices(state({ round3: { dateChangedAt: "2027-01-10T09:00:00Z" }, part3: noDeadline }), at("2027-01-11"), "2027-01-11"), []);
  // Uma 2.ª mudança é outra notícia, com outra chave.
  const again = state({ round3: { date: "2027-01-31", previousDate: D3, dateChangedAt: "2027-01-12T09:00:00Z" }, part3: noDeadline, seenKeys: ["cup_date_change:rd-3:2027-01-24"] });
  assertEquals(keys(listCupNotices(again, at("2027-01-12", "12:00"), "2027-01-12")), ["cup_date_change:rd-3:2027-01-31"]);
});

// ── 8. O calendário ──────────────────────────────────────────────────────

Deno.test("calendário: saiu depois da inscrição e há ≤ 14 dias; não conta para o teto", () => {
  const on = { notifyCalendar: true, notifyDateChanges: false, notifyEntryDeadline: false, notifyResults: false };
  const s = state({ enrollment: on, edition: { calendarOutAt: "2026-11-02T18:00:00Z" }, roundPushCounts: { "rd-3": 3 } });
  const c = listCupNotices(s, at("2026-11-03"), "2026-11-03");
  assertEquals(keys(c), ["cup_calendar:ed-1"]);
  assertEquals(c[0].cup.body, "Saiu o calendário: Troféu de Cascais 2026/27.");
  assertEquals(c[0].cup.tab, "home");
  assertEquals(c[0].cup.roundId, null);
  // Antes da inscrição, > 14 dias, sem data (auditoria vazia) ou sem a leitura: nada.
  assertEquals(listCupNotices(state({ enrollment: { ...on, joinedAt: "2026-11-05T10:00:00Z" }, edition: { calendarOutAt: "2026-11-02T18:00:00Z" } }), at("2026-11-06"), "2026-11-06"), []);
  assertEquals(listCupNotices(state({ enrollment: on, edition: { calendarOutAt: "2026-11-02T18:00:00Z" } }), at("2026-11-17"), "2026-11-17"), []);
  assertEquals(listCupNotices(state({ enrollment: on }), at("2026-11-03"), "2026-11-03"), []);
  assertEquals(listCupNotices(state({ enrollment: on, edition: { calendarOutAt: "2026-11-02T18:00:00Z" }, parts: { calendar: false } }), at("2026-11-03"), "2026-11-03"), []);
  // Sem nome da competição, a frase não fica a meio.
  assertEquals(listCupNotices(state({ enrollment: on, edition: { calendarOutAt: "2026-11-02T18:00:00Z", competitionName: null, seasonLabel: null } }), at("2026-11-03"), "2026-11-03")[0].cup.body, "Saiu o calendário da tua competição.");
});

// ── 9. A classificação e a junção ao balanço ─────────────────────────────

Deno.test("classificação: correu, pronta, até D+13 e antes da véspera da seguinte", () => {
  const ready = { resultsReadyAt: "2027-01-26T10:00:00Z" };
  const s = state({ round3: ready, ranRaceIds: ["race-3"], part3: { entryDoneAt: "2027-01-15T10:00:00Z" } });
  const c = listCupNotices(s, at("2027-01-26", "12:00"), "2027-01-26");
  assertEquals(keys(c), ["cup_results:rd-3"]);
  assertEquals(c[0].cup.body, "Saiu a classificação da jornada 3 (Corrida CCD). Vem ver comigo.");
  assertEquals(c[0].cup.tab, "coach");
  assertEquals(c[0].raceId, "race-3");
  // Antes de estar pronta, não correu, "Não fui", D+14, véspera da seguinte (13 fev), leituras em falta.
  assertEquals(listCupNotices(s, at("2027-01-26", "09:00"), "2027-01-26"), []);
  assertEquals(listCupNotices(state({ round3: ready }), at("2027-01-26", "12:00"), "2027-01-26"), []);
  assertEquals(listCupNotices(state({ round3: ready, ranRaceIds: ["race-3"], part3: { decision: "nao_fui" } }), at("2027-01-26", "12:00"), "2027-01-26"), []);
  assertEquals(listCupNotices(s, at("2027-02-07"), "2027-02-07"), []);
  assertEquals(keys(listCupNotices(s, at("2027-02-06"), "2027-02-06")), ["cup_results:rd-3"]);
  const close = state({ round3: ready, ranRaceIds: ["race-3"], part3: { entryDoneAt: "2027-01-15T10:00:00Z" } });
  close.rounds[1] = { ...close.rounds[1], date: "2027-01-31" };
  assertEquals(listCupNotices(close, at("2027-01-30"), "2027-01-30"), []);
  assertEquals(keys(listCupNotices(close, at("2027-01-29"), "2027-01-29")), ["cup_results:rd-3"]);
  for (const parts of [{ publication: false }, { runs: false }, { log: false }]) {
    assertEquals(listCupNotices(state({ round3: ready, ranRaceIds: ["race-3"], parts }), at("2027-01-26", "12:00"), "2027-01-26"), []);
  }
  assertEquals(listCupNotices(state({ round3: ready, ranRaceIds: ["race-3"], enrollment: { notifyResults: false } }), at("2027-01-26", "12:00"), "2027-01-26")
    .filter((x) => x.trigger === "cup_results"), []);
});

Deno.test("junção: o balanço por entregar leva a classificação; entregue antes, sai à parte; entregue depois, nada", () => {
  const ready = { resultsReadyAt: "2027-01-25T10:00:00Z" };
  const s = state({ round3: ready, ranRaceIds: ["race-3"], part3: { entryDoneAt: "2027-01-15T10:00:00Z" } });
  const today = "2027-01-25";
  const out = cupTickCandidates([after(), silence], s, at(today, "12:00"), today);
  // O balanço fica à frente, com a frase que junta; a classificação atrás (sai se o balanço não puder).
  assertEquals(keys(out), ["race_after:race-3:run-1", "cup_results:rd-3", "silence:2027-01-10"]);
  assertEquals(cupNoticeMessage(out[0])?.body, "Vi o registo da prova Corrida CCD e já saiu a classificação. Vem fazer o balanço comigo.");
  assertEquals(tickTab(out[0]), "coach");
  // O balanço chegou-lhe antes de a classificação estar pronta: a classificação sai.
  const before = { ...s, raceAfterReachedAt: { "race-3": "2027-01-24T19:00:00Z" } };
  assertEquals(keys(listCupNotices(before, at(today, "12:00"), today)), ["cup_results:rd-3"]);
  // Chegou-lhe depois: foi com ela.
  const afterReady = { ...s, raceAfterReachedAt: { "race-3": "2027-01-25T11:00:00Z" } };
  assertEquals(listCupNotices(afterReady, at(today, "12:00"), today), []);
  // Sem a classificação pronta, o balanço é o de sempre (Gemini).
  const notYet = cupTickCandidates([after()], state({ ranRaceIds: ["race-3"] }), at(today, "12:00"), today);
  assertEquals(cupNoticeMessage(notYet[0]), null);
  // Balanço sem corrida ou com a corrida por ligar: nunca junta.
  assertEquals(cupNoticeMessage(cupTickCandidates([after("race-3", { hasRun: false, key: "race_after:race-3:sem-registo" })], s, at(today, "12:00"), today)[0]), null);
  assertEquals(cupNoticeMessage(cupTickCandidates([after("race-3", { unlinkedRun: true, key: "race_after:race-3:por-ligar" })], s, at(today, "12:00"), today)[0]), null);
});

// ── 10. A manhã de jornada ───────────────────────────────────────────────

Deno.test("manhã de jornada: frase fixa com a hora do percurso", () => {
  const [m] = cupTickCandidates([morning()], state(), at(D3, "07:30"), D3);
  assertEquals(cupNoticeMessage(m), { title: "Carol", body: "Hoje é dia de prova: Corrida CCD, partida às 9h30. Fala comigo antes da partida." });
  assertEquals(tickTab(m), "coach");
  const [p] = cupTickCandidates([morning("race-3", { startMinutes: 600, hasFirstKmPace: true })], state(), at(D3, "07:30"), D3);
  assertEquals(cupNoticeMessage(p)?.body, "Hoje é dia de prova: Corrida CCD, partida às 10h. Deixei-te o ritmo do primeiro km.");
  const [n] = cupTickCandidates([morning("race-3", { startMinutes: null })], state(), at(D3, "07:30"), D3);
  assertEquals(cupNoticeMessage(n)?.body, "Hoje é dia de prova: Corrida CCD. Fala comigo antes da partida.");
  const [x] = cupTickCandidates([morning("race-3", { raceName: "Prova" })], state(), at(D3, "07:30"), D3);
  assertEquals(cupNoticeMessage(x)?.body, "Hoje é dia de prova, partida às 9h30. Fala comigo antes da partida.");
  // Os campos do momento ficam (a janela e o "depois da partida" leem-nos).
  assertEquals([m.trigger, m.key, m.startMinutes], ["race_morning", "race_morning:race-3", 570]);
});

// ── 11. As frases ────────────────────────────────────────────────────────

Deno.test("frases: ≤ 140, passam a validação do push, sem números de classificação nem terceiros", () => {
  const long = "Grande Prémio de Atletismo da Vila de Cascais e Estoril Memorial";
  const s = state({
    enrollment: { notifyCalendar: true },
    edition: { calendarOutAt: "2027-01-20T09:00:00Z", competitionName: long, seasonLabel: "2026/2027" },
    round3: { name: long, previousDate: "2027-01-17", dateChangedAt: "2027-01-20T09:00:00Z", resultsReadyAt: "2027-01-20T09:30:00Z", date: "2027-01-21", entryDeadlineAt: "2027-01-21T18:00:00Z" },
    ranRaceIds: ["race-3"],
  });
  const all: TickCandidate[] = [
    ...listCupNotices(s, at("2027-01-21", "10:00"), "2027-01-21"),
    ...cupTickCandidates([morning("race-3", { raceName: long, startMinutes: 1439, hasFirstKmPace: true })], s, at("2027-01-21", "07:00"), "2027-01-21"),
    ...cupTickCandidates([after("race-3", { raceName: long })], s, at("2027-01-21", "12:00"), "2027-01-21"),
  ];
  const triggers = new Set(all.map((c) => c.trigger));
  for (const t of [...CUP_NOTICE_TRIGGERS, "race_morning", "race_after"]) assert(triggers.has(t as never), t);
  for (const c of all) {
    const body = cupNoticeMessage(c)?.body;
    if (!body) continue;
    assert(body.length <= 140, body);
    assertEquals(validatePushText(body), body);
    assertEquals(/\d+\s*\.?º|ponto|lugar|escal[aã]o|dorsal|clube/i.test(body), false, body);
  }
});

Deno.test("cupRoundText, cupDayLabel, cupHourLabel", () => {
  assertEquals(cupRoundText("Jornada", 3, "Corrida CCD"), "jornada 3 (Corrida CCD)");
  assertEquals(cupRoundText("Etapa", 2, "  Milha   Urbana "), "etapa 2 (Milha Urbana)");
  assertEquals(cupRoundText(null, 1, "Jornada 1"), "jornada 1");
  assertEquals(cupRoundText("Jornada", 5, ""), "jornada 5");
  assertEquals(cupRoundText("Jornada", 5, "x".repeat(60)).length, "jornada 5 ()".length + 40);
  assertEquals(cupDayLabel("2027-01-24"), "domingo, 24 jan");
  assertEquals(cupDayLabel("2026-12-02"), "quarta, 2 dez");
  assertEquals(cupDayLabel("nope"), "");
  assertEquals(cupHourLabel(570), "9h30");
  assertEquals(cupHourLabel(600), "10h");
  assertEquals(cupHourLabel(5), "0h05");
  assertEquals(cupHourLabel(null), null);
  assertEquals(cupHourLabel(24 * 60), null);
});

// ── 12. Ordem, chaves, notices:false ─────────────────────────────────────

Deno.test("mergeCupCandidates: os cup_* entre os de sempre, sem mudar a ordem deles", () => {
  const cup = (trigger: TickCandidate["trigger"], key: string) =>
    ({ ...NONE, trigger, key, cup: { editionId: "ed-1", roundId: null, body: "x", tab: "home" } }) as never;
  const base: TickCandidate[] = [intervention, morning(), after(), block, silence, week, board];
  const out = mergeCupCandidates(base, [
    cup("cup_calendar", "cal"), cup("cup_results", "res"), cup("cup_entry_deadline", "dl"), cup("cup_date_change", "dc"),
  ]);
  assertEquals(keys(out), [
    "intervention:abc", "race_morning:race-3", "race_after:race-3:run-1", "dl", "dc", "res",
    "block_end:p1", "silence:2027-01-10", "week_review:2027-01-11", "cal", "leaderboard:entrou:2027-01-04",
  ]);
  assertEquals(keys(mergeCupCandidates([], [cup("cup_calendar", "cal")])), ["cal"]);
  assertStrictEquals(mergeCupCandidates(base, []), base);
});

Deno.test("chaves: os literais do contrato com o cliente", () => {
  assertEquals(cupCalendarKey("ed-1"), "cup_calendar:ed-1");
  assertEquals(cupDateChangeKey("rd-3", "2027-01-24"), "cup_date_change:rd-3:2027-01-24");
  assertEquals(cupEntryDeadlineKey("rd-3"), "cup_entry_deadline:rd-3");
  assertEquals(cupResultsKey("rd-3"), "cup_results:rd-3");
  assertEquals(cupNoticeRoundId("cup_date_change:rd-3:2027-01-24"), "rd-3");
  assertEquals(cupNoticeRoundId("cup_entry_deadline:rd-3"), "rd-3");
  assertEquals(cupNoticeRoundId("cup_results:rd-3"), "rd-3");
  assertEquals(cupNoticeRoundId("cup_calendar:ed-1"), null);
  assertEquals(cupNoticeRoundId("race_after:r:x"), null);
  assertEquals(cupNoticeRoundId(null), null);
  assertEquals(raceIdOfRaceKey("race_after:race-3:run-1"), "race-3");
  assertEquals(raceIdOfRaceKey("race_morning:race-3"), "race-3");
  assertEquals(raceIdOfRaceKey("race_eve:race-3"), "race-3");
  assertEquals(raceIdOfRaceKey("race_conflict:p:a,b"), null);
  assertEquals([...CUP_NOTICE_TRIGGERS], ["cup_calendar", "cup_date_change", "cup_entry_deadline", "cup_results"]);
  assert(isCupNoticeTrigger("cup_results") && !isCupNoticeTrigger("race_after") && !isCupNoticeTrigger("cup_outro") && !isCupNoticeTrigger(null));
});

Deno.test("notices:false (a M3 recusou): sem cup_*, mas as regras de jornada continuam", () => {
  const s = state();
  const today = "2027-01-19";
  const now = at(today, "01:00");
  assertEquals(keys(cupTickCandidates([silence], s, now, today)), ["cup_entry_deadline:rd-3", "silence:2027-01-10"]);
  const off = cupTickCandidates([silence], s, now, today, { notices: false });
  assertStrictEquals(off.length, 1);
  assertEquals(keys(cupTickCandidates([eve(), silence], s, now, today, { notices: false })), ["silence:2027-01-10"]);
});

Deno.test("cupNoticeMessage/tickTab: os momentos de sempre ficam com o Gemini e o separador de sempre", () => {
  assertEquals(cupNoticeMessage(silence), null);
  assertEquals(tickTab(silence), "coach");
  assertEquals(tickTab(intervention), "home");
  const bare = { ...NONE, trigger: "cup_results", key: "cup_results:rd-3" } as unknown as TickCandidate;
  assertEquals(tickTab(bare), "home");
  assert(cupNoticeMessage(bare)?.body);
});
