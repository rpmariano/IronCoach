// Os exercícios isométricos (#118, 2026-11-10: «30 reps» num hollow hold).
//
// Um classificador só, para o servidor (planPrescription.ts, analyze-gym,
// planExecution) e para a app (@formulas/isometric.ts, em vez das regex do
// gymSets.js): um isométrico prescreve-se e regista-se em SEGUNDOS por série.
//
// Testa-se o nome normalizado (foodKey: minúsculas, sem acentos, hífens e
// pontuação a espaços — «Wall-sit» é «wall sit»), por esta ordem:
//   1. «isometric…»/«isometria» escrito: isométrico («Remada isométrica»).
//   2. «… hold» (palavra «hold», menos «hold and press»): isométrico —
//      «Pull-up hold», «Push-up hold», «Dip hold», «Pallof hold», «Glute bridge
//      hold», «Superman hold», «Hollow hold com pernas estendidas».
//   3. Um movimento no nome exclui: elevação, remada/row, flexão, push-up,
//      pull-up, dips, TRX, jacks, toques/taps, rock(s), dinâmica, rotação,
//      saltos/jumps, up and down, cotovelo/elbow, «ao peito», alternada, caminhada,
//      deslocamento, walk/walkout, raise, lift, pike, saw, reach, crunch,
//      climbers, crawl, spiderman, downward (e plurais) — «Prancha com joelho ao
//      cotovelo», «Plank walk», «Side plank hip raise», «Copenhagen adductor raise».
//   4. Positivos: prancha, plank, hollow, wall sit(s) / wall squat /
//      cadeirinha / agachamento ou cadeira na parede, dead hang / bar hang /
//      passive hang / suspensão (passiva, na barra), L-sit. O copenhagen só
//      com plank/prancha ou hold; «superman» só com hold.
//
// isStrongIsometric: os isométricos sem dúvida — a conversão automática de
// reps em segundos só se faz neles (planPrescription.ts). Num nome ambíguo,
// uma unidade inventada é pior do que um «30 reps» num hollow.

import { foodKey } from "./foodKey.ts";

const EXPLICIT_RE = /(?:^| )isometri/;
/** «Agachamento com pausa isométrica», «… com isometria»: um exercício de reps
 *  com uma pausa — não é isométrico (revisão de 1a481508). */
const PAUSE_RE = /(?:^| )(?:pausas?|com isometria)(?: |$)/;
const HOLD_RE = /(?:^| )hold(?: |$)/;
const HOLD_AND_PRESS_RE = /(?:^| )hold and press(?: |$)/;
const MOVEMENT_RE = new RegExp(
  "(?:^| )(?:elevac(?:ao|oes)|remadas?|rows?|flex(?:ao|oes)|push ?ups?|pull ?ups?|chin ?ups?|dips?|trx|jacks?|toques?|taps?|rocks?|" +
    "dinamicas?|rotac(?:ao|oes)|rotations?|saltos?|jumps?|up and down|cotovelos?|elbows?|ao peito|alternad[ao]s?|caminhadas?|" +
    "deslocamentos?|walks?|walkouts?|raises?|lifts?|pikes?|saws?|reach(?:es)?|crunch(?:es)?|climbers?|crawls?|spiderman|downward|" +
    "tucks?|abduc(?:ao|oes))(?: |$)",
);
const POSITIVE_RE = new RegExp(
  "(?:^| )(?:prancha|plank|hollow|wall sits?|wall squats?|cadeirinha|agachamento na parede|cadeira (?:na )?parede|" +
    "dead hangs?|bar hangs?|passive hangs?|suspensao|l sit)(?: |$)",
);
const STRONG_RE = new RegExp(
  "^(?:prancha(?: lateral)?|(?:side |front )?plank|hollow(?: body)? hold|wall sits?|cadeirinha|agachamento na parede|" +
    "dead hangs?|suspensao(?: passiva)? na barra(?: fixa)?|l sit)$",
);

/** O exercício é isométrico: prescreve-se e regista-se em segundos por série. */
export function isIsometricExercise(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const key = foodKey(name);
  if (!key) return false;
  if (PAUSE_RE.test(key)) return false;
  if (EXPLICIT_RE.test(key)) return true;
  if (HOLD_RE.test(key) && !HOLD_AND_PRESS_RE.test(key)) return true;
  if (MOVEMENT_RE.test(key)) return false;
  return POSITIVE_RE.test(key);
}

/** Um isométrico sem dúvida possível (o nome é só ele, ou diz «isométric…»):
 *  só nestes as reps de uma prescrição se leem como segundos. */
export function isStrongIsometric(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const key = foodKey(name);
  if (!key || PAUSE_RE.test(key)) return false;
  // «Isométric…» só é forte sem movimento no nome («Remada isométrica» é
  // isométrica pelo nome, mas não converte reps: revisão de 1a481508).
  return STRONG_RE.test(key) || (EXPLICIT_RE.test(key) && !MOVEMENT_RE.test(key));
}
