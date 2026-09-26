import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildPublication, LEADERBOARD_SIZE, scoreAthletes, type Athlete, type AthleteData } from "./publish.ts";
import { percentileFrom } from "../_shared/formulas/percentileSegments.ts";
import { leaderboardMoment, percentileAvailability, percentileReadyMoment } from "../_shared/formulas/vitrina.ts";

/* Uma população sintética (2026-09-25). Em beta há dois atletas e nenhum
   segmento chega aos 20 — o caminho que publica nunca correu a sério. Estes
   60 atletas inventados passam pelo MESMO cálculo da produção (planos,
   corridas, evaluatePrescriptions), para o sistema estar provado antes de
   haver dados reais. Nada disto toca numa base de dados. */

const JANELA = { start: "2026-08-31", end: "2026-09-14" };
const DIAS = Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
const PROVA_ESTRADA = [{ date: "2026-10-20", race_type: "estrada" }];
const PROVA_TRAIL = [{ date: "2026-10-20", race_type: "trail" }];

/* Um atleta com 10 corridas planeadas na janela, das quais cumpre `feitas`:
   o índice de execução sai `feitas * 10`. */
function dados(feitas: number, provas: AthleteData["races"]): AthleteData {
  return {
    items: DIAS.map((d) => ({ planned_date: d, kind: "corrida", target_distance_km: 10 })) as AthleteData["items"],
    runs: DIAS.slice(0, feitas).map((d, i) => ({ id: `r${i}`, date: d, distance_km: 10 })),
    gym: [],
    races: provas,
  };
}

interface Sintetico extends Athlete { d: AthleteData }
const pop: Sintetico[] = [];
// 25 M40 de estrada, índices 0..100 a repetir; os 12 primeiros aceitaram as tabelas.
for (let i = 0; i < 25; i++) pop.push({ id: `m40-${String(i).padStart(2, "0")}`, ageBand: "M40", gender: "M", leaderboard: i < 12, d: dados(i % 11, PROVA_ESTRADA) });
// 21 F35 de trail; só 4 aceitaram as tabelas.
for (let i = 0; i < 21; i++) pop.push({ id: `f35-${String(i).padStart(2, "0")}`, ageBand: "F35", gender: "F", leaderboard: i < 4, d: dados((i * 3) % 11, PROVA_TRAIL) });
// 8 M45 de estrada — abaixo de k, com toda a gente a aceitar as tabelas.
for (let i = 0; i < 8; i++) pop.push({ id: `m45-${i}`, ageBand: "M45", gender: "M", leaderboard: true, d: dados(10, PROVA_ESTRADA) });
// 3 sem prova nenhuma (sem modalidade) e 3 sem plano na janela — ficam de fora.
for (let i = 0; i < 3; i++) pop.push({ id: `sem-prova-${i}`, ageBand: "M40", gender: "M", leaderboard: true, d: dados(10, []) });
for (let i = 0; i < 3; i++) pop.push({ id: `sem-plano-${i}`, ageBand: "M40", gender: "M", leaderboard: true, d: { ...dados(0, PROVA_ESTRADA), items: [] } });

const porId = new Map(pop.map((a) => [a.id, a.d]));
const scored = scoreAthletes(pop, (id) => porId.get(id)!, JANELA);
const pub = buildPublication(scored, JANELA);

Deno.test("população sintética: quem não tem prova ou plano fica de fora do cálculo", () => {
  assertEquals(pop.length, 60);
  assertEquals(scored.length, 54);
  assert(!scored.some((a) => a.id.startsWith("sem-")));
  // O índice é o do cálculo a sério: 7 de 10 corridas feitas → 70.
  assertEquals(scored.find((a) => a.id === "m40-07")?.score, 70);
});

Deno.test("população sintética: só se publicam os segmentos com 20 ou mais — e diz-se a banda, não o n", () => {
  assertEquals(pub.snapshots.map((s) => `${s.age_band}.${s.gender}.${s.terrain}`).sort(), ["F35.F.trail", "M40.M.estrada"]);
  assertEquals(pub.belowK, 1);
  assert(pub.snapshots.every((s) => s.n_band === "20-49" && s.boundaries.length === 19));
});

Deno.test("população sintética: a tabela é o top 10 de quem aceitou, pelo índice, só nos segmentos publicados", () => {
  const m40 = pub.entries.filter((e) => e.age_band === "M40");
  assertEquals(m40.length, LEADERBOARD_SIZE); // 12 aceitaram, só 10 entram
  assertEquals(m40.map((e) => e.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert(m40.every((e, i) => i === 0 || e.score <= m40[i - 1].score));
  // Só entra quem aceitou (os ids m40-12 em diante não aceitaram).
  assert(m40.every((e) => Number(e.user_id.slice(4)) < 12));
  // Quem ficou de fora do top 10 tem índice <= ao 10.º.
  assertEquals(m40[0].score, 100);

  const f35 = pub.entries.filter((e) => e.age_band === "F35");
  assertEquals(f35.length, 4); // menos de 10 aceitaram: a tabela tem os que há
  // M45 tem 8 atletas: não há distribuição, não há tabela — mesmo com todos a aceitar.
  assertEquals(pub.entries.filter((e) => e.age_band === "M45").length, 0);
});

Deno.test("população sintética: o ecrã, o percentil e os avisos da Carol leem bem o que se publicou", () => {
  const snapshots = pub.snapshots;
  const rui = { ageBand: "M40", gender: "M", terrain: "estrada" };

  // O "Onde estás" tem o segmento dele, e a Carol avisa "o teu escalão já tem dados".
  assert(percentileAvailability(snapshots, rui)?.own);
  assertEquals(percentileReadyMoment(snapshots, rui, true)?.key, "percentile_ready:meu:M40.M.estrada");

  // Um M45 (segmento pequeno) vê o M40 ao lado e recebe o primeiro momento.
  assertEquals(percentileReadyMoment(snapshots, { ageBand: "M45", gender: "M", terrain: "estrada" }, true)?.stage, "perto");

  // O percentil de um atleta a meio da distribuição fica a meio.
  const m40 = snapshots.find((s) => s.age_band === "M40")!;
  const p = percentileFrom(50, m40.boundaries)!;
  assert(p >= 35 && p <= 65, `percentil ${p}`);

  // Quem está no top 10 recebe "entrou", com a posição.
  const primeiro = pub.entries.find((e) => e.age_band === "M40" && e.rank === 1)!;
  const minhas = pub.entries.filter((e) => e.user_id === primeiro.user_id);
  assertEquals(leaderboardMoment(minhas, snapshots, rui, true), {
    key: "leaderboard:entrou:2026-08-31", stage: "entrou", windowStart: "2026-08-31", rank: 1,
  });
});
