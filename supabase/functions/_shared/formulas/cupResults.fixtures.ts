// Fixtures SINTÉTICAS da classificação oficial (specs/trofeu.md §7, Fase 4).
// 2026-09-27.
//
// INVENTADAS À MÃO, por código: nenhuma página real do site entra no git
// (decisão do dono — a spec falava em "reais anonimizadas"). Os nomes são
// "Terceiro Sintético NN", os dorsais 9001… e os clubes de fora "Clube
// Inventado de Fora NN"; a atleta da app é "Ana Própria Teste". A estrutura
// imita a do site (lida em 2026-09-27, só em agregado): uma tabela por série
// de distância e género, colunas Pos/Dorsal/Nome/Clube/Escalão/Marca, o
// Escalão sem género nos jovens e seniores ("Sub-18", "Seniores"); a geral
// com uma tabela por escalão e género, Pos/Nome/Ano/Equipa/P1..P11/Total e a
// legenda "P1: … (dd-mm)".
//
// A regra dos pontos que as fixtures seguem é a que a J1 da 33.ª mostrou em
// agregado: base = escalão e OS DE FORA NÃO OCUPAM LUGAR — na página, cada
// escalão tem um atleta de um clube de fora À FRENTE do de Cascais, e na
// geral o de Cascais leva os 15 pontos. Por isso os pontos calculados pela
// app a partir da página (13) são um mínimo dos oficiais (15).
//
// TOKENS_TERCEIROS: tudo o que é de terceiros e nunca pode aparecer numa
// saída (testes de fuga do pacote 1 e do job).

import {
  CASCAIS_34_REG,
  CASCAIS_REG_CATEGORIES,
  CASCAIS_REG_COURSE_DISTANCES,
  CASCAIS_REG_POINTS_TABLE,
  CASCAIS_TEAMS,
} from "./cup.fixtures.ts";
import type { CupCourse, CupEdition, CupRound, CupTeam } from "./cup.ts";
import type {
  RoundCtx,
  SourceResultRow,
  SourceResultTable,
  SourceRoundPage,
  SourceStandingRow,
  SourceStandingsPage,
  SourceStandingTable,
  StandingsCtx,
} from "./cupResults.ts";

// ── A edição, as jornadas e os clubes ─────────────────────────────────────

export const SINT_EDITION: CupEdition = {
  ...CASCAIS_34_REG,
  sync_mode: "publicar",
  standings_url: "https://trofeuatletismocascais.pt/Trofeu/99",
};

/** Os clubes da edição (NAZA, CCD Cascais, Individual). A "Associação
 *  Sintética de Cascais" aparece na geral e NÃO está aqui: é o clube de
 *  Cascais por ligar (equipas_por_ligar = 1). */
export const SINT_TEAMS: CupTeam[] = CASCAIS_TEAMS;
export const SINT_TEAM_NAZA = "t-naza";
export const SINT_TEAM_CCD = "t-ccd";
export const SINT_TEAM_IND = "t-ind";

const J_DATES: (string | null)[] = [
  "2026-12-06", "2027-01-10", null, "2027-02-07", "2027-02-21", "2027-03-07",
  "2027-03-21", "2027-04-11", "2027-05-02", "2027-05-23", "2027-06-13",
];

/** 11 jornadas: J1 e J2 confirmadas (já corridas na legenda da geral), J3
 *  ainda sem data, as outras prováveis. */
export const SINT_ROUNDS: CupRound[] = J_DATES.map((date, i) => ({
  id: `r-sint-${i + 1}`,
  edition_id: SINT_EDITION.id,
  round_no: i + 1,
  name: i === 0 ? "Padroeira Sintética" : i === 1 ? "Corta-Mato Sintético" : `Jornada Sintética ${i + 1}`,
  date,
  date_status: i < 2 ? "confirmada" : "provavel",
  terrain: i === 1 ? "corta_mato" : "estrada",
}));

export const SINT_J1 = SINT_ROUNDS[0];
export const SINT_J2 = SINT_ROUNDS[1];

export const SINT_COURSES: CupCourse[] = [SINT_J1, SINT_J2].flatMap((r) =>
  Object.entries(CASCAIS_REG_COURSE_DISTANCES).map(([code, distance_m]) => ({
    id: `k-${r.id}-${code.toLowerCase()}`,
    round_id: r.id,
    code,
    distance_m,
    distance_status: "oficial",
    start_time: code === "LONGO" ? "09:30:00" : code === "CURTO" ? "10:15:00" : "11:00:00",
  }))
);

export const SINT_POINTS_TABLE = CASCAIS_REG_POINTS_TABLE;
export const SINT_CATEGORY_CODES = new Set(CASCAIS_REG_CATEGORIES.map((c) => c.code));

// ── Quem está nas páginas ─────────────────────────────────────────────────

/** A atleta da app (a única linha que se pode guardar). F, nascida em 1987 →
 *  F40 na 34.ª (idade a 31/12/2027). */
export const PROPRIA = {
  userId: "u-propria",
  enrollmentId: "e-propria",
  bib: "0412",
  birth_date: "1987-06-01",
  gender: "F" as const,
  team_id: SINT_TEAM_NAZA,
  category: "F40",
  /** Como a página da prova a escreve. */
  pageName: "Ana Própria Teste",
  pageCategory: "F40",
  pageClub: "NAZA",
  pageTime: "24:31",
  /** Como a geral a escreve. */
  geralName: "ANA PROPRIA TESTE",
  /** Como uma geral a escreve com um nome do meio que a página não tem: a
   *  chave exata falha, a alternativa (1.º e último nome) acha-a. */
  geralNameMeio: "ANA MARIA PROPRIA TESTE",
  geralYear: "1987",
  geralTeam: "Núcleo de Atletismo da Zona da Abóboda (NAZA)",
};

/** O vizinho de dorsal (0413): colega de clube e de escalão dela. Nunca se
 *  liga nem aparece numa saída — só conta em agregado. */
export const VIZINHO = { bib: "0413", name: "Terceiro Sintético 97", category: "F40", club: "NAZA" };

interface Athlete {
  name: string;
  bib: string | null;
  code: string;
  pageClub: string | null; // null = não corre a J1
  geralTeam: string | null; // null = não está na geral (clube de fora)
  year: number;
  p1: number | null;
  p2: number | null;
  timeS?: number; // só para a própria
}

const nn = (n: number) => String(n).padStart(2, "0");
const CASCAIS_CLUBS: { page: string; geral: string }[] = [
  { page: "NAZA", geral: "Núcleo de Atletismo da Zona da Abóboda (NAZA)" },
  // Na página, a sigla "CCD" (não é o short_name do catálogo: vira alias novo).
  { page: "CCD", geral: "CCD do Pessoal do Município de Cascais" },
  { page: "", geral: "Individual" },
  { page: "ASC", geral: "Associação Sintética de Cascais" },
];

const LABEL: Record<string, string> = Object.fromEntries(
  CASCAIS_REG_CATEGORIES.map((c) => {
    const code = c.code;
    const label = code.startsWith("SUB") ? `Sub-${code.slice(3, 5)}` : code.startsWith("SEN") ? "Seniores" : code;
    return [code, label];
  }),
);

/** Por escalão: A = de Cascais (J1 e J2), B = de fora (só a J1, à frente de
 *  A), G = de Cascais só na J2. Em F40, entre B e A: a própria e o vizinho. */
function roster(): Athlete[] {
  const out: Athlete[] = [];
  CASCAIS_REG_CATEGORIES.forEach((c, ci) => {
    const club = CASCAIS_CLUBS[ci % CASCAIS_CLUBS.length];
    const year = 2027 - (c.min_age ?? 0);
    const a = ci + 1, b = ci + 33, g = ci + 65;
    out.push({
      name: `Terceiro Sintético ${nn(b)}`, bib: String(9000 + b), code: c.code,
      pageClub: `Clube Inventado de Fora ${nn(b)}`, geralTeam: null, year, p1: null, p2: null,
    });
    if (c.code === "F40") {
      out.push({
        name: PROPRIA.pageName, bib: PROPRIA.bib, code: "F40", pageClub: PROPRIA.pageClub,
        geralTeam: PROPRIA.geralTeam, year: Number(PROPRIA.geralYear), p1: 15, p2: 11,
      });
      out.push({
        name: VIZINHO.name, bib: VIZINHO.bib, code: "F40", pageClub: VIZINHO.club,
        geralTeam: CASCAIS_CLUBS[0].geral, year: 1985, p1: 13, p2: 10,
      });
    }
    const f40 = c.code === "F40";
    out.push({
      name: `Terceiro Sintético ${nn(a)}`, bib: String(9000 + a), code: c.code, pageClub: club.page,
      geralTeam: club.geral, year, p1: f40 ? 11 : 15,
      // M50: o A não corre a J2 e empata com o G (15 = 15) — ranking 1, 1.
      p2: c.code === "M50" ? null : 13,
    });
    out.push({
      name: `Terceiro Sintético ${nn(g)}`, bib: null, code: c.code, pageClub: null,
      geralTeam: club.geral, year: year - 1 >= 2027 - (c.max_age ?? 200) ? year - 1 : year, p1: null, p2: 15,
    });
  });
  return out;
}

const ROSTER = roster();

// ── A página da J1 (/Resultados/{id}) ─────────────────────────────────────

const J1_TABLES: { distanceM: number; gender: "M" | "F"; codes: string[]; base: number }[] = [
  { distanceM: 6300, gender: "M", codes: ["SUB20M", "SUB23M", "SENM", "M35", "M40", "M45", "M50", "M55"], base: 20 * 60 },
  {
    distanceM: 3300, gender: "F",
    codes: ["SUB18F", "SUB20F", "SUB23F", "SENF", "F35", "F40", "F45", "F50", "F55", "F60", "F65", "F70"],
    // A própria é a 12.ª linha desta tabela: 17:11 + 11 × 40 s = 24:31.
    base: 17 * 60 + 11,
  },
  { distanceM: 3300, gender: "M", codes: ["SUB18M", "M60", "M65", "M70", "M75", "M80"], base: 13 * 60 },
  { distanceM: 1900, gender: "F", codes: ["SUB16F"], base: 7 * 60 },
  { distanceM: 1900, gender: "M", codes: ["SUB16M"], base: 6 * 60 + 30 },
  { distanceM: 1100, gender: "F", codes: ["SUB14F"], base: 4 * 60 },
  { distanceM: 1100, gender: "M", codes: ["SUB14M"], base: 3 * 60 + 50 },
  { distanceM: 400, gender: "F", codes: ["SUB12F"], base: 90 },
  { distanceM: 400, gender: "M", codes: ["SUB12M"], base: 85 },
];

const STEP_S = 40;
const mmss = (s: number) =>
  s >= 3600
    ? `${Math.floor(s / 3600)}:${nn(Math.floor((s % 3600) / 60))}:${nn(s % 60)}`
    : `${nn(Math.floor(s / 60))}:${nn(s % 60)}`;

function buildJ1(): SourceRoundPage {
  const tables: SourceResultTable[] = J1_TABLES.map((t) => {
    const athletes = t.codes.flatMap((code) => ROSTER.filter((a) => a.code === code && a.pageClub != null));
    const rows: SourceResultRow[] = athletes.map((a, i) => ({
      pos: String(i + 1),
      bib: a.bib ?? "",
      name: a.name,
      club: a.pageClub ?? "",
      category: LABEL[a.code],
      time: mmss(t.base + i * STEP_S),
    }));
    return { distanceM: t.distanceM, gender: t.gender, missingColumns: [], rows };
  });
  return {
    kind: "jornada",
    title: "PADROEIRA SINTÉTICA - Resultados",
    raceName: "PADROEIRA SINTÉTICA",
    date: "2026-12-06",
    errorPage: false,
    tables,
  };
}

// ── A classificação geral (/Trofeu/{id}) ──────────────────────────────────

export const SINT_P_COUNT = 11;

/** Pos em ranking de competição por Total decrescente (a ordem de entrada
 *  desempata totais iguais só para a ordem das linhas). */
function rerank(rows: SourceStandingRow[]): SourceStandingRow[] {
  const sorted = [...rows].sort((a, b) => Number(b.total) - Number(a.total));
  return sorted.map((r, i) => ({
    ...r,
    pos: String(i > 0 && sorted[i - 1].total === r.total ? 0 : i + 1),
  })).map((r, i, all) => {
    if (r.pos !== "0") return r;
    let j = i;
    while (j > 0 && all[j].pos === "0") j -= 1;
    return { ...r, pos: all[j].pos };
  });
}

function buildGeral(): SourceStandingsPage {
  const tables: SourceStandingTable[] = CASCAIS_REG_CATEGORIES.map((c) => {
    const rows: SourceStandingRow[] = ROSTER.filter((a) => a.code === c.code && a.geralTeam != null).map((a) => {
      const points = Array.from({ length: SINT_P_COUNT }, (_, k) => {
        const v = k === 0 ? a.p1 : k === 1 ? a.p2 : null;
        return v == null ? "" : String(v);
      });
      const total = (a.p1 ?? 0) + (a.p2 ?? 0);
      const name = a.name === PROPRIA.pageName ? PROPRIA.geralName : a.name.toUpperCase();
      return { pos: "", name, year: String(a.year), team: a.geralTeam!, points, total: String(total) };
    });
    return {
      category: LABEL[c.code],
      gender: c.gender as "M" | "F",
      pCount: SINT_P_COUNT,
      missingColumns: [],
      rows: rerank(rows),
    };
  });
  return {
    kind: "geral",
    title: "34º TROFÉU SINTÉTICO DE ATLETISMO 2026/2027 - Classificação",
    seasonLabel: "2026/2027",
    errorPage: false,
    legend: [
      { k: 1, name: "PADROEIRA SINTÉTICA", dayMonth: "06-12" },
      { k: 2, name: "CORTA-MATO SINTÉTICO", dayMonth: "10-01" },
    ],
    tables,
  };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

/** A página da J1: 9 tabelas (6300 M; 3300 F; 3300 M; 1900, 1100 e 400 F/M),
 *  os 32 escalões, 66 linhas. Congelada: os mutadores devolvem cópias. */
export const SINT_J1_PAGE: SourceRoundPage = deepFreeze(buildJ1());

/** A geral depois da J2: 32 tabelas, 66 linhas, P1..P11 (só P1 e P2 com
 *  pontos), Totais certos, legenda P1 (06-12) e P2 (10-01). */
export const SINT_GERAL_PAGE: SourceStandingsPage = deepFreeze(buildGeral());

/** Uma homónima dela pela chave ALTERNATIVA (o mesmo 1.º e último nome, o
 *  escalão, a equipa e o ano; outra pessoa, inventada): só entra na geral
 *  com comHomonimaAlternativaNaGeral. */
export const HOMONIMA_ALT = "Ana Segunda Teste";

/** Tudo o que é de terceiros (nomes, dorsais, clubes de fora). */
export const TOKENS_TERCEIROS: { nomes: string[]; dorsais: string[]; clubes: string[] } = deepFreeze({
  nomes: [...ROSTER.filter((a) => a.name !== PROPRIA.pageName).map((a) => a.name), HOMONIMA_ALT],
  dorsais: ROSTER.filter((a) => a.bib && a.bib !== PROPRIA.bib).map((a) => a.bib!),
  clubes: ROSTER.filter((a) => a.pageClub?.startsWith("Clube Inventado")).map((a) => a.pageClub!),
});

// ── Contextos de validação ────────────────────────────────────────────────

export function sintRoundCtx(over: Partial<RoundCtx> = {}): RoundCtx {
  return {
    roundDate: SINT_J1.date as string,
    categoryCodes: SINT_CATEGORY_CODES,
    courseDistancesM: Object.values(CASCAIS_REG_COURSE_DISTANCES),
    roundName: SINT_J1.name as string,
    prev: null,
    ...over,
  };
}

export function sintStandingsCtx(over: Partial<StandingsCtx> = {}): StandingsCtx {
  return {
    seasonLabel: SINT_EDITION.season_label as string,
    categoryCodes: SINT_CATEGORY_CODES,
    pointsTable: SINT_POINTS_TABLE,
    roundDates: SINT_ROUNDS.map((r) => ({ roundId: r.id, roundNo: r.round_no as number, date: r.date ?? null })),
    prev: null,
    nowYear: 2027,
    ...over,
  };
}

// ── Mutadores puros (devolvem cópias) ─────────────────────────────────────

type RoundPage = SourceRoundPage;
type GeralPage = SourceStandingsPage;
const copy = <T>(o: T): T => structuredClone(o) as T;

function renumber(t: SourceResultTable): void {
  t.rows.forEach((r, i) => (r.pos = String(i + 1)));
}

function findPropria(p: RoundPage): { t: SourceResultTable; i: number } {
  for (const t of p.tables) {
    const i = t.rows.findIndex((r) => r.bib === PROPRIA.bib);
    if (i >= 0) return { t, i };
  }
  throw new Error("fixture sem a linha da própria");
}

/** Uma tabela sem a coluna (o parse não a encontrou). */
export function semColuna(p: RoundPage, col: string): RoundPage {
  const c = copy(p);
  c.tables[0].missingColumns = [col];
  return c;
}

/** O parse leu Pos e Dorsal trocados (as posições partem-se). */
export function colunasTrocadas(p: RoundPage): RoundPage {
  const c = copy(p);
  for (const r of c.tables[0].rows) [r.pos, r.bib] = [r.bib, r.pos];
  return c;
}

export function paginaErro<T extends RoundPage | GeralPage>(p: T): T {
  const c = copy(p);
  c.errorPage = true;
  return c;
}

/** Uma posição salta um lugar na 1.ª tabela (…, 3, 5, …). */
export function comBuracoNasPosicoes(p: RoundPage): RoundPage {
  const c = copy(p);
  c.tables[0].rows.slice(3).forEach((r, i) => (r.pos = String(i + 5)));
  return c;
}

/** Um lugar em falta em cada linha da 1.ª tabela a partir da 4.ª (…, 3, 5,
 *  7, …): saltos a mais — página partida. */
export function comMuitosBuracosNasPosicoes(p: RoundPage): RoundPage {
  const c = copy(p);
  c.tables[0].rows.slice(3).forEach((r, i) => (r.pos = String(5 + 2 * i)));
  return c;
}

/** Outra data na página (o admin colou o link de outra prova). */
export function comData(p: RoundPage, iso: string): RoundPage {
  return { ...copy(p), date: iso };
}

/** O dorsal repetido noutra linha da página (a 1.ª linha da 1.ª tabela). */
export function comDorsalRepetidoNaPagina(p: RoundPage, bib: string): RoundPage {
  const c = copy(p);
  c.tables[0].rows[0].bib = bib;
  return c;
}

/** Metade das linhas de cada tabela (regressão face à leitura anterior). */
export function metadeDasLinhas(p: RoundPage): RoundPage {
  const c = copy(p);
  for (const t of c.tables) t.rows = t.rows.slice(0, Math.ceil(t.rows.length / 2));
  return c;
}

/** Um rótulo de escalão que o seed não tem. */
export function comEscalao(p: RoundPage, label: string): RoundPage {
  const c = copy(p);
  c.tables[0].rows[0].category = label;
  return c;
}

/** n linhas com a marca ilegível (a partir do fim da 1.ª tabela). */
export function comMarcaIlegivel(p: RoundPage, n: number): RoundPage {
  const c = copy(p);
  const all = c.tables.flatMap((t) => t.rows).filter((r) => r.bib !== PROPRIA.bib);
  all.slice(0, n).forEach((r) => (r.time = "DNF"));
  return c;
}

/** Muda a linha da própria (clube, escalão, nome, marca, dorsal). */
export function comLinhaDaPropria(
  p: RoundPage,
  f: { club?: string; category?: string; name?: string; time?: string; bib?: string },
): RoundPage {
  const c = copy(p);
  const { t, i } = findPropria(c);
  const r = t.rows[i];
  if (f.club !== undefined) r.club = f.club;
  if (f.category !== undefined) r.category = f.category;
  if (f.name !== undefined) r.name = f.name;
  if (f.time !== undefined) r.time = f.time;
  if (f.bib !== undefined) r.bib = f.bib;
  return c;
}

/** A página sem a linha da própria (o vizinho 0413 fica). */
export function semLinhaDaPropria(p: RoundPage): RoundPage {
  const c = copy(p);
  const { t, i } = findPropria(c);
  t.rows.splice(i, 1);
  renumber(t);
  return c;
}

/** Um Total que não é a soma. */
export function comTotalErrado(g: GeralPage): GeralPage {
  const c = copy(g);
  const r = c.tables[0].rows[0];
  r.total = String(Number(r.total) + 1);
  return c;
}

/** Duas linhas com totais diferentes e a mesma Pos. */
export function comRankingErrado(g: GeralPage): GeralPage {
  const c = copy(g);
  c.tables[0].rows[1].pos = c.tables[0].rows[0].pos;
  return c;
}

/** Um P fora da tabela (o Total acompanha, para isolar a invariante). */
export function comPontoForaDaTabela(g: GeralPage, v: number): GeralPage {
  const c = copy(g);
  const r = c.tables[0].rows[0];
  const old = Number(r.points[0] || 0);
  r.points[0] = String(v);
  r.total = String(Number(r.total) - old + v);
  c.tables[0].rows = rerank(c.tables[0].rows);
  return c;
}

export function comEpoca(g: GeralPage, label: string): GeralPage {
  const c = copy(g);
  c.seasonLabel = label;
  c.title = c.title.replace(/\d{4}\/\d{4}/, label);
  return c;
}

export function semLegenda(g: GeralPage): GeralPage {
  return { ...copy(g), legend: [] };
}

function findPropriaGeral(g: GeralPage): { t: SourceStandingTable; i: number } {
  for (const t of g.tables) {
    const i = t.rows.findIndex((r) => r.name === PROPRIA.geralName);
    if (i >= 0) return { t, i };
  }
  throw new Error("fixture sem a linha da própria na geral");
}

/** Muda a linha dela na geral (ano, equipa, nome). */
export function comLinhaDaPropriaNaGeral(g: GeralPage, f: { year?: string; team?: string; name?: string }): GeralPage {
  const c = copy(g);
  const { t, i } = findPropriaGeral(c);
  if (f.year !== undefined) t.rows[i].year = f.year;
  if (f.team !== undefined) t.rows[i].team = f.team;
  if (f.name !== undefined) t.rows[i].name = f.name;
  return c;
}

/** O nome dela na geral com um nome do meio (PROPRIA.geralNameMeio). */
export function comNomeDoMeioNaGeral(g: GeralPage): GeralPage {
  return comLinhaDaPropriaNaGeral(g, { name: PROPRIA.geralNameMeio });
}

/** Uma homónima pela chave alternativa (HOMONIMA_ALT), logo a seguir a ela:
 *  o mesmo escalão, equipa e ano, com os mesmos pontos (o aviso da soma do
 *  escalão, como em comDuasLinhasDaPropriaNaGeral). */
export function comHomonimaAlternativaNaGeral(g: GeralPage): GeralPage {
  const c = copy(g);
  const { t, i } = findPropriaGeral(c);
  t.rows.splice(i + 1, 0, { ...t.rows[i], name: HOMONIMA_ALT.toUpperCase(), points: [...t.rows[i].points] });
  t.rows = rerank(t.rows);
  return c;
}

/** Duas linhas iguais à dela na geral (o mesmo nome, escalão, equipa e ano):
 *  repetidos não ligam. */
export function comDuasLinhasDaPropriaNaGeral(g: GeralPage): GeralPage {
  const c = copy(g);
  const { t, i } = findPropriaGeral(c);
  t.rows.splice(i + 1, 0, { ...t.rows[i], points: [...t.rows[i].points] });
  t.rows = rerank(t.rows);
  return c;
}

/** A coluna Pk vazia em todas as linhas (os Totais e o ranking acompanham):
 *  a legenda já lista a jornada k, mas o organizador ainda não pôs os
 *  pontos. */
export function comColunaPVazia(g: GeralPage, k: number): GeralPage {
  const c = copy(g);
  for (const t of c.tables) {
    for (const r of t.rows) {
      const old = Number(r.points[k - 1] || 0);
      r.points[k - 1] = "";
      r.total = String(Number(r.total) - old);
    }
    t.rows = rerank(t.rows);
  }
  return c;
}

/** Só a célula Pk dela vazia (a coluna já saiu para os outros). */
export function comCelulaDaPropriaVazia(g: GeralPage, k: number): GeralPage {
  const c = copy(g);
  const { t, i } = findPropriaGeral(c);
  const r = t.rows[i];
  const old = Number(r.points[k - 1] || 0);
  r.points[k - 1] = "";
  r.total = String(Number(r.total) - old);
  t.rows = rerank(t.rows);
  return c;
}
