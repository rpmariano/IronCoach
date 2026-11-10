import { assertEquals } from "jsr:@std/assert@1";
import { isIsometricExercise } from "./isometric.ts";

// #118: um classificador só, para o servidor e para a app.
Deno.test("isIsometricExercise: os positivos", () => {
  for (const n of [
    "Prancha", "Prancha lateral", "Plank", "Side plank", "Hollow hold", "Hollow body hold", "Wall sit", "Cadeirinha",
    "Agachamento na parede", "Dead hang", "Suspensão na barra", "L-sit", "L sit", "Superman hold", "Ponte isométrica",
    "Agachamento isométrico", "Copenhagen plank",
  ]) assertEquals(isIsometricExercise(n), true, n);
});

Deno.test("isIsometricExercise: as exclusões — a mesma palavra num exercício com movimento", () => {
  for (const n of [
    "Elevação de pernas em suspensão na barra", "Prancha com toque nos ombros", "Plank jacks", "Hollow body rocks",
    "Elevação de joelhos em suspensão", "Remada em prancha", "Flexão em prancha", "Prancha TRX", "Pernas em L-sit",
    // «Superman» sozinho tem repetições (estender e voltar): só «superman hold» conta.
    "Superman", "Superman 3×12",
    // E os que nunca foram isométricos.
    "Agachamento", "Ponte de glúteos", "Peso morto romeno", "", null, 3,
  ]) assertEquals(isIsometricExercise(n), false, String(n));
});
