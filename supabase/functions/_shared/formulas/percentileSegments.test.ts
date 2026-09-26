import { assertEquals } from "jsr:@std/assert@1";
import { ageBandFor, closedWindow, nBand, nextPublicationDate, publicationDayOf, PUBLISH_GRACE_DAYS, publishableWindow, segmentKey, terrainForAthlete, ventileBoundaries, VENTILE_COUNT } from "./percentileSegments.ts";

Deno.test("closedWindow: só a janela que já fechou, alinhada à âncora", () => {
  // 2026-09-21: a janela corrente é 09-14 → 09-28 e ainda anda a andar; a
  // última FECHADA é a anterior.
  assertEquals(closedWindow("2026-09-21"), { start: "2026-08-31", end: "2026-09-14" });
  // No próprio dia em que a janela fecha, já é ela a publicada.
  assertEquals(closedWindow("2026-09-28"), { start: "2026-09-14", end: "2026-09-28" });
  // Um dia antes de fechar, continua a ser a anterior — é isto que impede o
  // ataque de diferenciação: dois dias seguidos publicam a MESMA janela.
  assertEquals(closedWindow("2026-09-27"), { start: "2026-08-31", end: "2026-09-14" });
  // Antes de a primeira janela fechar não há nada a publicar.
  assertEquals(closedWindow("2026-01-10"), null);
  assertEquals(closedWindow("2026-01-19"), { start: "2026-01-05", end: "2026-01-19" });
});

Deno.test("ageBandFor: os escalões, com letra só a partir dos 35", () => {
  assertEquals(ageBandFor(19, "F"), "sub23");
  assertEquals(ageBandFor(22, "M"), "sub23");
  assertEquals(ageBandFor(23, "M"), "23-34");
  assertEquals(ageBandFor(34, "F"), "23-34");
  assertEquals(ageBandFor(35, "M"), "M35");
  assertEquals(ageBandFor(39, "F"), "F35");
  assertEquals(ageBandFor(40, "F"), "F40");
  assertEquals(ageBandFor(44, "M"), "M40");
  assertEquals(ageBandFor(45, "M"), "M45");
  assertEquals(ageBandFor(49, "F"), "F45");
  assertEquals(ageBandFor(50, "F"), "F50+");
  assertEquals(ageBandFor(78, "M"), "M50+");
});

Deno.test("ageBandFor: sem idade ou sem género não há escalão — e sem escalão não se entra em segmento nenhum", () => {
  assertEquals(ageBandFor(null, "M"), null);
  assertEquals(ageBandFor(undefined, "M"), null);
  assertEquals(ageBandFor(40, null), null);
  assertEquals(ageBandFor(40, ""), null);
  assertEquals(ageBandFor(40, "outro"), null);
  assertEquals(ageBandFor(Number.NaN, "F"), null);
});

Deno.test("nBand: a banda do tamanho — é isto que sai, nunca o n", () => {
  assertEquals(nBand(20), "20-49");
  assertEquals(nBand(49), "20-49");
  assertEquals(nBand(50), "50-199");
  assertEquals(nBand(199), "50-199");
  assertEquals(nBand(200), "200+");
  assertEquals(nBand(4321), "200+");
});

Deno.test("ventileBoundaries: 19 fronteiras, ordenadas, do 5.º ao 95.º", () => {
  // 21 valores igualmente espaçados: cada ventil cai exatamente num deles.
  const valores = Array.from({ length: 21 }, (_, i) => i * 5);
  const b = ventileBoundaries(valores);
  assertEquals(b.length, VENTILE_COUNT);
  assertEquals(b, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95]);
});

Deno.test("ventileBoundaries: a ordem da entrada não conta; toda a gente igual dá fronteiras iguais", () => {
  const desordenado = [100, 0, 50, 25, 75];
  assertEquals(ventileBoundaries(desordenado), ventileBoundaries([0, 25, 50, 75, 100]));
  assertEquals(ventileBoundaries(Array.from({ length: 25 }, () => 62.5)), Array.from({ length: 19 }, () => 62.5));
  assertEquals(ventileBoundaries([]), []);
});

Deno.test("segmentKey", () => {
  assertEquals(segmentKey({ ageBand: "M40", gender: "M", terrain: "trail" }), "M40|M|trail");
});

Deno.test("terrainForAthlete: manda a prova que vem a seguir; sem nenhuma marcada, a última corrida", () => {
  const fim = "2026-09-14";
  // A próxima prova marcada decide, mesmo com trails corridos há pouco.
  assertEquals(terrainForAthlete([
    { date: "2026-08-20", race_type: "trail" },
    { date: "2026-10-04", race_type: "estrada" },
    { date: "2026-11-15", race_type: "trail" },
  ], fim), "estrada");
  // Sem provas por correr, a mais recente dentro dos 90 dias.
  assertEquals(terrainForAthlete([
    { date: "2026-07-05", race_type: "estrada" },
    { date: "2026-08-20", race_type: "trail" },
  ], fim), "trail");
  // Fora da janela de 90 dias não conta: já não está a preparar nada.
  assertEquals(terrainForAthlete([{ date: "2026-03-01", race_type: "trail" }], fim), null);
  // Sem provas, e com tipos que não são modalidade de segmento, fica de fora.
  assertEquals(terrainForAthlete([], fim), null);
  assertEquals(terrainForAthlete(null, fim), null);
  assertEquals(terrainForAthlete([{ date: "2026-09-20", race_type: null }], fim), null);
});

// A folga de publicação (2026-09-26): a quinzena de 14 a 27 set sai na
// terça 29, não na segunda 28 — os treinos de domingo registados na segunda
// ainda contam.
Deno.test("publishableWindow: a quinzena só sai um dia depois de fechar", () => {
  // Segunda 28 set: a de 14 a 27 set já fechou, mas ainda não sai.
  assertEquals(publishableWindow("2026-09-28"), { start: "2026-08-31", end: "2026-09-14" });
  // Terça 29 set: sai.
  assertEquals(publishableWindow("2026-09-29"), { start: "2026-09-14", end: "2026-09-28" });
  assertEquals(PUBLISH_GRACE_DAYS, 1);
});

Deno.test("nextPublicationDate: o fim da quinzena em curso mais a folga — sempre uma terça", () => {
  assertEquals(nextPublicationDate("2026-09-26"), "2026-09-29");
  // Na segunda da publicação ainda é essa terça.
  assertEquals(nextPublicationDate("2026-09-28"), "2026-09-29");
  // A partir da terça, é a quinzena seguinte.
  assertEquals(nextPublicationDate("2026-09-29"), "2026-10-13");
  assertEquals(new Date("2026-10-13T00:00:00Z").getUTCDay(), 2);
});

// A madrugada da terça (2026-09-26): antes do cron (04:17 UTC, margem até às
// 04:30), a quinzena ainda não saiu — a próxima atualização é HOJE, não daqui
// a 14 dias.
Deno.test("publicationDayOf: antes das 04:30 UTC, a terça ainda conta como segunda", () => {
  assertEquals(publicationDayOf(Date.parse("2026-09-29T03:00:00Z")), "2026-09-28");
  assertEquals(publicationDayOf(Date.parse("2026-09-29T04:29:00Z")), "2026-09-28");
  assertEquals(publicationDayOf(Date.parse("2026-09-29T04:30:00Z")), "2026-09-29");
  // A próxima atualização, na madrugada: hoje; depois do cron: daqui a 14 dias.
  assertEquals(nextPublicationDate(publicationDayOf(Date.parse("2026-09-29T02:00:00Z"))), "2026-09-29");
  assertEquals(nextPublicationDate(publicationDayOf(Date.parse("2026-09-29T05:00:00Z"))), "2026-10-13");
});

// Fase 0 do Troféu (2026-09-26): a modalidade é a da próxima PRINCIPAL — um
// trail de treino (ou uma jornada) antes da maratona não muda o segmento.
Deno.test("terrainForAthlete: a próxima principal manda, mesmo com uma prova de treino antes", () => {
  const fim = "2026-09-14";
  assertEquals(terrainForAthlete([
    { id: "t", date: "2026-09-20", race_type: "trail", race_priority: "c" },
    { id: "m", date: "2026-11-15", race_type: "estrada", race_priority: "a" },
  ], fim), "estrada");
  // Sem race_priority conta como principal.
  assertEquals(terrainForAthlete([
    { id: "t", date: "2026-09-20", race_type: "trail", race_priority: "b" },
    { id: "m", date: "2026-11-15", race_type: "estrada" },
  ], fim), "estrada");
  // Sem principal à frente, a próxima por data.
  assertEquals(terrainForAthlete([
    { id: "t", date: "2026-09-20", race_type: "trail", race_priority: "c" },
    { id: "e", date: "2026-11-15", race_type: "estrada", race_priority: "b" },
  ], fim), "trail");
});
