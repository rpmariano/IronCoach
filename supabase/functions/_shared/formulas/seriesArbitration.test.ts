import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  arbitrateSeries,
  isSeriesIntent,
  principalWindow,
  SERIES_INTENTS,
  SKIP_AFTER_DAYS,
  SKIP_BEFORE_DAYS,
  type ArbitrationInput,
  type ArbitrationRace,
  type ArbitrationRound,
  type RoundRole,
} from "./seriesArbitration.ts";
import { racePriorityOf } from "./mainRace.ts";

/* A arbitragem das jornadas com as principais (specs/trofeu.md §5, Fase 2,
   2026-09-26). O golden das personas A–K e dos casos X1–X5 fixa a tabela
   inteira (seriesPersonas.golden.json, lido também pelo Vitest em
   src/utils/seriesArbitration.spec.js); as propriedades de baixo correm
   sobre o golden e sobre calendários gerados ao acaso, com semente fixa. */

// deno-lint-ignore no-explicit-any
type Json = any;

const golden: Json = JSON.parse(await Deno.readTextFile(new URL("./seriesPersonas.golden.json", import.meta.url)));

const toGolden = (r: RoundRole) => ({
  roundId: r.roundId,
  intent: r.intent,
  reason: r.reason,
  principalId: r.principal?.id ?? null,
  offsetDays: r.offsetDays,
  gapDays: r.gapDays,
  refRoundId: r.refRoundId,
  every: r.every,
});

const inputOf = (p: Json): ArbitrationInput => ({
  rounds: p.rounds,
  races: p.races,
  level: p.level,
  seasonGoal: p.seasonGoal,
  todayISO: p.today,
});

const persona = (id: string) => golden.personas.find((p: Json) => p.id === id);

// ── O golden ────────────────────────────────────────────────────────────

for (const p of golden.personas) {
  if (!p.expect) {
    Deno.test(`persona ${p.id} — não inscrito: não há papéis a calcular (a invariância testa-se no servidor e no cliente)`, () => {
      assertEquals(p.enrolled, false);
      assertEquals(p.expect, null);
    });
    continue;
  }
  Deno.test(`persona ${p.id} — ${p.desc}`, () => {
    assertEquals(arbitrateSeries(inputOf(p)).map(toGolden), p.expect.roles);
  });
}

for (const x of golden.extra) {
  Deno.test(`caso ${x.id} — ${x.desc}`, () => {
    assertEquals(arbitrateSeries(inputOf(x)).map(toGolden), x.expect.roles);
  });
}

Deno.test("principalWindow — a tabela das janelas (24 casos: 4 níveis × 6 distâncias)", () => {
  assertEquals(golden.windows.length, 24);
  for (const w of golden.windows) {
    assertEquals(
      principalWindow({ distance_km: w.distance_km, race_type: w.race_type }, w.level),
      w.expect,
      `${w.level} ${w.distance_km} km ${w.race_type}`,
    );
  }
});

Deno.test("principalWindow — nível em falta ou inválido é iniciante", () => {
  const meia = { distance_km: 21.1, race_type: "estrada" };
  assertEquals(principalWindow(meia, null), principalWindow(meia, "iniciante"));
  assertEquals(principalWindow(meia, "xyz"), principalWindow(meia, "iniciante"));
});

Deno.test("a principal da janela vem com nome e data (o texto da Carol usa-os)", () => {
  const roles = arbitrateSeries(inputOf(persona("F")));
  const j5 = roles.find((r) => r.roundId === "j5")!;
  assertEquals(j5.principal, { id: "p-maratona", name: "Maratona da Primavera", date: "2027-03-14" });
  assertEquals(j5.offsetDays, -21);
});

Deno.test("nível inválido é iniciante; hoje com horas lê-se como o dia", () => {
  const x5 = golden.extra.find((x: Json) => x.id === "X5");
  const base = arbitrateSeries(inputOf(x5));
  assertEquals(arbitrateSeries({ ...inputOf(x5), level: "xyz" }), base);
  assertEquals(arbitrateSeries({ ...inputOf(x5), level: "iniciante" }), base);
  assertEquals(arbitrateSeries({ ...inputOf(x5), todayISO: `${x5.today}T23:59:00Z` }), base);
});

// ── A escolha dele ──────────────────────────────────────────────────────

Deno.test("a escolha dele não muda o papel proposto dessa jornada, só a sequência (o exemplo do bloco, persona F)", () => {
  const f = persona("F");
  const rounds = f.rounds.map((r: Json) => r.id === "j2" ? { ...r, decision: "vou", intent: "controlar", intent_source: "atleta" } : r);
  const roles = arbitrateSeries({ ...inputOf(f), rounds });
  const byId = Object.fromEntries(roles.map((r) => [r.roundId, r]));
  assertEquals([byId.j2.intent, byId.j2.reason], ["atacar", "progressao_atacar"]);
  // Controlou a J2: a J3 passa a ser a vez de atacar.
  assertEquals([byId.j3.intent, byId.j3.reason, byId.j3.every], ["atacar", "progressao_atacar", 2]);
  // Sem a escolha dele, a J3 era controlar.
  const base = Object.fromEntries(arbitrateSeries(inputOf(f)).map((r) => [r.roundId, r]));
  assertEquals(base.j3.intent, "controlar");
});

Deno.test("uma intenção sugerida (intent_source 'sugerida') não conta como escolha dele", () => {
  const f = persona("F");
  const rounds = f.rounds.map((r: Json) => r.id === "j2" ? { ...r, intent: "controlar", intent_source: "sugerida" } : r);
  assertEquals(arbitrateSeries({ ...inputOf(f), rounds }), arbitrateSeries(inputOf(f)));
});

Deno.test("uma intenção gravada que não é um papel ignora-se", () => {
  const f = persona("F");
  const rounds = f.rounds.map((r: Json) => r.id === "j2" ? { ...r, intent: "xyz", intent_source: "atleta" } : r);
  assertEquals(arbitrateSeries({ ...inputOf(f), rounds }), arbitrateSeries(inputOf(f)));
});

// ── A sequência depois das principais ───────────────────────────────────

const R = (id: string, round_no: number, date: string, extra: Partial<ArbitrationRound> = {}): ArbitrationRound => ({
  id,
  round_no,
  date,
  date_status: "confirmada",
  distance_km: 8,
  decision: null,
  intent: null,
  intent_source: null,
  done: false,
  ...extra,
});

Deno.test("uma jornada promovida a principal, já passada e feita, conta como um ataque", () => {
  // Básico, 10 km promovida a principal a 7/3; hoje 10/3. A seguinte (+7,
  // fora da recuperação de 6 dias) fica a 7 dias de um ataque → par curto.
  const roles = arbitrateSeries({
    rounds: [
      R("j5", 5, "2027-02-21", { done: true, intent: "controlar", intent_source: "atleta" }),
      R("j6", 6, "2027-03-07", { distance_km: 10, done: true }),
      R("j7", 7, "2027-03-14"),
    ],
    races: [{ id: "race-j6", date: "2027-03-07", distance_km: 10, race_type: "estrada", race_priority: "a", status: "concluida", cup_round_id: "j6" }],
    level: "basico",
    seasonGoal: "participar",
    todayISO: "2027-03-10",
  });
  assertEquals(roles.map(toGolden)[2], {
    roundId: "j7", intent: "controlar", reason: "par_curto", principalId: null, offsetDays: null, gapDays: 7, refRoundId: "j6", every: null,
  });
});

Deno.test("uma principal ligada a uma jornada ainda sem data confirmada recomeça a progressão na mesma", () => {
  // A jornada promovida está 'provavel' (sem papel), mas a prova principal
  // tem data: é um ataque, e a contagem recomeça depois dela.
  const roles = arbitrateSeries({
    rounds: [
      R("a", 1, "2027-01-10"),
      R("b", 2, "2027-01-24", { date_status: "provavel" }),
      R("c", 3, "2027-02-07"),
    ],
    races: [{ id: "race-b", date: "2027-01-24", distance_km: 10, race_type: "estrada", race_priority: "a", status: "agendada", cup_round_id: "b" }],
    level: "basico",
    seasonGoal: "participar",
    todayISO: "2027-01-01",
  });
  assertEquals(roles.map((r) => [r.roundId, r.intent, r.reason]), [
    ["a", "controlar", "progressao"],
    ["b", null, "sem_data"],
    ["c", "controlar", "progressao"], // sem a principal, era a vez de atacar
  ]);
});

Deno.test("uma prova b ou c nunca é principal; race_priority null é", () => {
  const base = {
    rounds: [R("a", 1, "2027-01-10"), R("b", 2, "2027-01-17")],
    level: "medio",
    seasonGoal: "participar",
    todayISO: "2027-01-01",
  };
  const race = { id: "p", date: "2027-01-17", distance_km: 10, race_type: "estrada", status: "agendada", cup_round_id: null };
  for (const prio of ["b", "c"]) {
    const roles = arbitrateSeries({ ...base, races: [{ ...race, race_priority: prio }] });
    assertEquals(roles.map((r) => r.reason), ["livre", "livre"], prio);
  }
  const roles = arbitrateSeries({ ...base, races: [{ ...race, race_priority: null }] });
  assertEquals(roles.map((r) => r.reason), ["polimento_da_principal", "dia_da_principal"]);
});

// ── Propriedades (A.4) sobre o golden e sobre calendários ao acaso ──────

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

function randomScenario(rand: () => number): ArbitrationInput {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const n = 1 + Math.floor(rand() * 12);
  const rounds: ArbitrationRound[] = [];
  let date = addDays("2026-12-06", Math.floor(rand() * 10));
  for (let i = 0; i < n; i += 1) {
    const status = pick(["confirmada", "confirmada", "confirmada", "confirmada", "confirmada", "confirmada", "provavel", "adiada", "cancelada", null]);
    rounds.push({
      id: `r${i}`,
      round_no: i + 1,
      date: status === "confirmada" || rand() < 0.5 ? date : null,
      date_status: status,
      distance_km: pick([5, 7, 7.4, 8, 10, 21.1, null]),
      decision: pick([null, null, "vou", "nao_vou", "nao_sei", "nao_fui"]),
      intent: pick([null, null, "atacar", "controlar", "trote", "saltar"]),
      intent_source: pick([null, "atleta", "sugerida"]),
      done: rand() < 0.5,
    });
    date = addDays(date, pick([1, 6, 7, 7, 14, 14, 21]));
  }
  const races: ArbitrationRace[] = [];
  const nr = Math.floor(rand() * 5);
  for (let i = 0; i < nr; i += 1) {
    const linked = rand() < 0.2 ? pick(rounds) : null;
    const trail = rand() < 0.2;
    // Metade das principais cai perto de uma jornada, para as janelas curtas
    // (o dia, os 2 antes e os 4 depois) aparecerem de facto.
    const near = pick(rounds).date;
    const date = linked
      ? linked.date
      : near && rand() < 0.5
      ? addDays(near, pick([-14, -7, -3, -2, -1, 0, 1, 2, 4, 5, 7, 14, 21]))
      : rand() < 0.95
      ? addDays("2026-11-01", Math.floor(rand() * 240))
      : null;
    races.push({
      id: `p${i}`,
      name: rand() < 0.8 ? `Prova ${i}` : null,
      date,
      distance_km: trail ? pick([15, 25, 60]) : pick([5, 10, 21.1, 42.2, 60, null]),
      race_type: trail ? "trail" : "estrada",
      race_priority: pick([null, "a", "a", "b", "c"]),
      status: pick(["agendada", "concluida"]),
      cup_round_id: linked?.id ?? null,
    });
  }
  return {
    rounds,
    races,
    level: pick(["iniciante", "basico", "medio", "avancado", null, "xyz"]),
    seasonGoal: pick([null, "participar", "premio", "pontos_clube", "marcas"]),
    todayISO: addDays("2026-11-20", Math.floor(rand() * 90)),
  };
}

function shuffled<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SCENARIOS: Array<{ name: string; input: ArbitrationInput }> = [
  ...golden.personas.filter((p: Json) => p.expect).map((p: Json) => ({ name: `persona ${p.id}`, input: inputOf(p) })),
  ...golden.extra.map((x: Json) => ({ name: `caso ${x.id}`, input: inputOf(x) })),
  ...(() => {
    const rand = mulberry32(20260926);
    return Array.from({ length: 400 }, (_, i) => ({ name: `ao acaso #${i}`, input: randomScenario(rand) }));
  })(),
];

const dayOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

Deno.test("propriedade — uma por jornada, com o comprimento e a ordem de input.rounds", () => {
  for (const { name, input } of SCENARIOS) {
    const roles = arbitrateSeries(input);
    assertEquals(roles.length, input.rounds.length, name);
    roles.forEach((r, i) => assertEquals(r.roundId, input.rounds[i].id, name));
  }
});

Deno.test("propriedade — a mesma saída por jornada com as jornadas e as provas baralhadas", () => {
  const rand = mulberry32(7);
  for (const { name, input } of SCENARIOS) {
    const base = Object.fromEntries(arbitrateSeries(input).map((r) => [r.roundId, r]));
    for (let t = 0; t < 3; t += 1) {
      const mixed = arbitrateSeries({ ...input, rounds: shuffled(input.rounds, rand), races: shuffled(input.races, rand) });
      assertEquals(Object.fromEntries(mixed.map((r) => [r.roundId, r])), base, name);
    }
  }
});

Deno.test("propriedade — nunca atacar do dia −2 ao dia +4 de uma principal que não seja a própria jornada", () => {
  for (const { name, input } of SCENARIOS) {
    const roles = arbitrateSeries(input);
    roles.forEach((role, i) => {
      if (role.intent !== "atacar" || role.reason === "e_principal") return;
      const D = dayOf(input.rounds[i].date)!;
      for (const p of input.races) {
        if (!dayOf(p.date) || racePriorityOf(p) !== "a" || p.cup_round_id === input.rounds[i].id) continue;
        const d = daysBetween(D, dayOf(p.date)!);
        assert(d < -SKIP_BEFORE_DAYS || d > SKIP_AFTER_DAYS, `${name}: ${role.roundId} ataca a ${d} dias de ${p.id}`);
      }
    });
  }
});

Deno.test("propriedade — a escolha dele (intent_source 'atleta') nunca muda o papel proposto dessa jornada, nem os das anteriores", () => {
  for (const { name, input } of SCENARIOS) {
    const base = arbitrateSeries(input);
    input.rounds.forEach((r, i) => {
      for (const intent of SERIES_INTENTS) {
        const rounds = input.rounds.map((x, j) => (j === i ? { ...x, intent, intent_source: "atleta" } : x));
        const got = arbitrateSeries({ ...input, rounds });
        assertEquals([got[i].intent, got[i].reason], [base[i].intent, base[i].reason], `${name}: ${r.id} ← ${intent}`);
        const D = dayOf(r.date);
        if (!D) continue;
        input.rounds.forEach((y, j) => {
          const Dy = dayOf(y.date);
          if (Dy && Dy < D) assertEquals(got[j], base[j], `${name}: ${y.id} antes de ${r.id} ← ${intent}`);
        });
      }
    });
  }
});

Deno.test("propriedade — sem data confirmada não há papel; com papel, é de hoje em diante e ele não disse que não vai", () => {
  for (const { name, input } of SCENARIOS) {
    const today = dayOf(input.todayISO)!;
    arbitrateSeries(input).forEach((role, i) => {
      const r = input.rounds[i];
      if (r.date_status !== "confirmada" || !dayOf(r.date)) {
        assertEquals(role.intent, null, name);
        assert(role.reason === "sem_data" || role.reason === "cancelada", `${name}: ${role.reason}`);
      }
      if (role.intent != null) {
        assert(isSeriesIntent(role.intent), name);
        assert(dayOf(r.date)! >= today, `${name}: ${r.id} tem papel antes de hoje`);
        assert(r.decision !== "nao_vou" && r.decision !== "nao_fui", `${name}: ${r.id} tem papel sem ir`);
      }
    });
  }
});

Deno.test("propriedade — cada razão traz os seus campos, e só esses", () => {
  const WINDOW = new Set(["e_principal", "dia_da_principal", "encostada_a_principal", "polimento_da_principal", "recuperacao_da_principal", "recuperacao_da_maratona"]);
  const GAP = new Set(["par_curto", "recuperacao_da_jornada"]);
  const EVERY = new Set(["progressao", "progressao_atacar"]);
  for (const { name, input } of SCENARIOS) {
    for (const role of arbitrateSeries(input)) {
      assertEquals(role.principal != null && role.offsetDays != null, WINDOW.has(role.reason), `${name}: ${role.roundId} ${role.reason}`);
      assertEquals(role.gapDays != null, GAP.has(role.reason), `${name}: ${role.roundId} ${role.reason}`);
      assertEquals(role.every != null, EVERY.has(role.reason), `${name}: ${role.roundId} ${role.reason}`);
      if (role.reason === "par_curto") assert(role.gapDays! <= 7, name);
    }
  }
});
