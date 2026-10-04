// Espelho vitest de supabase/functions/_shared/formulas/calendarPeriod.test.ts
// (motor de períodos de calendário, F1 — 2026-10-04). Os mesmos casos correm
// no Deno (Carol) e aqui (Vite, via alias @formulas), para garantir que o ecrã
// e a Carol leem os mesmos períodos. Ao mudar um, mudar o outro.
// "Hoje" do mock-up aprovado: domingo, 4 out 2026.
import { describe, it, expect } from 'vitest';
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
} from '@formulas/calendarPeriod.ts';

describe('calendarPeriod', () => {
  const TODAY = "2026-10-04"; // domingo

  it("semana — segunda-feira sem dias fechados (a_comecar, ecrã 'Semana a começar')", () => {
    const p = calendarPeriod("semana", "2026-10-05");
    expect(p).toEqual({
      kind: "semana", offset: 0, start: "2026-10-05", end: "2026-10-11",
      isCurrent: true, isFuture: false, lastClosed: null, totalDays: 7, closedDays: 0,
    });
    expect(periodEarlyState(p, "2026-10-05")).toEqual("a_comecar");
    expect(closedDaysOf(p, "2026-10-05")).toEqual([]);
    expect(periodLabel(p, "2026-10-05")).toEqual({
      title: "Esta semana", range: "5 – 11 out", status: "em curso",
      coverage: "em curso · ainda sem dias fechados",
    });
  });

  it("semana — domingo: 6 dias fechados, hoje fora", () => {
    const p = calendarPeriod("semana", TODAY);
    expect([p.start, p.end, p.lastClosed, p.closedDays, p.totalDays]).toEqual(["2026-09-28", "2026-10-04", "2026-10-03", 6, 7]);
    expect(periodEarlyState(p, TODAY)).toEqual("ok");
    expect(inPeriod(TODAY, p, TODAY)).toEqual(false);
    expect(inPeriod(TODAY, p, TODAY, { closedOnly: false })).toEqual(true);
    expect(inPeriod("2026-09-28", p, TODAY)).toEqual(true);
    expect(inPeriod("2026-09-27", p, TODAY)).toEqual(false);
    const l = periodLabel(p, TODAY);
    expect([l.title, l.range, l.status, l.coverage]).toEqual(["Esta semana", "28 set – 4 out", "em curso", "em curso · 6 de 7 dias fechados"]);
  });

  it("semana — anterior e títulos 'Semana passada' / 'Semana de …'", () => {
    const cur = calendarPeriod("semana", TODAY);
    const prev = previousPeriod(cur, TODAY);
    expect([prev.offset, prev.start, prev.end, prev.closedDays, prev.isCurrent]).toEqual([-1, "2026-09-21", "2026-09-27", 7, false]);
    expect(periodLabel(prev, TODAY, { daysWithData: 6 })).toEqual({
      title: "Semana passada", range: "21 – 27 set", coverage: "6 de 7 dias com registo",
    });
    expect(periodLabel(calendarPeriod("semana", "2026-10-11", -2), "2026-10-11").title).toEqual("Semana de 21 set");
  });

  it("semana — 29/12/2025 a 04/01/2026 atravessa o ano", () => {
    const p = calendarPeriod("semana", "2026-01-01");
    expect([p.start, p.end, p.closedDays]).toEqual(["2025-12-29", "2026-01-04", 3]);
    expect(mondayOf("2026-01-04")).toEqual("2025-12-29");
    expect(periodLabel(p, "2026-01-01").range).toEqual("29 dez 2025 – 4 jan 2026");
    expect(periodLabel(p, "2026-01-08").title).toEqual("Semana passada");
    expect(periodLabel(p, "2026-01-20").title).toEqual("Semana de 29 dez 2025");
    expect(weeklyBuckets(["2026-01-05", "2025-12-30", "2026-01-04", "2025-12-30"])).toEqual([
      { weekStart: "2025-12-29", days: ["2025-12-30", "2026-01-04"] },
      { weekStart: "2026-01-05", days: ["2026-01-05"] },
    ]);
  });

  it("semana noutro ano: ano no fim do intervalo", () => {
    const p = calendarPeriod("semana", "2025-09-24");
    expect(periodLabel(p, TODAY).range).toEqual("22 – 28 set 2025");
  });

  it("mês — dia 1 (a_comecar) e dia 31", () => {
    const d1 = calendarPeriod("mes", "2026-10-01");
    expect([d1.start, d1.end, d1.closedDays, d1.lastClosed, d1.totalDays]).toEqual(["2026-10-01", "2026-10-31", 0, null, 31]);
    expect(periodEarlyState(d1, "2026-10-01")).toEqual("a_comecar");
    const d31 = calendarPeriod("mes", "2026-10-31");
    expect([d31.start, d31.end, d31.closedDays, d31.lastClosed]).toEqual(["2026-10-01", "2026-10-31", 30, "2026-10-30"]);
    expect(isoWeekday("2026-10-31")).toEqual(5);
  });

  it("mês — textos do mock-up (outubro em curso, setembro fechado)", () => {
    const out = calendarPeriod("mes", TODAY);
    expect(periodEarlyState(out, TODAY)).toEqual("cedo");
    expect(periodLabel(out, TODAY)).toEqual({
      title: "outubro 2026", range: "1 – 31 out", status: "em curso",
      coverage: "em curso · 3 de 31 dias fechados",
    });
    const set = shiftPeriod(out, -1, TODAY);
    expect(periodLabel(set, TODAY, { daysWithData: 28 })).toEqual({
      title: "setembro 2026", range: "1 – 30 set", coverage: "28 de 30 dias com registo",
    });
  });

  it("mês — fevereiro bissexto (2028) e não bissexto (2027)", () => {
    const f28 = calendarPeriod("mes", "2028-02-15");
    expect([f28.start, f28.end, f28.totalDays, f28.closedDays]).toEqual(["2028-02-01", "2028-02-29", 29, 14]);
    expect(calendarPeriod("mes", "2027-02-10").totalDays).toEqual(28);
    expect(addMonthsISO("2028-01-31", 1)).toEqual("2028-02-29");
    expect(addMonthsISO("2027-01-31", 1)).toEqual("2027-02-28");
    expect(addMonthsISO("2026-03-31", -1)).toEqual("2026-02-28");
    expect(calendarPeriod("mes", "2028-03-01", -1).end).toEqual("2028-02-29");
    expect(calendarPeriod("ano", "2028-06-01").totalDays).toEqual(366);
  });

  it("trimestre — mudança de trimestre e textos do mock-up", () => {
    const q3 = calendarPeriod("trimestre", "2026-09-30");
    expect([q3.start, q3.end, q3.closedDays, q3.totalDays]).toEqual(["2026-07-01", "2026-09-30", 91, 92]);
    const q4 = calendarPeriod("trimestre", "2026-10-01");
    expect([q4.start, q4.end, q4.closedDays, q4.totalDays]).toEqual(["2026-10-01", "2026-12-31", 0, 92]);
    expect(firstOfQuarter("2026-12-31")).toEqual("2026-10-01");
    expect(firstOfMonth("2026-12-31")).toEqual("2026-12-01");

    const cur = calendarPeriod("trimestre", TODAY);
    expect(periodLabel(cur, TODAY)).toEqual({
      title: "out – dez 2026", range: "1 out – 31 dez", status: "em curso",
      coverage: "em curso · 3 de 92 dias fechados",
      ariaTitle: "4.º trimestre de 2026, outubro a dezembro",
    });
    const prev = previousPeriod(cur, TODAY);
    expect(periodLabel(prev, TODAY, { daysWithData: 72, dataStartISO: "2026-07-13" })).toEqual({
      title: "jul – set 2026", range: "1 jul – 30 set",
      coverage: "desde 13 jul · 72 de 80 dias com registo",
      ariaTitle: "3.º trimestre de 2026, julho a setembro",
    });
    // Trimestre anterior ao 1.º registo.
    expect(periodLabel(previousPeriod(prev, TODAY), TODAY, { daysWithData: 0, dataStartISO: "2026-07-13" }).coverage).toEqual("antes do primeiro registo");
    // Atravessa o ano para trás.
    const q1 = calendarPeriod("trimestre", "2026-02-10", -1);
    expect([q1.start, q1.end]).toEqual(["2025-10-01", "2025-12-31"]);
    expect(periodLabel(q1, "2026-02-10").title).toEqual("out – dez 2025");
  });

  it("ano e dia — títulos", () => {
    expect(periodLabel(calendarPeriod("ano", TODAY), TODAY)).toEqual({
      title: "2026", range: "1 jan – 31 dez", status: "em curso", coverage: "em curso · 276 de 365 dias fechados",
    });
    expect(periodLabel(calendarPeriod("ano", TODAY, -1), TODAY).range).toEqual("1 jan – 31 dez 2025");
    expect(periodLabel(calendarPeriod("dia", TODAY), TODAY)).toEqual({ title: "Hoje", range: "4 out", status: "em curso" });
    expect(periodLabel(calendarPeriod("dia", TODAY, -1), TODAY)).toEqual({ title: "Ontem", range: "3 out" });
    expect(periodLabel(calendarPeriod("dia", "2026-10-05", -2), "2026-10-05").title).toEqual("sáb, 3 out");
    expect(periodLabel(calendarPeriod("dia", "2026-01-02", -3), "2026-01-02").title).toEqual("ter, 30 dez 2025");
    const hoje = calendarPeriod("dia", TODAY);
    expect([hoje.closedDays, hoje.lastClosed, periodEarlyState(hoje, TODAY)]).toEqual([0, null, "a_comecar"]);
    expect(periodEarlyState(calendarPeriod("dia", TODAY, -1), TODAY)).toEqual("ok");
  });

  it("domingos de mudança de hora (29/03/2026 e 25/10/2026) — UTC não os sente", () => {
    const mar = calendarPeriod("semana", "2026-03-29");
    expect([mar.start, mar.end, mar.closedDays]).toEqual(["2026-03-23", "2026-03-29", 6]);
    expect(eachDayISO("2026-03-28", "2026-03-30")).toEqual(["2026-03-28", "2026-03-29", "2026-03-30"]);
    expect(addDaysISO("2026-03-29", 1)).toEqual("2026-03-30");
    const oct = calendarPeriod("semana", "2026-10-25");
    expect([oct.start, oct.end, oct.closedDays]).toEqual(["2026-10-19", "2026-10-25", 6]);
    expect(addDaysISO("2026-10-25", 1)).toEqual("2026-10-26");
    expect(calendarPeriod("mes", "2026-10-26").closedDays).toEqual(25);
    expect(isoWeekday("2026-03-29")).toEqual(6);
    expect(isoWeekday("2026-10-25")).toEqual(6);
  });

  it("shiftPeriod nunca vai para o futuro", () => {
    const cur = calendarPeriod("semana", TODAY);
    expect(shiftPeriod(cur, 1, TODAY)).toEqual(cur);
    const back = shiftPeriod(cur, -3, TODAY);
    expect([back.offset, back.start]).toEqual([-3, "2026-09-07"]);
    expect(shiftPeriod(back, 5, TODAY).offset).toEqual(0);
    expect(shiftPeriod(back, 1, TODAY).start).toEqual("2026-09-14");
    // Período criado ontem, setas usadas hoje: o offset é recalculado.
    const yesterdays = calendarPeriod("semana", "2026-10-04");
    const moved = shiftPeriod(yesterdays, 1, "2026-10-05");
    expect([moved.offset, moved.start]).toEqual([0, "2026-10-05"]);
    expect(shiftPeriod(calendarPeriod("mes", TODAY), 2, TODAY).start).toEqual("2026-10-01");
    // calendarPeriod aceita futuro (marcado), shiftPeriod não.
    const fut = calendarPeriod("semana", TODAY, 1);
    expect([fut.isFuture, fut.isCurrent, fut.lastClosed, fut.closedDays]).toEqual([true, false, null, 0]);
    expect(shiftPeriod(fut, 0, TODAY).offset).toEqual(0);
  });

  it("closedDaysOf — corta no início dos dados ('desde')", () => {
    const q3 = calendarPeriod("trimestre", TODAY, -1);
    const days = closedDaysOf(q3, TODAY, "2026-07-13");
    expect([days.length, days[0], days[days.length - 1]]).toEqual([80, "2026-07-13", "2026-09-30"]);
    expect(closedDaysOf(q3, TODAY).length).toEqual(92);
    expect(closedDaysOf(q3, TODAY, "2026-06-01").length).toEqual(92);
    expect(closedDaysOf(q3, TODAY, "2026-10-02")).toEqual([]);
    const out = calendarPeriod("mes", TODAY);
    expect(closedDaysOf(out, TODAY, "2026-10-02")).toEqual(["2026-10-02", "2026-10-03"]);
    expect(closedDaysOf(out, TODAY)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(periodLabel(out, TODAY, { dataStartISO: "2026-10-02" }).coverage).toEqual("desde 2 out · em curso · 3 de 31 dias fechados");
  });

  it("weekdayAverages — mínimo por dia da semana", () => {
    // 4 segundas (28 set, 21 set, 14 set, 7 set), 3 terças, 1 domingo com null.
    const series = [
      { date: "2026-09-07", value: 2000 }, { date: "2026-09-14", value: 2200 },
      { date: "2026-09-21", value: 2400 }, { date: "2026-09-28", value: 2600 },
      { date: "2026-09-08", value: 1800 }, { date: "2026-09-15", value: 1900 }, { date: "2026-09-22", value: 2000 },
      { date: "2026-09-27", value: null },
    ];
    const avg = weekdayAverages(series);
    expect(avg[0]).toEqual({ avg: 2300, n: 4 });
    expect(avg[1]).toEqual(null);
    expect(avg[6]).toEqual(null);
    expect(avg.length).toEqual(7);
    expect(weekdayAverages(series, 3)[1]).toEqual({ avg: 1900, n: 3 });
  });

  it("datas inválidas lançam; inPeriod tolera vazios e timestamps", () => {
    expect(() => calendarPeriod("semana", "2026-02-30")).toThrow(RangeError);
    expect(() => calendarPeriod("semana", "ontem")).toThrow(RangeError);
    const p = calendarPeriod("semana", TODAY);
    expect(inPeriod(null, p, TODAY)).toEqual(false);
    expect(inPeriod("", p, TODAY)).toEqual(false);
    expect(inPeriod("2026-10-01T22:30:00Z", p, TODAY)).toEqual(true);
    expect(inPeriod("2026-10-05", p, TODAY, { closedOnly: false })).toEqual(false);
    expect(eachDayISO("2026-10-05", "2026-10-04")).toEqual([]);
  });
});
