// A leitura em lote dos avisos do Troféu (specs/trofeu.md §8, Fase 5): uma só
// leitura para toda a gente hoje, falhas isoladas, nada de dados de terceiros.
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "jsr:@std/assert@1";
import { CUP_READ_MAX_PAGES, CUP_READ_PAGE, loadCupNoticeState } from "./cupNoticeState.ts";
import { cupTickCandidates, listCupNotices } from "../_shared/formulas/cupNotices.ts";

interface Call { table: string; select: string | null; filters: unknown[][] }
type TableResult = { data?: unknown; error?: unknown };

function fakeSb(tables: Record<string, TableResult>) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      const call: Call = { table, select: null, filters: [] };
      calls.push(call);
      const result = tables[table] ?? { data: [], error: null };
      let rows: unknown = result.data ?? [];
      const keep = (pred: (row: any) => boolean) => {
        if (Array.isArray(rows)) rows = rows.filter((r: any) => pred(r));
      };
      const chain: any = {};
      chain.select = (cols: string) => {
        call.select = cols;
        return chain;
      };
      chain.eq = (col: string, val: unknown) => {
        call.filters.push(["eq", col, val]);
        keep((r) => !(col in r) || r[col] === val);
        return chain;
      };
      chain.neq = (col: string, val: unknown) => {
        call.filters.push(["neq", col, val]);
        keep((r) => !(col in r) || r[col] !== val);
        return chain;
      };
      chain.in = (col: string, vals: unknown[]) => {
        call.filters.push(["in", col, vals]);
        keep((r) => !(col in r) || vals.includes(r[col]));
        return chain;
      };
      for (const m of ["gte", "lte", "or", "not", "order", "limit", "like"]) {
        chain[m] = (...a: unknown[]) => {
          call.filters.push([m, ...a]);
          return chain;
        };
      }
      // Uma página (o corte das 1000 aplica-se na mesma, em payload).
      chain.range = (from: number, to: number) => {
        call.filters.push(["range", from, to]);
        if (Array.isArray(rows)) rows = rows.slice(from, to + 1);
        return chain;
      };
      // O db-max-rows do PostgREST: nunca mais de 1000 linhas numa resposta,
      // com ou sem página — e sem erro.
      const payload = () => ({ data: result.error ? null : Array.isArray(rows) ? rows.slice(0, 1000) : rows, error: result.error ?? null });
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(payload()).then(resolve, reject);
      return chain;
    },
  };
}

async function quietly<T>(fn: () => Promise<T>): Promise<{ value: T; warns: unknown[][] }> {
  const warns: unknown[][] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => void warns.push(a);
  try {
    return { value: await fn(), warns };
  } finally {
    console.warn = orig;
  }
}

const NOW = new Date("2027-01-26T12:00:00Z");
const TODAY = "2027-01-26";
const U1 = "u-1";
const U2 = "u-2";

const EDITION = {
  id: "ed-1", status: "aberta", season_label: "2026/27", entry_mode: "por_jornada", time_zone: "Europe/Lisbon", notifications_enabled: true,
  competition: { short_name: "Troféu de Cascais", round_label: "Jornada" },
};
const ENR = (o: any = {}) => ({
  id: "enr-1", user_id: U1, edition_id: "ed-1", status: "ativa", joined_at: "2026-10-01T10:00:00Z", entry_by: "atleta",
  notify_calendar: true, notify_date_changes: true, notify_entry_deadline: true, notify_results: true, ...o,
});

function fullTables(over: Record<string, TableResult> = {}): Record<string, TableResult> {
  return {
    cup_editions: { data: [EDITION] },
    cup_enrollments: { data: [ENR(), ENR({ id: "enr-2", user_id: U2, notify_calendar: false, notify_date_changes: false, notify_results: false })] },
    cup_rounds: {
      data: [
        { id: "rd-3", edition_id: "ed-1", round_no: 3, name: "Corrida CCD", date: "2027-01-24", date_status: "confirmada", previous_date: "2027-01-17", date_changed_at: "2027-01-18T09:00:00Z", entry_deadline_at: "2027-01-21T00:00:00Z" },
        { id: "rd-4", edition_id: "ed-1", round_no: 4, name: "Corrida do Farol", date: "2027-02-14", date_status: "confirmada", previous_date: null, date_changed_at: null, entry_deadline_at: "2027-02-11T00:00:00Z" },
      ],
    },
    cup_participations: {
      data: [
        { enrollment_id: "enr-1", round_id: "rd-3", decision: "vou", intent: "controlar", entry_done_at: null, decided_at: "2026-10-01T10:00:00Z" },
        { enrollment_id: "enr-2", round_id: "rd-3", decision: "nao_vou", intent: null, entry_done_at: null, decided_at: "2026-10-01T10:00:00Z" },
      ],
    },
    race_events: {
      data: [
        { id: "race-3", user_id: U1, cup_round_id: "rd-3", race_priority: "b" },
        // Uma prova ligada a uma jornada de outra edição: não entra.
        { id: "race-z", user_id: U1, cup_round_id: "rd-outra", race_priority: "b" },
        { id: "race-3b", user_id: U2, cup_round_id: "rd-3", race_priority: "b" },
      ],
    },
    coach_proactive_pushes: {
      data: [
        { user_id: U1, key: "cup_date_change:rd-3:2027-01-24", trigger: "cup_date_change", sent_at: "2027-01-18T12:00:00Z" },
        { user_id: U1, key: "race_after:race-3:run-1", trigger: "race_after", sent_at: "2027-01-24T12:00:00Z" },
        { user_id: U2, key: "race_morning:race-3b", trigger: "race_morning", sent_at: "2027-01-24T07:30:00Z" },
      ],
    },
    coach_proactive_log: { data: [{ user_id: U1, key: "race_after:race-3:run-1", sent_at: "2027-01-24T20:00:00Z" }] },
    coach_impressions: { data: [{ user_id: U1, key: "cup_date_change:rd-3:2027-01-24" }, { user_id: U2, key: "cup_date_change:rd-3:x" }] },
    cup_audit_log: { data: [{ at: "2026-11-02T18:00:00Z" }] },
    cup_round_publication: { data: [{ round_id: "rd-3", results_ready_at: "2027-01-26T10:00:00Z" }] },
    runs: { data: [{ user_id: U1, race_id: "race-3" }, { user_id: U2, race_id: "race-3b" }] },
    ...over,
  };
}

Deno.test("loadCupNoticeState: sem atletas, nenhuma leitura", async () => {
  const sb = fakeSb(fullTables());
  const r = await loadCupNoticeState(sb, [], NOW, TODAY);
  assertEquals(sb.calls.length, 0);
  assertEquals(r.byUser.size, 0);
  assertEquals(r.noticesOff, false);
});

Deno.test("loadCupNoticeState: sem edições com os avisos ligados (hoje), UMA leitura e mapa vazio", async () => {
  const sb = fakeSb(fullTables({ cup_editions: { data: [] } }));
  const r = await loadCupNoticeState(sb, [U1, U2], NOW, TODAY);
  assertEquals(sb.calls.map((c) => c.table), ["cup_editions"]);
  assertEquals(sb.calls[0].filters, [["eq", "notifications_enabled", true], ["neq", "status", "encerrada"]]);
  assertEquals(r.byUser.size, 0);
});

Deno.test("loadCupNoticeState: sem inscrições com algum aviso ligado, duas leituras", async () => {
  const sb = fakeSb(fullTables({ cup_enrollments: { data: [] } }));
  const r = await loadCupNoticeState(sb, [U1, U2], NOW, TODAY);
  assertEquals(sb.calls.map((c) => c.table), ["cup_editions", "cup_enrollments"]);
  const f = sb.calls[1].filters;
  assert(f.some((x) => x[0] === "eq" && x[1] === "status" && x[2] === "ativa"));
  assert(f.some((x) => x[0] === "or" && String(x[1]).includes("notify_results.eq.true")));
  assertEquals(r.byUser.size, 0);
});

Deno.test("loadCupNoticeState: a M1 em falta cala sem aviso; outro erro do núcleo avisa uma vez e deixa vazio", async () => {
  const missing = await quietly(() => loadCupNoticeState(fakeSb({ cup_editions: { error: { code: "42P01", message: "relation \"cup_editions\" does not exist" } } }), [U1], NOW, TODAY));
  assertEquals(missing.value.byUser.size, 0);
  assertEquals(missing.warns.length, 0);
  const boom = await quietly(() => loadCupNoticeState(fakeSb({ cup_editions: { error: { code: "57014", message: "canceling statement" } } }), [U1], NOW, TODAY));
  assertEquals(boom.value.byUser.size, 0);
  assertEquals(boom.warns.length, 1);
  for (const core of ["cup_enrollments", "cup_rounds", "cup_participations", "race_events"]) {
    const r = await quietly(() => loadCupNoticeState(fakeSb(fullTables({ [core]: { error: { code: "57014", message: "timeout" } } })), [U1, U2], NOW, TODAY));
    assertEquals(r.value.byUser.size, 0, core);
    assertEquals(r.warns.length, 1, core);
    // O aviso leva só a mensagem: nunca ids.
    assertEquals(JSON.stringify(r.warns).includes(U1), false);
  }
});

Deno.test("loadCupNoticeState: monta o estado de cada um, sem linhas de outros atletas", async () => {
  const sb = fakeSb(fullTables());
  const { byUser } = await loadCupNoticeState(sb, [U1, U2], NOW, TODAY);
  const s = byUser.get(U1)!;
  assertEquals(s.edition, {
    id: "ed-1", notificationsEnabled: true, status: "aberta", competitionName: "Troféu de Cascais", seasonLabel: "2026/27", roundLabel: "Jornada",
    entryMode: "por_jornada", timeZone: "Europe/Lisbon", calendarOutAt: "2026-11-02T18:00:00Z",
  });
  assertEquals(s.enrollment.notifyResults, true);
  assertEquals(s.rounds.map((r) => [r.id, r.resultsReadyAt, r.previousDate]), [["rd-3", "2027-01-26T10:00:00Z", "2027-01-17"], ["rd-4", null, null]]);
  assertEquals(s.participations, [{ roundId: "rd-3", decision: "vou", intent: "controlar", entryDoneAt: null, decidedAt: "2026-10-01T10:00:00Z" }]);
  assertEquals(s.races, [{ id: "race-3", roundId: "rd-3", priority: "b" }]);
  assertEquals(s.ranRaceIds, ["race-3"]);
  assertEquals(s.roundPushCounts, { "rd-3": 2 });
  // O último balanço que lhe chegou: a conversa das 20h, depois da notificação.
  assertEquals(s.raceAfterReachedAt, { "race-3": "2027-01-24T20:00:00Z" });
  assertEquals(s.seenKeys, ["cup_date_change:rd-3:2027-01-24"]);
  assertEquals(s.parts, { pushes: true, log: true, seen: true, calendar: true, publication: true, runs: true });
  const s2 = byUser.get(U2)!;
  assertEquals(s2.races, [{ id: "race-3b", roundId: "rd-3", priority: "b" }]);
  assertEquals(s2.participations.map((p) => p.decision), ["nao_vou"]);
  assertEquals(s2.roundPushCounts, { "rd-3": 1 });
  assertEquals(s2.seenKeys, ["cup_date_change:rd-3:x"]);
  // A classificação saiu depois de o balanço lhe ter chegado: é notícia.
  assertEquals(listCupNotices(s, NOW, TODAY).map((c) => c.key), ["cup_results:rd-3"]);
});

Deno.test("loadCupNoticeState: colunas uma a uma — nunca *, dorsal, posição, pontos ou clube; nem cup_results", async () => {
  const sb = fakeSb(fullTables());
  await loadCupNoticeState(sb, [U1, U2], NOW, TODAY);
  assert(sb.calls.length > 5);
  for (const c of sb.calls) {
    assert(c.select, c.table);
    assertEquals(/\*|bib|position|points|team/i.test(c.select!), false, `${c.table}: ${c.select}`);
  }
  assertEquals(sb.calls.some((c) => c.table === "cup_results" || c.table === "cup_standings"), false);
});

Deno.test("loadCupNoticeState: uma leitura acessória que falha cala só o que depende dela", async () => {
  const cases: Array<[string, keyof import("../_shared/formulas/cupNotices.ts").CupNoticeState["parts"]]> = [
    ["coach_proactive_pushes", "pushes"], ["coach_proactive_log", "log"], ["coach_impressions", "seen"],
    ["cup_audit_log", "calendar"], ["cup_round_publication", "publication"], ["runs", "runs"],
  ];
  for (const [table, part] of cases) {
    const r = await quietly(() => loadCupNoticeState(fakeSb(fullTables({ [table]: { error: { code: "57014", message: "timeout" } } })), [U1, U2], NOW, TODAY));
    const s = r.value.byUser.get(U1);
    assert(s, table);
    assertEquals(s!.parts[part], false, table);
    for (const [k, v] of Object.entries(s!.parts)) if (k !== part) assertEquals(v, true, `${table} → ${k}`);
    assertEquals(s!.rounds.length, 2);
    assertEquals(r.warns.length, 1, table);
  }
  // Sem as notificações enviadas, nenhum aviso (e as race_* de jornada como
  // no teto) — mas o tick não salta o atleta: os outros momentos ficam.
  const r = await quietly(() => loadCupNoticeState(fakeSb(fullTables({ coach_proactive_pushes: { error: { message: "x" } } })), [U1], NOW, TODAY));
  const s = r.value.byUser.get(U1)!;
  assertEquals(listCupNotices(s, NOW, TODAY), []);
  const base = [{ trigger: "silence" as const, key: "silence:x", raceId: null, raceName: null, hasRun: false, silenceDays: 4, anchorDate: null, anchorAt: null }];
  assertEquals(cupTickCandidates(base, s, NOW, TODAY).map((c) => c.key), ["silence:x"]);
});

Deno.test("loadCupNoticeState: só lê o que os avisos ligados pedem", async () => {
  // Só o prazo ligado: sem balanços, vistas, auditoria, publicação nem corridas.
  const sb = fakeSb(fullTables({
    cup_enrollments: { data: [ENR({ notify_calendar: false, notify_date_changes: false, notify_results: false })] },
  }));
  const { byUser } = await loadCupNoticeState(sb, [U1], NOW, TODAY);
  assertEquals(sb.calls.map((c) => c.table).sort(), ["coach_proactive_pushes", "cup_editions", "cup_enrollments", "cup_participations", "cup_rounds", "race_events"]);
  assert(byUser.get(U1));
  // As notificações enviadas: só os tipos que contam para o teto e a junção, desde a inscrição.
  const pushes = sb.calls.find((c) => c.table === "coach_proactive_pushes")!;
  assert(pushes.filters.some((f) => f[0] === "in" && f[1] === "trigger" && (f[2] as string[]).includes("cup_results") && (f[2] as string[]).includes("race_after")));
  assert(pushes.filters.some((f) => f[0] === "gte" && f[1] === "sent_date" && f[2] === "2026-09-30"));
});

Deno.test("loadCupNoticeState: as leituras que crescem vão por páginas, com ordem, até esgotar — o teto conta tudo", async () => {
  // 1500 notificações de outras provas antes das 3 desta jornada: numa só
  // resposta (corte nas 1000) a contagem da jornada 3 podia sair abaixo.
  const noise = Array.from({ length: 1500 }, (_, i) => ({ user_id: U1, key: `race_morning:outra-${String(i).padStart(4, "0")}`, trigger: "race_morning", sent_at: "2026-12-01T07:00:00Z" }));
  const mine = [
    { user_id: U1, key: "cup_date_change:rd-3:2027-01-24", trigger: "cup_date_change", sent_at: "2027-01-18T12:00:00Z" },
    { user_id: U1, key: "cup_entry_deadline:rd-3", trigger: "cup_entry_deadline", sent_at: "2027-01-19T08:00:00Z" },
    { user_id: U1, key: "race_morning:race-3", trigger: "race_morning", sent_at: "2027-01-24T07:30:00Z" },
  ];
  const sb = fakeSb(fullTables({ coach_proactive_pushes: { data: [...noise, ...mine] } }));
  const { byUser } = await loadCupNoticeState(sb, [U1], NOW, TODAY);
  const s = byUser.get(U1)!;
  assertEquals(s.parts.pushes, true);
  assertEquals(s.roundPushCounts, { "rd-3": 3 });
  const pushCalls = sb.calls.filter((c) => c.table === "coach_proactive_pushes");
  assertEquals(pushCalls.map((c) => c.filters.find((f) => f[0] === "range")), [["range", 0, CUP_READ_PAGE - 1], ["range", CUP_READ_PAGE, 2 * CUP_READ_PAGE - 1]]);
  // Ordem total (a chave primária) em cada página.
  for (const c of pushCalls) assertEquals(c.filters.filter((f) => f[0] === "order").map((f) => f[1]), ["user_id", "key"]);
  // Com o teto cheio, a manhã da jornada 3 já não sai.
  const morning = { trigger: "race_morning" as const, key: "race_morning:race-3", raceId: "race-3", raceName: "Corrida CCD", hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };
  assertEquals(cupTickCandidates([morning], { ...s, roundPushCounts: { "rd-3": 3 } }, NOW, TODAY).length, 0);
  // Todas as leituras que crescem têm página e ordem; a edição e a auditoria não precisam.
  for (const c of sb.calls.filter((c) => !["cup_editions", "cup_audit_log"].includes(c.table))) {
    assert(c.filters.some((f) => f[0] === "range"), c.table);
    assert(c.filters.some((f) => f[0] === "order"), c.table);
  }
});

Deno.test("loadCupNoticeState: as provas só destas jornadas; sem jornadas, nem se leem", async () => {
  const sb = fakeSb(fullTables());
  await loadCupNoticeState(sb, [U1, U2], NOW, TODAY);
  const races = sb.calls.find((c) => c.table === "race_events")!;
  assert(races.filters.some((f) => f[0] === "in" && f[1] === "cup_round_id" && JSON.stringify(f[2]) === JSON.stringify(["rd-3", "rd-4"])));
  const none = fakeSb(fullTables({ cup_rounds: { data: [] } }));
  const { byUser } = await loadCupNoticeState(none, [U1], NOW, TODAY);
  assertEquals(none.calls.some((c) => c.table === "race_events" || c.table === "runs" || c.table === "cup_round_publication"), false);
  assertEquals(byUser.get(U1)!.races, []);
});

Deno.test("loadCupNoticeState: acima do máximo de páginas é leitura falhada — e sem contagem, as race_* de jornada não passam", async () => {
  const flood = Array.from({ length: CUP_READ_PAGE * CUP_READ_MAX_PAGES + 1 }, (_, i) => ({ user_id: U1, key: `race_eve:x-${i}`, trigger: "race_eve", sent_at: "2026-12-01T07:00:00Z" }));
  const r = await quietly(() => loadCupNoticeState(fakeSb(fullTables({ coach_proactive_pushes: { data: flood } })), [U1], NOW, TODAY));
  const s = r.value.byUser.get(U1)!;
  assertEquals(s.parts.pushes, false);
  assertEquals(r.warns.length, 1);
  assertEquals(listCupNotices(s, NOW, TODAY), []);
  const morning = { trigger: "race_morning" as const, key: "race_morning:race-3", raceId: "race-3", raceName: "Corrida CCD", hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };
  const silence = { trigger: "silence" as const, key: "silence:x", raceId: null, raceName: null, hasRun: false, silenceDays: 4, anchorDate: null, anchorAt: null };
  assertEquals(cupTickCandidates([morning, silence], s, NOW, TODAY).map((c) => c.key), ["silence:x"]);
  // Uma página com erro também: a leitura toda falha, não fica a meio.
  let n = 0;
  const half = fakeSb(fullTables({ coach_proactive_pushes: { data: Array.from({ length: CUP_READ_PAGE + 5 }, (_, i) => ({ user_id: U1, key: `race_eve:y-${i}`, trigger: "race_eve" })) } }));
  const from = half.from.bind(half);
  (half as any).from = (t: string) => {
    const q = from(t);
    if (t !== "coach_proactive_pushes") return q;
    const range = q.range;
    q.range = (a: number, b: number) => {
      const out = range(a, b);
      if (n++ === 1) out.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "timeout" } }).then(res);
      return out;
    };
    return q;
  };
  const h = await quietly(() => loadCupNoticeState(half, [U1], NOW, TODAY));
  assertEquals(h.value.byUser.get(U1)!.parts.pushes, false);
  assertEquals(h.value.byUser.get(U1)!.roundPushCounts, {});
});

Deno.test("loadCupNoticeState: uma exceção nunca rejeita", async () => {
  const sb = { from() { throw new Error("rede"); } };
  const r = await quietly(() => loadCupNoticeState(sb, [U1], NOW, TODAY));
  assertEquals(r.value.byUser.size, 0);
  assertEquals(r.warns.length, 1);
});
