import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildCheckinContext, daysSinceLastPeriod, evaluateCheckinAlarms, isBonePain, recentCheckins } from "./checkinAlarms.ts";

const NO_CYCLE = { female: false, cycleConsentAt: null };
const TODAY = "2026-09-18";

Deno.test("isBonePain: canela, tíbia e metatarsos são osso; gémeo e joelho não", () => {
  assert(isBonePain("Canela esquerda"));
  assert(isBonePain("tíbia"));
  assert(isBonePain("metatarsos do pé direito"));
  assert(!isBonePain("gémeo"));
  assert(!isBonePain("joelho"));
  assert(!isBonePain(null));
});

Deno.test("dor ≥ 4 hoje: G5 no músculo, G2 no osso; abaixo de 4 nada", () => {
  assertEquals(evaluateCheckinAlarms([{ date: TODAY, pain: 5, pain_location: "gémeo" }], TODAY, NO_CYCLE), [
    { code: "G5", key: `dor:${TODAY}`, reason: "Dor 5/10 (gémeo) no check-in de hoje." },
  ]);
  assertEquals(evaluateCheckinAlarms([{ date: TODAY, pain: 4, pain_location: "canela" }], TODAY, NO_CYCLE)[0].code, "G2");
  assertEquals(evaluateCheckinAlarms([{ date: TODAY, pain: 3, pain_location: "canela" }], TODAY, NO_CYCLE), []);
  // A dor de ontem não dispara hoje, sem check-in de hoje.
  assertEquals(evaluateCheckinAlarms([{ date: "2026-09-17", pain: 8 }], TODAY, NO_CYCLE), []);
});

Deno.test("dor dois dias seguidos diz-se na razão", () => {
  const [a] = evaluateCheckinAlarms([{ date: "2026-09-17", pain: 6 }, { date: TODAY, pain: 6 }], TODAY, NO_CYCLE);
  assertEquals(a.reason, "Dor 6/10 no check-in de hoje, pelo segundo dia seguido.");
});

Deno.test("G4: sono mau em 3 de 5 com energia em baixo; sono mau sozinho não chega", () => {
  const days = [
    { date: "2026-09-14", sleep: 2, energy: 2, stress: 3 },
    { date: "2026-09-15", sleep: 3, energy: 3, stress: 2 },
    { date: "2026-09-16", sleep: 1, energy: 2, stress: 3 },
    { date: "2026-09-17", sleep: 2, energy: 2, stress: 2 },
  ];
  assertEquals(evaluateCheckinAlarms(days, TODAY, NO_CYCLE), [
    { code: "G4", key: "sono:2026-09-14", reason: "Sono mau em 3 dos últimos 4 check-ins, com energia em baixo." },
  ]);
  const sleepOnly = days.map((d) => ({ ...d, energy: 4 }));
  assertEquals(evaluateCheckinAlarms(sleepOnly, TODAY, NO_CYCLE), []);
  // Fora da janela de 7 dias não conta.
  assertEquals(evaluateCheckinAlarms(days, "2026-09-30", NO_CYCLE), []);
  // Um dia bom a seguir não muda a chave: o episódio é o mesmo.
  const withGoodDay = [...days, { date: TODAY, sleep: 5, energy: 5, stress: 1 }];
  assertEquals(evaluateCheckinAlarms(withGoodDay, TODAY, NO_CYCLE)[0].key, "sono:2026-09-14");
});

/** N respostas "não" ao ciclo, uma a cada 3 dias até hoje. */
function noAnswers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(`${TODAY}T00:00:00Z`) - i * 3 * 86400000).toISOString().slice(0, 10), period_today: false }));
}

Deno.test("G3: só com perfil feminino, consentimento há ≥ 90 dias, 20 respostas e nenhum dia de menstruação", () => {
  const consent = { female: true, cycleConsentAt: "2026-05-01T10:00:00Z" };
  const noPeriod = noAnswers(25);
  assertEquals(evaluateCheckinAlarms(noPeriod, TODAY, consent).map((a) => a.code), ["G3"]);
  assertEquals(evaluateCheckinAlarms(noPeriod, TODAY, consent)[0].reason, "Nenhum dia de menstruação nos últimos 90 dias (25 respostas à pergunta do ciclo).");
  // Poucas respostas: um check-in esquecido não é um "não".
  assertEquals(evaluateCheckinAlarms(noAnswers(10), TODAY, consent), []);
  assertEquals(evaluateCheckinAlarms([{ date: "2026-06-01", period_today: false }], TODAY, consent), []);
  // Respostas em branco não contam.
  assertEquals(evaluateCheckinAlarms(noAnswers(25).map((c) => ({ ...c, period_today: null })), TODAY, consent), []);
  // Um dia de menstruação na janela apaga o alarme.
  assertEquals(evaluateCheckinAlarms([...noAnswers(25), { date: "2026-09-02", period_today: true }], TODAY, consent), []);
  // Consentimento recente: ainda não há dados para o dizer.
  assertEquals(evaluateCheckinAlarms(noPeriod, TODAY, { female: true, cycleConsentAt: "2026-08-01" }), []);
  // Sem consentimento ou sem perfil feminino, o ciclo não existe.
  assertEquals(evaluateCheckinAlarms(noPeriod, TODAY, { female: true, cycleConsentAt: null }), []);
  assertEquals(evaluateCheckinAlarms(noPeriod, TODAY, { female: false, cycleConsentAt: "2026-05-01" }), []);
  assertEquals(daysSinceLastPeriod([{ date: "2026-06-10", period_today: true }], TODAY, consent), { days: 100, lastPeriod: "2026-06-10" });
});

Deno.test("recentCheckins: janela de 7 dias até hoje, por ordem", () => {
  const got = recentCheckins([{ date: TODAY }, { date: "2026-09-11" }, { date: "2026-09-12" }, { date: "2026-09-19" }], TODAY);
  assertEquals(got.map((c) => c.date), ["2026-09-12", TODAY]);
});

Deno.test("buildCheckinContext: hoje, a média, os dias com dor e os alarmes", () => {
  const text = buildCheckinContext([
    { date: "2026-09-16", sleep: 4, energy: 4, stress: 2, pain: 2, pain_location: "joelho" },
    { date: TODAY, sleep: 3, energy: 3, stress: 3, pain: 5, pain_location: "gémeo" },
  ], TODAY, NO_CYCLE)!;
  assertStringIncludes(text, "- Hoje: sono 3, energia 3, stress 3, dor 5/10 (gémeo).");
  assertStringIncludes(text, "- Média dos últimos 7 dias: sono 3,5, energia 3,5, stress 2,5 (2 check-ins).");
  assertStringIncludes(text, "- Dias com dor esta semana: 2026-09-16 sono 4, energia 4, stress 2, dor 2/10 (joelho).");
  assertStringIncludes(text, "SINAIS DE ALARME DO CHECK-IN");
  assertStringIncludes(text, "- G5: Dor 5/10 (gémeo) no check-in de hoje.");
});

Deno.test("buildCheckinContext: sem check-in hoje diz-o; sem nada na semana nem ciclo é null", () => {
  const text = buildCheckinContext([{ date: "2026-09-15", sleep: 4, pain: 0 }], TODAY, NO_CYCLE)!;
  assertStringIncludes(text, "- Hoje: ainda sem check-in.");
  assert(!text.includes("SINAIS DE ALARME"));
  assertEquals(buildCheckinContext([], TODAY, NO_CYCLE), null);
  assertEquals(buildCheckinContext([{ date: "2026-08-01", sleep: 3 }], TODAY, NO_CYCLE), null);
  // Com ciclo ativo, há bloco mesmo sem check-ins nesta semana.
  const cycle = buildCheckinContext([], TODAY, { female: true, cycleConsentAt: "2026-09-01" })!;
  assertStringIncludes(cycle, "registo ativo, ainda sem nenhum dia de menstruação marcado (17 dias desde o consentimento)");
});
