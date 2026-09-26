import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  basicDate,
  basicDateTimeRange,
  icsEscape,
  icsFileName,
  icsFold,
  raceCalendarEvent,
  raceDurationMinutes,
  raceIcs,
} from "./raceCalendar.ts";

const NOW = new Date("2026-09-26T20:00:00Z");

Deno.test("raceCalendarEvent: prova com hora — título, hora 'HH:MM' e a descrição da distância", () => {
  const ev = raceCalendarEvent({
    name: " Meia Maratona de Lisboa ",
    date: "2026-10-11",
    start_time: "09:00:00",
    location: "Lisboa",
    race_type: "estrada",
    distance_km: 21.0975,
    target_time: "1:45:00",
    target_time_seconds: 6300,
  })!;
  assertEquals(ev.title, "Meia Maratona de Lisboa");
  assertEquals(ev.startTime, "09:00");
  assertEquals(ev.durationMinutes, 105);
  assertEquals(ev.description, "Meia Maratona em estrada · objetivo 1:45:00. Adicionado a partir do IronHealth.");
});

Deno.test("raceCalendarEvent: sem data válida não há evento; hora inválida passa a dia inteiro", () => {
  assertEquals(raceCalendarEvent({ name: "X", date: "" }), null);
  assertEquals(raceCalendarEvent({ name: "X", date: "2026-10-11", start_time: "25:00" })!.startTime, null);
  assertEquals(raceCalendarEvent({ date: "2026-10-11", start_time: "7:05" })!.startTime, "07:05");
  assertEquals(raceCalendarEvent({ date: "2026-10-11" })!.title, "Prova");
});

Deno.test("raceDurationMinutes: objetivo quando existe; senão ritmo folgado, trail com D+, aos 15 min", () => {
  assertEquals(raceDurationMinutes({ target_time_seconds: 2820 }), 60); // 47 min → 60
  assertEquals(raceDurationMinutes({ distance_km: 10, race_type: "estrada" }), 60);
  // 30 km + 1500 m D+ = 45 km equiv. × 9 min = 405 min
  assertEquals(raceDurationMinutes({ distance_km: 30, elevation_gain_m: 1500, race_type: "trail" }), 405);
  assertEquals(raceDurationMinutes({ distance_km: 3 }), 30);
});

Deno.test("basicDate / basicDateTimeRange: sem fuso, e o fim pode passar a meia-noite", () => {
  assertEquals(basicDate("2026-12-31", 1), "20270101");
  const ev = raceCalendarEvent({ date: "2026-10-11", start_time: "22:00", target_time_seconds: 4 * 3600 })!;
  assertEquals(basicDateTimeRange(ev), { start: "20261011T220000", end: "20261012T020000" });
});

Deno.test("raceIcs: evento com hora flutuante, CRLF e texto escapado", () => {
  const ev = raceCalendarEvent({
    name: "Trail; Serra, Norte",
    date: "2026-10-11",
    start_time: "08:30",
    location: "Gerês",
    distance_km: 10,
  })!;
  const ics = raceIcs(ev, { uid: "abc@ironhealth", now: NOW });
  assertStringIncludes(ics, "DTSTART:20261011T083000\r\n");
  assertStringIncludes(ics, "DTEND:20261011T093000\r\n");
  assertStringIncludes(ics, "SUMMARY:Trail\\; Serra\\, Norte\r\n");
  assertStringIncludes(ics, "LOCATION:Gerês\r\n");
  assertStringIncludes(ics, "DTSTAMP:20260926T200000Z\r\n");
  assert(ics.endsWith("END:VCALENDAR\r\n"));
  assert(!/[^\r]\n/.test(ics), "todas as linhas acabam em CRLF");
});

Deno.test("raceIcs: sem hora é um evento de dia inteiro", () => {
  const ev = raceCalendarEvent({ name: "Prova", date: "2026-10-11" })!;
  const ics = raceIcs(ev, { uid: "x", now: NOW });
  assertStringIncludes(ics, "DTSTART;VALUE=DATE:20261011\r\n");
  assertStringIncludes(ics, "DTEND;VALUE=DATE:20261012\r\n");
});

Deno.test("icsEscape / icsFold: barras e mudanças de linha; dobra sem partir acentos", () => {
  assertEquals(icsEscape("a\\b\nc"), "a\\\\b\\nc");
  const long = "SUMMARY:" + "ã".repeat(60); // 8 + 120 octetos
  const folded = icsFold(long);
  const enc = new TextEncoder();
  for (const part of folded.split("\r\n")) assert(enc.encode(part).length <= 75);
  assertEquals(folded.replace(/\r\n /g, ""), long);
});

Deno.test("icsFileName: só ASCII", () => {
  assertEquals(icsFileName("Meia Maratona de São João!"), "meia-maratona-de-sao-joao.ics");
  assertEquals(icsFileName("   "), "prova.ics");
});
