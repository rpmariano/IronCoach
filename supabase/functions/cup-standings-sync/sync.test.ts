import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import { runEnsaio, runSync, type SyncOutcome } from "./sync.ts";
import { makeHandler } from "./handler.ts";
import {
  ATHLETE_TABLES,
  Clock,
  FakeDb,
  GERAL_URL,
  httpFor,
  J1_URL,
  PROPRIA_ENROLLMENT,
  type Row,
  scenario,
  siteWith,
  syncDeps,
  T1,
} from "./testkit.ts";
import { band, bibKeyInput, normBib, normText, sha256Hex } from "../_shared/formulas/cupResults.ts";
import {
  colunasTrocadas,
  comBuracoNasPosicoes,
  comColunaPVazia,
  comData,
  comDorsalRepetidoNaPagina,
  comEpoca,
  comEscalao,
  comHomonimaAlternativaNaGeral,
  comLinhaDaPropria,
  comLinhaDaPropriaNaGeral,
  comMarcaIlegivel,
  comNomeDoMeioNaGeral,
  comPontoForaDaTabela,
  comRankingErrado,
  comTotalErrado,
  metadeDasLinhas,
  paginaErro,
  PROPRIA,
  semColuna,
  semLinhaDaPropria,
  SINT_EDITION,
  SINT_GERAL_PAGE,
  SINT_J1,
  SINT_J1_PAGE,
  SINT_J2,
  SINT_TEAM_NAZA,
  SINT_TEAMS,
  TOKENS_TERCEIROS,
} from "../_shared/formulas/cupResults.fixtures.ts";

/* O job da classificação (specs/trofeu.md §7; fase 4, F.2), ponta a ponta
   sobre um Supabase falso em memória e um site falso que serve o HTML
   SINTÉTICO (testkit.ts). Fecha: inerte sem M2 e com 'desligado'; observar
   não escreve nada que os atletas leiam; publicar só com a página pronta;
   as invariantes param a escrita; os repetidos não ligam; "não sou eu" não
   volta; idempotência; e o teste de fuga. */

const ED = SINT_EDITION.id as string;
const J1 = SINT_J1.id;
const K412 = await sha256Hex(bibKeyInput(ED, PROPRIA.bib)!);
const NAZA_NAME = SINT_TEAMS.find((t) => t.id === SINT_TEAM_NAZA)!.name as string;

type Log = { level: string; message: string; meta: Record<string, unknown> };

async function cron(db: FakeDb, site: ReturnType<typeof siteWith>, clock: Clock): Promise<SyncOutcome> {
  return await runSync(syncDeps(db, site, clock), { modo: "cron" });
}

function logs(db: FakeDb): Log[] {
  return db.rows("app_logs") as unknown as Log[];
}

function stateOf(db: FakeDb, target: string): Row | undefined {
  return db.rows("cup_sync_state").find((r) => r.target === target);
}

function athleteWritesSince(db: FakeDb, n: number) {
  return db.writes.slice(n).filter((w) => ATHLETE_TABLES.includes(w.table));
}

// ── Inerte ──────────────────────────────────────────────────────────────

Deno.test("desligado: 0 pedidos ao site e 0 escritas (nem o trinco)", async () => {
  const db = scenario({ edition: { sync_mode: "desligado" } });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  assertEquals(await cron(db, site, clock), { status: "ok", edicoes: [] });
  assertEquals((await runSync(syncDeps(db, site, clock), { modo: "correr", editionId: ED })).status, "desligado");
  assertEquals([site.calls.length, db.writes.length], [0, 0]);
});

Deno.test("M2 em falta (42P01, 42703, PGRST204, PGRST205, 'does not exist'): m2_por_aplicar, 0 pedidos, 0 escritas", async () => {
  const cases: [string, string, string?][] = [
    ["cup_sync_state", "42P01"],
    ["cup_results", "42703"],
    ["cup_results", "PGRST204"],
    ["cup_sync_state", "PGRST205"],
    ["cup_sync_state", "XX000", 'relation "public.cup_sync_state" does not exist'],
  ];
  for (const [table, code, message] of cases) {
    const db = scenario();
    db.failures.push({ table, op: "select", code, message });
    const site = siteWith();
    const clock = new Clock(new Date(T1));
    assertEquals((await cron(db, site, clock)).status, "m2_por_aplicar");
    assertEquals((await runSync(syncDeps(db, site, clock), { modo: "correr", editionId: ED })).status, "m2_por_aplicar");
    assertEquals([site.calls.length, db.writes.length], [0, 0], `${table} ${code}`);
  }
});

Deno.test("um adaptador desconhecido no plano: não lê nada; a edição fica 'adaptador' e alerta uma vez", async () => {
  const db = scenario({ edition: { results_adapter: "outro_site", sync_mode: "observar" } });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  const r = await cron(db, site, clock);
  await cron(db, site, clock.plusHours(1));
  assertEquals([r.edicoes[0].erro, site.calls.length], ["adaptador", 0]);
  assertEquals(stateOf(db, "edicao")!.last_status, "adaptador");
  assertEquals(logs(db).map((l) => l.message), ["adaptador"]);
  assertEquals(db.writesTo(ATHLETE_TABLES), []);
});

// ── Observar ────────────────────────────────────────────────────────────

Deno.test("observar: só cup_sync_state, cup_team_aliases (Equipa da geral) e app_logs; nada que um atleta leia", async () => {
  const db = scenario({ edition: { sync_mode: "observar" } });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  const r1 = await cron(db, site, clock);
  assertEquals(r1.edicoes[0].jornadas.map((j) => [j.estado, j.pronta]), [["ok", false]]);
  const r2 = await cron(db, site, clock.plusHours(7));
  assertEquals(r2.edicoes[0].jornadas.map((j) => [j.estado, j.pronta]), [["ok", true]]);
  assertEquals(db.writtenTables(), ["app_logs", "cup_sync_state", "cup_team_aliases"]);
  assertEquals(db.writesTo(ATHLETE_TABLES), []);
  const st = stateOf(db, `jornada:${J1}`)!;
  assertEquals([st.last_status, st.rows_total, typeof st.ready_at], ["ok", 66, "string"]);
  // As 4 equipas da geral: NAZA, CCD e Individual ligam sozinhas pelo nome; a ASC fica por ligar.
  const aliases = db.rows("cup_team_aliases");
  assertEquals(aliases.length, 4);
  assertEquals(aliases.filter((a) => a.team_id == null).map((a) => a.alias_norm), ["associacao sintetica de cascais"]);
  assertEquals(logs(db).filter((l) => l.message === "clube_novo").length, 1);
  // 2 páginas por volta (jornada + geral) e o robots.txt uma vez por volta.
  assertEquals(site.calls.filter((c) => c.url.endsWith("/robots.txt")).length, 2);
  assertEquals(site.pageCalls(), 4);
  assert(site.calls.every((c) => c.method === "GET"));
});

// ── Publicar ────────────────────────────────────────────────────────────

Deno.test("publicar: a linha dela só depois de pronta (proposta); coletiva só do clube dela; geral só depois de confirmada; idempotente", async () => {
  const db = scenario();
  const site = siteWith();
  const clock = new Clock(new Date(T1));

  // 1.ª volta (D, 15h): lê a jornada e a geral, mas nada está pronto.
  await cron(db, site, clock);
  assertEquals(db.writesTo(ATHLETE_TABLES), []);

  // 7 h depois, o mesmo conteúdo: pronta → a linha dela em 'proposta' (pergunta-se).
  const r2 = await cron(db, site, clock.plusHours(7));
  const res = db.rows("cup_results");
  assertEquals(res.length, 1);
  const { match_hash, standings_key, standings_alt_key, ...rest } = res[0];
  assertEquals(rest, {
    enrollment_id: PROPRIA.enrollmentId,
    user_id: PROPRIA.userId,
    round_id: J1,
    match_status: "proposta",
    bib_key: K412,
    position: 12,
    category_code: "F40",
    category_position: 2,
    official_time_s: 1471,
    points: 13,
    points_source: "calculado",
  });
  assert([match_hash, standings_key, standings_alt_key].every((h) => /^[0-9a-f]{64}$/.test(String(h))));
  assert(standings_alt_key !== standings_key);
  const pub = db.rows("cup_round_publication");
  assertEquals(pub.map((p) => [p.round_id, p.results_ready_at, p.source, p.stable_at]), [[J1, clock.now.toISOString(), "job", null]]);
  // A coletiva (conta da app sobre a geral): só o clube dela, nas jornadas da legenda.
  assertEquals(db.rows("cup_team_results").map((t) => [t.round_id, t.team_name, t.points_source]), [
    [J1, NAZA_NAME, "calculado"],
    [SINT_J2.id, NAZA_NAME, "calculado"],
  ]);
  // Sem confirmada, a geral não liga.
  assertEquals(db.rows("cup_standings"), []);
  assertEquals(r2.edicoes[0].correspondencia.linha, "1–19");
  assertEquals(r2.edicoes[0].geral?.ligacao?.ligadas, "0");

  // Ela diz "Sim, sou eu" (a RPC confirm_cup_result).
  res[0].match_status = "confirmada";

  // D+1: a geral liga pela chave da linha confirmada + o ano; pontos oficiais na J1.
  await cron(db, site, clock.set("2026-12-07T05:00:00Z"));
  assertEquals(db.rows("cup_standings").map(({ source_checked_at: _s, key_hash, ...s }): Row => ({ ...s, key: key_hash === standings_key })), [{
    enrollment_id: PROPRIA.enrollmentId,
    user_id: PROPRIA.userId,
    edition_id: ED,
    category_code: "F40",
    category_rank: 1,
    total_points: 26,
    rounds_scored: 2,
    match_status: "confirmada",
    key: true,
  }]);
  assertEquals([res[0].points, res[0].points_source], [15, "oficial"]);

  // Uma hora depois, o mesmo conteúdo: zero escritas nas tabelas dos atletas.
  const n = db.writes.length;
  await cron(db, site, clock.plusHours(1));
  assertEquals(athleteWritesSince(db, n), []);
  assert(db.writes.length > n); // só o estado do job

  // E a geral relida (≥ 6 h depois da última, a mesma página, ainda D+1):
  // liga outra vez a mesma linha — zero escritas em cup_standings, nos pontos
  // oficiais (cup_results) e na coletiva.
  const geralAntes = site.calls.filter((c) => c.url === GERAL_URL).length;
  const m = db.writes.length;
  const r = await cron(db, site, clock.plusHours(6));
  assertEquals(site.calls.filter((c) => c.url === GERAL_URL).length, geralAntes + 1);
  assertEquals([r.edicoes[0].geral?.estado, r.edicoes[0].geral?.pronta, r.edicoes[0].geral?.ligacao?.ligadas], ["ok", true, "1–19"]);
  assertEquals(db.writes.slice(m).filter((w) => ["cup_standings", "cup_results", "cup_team_results"].includes(w.table)), []);
  assertEquals(athleteWritesSince(db, m), []);
});

// ── A geral pela chave alternativa (o nome do meio) ────────────────────────

/** Publicar até à J1 confirmada e a geral (com o nome do meio) lida e pronta. */
async function geralAlternativa(geral = comNomeDoMeioNaGeral(SINT_GERAL_PAGE)) {
  const db = scenario();
  const site = siteWith(SINT_J1_PAGE, geral);
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  await cron(db, site, clock.plusHours(7));
  const res = db.rows("cup_results");
  res[0].match_status = "confirmada"; // "Sim, sou eu" na J1
  const r = await cron(db, site, clock.set("2026-12-07T05:00:00Z"));
  return { db, site, clock, res, r };
}

Deno.test("geral pela chave alternativa: o nome do meio liga como PROPOSTA — os provisórios ficam; 'Sim' → confirmada e os oficiais entram", async () => {
  const { db, site, clock, res, r } = await geralAlternativa();
  const alt = res[0].standings_alt_key;
  assert(typeof alt === "string" && alt !== res[0].standings_key);
  assertEquals(db.rows("cup_standings").map((x) => [x.match_status, x.key_hash === alt, x.category_rank, x.total_points]), [["proposta", true, 1, 26]]);
  assertEquals([res[0].points, res[0].points_source], [13, "calculado"]);
  assertEquals([r.edicoes[0].geral?.ligacao?.ligadas, r.edicoes[0].geral?.ligacao?.propostas_geral], ["0", "1–19"]);
  // A mesma geral, 7 h depois: continua proposta, nada se reescreve.
  const n = db.writes.length;
  await cron(db, site, clock.plusHours(7));
  assertEquals(db.writes.slice(n).filter((w) => ["cup_standings", "cup_results"].includes(w.table)), []);
  // "Sim, sou eu" na geral (a RPC confirm_cup_standing).
  db.rows("cup_standings")[0].match_status = "confirmada";
  const r2 = await cron(db, site, clock.plusHours(7));
  assertEquals(r2.edicoes[0].geral?.ligacao?.ligadas_alternativa, "1–19");
  assertEquals(db.rows("cup_standings").map((x) => [x.match_status, x.key_hash === alt]), [["confirmada", true]]);
  assertEquals([res[0].points, res[0].points_source], [15, "oficial"]);
});

Deno.test("geral pela chave alternativa: 'Não sou eu' nunca volta; a homónima pela alternativa não liga; ano diferente não liga", async () => {
  const a = await geralAlternativa();
  // "Não sou eu" na geral (reject_cup_standing): apaga a proposta e guarda a chave.
  const alt = a.db.rows("cup_standings")[0].key_hash as string;
  a.db.tables.cup_standings = [];
  a.db.rows("cup_enrollments")[0].standings_refused_keys = [alt];
  const r = await cron(a.db, a.site, a.clock.plusHours(7));
  assertEquals(a.db.rows("cup_standings"), []);
  assertEquals(r.edicoes[0].geral?.ligacao?.recusadas_geral, "1–19");
  await cron(a.db, a.site, a.clock.set("2026-12-09T05:00:00Z"));
  assertEquals(a.db.rows("cup_standings"), []);
  assertEquals([a.res[0].points, a.res[0].points_source], [13, "calculado"]);

  const b = await geralAlternativa(comNomeDoMeioNaGeral(comHomonimaAlternativaNaGeral(SINT_GERAL_PAGE)));
  assertEquals(b.db.rows("cup_standings"), []);
  assertEquals(b.r.edicoes[0].geral?.ligacao?.repetidas, "1–19");
  assertEquals([b.res[0].points, b.res[0].points_source], [13, "calculado"]);

  const c = await geralAlternativa(comLinhaDaPropriaNaGeral(SINT_GERAL_PAGE, { name: PROPRIA.geralNameMeio, year: "1986" }));
  assertEquals(c.db.rows("cup_standings"), []);
  assertEquals(c.r.edicoes[0].geral?.ligacao?.ano_diferente, "1–19");
});

Deno.test("publicar com bib_scope ≠ 'epoca': a correspondência não corre (alerta bib_scope uma vez) e fica como observar", async () => {
  const db = scenario({ edition: { bib_scope: "jornada" } });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  const r = await cron(db, site, clock);
  await cron(db, site, clock.plusHours(7));
  assertEquals(r.edicoes[0].modo, "observar");
  assertEquals(db.writesTo(ATHLETE_TABLES), []);
  assertEquals(logs(db).filter((l) => l.message === "bib_scope").length, 1);
  assertEquals(stateOf(db, "edicao")!.last_status, "bib_scope");
});

// ── As invariantes param a escrita ──────────────────────────────────────

Deno.test("invariantes da jornada: cada uma PÁRA — 0 escritas nas tabelas dos atletas e app_logs 'error' com o código", async () => {
  const confirmada: Row = {
    enrollment_id: PROPRIA.enrollmentId, user_id: PROPRIA.userId, round_id: J1, match_status: "confirmada", bib_key: K412,
    match_hash: "a-identidade-que-ela-confirmou", standings_key: null, points_source: "calculado",
    position: 12, category_code: "F40", category_position: 2, official_time_s: 1471, points: 13,
  };
  const cases: [string, typeof SINT_J1_PAGE, string][] = [
    ["semColuna", semColuna(SINT_J1_PAGE, "marca"), "colunas"],
    ["colunasTrocadas", colunasTrocadas(SINT_J1_PAGE), "posicoes"],
    ["paginaErro", paginaErro(SINT_J1_PAGE), "pagina_erro"],
    ["comBuracoNasPosicoes", comBuracoNasPosicoes(SINT_J1_PAGE), "posicoes"],
    ["comData", comData(SINT_J1_PAGE, "2026-12-13"), "data_da_pagina"],
    ["comEscalao", comEscalao(SINT_J1_PAGE, "M85"), "escalao_desconhecido"],
    ["comMarcaIlegivel", comMarcaIlegivel(SINT_J1_PAGE, 5), "marca"],
    ["metadeDasLinhas", metadeDasLinhas(SINT_J1_PAGE), "regressao"],
  ];
  for (const [name, page, code] of cases) {
    // Sem geral (para isolar a jornada) e com uma linha já confirmada: uma
    // página partida não a pode pôr a 'perdida'.
    const db = scenario({ edition: { standings_url: null }, tables: { cup_results: [confirmada] } });
    const site = siteWith();
    const clock = new Clock(new Date(T1));
    await cron(db, site, clock);
    site.serveRound(J1_URL, page);
    const n = db.writes.length;
    const out = await cron(db, site, clock.plusHours(7));
    assertEquals(athleteWritesSince(db, n), [], name);
    assertEquals(db.rows("cup_results")[0].match_status, "confirmada", name);
    const alert = logs(db).find((l) => l.level === "error" && (l.message === "invariante" || l.message === "regressao"));
    assertExists(alert, name);
    assert((alert.meta.codigos as string[]).includes(code), `${name}: ${alert.meta.codigos}`);
    assertEquals(out.edicoes[0].jornadas[0].estado, code === "regressao" ? "regressao" : "invariante", name);
    // A mesma falha na volta seguinte não volta a alertar.
    await cron(db, site, clock.plusHours(1));
    assertEquals(logs(db).filter((l) => l.level === "error" && l.message === alert.message).length, 1, name);
  }
});

Deno.test("invariantes da geral: cada uma PÁRA — nem cup_standings, nem coletiva, nem pontos oficiais", async () => {
  const cases: [string, typeof SINT_GERAL_PAGE, string][] = [
    ["comTotalErrado", comTotalErrado(SINT_GERAL_PAGE), "total_soma"],
    ["comRankingErrado", comRankingErrado(SINT_GERAL_PAGE), "ranking"],
    ["comPontoForaDaTabela", comPontoForaDaTabela(SINT_GERAL_PAGE, 14), "pontos_fora_da_tabela"],
    ["comEpoca", comEpoca(SINT_GERAL_PAGE, "2025/2026"), "epoca_da_pagina"],
    ["paginaErro", paginaErro(SINT_GERAL_PAGE), "pagina_erro"],
  ];
  for (const [name, page, code] of cases) {
    const db = scenario();
    const site = siteWith();
    const clock = new Clock(new Date(T1));
    await cron(db, site, clock);
    site.serveGeral(GERAL_URL, page);
    await cron(db, site, clock.plusHours(7));
    assertEquals(db.writesTo(["cup_standings", "cup_team_results"]), [], name);
    assert(!db.writesTo(["cup_results"]).some((w) => JSON.stringify(w.payload).includes('"oficial"')), name);
    const alert = logs(db).find((l) => l.level === "error" && l.meta.alvo === "geral" && l.message === "invariante");
    assert(alert && (alert.meta.codigos as string[]).includes(code), name);
    assertEquals(stateOf(db, "geral")!.last_status, "invariante", name);
  }
});

// ── Correspondência: os repetidos não ligam; "não sou eu" não volta ─────

Deno.test("repetidos não ligam: duas inscrições com '412' e ' 0412' → 0 linhas; '0412' duas vezes na página → 0 linhas", async () => {
  const outra: Row = { ...PROPRIA_ENROLLMENT, id: "e-2", user_id: "u-2", bib: " 0412" };
  const db = scenario({
    enrollments: [{ ...PROPRIA_ENROLLMENT, bib: "412" }, outra],
    profiles: [
      { id: PROPRIA.userId, birth_date: PROPRIA.birth_date, gender: "F" },
      { id: "u-2", birth_date: PROPRIA.birth_date, gender: "F" },
    ],
  });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  const r = await cron(db, site, clock.plusHours(7));
  assertEquals(db.rows("cup_results"), []);
  assertEquals(r.edicoes[0].dorsais_repetidos_inscricoes, 1);
  assertEquals(r.edicoes[0].correspondencia.repetido_inscricoes, "1–19");
  assertEquals((stateOf(db, "edicao")!.summary as Row).dorsais_repetidos_inscricoes, 1);

  const db2 = scenario();
  const site2 = siteWith(comDorsalRepetidoNaPagina(SINT_J1_PAGE, PROPRIA.bib));
  const c2 = new Clock(new Date(T1));
  await cron(db2, site2, c2);
  const r2 = await cron(db2, site2, c2.plusHours(7));
  assertEquals(db2.rows("cup_results"), []);
  assertEquals(r2.edicoes[0].correspondencia.repetido_pagina, "1–19");
});

Deno.test("'não sou eu' não volta: com match_refused_key = a chave do dorsal, nenhuma escrita para ela", async () => {
  const db = scenario({ enrollments: [{ ...PROPRIA_ENROLLMENT, match_refused_key: K412 }] });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  await cron(db, site, clock.plusHours(7));
  await cron(db, site, clock.set("2026-12-07T05:00:00Z"));
  assertEquals(db.rows("cup_results"), []);
  assertEquals(db.writesTo(["cup_results", "cup_standings"]), []);
});

Deno.test("'não sou eu' a meio da volta: a recusa relê-se antes da jornada, e as propostas antigas com a chave recusada saem", async () => {
  // A volta lê as inscrições (recusa null); ela recusa antes de a J1 ser
  // cruzada (a RPC grava a recusa): a J1 não volta a ser proposta.
  const db = scenario();
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  let reads = 0;
  const from = db.from.bind(db);
  db.from = (t: string) => {
    if (t === "cup_enrollments" && ++reads === 2) db.rows("cup_enrollments")[0].match_refused_key = K412;
    return from(t);
  };
  await cron(db, site, clock.plusHours(7));
  assert(reads >= 2);
  assertEquals(db.rows("cup_results"), []);

  // Uma proposta com a chave recusada que ficou de uma volta anterior, numa
  // jornada que já não se lê (J2): sai na volta seguinte; a confirmada fica.
  const K = K412;
  const db2 = scenario({
    enrollments: [{ ...PROPRIA_ENROLLMENT, match_refused_key: K }],
    tables: {
      cup_results: [
        { enrollment_id: PROPRIA.enrollmentId, user_id: PROPRIA.userId, round_id: SINT_J2.id, match_status: "proposta", bib_key: K, match_hash: "h2", position: 3, official_time_s: 1300 },
        { enrollment_id: PROPRIA.enrollmentId, user_id: PROPRIA.userId, round_id: "r-sint-4", match_status: "confirmada", bib_key: K, match_hash: "h4", position: 5, official_time_s: 1400 },
      ],
    },
  });
  await cron(db2, siteWith(), new Clock(new Date(T1)));
  assertEquals(db2.rows("cup_results").map((r) => [r.round_id, r.match_status]), [["r-sint-4", "confirmada"]]);
});

Deno.test("dorsal repetido depois de confirmada: outra inscrição com o 412 não apaga a J1 dela", async () => {
  const db = scenario();
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  await cron(db, site, clock.plusHours(7));
  const res = db.rows("cup_results");
  res[0].match_status = "confirmada";
  const antes = structuredClone(res[0]);
  // Em D+1, outra pessoa inscreve-se com o 412.
  db.rows("cup_enrollments").push({ ...PROPRIA_ENROLLMENT, id: "e-2", user_id: "u-2", bib: "412" });
  db.rows("profiles").push({ id: "u-2", birth_date: PROPRIA.birth_date, gender: "F", is_admin: false });
  const r = await runSync(syncDeps(db, site, clock.set("2026-12-07T09:00:00Z")), { modo: "correr", editionId: ED });
  assertEquals(r.edicoes[0].dorsais_repetidos_inscricoes, 1);
  const depois = db.rows("cup_results");
  assertEquals(depois.length, 1);
  // Fica confirmada, com os dados (os pontos oficiais da geral podem ter entrado).
  const { points: _p, points_source: _s, ...a } = antes;
  const { points: _p2, points_source: _s2, ...d } = depois[0];
  assertEquals(d, a);
});

Deno.test("clube desconhecido com o dorsal de outra pessoa (um dígito trocado): o clube dela NUNCA vai para os aliases", async () => {
  // O 9050 é o atleta de fora de F40 (as fixtures em memória).
  const fora = SINT_J1_PAGE.tables.flatMap((t) => t.rows).find((x) => x.bib === "9050")!;
  assert(fora.category === "F40" && fora.club.startsWith("Clube Inventado de Fora"));
  const db = scenario({ enrollments: [{ ...PROPRIA_ENROLLMENT, bib: "9050" }] });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  const r = await cron(db, site, clock.plusHours(7));
  assertEquals(r.edicoes[0].correspondencia.clube_desconhecido, "1–19");
  assertEquals(db.rows("cup_results"), []);
  // Só a lista oficial de coletividades (a Equipa da geral).
  assertEquals(db.rows("cup_team_aliases").map((a) => a.alias_norm).sort(), [
    "associacao sintetica de cascais", "ccd do pessoal do municipio de cascais", "individual",
    normText(PROPRIA.geralTeam),
  ].sort());
  assert(!JSON.stringify(db.writes).includes(normText(fora.club)));
});

Deno.test("a geral com a legenda da J1 e a coluna P1 ainda vazia: os provisórios ficam (nada de 0 'oficial') e a coletiva da J1 espera", async () => {
  const db = scenario();
  const site = siteWith(SINT_J1_PAGE, comColunaPVazia(SINT_GERAL_PAGE, 1));
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  await cron(db, site, clock.plusHours(7));
  const res = db.rows("cup_results");
  res[0].match_status = "confirmada";
  await runSync(syncDeps(db, site, clock.plusHours(1)), { modo: "correr", editionId: ED });
  await runSync(syncDeps(db, site, clock.plusHours(7)), { modo: "correr", editionId: ED });
  assertEquals([res[0].points, res[0].points_source], [13, "calculado"]);
  assertEquals(db.rows("cup_standings").map((x) => [x.total_points, x.rounds_scored]), [[11, 1]]);
  assertEquals(db.rows("cup_team_results").map((t) => t.round_id), [SINT_J2.id]);
  // O organizador põe os P1: na leitura seguinte pronta, os oficiais entram.
  site.serveGeral(GERAL_URL, SINT_GERAL_PAGE);
  await runSync(syncDeps(db, site, clock.plusHours(1)), { modo: "correr", editionId: ED });
  await runSync(syncDeps(db, site, clock.plusHours(7)), { modo: "correr", editionId: ED });
  assertEquals([res[0].points, res[0].points_source], [15, "oficial"]);
  assertEquals(db.rows("cup_team_results").map((t) => t.round_id).sort(), [J1, SINT_J2.id].sort());
});

Deno.test("sem inscrições nada muda: 'Ler agora' em publicar escreve só o estado, a publicação e os aliases", async () => {
  const db = scenario({ enrollments: [], participations: [] });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await runSync(syncDeps(db, site, clock), { modo: "correr", editionId: ED });
  await runSync(syncDeps(db, site, clock.plusHours(7)), { modo: "correr", editionId: ED });
  assertEquals(db.writtenTables(), ["app_logs", "cup_round_publication", "cup_sync_state", "cup_team_aliases"]);
  assertEquals(db.writesTo(["cup_results", "cup_standings", "cup_team_results"]), []);
});

Deno.test("escalão errado em massa (≥ 3 inscritos com escalão ≠ o da linha) → alerta, uma vez", async () => {
  // Três inscritas com os dorsais de linhas de outros escalões (a idade da
  // edição estaria errada): nenhuma liga.
  const enr = ["9001", "9002", "9003"].map((bib, i) => ({ ...PROPRIA_ENROLLMENT, id: `e-${i}`, user_id: `u-${i}`, bib }));
  const db = scenario({
    enrollments: enr,
    profiles: enr.map((e) => ({ id: e.user_id, birth_date: PROPRIA.birth_date, gender: "F" })),
  });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  await cron(db, site, clock.plusHours(7));
  await cron(db, site, clock.plusHours(1));
  assertEquals(db.rows("cup_results"), []);
  assertEquals(logs(db).filter((l) => l.message === "escalao_errado_em_massa").length, 1);
});

// ── Tempo, rede, robots, trinco ─────────────────────────────────────────

Deno.test("rede: 500 fica 'rede' sem alerta; ao fim de 48 h numa janela, um alerta 'rede_48h'", async () => {
  const db = scenario({ edition: { standings_url: null } });
  const site = siteWith();
  site.pages.set(J1_URL, () => new Response("erro", { status: 500, headers: { "content-type": "text/html" } }));
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  assertEquals([stateOf(db, `jornada:${J1}`)!.last_status, stateOf(db, `jornada:${J1}`)!.last_codes], ["rede", ["http_500"]]);
  assertEquals(logs(db).filter((l) => l.level === "error"), []);
  await cron(db, site, clock.set("2026-12-08T16:00:00Z"));
  await cron(db, site, clock.set("2026-12-09T16:00:00Z"));
  assertEquals(logs(db).filter((l) => l.message === "rede_48h").length, 1);
});

Deno.test("sem link de resultados a partir de D+1 → 'sem_url' e um alerta; no próprio dia, espera", async () => {
  const db = scenario({ edition: { standings_url: null } });
  db.rows("cup_rounds").find((r) => r.id === J1)!.results_url = null;
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  assertEquals(stateOf(db, `jornada:${J1}`), undefined);
  await cron(db, site, clock.set("2026-12-07T10:00:00Z"));
  await cron(db, site, clock.plusHours(1));
  assertEquals(stateOf(db, `jornada:${J1}`)!.last_status, "sem_url");
  assertEquals(logs(db).filter((l) => l.message === "sem_url").length, 1);
  assertEquals(site.pageCalls(), 0);
});

Deno.test("robots.txt a proibir: nenhuma página pedida, alerta 'robots' uma vez", async () => {
  const db = scenario();
  const site = siteWith();
  site.robots = () => new Response("User-agent: *\nDisallow: /Resultados/", { headers: { "content-type": "text/plain" } });
  const clock = new Clock(new Date(T1));
  const r = await cron(db, site, clock);
  await cron(db, site, clock.plusHours(1));
  assertEquals([r.edicoes[0].robots, site.pageCalls()], ["proibido", 0]);
  assertEquals(logs(db).filter((l) => l.message === "robots").length, 1);
  assertEquals(stateOf(db, "edicao")!.last_status, "robots");
});

Deno.test("trinco: uma volta a correr há < 10 min → 'a_correr' e 0 pedidos; um trinco velho não prende", async () => {
  const mk = (min: number) =>
    scenario({
      tables: {
        cup_sync_state: [{ edition_id: ED, target: "edicao", running_since: new Date(Date.parse(T1) - min * 60_000).toISOString(), last_codes: [] }],
      },
    });
  const db = mk(2);
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  const r = await cron(db, site, clock);
  assertEquals([r.edicoes[0].skipped, site.calls.length], ["a_correr", 0]);
  assertEquals((await runSync(syncDeps(db, site, clock), { modo: "correr", editionId: ED })).status, "a_correr");
  const old = mk(11);
  const r2 = await cron(old, site, clock);
  assertEquals(r2.edicoes[0].skipped, undefined);
  assertEquals(stateOf(old, "edicao")!.running_since, null);
});

Deno.test("fim de D+10 sem ficar estável: estável sem ler; já estável não volta ao plano", async () => {
  const db = scenario({
    tables: {
      cup_sync_state: [{ edition_id: ED, target: `jornada:${J1}`, round_id: J1, content_hash: "x", hash_seen_at: T1, ready_at: T1, last_codes: [] }],
      cup_round_publication: [{ round_id: J1, results_ready_at: T1, source: "job", stable_at: null, content_hash: "x" }],
    },
  });
  const site = siteWith();
  const clock = new Clock(new Date("2026-12-17T10:00:00Z"));
  await cron(db, site, clock);
  assertEquals(site.pageCalls(), 0);
  assertEquals(stateOf(db, `jornada:${J1}`)!.stable_at, clock.now.toISOString());
  assertEquals(db.rows("cup_round_publication")[0].stable_at, clock.now.toISOString());
  const n = db.writes.length;
  await cron(db, site, clock.plusHours(1));
  assertEquals(db.writesTo(["cup_round_publication"]).length, 1);
  assert(db.writes.length > n);
});

// ── Passar de observar a publicar ────────────────────────────────────────

/** Observar até a J1 ficar estável (pronta às 22h de D, estável em D+2). */
async function estavelEmObservar(): Promise<{ db: FakeDb; site: ReturnType<typeof siteWith>; clock: Clock }> {
  const db = scenario({ edition: { sync_mode: "observar" } });
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  await cron(db, site, clock.plusHours(7));
  await cron(db, site, clock.set("2026-12-08T16:00:00Z"));
  const st = stateOf(db, `jornada:${J1}`)!;
  assertEquals([st.stable_at, st.stable_mode], [clock.now.toISOString(), "observar"]);
  // Estável em observar: fora do plano de observar (a geral lê-se 1×/dia).
  assertEquals(site.calls.filter((c) => c.url === J1_URL).length, 3);
  await cron(db, site, clock.set("2026-12-09T17:00:00Z"));
  assertEquals(site.calls.filter((c) => c.url === J1_URL).length, 3);
  assertEquals(db.writesTo(ATHLETE_TABLES), []);
  return { db, site, clock };
}

Deno.test("observar → publicar dentro da janela: a J1 estável em observar volta ao plano e publica-se logo (a mesma página)", async () => {
  const { db, site, clock } = await estavelEmObservar();
  db.rows("cup_editions")[0].sync_mode = "publicar";
  const n = site.calls.filter((c) => c.url === J1_URL).length;
  const r = await cron(db, site, clock.set("2026-12-11T12:00:00Z"));
  assertEquals(site.calls.filter((c) => c.url === J1_URL).length - n, 1);
  assertEquals(r.edicoes[0].jornadas.map((j) => [j.estado, j.pronta, j.estavel]), [["ok", true, true]]);
  assertEquals(db.rows("cup_results").map((x) => [x.round_id, x.match_status]), [[J1, "proposta"]]);
  const pub = db.rows("cup_round_publication");
  assertEquals(pub.map((p) => [p.round_id, p.source, p.stable_at]), [[J1, "job", clock.now.toISOString()]]);
  assertEquals(stateOf(db, `jornada:${J1}`)!.stable_mode, "publicar");
  // Agora estável em publicar: não volta a ler-se.
  const m = site.calls.filter((c) => c.url === J1_URL).length;
  await cron(db, site, clock.set("2026-12-12T13:00:00Z"));
  await cron(db, site, clock.set("2026-12-20T13:00:00Z"));
  assertEquals(site.calls.filter((c) => c.url === J1_URL).length - m, 0);
});

Deno.test("observar → publicar depois de D+10: a J1 não fecha sem ser lida em publicar — lê-se uma vez e publica-se", async () => {
  const { db, site, clock } = await estavelEmObservar();
  db.rows("cup_editions")[0].sync_mode = "publicar";
  const r = await cron(db, site, clock.set("2026-12-26T12:00:00Z"));
  assertEquals(r.edicoes[0].jornadas.map((j) => [j.round_id, j.estado, j.pronta]), [[J1, "ok", true]]);
  assertEquals(db.rows("cup_results").map((x) => [x.round_id, x.match_status]), [[J1, "proposta"]]);
  assertEquals(db.rows("cup_round_publication").map((p) => p.round_id), [J1]);
  assertEquals(stateOf(db, `jornada:${J1}`)!.stable_mode, "publicar");
  await cron(db, site, clock.plusHours(7));
  assertEquals(site.calls.filter((c) => c.url === J1_URL).length, 4);
});

Deno.test("nunca lida dentro da janela (sem link até D+10, fechada em observar): em publicar lê-se, fica pronta 6 h depois e publica-se", async () => {
  const db = scenario({ edition: { sync_mode: "observar", standings_url: null } });
  db.rows("cup_rounds").find((x) => x.id === J1)!.results_url = null;
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock.set("2026-12-07T10:00:00Z"));
  await cron(db, site, clock.set("2026-12-17T10:00:00Z")); // fim de D+10: fecha sem ler
  const fechada = stateOf(db, `jornada:${J1}`)!;
  assertEquals([fechada.last_status, fechada.stable_mode, typeof fechada.stable_at], ["sem_url", "observar", "string"]);
  assertEquals(site.pageCalls(), 0);
  // O admin cola o link e passa a publicar.
  db.rows("cup_rounds").find((x) => x.id === J1)!.results_url = J1_URL;
  db.rows("cup_editions")[0].sync_mode = "publicar";
  const r1 = await cron(db, site, clock.set("2026-12-26T12:00:00Z"));
  assertEquals(r1.edicoes[0].jornadas.map((j) => [j.estado, j.pronta]), [["ok", false]]);
  assertEquals(db.writesTo(ATHLETE_TABLES), []);
  assertEquals(stateOf(db, `jornada:${J1}`)!.stable_mode, "observar"); // continua à espera
  await cron(db, site, clock.plusHours(1)); // lida há 1 h: não
  assertEquals(site.pageCalls(), 1);
  await cron(db, site, clock.plusHours(6));
  assertEquals(site.pageCalls(), 2);
  assertEquals(db.rows("cup_results").map((x) => [x.round_id, x.match_status]), [[J1, "proposta"]]);
  assertEquals(db.rows("cup_round_publication").map((p) => p.round_id), [J1]);
  assertEquals(stateOf(db, `jornada:${J1}`)!.stable_mode, "publicar");
});

Deno.test("pendente de publicar: 48 h a falhar fecha (sem mais pedidos); sem interessados fecha logo, sem pedir a página", async () => {
  const { db, site, clock } = await estavelEmObservar();
  db.rows("cup_editions")[0].sync_mode = "publicar";
  db.rows("cup_editions")[0].standings_url = null;
  site.pages.set(J1_URL, () => new Response("erro", { status: 500, headers: { "content-type": "text/html" } }));
  const n = site.pageCalls();
  clock.set("2026-12-26T12:00:00Z");
  for (let h = 0; h <= 54; h += 6) await cron(db, site, h === 0 ? clock : clock.plusHours(6));
  // Lê de 6 em 6 h (0 h … 42 h: 8 leituras); às 48 h a falhar fecha em publicar.
  assertEquals(site.pageCalls() - n, 8);
  await cron(db, site, clock.plusHours(6));
  assertEquals(site.pageCalls() - n, 8);
  const st = stateOf(db, `jornada:${J1}`)!;
  assertEquals([st.stable_mode, st.stable_at], ["publicar", "2026-12-28T12:00:00.000Z"]);
  assertEquals(db.writesTo(ATHLETE_TABLES), []);

  const s2 = await estavelEmObservar();
  s2.db.rows("cup_editions")[0].sync_mode = "publicar";
  s2.db.tables.cup_participations = [];
  const m = s2.site.pageCalls();
  await cron(s2.db, s2.site, s2.clock.set("2026-12-26T12:00:00Z"));
  assertEquals(s2.site.calls.filter((c) => c.url === J1_URL).length, 3); // as 3 de observar
  assertEquals(stateOf(s2.db, `jornada:${J1}`)!.stable_mode, "publicar");
  await cron(s2.db, s2.site, s2.clock.plusHours(7));
  assertEquals(s2.site.calls.filter((c) => c.url === J1_URL).length, 3);
  assert(s2.site.pageCalls() - m <= 1); // no máximo a geral
});

Deno.test("'Ler agora' ignora o 'devido' (lê fora da hora) mas nunca o 'pronta'", async () => {
  const db = scenario({ edition: { standings_url: null } });
  const site = siteWith();
  // D+5, lida há 1 h: o cron não a leria; o admin lê. Hash novo → não está pronta → nada para os atletas.
  const clock = new Clock(new Date("2026-12-11T12:00:00Z"));
  db.rows("cup_sync_state").push({ edition_id: ED, target: `jornada:${J1}`, round_id: J1, last_checked_at: "2026-12-11T11:00:00Z", last_codes: [] });
  await cron(db, site, clock);
  assertEquals(site.pageCalls(), 0);
  const out = await runSync(syncDeps(db, site, clock), { modo: "correr", editionId: ED, roundIds: [J1] });
  assertEquals(out.edicoes[0].jornadas.map((j) => [j.round_id, j.estado, j.pronta]), [[J1, "ok", false]]);
  assertEquals(site.pageCalls(), 1);
  assertEquals(db.writesTo(ATHLETE_TABLES), []);
});

Deno.test("uma falha da BD a meio: só o código vai para o registo (a mensagem pode trazer valores)", async () => {
  const db = scenario();
  const site = siteWith();
  const clock = new Clock(new Date(T1));
  await cron(db, site, clock);
  db.failures.push({ table: "cup_results", op: "insert", code: "23505", message: `Key (nome)=(${TOKENS_TERCEIROS.nomes[0]}) already exists` });
  const r = await cron(db, site, clock.plusHours(7));
  assertEquals(r.edicoes[0].erro, "bd");
  const alert = logs(db).find((l) => l.message === "bd")!;
  assertEquals(alert.meta.codigos, ["23505"]);
  assert(!JSON.stringify(logs(db)).includes(TOKENS_TERCEIROS.nomes[0]));
  // O trinco foi libertado.
  assertEquals(stateOf(db, "edicao")!.running_since, null);
});

// ── Ensaio ──────────────────────────────────────────────────────────────

Deno.test("ensaio: lê os links, não grava nada além de 1 linha em app_logs, e o cruzamento dá 'os de fora não ocupam lugar'", async () => {
  // Nem precisa da M2: a BD falsa nem tem as tabelas novas.
  const db = new FakeDb({ app_logs: [] });
  db.failures.push({ table: "cup_sync_state", code: "42P01" });
  const site = siteWith();
  const clock = new Clock(new Date("2027-01-20T10:00:00Z"));
  const out = await runEnsaio(syncDeps(db, site, clock), { jornadas: [J1_URL], geral: GERAL_URL });
  assert(out.status === "ok");
  const rep = out.report;
  assertEquals(rep.jornadas.map((j) => [j.url, j.estado, j.k, j.linhas, j.data]), [[J1_URL, "ok", 1, 66, "2026-12-06"]]);
  assert(/^[0-9a-f]{8}$/.test(String(rep.jornadas[0].hash)));
  assertEquals([rep.geral?.estado, rep.geral?.linhas, rep.geral?.colunas_p, rep.geral?.total_igual_soma, rep.geral?.ranking_ok], ["ok", 66, 11, 66, 32]);
  assertEquals(rep.cruzamento.length, 1);
  const c = rep.cruzamento[0];
  assertEquals([c.jornada, c.k, c.escaloes, c.escaloes_que_batem_so_com_pontos, c.escaloes_que_batem_todos, c.base_provavel, c.fora_ocupam_lugar], [
    1, 1, 32, 32, 0, "escalao", false,
  ]);
  // Quantas linhas da geral ligam pela chave exata, pela alternativa e quantas não (só números).
  assertEquals(c.chave_da_geral, { linhas_com_pontos: 34, com_par_unico_na_pagina: 34, ligam_exata: 34, ligam_alternativa: 0, nao_ligam: 0 });
  site.serveGeral(GERAL_URL, comNomeDoMeioNaGeral(SINT_GERAL_PAGE));
  const out2 = await runEnsaio(syncDeps(db, site, clock), { jornadas: [J1_URL], geral: GERAL_URL });
  assert(out2.status === "ok");
  assertEquals(out2.report.cruzamento[0].chave_da_geral, { linhas_com_pontos: 34, com_par_unico_na_pagina: 33, ligam_exata: 33, ligam_alternativa: 1, nao_ligam: 0 });
  assertEquals(db.writes.map((w) => [w.table, w.op]), [["app_logs", "insert"], ["app_logs", "insert"]]);
  assertEquals(logs(db)[0].meta.modo, "ensaio");
  assertEquals(site.pageCalls(), 4);
});

// ── Fuga (ponta a ponta) ────────────────────────────────────────────────

Deno.test("fuga: consola, todas as escritas (incl. app_logs), estado e respostas — nenhum dado de terceiros, nem o nome ou o dorsal dela", async () => {
  const captured: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const orig = Object.fromEntries(methods.map((m) => [m, console[m]]));
  for (const m of methods) {
    console[m] = (...a: unknown[]) => captured.push(a.map((x) => (typeof x === "string" ? x : Deno.inspect(x))).join(" "));
  }
  const outputs: unknown[] = [];
  const dbs: FakeDb[] = [];
  try {
    // 1. Publicar, com a confirmação dela, a geral ligada e voltas repetidas.
    {
      const db = scenario();
      dbs.push(db);
      const site = siteWith();
      const clock = new Clock(new Date(T1));
      outputs.push(await cron(db, site, clock), await cron(db, site, clock.plusHours(7)));
      db.rows("cup_results")[0].match_status = "confirmada";
      outputs.push(await cron(db, site, clock.set("2026-12-07T05:00:00Z")), await cron(db, site, clock.plusHours(1)));
      // A linha muda de clube (um clube novo DELA) e desaparece.
      site.serveRound(J1_URL, comLinhaDaPropria(SINT_J1_PAGE, { club: "Clube Novo da Própria" }));
      outputs.push(await runSync(syncDeps(db, site, clock.plusHours(1)), { modo: "correr", editionId: ED }));
      outputs.push(await runSync(syncDeps(db, site, clock.plusHours(7)), { modo: "correr", editionId: ED }));
      site.serveRound(J1_URL, semLinhaDaPropria(SINT_J1_PAGE));
      outputs.push(await runSync(syncDeps(db, site, clock.plusHours(1)), { modo: "correr", editionId: ED }));
      outputs.push(await runSync(syncDeps(db, site, clock.plusHours(7)), { modo: "correr", editionId: ED }));
    }
    // 1b. A geral pela chave alternativa (o nome do meio; e com a homónima):
    //     proposta, confirmada, e "não sou eu" na geral.
    for (const geral of [comNomeDoMeioNaGeral(SINT_GERAL_PAGE), comNomeDoMeioNaGeral(comHomonimaAlternativaNaGeral(SINT_GERAL_PAGE))]) {
      const db = scenario();
      dbs.push(db);
      const site = siteWith(SINT_J1_PAGE, geral);
      const clock = new Clock(new Date(T1));
      outputs.push(await cron(db, site, clock), await cron(db, site, clock.plusHours(7)));
      db.rows("cup_results")[0].match_status = "confirmada";
      outputs.push(await cron(db, site, clock.set("2026-12-07T05:00:00Z")));
      const st = db.rows("cup_standings")[0];
      if (st) st.match_status = "confirmada";
      outputs.push(await cron(db, site, clock.plusHours(7)));
      db.rows("cup_enrollments")[0].standings_refused_keys = [String(st?.key_hash ?? "x")];
      db.tables.cup_standings = [];
      outputs.push(await cron(db, site, clock.plusHours(7)));
    }
    // 2. Observar, repetidos, recusado, páginas partidas, falha da BD.
    const variants: { over: Parameters<typeof scenario>[0]; round?: typeof SINT_J1_PAGE; fail?: boolean }[] = [
      { over: { edition: { sync_mode: "observar" } } },
      { over: { enrollments: [PROPRIA_ENROLLMENT, { ...PROPRIA_ENROLLMENT, id: "e-2", user_id: "u-2", bib: " 0412" }] } },
      { over: { enrollments: [{ ...PROPRIA_ENROLLMENT, match_refused_key: K412 }] } },
      // Um dígito trocado: o dorsal do atleta de fora do MESMO escalão (F40).
      { over: { enrollments: [{ ...PROPRIA_ENROLLMENT, bib: "9050" }] } },
      { over: {}, round: comDorsalRepetidoNaPagina(SINT_J1_PAGE, PROPRIA.bib) },
      { over: {}, round: comData(SINT_J1_PAGE, "2026-12-13") },
      { over: {}, round: metadeDasLinhas(SINT_J1_PAGE) },
      { over: {}, round: semLinhaDaPropria(SINT_J1_PAGE) },
      { over: {}, fail: true },
    ];
    for (const v of variants) {
      const db = scenario(v.over);
      dbs.push(db);
      const site = siteWith();
      const clock = new Clock(new Date(T1));
      outputs.push(await cron(db, site, clock));
      if (v.round) site.serveRound(J1_URL, v.round);
      if (v.fail) db.failures.push({ table: "cup_results", op: "insert", code: "23505", message: `Key (nome)=(${TOKENS_TERCEIROS.nomes[3]})` });
      outputs.push(await cron(db, site, clock.plusHours(7)));
    }
    // 3. O handler: cron, "Ler agora" e ensaio, com as respostas em texto.
    {
      const db = scenario({ profiles: [{ id: "u-admin", is_admin: true }, { id: PROPRIA.userId, birth_date: PROPRIA.birth_date, gender: "F" }] });
      dbs.push(db);
      const site = siteWith();
      const clock = new Clock(new Date(T1));
      const h = makeHandler({
        cronSecret: "segredo",
        service: () => db,
        userFromAuth: (a) => Promise.resolve(a === "Bearer admin" ? { id: "u-admin" } : null),
        http: httpFor(site, clock),
        now: () => clock.now,
      });
      const post = (headers: Record<string, string>, body: unknown) =>
        h(new Request("https://x.supabase.co/functions/v1/cup-standings-sync", { method: "POST", headers, body: JSON.stringify(body) }));
      for (const res of [
        await post({ "x-cron-secret": "segredo" }, {}),
        await post({ Authorization: "Bearer admin" }, { modo: "correr", edition_id: ED }),
        await post({ Authorization: "Bearer admin" }, { modo: "ensaio", jornadas: [J1_URL], geral: GERAL_URL }),
        await post({ Authorization: "Bearer admin" }, { modo: "ensaio", jornadas: ["https://outro.pt/Resultados/1"] }),
      ]) outputs.push(await res.text());
      clock.plusHours(7);
      outputs.push(await (await post({ Authorization: "Bearer admin" }, { modo: "correr", edition_id: ED })).text());
    }
  } finally {
    for (const m of methods) console[m] = orig[m] as typeof console.log;
  }
  for (const db of dbs) {
    outputs.push(db.writes);
    for (const t of db.writtenTables()) outputs.push(db.rows(t));
  }

  const blob = JSON.stringify(outputs) + "\n" + captured.join("\n");
  const lower = blob.toLowerCase();
  for (const n of TOKENS_TERCEIROS.nomes) {
    assert(!blob.includes(n) && !blob.includes(n.toUpperCase()), `nome: ${n}`);
    assert(!lower.includes(normText(n)), `nome normalizado: ${n}`);
  }
  for (const d of TOKENS_TERCEIROS.dorsais) {
    for (const v of new Set([d, normBib(d)!])) assert(!new RegExp(`\\b${v}\\b`).test(blob), `dorsal: ${v}`);
  }
  for (const c of TOKENS_TERCEIROS.clubes) {
    assert(!blob.includes(c), `clube: ${c}`);
    assert(!lower.includes(normText(c)), `clube normalizado: ${c}`);
  }
  // Nem o nome nem o dorsal DELA (só hashes).
  assert(!lower.includes(normText(PROPRIA.pageName)) && !blob.includes(PROPRIA.geralName), "nome dela");
  assert(!lower.includes(normText(PROPRIA.geralNameMeio)) && !blob.includes(PROPRIA.geralNameMeio), "o nome dela com o do meio");
  assert(!lower.includes("|alt|") && !lower.includes("ana|teste"), "a entrada da chave alternativa");
  assert(!/\b0?412\b/.test(blob), "dorsal dela");
  // E nunca o HTML.
  assert(!/"html"\s*:/.test(blob) && !/<table|<td|<tr/i.test(blob), "html");
  // (Sanidade: o teste viu mesmo as escritas.)
  assert(blob.includes('"proposta"') && blob.includes('"cup_standings"') && captured.length === 0);
  assert(dbs.some((db) => db.writes.some((w) => w.table === "cup_standings" && JSON.stringify(w.payload).includes('"proposta"'))), "o caminho da alternativa");
  assertEquals(band(0), "0");
});
