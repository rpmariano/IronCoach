// Simulação de percursos completos do plano — ver specs/plano-de-treino.md.
//
// Ao contrário dos mocks de index.test.ts, que devolvem valores fixos e
// ignoram o nome das colunas, este ficheiro monta um Supabase FALSO COM
// ESTADO: guarda as linhas, aplica os filtros a sério (eq/neq/gte/lte/in),
// e devolve o que ficou lá. É essa diferença que apanha bugs de nome de
// coluna — o bug real de `day` vs `planned_date` passava despercebido nos
// mocks rasos porque .eq() descartava o nome da coluna.
//
// Cada teste é um PERCURSO do atleta, não uma unidade isolada: propor plano
// → aceitar → juntar sugestões alimentares → substituir, pela ordem em que
// isso acontece na app.

import { assertEquals, assert } from "jsr:@std/assert@1";
import { runProposeTrainingPlan, runSaveMealSuggestions, buildPlanContext } from "./index.ts";

// ─── Supabase falso com estado ───────────────────────────────────────────
// Suporta as formas de query que o coach-chat usa, incluindo o select
// aninhado `coach_plan_items(kind)` de que replace_active_plan depende.

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function createFakeDb(seed: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = {
    coach_plans: [...(seed.coach_plans ?? [])],
    coach_plan_items: [...(seed.coach_plan_items ?? [])],
  };
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${++counter}`;

  function makeQuery(table: string, op: string, payload?: Row | Row[]) {
    const filters: ((r: Row) => boolean)[] = [];
    let cols = "";
    let orderCol: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    let done = false;
    let result: { data: Row[]; error: null } = { data: [], error: null };

    const matching = () => db[table].filter((r) => filters.every((f) => f(r)));

    // Expande selects aninhados do tipo "coach_plan_items(kind)".
    const expand = (row: Row): Row => {
      const nested = cols.match(/(\w+)\s*\(([^)]*)\)/);
      if (!nested) return row;
      const [, childTable] = nested;
      const children = (db[childTable] ?? []).filter((c) => c.plan_id === row.id);
      return { ...row, [childTable]: children };
    };

    const exec = () => {
      if (done) return result;
      done = true;

      if (op === "insert") {
        const rows = Array.isArray(payload) ? payload : [payload as Row];
        const inserted = rows.map((r) => {
          const row = { id: r.id ?? nextId(table === "coach_plans" ? "plan" : "item"), ...r };
          db[table].push(row);
          return row;
        });
        result = { data: inserted, error: null };
        return result;
      }

      if (op === "update") {
        const hits = matching();
        for (const r of hits) Object.assign(r, payload);
        result = { data: hits, error: null };
        return result;
      }

      if (op === "delete") {
        const hits = matching();
        db[table] = db[table].filter((r) => !hits.includes(r));
        result = { data: hits, error: null };
        return result;
      }

      let rows = matching();
      if (orderCol) {
        rows = [...rows].sort((a, b) => {
          const x = a[orderCol!], y = b[orderCol!];
          if (x === y) return 0;
          return (x > y ? 1 : -1) * (orderAsc ? 1 : -1);
        });
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
      result = { data: rows.map(expand), error: null };
      return result;
    };

    const api: Row = {
      select(c: string) { cols = c ?? ""; return api; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return api; },
      neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return api; },
      gte(c: string, v: unknown) { filters.push((r) => r[c] >= (v as never)); return api; },
      lte(c: string, v: unknown) { filters.push((r) => r[c] <= (v as never)); return api; },
      in(c: string, vals: unknown[]) { filters.push((r) => vals.includes(r[c])); return api; },
      order(c: string, o?: { ascending?: boolean }) { orderCol = c; orderAsc = o?.ascending !== false; return api; },
      limit(n: number) { limitN = n; return api; },
      maybeSingle() { const r = exec(); return Promise.resolve({ data: r.data[0] ?? null, error: r.error }); },
      single() { const r = exec(); return Promise.resolve({ data: r.data[0] ?? null, error: r.error }); },
      // deno-lint-ignore no-explicit-any
      then(resolve: any, reject: any) { return Promise.resolve(exec()).then(resolve, reject); },
    };
    return api;
  }

  const sb = {
    from: (table: string) => ({
      select: (c: string) => makeQuery(table, "select").select(c),
      insert: (p: Row | Row[]) => makeQuery(table, "insert", p),
      update: (p: Row) => makeQuery(table, "update", p),
      delete: () => makeQuery(table, "delete"),
    }),
  };

  return { sb, db };
}

const USER = "user-1";
// Datas fixas no futuro para os planos contarem sempre como ativos, seja
// qual for o dia em que os testes correm.
const today = new Date().toISOString().slice(0, 10);
const plus = (n: number) => {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const trainingPlan = (overrides: Row = {}) => ({
  period_start: today,
  period_end: plus(6),
  summary: "4 treinos, base aeróbica",
  items: [
    { planned_date: today, kind: "corrida", training_type: "continuo", target_distance_km: 8 },
    { planned_date: plus(2), kind: "ginasio", categories: ["Pernas"] },
    { planned_date: plus(5), kind: "corrida", training_type: "longo", target_distance_km: 18 },
  ],
  ...overrides,
});

// Aceitar uma proposta, espelhando respondToPlan (src/store/index.js): é na
// aceitação — e só nela — que um plano marcado para substituir outro o
// substitui de facto.
function accept(db: Record<string, Row[]>, planId: string) {
  const p = db.coach_plans.find((x) => x.id === planId);
  if (!p) return;
  if (p.supersedes_plan_id) {
    const old = db.coach_plans.find((x) => x.id === p.supersedes_plan_id);
    if (old) {
      old.summary = p.summary || old.summary;
      if (p.period_start < old.period_start) old.period_start = p.period_start;
      if (p.period_end > old.period_end) old.period_end = p.period_end;
      // remove antigos no intervalo substituído
      db.coach_plan_items = db.coach_plan_items.filter(
        (i) => !(i.plan_id === old.id && i.planned_date >= p.period_start && i.planned_date <= p.period_end),
      );
      // reatribui novos itens ao plano antigo
      db.coach_plan_items.forEach((i) => {
        if (i.plan_id === p.id) i.plan_id = old.id;
      });
      // apaga o registo temporário da proposta
      db.coach_plans = db.coach_plans.filter((x) => x.id !== p.id);
      return;
    }
  }
  p.status = "aceite";
  p.accepted_at = new Date().toISOString();
}

// Recusar uma proposta — nunca toca no plano que ela pretendia substituir.
function refuse(db: Record<string, Row[]>, planId: string) {
  const p = db.coach_plans.find((x) => x.id === planId);
  if (p) p.status = "recusado";
}

// ─── PERCURSO A: propor → aceitar → juntar refeições dentro do período ───

Deno.test("PERCURSO A: sugestões alimentares dentro do plano aceite entram nos dias já existentes", async () => {
  const { sb, db } = createFakeDb();

  await runProposeTrainingPlan(sb, USER, trainingPlan());
  assertEquals(db.coach_plans.length, 1);
  assertEquals(db.coach_plans[0].status, "proposto");
  accept(db, db.coach_plans[0].id);

  // O atleta pede sugestões para dois dias que JÁ têm treino.
  const res = await runSaveMealSuggestions(sb, USER, {
    suggestions: [
      { date: today, meal: "Aveia ao pequeno-almoço, frango ao almoço." },
      { date: plus(2), meal: "Reforça hidratos ao jantar." },
    ],
  });

  assert(res.includes("gravadas"), `esperava sucesso, veio: ${res}`);
  // Não pode criar um plano novo — os dias já existem no plano ativo.
  assertEquals(db.coach_plans.length, 1);
  // Nem itens novos: as sugestões colam-se aos itens de treino existentes.
  assertEquals(db.coach_plan_items.length, 3);

  const d0 = db.coach_plan_items.find((i) => i.planned_date === today);
  assertEquals(d0!.kind, "corrida");
  assertEquals(d0!.meal_suggestion, "Aveia ao pequeno-almoço, frango ao almoço.");
});

Deno.test("PERCURSO A2: sugestão num dia SEM treino dentro do período cria item de descanso", async () => {
  const { sb, db } = createFakeDb();
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  accept(db, db.coach_plans[0].id);

  // plus(1) não tem treino nenhum no plano.
  await runSaveMealSuggestions(sb, USER, {
    suggestions: [{ date: plus(1), meal: "Dia leve — proteína ao jantar." }],
  });

  assertEquals(db.coach_plans.length, 1);
  assertEquals(db.coach_plan_items.length, 4);
  const novo = db.coach_plan_items.find((i) => i.planned_date === plus(1));
  assertEquals(novo!.kind, "descanso");
  assertEquals(novo!.plan_id, db.coach_plans[0].id);
  assertEquals(novo!.user_id, USER);
});

// ─── PERCURSO B: refeições primeiro, treino depois ───────────────────────

Deno.test("PERCURSO B: sem plano ativo, as sugestões criam o seu próprio plano proposto", async () => {
  const { sb, db } = createFakeDb();

  const res = await runSaveMealSuggestions(sb, USER, {
    suggestions: [
      { date: plus(1), meal: "Ovos e tosta." },
      { date: plus(3), meal: "Massa com atum." },
    ],
  });

  assert(res.includes("gravadas"), res);
  assertEquals(db.coach_plans.length, 1);
  assertEquals(db.coach_plans[0].status, "proposto");
  assertEquals(db.coach_plans[0].summary, "Sugestões alimentares do Coach");
  assertEquals(db.coach_plans[0].period_start, plus(1));
  assertEquals(db.coach_plans[0].period_end, plus(3));
  assertEquals(db.coach_plan_items.length, 2);
  assert(db.coach_plan_items.every((i) => i.kind === "descanso"));
});

Deno.test("PERCURSO B2: plano de refeições aceite e plano de treino coexistem", async () => {
  const { sb, db } = createFakeDb();

  await runSaveMealSuggestions(sb, USER, {
    suggestions: [{ date: plus(1), meal: "Ovos e tosta." }],
  });
  accept(db, db.coach_plans[0].id);

  await runProposeTrainingPlan(sb, USER, trainingPlan());
  accept(db, db.coach_plans[1].id);

  assertEquals(db.coach_plans.length, 2);
  assert(db.coach_plans.every((p) => p.status === "aceite"));
  // 1 item de refeição + 3 de treino
  assertEquals(db.coach_plan_items.length, 4);
});

// ─── PERCURSO C: substituir o plano ativo ────────────────────────────────

Deno.test("PERCURSO C: replace_active_plan recusa o plano de treino e poupa o de refeições", async () => {
  const { sb, db } = createFakeDb();

  // Plano de refeições aceite
  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(1), meal: "Ovos." }] });
  const mealPlanId = db.coach_plans[0].id;
  accept(db, mealPlanId);

  // Plano de treino aceite
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  const oldTrainingId = db.coach_plans[1].id;
  accept(db, oldTrainingId);

  // O atleta confirma que quer substituir o plano de treino.
  await runProposeTrainingPlan(sb, USER, {
    ...trainingPlan({ summary: "Plano novo" }),
    replace_active_plan: true,
  });
  const novoId = db.coach_plans[2].id;

  // Enquanto a proposta não for aceite, o plano antigo continua de pé.
  assertEquals(db.coach_plans.find((p) => p.id === oldTrainingId)!.status, "aceite");
  assertEquals(db.coach_plans[2].supersedes_plan_id, oldTrainingId);

  accept(db, novoId);

  const meal = db.coach_plans.find((p) => p.id === mealPlanId)!;
  const training = db.coach_plans.find((p) => p.id === oldTrainingId)!;

  assertEquals(training.status, "aceite", "ao aceitar, o plano de treino mantém-se como o plano ativo atualizado");
  assertEquals(training.summary, "Plano novo", "o resumo do plano ativo foi atualizado");
  assertEquals(meal.status, "aceite", "o plano de refeições não devia ser tocado");
  assertEquals(db.coach_plans.length, 2, "a proposta temporária foi incorporada e removida");
});

Deno.test("PERCURSO C2: sem replace_active_plan, o plano ativo fica intacto", async () => {
  const { sb, db } = createFakeDb();
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  const firstId = db.coach_plans[0].id;
  accept(db, firstId);

  await runProposeTrainingPlan(sb, USER, trainingPlan({ summary: "Outro" }));

  assertEquals(db.coach_plans.find((p) => p.id === firstId)!.status, "aceite");
  assertEquals(db.coach_plans.length, 2);
});

// ─── PERCURSO D: sugestões a cavalo do período do plano ──────────────────

Deno.test("PERCURSO D: sugestões dentro e fora do plano — dentro colam, fora criam plano novo", async () => {
  const { sb, db } = createFakeDb();
  await runProposeTrainingPlan(sb, USER, trainingPlan()); // today..plus(6)
  accept(db, db.coach_plans[0].id);

  await runSaveMealSuggestions(sb, USER, {
    suggestions: [
      { date: plus(2), meal: "Dentro do plano." },
      { date: plus(10), meal: "Fora do plano." },
    ],
  });

  assertEquals(db.coach_plans.length, 2, "o dia de fora devia gerar um plano proposto");
  const novo = db.coach_plans[1];
  assertEquals(novo.status, "proposto");
  assertEquals(novo.period_start, plus(10));
  assertEquals(novo.period_end, plus(10));

  // O de dentro colou-se ao item de ginásio que já lá estava.
  const dentro = db.coach_plan_items.find((i) => i.planned_date === plus(2) && i.plan_id === db.coach_plans[0].id);
  assertEquals(dentro!.kind, "ginasio");
  assertEquals(dentro!.meal_suggestion, "Dentro do plano.");
});

// ─── PERCURSO E: repetir a sugestão para o mesmo dia ─────────────────────

Deno.test("PERCURSO E: pedir sugestão duas vezes para o mesmo dia substitui, não duplica", async () => {
  const { sb, db } = createFakeDb();
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  accept(db, db.coach_plans[0].id);

  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(2), meal: "Primeira versão." }] });
  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(2), meal: "Segunda versão." }] });

  const doDia = db.coach_plan_items.filter((i) => i.planned_date === plus(2));
  assertEquals(doDia.length, 1, "não pode duplicar o item do dia");
  assertEquals(doDia[0].meal_suggestion, "Segunda versão.");
});

Deno.test("PERCURSO E2: repetir num dia SEM treino também não duplica o item de descanso", async () => {
  const { sb, db } = createFakeDb();
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  accept(db, db.coach_plans[0].id);

  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(1), meal: "Primeira." }] });
  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(1), meal: "Segunda." }] });

  const doDia = db.coach_plan_items.filter((i) => i.planned_date === plus(1));
  assertEquals(doDia.length, 1, "não pode duplicar o dia de descanso");
  assertEquals(doDia[0].meal_suggestion, "Segunda.");
});

// ─── PERCURSO F: o contexto que o Coach vê a seguir ──────────────────────

Deno.test("PERCURSO F: depois de aceitar, o contexto do Coach mostra o plano como ATIVO, não pendente", async () => {
  const { sb, db } = createFakeDb();
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  const planId = db.coach_plans[0].id;

  // Antes de aceitar: os itens são de um plano proposto.
  const pendentes = db.coach_plan_items.filter((i) => i.plan_id === planId);
  const ctxAntes = buildPlanContext(pendentes, [], today);
  assert(ctxAntes!.includes("PLANO PROPOSTO"), ctxAntes ?? "sem contexto");

  accept(db, planId);
  const ativos = db.coach_plan_items.filter((i) => i.plan_id === planId);
  const ctxDepois = buildPlanContext([], ativos, today);
  assert(ctxDepois!.includes("PLANO ACEITE EM CURSO"), ctxDepois ?? "sem contexto");
  // A sugestão alimentar aparece ao lado do treino, para o Coach não a repetir.
  assert(!ctxDepois!.includes("sugestão alimentar"), "ainda não há sugestões nenhumas");
});

Deno.test("PERCURSO F2: a sugestão alimentar aparece no contexto do plano ativo", async () => {
  const { sb, db } = createFakeDb();
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  accept(db, db.coach_plans[0].id);
  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: today, meal: "Aveia e banana." }] });

  const ativos = db.coach_plan_items.filter((i) => i.plan_id === db.coach_plans[0].id);
  const ctx = buildPlanContext([], ativos, today);
  assert(ctx!.includes("Aveia e banana."), `a sugestão devia estar no contexto: ${ctx}`);
});

// ─── PERCURSO G: validações ──────────────────────────────────────────────

Deno.test("PERCURSO G: uma sugestão sem data ou sem texto é ignorada, não rebenta", async () => {
  const { sb, db } = createFakeDb();
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  accept(db, db.coach_plans[0].id);

  const res = await runSaveMealSuggestions(sb, USER, {
    suggestions: [
      { date: plus(2), meal: "Válida." },
      { date: plus(3) },              // sem meal
      { meal: "Sem data." },          // sem date
    ],
  });

  assert(res.includes("gravadas"), res);
  assertEquals(db.coach_plan_items.filter((i) => i.meal_suggestion).length, 1);
});

Deno.test("PERCURSO G2: um plano proposto NÃO recebe sugestões — só o aceite conta", async () => {
  const { sb, db } = createFakeDb();
  // Proposto, nunca aceite.
  await runProposeTrainingPlan(sb, USER, trainingPlan());

  await runSaveMealSuggestions(sb, USER, {
    suggestions: [{ date: plus(2), meal: "Sugestão." }],
  });

  // Como não há plano ACEITE, a sugestão tem de criar um plano próprio em
  // vez de se colar ao proposto (que o atleta ainda pode recusar).
  assertEquals(db.coach_plans.length, 2);
  const doTreino = db.coach_plan_items.filter((i) => i.plan_id === db.coach_plans[0].id);
  assert(doTreino.every((i) => !i.meal_suggestion), "o plano proposto não devia ser tocado");
});

// ─── PERCURSO H: dois planos aceites ao mesmo tempo ──────────────────────
// runSaveMealSuggestions escolhe UM plano ativo (.limit(1), ordenado por
// period_start desc). Desde que aceitar passou a viver no chat e vários
// planos podem coexistir (treino + refeições), essa escolha pode cair no
// plano errado. Estes testes verificam se isso acontece.

Deno.test("PERCURSO H: sugestão para um dia do plano de TREINO quando há um plano de refeições mais recente", async () => {
  const { sb, db } = createFakeDb();

  // Plano de TREINO aceite: today..plus(6)
  await runProposeTrainingPlan(sb, USER, trainingPlan());
  const treinoId = db.coach_plans[0].id;
  accept(db, treinoId);

  // Plano de REFEIÇÕES aceite, a começar DEPOIS: plus(10)..plus(10)
  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(10), meal: "Fora." }] });
  const refeicoesId = db.coach_plans[1].id;
  accept(db, refeicoesId);

  const planosAntes = db.coach_plans.length;

  // Agora uma sugestão para um dia que está DENTRO do plano de treino.
  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(2), meal: "Dia de pernas." }] });

  const itemDoDia = db.coach_plan_items.filter((i) => i.planned_date === plus(2));
  assertEquals(itemDoDia.length, 1, "não devia criar um item paralelo para um dia que já existe no plano de treino");
  assertEquals(itemDoDia[0].plan_id, treinoId, "a sugestão devia colar-se ao item do plano de TREINO");
  assertEquals(itemDoDia[0].kind, "ginasio", "devia manter o treino de ginásio que lá estava");
  assertEquals(db.coach_plans.length, planosAntes, "não devia criar um plano novo");
});

Deno.test("PERCURSO H2: dia coberto por DOIS planos aceites sobrepostos não gera item duplicado", async () => {
  const { sb, db } = createFakeDb();

  // Dois planos de TREINO aceites, com períodos sobrepostos — plus(3) cai
  // dentro dos dois.
  await runProposeTrainingPlan(sb, USER, trainingPlan()); // today..plus(6)
  accept(db, db.coach_plans[0].id);

  await runProposeTrainingPlan(sb, USER, {
    period_start: plus(3),
    period_end: plus(9),
    summary: "Segundo bloco",
    items: [{ planned_date: plus(8), kind: "corrida", training_type: "continuo", target_distance_km: 5 }],
  });
  accept(db, db.coach_plans[1].id);

  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(3), meal: "Sugestão." }] });
  await runSaveMealSuggestions(sb, USER, { suggestions: [{ date: plus(3), meal: "Corrigida." }] });

  const doDia = db.coach_plan_items.filter((i) => i.planned_date === plus(3));
  assertEquals(doDia.length, 1, `um dia não pode ter dois itens: ${JSON.stringify(doDia)}`);
  assertEquals(doDia[0].meal_suggestion, "Corrigida.");
});

// ─── PERCURSO I: recusar a proposta de substituição ──────────────────────

Deno.test("PERCURSO I: recusar a substituição não pode deixar o atleta sem plano nenhum", async () => {
  const { sb, db } = createFakeDb();

  await runProposeTrainingPlan(sb, USER, trainingPlan());
  const antigoId = db.coach_plans[0].id;
  accept(db, antigoId);

  // O atleta confirma que quer substituir, o Coach propõe o novo...
  await runProposeTrainingPlan(sb, USER, {
    ...trainingPlan({ summary: "Plano novo" }),
    replace_active_plan: true,
  });
  const novoId = db.coach_plans[1].id;

  // ...mas ao ver a proposta, muda de ideias e RECUSA.
  refuse(db, novoId);

  const ativos = db.coach_plans.filter((p) => p.status === "aceite");
  assertEquals(
    ativos.length,
    1,
    "recusar a proposta nova devia deixar o plano antigo de pé — senão o atleta fica sem plano nenhum",
  );
  assertEquals(ativos[0].id, antigoId);
});

Deno.test("PERCURSO I2: aceitar a substituição deixa exatamente um plano de treino ativo", async () => {
  const { sb, db } = createFakeDb();

  await runProposeTrainingPlan(sb, USER, trainingPlan());
  const antigoId = db.coach_plans[0].id;
  accept(db, antigoId);

  await runProposeTrainingPlan(sb, USER, {
    ...trainingPlan({ summary: "Plano novo" }),
    replace_active_plan: true,
  });
  accept(db, db.coach_plans[1].id);

  const ativos = db.coach_plans.filter((p) => p.status === "aceite");
  assertEquals(ativos.length, 1, "não podem ficar dois planos de treino ativos");
  assertEquals(ativos[0].summary, "Plano novo");
});
