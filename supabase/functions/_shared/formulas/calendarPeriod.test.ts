// Testes do motor de períodos de calendário (F1, 2026-10-04). Espelho vitest
// em src/utils/calendarPeriod.spec.js — os dois têm de dar o mesmo, porque o
// ecrã (Vite) e a Carol (Deno) leem este mesmo ficheiro.
// "Hoje" do mock-up aprovado: domingo, 4 out 2026.
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  addDaysISO,
  addMonthsISO,
  calendarPeriod,
  closedDaysOf,
  eachDayISO,
  firstOfMonth,
  firstOfQuarter,
  inPeriod,
  isoWeekday,
  mondayOf,
  periodEarlyState,
  periodLabel,
  previousPeriod,
  shiftPeriod,
  weekdayAverages,
  weeklyBuckets,
} from "./calendarPeriod.ts";

const TODAY = "2026-10-04"; // domingo

Deno.test("semana — segunda-feira sem dias fechados (a_comecar, ecrã 'Semana a começar')", () => {
  const p = calendarPeriod("semana", "2026-10-05");
  assertEquals(p, {
    kind: "semana", offset: 0, start: "2026-10-05", end: "2026-10-11",
    isCurrent: true, isFuture: false, lastClosed: null, totalDays: 7, closedDays: 0,
  });
  assertEquals(periodEarlyState(p, "2026-10-05"), "a_comecar");
  assertEquals(closedDaysOf(p, "2026-10-05"), []);
  assertEquals(periodLabel(p, "2026-10-05"), {
    title: "Esta semana", range: "5 – 11 out", status: "em curso",
    coverage: "em curso · ainda sem dias fechados",
  });
});

Deno.test("semana — domingo: 6 dias fechados, hoje fora", () => {
  const p = calendarPeriod("semana", TODAY);
  assertEquals([p.start, p.end, p.lastClosed, p.closedDays, p.totalDays], ["2026-09-28", "2026-10-04", "2026-10-03", 6, 7]);
  assertEquals(periodEarlyState(p, TODAY), "ok");
  assertEquals(inPeriod(TODAY, p, TODAY), false);
  assertEquals(inPeriod(TODAY, p, TODAY, { closedOnly: false }), true);
  assertEquals(inPeriod("2026-09-28", p, TODAY), true);
  assertEquals(inPeriod("2026-09-27", p, TODAY), false);
  const l = periodLabel(p, TODAY);
  assertEquals([l.title, l.range, l.status, l.coverage], ["Esta semana", "28 set – 4 out", "em curso", "em curso · 6 de 7 dias fechados"]);
});

Deno.test("semana — anterior e títulos 'Semana passada' / 'Semana de …'", () => {
  const cur = calendarPeriod("semana", TODAY);
  const prev = previousPeriod(cur, TODAY);
  assertEquals([prev.offset, prev.start, prev.end, prev.closedDays, prev.isCurrent], [-1, "2026-09-21", "2026-09-27", 7, false]);
  assertEquals(periodLabel(prev, TODAY, { daysWithData: 6 }), {
    title: "Semana passada", range: "21 – 27 set", coverage: "6 de 7 dias com registo",
  });
  assertEquals(periodLabel(calendarPeriod("semana", "2026-10-11", -2), "2026-10-11").title, "Semana de 21 set");
});

Deno.test("semana — 29/12/2025 a 04/01/2026 atravessa o ano", () => {
  const p = calendarPeriod("semana", "2026-01-01");
  assertEquals([p.start, p.end, p.closedDays], ["2025-12-29", "2026-01-04", 3]);
  assertEquals(mondayOf("2026-01-04"), "2025-12-29");
  assertEquals(periodLabel(p, "2026-01-01").range, "29 dez 2025 – 4 jan 2026");
  assertEquals(periodLabel(p, "2026-01-08").title, "Semana passada");
  assertEquals(periodLabel(p, "2026-01-20").title, "Semana de 29 dez 2025");
  assertEquals(weeklyBuckets(["2026-01-05", "2025-12-30", "2026-01-04", "2025-12-30"]), [
    { weekStart: "2025-12-29", days: ["2025-12-30", "2026-01-04"] },
    { weekStart: "2026-01-05", days: ["2026-01-05"] },
  ]);
});

Deno.test("semana noutro ano: ano no fim do intervalo", () => {
  const p = calendarPeriod("semana", "2025-09-24");
  assertEquals(periodLabel(p, TODAY).range, "22 – 28 set 2025");
});

Deno.test("mês — dia 1 (a_comecar) e dia 31", () => {
  const d1 = calendarPeriod("mes", "2026-10-01");
  assertEquals([d1.start, d1.end, d1.closedDays, d1.lastClosed, d1.totalDays], ["2026-10-01", "2026-10-31", 0, null, 31]);
  assertEquals(periodEarlyState(d1, "2026-10-01"), "a_comecar");
  const d31 = calendarPeriod("mes", "2026-10-31");
  assertEquals([d31.start, d31.end, d31.closedDays, d31.lastClosed], ["2026-10-01", "2026-10-31", 30, "2026-10-30"]);
  assertEquals(isoWeekday("2026-10-31"), 5);
});

Deno.test("mês — textos do mock-up (outubro em curso, setembro fechado)", () => {
  const out = calendarPeriod("mes", TODAY);
  assertEquals(periodEarlyState(out, TODAY), "cedo");
  assertEquals(periodLabel(out, TODAY), {
    title: "outubro 2026", range: "1 – 31 out", status: "em curso",
    coverage: "em curso · 3 de 31 dias fechados",
  });
  const set = shiftPeriod(out, -1, TODAY);
  assertEquals(periodLabel(set, TODAY, { daysWithData: 28 }), {
    title: "setembro 2026", range: "1 – 30 set", coverage: "28 de 30 dias com registo",
  });
});

Deno.test("mês — fevereiro bissexto (2028) e não bissexto (2027)", () => {
  const f28 = calendarPeriod("mes", "2028-02-15");
  assertEquals([f28.start, f28.end, f28.totalDays, f28.closedDays], ["2028-02-01", "2028-02-29", 29, 14]);
  assertEquals(calendarPeriod("mes", "2027-02-10").totalDays, 28);
  assertEquals(addMonthsISO("2028-01-31", 1), "2028-02-29");
  assertEquals(addMonthsISO("2027-01-31", 1), "2027-02-28");
  assertEquals(addMonthsISO("2026-03-31", -1), "2026-02-28");
  assertEquals(calendarPeriod("mes", "2028-03-01", -1).end, "2028-02-29");
  assertEquals(calendarPeriod("ano", "2028-06-01").totalDays, 366);
});

Deno.test("trimestre — mudança de trimestre e textos do mock-up", () => {
  const q3 = calendarPeriod("trimestre", "2026-09-30");
  assertEquals([q3.start, q3.end, q3.closedDays, q3.totalDays], ["2026-07-01", "2026-09-30", 91, 92]);
  const q4 = calendarPeriod("trimestre", "2026-10-01");
  assertEquals([q4.start, q4.end, q4.closedDays, q4.totalDays], ["2026-10-01", "2026-12-31", 0, 92]);
  assertEquals(firstOfQuarter("2026-12-31"), "2026-10-01");
  assertEquals(firstOfMonth("2026-12-31"), "2026-12-01");

  const cur = calendarPeriod("trimestre", TODAY);
  assertEquals(periodLabel(cur, TODAY), {
    title: "out – dez 2026", range: "1 out – 31 dez", status: "em curso",
    coverage: "em curso · 3 de 92 dias fechados",
    ariaTitle: "4.º trimestre de 2026, outubro a dezembro",
  });
  const prev = previousPeriod(cur, TODAY);
  assertEquals(periodLabel(prev, TODAY, { daysWithData: 72, dataStartISO: "2026-07-13" }), {
    title: "jul – set 2026", range: "1 jul – 30 set",
    coverage: "desde 13 jul · 72 de 80 dias com registo",
    ariaTitle: "3.º trimestre de 2026, julho a setembro",
  });
  // Trimestre anterior ao 1.º registo.
  assertEquals(periodLabel(previousPeriod(prev, TODAY), TODAY, { daysWithData: 0, dataStartISO: "2026-07-13" }).coverage, "antes do primeiro registo");
  // Atravessa o ano para trás.
  const q1 = calendarPeriod("trimestre", "2026-02-10", -1);
  assertEquals([q1.start, q1.end], ["2025-10-01", "2025-12-31"]);
  assertEquals(periodLabel(q1, "2026-02-10").title, "out – dez 2025");
});

Deno.test("ano e dia — títulos", () => {
  assertEquals(periodLabel(calendarPeriod("ano", TODAY), TODAY), {
    title: "2026", range: "1 jan – 31 dez", status: "em curso", coverage: "em curso · 276 de 365 dias fechados",
  });
  assertEquals(periodLabel(calendarPeriod("ano", TODAY, -1), TODAY).range, "1 jan – 31 dez 2025");
  assertEquals(periodLabel(calendarPeriod("dia", TODAY), TODAY), { title: "Hoje", range: "4 out", status: "em curso" });
  assertEquals(periodLabel(calendarPeriod("dia", TODAY, -1), TODAY), { title: "Ontem", range: "3 out" });
  assertEquals(periodLabel(calendarPeriod("dia", "2026-10-05", -2), "2026-10-05").title, "sáb, 3 out");
  assertEquals(periodLabel(calendarPeriod("dia", "2026-01-02", -3), "2026-01-02").title, "ter, 30 dez 2025");
  const hoje = calendarPeriod("dia", TODAY);
  assertEquals([hoje.closedDays, hoje.lastClosed, periodEarlyState(hoje, TODAY)], [0, null, "a_comecar"]);
  assertEquals(periodEarlyState(calendarPeriod("dia", TODAY, -1), TODAY), "ok");
});

Deno.test("domingos de mudança de hora (29/03/2026 e 25/10/2026) — UTC não os sente", () => {
  const mar = calendarPeriod("semana", "2026-03-29");
  assertEquals([mar.start, mar.end, mar.closedDays], ["2026-03-23", "2026-03-29", 6]);
  assertEquals(eachDayISO("2026-03-28", "2026-03-30"), ["2026-03-28", "2026-03-29", "2026-03-30"]);
  assertEquals(addDaysISO("2026-03-29", 1), "2026-03-30");
  const oct = calendarPeriod("semana", "2026-10-25");
  assertEquals([oct.start, oct.end, oct.closedDays], ["2026-10-19", "2026-10-25", 6]);
  assertEquals(addDaysISO("2026-10-25", 1), "2026-10-26");
  assertEquals(calendarPeriod("mes", "2026-10-26").closedDays, 25);
  assertEquals(isoWeekday("2026-03-29"), 6);
  assertEquals(isoWeekday("2026-10-25"), 6);
});

Deno.test("shiftPeriod nunca vai para o futuro", () => {
  const cur = calendarPeriod("semana", TODAY);
  assertEquals(shiftPeriod(cur, 1, TODAY), cur);
  const back = shiftPeriod(cur, -3, TODAY);
  assertEquals([back.offset, back.start], [-3, "2026-09-07"]);
  assertEquals(shiftPeriod(back, 5, TODAY).offset, 0);
  assertEquals(shiftPeriod(back, 1, TODAY).start, "2026-09-14");
  // Período criado ontem, setas usadas hoje: o offset é recalculado.
  const yesterdays = calendarPeriod("semana", "2026-10-04");
  const moved = shiftPeriod(yesterdays, 1, "2026-10-05");
  assertEquals([moved.offset, moved.start], [0, "2026-10-05"]);
  assertEquals(shiftPeriod(calendarPeriod("mes", TODAY), 2, TODAY).start, "2026-10-01");
  // calendarPeriod aceita futuro (marcado), shiftPeriod não.
  const fut = calendarPeriod("semana", TODAY, 1);
  assertEquals([fut.isFuture, fut.isCurrent, fut.lastClosed, fut.closedDays], [true, false, null, 0]);
  assertEquals(shiftPeriod(fut, 0, TODAY).offset, 0);
});

Deno.test("closedDaysOf — corta no início dos dados ('desde')", () => {
  const q3 = calendarPeriod("trimestre", TODAY, -1);
  const days = closedDaysOf(q3, TODAY, "2026-07-13");
  assertEquals([days.length, days[0], days[days.length - 1]], [80, "2026-07-13", "2026-09-30"]);
  assertEquals(closedDaysOf(q3, TODAY).length, 92);
  assertEquals(closedDaysOf(q3, TODAY, "2026-06-01").length, 92);
  assertEquals(closedDaysOf(q3, TODAY, "2026-10-02"), []);
  const out = calendarPeriod("mes", TODAY);
  assertEquals(closedDaysOf(out, TODAY, "2026-10-02"), ["2026-10-02", "2026-10-03"]);
  assertEquals(closedDaysOf(out, TODAY), ["2026-10-01", "2026-10-02", "2026-10-03"]);
  assertEquals(periodLabel(out, TODAY, { dataStartISO: "2026-10-02" }).coverage, "desde 2 out · em curso · 3 de 31 dias fechados");
});

Deno.test("weekdayAverages — mínimo por dia da semana", () => {
  // 4 segundas (28 set, 21 set, 14 set, 7 set), 3 terças, 1 domingo com null.
  const series = [
    { date: "2026-09-07", value: 2000 }, { date: "2026-09-14", value: 2200 },
    { date: "2026-09-21", value: 2400 }, { date: "2026-09-28", value: 2600 },
    { date: "2026-09-08", value: 1800 }, { date: "2026-09-15", value: 1900 }, { date: "2026-09-22", value: 2000 },
    { date: "2026-09-27", value: null },
  ];
  const avg = weekdayAverages(series);
  assertEquals(avg[0], { avg: 2300, n: 4 });
  assertEquals(avg[1], null);
  assertEquals(avg[6], null);
  assertEquals(avg.length, 7);
  assertEquals(weekdayAverages(series, 3)[1], { avg: 1900, n: 3 });
});

Deno.test("datas inválidas lançam; inPeriod tolera vazios e timestamps", () => {
  assertThrows(() => calendarPeriod("semana", "2026-02-30"), RangeError);
  assertThrows(() => calendarPeriod("semana", "ontem"), RangeError);
  const p = calendarPeriod("semana", TODAY);
  assertEquals(inPeriod(null, p, TODAY), false);
  assertEquals(inPeriod("", p, TODAY), false);
  assertEquals(inPeriod("2026-10-01T22:30:00Z", p, TODAY), true);
  assertEquals(inPeriod("2026-10-05", p, TODAY, { closedOnly: false }), false);
  assertEquals(eachDayISO("2026-10-05", "2026-10-04"), []);
});
