import { assertEquals } from "jsr:@std/assert@1";
import { isIsometricExercise, isStrongIsometric } from "./isometric.ts";

// #118: um classificador só, para o servidor e para a app. Os nomes são os da
// revisão de fa7e1a66 (o script dela) e das anteriores.
const ISO = [
  "Prancha", "Prancha lateral", "PRANCHA", "Prancha nos joelhos", "Prancha com joelhos apoiados", "Plank", "Side plank", "Front plank",
  "Bear plank", "Plank hold", "Hollow hold", "Hollow body hold", "Wall sit", "Wall-sit", "Wall sits", "Cadeirinha", "Agachamento na parede",
  "Agachamento isométrico", "Cadeira na parede", "Dead hang", "Dead-hang", "Suspensão na barra", "Suspensao na barra",
  "Suspensão passiva na barra", "Suspensão na barra fixa", "L-sit", "L sit", "Superman hold", "Pallof hold", "Glute bridge hold",
  "Ponte de glúteo isométrica", "Ponte isométrica", "Isometria de glúteo", "Remada isométrica", "Flexão isométrica", "Copenhagen plank",
  "Prancha de Copenhaga", "Pull-up hold", "Chin-up hold", "Push-up hold", "Dip hold", "Plate pinch hold", "Farmer hold",
  "Hollow hold com pernas estendidas", "Wall sit uma perna", "Cadeirinha a uma perna", "Bar hang", "Passive hang", "Wall squat",
  "Isometric split squat hold", "Bird dog hold", "Prancha RKC", "Prancha alta", "Prancha em antebraços", "Side plank (joelhos)",
  "Hollow hold pernas fletidas", "Single leg glute bridge hold", "Suspensão passiva", "Prancha lateral com perna elevada",
];
const MOV = [
  "Elevação de pernas em suspensão na barra", "Elevação de joelhos em suspensão", "Elevações de joelhos em suspensão",
  "Prancha com toque nos ombros", "Prancha com toques", "Plank jacks", "Hollow body rocks", "Hollow rock", "Superman", "Superman 3×12",
  "Plank shoulder taps", "Plank to push-up", "Plank up and down", "Prancha up and down", "Prancha com remada", "Prancha com remadas",
  "Prancha com flexões", "Flexão em prancha", "Renegade row", "Plank hip dips", "Side plank dips", "Prancha dinâmica", "Prancha com rotação",
  "Side plank rotation", "Side plank with rotation", "Side plank hip raise", "Plank walk", "Plank walkout", "Plank leg raise",
  "Plank with leg lift", "Plank knee to elbow", "Plank saw", "Plank reach", "Plank jumps", "Prancha com saltos", "Prancha TRX",
  "Mountain climbers", "Pallof press", "Glute bridge", "Ponte de glúteo", "Ponte de glúteos", "Copenhagen", "Copenhagen adductor raise",
  "Copenhagen hip adduction", "Hanging leg raise", "Hanging knee raise", "Agachamento", "Remada", "Flexões", "Push-ups", "Dips", "Supino",
  "Wall ball", "Wall walk", "Barra fixa", "Pull-up", "Elevação lateral", "Abdominais", "Crunch", "Bicicleta abdominal", "Russian twist",
  "Toques nos calcanhares", "Heel taps", "Prancha com elevação de perna", "Prancha com elevação de braço", "Prancha alternada", "Bear crawl",
  "Spiderman plank", "Plank pike", "Plank to downward dog", "Hold and press", "Kettlebell swing", "Hollow body crunch",
  "Superman com rotação", "L-sit pull-up", "Joelhos ao peito", "Prancha com joelho ao cotovelo", "Prancha lateral com rotação",
  "Prancha com toque no pé", "Wall sit com elevação de calcanhares", "Dead hang pull-up", "Prancha com deslocamento",
  "Prancha caminhada", "Escalador", "Peso morto romeno", "", null, 3,
];

Deno.test("isIsometricExercise: os isométricos", () => {
  for (const n of ISO) assertEquals(isIsometricExercise(n), true, n);
});

Deno.test("isIsometricExercise: os que têm movimento (ou nunca foram isométricos)", () => {
  for (const n of MOV) assertEquals(isIsometricExercise(n), false, String(n));
});

Deno.test("isStrongIsometric: só o nome sem dúvida — é aí que as reps passam a segundos", () => {
  for (const n of ["Prancha", "Prancha lateral", "Plank", "Side plank", "Front plank", "Hollow hold", "Hollow body hold", "Wall sit", "Wall-sit",
    "Cadeirinha", "Agachamento na parede", "Dead hang", "Suspensão na barra", "Suspensão passiva na barra", "L-sit", "Remada isométrica"]) {
    assertEquals(isStrongIsometric(n), true, n);
  }
  // Isométricos, mas com o nome a dizer mais do que o exercício: não se convertem.
  for (const n of ["Prancha com joelhos apoiados", "Pallof hold", "Glute bridge hold", "Bird dog hold", "Wall sit uma perna", "Prancha RKC",
    "Bear plank", "Copenhagen plank", "Superman hold", "Plank walk", "Agachamento", "", null]) {
    assertEquals(isStrongIsometric(n), false, String(n));
  }
});
