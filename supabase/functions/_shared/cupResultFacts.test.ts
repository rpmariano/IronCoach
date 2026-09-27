// A linha dele na classificação de uma jornada, para o chat (specs/trofeu.md §8, Fase 5).
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { cupResultFactsLine, fetchCupResultFacts, officialTimeText } from "./cupResultFacts.ts";

interface Call { table: string; select: string | null; filters: unknown[][] }
type TableResult = { data?: unknown; error?: unknown };

function fakeSb(tables: Record<string, TableResult>) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      const call: Call = { table, select: null, filters: [] };
      calls.push(call);
      const result = tables[table] ?? { data: null, error: null };
      const chain: any = {};
      chain.select = (cols: string) => {
        call.select = cols;
        return chain;
      };
      for (const m of ["eq", "in", "order", "limit"]) {
        chain[m] = (...a: unknown[]) => {
          call.filters.push([m, ...a]);
          return chain;
        };
      }
      chain.maybeSingle = () => Promise.resolve({ data: result.error ? null : result.data ?? null, error: result.error ?? null });
      return chain;
    },
  };
}

const U = "u-1";
const NOW = new Date("2027-01-26T12:00:00Z");
const ROW = { match_status: "confirmada", position: 41, category_code: "M40", category_position: 12, official_time_s: 2172, points: 7, points_source: "oficial" };

function tables(over: Record<string, TableResult> = {}): Record<string, TableResult> {
  return {
    race_events: { data: { cup_round_id: "rd-3" } },
    cup_rounds: { data: { round_no: 3, name: "Corrida CCD", date: "2027-01-24", edition_id: "ed-1" } },
    cup_round_publication: { data: { results_ready_at: "2027-01-26T10:00:00Z" } },
    cup_editions: {
      data: { points_mode: "tabela", points_table: [15, 13, 11, 10, 9, 8, 7], points_basis: "escalao", notifications_enabled: true, competition: { round_label: "Jornada" } },
    },
    cup_enrollments: { data: { status: "ativa", notify_results: true } },
    cup_results: { data: ROW },
    ...over,
  };
}

Deno.test("officialTimeText", () => {
  assertEquals(officialTimeText(2172), "36:12");
  assertEquals(officialTimeText(3723), "1:02:03");
  assertEquals(officialTimeText(59), "0:59");
  assertEquals(officialTimeText(null), null);
  assertEquals(officialTimeText(0), null);
});

Deno.test("cupResultFactsLine: a linha confirmada, com pontos só quando se sabem", () => {
  const line = cupResultFactsLine({ roundText: "jornada 3 (Corrida CCD)", roundDate: "2027-01-24", row: ROW, pointsKnown: true });
  assertEquals(line, "Classificação oficial da jornada 3 (Corrida CCD), 24 jan — a linha dele: 12.º no escalão M40, 41.º da geral, tempo oficial 36:12, 7 pontos. Só a linha dele: nada de outros atletas, do clube nem do dorsal.");
  const calc = cupResultFactsLine({ roundText: "jornada 3", roundDate: null, row: { ...ROW, points: 1, points_source: "calculado" }, pointsKnown: true });
  assertStringIncludes(calc, "1 ponto (provisórios)");
  const unknown = cupResultFactsLine({ roundText: "jornada 3", roundDate: null, row: ROW, pointsKnown: false });
  assertEquals(/ponto/.test(unknown.split(" Só a linha")[0]), false);
  const bare = cupResultFactsLine({ roundText: "jornada 3", roundDate: null, row: { ...ROW, position: null, category_position: null, official_time_s: null, points: null }, pointsKnown: true });
  assertStringIncludes(bare, "confirmada, sem lugar nem tempo publicados");
});

Deno.test("cupResultFactsLine: por confirmar sem números; sem linha, sem inventar", () => {
  for (const status of ["proposta", "perdida"]) {
    const line = cupResultFactsLine({ roundText: "jornada 3 (Corrida CCD)", roundDate: "2027-01-24", row: { ...ROW, match_status: status }, pointsKnown: true });
    assertStringIncludes(line, "por confirmar no ecrã do Troféu");
    assertStringIncludes(line, "não digas números");
    assertEquals(/\d+\.º|36:12|pontos\b/.test(line), false, line);
  }
  for (const row of [null, { ...ROW, match_status: "rejeitada" }]) {
    const line = cupResultFactsLine({ roundText: "jornada 3 (Corrida CCD)", roundDate: "2027-01-24", row, pointsKnown: true });
    assertStringIncludes(line, "não há linha dele confirmada");
    assertStringIncludes(line, "não inventes lugar nem tempo");
    assertEquals(/\d+\.º|36:12/.test(line), false, line);
  }
});

Deno.test("fetchCupResultFacts: pela jornada (turno cup_results) e pela prova (a junção), só a linha dele", async () => {
  const sb = fakeSb(tables());
  const byRound = await fetchCupResultFacts(sb, U, { roundId: "rd-3" }, { now: NOW });
  assertStringIncludes(byRound!, "Classificação oficial da jornada 3 (Corrida CCD), 24 jan — a linha dele: 12.º no escalão M40");
  assertEquals(sb.calls.some((c) => c.table === "race_events" || c.table === "cup_enrollments"), false);
  const res = sb.calls.find((c) => c.table === "cup_results")!;
  assertEquals(res.filters, [["eq", "user_id", U], ["eq", "round_id", "rd-3"]]);
  // Nunca o dorsal nem colunas de ligação.
  for (const c of sb.calls) assertEquals(/\*|bib|standings_key|match_hash/.test(c.select ?? ""), false, c.select ?? "");

  const sb2 = fakeSb(tables());
  const byRace = await fetchCupResultFacts(sb2, U, { raceId: "race-3" }, { requireNotify: true, now: NOW });
  assertEquals(byRace, byRound);
  const race = sb2.calls.find((c) => c.table === "race_events")!;
  assertEquals(race.filters, [["eq", "id", "race-3"], ["eq", "user_id", U]]);
});

Deno.test("fetchCupResultFacts: sem jornada, sem classificação pronta ou sem o aviso ligado (junção) → null", async () => {
  assertEquals(await fetchCupResultFacts(fakeSb(tables({ race_events: { data: { cup_round_id: null } } })), U, { raceId: "race-x" }, { now: NOW }), null);
  assertEquals(await fetchCupResultFacts(fakeSb(tables({ cup_round_publication: { data: null } })), U, { roundId: "rd-3" }, { now: NOW }), null);
  assertEquals(await fetchCupResultFacts(fakeSb(tables({ cup_round_publication: { data: { results_ready_at: "2027-01-26T13:00:00Z" } } })), U, { roundId: "rd-3" }, { now: NOW }), null);
  const gates: Record<string, TableResult>[] = [
    { cup_enrollments: { data: { status: "ativa", notify_results: false } } },
    { cup_enrollments: { data: { status: "saiu", notify_results: true } } },
    { cup_enrollments: { data: null } },
    { cup_editions: { data: { points_mode: null, points_table: null, points_basis: null, notifications_enabled: false, competition: { round_label: "Jornada" } } } },
  ];
  for (const over of gates) {
    const sb = fakeSb(tables(over));
    assertEquals(await fetchCupResultFacts(sb, U, { raceId: "race-3" }, { requireNotify: true, now: NOW }), null, JSON.stringify(over));
    // Sem o aviso, a linha dele nem se lê.
    assertEquals(sb.calls.some((c) => c.table === "cup_results"), false);
  }
  // O turno cup_results (toque na notificação) não depende do aviso.
  assert(await fetchCupResultFacts(fakeSb(tables({ cup_enrollments: { data: null } })), U, { roundId: "rd-3" }, { now: NOW }));
});

Deno.test("fetchCupResultFacts: qualquer erro → null; a M1 em falta sem aviso", async () => {
  const warns: unknown[][] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => void warns.push(a);
  try {
    for (const t of ["race_events", "cup_rounds", "cup_round_publication", "cup_editions", "cup_enrollments", "cup_results"]) {
      assertEquals(await fetchCupResultFacts(fakeSb(tables({ [t]: { error: { code: "57014", message: "timeout" } } })), U, { raceId: "race-3" }, { requireNotify: true, now: NOW }), null, t);
    }
    assertEquals(warns.length, 6);
    assertEquals(await fetchCupResultFacts(fakeSb(tables({ cup_rounds: { error: { code: "42P01", message: "relation \"cup_rounds\" does not exist" } } })), U, { roundId: "rd-3" }, { now: NOW }), null);
    assertEquals(warns.length, 6);
    assertEquals(await fetchCupResultFacts({ from() { throw new Error("rede"); } }, U, { roundId: "rd-3" }), null);
    assertEquals(JSON.stringify(warns).includes(U), false);
  } finally {
    console.warn = orig;
  }
});
