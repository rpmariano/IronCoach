import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { addDaysISO, buildDailySummaryContext, buildWarningsMessage, buildTomorrowPrepMessage, isFemale, computeBodyMetrics, computeTDEE, hhmmOf, checkinForSummary, treinoFalado } from "./index.ts";
import { assertCarolVoice } from "../_shared/carolTone.ts";

// P0-1 (specs/formulas-checklist.md): profiles.gender só grava 'M'/'F'.
// Antes desta correção, computeBodyMetrics/computeTDEE comparavam com
// "masculino"/"feminino", que nunca batiam certo — o TMB caía sempre no
// ramo feminino e o limiar RED-S ficava sempre em 8%.
Deno.test("isFemale reconhece 'F' (o valor real gravado em profiles.gender)", () => {
  assertEquals(isFemale("F"), true);
  assertEquals(isFemale("M"), false);
  assertEquals(isFemale(null), false);
  assertEquals(isFemale(undefined), false);
});

Deno.test("computeBodyMetrics: limiar RED-S é 8% para 'M', não sempre 16%", () => {
  const bodyAssessments = [{ date: "2026-08-11", body_fat_pct: 10, weight_kg: 75 }];
  const male = computeBodyMetrics(bodyAssessments, "M");
  assertEquals(male.hasRedSRisk, false); // 10% > 8% (limiar masculino) — sem risco
  const female = computeBodyMetrics(bodyAssessments, "F");
  assertEquals(female.hasRedSRisk, true); // 10% < 16% (limiar feminino) — risco
});

// Fase C (specs/formulas-checklist.md): weeklyWeightChange passou a delegar
// em ../_shared/formulas/weightTrend.ts (EWMA α≈0,25) em vez de uma
// regressão entre só o ponto mais recente e o mais antigo.
Deno.test("computeBodyMetrics: weeklyWeightChange usa a EWMA partilhada (weightTrend.ts)", () => {
  // bodyAssessments vem DESC da BD (mais recente primeiro).
  const bodyAssessments = [
    { date: "2026-08-11", body_fat_pct: 20, weight_kg: 79 },
    { date: "2026-08-04", body_fat_pct: 20, weight_kg: 80 },
  ];
  const result = computeBodyMetrics(bodyAssessments, "M");
  assertEquals(result.weeklyWeightChange, -1);
});

// Fase C (specs/formulas-checklist.md): o alerta de perda de peso rápida
// passou a delegar em ../_shared/formulas/weightLossRate.ts — era um
// limiar absoluto fixo (0,9 kg/semana para toda a gente); agora é %/semana
// por nível (doutrina Bloco 4.1 #5 / 4.2 #3), igual ao já correto em
// src/utils/biEngine.js.
Deno.test("computeBodyMetrics: limiar de perda de peso é por nível, não um kg/semana fixo", () => {
  // 80kg → 79,6kg numa semana = -0,4 kg/semana = 0,5% do peso (79,6kg).
  const bodyAssessments = [
    { date: "2026-08-11", weight_kg: 79.6 },
    { date: "2026-08-04", weight_kg: 80 },
  ];
  // Iniciante: limiar 0,7% — 0,5% está dentro, não dispara.
  const iniciante = computeBodyMetrics(bodyAssessments, "M", "iniciante");
  assertEquals(iniciante.weightLossTooFast, false);
  // Avançado: limiar 0,4% — 0,5% já dispara. O antigo limiar fixo de
  // 0,9 kg/semana nunca teria disparado aqui para ninguém.
  const avancado = computeBodyMetrics(bodyAssessments, "M", "avancado");
  assertEquals(avancado.weightLossTooFast, true);
});

Deno.test("computeBodyMetrics: com uma só medição, weeklyWeightChange fica null (não 0)", () => {
  const bodyAssessments = [{ date: "2026-08-11", body_fat_pct: 20, weight_kg: 79 }];
  const result = computeBodyMetrics(bodyAssessments, "M");
  assertEquals(result.weeklyWeightChange, null);
});

Deno.test("computeTDEE: BMR usa +5 para 'M' e -161 para 'F' (Mifflin-St Jeor)", () => {
  const base = { weight_kg: 75, height_cm: 175, birth_date: "1996-08-11" }; // idade = 30
  const bmrMale = 10 * 75 + 6.25 * 175 - 5 * 30 + 5;
  const bmrFemale = 10 * 75 + 6.25 * 175 - 5 * 30 - 161;
  // Fase C (P0-4, specs/formulas-checklist.md): fator único ×1,3 (era
  // ×1,55, sem custo de treino) — ver ../_shared/formulas/tdee.ts.
  assertEquals(computeTDEE({ ...base, gender: "M" }), Math.round(bmrMale * 1.3));
  assertEquals(computeTDEE({ ...base, gender: "F" }), Math.round(bmrFemale * 1.3));
  // As duas fórmulas têm de dar valores diferentes — se um dia colapsarem
  // ao mesmo número, o bug do P0-1 voltou.
  const tdeeM = computeTDEE({ ...base, gender: "M" })!;
  const tdeeF = computeTDEE({ ...base, gender: "F" })!;
  assertEquals(tdeeM > tdeeF, true);
});

Deno.test("computeTDEE: soma o custo do treino quando weeklyVolumeKm > 0 (P0-4)", () => {
  // 75kg, 40km/semana → custo = round(40×75/7) = round(428,57) = 429 kcal
  const base = { weight_kg: 75, height_cm: 175, birth_date: "1996-08-11", gender: "M" };
  const withoutRuns = computeTDEE(base, 0)!;
  const withRuns = computeTDEE(base, 40)!;
  assertEquals(withRuns - withoutRuns, 429);
});

// Ação P.12: texto determinístico (nunca passa pelo modelo), sem "⚠️", sem
// "Certifica-te", sem "Considera" — e as duas de água mantêm a palavra
// "água" de propósito (CarolCard.jsx:169 usa-a para não duplicar a frase).
Deno.test("buildWarningsMessage: as quatro frases, na voz dela — sem emoji, sem exclamação, sem frases de manual", () => {
  const planItem = [{ kind: "corrida", training_type: "longo", target_distance_km: 16 }];
  const semAgua = buildWarningsMessage(planItem, 0, 2500)!;
  assertStringIncludes(semAgua, "Para hoje tens agendado:");
  assertStringIncludes(semAgua, "Ainda não registaste água hoje.");
  assertCarolVoice(semAgua);

  const aguaParcial = buildWarningsMessage([], 800, 2500)!;
  assertStringIncludes(aguaParcial, "Registaste 800 ml de água — ainda não é metade da tua meta.");
  assertCarolVoice(aguaParcial);

  const redS = buildWarningsMessage([], 0, null, { hasRedSRisk: true, latestBodyFat: 7, gender: "M", weeklyWeightChange: null })!;
  assertStringIncludes(redS, "A tua gordura corporal está em 7%, abaixo dos 8% de segurança. É risco de RED-S. Fala com um profissional de saúde.");
  assertCarolVoice(redS);

  const bodyMetricsPerda = {
    hasRedSRisk: false, latestBodyFat: null, gender: "M", weeklyWeightChange: -1.2, weightLossTooFast: true, weightLossPct: 1.6,
  };
  // A causa (revisão de 2026-09-26): só se afirma com as duas provas — treino
  // recente e ingestão abaixo do gasto. Sem elas, a frase fica neutra.
  const perdaPeso = buildWarningsMessage([], 0, null, bodyMetricsPerda, null, { trainedRecently: true, ateBelowGasto: true })!;
  assertStringIncludes(perdaPeso, "Perda de peso rápida (1,2 kg/semana, 1,6% do peso). Não estás a comer o suficiente para o treino que fazes.");
  assertCarolVoice(perdaPeso);

  const perdaPesoSemCausa = buildWarningsMessage([], 0, null, bodyMetricsPerda)!;
  assertStringIncludes(perdaPesoSemCausa, "Estás a perder 1,2 kg por semana, 1,6% do peso. É rápido demais. Vemos a alimentação no chat.");
  assertCarolVoice(perdaPesoSemCausa);
  // Sem treinos recentes (ex.: 30 dias parado), mesmo com pouca comida: neutra.
  const semTreino = buildWarningsMessage([], 0, null, bodyMetricsPerda, null, { trainedRecently: false, ateBelowGasto: true })!;
  assertStringIncludes(semTreino, "Vemos a alimentação no chat.");

  assertEquals(buildWarningsMessage([], 0, null), null);
});

// Revisão de 2026-09-26: o check-in de hoje (dor alta ou dia em baixo) cala
// a frase do plano — o cliente já a substitui pela sua (carolCardLines.js,
// linhaDoTreinoDeHoje), esta é só para nunca a construir às cegas. E um item
// já concluído não é "para fazer".
Deno.test("buildWarningsMessage: com dor alta ou dia em baixo no check-in, sem a frase do plano; concluído não conta", () => {
  const planItem = [{ kind: "corrida", training_type: "longo", target_distance_km: 16 }];
  const comDor = buildWarningsMessage(planItem, 0, null, undefined, { dorAlta: true, diaEmBaixo: false });
  assertEquals(comDor, null);
  const emBaixo = buildWarningsMessage(planItem, 0, null, undefined, { dorAlta: false, diaEmBaixo: true });
  assertEquals(emBaixo, null);
  const semCheckin = buildWarningsMessage(planItem, 0, null)!;
  assertStringIncludes(semCheckin, "Para hoje tens agendado:");

  const concluido = buildWarningsMessage([{ ...planItem[0], status: "concluido" }], 0, null);
  assertEquals(concluido, null);
});

Deno.test("addDaysISO avança dias e atravessa meses", () => {
  assertEquals(addDaysISO("2026-08-11", 1), "2026-08-12");
  assertEquals(addDaysISO("2026-08-31", 1), "2026-09-01");
  assertEquals(addDaysISO("2026-01-01", -1), "2025-12-31");
});

const baseParams = {
  today: "2026-08-11",
  profile: {
    calorie_goal: 2500, protein_goal: 150, carbs_goal: 300, fat_goal: 80,
    water_goal_ml: 2000, dietary_restrictions: null, dietary_notes: null,
    experience_level: "medio",
  },
  todayMeals: [],
  todayWater: [],
  recentRuns: [],
  recentGym: [],
  planItems: [],
  nextRace: null,
};

Deno.test("sem restrições, restricoes_alimentares fica null", () => {
  const ctx = buildDailySummaryContext(baseParams);
  assertEquals(ctx.restricoes_alimentares, null);
});

Deno.test("restrições traduzem as chaves para rótulos legíveis", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    profile: { ...baseParams.profile, dietary_restrictions: ["vegetariano", "sem_lactose"] },
  });
  assertEquals(ctx.restricoes_alimentares?.restrictions, ["Vegetariano", "Sem lactose"]);
});

Deno.test("notas de alergia sozinhas já ativam o bloco de restrições", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    profile: { ...baseParams.profile, dietary_notes: "alergia a marisco" },
  });
  assertEquals(ctx.restricoes_alimentares?.notes, "alergia a marisco");
  assertEquals(ctx.restricoes_alimentares?.restrictions, []);
});

Deno.test("soma as refeições de hoje e arredonda os totais", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    todayMeals: [
      { meal_type: "almoco", meal_items: [{ quantity_grams: 200, calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 }] },
      { meal_type: "jantar", meal_items: [{ quantity_grams: 150, calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 }] },
    ],
  });
  assertEquals(ctx.hoje_ate_agora.refeicoes_registadas, ["Almoço", "Jantar"]);
  assertEquals(ctx.hoje_ate_agora.calorias, Math.round(200 * 1.65 + 150 * 1.30));
});

Deno.test("soma a água de hoje", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    todayWater: [{ amount_ml: 250 }, { amount_ml: 300 }],
  });
  assertEquals(ctx.hoje_ate_agora.agua_ml, 550);
});

Deno.test("separa os itens do plano em hoje/amanhã/depois de amanhã — chaves com data explícita", () => {
  // today = "2026-08-11", tomorrow = "2026-08-12", depois de amanhã = "2026-08-13"
  const ctx = buildDailySummaryContext({
    ...baseParams,
    planItems: [
      { planned_date: "2026-08-11", kind: "corrida" },
      { planned_date: "2026-08-12", kind: "ginasio" },
      { planned_date: "2026-08-13", kind: "descanso" },  // depois de amanhã — vai para o seu próprio balde
    ],
  }) as any;
  // As chaves incluem a data para que o modelo não confunda os dias
  assertEquals(ctx.plano_treino_hoje.itens.length, 1);
  assertEquals(ctx.plano_treino_amanha.itens.length, 1);
  assertEquals(ctx.plano_treino_depois_de_amanha.resumo, "Descanso");
  assertEquals(ctx.plano_treino_hoje.itens[0], { planned_date: "2026-08-11", kind: "corrida" });
  assertEquals(ctx.plano_treino_amanha.itens[0], { planned_date: "2026-08-12", kind: "ginasio" });
});

Deno.test("itens a partir de D+3 não entram em nenhum balde (fronteira da janela de 3 dias)", () => {
  const today = "2026-08-11";
  const ctx = buildDailySummaryContext({
    ...baseParams,
    today,
    planItems: [
      { planned_date: "2026-08-14", kind: "corrida" },  // D+3 — fora da janela
      { planned_date: "2026-08-20", kind: "ginasio" },   // bem fora da janela
    ],
  }) as any;
  assertEquals(ctx.plano_treino_hoje.itens.length, 0);
  assertEquals(ctx.plano_treino_amanha.itens.length, 0);
  assertEquals(ctx.plano_treino_depois_de_amanha.resumo, "Descanso (sem treinos planeados)");
});

Deno.test("regressão: ginásio amanhã e corrida depois de amanhã ficam em baldes separados", () => {
  // Bug reportado: o card dizia 'amanhã tens um dia duplo' quando havia
  // ginásio em D+1 e corrida em D+2 — o modelo tinha visibilidade de D+2
  // (via race/plan context) mas atribuiu os dois itens ao mesmo dia.
  // Fix: D+2 entra no contexto num balde PRÓPRIO (plano_treino_depois_de_amanha_*),
  // nunca junto do balde de amanhã — cada item só aparece no balde da sua
  // própria planned_date.
  const today = "2026-08-12";
  const tomorrow = "2026-08-13";
  const dayAfter = "2026-08-14";
  const ctx = buildDailySummaryContext({
    ...baseParams,
    today,
    planItems: [
      { planned_date: tomorrow, kind: "ginasio", categories: ["peito"] },
      { planned_date: dayAfter, kind: "corrida", training_type: "intervalos" },
    ],
  }) as any;
  // Amanhã só tem ginásio
  assertEquals(ctx.plano_treino_amanha.itens.length, 1);
  const amanha = ctx.plano_treino_amanha.itens;
  assertEquals(amanha[0].kind, "ginasio");
  // Hoje continua vazio
  assertEquals(ctx.plano_treino_hoje.itens.length, 0);
  // A corrida de D+2 aparece no SEU PRÓPRIO balde
  assertStringIncludes(ctx.plano_treino_depois_de_amanha.resumo, "Corrida (intervalos");
  // Confirma que os dois baldes nunca se misturam
  assertEquals(amanha.some((i: any) => i.kind === "corrida"), false);
});

Deno.test("sem refeições nem água, os totais de hoje ficam a zero, não undefined", () => {
  const ctx = buildDailySummaryContext(baseParams);
  assertEquals(ctx.hoje_ate_agora.calorias, 0);
  assertEquals(ctx.hoje_ate_agora.agua_ml, 0);
  assertEquals(ctx.hoje_ate_agora.refeicoes_registadas, []);
});

// ─── CAROL.md §3: semana cumprida a 100% → uma frase de reconhecimento ──────
import { computeLastWeekAdherence } from "./index.ts";
import { assertEquals as eqLastWeek } from "jsr:@std/assert@1";

Deno.test("computeLastWeekAdherence: corrida conta com corrida no dia, ginásio com sessão, descanso conta sempre", () => {
  const items = [
    { planned_date: "2026-09-07", kind: "corrida" },
    { planned_date: "2026-09-08", kind: "ginasio" },
    { planned_date: "2026-09-09", kind: "descanso" },
    { planned_date: "2026-09-10", kind: "corrida" },
  ];
  const runs = [{ date: "2026-09-07" }];
  const gym = [{ date: "2026-09-08" }];
  eqLastWeek(computeLastWeekAdherence(items, runs, gym), { itens: 4, com_registo: 3 });
  eqLastWeek(computeLastWeekAdherence(items, [...runs, { date: "2026-09-10" }], gym), { itens: 4, com_registo: 4 });
  eqLastWeek(computeLastWeekAdherence([], [], []), { itens: 0, com_registo: 0 });
});

Deno.test("buildDailySummaryContext: a véspera da prova entra no contexto quando lha dão", () => {
  const base = { today: "2026-09-12", profile: { weight_kg: 70 }, todayMeals: [], todayWater: [], recentRuns: [], recentGym: [], planItems: [], nextRace: { name: "Corrida do Tejo", date: "2026-09-13", distance_km: 10 } };
  // deno-lint-ignore no-explicit-any
  const ctx = buildDailySummaryContext({ ...base, vesperaDaProva: { quando: "amanhã", prova: "Corrida do Tejo", partida: "09:00" } } as any) as Record<string, unknown>;
  assertEquals((ctx.vespera_da_prova as Record<string, unknown>).partida, "09:00");
  // deno-lint-ignore no-explicit-any
  const semVespera = buildDailySummaryContext(base as any) as Record<string, unknown>;
  assertEquals(semVespera.vespera_da_prova, undefined);
});

Deno.test("hhmmOf: 'HH:MM:SS' do PostgREST vira 'HH:MM'; o resto é null", () => {
  assertEquals(hhmmOf("13:10:00"), "13:10");
  assertEquals(hhmmOf("7:05"), "07:05");
  assertEquals(hhmmOf(null), null);
  assertEquals(hhmmOf("lixo"), null);
});

// Check-in de hoje no recap (2026-09-23): as escalas em palavras e o
// veredicto já decidido, para o modelo não adivinhar onde fica a linha.
Deno.test("checkinForSummary: dormiu mal → dia_em_baixo; dor ≥4 → dor_alta", () => {
  const mal = checkinForSummary({ sleep: 2, energy: 3, stress: 4, pain: 0 });
  assertEquals(mal?.sono, "mau");
  assertEquals(mal?.stress, "tenso");
  assertEquals(mal?.dia_em_baixo, true);
  assertEquals(mal?.dor_alta, false);
  assertEquals(mal?.dor_local, null);

  const dor = checkinForSummary({ sleep: 4, energy: 4, stress: 2, pain: 5, pain_location: "joelho" });
  assertEquals(dor?.dia_em_baixo, false);
  assertEquals(dor?.dor_alta, true);
  assertEquals(dor?.dor_local, "joelho");
});

Deno.test("checkinForSummary: sem check-in (ou incompleto) não há bloco", () => {
  assertEquals(checkinForSummary(null), null);
  assertEquals(checkinForSummary({ sleep: 4, energy: null, stress: 2 }), null);
});

// ── A carga no cartão (pedido 2026-09-24) ───────────────────────────────────

Deno.test("o aviso de hoje nunca sugere mudar o plano por causa da carga", () => {
  const msg = buildWarningsMessage([{ kind: "corrida", training_type: "continuo", target_distance_km: 6 }], 0, null,
    { hasRedSRisk: false, latestBodyFat: null, gender: "M", weeklyWeightChange: null });
  assertEquals(msg, "Para hoje tens agendado: uma corrida contínua de 6 km.");
});

Deno.test("o contexto leva a leitura da carga e não leva o created_at das corridas", () => {
  const ctx = buildDailySummaryContext({
    ...baseParams,
    recentRuns: [{ date: "2026-09-24", distance_km: 5, created_at: "2026-09-24T15:36:19+00:00" }],
    acwr: { acute_km_per_day: 1.7, chronic_km_per_day: 0.8, ratio: null, segue_o_plano: true, conta_como_risco: false },
  });
  const runs = ctx.corridas_ultimos_30_dias as Array<Record<string, unknown>>;
  assertEquals(runs[0].created_at, undefined);
  assertEquals(runs[0].distance_km, 5);
  assertEquals((ctx.acwr as Record<string, unknown>).segue_o_plano, true);
});

// ── Números e treinos ditos como se dizem (revisão de 2026-09-26) ───────────

Deno.test("buildWarningsMessage: vírgula decimal no RED-S e na perda de peso, nunca ponto", () => {
  const redS = buildWarningsMessage([], 0, null, { hasRedSRisk: true, latestBodyFat: 7.5, gender: "M", weeklyWeightChange: null })!;
  assertEquals(redS, "A tua gordura corporal está em 7,5%, abaixo dos 8% de segurança. É risco de RED-S. Fala com um profissional de saúde.");
  const redSF = buildWarningsMessage([], 0, null, { hasRedSRisk: true, latestBodyFat: 14.2, gender: "F", weeklyWeightChange: null })!;
  assertStringIncludes(redSF, "está em 14,2%, abaixo dos 16% de segurança.");
  const perda = buildWarningsMessage([], 0, null, {
    hasRedSRisk: false, latestBodyFat: null, gender: "M", weeklyWeightChange: -0.9, weightLossTooFast: true, weightLossPct: 1.3,
  })!;
  assertEquals(perda, "Estás a perder 0,9 kg por semana, 1,3% do peso. É rápido demais. Vemos a alimentação no chat.");
  for (const t of [redS, redSF, perda]) {
    assertEquals(/\d\.\d/.test(t), false);
    assertCarolVoice(t);
  }
});

Deno.test("treinoFalado: o treino numa frase, com acentos e vírgula — nunca o enum cru", () => {
  assertEquals(treinoFalado({ kind: "corrida", training_type: "longo", target_distance_km: 18 }), "uma rodagem longa de 18 km");
  assertEquals(treinoFalado({ kind: "corrida", training_type: "continuo", target_distance_km: "10.5" }), "uma corrida contínua de 10,5 km");
  // Sem tipo, "Corrida (corrida, 8 km)" repetia a palavra.
  assertEquals(treinoFalado({ kind: "corrida", target_distance_km: 8 }), "uma corrida de 8 km");
  assertEquals(treinoFalado({ kind: "corrida", training_type: "recuperacao", target_duration_min: 30 }), "uma corrida de recuperação de 30 minutos");
  assertEquals(treinoFalado({ kind: "ginasio", categories: [] }), "um treino de ginásio");
  assertEquals(treinoFalado({ kind: "ginasio", categories: ["Pernas", "Core/Abdominais"], target_duration_min: 45 }), "um treino de pernas e core de 45 minutos");
  assertEquals(treinoFalado({ kind: "ginasio", categories: ["Pilates"] }), "uma aula de pilates");
  assertEquals(treinoFalado({ kind: "corrida", training_type: "intervalos", target_distance_km: 8 }, false), "treino intervalado de 8 km");
});

Deno.test("buildWarningsMessage: o plano de hoje sai em frase, sem enum nem ponto decimal", () => {
  const msg = buildWarningsMessage([
    { kind: "corrida", training_type: "longo", target_distance_km: 18.5 },
    { kind: "ginasio", categories: [], target_duration_min: 40 },
  ], 0, null)!;
  assertEquals(msg, "Para hoje tens agendado: uma rodagem longa de 18,5 km e um treino de ginásio de 40 minutos.");
  assertEquals(/continuo|Geral|\(corrida/.test(msg), false);
  assertCarolVoice(msg);
});

Deno.test("buildTomorrowPrepMessage: a dica é do treino de amanhã, não uma frase de manual", () => {
  assertEquals(
    buildTomorrowPrepMessage([{ kind: "corrida", training_type: "longo", target_distance_km: 18 }]),
    "Amanhã: rodagem longa de 18 km. Leva água ou um gel.",
  );
  // Abaixo de 15 km, uma longa não pede abastecimento.
  assertEquals(
    buildTomorrowPrepMessage([{ kind: "corrida", training_type: "longo", target_distance_km: 12 }]),
    "Amanhã: rodagem longa de 12 km.",
  );
  assertEquals(
    buildTomorrowPrepMessage([{ kind: "corrida", training_type: "intervalos", target_distance_km: 8 }]),
    "Amanhã: treino intervalado de 8 km.",
  );
  assertEquals(
    buildTomorrowPrepMessage([{ kind: "ginasio", categories: ["Peito"], target_duration_min: 45 }]),
    "Amanhã: treino de peito de 45 minutos.",
  );
  assertEquals(buildTomorrowPrepMessage([{ kind: "descanso" }]), null);
  assertEquals(buildTomorrowPrepMessage([{ kind: "corrida", training_type: "longo", target_distance_km: 18, status: "concluido" }]), null);
  for (const items of [[{ kind: "corrida", training_type: "continuo", target_distance_km: 8 }], [{ kind: "ginasio", categories: [] }]]) {
    const t = buildTomorrowPrepMessage(items)!;
    assertEquals(/Deixa|equipamento|sacola/.test(t), false);
    assertCarolVoice(t);
  }
});

// Fase 0 do Troféu (2026-09-26): a "proxima_prova" é o objetivo (a próxima
// principal); as provas de preparação antes dela vão à parte, como provas.
Deno.test("provas antes do objetivo: só aparecem quando existem, e a proxima_prova é a principal", () => {
  const principal = { id: "m1", name: "Maratona de Lisboa", date: "2026-10-11", distance_km: 42.195, race_priority: "a", race_type: "estrada" };
  const jornada = { id: "j1", name: "Jornada 1", date: "2026-08-16", distance_km: 10, race_priority: "c", race_type: "estrada" };
  const ctx = buildDailySummaryContext({ ...baseParams, nextRace: principal, racesBefore: [jornada] }) as Record<string, unknown>;
  assertEquals((ctx.proxima_prova as { id: string }).id, "m1");
  assertEquals(ctx.provas_antes_do_objetivo, [{ name: "Jornada 1", date: "2026-08-16", distance_km: 10, race_priority: "c" }]);
  assertEquals("provas_antes_do_objetivo" in (buildDailySummaryContext({ ...baseParams, nextRace: principal }) as Record<string, unknown>), false);
  assertEquals("provas_antes_do_objetivo" in (buildDailySummaryContext({ ...baseParams, nextRace: principal, racesBefore: [] }) as Record<string, unknown>), false);
});
