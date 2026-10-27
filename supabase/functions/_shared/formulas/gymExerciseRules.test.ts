import { assert, assertEquals } from "jsr:@std/assert@1";
import { hasUpperBodyRestriction, repeatedExercises, strengthNames, upperBodyLoad, upperBodyLoadInText } from "./gymExerciseRules.ts";

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
