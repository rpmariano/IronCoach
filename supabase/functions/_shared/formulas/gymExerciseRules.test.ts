import { assert, assertEquals } from "jsr:@std/assert@1";
import { hasUpperBodyRestriction, heavyLegExercises, repeatedExercises, strengthNames, upperBodyLoad, upperBodyLoadInText, wantsMuscleGain } from "./gymExerciseRules.ts";

Deno.test("hasUpperBodyRestriction: a nota do Rui e variantes; outras categorias ou sem negação não contam", () => {
  const lim = (note: string) => [{ category: "limitacao_fisica", note }];
  assert(hasUpperBodyRestriction(lim("Retoma do ginásio mantendo a restrição de não realizar exercícios de braços no ginásio.")));
  assert(hasUpperBodyRestriction(lim("Sem exercícios de membros superiores até nova ordem")));
  assert(hasUpperBodyRestriction(lim("evitar carga nos ombros")));
  assert(!hasUpperBodyRestriction(lim("Joelho direito sensível em descidas")));
  assert(!hasUpperBodyRestriction(lim("Gosta de treinar braços à sexta")));
  assert(!hasUpperBodyRestriction([{ category: "preferencia_alimentar", note: "sem braços de polvo" }]));
  assert(!hasUpperBodyRestriction(null));
});

Deno.test("hasUpperBodyRestriction: negar um problema não é restrição; a mão conta (revisão do lote)", () => {
  const lim = (note: string) => [{ category: "limitacao_fisica", note }];
  assert(!hasUpperBodyRestriction(lim("Sem dores nos ombros; joelho esquerdo sensível")));
  assert(!hasUpperBodyRestriction(lim("Não tem problemas nos braços")));
  assert(!hasUpperBodyRestriction(lim("Sem queixas nos pulsos.")));
  assert(hasUpperBodyRestriction(lim("Evitar carga na mão esquerda")));
  assert(hasUpperBodyRestriction(lim("Sem dores nos joelhos. Nada de carga nos braços.")));
});

Deno.test("upperBodyLoad: proibidos com a restrição", () => {
  for (const name of [
    "Prancha", "Prancha lateral", "Plank", "Flexões", "Supino plano", "Remada sentada", "Remo ergómetro", "Puxada à frente",
    "Goblet squat", "Lunges com halteres", "Agachamento com barra", "Kettlebell swing", "Peso morto romeno", "Curl de bíceps",
    "Press de ombros", "Elevações laterais", "Bird dog", "Mountain climbers", "Pallof press", "Burpees", "Step-up com carga",
    // Revisão do lote:
    "Chest press", "Press de peito", "Peitoral na máquina", "Pec deck", "Overhead press", "Military press", "Arnold press",
    "Lateral raise", "Front raise", "Tricep pushdown", "Skull crusher", "Pullover", "Crossover", "Cruzamento na polia",
    "Abdução na polia", "Kickback no cabo", "Elevações", "TRX row", "Elíptica", "Elliptical", "Air bike", "Assault bike",
    "Ski erg", "Natação", "Swimming", "Piscina 20 min", "Trenó", "Sled push",
  ]) assert(upperBodyLoad(name), `devia ser proibido: ${name}`);
});

Deno.test("upperBodyLoad: válidos com a restrição", () => {
  for (const name of [
    "Leg press", "Hip thrust na máquina", "Ponte de glúteos", "Abdutora", "Adutora", "Step-ups", "Lunges", "Búlgaro sem carga",
    "Peso morto a uma perna sem carga", "Elevação de gémeos", "Gêmeos na máquina", "Dead bug", "Hollow hold", "Cadeira extensora",
    "Cadeira flexora", "Leg curl", "Curl femoral", "Bicicleta estacionária", "Passadeira", "Canelas", "Nórdico assistido",
    "Elevações de gémeos", "Elevação de calcanhares", "Butterfly kicks",
  ]) assertEquals(upperBodyLoad(name), null, name);
});

Deno.test("upperBodyLoadInText: só orações sem negação; partes do corpo sozinhas não contam", () => {
  assertEquals(upperBodyLoadInText("Aquecer 5 min. Depois 3x10 de goblet squat")?.why, "peso nas mãos");
  assertEquals(upperBodyLoadInText("Acabar com 2 min de prancha")?.why, "apoio ou força nas mãos");
  assertEquals(upperBodyLoadInText("Sem halteres: lunges com as mãos na anca. Nada de pranchas."), null);
  assertEquals(upperBodyLoadInText("Ombros descontraídos, descida em 3 s"), null);
  assertEquals(upperBodyLoadInText(null), null);
});

Deno.test("revisão final do lote: elevação de pernas deitado é core; equipamento solto só conta no nome; buracos; negação mais longa", () => {
  // 1. Core válido; só as suspensas carregam os braços.
  for (const ok of ["Elevação de pernas deitado", "Elevações de pernas no chão", "Elevação de joelhos deitado"]) assertEquals(upperBodyLoad(ok), null, ok);
  for (const bad of ["Elevação de pernas suspenso", "Elevações de joelhos nas paralelas", "Hanging leg raise", "Elevações na barra"]) {
    assert(upperBodyLoad(bad), `devia ser proibido: ${bad}`);
  }
  // 2. Numa nota, disco/barra/saco não são peso nas mãos; no nome, são.
  for (const t of ["Hip thrust na máquina com disco", "Segura a barra de apoio no búlgaro", "Saco de areia nos pés para o dead bug"]) {
    assertEquals(upperBodyLoadInText(t), null, t);
  }
  assert(upperBodyLoad("Lunges com disco") && upperBodyLoad("Agachamento com barra"));
  assertEquals(upperBodyLoadInText("Depois 3x8 de goblet squat")?.why, "peso nas mãos");
  // 3. Buracos.
  for (const bad of ["Push press", "Muscle-up", "Arm ergometer", "Ergómetro de braços", "Hand grip", "Handgrip", "Agachamento frontal", "Front squat"]) {
    assert(upperBodyLoad(bad), `devia ser proibido: ${bad}`);
  }
  // 4. Negação com mais palavras pelo meio.
  const lim = (note: string) => [{ category: "limitacao_fisica", note }];
  assert(!hasUpperBodyRestriction(lim("Sem nenhum tipo de problema nos ombros")));
  assert(hasUpperBodyRestriction(lim("Retoma do ginásio mantendo a restrição de não realizar exercícios de braços no ginásio.")));
});

Deno.test("strengthNames: só força, normalizado, sem repetidos; lixo dá []", () => {
  assertEquals(strengthNames({ blocks: [
    { type: "cardio", name: "Bicicleta" }, { type: "forca", name: "Cadeira  Extensora" }, { type: "forca", name: "cadeira extensora" },
    { type: "forca", name: "Gémeos" }, null, { type: "forca" },
  ] }), ["cadeira extensora", "gemeos"]);
  assertEquals(strengthNames(null), []);
  assertEquals(strengthNames({ blocks: "x" }), []);
});

Deno.test("repeatedExercises: mais de metade em comum é a mesma sessão", () => {
  const rui = ["cadeira extensora", "cadeira flexora", "gemeos na maquina"];
  assertEquals(repeatedExercises(rui, rui), rui);
  assertEquals(repeatedExercises(["a", "b", "c", "d"], ["a", "b", "e", "f"]), null); // 2 de 4: varia o bastante
  assertEquals(repeatedExercises(["a", "b", "c", "d"], ["a", "b", "c", "f"]), ["a", "b", "c"]);
  assertEquals(repeatedExercises(["a"], ["a"]), null); // uma sessão de um exercício não se compara
});

Deno.test("wantsMuscleGain: memória (objetivo/preferência, sem negação) ou massa magra alvo acima da última medida", () => {
  const note = (category: string, n: string) => [{ category, note: n }];
  assert(wantsMuscleGain(note("objetivo_pessoal", "Quer ganhar massa muscular este inverno"), null, null)?.startsWith("memória"));
  assert(wantsMuscleGain(note("preferencia_treino", "Gosta de treino de hipertrofia"), null, null));
  assert(wantsMuscleGain(note("objetivo_pessoal", "Ficar mais forte: força nas pernas e no tronco"), null, null));
  assert(wantsMuscleGain(note("objetivo_pessoal", "Quer aumentar a força máxima no agachamento"), null, null));
  assert(wantsMuscleGain(note("objetivo_pessoal", "Ganhar força este bloco"), null, null));
  // «Força» sozinha é o treino de força de qualquer corredor, não um objetivo de massa.
  assertEquals(wantsMuscleGain(note("preferencia_treino", "Faz treino de força 2x por semana"), null, null), null);
  assertEquals(wantsMuscleGain(note("objetivo_pessoal", "Manter a força enquanto prepara a maratona"), null, null), null);
  assertEquals(wantsMuscleGain(note("objetivo_pessoal", "Não quer ganhar massa, só correr"), null, null), null);
  assertEquals(wantsMuscleGain(note("limitacao_fisica", "Sem força na mão esquerda"), null, null), null);
  assertEquals(wantsMuscleGain(note("objetivo_pessoal", "Baixar para 72 kg até à maratona"), null, null), null);
  assert(wantsMuscleGain([], { goal_lean_body_mass_kg: 62 }, 60)?.startsWith("perfil"));
  assertEquals(wantsMuscleGain([], { goal_lean_body_mass_kg: 60 }, 60), null); // manter não é ganhar
  assertEquals(wantsMuscleGain([], { goal_lean_body_mass_kg: 62 }, null), null); // sem medida, sem comparação
  assertEquals(wantsMuscleGain(null, null, null), null);
});

Deno.test("heavyLegExercises: pernas a ≤ 6 reps; tronco superior, pernas a 8+ e cardio não", () => {
  assertEquals(heavyLegExercises({ blocks: [
    { type: "forca", name: "Agachamento", sets: 5, reps: 5 }, { type: "forca", name: "Peso morto romeno", sets: 4, reps: 6 },
    { type: "forca", name: "Leg press", sets: 3, reps: 10 }, { type: "forca", name: "Supino", sets: 5, reps: 5 },
    { type: "cardio", name: "Bicicleta", duration_min: 10 }, null,
  ] }), ["Agachamento", "Peso morto romeno"]);
  assertEquals(heavyLegExercises(null), []);
});

Deno.test("revisão de a93b2773..61665b38: restrição com verbo de causa, massa só muscular, negação por oração, saltos/isometria, elevações na barra", () => {
  const lim = (note: string) => [{ category: "limitacao_fisica", note }];
  // 1. Com um verbo de causa pelo meio é restrição.
  for (const t of ["Evitar exercícios que causem dor nos ombros", "Evitar movimentos que agravem a lesão do ombro", "Não fazer nada que provoque dor no ombro esquerdo"]) {
    assert(hasUpperBodyRestriction(lim(t)), t);
  }
  assert(!hasUpperBodyRestriction(lim("Sem nenhum tipo de problema nos ombros")));
  assert(!hasUpperBodyRestriction(lim("Sem dores nos ombros")));
  // 2. Massa gorda, corporal e o índice não são objetivo de massa.
  const obj = (n: string) => [{ category: "objetivo_pessoal", note: n }];
  for (const t of ["Baixar a massa gorda para 15%", "Perder 3 kg de massa gorda", "Quer melhorar o índice de massa corporal", "Manter a massa muscular durante a maratona"]) {
    assertEquals(wantsMuscleGain(obj(t), null, null), null, t);
  }
  assert(wantsMuscleGain(obj("Quer ganhar massa"), null, null));
  // 7. A negação só vale na oração dela; todas as ocorrências contam.
  assert(wantsMuscleGain(obj("Maratona sem lesões e ganhar massa muscular"), null, null));
  assert(wantsMuscleGain(obj("Não quer perder massa muscular, mas quer hipertrofia nos ombros"), null, null));
  assertEquals(wantsMuscleGain(obj("Não quer ganhar massa"), null, null), null);
  // 4. Saltos e isometria não são pesados; 1 «rep» também não.
  assertEquals(heavyLegExercises({ blocks: [
    { type: "forca", name: "Saltos à caixa", sets: 4, reps: 5 }, { type: "forca", name: "Jump squat", sets: 3, reps: 5 },
    { type: "forca", name: "Agachamento isométrico", sets: 3, reps: 1 }, { type: "forca", name: "Wall sit", sets: 3, reps: 2 },
    { type: "forca", name: "Agachamento", sets: 3, reps: 1 }, { type: "forca", name: "Agachamento", sets: 5, reps: 5 },
  ] }), ["Agachamento"]);
  // 6. Elevações na barra numa nota.
  assert(upperBodyLoadInText("Acabar com elevações de pernas na barra 3x10"));
  assert(upperBodyLoadInText("Elevações de joelhos na barra fixa"));
  assertEquals(upperBodyLoadInText("Elevação de pernas deitado 3x12"), null);
});

Deno.test("revisão do lote 6024d2bc: «e» entre nomes, causa só com verbo de causa, negação até à vírgula/«mas»", () => {
  const obj = (n: string) => [{ category: "objetivo_pessoal", note: n }];
  const lim = (n: string) => [{ category: "limitacao_fisica", note: n }];
  // 4. «Sem perder força e massa muscular» é manter, não ganhar.
  assertEquals(wantsMuscleGain(obj("Sem perder força e massa muscular"), null, null), null);
  assertEquals(wantsMuscleGain(obj("Manter massa muscular"), null, null), null);
  assert(wantsMuscleGain(obj("Maratona sem lesões e ganhar massa muscular"), null, null));
  // 5. «que» sem verbo de causa não faz a restrição.
  assert(!hasUpperBodyRestriction(lim("Sem problemas que afetem os ombros")));
  for (const t of ["Evitar exercícios que causem dor nos ombros", "Evitar movimentos que agravem a lesão do ombro", "Não fazer nada que provoque dor no ombro esquerdo"]) {
    assert(hasUpperBodyRestriction(lim(t)), t);
  }
  // 6. A negação acaba na vírgula ou no «mas».
  assert(hasUpperBodyRestriction(lim("Sem lesões, mas evitar carga nos ombros")));
  assert(hasUpperBodyRestriction(lim("Sem lesões mas evitar carga nos ombros")));
  assert(!hasUpperBodyRestriction(lim("Sem dores nos ombros, joelho sensível")));
});

Deno.test("revisão de fa525453: o «e» lido no texto todo — ganhar depois de uma negação noutra oração é objetivo", () => {
  const obj = (n: string) => [{ category: "objetivo_pessoal", note: n }];
  for (const t of [
    "Sem lesões e ganhar força", "Correr sem dores e aumentar a força", "Sem lesões e ganhar peso", "Manter a corrida e ganhar volume",
    "Não perder velocidade e ficar mais forte", "Sem lesões e mais massa muscular", "Correr sem lesões e hipertrofia",
    "Maratona sem lesões e ganhar massa muscular",
  ]) assert(wantsMuscleGain(obj(t), null, null), t);
  for (const t of ["Sem perder força e massa muscular", "Manter massa muscular", "Não quer ganhar massa", "Não é para ganhar massa"]) {
    assertEquals(wantsMuscleGain(obj(t), null, null), null, t);
  }
});

Deno.test("revisão de fa525453: a vírgula não corta a restrição; «más» não é «mas»; impedir é causa", () => {
  const lim = (n: string) => [{ category: "limitacao_fisica", note: n }];
  assert(hasUpperBodyRestriction(lim("Evitar peso excessivo, sobretudo nos ombros")));
  assert(hasUpperBodyRestriction(lim("Restrição médica, ombro esquerdo")));
  assert(hasUpperBodyRestriction(lim("Evitar más posturas com carga nos ombros")));
  assert(hasUpperBodyRestriction(lim("Sem lesões, mas evitar carga nos ombros")));
  assert(hasUpperBodyRestriction(lim("Não fazer nada que impeça a recuperação do ombro")));
  assert(!hasUpperBodyRestriction(lim("Sem dores nos ombros, joelho sensível")));
  assert(!hasUpperBodyRestriction(lim("Sem problemas que afetem os ombros")));
});
