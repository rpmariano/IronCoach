import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  band,
  bibKeyInput,
  calculatedPoints,
  CanonStandingRow,
  checkRoundPage,
  checkStandingsPage,
  clubCheck,
  confirmedKey,
  confirmedKeysOf,
  crossCheck,
  CUP_ADAPTER_URLS,
  cupResultsUrlError,
  type ExistingResult,
  linkStandings,
  makeTeamResolver,
  type MatchEnrollment,
  type MatchOutcome,
  matchRoundLines,
  neighborBibs,
  normBib,
  normText,
  officialCategoryCode,
  officialPointsByRound,
  officialPointsWrites,
  outcomeHashes,
  parseMarca,
  publishedPointColumns,
  readiness,
  refusedWrites,
  type ResultWrite,
  roundAliases,
  roundContentInput,
  roundDue,
  roundSummary,
  roundWindowEnd,
  roundWrites,
  seasonRefYear,
  sha256Hex,
  stableFor,
  standingsContentInput,
  standingsKeyInput,
  standingsRowKeys,
  standingsSummary,
  standingsDue,
  standingsWrites,
  teamResultWrites,
  teamToken,
  teamTotals,
} from "./cupResults.ts";
import {
  colunasTrocadas,
  comBuracoNasPosicoes,
  comCelulaDaPropriaVazia,
  comColunaPVazia,
  comData,
  comDorsalRepetidoNaPagina,
  comDuasLinhasDaPropriaNaGeral,
  comEpoca,
  comEscalao,
  comLinhaDaPropria,
  comLinhaDaPropriaNaGeral,
  comMarcaIlegivel,
  comPontoForaDaTabela,
  comRankingErrado,
  comTotalErrado,
  metadeDasLinhas,
  paginaErro,
  PROPRIA,
  semColuna,
  semLegenda,
  semLinhaDaPropria,
  SINT_EDITION,
  SINT_GERAL_PAGE,
  SINT_J1,
  SINT_J1_PAGE,
  SINT_J2,
  SINT_POINTS_TABLE,
  SINT_TEAM_CCD,
  SINT_TEAM_IND,
  SINT_TEAM_NAZA,
  SINT_TEAMS,
  sintRoundCtx,
  sintStandingsCtx,
  TOKENS_TERCEIROS,
  VIZINHO,
} from "./cupResults.fixtures.ts";

/* A classificação oficial do Troféu (specs/trofeu.md §7, Fase 4,
   2026-09-27). Tudo sobre fixtures SINTÉTICAS (cupResults.fixtures.ts):
   nenhuma página real entra no git. O que estes testes fecham: as
   invariantes param a escrita, os repetidos não ligam, "não sou eu" nunca
   volta, o vizinho nunca aparece, e nenhum dado de terceiros sai numa
   saída (teste de fuga, no fim). */

const ED = SINT_EDITION.id as string;
const J1 = SINT_J1.id;

async function keyOf(bib: string): Promise<string> {
  return await sha256Hex(bibKeyInput(ED, bib)!);
}

const K412 = await keyOf(PROPRIA.bib);
const K999 = await keyOf("0999");
/** A standings_key da linha dela (nome como o site o escreve, F40, NAZA). */
const S_ANA = await sha256Hex(standingsKeyInput(ED, normText(PROPRIA.pageName), "F40", `team:${SINT_TEAM_NAZA}`));
/** "Ela já confirmou a linha dela com o 412 nesta edição". */
const CONF_ANA = confirmedKey(PROPRIA.enrollmentId, K412, S_ANA);

function propria(over: Partial<MatchEnrollment> = {}): MatchEnrollment {
  return {
    id: PROPRIA.enrollmentId,
    userId: PROPRIA.userId,
    bibNorm: normBib(PROPRIA.bib),
    bibKey: K412,
    refusedKey: null,
    team: { team_id: PROPRIA.team_id, team_other: null },
    categoryCode: PROPRIA.category,
    ...over,
  };
}

function match(page = SINT_J1_PAGE, enrollments: MatchEnrollment[] = [propria()], aliases = [] as { alias_norm: string; team_id: string | null }[]): MatchOutcome {
  return matchRoundLines({
    editionId: ED,
    roundId: J1,
    check: checkRoundPage(page, sintRoundCtx()),
    enrollments,
    teams: SINT_TEAMS as never,
    aliases,
    pointsTable: SINT_POINTS_TABLE,
    pointsBasis: "escalao",
  });
}

async function writesFor(outcome: MatchOutcome, existing: ExistingResult[] = [], confirmed: string[] = []): Promise<ResultWrite[]> {
  return roundWrites(outcome, existing, { byEnrollment: await outcomeHashes(outcome), confirmedKeys: new Set(confirmed) });
}

/** Aplica as escritas a uma "tabela" em memória (para as voltas seguidas). */
function apply(store: ExistingResult[], writes: ResultWrite[]): ExistingResult[] {
  let rows = store.map((r) => ({ ...r }));
  for (const w of writes) {
    if (w.op === "insert") rows.push({ ...w.row } as ExistingResult);
    else if (w.op === "update") {
      rows = rows.map((r) => (r.enrollment_id === w.enrollment_id && r.round_id === w.round_id ? { ...r, ...w.set } as ExistingResult : r));
    } else rows = rows.filter((r) => !(r.enrollment_id === w.enrollment_id && r.round_id === w.round_id));
  }
  return rows;
}

/** A página com mais 3 cópias das tabelas 6300 M e 3300 M (150 linhas, sem
 *  a linha dela repetida): 1 linha é menos de 1%. */
function maior(p: typeof SINT_J1_PAGE): typeof SINT_J1_PAGE {
  // Cópias independentes (structuredClone mantinha as referências partilhadas).
  const extra = () => JSON.parse(JSON.stringify([p.tables[0], p.tables[2]]));
  return { ...p, tables: [...p.tables, ...extra(), ...extra(), ...extra()] };
}

// ── Links ───────────────────────────────────────────────────────────────

Deno.test("cupResultsUrlError: só /Resultados/{id} na jornada e /Trofeu/{id} na geral, https e do site", () => {
  const J = "Cola o link de uma prova do site do Troféu: https://trofeuatletismocascais.pt/Resultados/727";
  const G = "Cola o link da classificação geral: https://trofeuatletismocascais.pt/Trofeu/17";
  assertEquals(cupResultsUrlError("trofeu_cascais", "jornada", "https://trofeuatletismocascais.pt/Resultados/727"), null);
  assertEquals(cupResultsUrlError("trofeu_cascais", "jornada", " https://www.trofeuatletismocascais.pt/resultados/727/ "), null);
  assertEquals(cupResultsUrlError("trofeu_cascais", "geral", "https://trofeuatletismocascais.pt/Trofeu/17"), null);
  assertEquals(cupResultsUrlError("trofeu_cascais", "jornada", "http://trofeuatletismocascais.pt/Resultados/727"), J);
  assertEquals(cupResultsUrlError("trofeu_cascais", "jornada", "https://outro.pt/Resultados/727"), J);
  assertEquals(cupResultsUrlError("trofeu_cascais", "jornada", "https://trofeuatletismocascais.pt/Resultados/abc"), J);
  assertEquals(cupResultsUrlError("trofeu_cascais", "jornada", "https://trofeuatletismocascais.pt/Trofeu/17"), J);
  assertEquals(cupResultsUrlError("trofeu_cascais", "geral", "https://trofeuatletismocascais.pt/Resultados/727"), G);
  assertEquals(cupResultsUrlError("trofeu_cascais", "jornada", "https://trofeuatletismocascais.pt.evil.com/Resultados/1"), J);
  // Vazio, ou adaptador sem regra: não é com esta função.
  assertEquals(cupResultsUrlError("trofeu_cascais", "jornada", "  "), null);
  assertEquals(cupResultsUrlError(null, "jornada", "https://x.pt/a"), null);
  assertEquals(cupResultsUrlError("outro_site", "geral", "https://x.pt/a"), null);
  assertEquals(CUP_ADAPTER_URLS.trofeu_cascais.jornada.test(CUP_ADAPTER_URLS.trofeu_cascais.exemploJornada), true);
  assert(Object.isFrozen(CUP_ADAPTER_URLS));
});

// ── Normalizações ───────────────────────────────────────────────────────

Deno.test("normBib: os casos de cup_norm_bib; bibKeyInput + sha256Hex = cup_bib_key", async () => {
  assertEquals(normBib(" 0412 "), "412");
  assertEquals(normBib("a12"), "A12");
  assertEquals(normBib("000"), "0");
  assertEquals(normBib(""), null);
  assertEquals(normBib("0 7"), "7");
  assertEquals(normBib(412), "412");
  assertEquals(normBib(null), null);
  const ed = "00000000-0000-0000-0000-000000000034";
  assertEquals(bibKeyInput(ed, " 0412"), `${ed}:412`);
  assertEquals(bibKeyInput(ed, "   "), null);
  assertEquals(await sha256Hex(bibKeyInput(ed, "412")!), "05d4668f16c4a3d91c1c2cf33db420f454f4d09436609e0a9f2fa90d59bef898");
  assertEquals(await sha256Hex(bibKeyInput(ed, "a12")!), "af4df2e77d8ad7c75c1d0d1cb62e3d735ba197aba6b16de100c96e2df70c71b4");
});

Deno.test("normText: sem acentos, minúsculas, pontuação fora", () => {
  assertEquals(normText("Núcleo de Atletismo da Zona da Abóboda (NAZA)"), "nucleo de atletismo da zona da aboboda naza");
  assertEquals(normText("  CD \"Os Galgos Audazes\" "), "cd os galgos audazes");
  assertEquals(normText("ANA PROPRIA TESTE"), normText("Ana Própria Teste"));
  assertEquals(normText("S. Domingos-de-Rana/Cascais"), "s domingos de rana cascais");
  assertEquals(normText(null), "");
});

Deno.test("parseMarca: mm:ss, h:mm:ss, fração arredonda para cima; o resto é null", () => {
  assertEquals(parseMarca("36:12"), 2172);
  assertEquals(parseMarca("1:02:03"), 3723);
  assertEquals(parseMarca("36:12.4"), 2173);
  assertEquals(parseMarca("36:12,4"), 2173);
  assertEquals(parseMarca("36:12.0"), 2172);
  assertEquals(parseMarca(" 05:07 "), 307);
  for (const bad of ["", "DNF", "36:60", "1:60:00", "00:00", "36", "36:1", "abc", "1:02:03:04"]) assertEquals(parseMarca(bad), null, bad);
});

Deno.test("officialCategoryCode: o género sai da tabela nos jovens e seniores; a letra tem de bater", () => {
  assertEquals(officialCategoryCode("Sub-18", "M"), "SUB18M");
  assertEquals(officialCategoryCode("Sub-18", "F"), "SUB18F");
  assertEquals(officialCategoryCode("SUB 12", "F"), "SUB12F");
  assertEquals(officialCategoryCode("Sub23", "M"), "SUB23M");
  assertEquals(officialCategoryCode("Seniores", "F"), "SENF");
  assertEquals(officialCategoryCode("Séniores", "M"), "SENM");
  assertEquals(officialCategoryCode("M40", "M"), "M40");
  assertEquals(officialCategoryCode("F 35", "F"), "F35");
  // A letra não bate com a tabela, ou sem género: null.
  assertEquals(officialCategoryCode("F35", "M"), null);
  assertEquals(officialCategoryCode("Sub-18", null), null);
  assertEquals(officialCategoryCode("Sub-18 F", "M"), null);
  assertEquals(officialCategoryCode("Veteranos", "M"), null);
  assertEquals(officialCategoryCode("", "M"), null);
});

Deno.test("band: as bandas de cup_band", () => {
  assertEquals([band(0), band(1), band(19), band(20), band(300)], ["0", "1–19", "1–19", "20+", "20+"]);
  assertEquals(seasonRefYear("2026/27"), 2027); // reexportada de cup.ts
});

// ── Validação da página da prova ────────────────────────────────────────

Deno.test("checkRoundPage: a J1 sintética passa, sem avisos; o lugar no escalão conta os de fora", () => {
  const c = checkRoundPage(SINT_J1_PAGE, sintRoundCtx());
  assertEquals(c.failures, []);
  assertEquals(c.warnings, []);
  assertEquals(c.ok, true);
  assertEquals(c.stats.rowsTotal, 66);
  assertEquals(c.stats.tables.length, 9);
  assertEquals(c.stats.byCategory.F40, 4);
  assertEquals(c.stats.byCategory.SUB18M, 2);
  assertEquals(c.stats.date, "2026-12-06");
  const mine = c.rows.find((r) => r.bibNorm === "412")!;
  assertEquals([mine.categoryCode, mine.pos, mine.categoryPos, mine.timeS], ["F40", 12, 2, 24 * 60 + 31]);
});

Deno.test("checkRoundPage: cada invariante PÁRA — ok false, rows [] e o código certo", () => {
  const ctx = sintRoundCtx();
  const cases: [string, ReturnType<typeof checkRoundPage>][] = [
    ["pagina_erro", checkRoundPage(paginaErro(SINT_J1_PAGE), ctx)],
    ["titulo", checkRoundPage({ ...SINT_J1_PAGE, title: "Página inicial" }, ctx)],
    ["data_da_pagina", checkRoundPage(comData(SINT_J1_PAGE, "2026-12-13"), ctx)],
    ["data_da_pagina", checkRoundPage({ ...SINT_J1_PAGE, date: null }, ctx)],
    ["sem_tabelas", checkRoundPage({ ...SINT_J1_PAGE, tables: [] }, ctx)],
    ["colunas", checkRoundPage(semColuna(SINT_J1_PAGE, "marca"), ctx)],
    ["genero", checkRoundPage({ ...SINT_J1_PAGE, tables: SINT_J1_PAGE.tables.map((t, i) => (i === 0 ? { ...t, gender: null } : t)) }, ctx)],
    ["posicoes", checkRoundPage(comBuracoNasPosicoes(SINT_J1_PAGE), ctx)],
    ["posicoes", checkRoundPage(colunasTrocadas(SINT_J1_PAGE), ctx)],
    ["marca", checkRoundPage(comMarcaIlegivel(SINT_J1_PAGE, 2), ctx)],
    ["dorsal", checkRoundPage({ ...SINT_J1_PAGE, tables: SINT_J1_PAGE.tables.map((t) => ({ ...t, rows: t.rows.map((r, i) => (i < 1 ? { ...r, bib: "" } : r)) })) }, ctx)],
    ["escalao_desconhecido", checkRoundPage(comEscalao(SINT_J1_PAGE, "M85"), ctx)],
    ["escalao_desconhecido", checkRoundPage(SINT_J1_PAGE, { ...ctx, categoryCodes: new Set(["F40"]) })],
    ["linhas_implausiveis", checkRoundPage({ ...SINT_J1_PAGE, tables: SINT_J1_PAGE.tables.slice(3) }, ctx)],
    ["linhas_implausiveis", checkRoundPage({ ...SINT_J1_PAGE, tables: [...SINT_J1_PAGE.tables, { distanceM: 400, gender: "F", missingColumns: [], rows: [] }] }, ctx)],
    ["regressao", checkRoundPage(metadeDasLinhas(SINT_J1_PAGE), { ...ctx, prev: { rowsTotal: 66, categories: [] } })],
    ["regressao", checkRoundPage(SINT_J1_PAGE, { ...ctx, prev: { rowsTotal: 60, categories: ["F40", "M85"] } })],
  ];
  for (const [code, c] of cases) {
    assertEquals(c.ok, false, code);
    assertEquals(c.rows, [], code);
    assert(c.failures.includes(code), `${code}: ${c.failures}`);
  }
  // O resumo da regressão diz "regressao"; o das outras, "invariante".
  assertEquals(roundSummary(cases[15][1]).estado, "regressao");
  assertEquals(roundSummary(cases[0][1]).estado, "invariante");
});

Deno.test("checkRoundPage: os avisos não param (marca ≤ 1%, dorsal repetido, distância, nome, ensaio sem data)", () => {
  const ctx = sintRoundCtx();
  // 1 marca ilegível em 150 linhas (≤ 1%): aviso. As tabelas repetidas de
  // maior() repetem dorsais e escalões — também só avisos.
  const umaMarca = checkRoundPage(comMarcaIlegivel(maior(SINT_J1_PAGE), 1), ctx);
  assertEquals(umaMarca.ok, true);
  assertEquals(umaMarca.warnings.sort(), ["dorsal_repetido_pagina", "escalao_em_duas_tabelas", "marca_parcial"]);
  assertEquals(umaMarca.stats.timeFailures, 1);
  const dup = checkRoundPage(comDorsalRepetidoNaPagina(SINT_J1_PAGE, PROPRIA.bib), ctx);
  assertEquals(dup.ok, true);
  assertEquals(dup.warnings, ["dorsal_repetido_pagina"]);
  assertEquals(dup.stats.bibDupPage, 1);
  const dist = checkRoundPage(SINT_J1_PAGE, { ...ctx, courseDistancesM: [6300, 3300, 1900, 1100] });
  assertEquals([dist.ok, dist.warnings], [true, ["distancia"]]);
  const nome = checkRoundPage(SINT_J1_PAGE, { ...ctx, roundName: "Corrida do Farol" });
  assertEquals([nome.ok, nome.warnings], [true, ["nome_da_prova"]]);
  const semData = checkRoundPage({ ...SINT_J1_PAGE, date: null }, { ...ctx, roundDate: null });
  assertEquals([semData.ok, semData.warnings], [true, ["data_da_pagina"]]);
});

Deno.test("roundContentInput: não muda com nomes, dorsais ou clubes; muda com uma marca", () => {
  const base = roundContentInput(checkRoundPage(SINT_J1_PAGE, sintRoundCtx()).rows);
  const outroNome = roundContentInput(checkRoundPage(comLinhaDaPropria(SINT_J1_PAGE, { name: "Outra Pessoa", club: "CCD", bib: "777" }), sintRoundCtx()).rows);
  const outraMarca = roundContentInput(checkRoundPage(comLinhaDaPropria(SINT_J1_PAGE, { time: "24:32" }), sintRoundCtx()).rows);
  assertEquals(outroNome, base);
  assert(outraMarca !== base);
  for (const n of TOKENS_TERCEIROS.nomes) assert(!base.includes(n));
});

// ── Validação da geral ──────────────────────────────────────────────────

Deno.test("checkStandingsPage: a geral sintética passa; a legenda liga P1 e P2 às jornadas pela data", () => {
  const c = checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx());
  assertEquals([c.ok, c.failures, c.warnings], [true, [], []]);
  assertEquals([c.stats.tables, c.stats.rowsTotal, c.stats.pCount, c.stats.totalOk, c.stats.rankingOk], [32, 66, 11, 66, 32]);
  assertEquals(c.legendMap.get(1), SINT_J1.id);
  assertEquals(c.legendMap.get(2), SINT_J2.id);
  assertEquals(c.legendMap.get(3), null);
  assertEquals(c.stats.legend, [{ k: 1, dayMonth: "06-12", roundNo: 1 }, { k: 2, dayMonth: "10-01", roundNo: 2 }]);
  // M50: 15 = 15 → Pos 1, 1 (ranking de competição).
  const m50 = c.rows.filter((r) => r.categoryCode === "M50");
  assertEquals(m50.map((r) => [r.pos, r.total]), [[1, 15], [1, 15]]);
});

Deno.test("checkStandingsPage: cada invariante PÁRA", () => {
  const ctx = sintStandingsCtx();
  const t0 = SINT_GERAL_PAGE.tables[0];
  const cases: [string, ReturnType<typeof checkStandingsPage>][] = [
    ["pagina_erro", checkStandingsPage(paginaErro(SINT_GERAL_PAGE), ctx)],
    ["titulo", checkStandingsPage({ ...SINT_GERAL_PAGE, title: "Resultados" }, ctx)],
    ["epoca_da_pagina", checkStandingsPage(comEpoca(SINT_GERAL_PAGE, "2025/2026"), ctx)],
    ["epoca_da_pagina", checkStandingsPage({ ...SINT_GERAL_PAGE, seasonLabel: null }, ctx)],
    ["sem_tabelas", checkStandingsPage({ ...SINT_GERAL_PAGE, tables: [] }, ctx)],
    ["colunas", checkStandingsPage({ ...SINT_GERAL_PAGE, tables: [{ ...t0, missingColumns: ["ano"] }, ...SINT_GERAL_PAGE.tables.slice(1)] }, ctx)],
    ["colunas", checkStandingsPage({ ...SINT_GERAL_PAGE, tables: [{ ...t0, pCount: 10 }, ...SINT_GERAL_PAGE.tables.slice(1)] }, ctx)],
    ["escalao_desconhecido", checkStandingsPage({ ...SINT_GERAL_PAGE, tables: [{ ...t0, category: "Sub-10" }, ...SINT_GERAL_PAGE.tables.slice(1)] }, ctx)],
    ["escalao_desconhecido", checkStandingsPage({ ...SINT_GERAL_PAGE, tables: [...SINT_GERAL_PAGE.tables, t0] }, ctx)],
    ["total_soma", checkStandingsPage(comTotalErrado(SINT_GERAL_PAGE), ctx)],
    ["ranking", checkStandingsPage(comRankingErrado(SINT_GERAL_PAGE), ctx)],
    ["ano", checkStandingsPage(comLinhaDaPropriaNaGeral(SINT_GERAL_PAGE, { year: "87" }), ctx)],
    ["ano", checkStandingsPage(comLinhaDaPropriaNaGeral(SINT_GERAL_PAGE, { year: "2031" }), ctx)],
    ["pontos_fora_da_tabela", checkStandingsPage(comPontoForaDaTabela(SINT_GERAL_PAGE, 14), ctx)],
    ["linhas_implausiveis", checkStandingsPage({ ...SINT_GERAL_PAGE, tables: SINT_GERAL_PAGE.tables.slice(0, 10) }, { ...ctx })],
    ["regressao", checkStandingsPage(SINT_GERAL_PAGE, { ...ctx, prev: { rowsTotal: 90, categories: [] } })],
  ];
  for (const [code, c] of cases) {
    assertEquals(c.ok, false, code);
    assertEquals(c.rows, [], code);
    assert(c.failures.includes(code), `${code}: ${c.failures}`);
  }
  // Sem tabela de pontos conhecida, um 14 não pára (só a soma conta).
  assertEquals(checkStandingsPage(comPontoForaDaTabela(SINT_GERAL_PAGE, 14), { ...ctx, pointsTable: null }).ok, true);
});

Deno.test("checkStandingsPage: os avisos (legenda, soma por escalão, colunas P) não param", () => {
  const ctx = sintStandingsCtx();
  const semLeg = checkStandingsPage(semLegenda(SINT_GERAL_PAGE), ctx);
  assertEquals([semLeg.ok, semLeg.warnings], [true, ["legenda_em_falta"]]);
  assertEquals([...semLeg.legendMap.values()].every((v) => v === null), true);
  const outraData = checkStandingsPage({ ...SINT_GERAL_PAGE, legend: [{ k: 1, name: "X", dayMonth: "07-12" }] }, ctx);
  assertEquals([outraData.ok, outraData.warnings, outraData.legendMap.get(1)], [true, ["legenda_sem_jornada"], null]);
  const dupla = checkStandingsPage(comDuasLinhasDaPropriaNaGeral(SINT_GERAL_PAGE), ctx);
  assertEquals([dupla.ok, dupla.warnings], [true, ["pontos_soma_escalao"]]);
  const cols = checkStandingsPage(SINT_GERAL_PAGE, { ...ctx, roundDates: ctx.roundDates.slice(0, 10) });
  assertEquals([cols.ok, cols.warnings], [true, ["colunas_p_vs_jornadas"]]);
});

Deno.test("standingsContentInput: não muda com nomes; muda com pontos", () => {
  const ctx = sintStandingsCtx();
  const base = standingsContentInput(checkStandingsPage(SINT_GERAL_PAGE, ctx).rows);
  assertEquals(standingsContentInput(checkStandingsPage(comLinhaDaPropriaNaGeral(SINT_GERAL_PAGE, { name: "X Y", team: "Individual" }), ctx).rows), base);
  assert(standingsContentInput(checkStandingsPage(comPontoForaDaTabela(SINT_GERAL_PAGE, 13), ctx).rows) !== base);
});

Deno.test("linhas canónicas: rebentam num JSON.stringify, aparecem como '[linha oficial]', e um spread não leva o nome", () => {
  const rows = checkRoundPage(SINT_J1_PAGE, sintRoundCtx()).rows;
  assertThrows(() => JSON.stringify(rows), Error, "dados de terceiros");
  assertThrows(() => JSON.stringify({ x: checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx()).rows[0] }));
  assertEquals(Deno.inspect(rows[0]), "[linha oficial]");
  const spread = { ...rows[0] } as Record<string, unknown>;
  assertEquals(Object.keys(spread).sort(), ["categoryCode", "categoryPos", "pos", "table", "timeS"]);
  assertEquals(Object.keys({ ...checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx()).rows[0] }).sort(), ["categoryCode", "points", "pos", "table", "total"]);
});

// ── Tempo ───────────────────────────────────────────────────────────────

const J1_DUE = { date: "2026-12-06", date_status: "confirmada", first_start_time: "09:30:00" };
const at = (iso: string) => new Date(iso);

Deno.test("roundDue: D às 12h locais (ou partida + 2 h), D e D+1 de hora a hora, depois 1×/dia até D+10, depois fecha", () => {
  const tz = "Europe/Lisbon";
  assertEquals(roundDue(J1_DUE, null, at("2026-12-06T11:59:00Z"), tz), { due: false, reason: "cedo" });
  assertEquals(roundDue(J1_DUE, null, at("2026-12-05T20:00:00Z"), tz).reason, "cedo");
  assertEquals(roundDue(J1_DUE, null, at("2026-12-06T12:00:00Z"), tz), { due: true, reason: "janela_quente" });
  const lida = { last_checked_at: "2026-12-07T09:00:00Z" };
  assertEquals(roundDue(J1_DUE, lida, at("2026-12-07T10:00:00Z"), tz).due, true); // D+1: todas as voltas
  const d2 = { last_checked_at: "2026-12-08T00:00:00Z" };
  assertEquals(roundDue(J1_DUE, d2, at("2026-12-08T19:59:00Z"), tz), { due: false, reason: "lida_ha_pouco" });
  assertEquals(roundDue(J1_DUE, d2, at("2026-12-08T20:00:00Z"), tz), { due: true, reason: "diaria" });
  assertEquals(roundDue(J1_DUE, null, at("2026-12-16T23:59:00Z"), tz).due, true); // D+10
  assertEquals(roundDue(J1_DUE, null, at("2026-12-17T00:00:00Z"), tz), { due: false, reason: "fim_da_janela", closeNow: true });
  assertEquals(roundDue(J1_DUE, { stable_at: "2026-12-09T00:00:00Z" }, at("2026-12-10T00:00:00Z"), tz).reason, "estavel");
  assertEquals(roundDue({ ...J1_DUE, date_status: "provavel" }, null, at("2026-12-07T12:00:00Z"), tz).reason, "sem_data");
  assertEquals(roundDue({ ...J1_DUE, date: null }, null, at("2026-12-07T12:00:00Z"), tz).reason, "sem_data");
  // Prova à noite: abre 2 h depois da partida.
  const noite = { ...J1_DUE, first_start_time: "19:00" };
  assertEquals(roundDue(noite, null, at("2026-12-06T20:59:00Z"), tz).due, false);
  assertEquals(roundDue(noite, null, at("2026-12-06T21:00:00Z"), tz).due, true);
  // Açores (UTC−1): as 12h locais são as 13h UTC.
  assertEquals(roundDue(J1_DUE, null, at("2026-12-06T12:30:00Z"), "Atlantic/Azores").due, false);
  assertEquals(roundDue(J1_DUE, null, at("2026-12-06T13:00:00Z"), "Atlantic/Azores").due, true);
  // Verão em Lisboa (UTC+1): as 12h locais são as 11h UTC.
  const junho = { ...J1_DUE, date: "2027-06-13" };
  assertEquals(roundDue(junho, null, at("2027-06-13T10:59:00Z"), tz).due, false);
  assertEquals(roundDue(junho, null, at("2027-06-13T11:00:00Z"), tz).due, true);
});

Deno.test("roundDue: a marca de estável só vale para o modo em que foi obtida — a de observar não impede a 1.ª publicação", () => {
  const tz = "Europe/Lisbon";
  const obs = { stable_at: "2026-12-09T00:00:00Z", stable_mode: "observar", last_checked_at: "2026-12-09T00:00:00Z" };
  const pub = { ...obs, stable_mode: "publicar" };
  // D+5: em observar continua estável; em publicar volta ao plano (1×/dia, como as outras).
  const d5 = at("2026-12-11T12:00:00Z");
  assertEquals(roundDue(J1_DUE, obs, d5, tz, "observar").reason, "estavel");
  assertEquals(roundDue(J1_DUE, obs, d5, tz, "publicar"), { due: true, reason: "diaria" });
  assertEquals(roundDue(J1_DUE, pub, d5, tz, "publicar").reason, "estavel");
  assertEquals(roundDue(J1_DUE, pub, d5, tz, "observar").reason, "estavel");
  // Sem modo na marca (desconhecido) conta como observar.
  assertEquals(roundDue(J1_DUE, { ...obs, stable_mode: null }, d5, tz, "publicar").due, true);
  // Depois de D+10 não fecha sem a ler: 'publicar_pendente', de 6 em 6 h.
  const d20 = at("2026-12-26T12:00:00Z");
  assertEquals(roundDue(J1_DUE, obs, d20, tz, "publicar"), { due: true, reason: "publicar_pendente", pending: true });
  assertEquals(roundDue(J1_DUE, { ...obs, last_checked_at: "2026-12-26T07:00:00Z" }, d20, tz, "publicar"), {
    due: false, reason: "lida_ha_pouco", pending: true,
  });
  assertEquals(roundDue(J1_DUE, { ...obs, last_checked_at: "2026-12-26T06:00:00Z" }, d20, tz, "publicar").due, true);
  assertEquals(roundDue(J1_DUE, pub, d20, tz, "publicar").reason, "estavel");
  // Nunca lida na janela (fechada em observar depois de falhar desde D):
  // as falhas de antes da marca não contam — lê-se.
  const nunca = { stable_at: "2026-12-17T00:00:00Z", stable_mode: "observar", fail_since: "2026-12-07T10:00:00Z", last_checked_at: "2026-12-16T10:00:00Z" };
  assertEquals(roundDue(J1_DUE, nunca, d20, tz, "publicar").reason, "publicar_pendente");
  // 48 h a falhar DEPOIS da marca: fecha (em publicar, pelo job).
  const falha = { ...nunca, fail_since: "2026-12-24T11:00:00Z", last_checked_at: "2026-12-26T04:00:00Z" };
  assertEquals(roundDue(J1_DUE, falha, at("2026-12-26T10:59:00Z"), tz, "publicar").reason, "publicar_pendente");
  assertEquals(roundDue(J1_DUE, falha, at("2026-12-26T11:00:00Z"), tz, "publicar"), {
    due: false, reason: "fim_da_janela", closeNow: true, pending: true,
  });
  // Sem marca nenhuma, depois de D+10 fecha como sempre (nos dois modos).
  assertEquals(roundDue(J1_DUE, null, d20, tz, "publicar"), { due: false, reason: "fim_da_janela", closeNow: true });
  assertEquals(stableFor(obs, "publicar"), false);
  assertEquals(stableFor(obs, "observar") && stableFor(pub, "publicar") && stableFor(obs, undefined), true);
});

Deno.test("roundWindowEnd: a meia-noite local que fecha D+10", () => {
  assertEquals(roundWindowEnd("2026-12-06", "Europe/Lisbon").toISOString(), "2026-12-17T00:00:00.000Z");
  assertEquals(roundWindowEnd("2027-06-13", "Europe/Lisbon").toISOString(), "2027-06-23T23:00:00.000Z");
  assertEquals(roundWindowEnd("2026-12-06", "Atlantic/Azores").toISOString(), "2026-12-17T01:00:00.000Z");
});

Deno.test("standingsDue: com uma jornada lida (≥ 6 h) ou 1×/dia na janela", () => {
  const now = at("2026-12-07T12:00:00Z");
  assertEquals(standingsDue(true, true, null, now), true);
  assertEquals(standingsDue(true, true, { last_checked_at: "2026-12-07T07:00:00Z" }, now), false);
  assertEquals(standingsDue(true, true, { last_checked_at: "2026-12-07T06:00:00Z" }, now), true);
  assertEquals(standingsDue(false, true, { last_checked_at: "2026-12-06T17:00:00Z" }, now), false);
  assertEquals(standingsDue(false, true, { last_checked_at: "2026-12-06T16:00:00Z" }, now), true);
  assertEquals(standingsDue(false, false, null, now), false);
});

Deno.test("readiness: pronta = mesmo hash ≥ 6 h depois; estável = 48 h sem mudar ou o fim da janela; hash novo reinicia", () => {
  const end = roundWindowEnd("2026-12-06", "Europe/Lisbon");
  const t0 = at("2026-12-06T13:00:00Z");
  const r0 = readiness(null, "h1", t0, end);
  assertEquals(r0, { hashSeenAt: t0.toISOString(), readyAt: null, stableAt: null });
  const s0 = { content_hash: "h1", hash_seen_at: r0.hashSeenAt };
  assertEquals(readiness(s0, "h1", at("2026-12-06T18:59:00Z"), end).readyAt, null);
  const r1 = readiness(s0, "h1", at("2026-12-06T19:00:00Z"), end);
  assertEquals(r1.readyAt, "2026-12-06T19:00:00.000Z");
  const s1 = { ...s0, ready_at: r1.readyAt };
  assertEquals(readiness(s1, "h1", at("2026-12-08T12:59:00Z"), end).stableAt, null);
  assertEquals(readiness(s1, "h1", at("2026-12-08T13:00:00Z"), end), {
    hashSeenAt: t0.toISOString(), readyAt: r1.readyAt, stableAt: "2026-12-08T13:00:00.000Z",
  });
  // Mudou (uma correção): recomeça, sem pronta nem estável.
  assertEquals(readiness({ ...s1, stable_at: null }, "h2", at("2026-12-08T14:00:00Z"), end), {
    hashSeenAt: "2026-12-08T14:00:00.000Z", readyAt: null, stableAt: null,
  });
  // Fim de D+10: estável mesmo sem 48 h.
  assertEquals(readiness(s0, "h1", end, end).stableAt, end.toISOString());
});

// ── Correspondência ─────────────────────────────────────────────────────

Deno.test("a 1.ª linha fica 'proposta' (pergunta-se); com uma confirmada deste dorsal na edição, liga sozinha", async () => {
  const o = match();
  assertEquals(o.ok, true);
  assertEquals(o.byEnrollment[0].outcome, "linha");
  const w = await writesFor(o);
  assertEquals(w.length, 1);
  const ins = w[0] as Extract<ResultWrite, { op: "insert" }>;
  assertEquals(ins.op, "insert");
  assertEquals(ins.row.match_status, "proposta");
  assertEquals(ins.row.bib_key, K412);
  assertEquals([ins.row.position, ins.row.category_code, ins.row.category_position, ins.row.official_time_s], [12, "F40", 2, 1471]);
  // Base escalão, 2.º na página → 13, "provisórios" (os de fora não ocupam lugar: oficial 15).
  assertEquals([ins.row.points, ins.row.points_source], [13, "calculado"]);
  assert(/^[0-9a-f]{64}$/.test(ins.row.match_hash!) && /^[0-9a-f]{64}$/.test(ins.row.standings_key!));
  assertEquals(ins.row.standings_key, S_ANA);
  const auto = await writesFor(o, [], [CONF_ANA]);
  assertEquals((auto[0] as Extract<ResultWrite, { op: "insert" }>).row.match_status, "confirmada");
  // Uma confirmada de OUTRO dorsal não conta.
  const outro = await writesFor(o, [], [confirmedKey(PROPRIA.enrollmentId, K999, S_ANA)]);
  assertEquals((outro[0] as Extract<ResultWrite, { op: "insert" }>).row.match_status, "proposta");
  // As confirmedKey saem das confirmadas com dorsal e chave (nunca das propostas).
  assertEquals(confirmedKeysOf([
    { enrollment_id: PROPRIA.enrollmentId, round_id: J1, match_status: "confirmada", bib_key: K412, match_hash: "h", standings_key: S_ANA },
    { enrollment_id: PROPRIA.enrollmentId, round_id: SINT_J2.id, match_status: "proposta", bib_key: K412, match_hash: "h", standings_key: "outra" },
    { enrollment_id: PROPRIA.enrollmentId, round_id: "r-x", match_status: "confirmada", bib_key: K412, match_hash: "h", standings_key: null },
  ]), new Set([CONF_ANA]));
});

Deno.test("dorsais trocados pelo organizador: o mesmo dorsal com OUTRO nome nunca se confirma sozinho", async () => {
  // A colega do mesmo clube e escalão ficou com o 412 nesta jornada.
  const troca = match(comLinhaDaPropria(SINT_J1_PAGE, { name: "Colega Trocada Sintetica" }));
  assertEquals(troca.byEnrollment[0].outcome, "linha");
  const h = (await outcomeHashes(troca)).get(PROPRIA.enrollmentId)!;
  assert(h.standingsKey !== S_ANA);
  // Ela já confirmou a SUA linha com o 412 noutra jornada: esta fica proposta.
  const ins = (await writesFor(troca, [], [CONF_ANA]))[0] as Extract<ResultWrite, { op: "insert" }>;
  assertEquals([ins.op, ins.row.match_status], ["insert", "proposta"]);
  // Uma proposta que já lá estava também não passa a confirmada.
  const store = apply([], [ins]);
  assertEquals(await writesFor(troca, store, [CONF_ANA]), []);
  // Nem substituindo a de outro dorsal.
  const antiga: ExistingResult = { ...store[0], bib_key: K999 };
  const sub = (await writesFor(troca, [antiga], [CONF_ANA]))[0] as Extract<ResultWrite, { op: "update" }>;
  assertEquals([sub.set.bib_key, sub.set.match_status], [K412, undefined]);
});

Deno.test("dorsal repetido entre inscrições ('412' e ' 0412'): nenhuma liga; repetido na página: não liga", async () => {
  const dup = match(SINT_J1_PAGE, [propria(), propria({ id: "e-outra", userId: "u-outra", bibNorm: normBib(" 0412") })]);
  assertEquals(dup.byEnrollment.map((m) => m.outcome), ["repetido_inscricoes", "repetido_inscricoes"]);
  assertEquals(dup.bibDupEnrollments, 1);
  assertEquals(await writesFor(dup), []);
  const pag = match(comDorsalRepetidoNaPagina(SINT_J1_PAGE, PROPRIA.bib));
  assertEquals(pag.byEnrollment[0].outcome, "repetido_pagina");
  assertEquals(await writesFor(pag), []);
  // …e uma proposta que já lá estava sai.
  const prop: ExistingResult = { enrollment_id: PROPRIA.enrollmentId, round_id: J1, match_status: "proposta", bib_key: K412, match_hash: "h", position: 12, official_time_s: 1471 };
  assertEquals(await writesFor(pag, [prop]), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: J1 }]);
  assertEquals(await writesFor(dup, [prop]), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: J1 }]);
});

Deno.test("dorsal repetido: a confirmada dela fica como estava (outra inscrição com o 412 não a apaga)", async () => {
  const conf: ExistingResult = {
    enrollment_id: PROPRIA.enrollmentId, round_id: J1, match_status: "confirmada", bib_key: K412, match_hash: "h",
    standings_key: S_ANA, position: 12, category_code: "F40", category_position: 2, official_time_s: 1471, points: 15, points_source: "oficial",
  };
  // Em D+3, outra pessoa inscreve-se com o 412 (por engano ou de propósito).
  const dup = match(SINT_J1_PAGE, [propria(), propria({ id: "e-outra", userId: "u-outra" })]);
  assertEquals(dup.byEnrollment.map((m) => m.outcome), ["repetido_inscricoes", "repetido_inscricoes"]);
  assertEquals(await writesFor(dup, [conf], [CONF_ANA]), []);
  // Repetido na página: também fica (e não se liga nada de novo).
  assertEquals(await writesFor(match(comDorsalRepetidoNaPagina(SINT_J1_PAGE, PROPRIA.bib)), [conf], [CONF_ANA]), []);
  // Uma perdida (não confirmada) perde os dados, como antes.
  const perdida = { ...conf, match_status: "perdida" };
  assertEquals((await writesFor(dup, [perdida]))[0], {
    op: "update", enrollment_id: PROPRIA.enrollmentId, round_id: J1,
    set: { position: null, category_code: null, category_position: null, official_time_s: null, points: null, points_source: null },
  });
});

Deno.test("'não sou eu' nunca volta: a mesma chave fica recusada; só outro dorsal a desbloqueia", async () => {
  const rec = match(SINT_J1_PAGE, [propria({ refusedKey: K412 })]);
  assertEquals(rec.byEnrollment[0].outcome, "recusado");
  // Nada novo com a chave recusada, nem com uma confirmada deste dorsal.
  assertEquals(await writesFor(rec, [], [CONF_ANA]), []);
  // Uma proposta com a chave recusada (o job gravou-a na mesma volta em que
  // ela disse "não sou eu") sai; a perdida também; a confirmada fica.
  const existing: ExistingResult[] = [{ enrollment_id: PROPRIA.enrollmentId, round_id: J1, match_status: "proposta", bib_key: K412, match_hash: "h" }];
  assertEquals(await writesFor(rec, existing, [CONF_ANA]), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: J1 }]);
  assertEquals(await writesFor(rec, [{ ...existing[0], match_status: "perdida" }]), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: J1 }]);
  assertEquals(await writesFor(rec, [{ ...existing[0], match_status: "confirmada" }]), []);
  // Uma proposta de OUTRO dorsal não é da recusa.
  assertEquals(await writesFor(rec, [{ ...existing[0], bib_key: K999 }]), []);
  // Em toda a edição (1× por volta): as não confirmadas com a chave recusada, em qualquer jornada.
  const edicao: ExistingResult[] = [
    { ...existing[0], round_id: J1 },
    { ...existing[0], round_id: SINT_J2.id, match_status: "perdida" },
    { ...existing[0], round_id: "r-sint-3", match_status: "confirmada" },
    { ...existing[0], round_id: "r-sint-4", bib_key: K999 },
    { ...existing[0], enrollment_id: "e-outra", round_id: "r-sint-5" },
  ];
  assertEquals(refusedWrites([{ id: PROPRIA.enrollmentId, refusedKey: K412 }, { id: "e-outra", refusedKey: null }], edicao), [
    { op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: J1 },
    { op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: SINT_J2.id },
  ]);
  assertEquals(refusedWrites([{ id: PROPRIA.enrollmentId, refusedKey: null }], edicao), []);
  // Reintroduzir o mesmo dorsal (" 0412") é a mesma chave.
  assertEquals(match(SINT_J1_PAGE, [propria({ bibNorm: normBib(" 0412"), refusedKey: K412 })]).byEnrollment[0].outcome, "recusado");
  // Outro dorsal: já não é recusado (aqui, ausente).
  assertEquals(match(SINT_J1_PAGE, [propria({ bibNorm: "999", bibKey: K999, refusedKey: K412 })]).byEnrollment[0].outcome, "ausente");
});

Deno.test("escalão diferente do calculado, clube diferente, clube desconhecido (alias da linha DELA), marca ilegível", async () => {
  assertEquals(match(SINT_J1_PAGE, [propria({ categoryCode: "F35" })]).byEnrollment[0].outcome, "escalao");
  assertEquals(match(SINT_J1_PAGE, [propria({ categoryCode: null })]).byEnrollment[0].outcome, "escalao");
  assertEquals(match(comLinhaDaPropria(SINT_J1_PAGE, { club: "CCD Cascais" })).byEnrollment[0].outcome, "clube");
  assertEquals(match(comLinhaDaPropria(SINT_J1_PAGE, { club: "" })).byEnrollment[0].outcome, "clube");
  const novo = match(comLinhaDaPropria(SINT_J1_PAGE, { club: "Clube Novo da Própria" }));
  assertEquals(novo.byEnrollment[0].outcome, "clube_desconhecido");
  assertEquals(novo.byEnrollment[0].newAlias, "clube novo da propria");
  // Fora do JSON: até se saber que a linha é dela, o clube pode ser de outra pessoa.
  assert(!JSON.stringify(novo).includes("clube novo da propria"));
  assertEquals(await writesFor(novo), []);
  // O alias só sai depois de ela ter confirmado ESTA linha (dorsal + nome + escalão).
  assertEquals(await roundAliases(novo, new Set()), []);
  assertEquals(await roundAliases(novo, new Set([confirmedKey(PROPRIA.enrollmentId, K412, "outra")])), []);
  assertEquals(await roundAliases(novo, new Set([CONF_ANA])), ["clube novo da propria"]);
  // Depois de o admin ligar o alias ao clube dela, liga.
  const ligado = match(comLinhaDaPropria(SINT_J1_PAGE, { club: "Clube Novo da Própria" }), [propria()], [{ alias_norm: "clube novo da propria", team_id: SINT_TEAM_NAZA }]);
  assertEquals(ligado.byEnrollment[0].outcome, "linha");
  // Marca ilegível NA LINHA DELA: numa página de 66 linhas, 1 é mais de 1% e
  // a página pára; numa de 150 fica em aviso, e essa linha nunca liga.
  assertEquals(checkRoundPage(comLinhaDaPropria(SINT_J1_PAGE, { time: "DNF" }), sintRoundCtx()).failures.includes("marca"), true);
  const grande = maior(comLinhaDaPropria(SINT_J1_PAGE, { time: "DNF" }));
  const c = checkRoundPage(grande, sintRoundCtx());
  assertEquals(c.ok, true);
  assert(c.warnings.includes("marca_parcial"));
  assertEquals(match(grande).byEnrollment[0].outcome, "marca");
});

Deno.test("clubCheck: lista (nome, sigla, alias), Individual com clube vazio, 'não está na lista', sem clube", () => {
  const t = SINT_TEAMS as never;
  const naza = { team_id: SINT_TEAM_NAZA, team_other: null };
  assertEquals(clubCheck(naza, "naza", t, []), "ok");
  assertEquals(clubCheck(naza, normText("Núcleo de Atletismo da Zona da Abóboda (NAZA)"), t, []), "ok");
  assertEquals(clubCheck(naza, "nz", t, [{ alias_norm: "nz", team_id: SINT_TEAM_NAZA }]), "ok");
  assertEquals(clubCheck(naza, "nz", t, [{ alias_norm: "nz", team_id: null }]), "desconhecido");
  assertEquals(clubCheck(naza, "ccd cascais", t, []), "diferente");
  assertEquals(clubCheck(naza, "", t, []), "diferente");
  const ind = { team_id: SINT_TEAM_IND, team_other: null };
  assertEquals(clubCheck(ind, "", t, []), "ok");
  assertEquals(clubCheck(ind, "individual", t, []), "ok");
  assertEquals(clubCheck(ind, "naza", t, []), "diferente");
  const outro = { team_id: null, team_other: "Os Amigos da Marginal" };
  assertEquals(clubCheck(outro, "os amigos da marginal", t, []), "ok");
  assertEquals(clubCheck(outro, "naza", t, []), "diferente");
  assertEquals(clubCheck(outro, "outro clube", t, []), "desconhecido");
  assertEquals(clubCheck({ team_id: null, team_other: null }, "", t, []), "ok");
  assertEquals(clubCheck({ team_id: null, team_other: null }, "naza", t, []), "diferente");
  assertEquals(teamToken(naza), `team:${SINT_TEAM_NAZA}`);
  assertEquals(teamToken(outro), "outro:os amigos da marginal");
  assertEquals(teamToken({ team_id: null, team_other: null }), "sem-clube");
});

Deno.test("o vizinho de dorsal (0413, mesmo escalão e clube) nunca liga nem aparece — só conta", async () => {
  const o = match(semLinhaDaPropria(SINT_J1_PAGE));
  assertEquals(o.byEnrollment[0].outcome, "ausente_vizinho");
  assertEquals(o.counts.ausente_vizinho, 1);
  assertEquals(await writesFor(o), []);
  const json = JSON.stringify(o);
  assert(!/\b0?413\b/.test(json), json);
  // Noutro clube, o dorsal ao lado é só "ausente".
  assertEquals(match(semLinhaDaPropria(SINT_J1_PAGE), [propria({ team: { team_id: SINT_TEAM_CCD, team_other: null } })]).byEnrollment[0].outcome, "ausente");
  assertEquals(neighborBibs("412", ["413", "412", "4120", "512", "423", "41"]).sort(), ["413", "512"]);
  assertEquals(VIZINHO.bib, "0413");
});

Deno.test("roundWrites: a linha muda de identidade → perdida; só o lugar ou a marca → atualiza sem perguntar", async () => {
  const h0 = (await outcomeHashes(match())).get(PROPRIA.enrollmentId)!;
  const conf: ExistingResult = {
    enrollment_id: PROPRIA.enrollmentId, round_id: J1, match_status: "confirmada", bib_key: K412, match_hash: h0.matchHash,
    standings_key: h0.standingsKey, position: 12, category_code: "F40", category_position: 2, official_time_s: 1471, points: 13, points_source: "calculado",
  };
  // Mesmo conteúdo: nada.
  assertEquals(await writesFor(match(), [conf]), []);
  // O organizador corrigiu a marca: só a marca.
  assertEquals(await writesFor(match(comLinhaDaPropria(SINT_J1_PAGE, { time: "24:40" })), [conf]), [
    { op: "update", enrollment_id: PROPRIA.enrollmentId, round_id: J1, set: { official_time_s: 1480 } },
  ]);
  // O nome como o site o escreve mudou: perdida, com os dados novos.
  const w = await writesFor(match(comLinhaDaPropria(SINT_J1_PAGE, { name: "Ana P. Teste" })), [conf]);
  assertEquals(w.length, 1);
  const u = w[0] as Extract<ResultWrite, { op: "update" }>;
  assertEquals(u.set.match_status, "perdida");
  assert(u.set.match_hash && u.set.match_hash !== h0.matchHash);
  // Pontos oficiais (da geral) ficam enquanto a identidade não muda.
  const oficial = { ...conf, points: 15, points_source: "oficial" };
  assertEquals(await writesFor(match(comLinhaDaPropria(SINT_J1_PAGE, { time: "24:40" })), [oficial]), [
    { op: "update", enrollment_id: PROPRIA.enrollmentId, round_id: J1, set: { official_time_s: 1480 } },
  ]);
});

Deno.test("roundWrites: a linha desaparece → proposta apagada, confirmada passa a perdida sem dados; e volta", async () => {
  const h0 = (await outcomeHashes(match())).get(PROPRIA.enrollmentId)!;
  const gone = match(semLinhaDaPropria(SINT_J1_PAGE));
  const base = { enrollment_id: PROPRIA.enrollmentId, round_id: J1, bib_key: K412, match_hash: h0.matchHash, position: 12, category_code: "F40", category_position: 2, official_time_s: 1471, points: 13, points_source: "calculado" };
  assertEquals(await writesFor(gone, [{ ...base, match_status: "proposta" }]), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: J1 }]);
  const toLost = await writesFor(gone, [{ ...base, match_status: "confirmada" }]);
  assertEquals(toLost, [{
    op: "update", enrollment_id: PROPRIA.enrollmentId, round_id: J1,
    set: { match_status: "perdida", position: null, category_code: null, category_position: null, official_time_s: null, points: null, points_source: null },
  }]);
  // Perdida sem dados e a MESMA linha volta: confirmada outra vez, sem perguntar.
  const lost = apply([{ ...base, match_status: "confirmada" }], toLost);
  const back = await writesFor(match(), lost);
  assertEquals((back[0] as Extract<ResultWrite, { op: "update" }>).set.match_status, "confirmada");
  // Perdida COM dados (a identidade mudou) continua a perguntar.
  const other = await writesFor(match(comLinhaDaPropria(SINT_J1_PAGE, { name: "Ana P. Teste" })), [{ ...base, match_status: "perdida" }]);
  assertEquals((other[0] as Extract<ResultWrite, { op: "update" }>).set.match_status, undefined);
  // Perdida com dados e a linha some: dados a null.
  assertEquals((await writesFor(gone, [{ ...base, match_status: "perdida" }]))[0], {
    op: "update", enrollment_id: PROPRIA.enrollmentId, round_id: J1,
    set: { position: null, category_code: null, category_position: null, official_time_s: null, points: null, points_source: null },
  });
});

Deno.test("roundWrites: mudança de dorsal — a proposta antiga sai (ou é substituída); a confirmada com o dorsal antigo fica", async () => {
  const oldProp: ExistingResult = { enrollment_id: PROPRIA.enrollmentId, round_id: J1, match_status: "proposta", bib_key: K999, match_hash: "x", position: 3, official_time_s: 999 };
  // Agora com 0412 (na página): substitui, como um insert novo.
  const w = await writesFor(match(), [oldProp]);
  assertEquals(w.length, 1);
  assertEquals((w[0] as Extract<ResultWrite, { op: "update" }>).set.bib_key, K412);
  assertEquals((w[0] as Extract<ResultWrite, { op: "update" }>).set.match_status, undefined); // continua proposta
  // Com um dorsal que não está na página: sai.
  const semLinha = match(SINT_J1_PAGE, [propria({ bibNorm: "999", bibKey: K999 })]);
  assertEquals(await writesFor(semLinha, [{ ...oldProp, bib_key: K412 }]), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: J1 }]);
  // Confirmada com o dorsal antigo: fica, haja ou não linha nova.
  const confOld = { ...oldProp, match_status: "confirmada", bib_key: K999 };
  assertEquals(await writesFor(match(), [confOld]), []);
  // Sem dorsal (tirou-o): a proposta sai, a confirmada fica.
  const sem = match(SINT_J1_PAGE, [propria({ bibNorm: null, bibKey: null })]);
  assertEquals(sem.byEnrollment[0].outcome, "sem_dorsal");
  assertEquals(await writesFor(sem, [{ ...oldProp, bib_key: K412 }]), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId, round_id: J1 }]);
  assertEquals(await writesFor(sem, [confOld]), []);
});

Deno.test("roundWrites: a proposta liga-se sozinha quando ele confirma o dorsal noutra jornada", async () => {
  const first = await writesFor(match());
  const store = apply([], first);
  assertEquals(await writesFor(match(), store), []);
  const promoted = await writesFor(match(), store, [CONF_ANA]);
  assertEquals(promoted, [{ op: "update", enrollment_id: PROPRIA.enrollmentId, round_id: J1, set: { match_status: "confirmada" } }]);
});

Deno.test("team_other e Individual: liga, mas quem não é de um clube da lista não pontua", () => {
  const outro = match(comLinhaDaPropria(SINT_J1_PAGE, { club: "Os Amigos da Marginal" }), [propria({ team: { team_id: null, team_other: "Os Amigos da Marginal" } })]);
  assertEquals(outro.byEnrollment[0].outcome, "linha");
  assertEquals([outro.byEnrollment[0].line!.points, outro.byEnrollment[0].line!.points_source], [null, null]);
  const ind = match(comLinhaDaPropria(SINT_J1_PAGE, { club: "" }), [propria({ team: { team_id: SINT_TEAM_IND, team_other: null } })]);
  assertEquals([ind.byEnrollment[0].outcome, ind.byEnrollment[0].line!.points], ["linha", 13]);
});

Deno.test("sem inscrições nada muda; página que não passou nas invariantes → zero escritas (nem 'perdida')", async () => {
  const vazio = match(SINT_J1_PAGE, []);
  assertEquals([vazio.ok, vazio.byEnrollment, await writesFor(vazio)], [true, [], []]);
  const conf: ExistingResult = { enrollment_id: PROPRIA.enrollmentId, round_id: J1, match_status: "confirmada", bib_key: K412, match_hash: "h", position: 12, official_time_s: 1471 };
  const partida = match(comData(SINT_J1_PAGE, "2026-12-13"));
  assertEquals([partida.ok, partida.byEnrollment.length], [false, 0]);
  assertEquals(await writesFor(partida, [conf]), []);
  const regressao = matchRoundLines({
    editionId: ED, roundId: J1, enrollments: [propria()], teams: SINT_TEAMS as never, aliases: [],
    check: checkRoundPage(metadeDasLinhas(SINT_J1_PAGE), sintRoundCtx({ prev: { rowsTotal: 66, categories: [] } })),
  });
  assertEquals(await writesFor(regressao, [conf]), []);
});

Deno.test("idempotência: a 2.ª volta sobre o mesmo conteúdo não escreve nada", async () => {
  const s1 = apply([], await writesFor(match()));
  assertEquals(await writesFor(match(), s1), []);
  const confirmed = s1.map((r) => ({ ...r, match_status: "confirmada" }));
  assertEquals(await writesFor(match(), confirmed, [CONF_ANA]), []);
});

// ── Geral, pontos e coletiva ────────────────────────────────────────────

async function standingsKeyOfPropria(): Promise<string> {
  return (await outcomeHashes(match())).get(PROPRIA.enrollmentId)!.standingsKey;
}

async function link(page = SINT_GERAL_PAGE, birthYear: number | null = 1987, key?: string | null) {
  const check = checkStandingsPage(page, sintStandingsCtx());
  const rowKeys = await standingsRowKeys(ED, check, SINT_TEAMS as never, []);
  const standingsKey = key === undefined ? await standingsKeyOfPropria() : key;
  return linkStandings({ check, rowKeys, enrollments: [{ id: PROPRIA.enrollmentId, userId: PROPRIA.userId, standingsKey, birthYear }] });
}

Deno.test("linkStandings: a chave da linha confirmada + o ano do perfil ligam a linha dela na geral", async () => {
  // A chave: o nome como o SITE o escreve (da linha dela na J1), o escalão e o clube.
  assertEquals(await standingsKeyOfPropria(), await sha256Hex(standingsKeyInput(ED, normText(PROPRIA.pageName), "F40", `team:${SINT_TEAM_NAZA}`)));
  const l = await link();
  assertEquals(l.byEnrollment[0].outcome, "ligada");
  assertEquals(l.byEnrollment[0].standing, { category_code: "F40", category_rank: 1, total_points: 26, rounds_scored: 2 });
  assertEquals(l.byEnrollment[0].pointsByRound, { [SINT_J1.id]: 15, [SINT_J2.id]: 11 });
});

Deno.test("linkStandings: ano diferente não liga; duas linhas iguais não ligam; sem linha mantém; sem chave nada", async () => {
  assertEquals((await link(SINT_GERAL_PAGE, 1986)).byEnrollment[0].outcome, "ano");
  assertEquals((await link(comLinhaDaPropriaNaGeral(SINT_GERAL_PAGE, { year: "1986" }))).byEnrollment[0].outcome, "ano");
  assertEquals((await link(SINT_GERAL_PAGE, null)).byEnrollment[0].outcome, "ano");
  assertEquals((await link(comDuasLinhasDaPropriaNaGeral(SINT_GERAL_PAGE))).byEnrollment[0].outcome, "repetida");
  assertEquals((await link(comLinhaDaPropriaNaGeral(SINT_GERAL_PAGE, { team: "Individual" }))).byEnrollment[0].outcome, "sem_linha");
  assertEquals((await link(SINT_GERAL_PAGE, 1987, null)).byEnrollment[0].outcome, "sem_chave");
  // Uma geral que não passou nas invariantes: não liga nada.
  const check = checkStandingsPage(comTotalErrado(SINT_GERAL_PAGE), sintStandingsCtx());
  assertEquals(linkStandings({ check, rowKeys: [], enrollments: [] }).ok, false);
});

Deno.test("standingsWrites: insere; igual não escreve (a data refresca 1×/dia); repetida/ano apaga; sem linha fica", async () => {
  const now = at("2027-01-11T12:00:00Z");
  const l = await link();
  const w1 = standingsWrites(l, [], ED, now);
  assertEquals(w1.length, 1);
  assertEquals(w1[0].op, "insert");
  const row = (w1[0] as Extract<typeof w1[0], { op: "insert" }>).row;
  assertEquals([row.category_rank, row.total_points, row.rounds_scored, row.edition_id], [1, 26, 2, ED]);
  const existing = [{ ...row }];
  assertEquals(standingsWrites(l, existing, ED, at("2027-01-11T13:00:00Z")), []);
  assertEquals(standingsWrites(l, existing, ED, at("2027-01-12T08:00:00Z")), [
    { op: "update", enrollment_id: PROPRIA.enrollmentId, set: { source_checked_at: "2027-01-12T08:00:00.000Z" } },
  ]);
  assertEquals(standingsWrites(await link(comDuasLinhasDaPropriaNaGeral(SINT_GERAL_PAGE)), existing, ED, now), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId }]);
  assertEquals(standingsWrites(await link(SINT_GERAL_PAGE, 1986), existing, ED, now), [{ op: "delete", enrollment_id: PROPRIA.enrollmentId }]);
  assertEquals(standingsWrites(await link(comLinhaDaPropriaNaGeral(SINT_GERAL_PAGE, { team: "Individual" })), existing, ED, now), []);
});

Deno.test("officialPointsWrites: os pontos oficiais só nas linhas CONFIRMADAS dela", async () => {
  const l = await link();
  const existing: ExistingResult[] = [
    { enrollment_id: PROPRIA.enrollmentId, round_id: SINT_J1.id, match_status: "confirmada", bib_key: K412, match_hash: "h", points: 13, points_source: "calculado" },
    { enrollment_id: PROPRIA.enrollmentId, round_id: SINT_J2.id, match_status: "proposta", bib_key: K412, match_hash: "h", points: 9, points_source: "calculado" },
  ];
  assertEquals(officialPointsWrites(l, existing), [
    { op: "update", enrollment_id: PROPRIA.enrollmentId, round_id: SINT_J1.id, set: { points: 15, points_source: "oficial" } },
  ]);
  assertEquals(officialPointsWrites(l, [{ ...existing[0], points: 15, points_source: "oficial" }]), []);
});

Deno.test("pontos oficiais: a coluna Pk que ainda não saiu (legenda já com a jornada) não vira 0 'oficial'", async () => {
  // A legenda já lista a J1, mas o organizador ainda não pôs os pontos P1.
  const semP1 = comColunaPVazia(SINT_GERAL_PAGE, 1);
  const check = checkStandingsPage(semP1, sintStandingsCtx());
  assertEquals(check.ok, true, check.failures.join(","));
  assertEquals(check.legendMap.get(1), SINT_J1.id);
  assertEquals([...publishedPointColumns(check.rows)], [2]);
  assertEquals([...publishedPointColumns(checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx()).rows)].sort(), [1, 2]);
  const l = await link(semP1);
  assertEquals(l.byEnrollment[0].outcome, "ligada");
  assertEquals(l.byEnrollment[0].pointsByRound, { [SINT_J2.id]: 11 });
  const conf = (round: string, points: number, source: string): ExistingResult => ({
    enrollment_id: PROPRIA.enrollmentId, round_id: round, match_status: "confirmada", bib_key: K412, match_hash: "h", points, points_source: source,
  });
  // Os provisórios ficam provisórios; os oficiais que já havia ficam.
  assertEquals(officialPointsWrites(l, [conf(SINT_J1.id, 13, "calculado")]), []);
  assertEquals(officialPointsWrites(l, [conf(SINT_J1.id, 15, "oficial")]), []);
  // A coluna saiu para os outros, mas a célula DELA está vazia: não vira 0.
  const semCelula = checkStandingsPage(comCelulaDaPropriaVazia(SINT_GERAL_PAGE, 1), sintStandingsCtx());
  assertEquals(semCelula.ok, true, semCelula.failures.join(","));
  const l2 = await link(comCelulaDaPropriaVazia(SINT_GERAL_PAGE, 1));
  assertEquals(l2.byEnrollment[0].pointsByRound, { [SINT_J2.id]: 11 });
  assertEquals(officialPointsWrites(l2, [conf(SINT_J1.id, 13, "calculado")]), []);
  // Um 0 escrito pelo organizador numa coluna que já saiu é um número: fica.
  const zero = new CanonStandingRow({ table: 0, categoryCode: "F40", pos: 9, nameNorm: "x", teamNorm: "y", year: 1987, points: [0, null, 11], total: 11 });
  assertEquals(officialPointsByRound(zero, new Map([[1, "r1"], [2, "r2"], [3, "r3"], [4, null]]), new Set([1, 2, 3])), new Map([["r1", 0], ["r3", 11]]));
  assertEquals(officialPointsByRound(zero, new Map([[1, "r1"], [3, "r3"]]), new Set([3])), new Map([["r3", 11]]));
});

Deno.test("calculatedPoints: escalão, geral, depois do fim da tabela vale o último; sem tabela ou base → null", () => {
  const T = SINT_POINTS_TABLE;
  assertEquals(calculatedPoints(T, "escalao", { categoryPos: 2, pos: 12 }), 13);
  assertEquals(calculatedPoints(T, "geral", { categoryPos: 2, pos: 12 }), 3);
  assertEquals(calculatedPoints(T, "escalao", { categoryPos: 25, pos: 1 }), 2);
  assertEquals(calculatedPoints(T, "escalao", { categoryPos: 400, pos: 1 }), 1);
  assertEquals(calculatedPoints(null, "escalao", { categoryPos: 1, pos: 1 }), null);
  assertEquals(calculatedPoints(T, null, { categoryPos: 1, pos: 1 }), null);
  assertEquals(calculatedPoints([15, null as unknown as number], "escalao", { categoryPos: 1, pos: 1 }), null);
  assertEquals(calculatedPoints(T, "escalao", { categoryPos: 0, pos: 1 }), null);
});

Deno.test("teamTotals: só clubes (Individual e desconhecidos fora), mínimo de atletas, desempate por 1.ºs lugares, melhores N", () => {
  const rows = checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx()).rows;
  const resolve = makeTeamResolver(SINT_TEAMS as never, []);
  const t1 = teamTotals(rows, 1, { team_scoring: "soma_todos", team_min_athletes: 4, pointsTable: SINT_POINTS_TABLE }, resolve);
  assertEquals(t1, [
    { teamId: SINT_TEAM_NAZA, points: 148, athletes: 10, position: 1 },
    { teamId: SINT_TEAM_CCD, points: 116, athletes: 8, position: 2 },
  ]);
  assertEquals(teamTotals(rows, 1, { team_min_athletes: 9, pointsTable: SINT_POINTS_TABLE }, resolve).map((t) => t.teamId), [SINT_TEAM_NAZA]);
  // Desempate (5.6): mais 15, depois mais 13…; ainda empatados → o mesmo lugar.
  const mk = (team: string, pts: number[]) =>
    pts.map((p, i) => new CanonStandingRow({ table: 0, categoryCode: "M40", pos: i + 1, nameNorm: `x ${team} ${i}`, teamNorm: team, year: 1980, points: [p], total: p }));
  const r2 = [...mk("x", [15, 9, 9, 9]), ...mk("y", [13, 11, 9, 9]), ...mk("z", [13, 11, 9, 9])];
  const id = (t: string) => t;
  assertEquals(teamTotals(r2, 1, { team_min_athletes: 4, pointsTable: SINT_POINTS_TABLE }, id).map((t) => [t.teamId, t.points, t.position]), [
    ["x", 42, 1], ["y", 42, 2], ["z", 42, 2],
  ]);
  // Melhores 2 (a fictícia): x 15+9 = 24, y 13+11 = 24 → x pelo 1.º lugar.
  assertEquals(teamTotals(r2, 1, { team_scoring: "melhores_n", team_counting_n: 2, team_min_athletes: 3, pointsTable: SINT_POINTS_TABLE }, id).map((t) => [t.teamId, t.points, t.athletes, t.position]), [
    ["x", 24, 4, 1], ["y", 24, 4, 2], ["z", 24, 4, 2],
  ]);
});

Deno.test("teamResultWrites: só os clubes com inscritos; um clube que deixou de ser elegível perde a linha do job", () => {
  const rows = checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx()).rows;
  const totals = teamTotals(rows, 1, { team_min_athletes: 4, pointsTable: SINT_POINTS_TABLE }, makeTeamResolver(SINT_TEAMS as never, []));
  const naza = SINT_TEAMS.find((t) => t.id === SINT_TEAM_NAZA)!.name as string;
  const ccd = SINT_TEAMS.find((t) => t.id === SINT_TEAM_CCD)!.name as string;
  const w = teamResultWrites(totals, [
    { round_id: J1, team_id: SINT_TEAM_CCD, team_name: ccd, position: 2, points: 116, athletes_count: 8, points_source: "calculado" },
    { round_id: J1, team_id: null, team_name: "Manual do admin", position: 9, points: 1, athletes_count: 4, points_source: null },
  ], J1, SINT_TEAMS as never, new Set([SINT_TEAM_NAZA]));
  assertEquals(w, [
    { op: "insert", row: { round_id: J1, team_id: SINT_TEAM_NAZA, team_name: naza, position: 1, points: 148, athletes_count: 10, points_source: "calculado" } },
    { op: "delete", round_id: J1, team_name: ccd },
  ]);
  const again = teamResultWrites(totals, [{ ...(w[0] as Extract<typeof w[0], { op: "insert" }>).row }], J1, SINT_TEAMS as never, new Set([SINT_TEAM_NAZA]));
  assertEquals(again, []);
});

// ── Relatórios e cruzamento (ensaio) ────────────────────────────────────

Deno.test("crossCheck: a base é o escalão e os de fora não ocupam lugar; a chave da geral tem par único", () => {
  const r = crossCheck(checkRoundPage(SINT_J1_PAGE, sintRoundCtx()), checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx()), 1, SINT_POINTS_TABLE);
  assertEquals(r.disponivel, true);
  assertEquals([r.escaloes, r.escaloes_que_batem_so_com_pontos, r.escaloes_que_batem_todos], [32, 32, 0]);
  assertEquals([r.base_provavel, r.fora_ocupam_lugar], ["escalao", false]);
  assertEquals(r.por_escalao.find((c) => c.escalao === "F40"), {
    escalao: "F40", na_pagina: 4, com_pontos: 3, soma_oficial: 39, esperado_todos: 49, esperado_so_com_pontos: 39,
  });
  assertEquals(r.chave_da_geral, { linhas_com_pontos: 34, com_par_unico_na_pagina: 34 });
  // A coletiva da conta: a Equipa da geral como clube (a ASC conta aqui), Individual fora.
  assertEquals(r.coletiva, { equipas_elegiveis: 3, top3_pontos: [148, 120, 116] });
  // Uma página partida: sem números.
  assertEquals(crossCheck(checkRoundPage(paginaErro(SINT_J1_PAGE), sintRoundCtx()), checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx()), 1, SINT_POINTS_TABLE).disponivel, false);
});

// ── Fuga (puro): nenhum dado de terceiros em nenhuma saída ───────────────

Deno.test("fuga: check → correspondência → escritas → geral → coletiva → resumos → cruzamento, sem dados de terceiros", async () => {
  const pages = [
    SINT_J1_PAGE, semLinhaDaPropria(SINT_J1_PAGE), comDorsalRepetidoNaPagina(SINT_J1_PAGE, PROPRIA.bib),
    comLinhaDaPropria(SINT_J1_PAGE, { club: "Clube Novo da Própria" }), comMarcaIlegivel(SINT_J1_PAGE, 5),
  ];
  const outputs: unknown[] = [];
  for (const p of pages) {
    const c = checkRoundPage(p, sintRoundCtx());
    outputs.push(roundSummary(c), c.stats, c.failures, c.warnings);
    const o = match(p, [propria(), propria({ id: "e-2", userId: "u-2", bibNorm: "9999", bibKey: await keyOf("9999"), team: { team_id: SINT_TEAM_CCD, team_other: null } })]);
    outputs.push(o, await writesFor(o), await writesFor(o, [{ enrollment_id: PROPRIA.enrollmentId, round_id: J1, match_status: "confirmada", bib_key: K412, match_hash: "h" }]));
  }
  const g = checkStandingsPage(SINT_GERAL_PAGE, sintStandingsCtx());
  outputs.push(standingsSummary(g, { unmappedTeams: 1 }), g.stats, [...g.legendMap]);
  const l = await link();
  outputs.push(l, standingsWrites(l, [], ED, at("2027-01-11T12:00:00Z")), officialPointsWrites(l, []));
  const totals = teamTotals(g.rows, 1, { team_min_athletes: 4, pointsTable: SINT_POINTS_TABLE }, makeTeamResolver(SINT_TEAMS as never, []));
  outputs.push(totals, teamResultWrites(totals, [], J1, SINT_TEAMS as never, new Set([SINT_TEAM_NAZA])));
  outputs.push(crossCheck(checkRoundPage(SINT_J1_PAGE, sintRoundCtx()), g, 1, SINT_POINTS_TABLE));
  outputs.push(crossCheck(checkRoundPage(SINT_J1_PAGE, sintRoundCtx()), g, 2, SINT_POINTS_TABLE));

  const json = JSON.stringify(outputs);
  const lower = json.toLowerCase();
  for (const n of TOKENS_TERCEIROS.nomes) {
    assert(!json.includes(n), `nome: ${n}`);
    assert(!lower.includes(normText(n)), `nome normalizado: ${n}`);
  }
  for (const d of TOKENS_TERCEIROS.dorsais) {
    for (const v of new Set([d, normBib(d)!])) assert(!new RegExp(`\\b${v}\\b`).test(json), `dorsal: ${v}`);
  }
  for (const c of TOKENS_TERCEIROS.clubes) {
    assert(!json.includes(c), `clube: ${c}`);
    assert(!lower.includes(normText(c)), `clube normalizado: ${c}`);
  }
  // Nem o nome nem o dorsal DELA: só hashes (o clube novo dela é organização).
  assert(!lower.includes(normText(PROPRIA.pageName)) && !json.includes(PROPRIA.geralName));
  assert(!/\b0?412\b/.test(json));
  // E as linhas oficiais em si nunca passam por um JSON.
  assertThrows(() => JSON.stringify(checkRoundPage(SINT_J1_PAGE, sintRoundCtx()).rows));
  assertThrows(() => JSON.stringify(g));
});
