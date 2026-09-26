import { assertEquals } from "jsr:@std/assert@1";
import { counterpartBand, neighbourSegments, percentileFrom } from "./percentileSegments.ts";
import {
  latestWindowStart,
  leaderboardMoment,
  percentileAvailability,
  percentileReadyMoment,
  segmentId,
} from "./vitrina.ts";

/* A Vitrina vista pela Carol (2026-09-25): o que o "Onde estás" tem para
   mostrar, o aviso "já há dados" em dois momentos, e entrar/sair das tabelas. */

const RUI = { ageBand: "M40", gender: "M", terrain: "estrada" };
const snap = (age_band: string, gender: string, terrain: string, window_start: string) =>
  ({ age_band, gender, terrain, window_start, window_end: "x", boundaries: [], n_band: "20-49" });

Deno.test("percentileFrom: conta as fronteiras passadas e trunca a 5–95", () => {
  const f = Array.from({ length: 19 }, (_, i) => (i + 1) * 5);
  assertEquals(percentileFrom(50, f), 50);
  assertEquals(percentileFrom(100, f), 95);
  assertEquals(percentileFrom(0, f), 5);
  assertEquals(percentileFrom(null, f), null);
  assertEquals(percentileFrom(50, [1, 2]), null);
});

Deno.test("neighbourSegments: modalidade, escalões ao lado, outro género — e nada sem segmento completo", () => {
  assertEquals(neighbourSegments(RUI).map((n) => `${n.step}:${segmentId(n.segment)}`), [
    "modalidade:M40.M.trail",
    "escalao:M35.M.estrada",
    "escalao:M45.M.estrada",
    "genero:F40.F.estrada",
  ]);
  assertEquals(neighbourSegments({ ageBand: "M40", gender: "M" }), []);
  assertEquals(counterpartBand("23-34", "F"), "23-34");
});

Deno.test("latestWindowStart: a janela mais recente com alguma coisa publicada", () => {
  assertEquals(latestWindowStart([snap("F50+", "F", "trail", "2026-08-31"), snap("M40", "M", "trail", "2026-09-14")]), "2026-09-14");
  assertEquals(latestWindowStart([]), null);
});

Deno.test("percentileAvailability: nada publicado, ou só grupos longe do dele → null (a entrada fica escondida)", () => {
  assertEquals(percentileAvailability([], RUI), null);
  assertEquals(percentileAvailability([snap("F50+", "F", "trail", "2026-09-14")], RUI), null);
});

Deno.test("percentileAvailability: o dele e os vizinhos, só na última janela", () => {
  const rows = [
    snap("M40", "M", "trail", "2026-09-14"),
    snap("M40", "M", "estrada", "2026-08-31"), // o dele, mas de uma janela velha
  ];
  const a = percentileAvailability(rows, RUI)!;
  assertEquals(a.windowStart, "2026-09-14");
  assertEquals(a.own, null);
  assertEquals(a.near.map((n) => n.step), ["modalidade"]);
});

Deno.test("percentileReadyMoment: sem consentimento, nada", () => {
  assertEquals(percentileReadyMoment([snap("M40", "M", "estrada", "2026-09-14")], RUI, false), null);
});

Deno.test("percentileReadyMoment: primeiro 'perto', depois 'meu' — e 'perto' nunca depois de 'meu'", () => {
  const perto = percentileReadyMoment([snap("M35", "M", "estrada", "2026-09-14")], RUI, true);
  assertEquals(perto, { key: "percentile_ready:perto:M40.M.estrada", stage: "perto", windowStart: "2026-09-14" });

  const meu = percentileReadyMoment([snap("M40", "M", "estrada", "2026-09-28"), snap("M35", "M", "estrada", "2026-09-28")], RUI, true);
  assertEquals(meu, { key: "percentile_ready:meu:M40.M.estrada", stage: "meu", windowStart: "2026-09-28" });

  // O dele já foi publicado numa janela anterior e agora só há vizinhos: não
  // se volta a "há dados ao lado do teu".
  const recuo = percentileReadyMoment(
    [snap("M40", "M", "estrada", "2026-09-14"), snap("M35", "M", "estrada", "2026-09-28")],
    RUI,
    true,
  );
  assertEquals(recuo, null);
});

Deno.test("percentileReadyMoment: novo escalão, nova chave — fazer anos volta a ser novidade", () => {
  const m45 = { ...RUI, ageBand: "M45" };
  assertEquals(percentileReadyMoment([snap("M45", "M", "estrada", "2026-09-14")], m45, true)?.key, "percentile_ready:meu:M45.M.estrada");
});

Deno.test("leaderboardMoment: entrou na tabela desta janela, com a posição", () => {
  const rows = [snap("M40", "M", "estrada", "2026-09-28")];
  assertEquals(
    leaderboardMoment([{ window_start: "2026-09-28", rank: 3 }], rows, RUI, true),
    { key: "leaderboard:entrou:2026-09-28", stage: "entrou", windowStart: "2026-09-28", rank: 3 },
  );
  // Já estava na anterior: não há novidade.
  assertEquals(leaderboardMoment([{ window_start: "2026-09-28", rank: 3 }, { window_start: "2026-09-14", rank: 5 }], rows, RUI, true), null);
});

Deno.test("leaderboardMoment: saiu só se a tabela do escalão dele existe nesta janela", () => {
  const antes = [{ window_start: "2026-09-14", rank: 8 }];
  assertEquals(
    leaderboardMoment(antes, [snap("M40", "M", "estrada", "2026-09-28")], RUI, true),
    { key: "leaderboard:saiu:2026-09-28", stage: "saiu", windowStart: "2026-09-28" },
  );
  // O escalão dele deixou de ter 20 atletas: não há tabela, não "saiu".
  assertEquals(leaderboardMoment(antes, [snap("M35", "M", "estrada", "2026-09-28")], RUI, true), null);
  // Sem consentimento para as tabelas, nada.
  assertEquals(leaderboardMoment([{ window_start: "2026-09-28", rank: 1 }], [snap("M40", "M", "estrada", "2026-09-28")], RUI, false), null);
});
