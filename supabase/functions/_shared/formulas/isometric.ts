// Os exercícios isométricos (#118, 2026-11-10: «30 reps» num hollow hold).
//
// Um classificador só, para o servidor (planPrescription.ts, analyze-gym,
// planExecution) e para a app (@formulas/isometric.ts, em vez das regex do
// gymSets.js): um isométrico prescreve-se e regista-se em SEGUNDOS por série.
//
// Testa-se o nome normalizado (foodKey: minúsculas, sem acentos, hífens e
// pontuação a espaços — «Wall-sit» é «wall sit»).
//   1. «isometric…»/«isometria» escrito passa à frente de tudo («Remada
//      isométrica», «Flexão isométrica», «Isometria de glúteo»).
//   2. Positivos: prancha (e lateral, nos joelhos), plank, hollow, wall sit /
//      cadeirinha / agachamento na parede, dead hang / suspensão (passiva) na
//      barra, L-sit, copenhagen e qualquer «… hold» (superman, pallof, glute
//      bridge).
//   3. Exclusões — a mesma palavra num exercício com movimento: elevação,
//      remada, flexão, TRX, jacks, toques/taps, rocks, push-up, dinâmica,
//      rotação, saltos, up and down, dips (e plurais); «joelhos» e «pernas»
//      excluem fora de uma prancha («Elevação de joelhos em suspensão»), mas
//      não a «Prancha com joelhos apoiados».
//   «Superman» sozinho tem repetições (estender e voltar): só «superman hold».

import { foodKey } from "./foodKey.ts";

const EXPLICIT_RE = /(?:^| )isometri/;
const POSITIVE_RE = new RegExp(
  "(?:^| )(?:prancha|plank|hollow|wall sit|cadeirinha|agachamento na parede|cadeira (?:na )?parede|dead hang|" +
    "suspensao (?:passiva )?na barra|l sit|copenhagen|hold)(?: |$)",
);
const MOVEMENT_RE = new RegExp(
  "(?:^| )(?:elevac(?:ao|oes)|remadas?|flex(?:ao|oes)|trx|jacks?|toques?|taps?|rocks?|push up|pushups?|dinamicas?|" +
    "rotac(?:ao|oes)|saltos?|up and down|dips?)(?: |$)",
);
const LEGS_RE = /(?:^| )(?:joelhos?|pernas?)(?: |$)/;
const PLANK_RE = /(?:^| )(?:prancha|plank)(?: |$)/;

/** O exercício é isométrico: prescreve-se e regista-se em segundos por série. */
export function isIsometricExercise(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const key = foodKey(name);
  if (!key) return false;
  if (EXPLICIT_RE.test(key)) return true;
  if (!POSITIVE_RE.test(key) || MOVEMENT_RE.test(key)) return false;
  return !(LEGS_RE.test(key) && !PLANK_RE.test(key));
}
