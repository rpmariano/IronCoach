// Os exercícios isométricos (#118, 2026-11-10: «30 reps» num hollow hold).
//
// Um classificador só, para o servidor (planPrescription.ts, analyze-gym,
// planExecution) e para a app (@formulas/isometric.ts, em vez das regex do
// gymSets.js): um isométrico prescreve-se e regista-se em SEGUNDOS por série.
//
// Positivos: prancha (e prancha lateral), plank, hollow hold, wall sit /
// cadeirinha / agachamento na parede, dead hang / suspensão na barra (só ela),
// L-sit, superman hold e tudo o que se diga «isométrico/a».
// Exclusões — a mesma palavra num exercício com movimento: elevação, remada,
// joelhos, pernas, flexão, TRX, jacks, toque(s), rocks («Elevação de pernas em
// suspensão na barra», «Prancha com toque nos ombros», «Plank jacks», «Hollow
// body rocks»).
// «Superman» sozinho é o exercício com repetições (estender e voltar): só
// «superman hold» é isométrico.

const W = "(?:^|[^a-zà-ú])";
const ISOMETRIC_RE = new RegExp(
  `${W}(?:prancha|plank|hollow|wall\\s*sit|cadeirinha|agachamento\\s+(?:isom[ée]trico\\s+)?na\\s+parede|cadeira\\s+(?:na\\s+)?parede|` +
    `dead\\s*hang|suspens[ãa]o\\s+na\\s+barra|l[\\s-]?sit|superman\\s+hold|isom[ée]tric)`,
  "i",
);
const MOVEMENT_RE = new RegExp(
  `${W}(?:eleva[çc][ãa]o|elevac|remada|joelhos?|pernas?|flex[ãa]o|flexoes|trx|jacks?|toques?|rocks?)(?![a-zà-ú])`,
  "i",
);

/** O exercício é isométrico: prescreve-se e regista-se em segundos por série. */
export function isIsometricExercise(name: unknown): boolean {
  if (typeof name !== "string" || !name.trim()) return false;
  return ISOMETRIC_RE.test(name) && !MOVEMENT_RE.test(name);
}
