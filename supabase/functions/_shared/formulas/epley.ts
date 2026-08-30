// T1 — Estimativa de 1RM (Epley), fórmula pura. Já era sítio único
// (src/utils/biEngine.js) — movida por consistência arquitetural, não por
// bug (specs/formulas-checklist.md Fase C/E).
//
// 1RM = peso × (1 + reps/30) — Epley (1985), a fórmula mais usada para
// estimar a carga máxima a partir de uma série submáxima.

export function estimate1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}
