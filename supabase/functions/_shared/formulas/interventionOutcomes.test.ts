import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { interventionOutcomesLine, INTERVENTION_ORIGIN, INTERVENTION_OUTCOME, CHAT_RESOLVE_OUTCOMES } from "./interventionOutcomes.ts";
import { assertCarolVoice } from "../carolTone.ts";

// 5.5, push 1: os avisos da Carol nos últimos 60 dias, para calibrar.

const TODAY = "2026-09-25";

Deno.test("interventionOutcomesLine: sem avisos nos últimos 60 dias, nada", () => {
  assertEquals(interventionOutcomesLine([], TODAY), null);
  assertEquals(interventionOutcomesLine(null, TODAY), null);
  assertEquals(interventionOutcomesLine([{ opened_at: "2026-07-01T10:00:00Z", outcome: "falso_positivo" }], TODAY), null);
});

Deno.test("interventionOutcomesLine: abertos, ignorados (disse que não ou dispensou) e falsos alarmes", () => {
  const line = interventionOutcomesLine([
    { opened_at: "2026-09-20T10:00:00Z", closed_at: "2026-09-20T12:00:00Z", outcome: "plano_ajustado", origin: "run" },
    { opened_at: "2026-09-18T10:00:00Z", closed_at: "2026-09-18T11:00:00Z", outcome: "atleta_ignorou", origin: "meal" },
    { opened_at: "2026-09-10T10:00:00Z", closed_at: "2026-09-11T08:00:00Z", outcome: "dispensado", origin: "checkin" },
    { opened_at: "2026-09-05T10:00:00Z", closed_at: "2026-09-05T20:00:00Z", outcome: "falso_positivo", origin: "run" },
    { opened_at: "2026-09-24T10:00:00Z", closed_at: null, outcome: null, origin: "load" },
  ], TODAY)!;
  assertStringIncludes(line, "5 abertos, 2 ignorados, 1 falso alarme.");
  assertStringIncludes(line, "Nunca é assunto de conversa");
  // Sem concentração (um de cada origem), não aponta nenhuma.
  assertEquals(line.includes("vêm sobretudo"), false);
  assertCarolVoice(line);
});

Deno.test("interventionOutcomesLine: quando os que não deram em nada se concentram, diz de onde vêm", () => {
  const line = interventionOutcomesLine([
    { opened_at: "2026-09-20T10:00:00Z", closed_at: "2026-09-20T12:00:00Z", outcome: "falso_positivo", origin: "checkin" },
    { opened_at: "2026-09-12T10:00:00Z", closed_at: "2026-09-12T12:00:00Z", outcome: "dispensado", origin: "checkin" },
    { opened_at: "2026-09-02T10:00:00Z", closed_at: "2026-09-02T12:00:00Z", outcome: "substituido", origin: "run" },
  ], TODAY)!;
  assertStringIncludes(line, "3 abertos, 1 ignorado, 1 falso alarme.");
  assertStringIncludes(line, "vêm sobretudo dos check-ins");
});

// Terceira revisão pré-deploy (2026-09-25): o vocabulário vive num sítio só,
// e o SQL não o importa — este teste lê a migration e compara, para os dois
// lados não divergirem sem ninguém dar por isso.
Deno.test("o vocabulário dos avisos é o dos checks da migration", async () => {
  const sql = await Deno.readTextFile(new URL("../../../migrations/20260924233658_coach_interventions.sql", import.meta.url));
  const lists = (column: string) =>
    [...sql.matchAll(new RegExp(`${column} in \\(([^)]*)\\)`, "g"))]
      .map((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort());
  const origins = Object.values(INTERVENTION_ORIGIN).sort();
  const outcomes = Object.values(INTERVENTION_OUTCOME).sort();
  // A tabela e a coluna de passagem em profiles têm as mesmas origens.
  assertEquals(lists("origin"), [origins, origins]);
  // A tabela aceita todos os desfechos; a coluna de passagem, todos menos o
  // que só o trigger escreve ('substituido').
  assertEquals(lists("outcome"), [outcomes, outcomes.filter((o) => o !== INTERVENTION_OUTCOME.SUBSTITUIDO)]);
  // O que a Carol pode dar no chat está no vocabulário.
  for (const o of CHAT_RESOLVE_OUTCOMES) assertEquals(outcomes.includes(o as typeof outcomes[number]), true);
});
