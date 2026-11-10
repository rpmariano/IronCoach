import { assertEquals } from "jsr:@std/assert@1";
import { isIsometricExercise } from "./isometric.ts";

// #118: um classificador só, para o servidor e para a app.
Deno.test("isIsometricExercise: os positivos", () => {
  for (const n of [
    "Prancha", "Prancha lateral", "PRANCHA", "Plank", "Side plank", "Hollow hold", "Hollow body hold", "Wall sit", "Wall-sit",
    "Cadeirinha", "Agachamento na parede", "Dead hang", "Suspensão na barra", "Suspensao na barra", "Suspensão passiva na barra",
    "L-sit", "L sit", "Superman hold", "Pallof hold", "Glute bridge hold", "Copenhagen", "Copenhagen plank",
    // «isometric…» escrito passa à frente das exclusões.
    "Ponte isométrica", "Agachamento isométrico", "Remada isométrica", "Flexão isométrica", "Isometria de glúteo",
    // Os joelhos não excluem uma prancha.
    "Prancha com joelhos apoiados", "Prancha nos joelhos",
  ]) assertEquals(isIsometricExercise(n), true, n);
});

Deno.test("isIsometricExercise: as exclusões — a mesma palavra num exercício com movimento", () => {
  for (const n of [
    "Elevação de pernas em suspensão na barra", "Elevações de joelhos em suspensão", "Elevação de joelhos em suspensão",
    "Prancha com toque nos ombros", "Prancha com toques", "Plank jacks", "Hollow body rocks",
    "Prancha com remadas", "Prancha com remada", "Prancha com flexões", "Flexão em prancha", "Plank shoulder taps",
    "Plank to push-up", "Prancha dinâmica", "Prancha com rotação", "Prancha up and down", "Side plank dips", "Prancha com saltos",
    "Prancha TRX", "Pernas em L-sit",
    // «Superman» sozinho tem reps (estender e voltar): só «superman hold» conta.
    "Superman", "Superman 3×12",
    // E os que nunca foram isométricos.
    "Agachamento", "Ponte de glúteos", "Peso morto romeno", "Remada", "", null, 3,
  ]) assertEquals(isIsometricExercise(n), false, String(n));
});
