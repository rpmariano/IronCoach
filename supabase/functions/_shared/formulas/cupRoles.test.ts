import { assert, assertEquals } from "jsr:@std/assert@1";
import { cupRoundRoles, promotionImpact, type CupRolesInput } from "./cupRoles.ts";
import { getTaperDays } from "./taper.ts";
import { principalWindow } from "./seriesArbitration.ts";
import { CASCAIS_34, CASCAIS_CATEGORIES, CASCAIS_COURSES, CASCAIS_OVERRIDES, CASCAIS_ROUNDS } from "./cup.fixtures.ts";

/* Os papéis das jornadas a partir das linhas da competição, e o custo de
   promover uma jornada a principal (specs/trofeu.md §4.3, Fase 3,
   2026-09-27). A paridade com o bloco da Carol (personas A–K) está em
   ../seriesBlock.test.ts. */

// Jornadas semanais de 8 km; uma principal de fora (a Meia) a 14/03.
const ROUNDS = [
  { id: "j1", round_no: 1, name: "Prova 1", date: "2027-01-10", date_status: "confirmada" },
  { id: "j2", round_no: 2, name: "Prova 2", date: "2027-01-31", date_status: "confirmada" },
  { id: "j3", round_no: 3, name: "Prova 3", date: "2027-02-07", date_status: "confirmada" },
  { id: "j4", round_no: 4, name: "Prova 4", date: "2027-02-12", date_status: "confirmada" },
  { id: "j5", round_no: 5, name: "Prova 5", date: "2027-03-07", date_status: "confirmada" },
];
const race = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id: `r${id}`, name: `Prova ${id.slice(1)}`, date, distance_km: 8, race_type: "estrada", race_priority: "b", status: "agendada", cup_round_id: id, ...extra,
});
const MEIA = { id: "meia", name: "Meia de Lisboa", date: "2027-03-14", distance_km: 21.1, race_type: "estrada", race_priority: "a", status: "agendada", cup_round_id: null };

function input(extra: Partial<CupRolesInput> = {}): CupRolesInput {
  return {
    edition: CASCAIS_34,
    rounds: ROUNDS,
    participations: ROUNDS.slice(1).map((r) => ({ round_id: r.id, decision: "vou", intent: null, intent_source: null })),
    categories: [],
    courses: ROUNDS.map((r) => ({ round_id: r.id, code: "U", distance_m: 8000, start_time: "10:00:00" })),
    overrides: [],
    races: [race("j2", "2027-01-31"), race("j3", "2027-02-07"), race("j4", "2027-02-12"), race("j5", "2027-03-07"), MEIA],
    runs: [],
    profile: { experience_level: "medio" },
    seasonGoal: "premio",
    todayISO: "2027-01-11",
    ...extra,
  };
}

Deno.test("cupRoundRoles: um papel por jornada, pela ordem das jornadas; sem dia válido, []", () => {
  const roles = cupRoundRoles(input());
  assertEquals(roles.map((r) => [r.roundId, r.intent, r.reason]), [
    ["j1", null, "passada"],
    ["j2", "atacar", "livre"],
    ["j3", "atacar", "livre"],
    ["j4", "controlar", "recuperacao_da_jornada"],
    ["j5", "controlar", "polimento_da_principal"],
  ]);
  assertEquals(roles[4].principal, { id: "meia", name: "Meia de Lisboa", date: "2027-03-14" });
  assertEquals(cupRoundRoles(input({ todayISO: "" })), []);
});

Deno.test("cupRoundRoles: a escolha dele não muda o papel proposto; 'nao_vou' fica sem papel", () => {
  const parts = input().participations!.map((p) => (p.round_id === "j3" ? { ...p, intent: "trote", intent_source: "atleta" } : p.round_id === "j4" ? { ...p, decision: "nao_vou" } : p));
  const roles = cupRoundRoles(input({ participations: parts }));
  assertEquals(roles[2].intent, "atacar");
  assertEquals([roles[3].intent, roles[3].reason], [null, "nao_vai"]);
});

Deno.test("cupRoundRoles: sobre o catálogo de Cascais (escalões, exceções, provável, sem data, cancelada)", () => {
  const roles = cupRoundRoles({
    edition: CASCAIS_34,
    rounds: CASCAIS_ROUNDS,
    participations: [],
    categories: CASCAIS_CATEGORIES,
    courses: CASCAIS_COURSES,
    overrides: CASCAIS_OVERRIDES,
    races: [],
    runs: [],
    profile: { birth_date: "1982-01-24", gender: "M", experience_level: "avancado" },
    seasonGoal: "participar",
    todayISO: "2026-12-01",
  });
  assertEquals(roles.length, CASCAIS_ROUNDS.length);
  // Provável e sem data: sem papel; cancelada: cancelada.
  assertEquals(roles.map((r) => r.reason), ["sem_data", "livre", "livre", "livre", "sem_data", "cancelada"]);
});

Deno.test("cupRoundRoles: as provas lidas como o servidor as lê (sem jornada, só dos últimos 60 dias)", () => {
  // Básico: uma jornada feita a 01/11 conta como controlada (k = 1); uma
  // principal depois dela recomeça a progressão (k = 0). Se a principal for
  // de há 61 dias, o servidor não a lê — e o cliente também não pode.
  const j0 = { id: "j0", round_no: 0, name: "Prova 0", date: "2026-11-01", date_status: "confirmada" };
  const feita = race("j0", "2026-11-01", { status: "concluida" });
  const principal = (date: string) => ({ id: "p", name: "10 km", date, distance_km: 10, race_type: "estrada", race_priority: "a", status: "concluida", cup_round_id: null });
  const base = input({ rounds: [j0, ...ROUNDS], races: [...input().races!, feita], profile: { experience_level: "basico" } });
  const j2 = (extra: unknown[]) => cupRoundRoles({ ...base, races: [...base.races!, ...extra] as CupRolesInput["races"] })[2];
  assertEquals([j2([]).intent, j2([]).reason], ["atacar", "progressao_atacar"]);
  // 61 dias antes de 11/01 (e uma sem data): fora — tudo igual.
  assertEquals(j2([principal("2026-11-11"), { ...principal("x"), id: "sem", date: null }]), j2([]));
  // 60 dias: lida — a progressão recomeça depois dela.
  assertEquals([j2([principal("2026-11-12")]).intent, j2([principal("2026-11-12")]).reason], ["controlar", "progressao"]);
});

Deno.test("promotionImpact: o custo antes de gravar — taper, recuperação e as outras jornadas que mudam", () => {
  const imp = promotionImpact(input(), "j3")!;
  assertEquals(imp.raceId, "rj3");
  assertEquals(imp.taperDays, getTaperDays(8, "a", "medio", "estrada"));
  assertEquals(imp.recoveryDays, principalWindow({ distance_km: 8, race_type: "estrada" }, "medio").recoveryDays);
  assertEquals([imp.taperDays, imp.recoveryDays], [10, 5]);
  // A J2 (7 dias antes) passa ao polimento; a J4 (5 depois) à recuperação.
  // A própria J3 não entra na lista.
  assertEquals(imp.changes, [
    { roundId: "j2", from: "atacar", to: "controlar" },
    { roundId: "j4", from: "controlar", to: "trote" },
  ]);
  assertEquals(imp.near, []);
  // Básico: outra cadência, outro custo.
  const b = promotionImpact(input({ profile: { experience_level: "basico" } }), "j3")!;
  assertEquals([b.taperDays, b.recoveryDays], [7, 6]);
  assertEquals(b.changes, [{ roundId: "j4", from: "controlar", to: "trote" }]);
});

Deno.test("promotionImpact: nada é gravado nem mexido — as provas de entrada ficam iguais", () => {
  const inp = input();
  const before = JSON.stringify(inp);
  promotionImpact(inp, "j3");
  assertEquals(JSON.stringify(inp), before);
  assertEquals(inp.races!.find((r) => r?.id === "rj3")!.race_priority, "b");
});

Deno.test("promotionImpact: as principais de fora perto (janelas cruzadas) — e só essas", () => {
  // A J5 é 7 dias antes da Meia: cai no polimento dela.
  const imp = promotionImpact(input(), "j5")!;
  assertEquals(imp.near.map((r) => r.id), ["meia"]);
  assertEquals(imp.changes, []);
  // Longe dela (J3, 35 dias antes), não.
  assertEquals(promotionImpact(input(), "j3")!.near, []);
  // A principal na janela da JORNADA (recuperação dela), mesmo fora da janela da principal.
  const logoDepois = { ...MEIA, id: "10k", name: "10 km", distance_km: 10, date: "2027-03-12" };
  assertEquals(promotionImpact(input({ races: [...input().races!.filter((r) => r?.id !== "meia"), logoDepois] }), "j5")!.near.map((r) => r.id), ["10k"]);
  // Concluída, já passada, secundária, ou outra jornada: nunca.
  for (const r of [{ ...MEIA, status: "concluida" }, { ...MEIA, race_priority: "b" }, { ...MEIA, date: "2027-01-05" }, { ...MEIA, cup_round_id: "outra" }]) {
    const races = [...input().races!.filter((x) => x?.id !== "meia"), r];
    assertEquals(promotionImpact(input({ races }), "j5")!.near, [], JSON.stringify(r));
  }
});

Deno.test("promotionImpact: sem prova ligada à jornada → null; distância do percurso quando a prova não a tem", () => {
  assertEquals(promotionImpact(input(), "j1"), null);
  assertEquals(promotionImpact(input(), "nao-existe"), null);
  assertEquals(promotionImpact(input(), ""), null);
  const semKm = input({ races: input().races!.map((r) => (r?.id === "rj3" ? { ...r, distance_km: null } : r)) });
  const imp = promotionImpact(semKm, "j3")!;
  assert(imp);
  assertEquals([imp.taperDays, imp.recoveryDays], [10, 5]);
});
