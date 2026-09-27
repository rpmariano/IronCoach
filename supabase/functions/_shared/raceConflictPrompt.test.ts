import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildRaceConflictPrompt, type RaceConflictCup } from "./raceConflictPrompt.ts";

/* O guião do race_conflict (specs/plano-vinculado-a-prova.md §4.4) e a sua
   inversão com uma jornada promovida a principal (specs/trofeu.md §4.3,
   Fase 3, 2026-09-27). Os textos "de hoje" são os literais produzidos pelo
   coach-chat/index.ts ANTES da extração (commit ef3c4af), copiados tal e
   qual: sem inscrição, o prompt não pode mudar um byte. */

const TARGET = { id: "race-plan", name: "Maratona de Lisboa", date: "2027-10-10" };
const MEIA = { id: "race-meia", name: "Meia da Nazaré", date: "2027-09-12" };
const DEZ = { id: "race-10k", name: "10 km da Vila", date: "2027-09-26" };

const ANTES_1 = "A app detetou um conflito de calendário e chamou-te — o atleta abriu o chat a partir desse aviso. A prova \"Meia da Nazaré\" (2027-09-12, id: race-meia) está marcada como PRINCIPAL e cai a meio do plano que prepara \"Maratona de Lisboa\" (2027-10-10, id: race-plan). Explica-lhe em duas frases porque é que isto não pode ficar assim: uma prova principal pede 10 a 21 dias de polimento, e dois polimentos dentro do mesmo bloco são incompatíveis — treinar a sério para uma é chegar mal à outra. Põe-lhe as duas saídas, por esta ordem e sem escolher por ele: (1) passar essa prova a secundária e ela entra no plano como treino de qualidade — ofereces-te para a mudares já tu (update_race_event, race_priority=\"b\") e propões o plano ajustado; (2) mudar o objetivo para essa prova, e então propões um plano novo até ao dia dela (propose_training_plan com o race_id dela, period_end no dia dela, replace_active_plan=true). Tenta, mas não insistas mais do que uma vez: se ele disser que quer mesmo manter tudo como está, aceita sem julgar, garante que percebeu o custo e chama update_race_event com conflict_acknowledged=true para eu parar de perguntar. A decisão é dele; o teu trabalho é que seja informada.";
const ANTES_2 = "A app detetou um conflito de calendário e chamou-te — o atleta abriu o chat a partir desse aviso. As provas \"Meia da Nazaré\" (2027-09-12, id: race-meia), \"10 km da Vila\" (2027-09-26, id: race-10k) estão marcadas como PRINCIPAL e caem a meio do plano que prepara \"Maratona de Lisboa\" (2027-10-10, id: race-plan). Explica-lhe em duas frases porque é que isto não pode ficar assim: uma prova principal pede 10 a 21 dias de polimento, e dois polimentos dentro do mesmo bloco são incompatíveis — treinar a sério para uma é chegar mal à outra. Põe-lhe as duas saídas, por esta ordem e sem escolher por ele: (1) passar essas provas a secundária e ela entra no plano como treino de qualidade — ofereces-te para a mudares já tu (update_race_event, race_priority=\"b\") e propões o plano ajustado; (2) mudar o objetivo para a primeira delas, e então propões um plano novo até ao dia dela (propose_training_plan com o race_id dela, period_end no dia dela, replace_active_plan=true). Tenta, mas não insistas mais do que uma vez: se ele disser que quer mesmo manter tudo como está, aceita sem julgar, garante que percebeu o custo e chama update_race_event com conflict_acknowledged=true para eu parar de perguntar. A decisão é dele; o teu trabalho é que seja informada.";
const ANTES_SEM_ALVO = "A app detetou um conflito de calendário e chamou-te — o atleta abriu o chat a partir desse aviso. A prova \"Meia da Nazaré\" (2027-09-12, id: race-meia) está marcada como PRINCIPAL e cai a meio do plano que prepara a prova-objetivo. Explica-lhe em duas frases porque é que isto não pode ficar assim: uma prova principal pede 10 a 21 dias de polimento, e dois polimentos dentro do mesmo bloco são incompatíveis — treinar a sério para uma é chegar mal à outra. Põe-lhe as duas saídas, por esta ordem e sem escolher por ele: (1) passar essa prova a secundária e ela entra no plano como treino de qualidade — ofereces-te para a mudares já tu (update_race_event, race_priority=\"b\") e propões o plano ajustado; (2) mudar o objetivo para essa prova, e então propões um plano novo até ao dia dela (propose_training_plan com o race_id dela, period_end no dia dela, replace_active_plan=true). Tenta, mas não insistas mais do que uma vez: se ele disser que quer mesmo manter tudo como está, aceita sem julgar, garante que percebeu o custo e chama update_race_event com conflict_acknowledged=true para eu parar de perguntar. A decisão é dele; o teu trabalho é que seja informada.";

const CUP: RaceConflictCup = { jornadaRaceIds: ["race-j3", "race-j4"], competitionName: "Troféu de Cascais", roundLabel: "Jornada" };
const J3 = { id: "race-j3", name: "Corrida CCD Cascais", date: "2027-09-19" };

Deno.test("sem inscrição (cup null): o texto de antes da extração, byte a byte — 1 e 2 provas, e sem alvo", () => {
  assertEquals(buildRaceConflictPrompt({ target: TARGET, races: [MEIA] }, null), ANTES_1);
  assertEquals(buildRaceConflictPrompt({ target: TARGET, races: [MEIA, DEZ] }, null), ANTES_2);
  assertEquals(buildRaceConflictPrompt({ races: [MEIA] }, null), ANTES_SEM_ALVO);
});

Deno.test("sem conflito: null (sem race_conflict, sem provas, ou um valor que não é objeto)", () => {
  for (const rc of [null, undefined, "x", 3, {}, { target: TARGET }, { target: TARGET, races: [] }, { target: TARGET, races: "x" }]) {
    assertEquals(buildRaceConflictPrompt(rc, null), null, JSON.stringify(rc));
    assertEquals(buildRaceConflictPrompt(rc, CUP), null, JSON.stringify(rc));
  }
});

Deno.test("inscrito, mas o alvo do plano não é uma jornada: o texto de sempre", () => {
  assertEquals(buildRaceConflictPrompt({ target: TARGET, races: [MEIA] }, CUP), ANTES_1);
  assertEquals(buildRaceConflictPrompt({ target: TARGET, races: [MEIA, DEZ] }, CUP), ANTES_2);
  // Uma jornada promovida a meio do plano de uma principal de fora também
  // é o caso de sempre (a de fora é o alvo: manda).
  assertEquals(buildRaceConflictPrompt({ target: TARGET, races: [J3] }, CUP), buildRaceConflictPrompt({ target: TARGET, races: [J3] }, null));
});

Deno.test("alvo = jornada promovida, com uma principal de fora a meio: o guião inverte as saídas", () => {
  const text = buildRaceConflictPrompt({ target: J3, races: [MEIA] }, CUP)!;
  assertStringIncludes(text, 'O plano dele prepara "Corrida CCD Cascais" (2027-09-19, id: race-j3), uma jornada da competição Troféu de Cascais que ele promoveu a principal, e a prova "Meia da Nazaré" (2027-09-12, id: race-meia) é principal e cai a meio desse plano.');
  assertStringIncludes(text, "As principais de fora mandam sempre: põe-lhe as duas saídas, por esta ordem e sem escolher por ele:");
  // (1) a jornada volta a secundária — no id dela, que está à frente.
  assertStringIncludes(text, '(1) a jornada volta a secundária — ofereces-te para a mudares já tu (update_race_event, race_priority="b", no id dela) e propões um plano novo até essa prova (propose_training_plan com o race_id dela, period_end no dia dela, replace_active_plan=true);');
  assertStringIncludes(text, '(2) passar essa prova a secundária e o plano continua a preparar a jornada (update_race_event, race_priority="b").');
  assert(text.indexOf("(1) a jornada volta a secundária") < text.indexOf("(2) passar essa prova"));
  assertStringIncludes(text, "id: race-j3");
  // O resto do tom é o de sempre.
  assertStringIncludes(text, "uma prova principal pede 10 a 21 dias de polimento");
  assert(text.endsWith("garante que percebeu o custo e chama update_race_event com conflict_acknowledged=true para eu parar de perguntar. A decisão é dele; o teu trabalho é que seja informada."));
  assertEquals(/dorsal|\bbib\b/i.test(text), false);
});

Deno.test("invertido com duas principais de fora (e outra jornada no meio, que não conta como de fora); rótulo da competição", () => {
  const cup = { ...CUP, competitionName: "Circuito da Ilha", roundLabel: "Etapa" };
  const J4 = { id: "race-j4", name: "Etapa do Porto", date: "2027-09-20" };
  const text = buildRaceConflictPrompt({ target: J3, races: [MEIA, J4, DEZ] }, cup)!;
  assertStringIncludes(text, 'uma etapa da competição Circuito da Ilha que ele promoveu a principal, e as provas "Meia da Nazaré" (2027-09-12, id: race-meia), "10 km da Vila" (2027-09-26, id: race-10k) são principais e caem a meio desse plano.');
  assertStringIncludes(text, "(1) a etapa volta a secundária");
  assertStringIncludes(text, "propões um plano novo até à primeira delas");
  assertStringIncludes(text, "(2) passar essas provas a secundária e o plano continua a preparar a etapa");
  assertEquals(text.includes("Etapa do Porto"), false);
  // Só jornadas no conflito (nenhuma de fora): o texto de sempre.
  assertEquals(buildRaceConflictPrompt({ target: J3, races: [J4] }, cup), buildRaceConflictPrompt({ target: J3, races: [J4] }, null));
});
