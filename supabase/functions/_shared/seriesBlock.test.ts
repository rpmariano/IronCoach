import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildCupMapTurn,
  buildSeriesBlock,
  fetchSeriesBlock,
  isCupSchemaMissing,
  pickSeriesEnrollment,
  seriesPromptSection,
  seriesRacePhaseText,
  type SeriesBlock,
  type SeriesBlockInput,
  type SeriesChannel,
} from "./seriesBlock.ts";
import type { RoundRole } from "./formulas/seriesArbitration.ts";

/* O bloco COMPETIÇÃO POR JORNADAS (specs/trofeu.md §5, Fase 2, 2026-09-26).
   Os textos correm sobre buildSeriesBlock (puro), montado a partir das
   personas A–K do golden das fórmulas (seriesPersonas.golden.json); as
   leituras correm sobre um Supabase falso que regista cada tabela, o select
   e os filtros — é assim que se prova "uma só leitura sem inscrição" e "o
   dorsal nunca é lido". */

// deno-lint-ignore no-explicit-any
type Json = any;

const golden: Json = JSON.parse(await Deno.readTextFile(new URL("./formulas/seriesPersonas.golden.json", import.meta.url)));
const persona = (id: string) => golden.personas.find((p: Json) => p.id === id);

// ── Um Supabase falso ─────────────────────────────────────────────────────
// Regista tabela, colunas do select e filtros. eq/neq/in filtram as linhas
// que têm essa coluna (as que não a têm passam, como num select parcial).

interface Call { table: string; select: string | null; filters: unknown[][] }
type TableResult = { data?: unknown; error?: unknown };

function fakeSb(tables: Record<string, TableResult>, rpcResults: Record<string, TableResult> = {}) {
  const calls: Call[] = [];
  const rpcs: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    rpcs,
    from(table: string) {
      const call: Call = { table, select: null, filters: [] };
      calls.push(call);
      const result = tables[table] ?? { data: [], error: null };
      let rows: unknown = result.data ?? null;
      const keep = (pred: (row: Json) => boolean) => {
        if (Array.isArray(rows)) rows = rows.filter((r: Json) => pred(r));
      };
      // deno-lint-ignore no-explicit-any
      const chain: any = {};
      chain.select = (cols: string) => { call.select = cols; return chain; };
      chain.eq = (col: string, val: unknown) => { call.filters.push(["eq", col, val]); keep((r) => !(col in r) || r[col] === val); return chain; };
      chain.neq = (col: string, val: unknown) => { call.filters.push(["neq", col, val]); keep((r) => !(col in r) || r[col] !== val); return chain; };
      chain.in = (col: string, vals: unknown[]) => { call.filters.push(["in", col, vals]); keep((r) => !(col in r) || vals.includes(r[col])); return chain; };
      for (const m of ["gte", "lte", "lt", "or", "not", "order", "limit", "is"]) {
        chain[m] = (...a: unknown[]) => { call.filters.push([m, ...a]); return chain; };
      }
      const payload = () => ({ data: result.error ? null : rows, error: result.error ?? null });
      chain.maybeSingle = () => Promise.resolve({ ...payload(), data: Array.isArray(rows) ? rows[0] ?? null : rows });
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(payload()).then(resolve, reject);
      return chain;
    },
    rpc(fn: string, args: unknown) {
      rpcs.push({ fn, args });
      const r = rpcResults[fn] ?? { data: null, error: null };
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
  };
}

// ── As personas como linhas da BD ─────────────────────────────────────────

const TEAM_BY_KIND: Record<string, Json> = {
  clube_elegivel: { team_id: "t-1", team: { kind: "clube", eligible_final: true } },
  clube_aberto: { team_id: "t-1", team: { kind: "clube", eligible_final: false } },
  individual_elegivel: { team_id: "t-1", team: { kind: "individual", eligible_final: true } },
  individual_aberto: { team_id: "t-1", team: { kind: "individual", eligible_final: false } },
  clube_por_confirmar: { team_other: "Clube Novo da Vila" },
};

/** A persona do golden como o que fetchSeriesBlock leria: a inscrição, a
 *  edição, as jornadas (com um percurso único à distância dela), as
 *  participações, as principais e as provas das jornadas feitas. */
function personaInput(p: Json, channel: SeriesChannel = "chat", extra: Partial<SeriesBlockInput> = {}): SeriesBlockInput {
  const ed = golden.editions[p.edition];
  const t = TEAM_BY_KIND[p.kind];
  const roundById = new Map(p.rounds.map((r: Json) => [r.id, r]));
  return {
    todayISO: p.today,
    channel,
    enrollments: [{
      id: `enr-${p.id}`, edition_id: ed.id, team_id: t.team_id ?? null, team_other: t.team_other ?? null,
      is_federated: false, season_goal: p.seasonGoal, status: "ativa", joined_at: "2026-10-01T10:00:00Z", left_at: null,
      bib: "BIB-4321",
    }],
    edition: { ...ed, edition_no: 34, season_label: "2026/27", competition: { short_name: "Troféu de Teste", round_label: "Jornada" } },
    teams: t.team ? [{ id: "t-1", edition_id: ed.id, ...t.team }] : [],
    categories: [],
    rounds: p.rounds.map((r: Json) => ({ id: r.id, round_no: r.round_no, name: `Prova ${r.round_no}`, date: r.date, date_status: r.date_status })),
    courses: p.rounds.map((r: Json) => ({ round_id: r.id, code: "U", distance_m: Math.round(r.distance_km * 1000), start_time: "10:00:00" })),
    overrides: [],
    participations: p.rounds
      .filter((r: Json) => r.decision || r.intent)
      .map((r: Json) => ({ round_id: r.id, decision: r.decision, decision_source: r.decision_source ?? null, intent: r.intent, intent_source: r.intent_source })),
    races: [
      ...p.races,
      ...p.attendanceRaces.map((a: Json) => ({
        ...a, name: `Prova ${(roundById.get(a.cup_round_id) as Json).round_no}`, date: (roundById.get(a.cup_round_id) as Json).date,
        distance_km: (roundById.get(a.cup_round_id) as Json).distance_km, race_type: "estrada", race_priority: "b",
      })),
    ],
    runs: [],
    results: p.results,
    summaries: [],
    summaryEditions: [],
    profile: { birth_date: null, gender: null, experience_level: p.level },
    notes: [],
    ...extra,
  };
}

const ENROLLED = golden.personas.filter((p: Json) => p.expect);

const toGolden = (r: RoundRole) => ({
  roundId: r.roundId, intent: r.intent, reason: r.reason, principalId: r.principal?.id ?? null,
  offsetDays: r.offsetDays, gapDays: r.gapDays, refRoundId: r.refRoundId, every: r.every,
});

// ── O exemplo do desenho (D.3): a persona F com nomes, percursos e horas ──

const EX_NAMES = ["Corrida da Padroeira", "Corta-mato do Parque", "Corrida do Clube", "GP da Vila", "GP das Dunas", "Corrida do Farol", "Légua da Serra", "Corrida da Liberdade", "Milha da Marginal", "Corrida do Mar", "Corrida Final"];
const EX_DATES = ["2026-12-06", "2027-01-10", "2027-01-24", "2027-02-07", "2027-02-21", "2027-03-07", "2027-03-21", "2027-04-11", "2027-04-17", "2027-05-09", "2027-05-16"];
const EX_KM = [7, 8, 7.4, 8, 7, 10, 7, 8, 7, 7, 10];

const EX_TABLES: Record<string, TableResult> = {
  cup_enrollments: { data: [{ id: "enr-f", edition_id: "ed-t", team_id: "t-a", team_other: null, is_federated: false, season_goal: "premio", status: "ativa", joined_at: "2026-10-01T10:00:00Z", left_at: null, bib: "BIB-4321" }] },
  cup_editions: {
    data: [
      { id: "ed-t", edition_no: 34, season_label: "2026/27", status: "aberta", points_mode: "tabela", points_table: [15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], points_basis: null, team_scoring: "soma_todos", counting_rule: "pct_minima", counting_value: 70, age_rule: null, competition: { short_name: "Troféu de Teste", round_label: "Jornada" } },
      { id: "ed-33", season_label: "2025/26", competition: { short_name: "Troféu de Teste" } },
    ],
  },
  cup_rounds: { data: EX_DATES.map((d, i) => ({ id: `j${i + 1}`, round_no: i + 1, name: EX_NAMES[i], date: d, date_status: "confirmada", previous_date: null, location: null, terrain: "estrada" })) },
  cup_participations: {
    data: [
      { round_id: "j1", decision: "vou", decision_source: "atleta", intent: null, intent_source: null },
      { round_id: "j2", decision: "vou", decision_source: "atleta", intent: "controlar", intent_source: "atleta" },
      { round_id: "j3", decision: "nao_sei", decision_source: "atleta", intent: null, intent_source: null },
    ],
  },
  cup_categories: { data: [] },
  cup_teams: { data: [{ id: "t-a", edition_id: "ed-t", kind: "clube", eligible_final: null }] },
  race_events: {
    data: [
      { id: "race-j1", name: "Corrida da Padroeira", date: "2026-12-06", distance_km: 7, race_type: "estrada", race_priority: "b", status: "agendada", cup_round_id: "j1" },
      { id: "race-j2", name: "Corta-mato do Parque", date: "2027-01-10", distance_km: 8, race_type: "estrada", race_priority: "b", status: "agendada", cup_round_id: "j2" },
      { id: "p-maratona", name: "Maratona da Primavera", date: "2027-03-14", distance_km: 42.2, race_type: "estrada", race_priority: "a", status: "agendada", cup_round_id: null },
    ],
  },
  profiles: { data: { birth_date: "1985-05-05", gender: "M", experience_level: "basico" } },
  cup_results: { data: [] },
  cup_season_summaries: { data: [{ edition_id: "ed-33", attendances: 8, rounds_total: 11, category_rank: 12 }] },
  coach_notes: { data: [] },
  cup_round_courses: { data: EX_DATES.map((_, i) => ({ round_id: `j${i + 1}`, code: "A", distance_m: EX_KM[i] * 1000, start_time: i % 2 ? "10:00:00" : "09:30:00" })) },
  cup_round_course_overrides: { data: [] },
  runs: { data: [] },
};

const EX_TEXT = [
  "--- COMPETIÇÃO POR JORNADAS (o atleta está inscrito) ---",
  "Troféu de Teste, 34.ª edição (2026/27). Inscrição: clube por confirmar; até lá, não entra nas classificações finais. Objetivo da época: ir a prémio (classificação final).",
  "Próximas jornadas (o papel proposto sai das contas da app — é uma sugestão; ele decide):",
  "- Jornada 1 · 6 dez (dom) · Corrida da Padroeira · 7 km às 09:30 · decisão: vai; papel proposto: controlar — em progressão; ataca 1 em 2",
  "- Jornada 2 · 10 jan (dom) · Corta-mato do Parque · 8 km às 10:00 · decisão: vai; ele escolheu controlar; papel proposto: atacar — a vez de atacar (1 em 2)",
  "- Jornada 3 · 24 jan (dom) · Corrida do Clube · 7,4 km às 09:30 · decisão: ainda não sabe; papel proposto: atacar — a vez de atacar (1 em 2)",
  "- Jornada 4 · 7 fev (dom) · GP da Vila · 8 km às 10:00 · decisão: por decidir; papel proposto: controlar — em progressão; ataca 1 em 2",
  "- Jornada 5 · 21 fev (dom) · GP das Dunas · 7 km às 09:30 · decisão: por decidir; papel proposto: controlar — polimento da prova principal (Maratona da Primavera, 14 mar)",
  "- Jornada 6 · 7 mar (dom) · Corrida do Farol · 10 km às 10:00 · decisão: por decidir; papel proposto: controlar — polimento da prova principal (Maratona da Primavera, 14 mar)",
  "(+5 no calendário)",
  "Presenças para a classificação final: 0 feitas, precisa de 8 em 11 (arredondamento a confirmar no regulamento); ainda pode faltar a 3.",
  "Pontos: não fales de pontos (a base da pontuação ainda não é conhecida).",
  "Época anterior — Troféu de Teste 2025/26: 8 de 11 presenças, 12.º no escalão.",
  "Regras: as provas principais dele mandam sempre. O papel de cada jornada é o desta lista — calculado; nunca o refaças de cabeça, nem inventes datas. Se ele escolher outro papel, explica uma vez o custo e aceita sem julgar. Com dor, doença ou um alarme, ele salta e não se discute; os pontos nunca pesam contra isso. Nunca uses o clube ou os colegas para o pressionar a correr, não fales de quantos atletas o clube precisa, nem de outros atletas ou das classificações deles.",
  "No balanço de uma jornada (depois da prova), fecha com o papel da seguinte, tal como está nesta lista. O que ele decidir numa jornada grava-se com set_cup_participation.",
].join("\n");

// ── 1. Sem inscrição: uma leitura e null ─────────────────────────────────

Deno.test("persona I (não inscrito): fetchSeriesBlock devolve null com UMA só leitura, a de cup_enrollments", async () => {
  assertEquals(persona("I").enrolled, false);
  for (const channel of ["chat", "daily", "run"] as const) {
    const sb = fakeSb({ cup_enrollments: { data: [] } });
    assertEquals(await fetchSeriesBlock(sb, "u-i", "2026-11-20", { channel }), null);
    assertEquals(sb.calls.map((c) => c.table), ["cup_enrollments"]);
    assertEquals(sb.calls[0].filters, [["eq", "user_id", "u-i"]]);
    assertEquals(sb.rpcs, []);
  }
});

Deno.test("sem inscrição ativa: só épocas concluídas, ou saiu há mais de 30 dias → null com uma só leitura", async () => {
  const cases = [
    [{ id: "e1", edition_id: "ed-33", status: "concluida", left_at: null }],
    [{ id: "e1", edition_id: "ed-34", status: "saiu", left_at: "2026-10-20T09:00:00Z" }], // 31 dias antes de 20/11
  ];
  for (const rows of cases) {
    const sb = fakeSb({ cup_enrollments: { data: rows } });
    assertEquals(await fetchSeriesBlock(sb, "u1", "2026-11-20", { channel: "chat" }), null);
    assertEquals(sb.calls.length, 1);
  }
});

// ── 2. Tabelas em falta e erros: null, sem exceção ────────────────────────

Deno.test("M1 em falta no porteiro (42P01, PGRST205) → null, sem exceção e sem ir ao log", async () => {
  const warn = console.warn;
  const warned: unknown[] = [];
  console.warn = (...a: unknown[]) => { warned.push(a); };
  try {
    for (const error of [{ code: "42P01", message: 'relation "public.cup_enrollments" does not exist' }, { code: "PGRST205", message: "Could not find the table 'public.cup_enrollments' in the schema cache" }]) {
      const sb = fakeSb({ cup_enrollments: { error } });
      assertEquals(await fetchSeriesBlock(sb, "u1", "2026-11-20", { channel: "chat" }), null);
      assertEquals(sb.calls.length, 1);
    }
    assertEquals(warned, []);
    // Um erro que não é a M1 em falta vai ao log — só com a mensagem.
    const sb = fakeSb({ cup_enrollments: { error: { code: "57014", message: "canceling statement due to statement timeout" } } });
    assertEquals(await fetchSeriesBlock(sb, "u1", "2026-11-20", { channel: "chat" }), null);
    assertEquals(warned.length, 1);
    assertEquals(JSON.stringify(warned[0]).includes("u1"), false);
  } finally {
    console.warn = warn;
  }
});

Deno.test("um erro em qualquer leitura das outras vagas → null; uma exceção no cliente também", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const table of Object.keys(EX_TABLES).filter((t) => t !== "cup_enrollments")) {
      const sb = fakeSb({ ...EX_TABLES, [table]: { error: { code: "XX000", message: `falha em ${table}` } } });
      assertEquals(await fetchSeriesBlock(sb, "u-f", "2026-11-20", { channel: "chat" }), null, table);
    }
    const throwing = { from() { throw new Error("rede em baixo"); } };
    assertEquals(await fetchSeriesBlock(throwing, "u1", "2026-11-20", { channel: "chat" }), null);
  } finally {
    console.warn = warn;
  }
});

Deno.test("isCupSchemaMissing: os códigos e as mensagens da M1 em falta (a mesma régua do cliente)", () => {
  for (const code of ["42P01", "PGRST205", "PGRST202", "42883", "PGRST200"]) assert(isCupSchemaMissing({ code, message: "x" }), code);
  assert(isCupSchemaMissing({ message: 'relation "public.cup_rounds" does not exist' }));
  assert(isCupSchemaMissing({ message: "Could not find the function public.set_participation(p_round_id, p_patch)" }));
  assertEquals(isCupSchemaMissing({ code: "23505", message: "duplicate key" }), false);
  assertEquals(isCupSchemaMissing(null), false);
  assertEquals(isCupSchemaMissing("texto"), false);
});

// ── 3. Quem saiu ──────────────────────────────────────────────────────────

Deno.test("saiu há 10 dias → só a linha 'saiu', sem ferramentas nem papéis; duas leituras", async () => {
  const sb = fakeSb({
    cup_enrollments: { data: [{ id: "e1", edition_id: "ed-t", status: "saiu", left_at: "2026-11-10T18:30:00Z", season_goal: "premio", bib: "BIB-4321" }] },
    cup_editions: EX_TABLES.cup_editions,
    // Mesmo que houvesse épocas anteriores, quem saiu não as leva (só com inscrição ativa).
    cup_season_summaries: EX_TABLES.cup_season_summaries,
  });
  const block = await fetchSeriesBlock(sb, "u1", "2026-11-20", { channel: "chat" });
  assertEquals(block?.text, "O atleta saiu da competição Troféu de Teste a 10/11, decisão dele; não o empurres a voltar.");
  assertEquals(block?.active, false);
  assertEquals(block?.roles, []);
  assertEquals(block?.intentByRaceId, {});
  assertEquals(block?.questions, []);
  assertEquals(sb.calls.map((c) => c.table), ["cup_enrollments", "cup_editions"]);

  // Aos 30 dias ainda leva a linha; aos 31, nada.
  assertEquals(pickSeriesEnrollment([{ id: "e1", edition_id: "ed", status: "saiu", left_at: "2026-10-21T08:00:00Z" }], "2026-11-20")?.active, false);
  assertEquals(pickSeriesEnrollment([{ id: "e1", edition_id: "ed", status: "saiu", left_at: "2026-10-20T08:00:00Z" }], "2026-11-20"), null);
  // Uma inscrição ativa ganha sempre a uma saída antiga.
  assertEquals(pickSeriesEnrollment([
    { id: "e0", edition_id: "ed-33", status: "saiu", left_at: "2026-11-15T08:00:00Z" },
    { id: "e1", edition_id: "ed-34", status: "ativa" },
  ], "2026-11-20")?.enrollment.id, "e1");
});

Deno.test("a saída conta-se contra o dia REAL: uma corrida antiga, anterior à saída, não traz a linha 'saiu' (revisão da Fase 2)", async () => {
  const saiu = [{ id: "e1", edition_id: "ed-t", status: "saiu", left_at: "2027-01-10T18:30:00Z", season_goal: "premio" }];
  // Uma saída "no futuro" do dia dado (d < 0) não é uma saída recente.
  assertEquals(pickSeriesEnrollment(saiu, "2026-12-20"), null);
  assertEquals(pickSeriesEnrollment(saiu, "2027-01-10")?.active, false);

  // Saiu a 10/01; a 01/05 (111 dias depois) reanalisa-se a corrida de 20/12:
  // null, com uma só leitura — o prompt fica igual ao de quem não está inscrito.
  const longe = fakeSb({ cup_enrollments: { data: saiu }, cup_editions: EX_TABLES.cup_editions });
  assertEquals(await fetchSeriesBlock(longe, "u1", "2026-12-20", { channel: "run", statusTodayISO: "2027-05-01" }), null);
  assertEquals(longe.calls.map((c) => c.table), ["cup_enrollments"]);

  // A mesma corrida reanalisada a 20/01 (saiu há 10 dias): a linha, verdadeira hoje.
  const perto = fakeSb({ cup_enrollments: { data: saiu }, cup_editions: EX_TABLES.cup_editions });
  const block = await fetchSeriesBlock(perto, "u1", "2026-12-20", { channel: "run", statusTodayISO: "2027-01-20" });
  assertEquals(block?.text, "O atleta saiu da competição Troféu de Teste a 10/01, decisão dele; não o empurres a voltar.");
  assertEquals(block?.active, false);

  // Inscrição ativa: o estado é o de hoje, as contas continuam no dia dado.
  const ativa = await fetchSeriesBlock(fakeSb(EX_TABLES), "u-f", "2026-11-20", { channel: "chat", statusTodayISO: "2027-05-01" });
  assertEquals(ativa?.text, EX_TEXT);
});

Deno.test("épocas anteriores só com inscrição ativa — a linha 'saiu' não as leva", () => {
  const block = buildSeriesBlock({
    ...personaInput(persona("A")),
    enrollments: [{ id: "enr-A", edition_id: "ed-soma", status: "saiu", left_at: "2026-11-15T10:00:00Z", season_goal: "premio" }],
    summaries: [{ edition_id: "ed-33", attendances: 8, rounds_total: 11, category_rank: 3 }],
    summaryEditions: [{ id: "ed-33", season_label: "2025/26", competition: { short_name: "Troféu de Teste" } }],
  })!;
  assertEquals(block.active, false);
  assertEquals(block.text.includes("Época anterior"), false);
  const active = buildSeriesBlock({
    ...personaInput(persona("A")),
    summaries: [{ edition_id: "ed-33", attendances: 8, rounds_total: 11, category_rank: null }],
    summaryEditions: [{ id: "ed-33", season_label: "2025/26", competition: { short_name: "Troféu de Teste" } }],
  })!;
  assertStringIncludes(active.text, "Época anterior — Troféu de Teste 2025/26: 8 de 11 presenças.");
});

// ── 4. Sem calendário ─────────────────────────────────────────────────────

Deno.test("inscrito sem calendário: 'Calendário por publicar', sem papéis nem datas", () => {
  const p = persona("E");
  const rounds = p.rounds.map((r: Json) => ({ ...r, date: null, date_status: "provavel" }));
  const block = buildSeriesBlock(personaInput({ ...p, rounds }))!;
  assertStringIncludes(block.text, "Calendário por publicar: ainda não há jornadas com data confirmada. Não inventes datas nem calcules papéis;");
  assertEquals(block.text.includes("papel proposto"), false);
  assertEquals(block.hasCalendar, false);
  assertEquals(block.roles.every((r) => r.intent === null && r.reason === "sem_data"), true);
  // Sem jornadas nenhumas (o calendário nunca vai por migração), igual.
  const empty = buildSeriesBlock(personaInput({ ...p, rounds: [] }))!;
  assertStringIncludes(empty.text, "Calendário por publicar");
  assertEquals(empty.intentByRaceId, {});
});

// ── 5. O exemplo do desenho, exato ────────────────────────────────────────

Deno.test("o exemplo do desenho (persona F com nomes, percursos e horas): texto exato, pelas leituras", async () => {
  const sb = fakeSb(EX_TABLES);
  const block = (await fetchSeriesBlock(sb, "u-f", "2026-11-20", { channel: "chat" }))!;
  assertEquals(block.text, EX_TEXT);
  assertEquals(block.active, true);
  assertEquals(block.editionId, "ed-t");
  assertEquals(block.competitionName, "Troféu de Teste");
  assertEquals(block.roundLabel, "Jornada");
  assertEquals(block.hasCalendar, true);
  // A J1 leva o papel proposto; a J2 a escolha dele (controlar), que manda no taper.
  assertEquals(block.intentByRaceId, { "race-j1": "controlar", "race-j2": "controlar" });
  assertEquals(block.questions, [
    { key: "clube" },
    { key: "principais", races: [{ id: "p-maratona", name: "Maratona da Primavera", date: "2027-03-14" }] },
  ]);
  // Quatro vagas: o porteiro; a edição com o resto em paralelo; o que depende das jornadas.
  assertEquals(sb.calls.map((c) => c.table), [
    "cup_enrollments",
    "cup_editions", "cup_rounds", "cup_participations", "cup_categories", "cup_teams", "race_events", "profiles", "cup_results", "cup_season_summaries", "coach_notes",
    "cup_round_courses", "cup_round_course_overrides", "runs", "cup_editions",
  ]);
  // As corridas só das provas das jornadas desta edição.
  assertEquals(sb.calls.find((c) => c.table === "runs")?.filters, [["eq", "user_id", "u-f"], ["in", "race_id", ["race-j1", "race-j2"]]]);
});

Deno.test("canais: o cartão e a análise de corrida levam a sua última linha e nunca as perguntas nem as notas", async () => {
  const daily = (await fetchSeriesBlock(fakeSb(EX_TABLES), "u-f", "2026-11-20", { channel: "daily" }))!;
  assert(daily.text.endsWith("No cartão: se houver uma jornada nos próximos 7 dias, uma frase com o dia, a distância e o papel proposto — nunca como o objetivo da época e sem mudar o plano."));
  assertEquals(daily.questions, []);
  const sbRun = fakeSb(EX_TABLES);
  const run = (await fetchSeriesBlock(sbRun, "u-f", "2026-11-20", { channel: "run" }))!;
  assert(run.text.endsWith("Se esta corrida foi uma jornada (mesma data), fecha o comentário com o papel da seguinte, tal como está nesta lista."));
  assertEquals(run.questions, []);
  assertEquals(sbRun.calls.some((c) => c.table === "coach_notes"), false);
  // Tirando a última linha, os três canais dizem o mesmo.
  const chat = (await fetchSeriesBlock(fakeSb(EX_TABLES), "u-f", "2026-11-20", { channel: "chat" }))!;
  const body = (t: string) => t.split("\n").slice(0, -1).join("\n");
  assertEquals(body(daily.text), body(chat.text));
  assertEquals(body(run.text), body(chat.text));
});

// ── 6. O dorsal ───────────────────────────────────────────────────────────

Deno.test("dorsal: nenhuma leitura pede a coluna nem '*', e o texto nunca o tem", async () => {
  const sb = fakeSb(EX_TABLES);
  const block = (await fetchSeriesBlock(sb, "u-f", "2026-11-20", { channel: "chat" }))!;
  for (const c of sb.calls) {
    assert(c.select, `${c.table} sem select`);
    assertEquals(/\bbib\b/.test(c.select!), false, `${c.table}: ${c.select}`);
    assertEquals(c.select!.includes("*"), false, `${c.table}: ${c.select}`);
  }
  assertEquals(block.text.includes("4321"), false);
  assertEquals(/dorsal/i.test(block.text), false);
  assertEquals(JSON.stringify(block).includes("4321"), false);
  // E nas personas, onde a linha da inscrição também traz o dorsal.
  for (const p of ENROLLED) {
    const b = buildSeriesBlock(personaInput(p))!;
    assertEquals(JSON.stringify(b).includes("4321"), false, p.id);
  }
});

// ── 7. Frases proibidas (§5 "Nunca") ─────────────────────────────────────

const FORBIDDEN = [/precisa(m)? de ti/i, /equipa precisa/i, /\b\d+\s+atletas?\b/i, /dorsal/i];

Deno.test("frases proibidas: nenhuma em nenhum bloco das personas A–K, nos três canais, nem no turno do mapa", () => {
  const texts: Array<[string, string]> = [];
  for (const p of ENROLLED) {
    for (const channel of ["chat", "daily", "run"] as const) {
      const block = buildSeriesBlock(personaInput(p, channel))!;
      texts.push([`${p.id}/${channel}`, block.text]);
      if (channel === "chat") {
        texts.push([`${p.id}/mapa1`, buildCupMapTurn(block, true)]);
        texts.push([`${p.id}/mapa2`, buildCupMapTurn(block, false)]);
      }
    }
  }
  texts.push(["exemplo", EX_TEXT]);
  for (const [id, text] of texts) {
    for (const re of FORBIDDEN) assertEquals(re.test(text), false, `${id}: ${re}`);
    // Nunca terceiros nem a coletiva por nome: nem nomes de clubes.
    assertEquals(text.includes("Clube Novo da Vila"), false, id);
  }
});

Deno.test("cup_team_results nunca é lido", async () => {
  const sb = fakeSb(EX_TABLES);
  await fetchSeriesBlock(sb, "u-f", "2026-11-20", { channel: "chat" });
  assertEquals(sb.calls.some((c) => c.table === "cup_team_results"), false);
});

// ── 8. A Carol cala os pontos com a base null ─────────────────────────────

Deno.test("base da pontuação null (E, F, K — a 34.ª de hoje): cala os pontos, mesmo com resultados", () => {
  for (const id of ["E", "F", "K"]) {
    const p = persona(id);
    assertEquals(golden.editions[p.edition].points_basis, null);
    for (const channel of ["chat", "daily", "run"] as const) {
      const text = buildSeriesBlock(personaInput(p, channel))!.text;
      assertStringIncludes(text, "Pontos: não fales de pontos (a base da pontuação ainda não é conhecida).");
      assertEquals(/\d+\s*pontos/i.test(text), false, `${id}/${channel}`);
      assertEquals(/valem \d+/.test(text), false, `${id}/${channel}`);
      assertEquals(text.includes("comparecer vale mais"), false, `${id}/${channel}`);
    }
  }
  assert(persona("K").results.length > 0);
});

Deno.test("pontos: as faixas das personas em texto", () => {
  const line = (id: string) => buildSeriesBlock(personaInput(persona(id)))!.text.split("\n").find((l) => l.startsWith("Pontos"));
  assertEquals(line("A"), "Pontos (no escalão): na posição de referência (4.º) valem 14; o lugar acima vale 16.");
  assertEquals(line("B"), "Pontos (no escalão): da posição de referência (31.º) para baixo todos têm 2; atacar não muda os pontos.");
  assertEquals(line("C"), "Pontos (na geral): está a 1 lugar do patamar acima (5 → 10 pontos) (referência provisória: 2 resultados confirmados).");
  assertEquals(line("D"), "Pontos: não fales de pontos (a inscrição dele fica fora das classificações finais).");
  assertEquals(line("H"), "Pontos: não fales de pontos (ainda não há resultados oficiais dele confirmados).");
  assertEquals(line("J"), "Pontos (na geral): na posição de referência (2.º) valem 18; o lugar acima vale 20.");
  // "Comparecer vale mais do que atacar" só com soma_todos + clube elegível + base conhecida.
  for (const p of ENROLLED) {
    const has = buildSeriesBlock(personaInput(p))!.text.includes("comparecer vale mais do que atacar");
    assertEquals(has, p.expect.band.attendanceArgument, p.id);
  }
});

// ── 9. Papéis, contador e perguntas por persona ───────────────────────────

Deno.test("personas A–K: os papéis do bloco são os do golden (a montagem não muda a arbitragem)", () => {
  for (const p of ENROLLED) {
    assertEquals(buildSeriesBlock(personaInput(p))!.roles.map(toGolden), p.expect.roles, p.id);
  }
});

Deno.test("contador só com 'ir a prémio', com os números do golden", () => {
  for (const p of ENROLLED) {
    const text = buildSeriesBlock(personaInput(p))!.text;
    const a = p.expect.attendance;
    if (p.seasonGoal === "premio") {
      assertStringIncludes(text, `Presenças para a classificação final: ${a.done} feitas, precisa de ${a.required} em ${a.total} (arredondamento a confirmar no regulamento); ainda pode faltar a ${a.canMiss}.`);
    } else {
      assertEquals(a, null, p.id);
      assertEquals(text.includes("Presenças para a classificação final"), false, p.id);
      assertEquals(text.includes("Contam as"), false, p.id);
    }
  }
  // melhores_n com prémio: a regra das N melhores.
  const text = buildSeriesBlock(personaInput({ ...persona("J"), seasonGoal: "premio" }))!.text;
  assertStringIncludes(text, "Contam as 6 melhores; já tem 0.");
});

Deno.test("as 3 perguntas por persona (só no chat; 'só participar' é o 'não sei' do prémio)", () => {
  const keys = (p: Json, extra: Partial<SeriesBlockInput> = {}) => buildSeriesBlock(personaInput(p, "chat", extra))!.questions.map((q) => q.key);
  assertEquals(keys(persona("A")), ["clube"]); // já é prémio; sem principais
  assertEquals(keys(persona("B")), ["clube"]); // a única prova é 'b'
  assertEquals(keys(persona("C")), ["principais"]); // individual: sem clube
  assertEquals(keys(persona("D")), ["clube", "principais"]); // clube de fora: sem prémio
  assertEquals(keys(persona("E")), ["clube"]); // por confirmar: sem prémio
  assertEquals(keys(persona("F")), ["clube", "principais"]);
  assertEquals(keys(persona("G")), ["principais"]); // individual aberto: sem prémio nem clube
  assertEquals(keys(persona("H")), ["clube"]);
  assertEquals(keys(persona("J")), ["premio", "clube", "principais"]);
  assertEquals(keys(persona("K")), ["clube", "principais"]);
  // A nota "Treino com o clube:" tira a pergunta do clube.
  assertEquals(keys(persona("J"), { notes: [{ note: "Treino com o clube: terças e quintas às 19h." }] }), ["premio", "principais"]);
  // As principais da J, pela data — incluindo a que não tem prioridade (a omissão da BD é 'a').
  const j = buildSeriesBlock(personaInput(persona("J")))!.questions.find((q) => q.key === "principais") as Json;
  assertEquals(j.races.map((r: Json) => r.id), ["p-10k-j8", "p-null"]);
  // Fora do chat não há perguntas.
  for (const p of ENROLLED) {
    assertEquals(buildSeriesBlock(personaInput(p, "daily"))!.questions, [], p.id);
    assertEquals(buildSeriesBlock(personaInput(p, "run"))!.questions, [], p.id);
  }
});

Deno.test("K a meio da época: passadas fora, canceladas fora, 'sem data' dito, a escolha dele à vista", () => {
  const block = buildSeriesBlock(personaInput(persona("K")))!;
  const lines = block.text.split("\n").filter((l) => l.startsWith("- Jornada"));
  assertEquals(lines.map((l) => l.split(" · ")[0]), ["- Jornada 4", "- Jornada 5", "- Jornada 7", "- Jornada 8", "- Jornada 9", "- Jornada 10"]);
  assertStringIncludes(lines[0], "decisão: vai; ele escolheu atacar; papel proposto: controlar — polimento da prova principal (Meia da Marginal, 14 fev)");
  assertStringIncludes(lines[1], "papel proposto: trote — recuperação da prova principal (Meia da Marginal, 14 fev)");
  assertStringIncludes(lines[2], "- Jornada 7 · sem data · Prova 7 · 7 km às 10:00 · decisão: por decidir; papel só com data confirmada");
  assertStringIncludes(block.text, "(+1 no calendário)");
  // A escolha dele (atacar) é o que o taper da prova dessa jornada lê.
  const k = personaInput(persona("K"));
  const withRace = buildSeriesBlock({ ...k, races: [...k.races!, { id: "race-j4", name: "Prova 4", date: "2027-02-07", distance_km: 8, race_priority: "b", status: "agendada", cup_round_id: "j4" }] })!;
  assertEquals(withRace.intentByRaceId, { "race-j4": "atacar" });
});

Deno.test("datas: provável, adiada e mudada; percurso sem distância não se inventa", () => {
  const p = persona("E");
  const rounds = p.rounds.map((r: Json) => ({ ...r }));
  rounds[0] = { ...rounds[0], date_status: "provavel" };
  rounds[1] = { ...rounds[1], date_status: "adiada" };
  const input = personaInput({ ...p, rounds });
  input.rounds![2] = { ...input.rounds![2], previous_date: "2027-01-17" };
  input.courses = input.courses!.filter((c) => c.round_id !== "j4");
  const lines = buildSeriesBlock(input)!.text.split("\n").filter((l) => l.startsWith("- Jornada"));
  assertEquals(lines[0], "- Jornada 1 · ~6 dez (data provável) · Prova 1 · 7 km às 10:00 · decisão: por decidir; papel só com data confirmada");
  assertEquals(lines[1], "- Jornada 2 · adiada · Prova 2 · 8 km às 10:00 · decisão: por decidir; papel só com data confirmada");
  assertStringIncludes(lines[2], "- Jornada 3 · 24 jan (dom) (mudou de 17 jan) · Prova 3 · 7,4 km às 10:00 ·");
  assertStringIncludes(lines[3], "- Jornada 4 · 7 fev (dom) · Prova 4 · decisão:");
});

// ── 10. O turno do mapa e os textos pequenos ──────────────────────────────

const MAP_BASE = (short: string, l: string, ls: string, semCal: string) =>
  `A app mostrou-lhe no Início o mapa da época de ${short} e ele abriu o chat a partir daí. ` +
  `Apresenta-lho numa só mensagem, com o bloco COMPETIÇÃO POR JORNADAS à frente: as provas principais dele e as janelas delas, ` +
  `e o papel proposto de cada ${l} com data confirmada — os papéis são os da lista, calculados; não os refaças. ${semCal}` +
  `Os papéis são sugestões: ele decide. O que ele disser grava-se com set_cup_participation; se escolher outro papel, explica uma vez o custo e aceita sem julgar. ` +
  `Se houver um plano aceite e as ${ls} a que ele vai não estiverem nele, propõe nesta mesma conversa o plano ajustado com propose_training_plan ` +
  `(replace_active_plan=true): cada ${l} como prova no dia dela, com os 2 dias fáceis antes, e as principais a mandar.`;

Deno.test("buildCupMapTurn: exato, com e sem calendário, com e sem perguntas", () => {
  const block = buildSeriesBlock(personaInput(persona("J")))!;
  assertEquals(buildCupMapTurn(block, false), MAP_BASE("Troféu de Teste", "jornada", "jornadas", ""));
  assertEquals(
    buildCupMapTurn(block, true),
    MAP_BASE("Troféu de Teste", "jornada", "jornadas", "") +
      `\n\nDepois do mapa, e uma de cada vez (espera pela resposta antes da seguinte), faz as perguntas desta época que ainda faltam:` +
      `\n- O prémio: a inscrição dele conta para a classificação final e o objetivo da época está em "só participar". Pergunta se quer ir a prémio; se disser que sim, grava com set_cup_season_goal (premio); se disser que não, fica como está e não voltas a perguntar.` +
      `\n- O treino com o clube: pergunta em que dias e a que horas treina com o clube e grava com save_coach_note (categoria disponibilidade), a começar por "Treino com o clube:". Esses treinos são a qualidade da semana: não receites intervalos por cima deles.` +
      `\n- As provas principais: "10 km da Serra" (11 abr), "Trail das Lagoas" (1 mai) estão marcadas como principais (é a marcação por omissão da app). Confirma com ele se são mesmo; se alguma não for, passa-a a secundária com update_race_event (race_priority="b").`,
  );
  // Sem calendário, e com outro rótulo ("Etapa"): o texto segue a competição.
  const p = persona("E");
  const noCal = buildSeriesBlock({
    ...personaInput({ ...p, rounds: p.rounds.map((r: Json) => ({ ...r, date: null, date_status: "provavel" })) }),
    edition: { ...personaInput(p).edition!, competition: { short_name: "Circuito do Norte", round_label: "Etapa" } },
  })!;
  assertEquals(
    buildCupMapTurn(noCal, false),
    MAP_BASE("Circuito do Norte", "etapa", "etapas", "Ainda não há etapas com data confirmada: di-lo, não inventes datas nem papéis, e fica pelas principais. "),
  );
  assertStringIncludes(noCal.text, "Calendário por publicar: ainda não há etapas com data confirmada.");
  // Com first mas sem perguntas por fazer, é o mapa só.
  const noQuestions: SeriesBlock = { ...block, questions: [] };
  assertEquals(buildCupMapTurn(noQuestions, true), buildCupMapTurn(block, false));
});

Deno.test("seriesRacePhaseText: os quatro ramos", () => {
  assertEquals(seriesRacePhaseText("atacar", 0, 3), "Dia da jornada (ou já passou)");
  assertEquals(seriesRacePhaseText("saltar", 5, 2), "Jornada que, pelas contas, se salta (faltam 5 dias); se ele for, 2 dias fáceis antes");
  assertEquals(seriesRacePhaseText("atacar", 3, 3), "Afinação para a jornada (papel: atacar; 3 dias fáceis antes; faltam 3)");
  assertEquals(seriesRacePhaseText("controlar", 9, 2), "Jornada de competição (papel: controlar); sem macrociclo próprio — 2 dias fáceis antes dela");
});

Deno.test("seriesPromptSection: vazio sem bloco (o prompt de quem não está inscrito não muda)", () => {
  assertEquals(seriesPromptSection(null), "");
  assertEquals(seriesPromptSection(undefined), "");
  assertEquals(seriesPromptSection(""), "");
  assertEquals(seriesPromptSection("BLOCO"), "BLOCO\n\n");
});
