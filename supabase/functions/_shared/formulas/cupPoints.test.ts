import { assert, assertEquals } from "jsr:@std/assert@1";
import { pointsBand, referencePosition, REFERENCE_RESULTS, type CupResultLike } from "./cupPoints.ts";
import { attendanceCount, type CupEdition } from "./cup.ts";

/* A faixa de pontos e o contador das personas (specs/trofeu.md §5 "Pontos",
   Fase 2, 2026-09-26). O golden é o mesmo da arbitragem
   (seriesPersonas.golden.json); cup.ts não muda — o contador é o
   attendanceCount da Fase 1. */

// deno-lint-ignore no-explicit-any
type Json = any;

const golden: Json = JSON.parse(await Deno.readTextFile(new URL("./seriesPersonas.golden.json", import.meta.url)));
const editions: Record<string, CupEdition> = golden.editions;

// ── O golden ────────────────────────────────────────────────────────────

for (const p of golden.personas) {
  if (!p.expect) continue; // I: não inscrito (a invariância testa-se no servidor e no cliente)
  Deno.test(`pointsBand — persona ${p.id}`, () => {
    assertEquals(pointsBand(editions[p.edition], p.kind, p.results), p.expect.band);
  });
  Deno.test(`attendanceCount (cup.ts, sem mudar) — persona ${p.id}: só com o objetivo 'premio'`, () => {
    const got = p.seasonGoal === "premio" ? attendanceCount(editions[p.edition], p.rounds, p.attendanceRaces, p.today) : null;
    assertEquals(got, p.expect.attendance);
  });
}

Deno.test("o argumento da presença: A, B e H sim (base conhecida, soma_todos, clube_elegivel); os outros não", () => {
  const got = Object.fromEntries(
    golden.personas.filter((p: Json) => p.expect).map((p: Json) => [p.id, pointsBand(editions[p.edition], p.kind, p.results).attendanceArgument]),
  );
  assertEquals(got, { A: true, B: true, C: false, D: false, E: false, F: false, G: false, H: true, J: false, K: false });
});

Deno.test("K: com a base null a Carol cala pontos MESMO havendo resultados confirmados", () => {
  const k = golden.personas.find((p: Json) => p.id === "K");
  assert(k.results.filter((r: Json) => r.match_status === "confirmada").length > 0);
  const band = pointsBand(editions[k.edition], k.kind, k.results);
  assertEquals([band.band, band.why, band.pointsKnown, band.points, band.position], ["desconhecida", "base_desconhecida", false, null, null]);
});

// ── A posição de referência ─────────────────────────────────────────────

const res = (round_id: string, round_date: string, category_position: number | null, position: number | null = null, match_status = "confirmada"): CupResultLike => ({
  round_id,
  round_date,
  category_position,
  position,
  match_status,
});

Deno.test("referencePosition — mediana das 3 mais recentes; com 2, o lugar pior (ceil da média)", () => {
  assertEquals(REFERENCE_RESULTS, 3);
  assertEquals(referencePosition([res("a", "2026-05-10", 4), res("b", "2026-05-24", 7)], "escalao"), { position: 6, count: 2, provisional: true });
  assertEquals(referencePosition([res("a", "2026-05-10", 4), res("b", "2026-05-24", 5)], "escalao"), { position: 5, count: 2, provisional: true });
  assertEquals(referencePosition([res("a", "2026-05-10", 9)], "escalao"), { position: 9, count: 1, provisional: true });
  assertEquals(
    referencePosition([res("a", "2026-04-12", 1), res("b", "2026-05-10", 12), res("c", "2026-05-24", 3), res("d", "2026-06-07", 8)], "escalao"),
    { position: 8, count: 3, provisional: false }, // a de abril (1.º) já não entra
  );
});

Deno.test("referencePosition — só as confirmadas; ignora proposta, rejeitada e perdida", () => {
  const rows = [
    res("a", "2026-06-14", 1, null, "proposta"),
    res("b", "2026-06-07", 1, null, "rejeitada"),
    res("c", "2026-05-31", 1, null, "perdida"),
    res("d", "2026-05-24", 10),
  ];
  assertEquals(referencePosition(rows, "escalao"), { position: 10, count: 1, provisional: true });
  assertEquals(referencePosition(rows.slice(0, 3), "escalao"), null);
});

Deno.test("referencePosition — escalão lê category_position, geral lê position; base desconhecida → null", () => {
  const rows = [res("a", "2026-05-10", 3, 40), res("b", "2026-05-24", 4, 44), res("c", "2026-06-07", 5, 50)];
  assertEquals(referencePosition(rows, "escalao")?.position, 4);
  assertEquals(referencePosition(rows, "geral")?.position, 44);
  assertEquals(referencePosition(rows, null), null);
  assertEquals(referencePosition(rows, "xyz"), null);
  // Sem a coluna da base (ex.: resultado sem escalão), a linha não conta.
  assertEquals(referencePosition([res("a", "2026-05-10", null, 40)], "escalao"), null);
});

Deno.test("referencePosition — posições que não são inteiros > 0 não contam; sem linhas → null", () => {
  assertEquals(referencePosition([res("a", "2026-05-10", 0), res("b", "2026-05-24", -2), res("c", "2026-06-07", 2.5)], "escalao"), null);
  assertEquals(referencePosition(null, "escalao"), null);
  assertEquals(referencePosition([], "geral"), null);
});

// ── As regras, pela ordem ───────────────────────────────────────────────

const ED: CupEdition = {
  id: "ed",
  points_mode: "tabela",
  points_table: [20, 18, 16, 14, 12, 10, 10, 10, 10, 10, 5, 5, 5, 5, 5, 2],
  points_basis: "escalao",
  team_scoring: "soma_todos",
};
const THREE = (p: number) => [res("a", "2026-05-10", p), res("b", "2026-05-24", p), res("c", "2026-06-07", p)];

Deno.test("pointsBand — sem pontos, modo, base e tabela: 'desconhecida' pela ordem das regras", () => {
  const why = (ed: Partial<CupEdition>, kind = "clube_elegivel") => pointsBand({ ...ED, ...ed } as CupEdition, kind, THREE(4)).why;
  assertEquals(why({ points_mode: "sem_pontos", points_basis: null }), "sem_pontos");
  assertEquals(why({ points_mode: null }), "modo_desconhecido");
  assertEquals(why({ points_mode: "tabela_lugar" }), "modo_desconhecido");
  assertEquals(why({ points_basis: null }), "base_desconhecida");
  assertEquals(why({ points_basis: "xyz" }), "base_desconhecida");
  assertEquals(why({ points_basis: null, points_table: null }), "base_desconhecida");
  for (const bad of [null, [], "20,18", [10, null], [10, "5"], [10, -1], [10, Number.NaN]]) {
    assertEquals(why({ points_table: bad }), "tabela_invalida", JSON.stringify(bad));
  }
  for (const kind of ["individual_aberto", "clube_aberto", "clube_por_confirmar", null, "xyz"]) {
    assertEquals(why({}, kind as string), "fora_da_classificacao", String(kind));
  }
  assertEquals(pointsBand(ED, "clube_elegivel", []).why, "sem_posicoes");
  assertEquals(pointsBand(null, "clube_elegivel", THREE(4)).why, "modo_desconhecido");
  assertEquals(pointsBand(ED, "individual_elegivel", THREE(4)).why, null);
});

Deno.test("pointsBand — o argumento da presença só com pontos conhecidos, soma_todos e clube_elegivel", () => {
  assert(pointsBand(ED, "clube_elegivel", THREE(4)).attendanceArgument);
  assert(pointsBand(ED, "clube_elegivel", []).attendanceArgument); // não depende da posição
  assert(!pointsBand(ED, "individual_elegivel", THREE(4)).attendanceArgument);
  assert(!pointsBand(ED, "clube_por_confirmar", THREE(4)).attendanceArgument);
  assert(!pointsBand({ ...ED, team_scoring: "melhores_n" }, "clube_elegivel", THREE(4)).attendanceArgument);
  assert(!pointsBand({ ...ED, team_scoring: null }, "clube_elegivel", THREE(4)).attendanceArgument);
  assert(!pointsBand({ ...ED, points_basis: null }, "clube_elegivel", THREE(4)).attendanceArgument);
  assert(!pointsBand({ ...ED, points_mode: "sem_pontos" }, "clube_elegivel", THREE(4)).attendanceArgument);
  assert(!pointsBand({ ...ED, points_table: [] }, "clube_elegivel", THREE(4)).attendanceArgument);
});

// ── Escada, patamar e piso ──────────────────────────────────────────────

Deno.test("pointsBand — o 1.º numa escada: sem bloco acima", () => {
  const b = pointsBand(ED, "clube_elegivel", THREE(1));
  assertEquals([b.band, b.points, b.block, b.nextPoints, b.placesToBoundary], ["escada", 20, { from: 1, to: 1 }, null, null]);
});

Deno.test("pointsBand — patamar: do 6.º ao 10.º todos têm 10; a distância é ao 1.º lugar do bloco acima", () => {
  const b = pointsBand(ED, "clube_elegivel", THREE(8));
  assertEquals([b.band, b.points, b.block, b.nextPoints, b.placesToBoundary], ["patamar", 10, { from: 6, to: 10 }, 12, 3]);
});

Deno.test("pointsBand — piso: o último valor da tabela vale daí para baixo, mesmo para lá do fim", () => {
  for (const p of [16, 31, 500]) {
    const b = pointsBand(ED, "clube_elegivel", THREE(p));
    assertEquals([b.band, b.points, b.block, b.nextPoints, b.placesToBoundary], ["piso", 2, { from: 16, to: null }, 5, p - 15], String(p));
  }
  // Uma tabela que acaba num patamar: o patamar é o piso.
  const tail = pointsBand({ ...ED, points_table: [10, 5, 5] }, "clube_elegivel", THREE(2));
  assertEquals([tail.band, tail.block, tail.nextPoints], ["piso", { from: 2, to: null }, 10]);
  // Uma tabela de um só valor: todos no piso, sem nada acima.
  const one = pointsBand({ ...ED, points_table: [3] }, "clube_elegivel", THREE(1));
  assertEquals([one.band, one.block, one.nextPoints, one.placesToBoundary], ["piso", { from: 1, to: null }, null, null]);
});

Deno.test("pointsBand — patamar no topo: sem bloco acima", () => {
  const b = pointsBand({ ...ED, points_table: [10, 10, 5, 2] }, "clube_elegivel", THREE(2));
  assertEquals([b.band, b.block, b.nextPoints, b.placesToBoundary], ["patamar", { from: 1, to: 2 }, null, null]);
});

Deno.test("pointsBand — a referência provisória passa para a faixa", () => {
  const b = pointsBand(ED, "clube_elegivel", [res("a", "2026-05-10", 3)]);
  assertEquals([b.position, b.count, b.provisional], [3, 1, true]);
});
