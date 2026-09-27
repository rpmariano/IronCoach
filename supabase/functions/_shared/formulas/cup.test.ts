import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  ageOn,
  ageReferenceDate,
  attendanceCount,
  classifyEnrollment,
  courseFor,
  cupCategoryFor,
  defaultDecision,
  enrollmentChoiceError,
  entryDeadlineNotice,
  type EntryDeadlineInput,
  haversineKm,
  nextCupRound,
  seasonRefYear,
  shouldShowCupDoor,
  type CupRound,
} from "./cup.ts";
import {
  CASCAIS_34,
  AGE_PARITY_CASES,
  CASCAIS_34_ABERTA,
  CASCAIS_34_REG,
  CASCAIS_CATEGORIES,
  CASCAIS_REG_CATEGORIES,
  CASCAIS_REG_COURSES,
  CASCAIS_REG_ROUNDS,
  CASCAIS_COURSES,
  CASCAIS_OVERRIDES,
  CASCAIS_ROUNDS,
  CASCAIS_TEAMS,
  FICTICIA_1,
  FICTICIA_CATEGORIES,
  FICTICIA_COURSES,
  FICTICIA_OVERRIDES,
  FICTICIA_ROUNDS,
  FICTICIA_TEAMS,
  PERSONAS,
  SEASON_REF_YEAR_CASES,
} from "./cup.fixtures.ts";

/* Competições por jornadas, as regras do atleta (specs/trofeu.md §4.1–4.3,
   2026-09-26). Cada regra corre sobre Cascais E sobre a competição fictícia,
   que tem todas as colunas diferentes: nada pode assumir os valores de
   Cascais. */

const round = (id: string) => [...CASCAIS_ROUNDS, ...FICTICIA_ROUNDS].find((r) => r.id === id)!;

// ── §4.2 ────────────────────────────────────────────────────────────────

Deno.test("classifyEnrollment: os cinco tipos, pelos dados do clube", () => {
  // Cascais: tudo por confirmar até ao regulamento (eligible_final null).
  assertEquals(classifyEnrollment({ team_id: "t-naza" }, CASCAIS_TEAMS), "clube_por_confirmar");
  assertEquals(classifyEnrollment({ team_id: "t-ind" }, CASCAIS_TEAMS), "individual_aberto");
  assertEquals(classifyEnrollment({ team_other: "Os Amigos da Marginal" }, CASCAIS_TEAMS), "clube_por_confirmar");
  // Fictícia: elegíveis e não elegíveis.
  assertEquals(classifyEnrollment({ team_id: "t-ilha-a", is_federated: true }, FICTICIA_TEAMS), "clube_elegivel");
  assertEquals(classifyEnrollment({ team_id: "t-ilha-b" }, FICTICIA_TEAMS), "clube_aberto");
  assertEquals(classifyEnrollment({ team_id: "t-ilha-ind" }, FICTICIA_TEAMS), "individual_elegivel");
  const indNao = FICTICIA_TEAMS.map((t) => (t.id === "t-ilha-ind" ? { ...t, eligible_final: false } : t));
  assertEquals(classifyEnrollment({ team_id: "t-ilha-ind" }, indNao), "individual_aberto");
});

Deno.test("classifyEnrollment: escolhas que não servem dão null, e o motivo sai de enrollmentChoiceError", () => {
  assertEquals(classifyEnrollment({ team_id: "t-ind", is_federated: true }, CASCAIS_TEAMS), null);
  assertEquals(enrollmentChoiceError({ team_id: "t-ind", is_federated: true }, CASCAIS_TEAMS), "federado_individual");
  assertEquals(enrollmentChoiceError({}, CASCAIS_TEAMS), "falta_clube");
  assertEquals(enrollmentChoiceError({ team_other: "   " }, CASCAIS_TEAMS), "falta_clube");
  assertEquals(enrollmentChoiceError({ team_id: "t-naza", team_other: "x" }, CASCAIS_TEAMS), "dois_clubes");
  // Um clube de OUTRA edição (a FK composta recusa-o no servidor).
  assertEquals(enrollmentChoiceError({ team_id: "t-ilha-a" }, [...CASCAIS_TEAMS, ...FICTICIA_TEAMS], CASCAIS_34.id), "clube_de_outra_edicao");
  assertEquals(enrollmentChoiceError({ team_id: "nao-existe" }, CASCAIS_TEAMS), "clube_de_outra_edicao");
  // Federado num clube (ou "não está na lista") serve.
  assertEquals(enrollmentChoiceError({ team_id: "t-naza", is_federated: true }, CASCAIS_TEAMS, CASCAIS_34.id), null);
  assertEquals(enrollmentChoiceError({ team_other: "Clube novo", is_federated: true }, CASCAIS_TEAMS), null);
  // …e o federado fora da lista fica "por confirmar", como qualquer outro
  // clube que o admin ainda não ligou (revisão da Fase 1, 2026-09-26: o ecrã
  // escondia-lhe esta opção).
  assertEquals(classifyEnrollment({ team_other: "Clube novo", is_federated: true }, CASCAIS_TEAMS), "clube_por_confirmar");
  assertEquals(classifyEnrollment(null, CASCAIS_TEAMS), null);
});

// ── §3.5: escalão e percurso ─────────────────────────────────────────────

Deno.test("ageOn: anos completos, como o age() do Postgres", () => {
  assertEquals(ageOn("1982-01-24", "2027-01-23"), 44);
  assertEquals(ageOn("1982-01-24", "2027-01-24"), 45);
  assertEquals(ageOn("2000-02-29", "2027-02-28"), 26);
  assertEquals(ageOn("2000-02-29", "2027-03-01"), 27);
  assertEquals(ageOn(null, "2027-01-01"), null);
  assertEquals(ageOn("1990-01-01", null), null);
});

Deno.test("cupCategoryFor (Cascais, idade no dia da prova): o aniversário a meio da época muda o escalão", () => {
  const born = "1982-01-24";
  assertEquals(cupCategoryFor(CASCAIS_34, CASCAIS_CATEGORIES, born, "M", "2027-01-10")?.code, "M35");
  assertEquals(cupCategoryFor(CASCAIS_34, CASCAIS_CATEGORIES, born, "M", "2027-01-24")?.code, "M45");
  assertEquals(cupCategoryFor(CASCAIS_34, CASCAIS_CATEGORIES, "1960-05-05", "M", "2027-01-24")?.code, "M55");
  assertEquals(cupCategoryFor(CASCAIS_34, CASCAIS_CATEGORIES, "1990-06-15", "F", "2027-01-24")?.code, "F35");
  // Nunca se assume o género: sem ele, nenhum escalão de Cascais bate.
  assertEquals(cupCategoryFor(CASCAIS_34, CASCAIS_CATEGORIES, born, null, "2027-01-24"), null);
  // Sem data de nascimento, também não.
  assertEquals(cupCategoryFor(CASCAIS_34, CASCAIS_CATEGORIES, null, "M", "2027-01-24"), null);
  // Juvenil: nenhum escalão (os fictícios começam nos 20).
  assertEquals(cupCategoryFor(CASCAIS_34, CASCAIS_CATEGORIES, "2012-01-01", "M", "2027-01-24"), null);
});

Deno.test("cupCategoryFor (fictícia, idade a 31/12): a regra da edição decide, e o género ganha ao misto", () => {
  const born = "1987-12-31";
  // A 6/3/2027 tem 39 anos, mas a 31/12/2027 faz 40 → VETF.
  assertEquals(cupCategoryFor(FICTICIA_1, FICTICIA_CATEGORIES, born, "F", "2027-03-06")?.code, "VETF");
  // A mesma pessoa com a regra de Cascais (dia da prova) → absoluto.
  assertEquals(cupCategoryFor({ ...FICTICIA_1, age_rule: null }, FICTICIA_CATEGORIES, born, "F", "2027-03-06")?.code, "ABS");
  // 55 anos: VETF (com género, F 40+) antes de VET (misto, 50+).
  assertEquals(cupCategoryFor(FICTICIA_1, FICTICIA_CATEGORIES, "1972-01-01", "F", "2027-03-06")?.code, "VETF");
  assertEquals(cupCategoryFor(FICTICIA_1, FICTICIA_CATEGORIES, "1972-01-01", "M", "2027-03-06")?.code, "VET");
  // Sem género: só os mistos. Sem idade: só os sem limites de idade.
  assertEquals(cupCategoryFor(FICTICIA_1, FICTICIA_CATEGORIES, "1972-01-01", null, "2027-03-06")?.code, "VET");
  assertEquals(cupCategoryFor(FICTICIA_1, FICTICIA_CATEGORIES, null, null, "2027-03-06")?.code, "ABS");
  // Escalões de outra edição não entram.
  assertEquals(cupCategoryFor(FICTICIA_1, CASCAIS_CATEGORIES, "1972-01-01", "M", "2027-03-06"), null);
});

// ── A idade pela época (M2, 2026-09-27) ───────────────────────────────────
// O regulamento de Cascais dá os escalões por ano de nascimento com
// referência ao 2.º ano da época. Nenhuma das regras da M1 acerta numa
// jornada de dezembro: 'data_prova' e 'fim_ano_civil' leem 2026 onde o
// regulamento lê 2027.

Deno.test("seasonRefYear: o 2.º ano da época, os mesmos casos de cup_season_ref_year", () => {
  for (const [label, want] of SEASON_REF_YEAR_CASES) assertEquals(seasonRefYear(label), want, String(label));
  assertEquals(seasonRefYear(2027), null);
  assertEquals(seasonRefYear(undefined), null);
});

Deno.test("ageReferenceDate: fim_ano_epoca → 31/12 do 2.º ano da época; as regras antigas intactas", () => {
  assertEquals(ageReferenceDate(CASCAIS_34_REG, "2026-12-06"), "2027-12-31");
  assertEquals(ageReferenceDate(CASCAIS_34_REG, "2027-06-13"), "2027-12-31");
  assertEquals(ageReferenceDate({ ...CASCAIS_34_REG, age_rule: "fim_ano_civil" }, "2026-12-06"), "2026-12-31");
  assertEquals(ageReferenceDate({ ...CASCAIS_34_REG, age_rule: null }, "2026-12-06"), "2026-12-06");
  assertEquals(ageReferenceDate({ ...CASCAIS_34_REG, age_rule: "data_prova" }, "2026-12-06"), "2026-12-06");
  // Época ilegível → sem data de referência (sem idade: só escalões sem limites).
  assertEquals(ageReferenceDate({ ...CASCAIS_34_REG, season_label: "época" }, "2026-12-06"), null);
  assertEquals(ageReferenceDate(CASCAIS_34_REG, null), null);
});

Deno.test("cupCategoryFor + courseFor (34.ª, regulamento): os casos de paridade com cup_resolve_course", () => {
  const roundOn = (d: string) => CASCAIS_REG_ROUNDS.find((r) => r.date === d)!;
  for (const c of AGE_PARITY_CASES) {
    const ed = c.ageRule === undefined ? CASCAIS_34_REG : { ...CASCAIS_34_REG, age_rule: c.ageRule };
    const cat = cupCategoryFor(ed, CASCAIS_REG_CATEGORIES, c.birth, c.gender, c.roundDate);
    const label = `${c.birth} ${c.gender} ${c.roundDate} ${c.ageRule ?? "fim_ano_epoca"}`;
    assertEquals(cat?.code ?? null, c.category, label);
    assertEquals(courseFor(roundOn(c.roundDate), CASCAIS_REG_COURSES, [], cat)?.code ?? null, c.course, label);
  }
});

Deno.test("cupCategoryFor: a jornada de dezembro — M40 pela época, M35 pelas regras antigas", () => {
  const born = "1987-06-01";
  assertEquals(cupCategoryFor(CASCAIS_34_REG, CASCAIS_REG_CATEGORIES, born, "M", "2026-12-06")?.code, "M40");
  assertEquals(cupCategoryFor({ ...CASCAIS_34_REG, age_rule: "fim_ano_civil" }, CASCAIS_REG_CATEGORIES, born, "M", "2026-12-06")?.code, "M35");
  assertEquals(cupCategoryFor({ ...CASCAIS_34_REG, age_rule: null }, CASCAIS_REG_CATEGORIES, born, "M", "2026-12-06")?.code, "M35");
  // Pela época, o escalão não muda a meio: o mesmo em dezembro e em junho.
  assertEquals(cupCategoryFor(CASCAIS_34_REG, CASCAIS_REG_CATEGORIES, born, "M", "2027-06-13")?.code, "M40");
  // Por ano de nascimento: 1/1/1988 já é M35 a época toda; 31/12/1987 é M40.
  assertEquals(cupCategoryFor(CASCAIS_34_REG, CASCAIS_REG_CATEGORIES, "1988-01-01", "M", "2026-12-06")?.code, "M35");
  assertEquals(cupCategoryFor(CASCAIS_34_REG, CASCAIS_REG_CATEGORIES, "1987-12-31", "M", "2026-12-06")?.code, "M40");
  // Época ilegível: sem idade, nenhum escalão de Cascais (todos têm limites).
  assertEquals(cupCategoryFor({ ...CASCAIS_34_REG, season_label: "época" }, CASCAIS_REG_CATEGORIES, born, "M", "2026-12-06"), null);
});

Deno.test("CASCAIS_REG_CATEGORIES: 32 escalões, sem buracos nem sobreposições por género", () => {
  assertEquals(CASCAIS_REG_CATEGORIES.length, 32);
  assertEquals(new Set(CASCAIS_REG_CATEGORIES.map((c) => c.code)).size, 32);
  for (const g of ["F", "M"]) {
    // Dos 9 anos ao fim: cada idade bate em exatamente um escalão.
    for (let age = 9; age <= 100; age++) {
      const n = CASCAIS_REG_CATEGORIES.filter((c) =>
        c.gender === g && (c.min_age ?? 0) <= age && (c.max_age ?? 200) >= age
      ).length;
      assertEquals(n, 1, `${g} ${age}`);
    }
    assertEquals(CASCAIS_REG_CATEGORIES.some((c) => c.gender === g && (c.min_age ?? 0) <= 8), false);
  }
});

Deno.test("courseFor: exceção da jornada → percurso do escalão → percurso único → null", () => {
  const cat = (code: string) => CASCAIS_CATEGORIES.find((c) => c.code === code)!;
  // Corta-mato: os M45 têm exceção para o curto; os M35 fazem o do escalão.
  assertEquals(courseFor(round("r-c2"), CASCAIS_COURSES, CASCAIS_OVERRIDES, cat("M45"))?.distance_m, 4000);
  assertEquals(courseFor(round("r-c2"), CASCAIS_COURSES, CASCAIS_OVERRIDES, cat("M35"))?.distance_m, 8000);
  // A exceção é só dessa jornada.
  assertEquals(courseFor(round("r-c3"), CASCAIS_COURSES, CASCAIS_OVERRIDES, cat("M45"))?.distance_m, 7400);
  assertEquals(courseFor(round("r-c3"), CASCAIS_COURSES, CASCAIS_OVERRIDES, cat("M55"))?.code, "CURTO");
  // Percurso único: vale para todos, com ou sem escalão.
  assertEquals(courseFor(round("r-c1"), CASCAIS_COURSES, CASCAIS_OVERRIDES, cat("M35"))?.code, "UNICO");
  assertEquals(courseFor(round("r-c1"), CASCAIS_COURSES, CASCAIS_OVERRIDES, null)?.code, "UNICO");
  // Dois percursos e sem escalão: não se sabe (o servidor espera).
  assertEquals(courseFor(round("r-c2"), CASCAIS_COURSES, CASCAIS_OVERRIDES, null), null);
  // Jornada ainda sem percursos.
  assertEquals(courseFor(round("r-c4"), CASCAIS_COURSES, CASCAIS_OVERRIDES, cat("M35")), null);
  // Fictícia: etapa de pista com um só percurso de código que nenhum escalão usa.
  const abs = FICTICIA_CATEGORIES[0];
  assertEquals(courseFor(round("r-i2"), FICTICIA_COURSES, FICTICIA_OVERRIDES, abs)?.code, "MILHA");
  assertEquals(courseFor(round("r-i1"), FICTICIA_COURSES, FICTICIA_OVERRIDES, FICTICIA_CATEGORIES[2])?.distance_m, 5100);
  assertEquals(courseFor(null, FICTICIA_COURSES, [], abs), null);
});

// ── §4.1 ────────────────────────────────────────────────────────────────

Deno.test("haversineKm: Lisboa–Porto ~274 km, e zero no mesmo ponto", () => {
  const d = haversineKm(38.7223, -9.1393, 41.1579, -8.6291);
  assert(d > 270 && d < 278, String(d));
  assertEquals(haversineKm(38.72, -9.4, 38.72, -9.4), 0);
});

Deno.test("shouldShowCupDoor: só edição aberta, dentro da área ou sem local, sem dispensa", () => {
  const { cascais, lisboa, porto, semLocal, ilha } = PERSONAS;
  // Por anunciar (o seed): nada.
  assertEquals(shouldShowCupDoor(CASCAIS_34, cascais, [], null), null);
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, cascais, [], null), "convite");
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, lisboa, [], null), "convite");
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, porto, [], null), null);
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, semLocal, [], null), "convite");
  // Fictícia: 12 km em Ponta Delgada — Lisboa e Cascais ficam de fora.
  assertEquals(shouldShowCupDoor(FICTICIA_1, ilha, [], null), "convite");
  assertEquals(shouldShowCupDoor(FICTICIA_1, cascais, [], null), null);
  assertEquals(shouldShowCupDoor(FICTICIA_1, semLocal, [], null), "convite");
  // "Não me interessa" desta edição (linhas ou ids); a de outra edição não conta.
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, cascais, [{ edition_id: CASCAIS_34.id }], null), null);
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, cascais, [CASCAIS_34.id], null), null);
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, cascais, [FICTICIA_1.id], null), "convite");
  // Encerrada, sem área, sem perfil: nada.
  assertEquals(shouldShowCupDoor({ ...FICTICIA_1, status: "encerrada" }, ilha, [], null), null);
  assertEquals(shouldShowCupDoor({ ...CASCAIS_34_ABERTA, area_lat: null }, semLocal, [], null), null);
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, null, [], null), null);
  assertEquals(shouldShowCupDoor(null, cascais, [], null), null);
});

Deno.test("shouldShowCupDoor: inscrito vê sempre a porta da sua edição; quem saiu volta ao convite", () => {
  const ativa = { edition_id: CASCAIS_34.id, status: "ativa" };
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, PERSONAS.porto, [CASCAIS_34.id], ativa), "inscrito");
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, PERSONAS.cascais, [], { ...ativa, status: "saiu" }), "convite");
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, PERSONAS.porto, [], { ...ativa, status: "saiu" }), null);
  // Inscrição noutra edição não abre esta.
  assertEquals(shouldShowCupDoor(CASCAIS_34_ABERTA, PERSONAS.porto, [], { edition_id: FICTICIA_1.id, status: "ativa" }), null);
  // Edição fechada: a inscrição concluída não abre porta.
  assertEquals(shouldShowCupDoor({ ...CASCAIS_34_ABERTA, status: "encerrada" }, PERSONAS.cascais, [], { ...ativa, status: "concluida" }), null);
  // O admin voltou a edição a por_anunciar: o inscrito continua a chegar ao
  // Troféu para gerir ou sair (revisão pré-deploy da Fase 1); quem não está
  // inscrito continua sem porta. Encerrada nunca abre.
  assertEquals(shouldShowCupDoor({ ...CASCAIS_34_ABERTA, status: "por_anunciar" }, PERSONAS.porto, [], ativa), "inscrito");
  assertEquals(shouldShowCupDoor({ ...CASCAIS_34_ABERTA, status: "por_anunciar" }, PERSONAS.cascais, [], null), null);
  assertEquals(shouldShowCupDoor({ ...CASCAIS_34_ABERTA, status: "encerrada" }, PERSONAS.cascais, [], ativa), null);
});

// ── §4.3 ────────────────────────────────────────────────────────────────

Deno.test("defaultDecision: pré-marca 'vou' só com prémio ou pontos do clube", () => {
  const r3 = round("r-c3");
  assertEquals(defaultDecision("premio", r3, []), { decision: "vou", reason: null, principal: null });
  assertEquals(defaultDecision("pontos_clube", r3, []).decision, "vou");
  assertEquals(defaultDecision("participar", r3, []).decision, null);
  assertEquals(defaultDecision("marcas", r3, []).decision, null);
  assertEquals(defaultDecision(null, r3, []).decision, null);
  // Provável também se pré-marca (a prova só nasce quando for confirmada).
  assertEquals(defaultDecision("premio", round("r-c1"), []).decision, "vou");
  // Sem data ainda: pré-marca na mesma.
  assertEquals(defaultDecision("premio", round("r-c5"), []).decision, "vou");
});

Deno.test("defaultDecision: uma principal no mesmo dia → 'nao_vou' com o motivo, seja qual for o objetivo", () => {
  const r4 = round("r-c4");
  const meia = { id: "m1", name: "Meia de Lisboa", date: "2027-02-21", race_priority: "a", status: "agendada", cup_round_id: null };
  const d = defaultDecision("premio", r4, [meia]);
  assertEquals(d.decision, "nao_vou");
  assertEquals(d.reason, "principal");
  assertEquals(d.principal?.name, "Meia de Lisboa");
  assertEquals(defaultDecision("participar", r4, [meia]).decision, "nao_vou");
  // Sem prioridade conta como principal (o default da coluna).
  assertEquals(defaultDecision("premio", r4, [{ ...meia, race_priority: null }]).decision, "nao_vou");
  // Uma prova de treino, a própria jornada, ou uma principal já corrida não colidem.
  assertEquals(defaultDecision("premio", r4, [{ ...meia, race_priority: "b" }]).decision, "vou");
  assertEquals(defaultDecision("premio", r4, [{ ...meia, cup_round_id: "r-c4" }]).decision, "vou");
  assertEquals(defaultDecision("premio", r4, [{ ...meia, status: "concluida" }]).decision, "vou");
  // Outro dia: nada.
  assertEquals(defaultDecision("premio", r4, [{ ...meia, date: "2027-02-22" }]).decision, "vou");
});

Deno.test("defaultDecision: cancelada e passada ficam por decidir, com o motivo", () => {
  assertEquals(defaultDecision("premio", round("r-c6"), []), { decision: null, reason: "cancelada", principal: null });
  assertEquals(defaultDecision("premio", round("r-c3"), [], "2027-02-01"), { decision: null, reason: "passada", principal: null });
  assertEquals(defaultDecision("premio", round("r-c3"), [], "2027-01-24").decision, "vou");
  assertEquals(defaultDecision("premio", null, []).decision, null);
});

Deno.test("defaultDecision: uma principal só colide de hoje em diante — a régua de cup_principal_collision", () => {
  // Revisão da Fase 1 (2026-09-26): o servidor deixou de desfazer uma
  // jornada "por registar" quando o atleta regista a posteriori uma principal
  // desse dia (a prioridade por omissão é 'a'). Cliente e servidor: só
  // jornadas de hoje em diante, só principais por concluir.
  const principal = { id: "p1", name: "Meia", date: "2027-01-24", race_priority: "a", status: "agendada", cup_round_id: null };
  assertEquals(defaultDecision("premio", round("r-c3"), [principal], "2027-02-01").reason, "passada");
  assertEquals(defaultDecision("premio", round("r-c3"), [principal], "2027-01-24").reason, "principal");
  assertEquals(defaultDecision("premio", round("r-c3"), [{ ...principal, status: "concluida" }], "2027-01-24").decision, "vou");
});

// ── O contador ──────────────────────────────────────────────────────────

function onzeJornadas(): CupRound[] {
  const datas = ["2026-12-06", "2027-01-10", "2027-01-24", "2027-02-21", "2027-03-07", "2027-03-21",
    "2027-04-11", "2027-04-25", "2027-05-09", "2027-05-23", "2027-06-13"];
  return datas.map((date, i) => ({ id: `j${i + 1}`, round_no: i + 1, date, date_status: "confirmada" }));
}

Deno.test("attendanceCount (70%): 8 de 11; feitas 2, uma falhada, ainda podes faltar a 2", () => {
  const rounds = onzeJornadas();
  const races = [
    { id: "x1", cup_round_id: "j1", status: "concluida" },
    // A 2.ª foi corrida (corrida ligada) sem a prova estar marcada concluída.
    { id: "x2", cup_round_id: "j2", status: "agendada" },
    // Uma prova normal nunca conta.
    { id: "x9", cup_round_id: null, status: "concluida" },
  ];
  const c = attendanceCount(CASCAIS_34, rounds, races, "2027-02-01", [{ race_id: "x2" }])!;
  assertEquals(c.rule, "pct_minima");
  assertEquals([c.total, c.required, c.done, c.missing, c.ahead, c.canMiss], [11, 8, 2, 6, 8, 2]);
  assertEquals(c.reachable, true);
  assertEquals(c.rounding, "a_confirmar");
});

Deno.test("attendanceCount: canceladas não contam; sem margem, canMiss 0 e reachable false", () => {
  const rounds = onzeJornadas().map((r, i) => (i >= 9 ? { ...r, date_status: "cancelada" } : r));
  // 9 que contam → ⌈6,3⌉ = 7.
  const c = attendanceCount(CASCAIS_34, rounds, [], "2027-04-01")!;
  assertEquals([c.total, c.required, c.done, c.ahead, c.canMiss, c.reachable], [9, 7, 0, 3, 0, false]);
  // Exatamente inteiro não arredonda para cima (10 × 70% = 7).
  assertEquals(attendanceCount(CASCAIS_34, onzeJornadas().slice(0, 10), [], "2026-01-01")!.required, 7);
});

Deno.test("attendanceCount (fictícia, melhores 4) e 'todas'; regra desconhecida → null", () => {
  const f = attendanceCount(FICTICIA_1, FICTICIA_ROUNDS, [{ id: "a", cup_round_id: "r-i1", status: "concluida" }], "2027-03-10")!;
  // A adiada continua a contar (não está cancelada) e a pista também.
  assertEquals([f.rule, f.total, f.required, f.done, f.missing, f.ahead, f.canMiss], ["melhores_n", 5, 4, 1, 3, 4, 1]);
  assertEquals(f.rounding, null);
  const t = attendanceCount({ ...FICTICIA_1, counting_rule: "todas", counting_value: null }, FICTICIA_ROUNDS, [], "2027-01-01")!;
  assertEquals([t.required, t.canMiss], [5, 0]);
  assertEquals(attendanceCount({ ...CASCAIS_34, counting_rule: null }, onzeJornadas(), [], "2027-01-01"), null);
  assertEquals(attendanceCount({ ...CASCAIS_34, counting_value: null }, onzeJornadas(), [], "2027-01-01"), null);
  assertEquals(attendanceCount(null, onzeJornadas(), [], "2027-01-01"), null);
});

Deno.test("nextCupRound: a próxima por número, sem canceladas nem passadas; sem data conta", () => {
  assertEquals(nextCupRound(CASCAIS_ROUNDS, "2026-10-01")?.id, "r-c1");
  assertEquals(nextCupRound(CASCAIS_ROUNDS, "2027-01-11")?.id, "r-c3");
  // Depois da 4.ª: a 5.ª ainda sem data; a 6.ª está cancelada.
  assertEquals(nextCupRound(CASCAIS_ROUNDS, "2027-03-01")?.id, "r-c5");
  assertEquals(nextCupRound(CASCAIS_ROUNDS.filter((r) => r.id !== "r-c5"), "2027-03-01"), null);
  assertEquals(nextCupRound([], "2027-03-01"), null);
});

// ── §4.4: o prazo de inscrição ────────────────────────────────────────────

// Cascais: "quarta anterior às 24h", no fuso de Lisboa. A J3 é domingo,
// 24/01/2027 → o prazo é a meia-noite de quinta, 21/01 (inverno, UTC+0).
const PRAZO: EntryDeadlineInput = {
  entryMode: CASCAIS_34.entry_mode as string,
  entryBy: "atleta",
  decision: "vou",
  entryDoneAt: null,
  dateStatus: "confirmada",
  deadlineAt: "2027-01-21T00:00:00+00:00",
  now: "2027-01-17T10:00:00Z",
  timeZone: CASCAIS_34.time_zone as string,
};

Deno.test("entryDeadlineNotice: 'quarta às 24h' no inverno (UTC+0) e no verão (UTC+1)", () => {
  assertEquals(entryDeadlineNotice(PRAZO), { deadlineAt: "2027-01-21T00:00:00+00:00", whenLabel: "quarta às 24h", hoursLeft: 86 });
  // Verão: a meia-noite de Lisboa é 23:00 UTC. Lido em UTC dava "quarta às 23h".
  const verao = entryDeadlineNotice({ ...PRAZO, deadlineAt: "2027-05-05T23:00:00Z", now: "2027-05-02T10:00:00Z" });
  assertEquals(verao?.whenLabel, "quarta às 24h");
});

Deno.test("entryDeadlineNotice: hoje, amanhã, 18h30, e a uma semana sem ambiguidade", () => {
  assertEquals(entryDeadlineNotice({ ...PRAZO, now: "2027-01-20T09:00:00Z" })?.whenLabel, "hoje às 24h");
  assertEquals(entryDeadlineNotice({ ...PRAZO, now: "2027-01-19T21:00:00Z" })?.whenLabel, "amanhã às 24h");
  assertEquals(entryDeadlineNotice({ ...PRAZO, deadlineAt: "2027-01-20T18:30:00Z" })?.whenLabel, "quarta às 18h30");
  assertEquals(entryDeadlineNotice({ ...PRAZO, deadlineAt: "2027-01-20T18:00:00Z" })?.whenLabel, "quarta às 18h");
  // Quarta às 20h, com o prazo na quarta seguinte às 18h (6 dias e 22 horas):
  // "quarta" sozinho lia-se como hoje.
  assertEquals(entryDeadlineNotice({ ...PRAZO, deadlineAt: "2027-01-20T18:00:00Z", now: "2027-01-13T20:00:00Z" })?.whenLabel, "quarta da próxima semana às 18h");
  // No fuso da EDIÇÃO: a fictícia é dos Açores (UTC−1) — sexta às 18h locais.
  const ilha = entryDeadlineNotice({ ...PRAZO, entryMode: "por_jornada", timeZone: FICTICIA_1.time_zone as string, deadlineAt: "2027-03-05T19:00:00Z", now: "2027-03-01T10:00:00Z" });
  assertEquals(ilha?.whenLabel, "sexta às 18h");
  // Um fuso inválido cai no de Lisboa, sem rebentar.
  assertEquals(entryDeadlineNotice({ ...PRAZO, timeZone: "Marte/Olimpo" })?.whenLabel, "quarta às 24h");
});

Deno.test("entryDeadlineNotice: fora da janela, depois do prazo, prazo inválido → null; a janela configura-se", () => {
  assertEquals(entryDeadlineNotice({ ...PRAZO, now: "2027-01-13T23:59:00Z" }), null); // 7 dias e 1 minuto
  assertEquals(entryDeadlineNotice({ ...PRAZO, now: "2027-01-21T00:00:00Z" }), null); // no instante do prazo
  assertEquals(entryDeadlineNotice({ ...PRAZO, now: "2027-01-22T10:00:00Z" }), null);
  assertEquals(entryDeadlineNotice({ ...PRAZO, deadlineAt: null }), null);
  assertEquals(entryDeadlineNotice({ ...PRAZO, deadlineAt: "amanhã" }), null);
  // O push da Fase 5: 48 horas.
  assertEquals(entryDeadlineNotice({ ...PRAZO, windowHours: 48 }), null);
  assertEquals(entryDeadlineNotice({ ...PRAZO, windowHours: 48, now: "2027-01-19T10:00:00Z" })?.hoursLeft, 38);
  assertEquals(entryDeadlineNotice({ ...PRAZO, now: new Date("2027-01-17T10:00:00Z") })?.whenLabel, "quarta às 24h");
});

Deno.test("entryDeadlineNotice: só 'por_jornada', 'Vou', data confirmada, sem 'Já me inscrevi' e sem 'o meu clube'", () => {
  assertEquals(entryDeadlineNotice({ ...PRAZO, entryMode: FICTICIA_1.entry_mode as string }), null); // 'epoca'
  assertEquals(entryDeadlineNotice({ ...PRAZO, entryMode: null }), null);
  assertEquals(entryDeadlineNotice({ ...PRAZO, entryBy: "clube" }), null);
  assertEquals(entryDeadlineNotice({ ...PRAZO, entryDoneAt: "2027-01-18T08:00:00Z" }), null);
  for (const decision of ["nao_sei", "nao_vou", "nao_fui", null]) assertEquals(entryDeadlineNotice({ ...PRAZO, decision }), null, String(decision));
  for (const dateStatus of ["provavel", "adiada", "cancelada", null]) assertEquals(entryDeadlineNotice({ ...PRAZO, dateStatus }), null, String(dateStatus));
  // "Não sei" e sem resposta a "quem te inscreve?" contam como ele.
  assert(entryDeadlineNotice({ ...PRAZO, entryBy: "nao_sei" }));
  assert(entryDeadlineNotice({ ...PRAZO, entryBy: null }));
  assertEquals(entryDeadlineNotice(null), null);
});
