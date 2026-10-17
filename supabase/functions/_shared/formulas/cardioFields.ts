// Os campos de um exercício de cardio no ginásio: tempo, distância, voltas.
//
// @contexto Registo unificado ligado ao plano (specs/plano-registo-plano-coach.md
// §2.4, decisão 4): os campos que se mostram dependem do exercício. A
// bicicleta pede tempo e km; a piscina, tempo e voltas. Usado no servidor
// (propose_training_plan, para completar `fields` de um bloco de cardio que
// venha sem eles) e na app (o editor de séries, via @formulas) — um só
// ficheiro, sem cópia.
//
// A correspondência é por palavra-chave sobre foodKey(nome) — sem acentos,
// minúsculas —, para "Bicicleta estática", "bike" e "Spinning" darem o mesmo.
// Um exercício que não se reconhece devolve null: quem chama decide (o
// editor mostra tempo e os botões "+ km / + voltas").

import { foodKey } from "./foodKey.ts";

export const CARDIO_FIELDS = ["duration", "distance", "laps"] as const;
export type CardioField = typeof CARDIO_FIELDS[number];

export type CardioSpec = {
  fields: CardioField[];
  /** Unidade em que a distância se mostra; grava-se sempre em km. */
  distanceUnit: "km" | "m";
};

const CATALOG: { keys: string[]; spec: CardioSpec }[] = [
  { keys: ["bicicleta", "bike", "ciclismo", "spinning", "cycling"], spec: { fields: ["duration", "distance"], distanceUnit: "km" } },
  { keys: ["passadeira", "treadmill", "eliptica", "elliptical", "escada", "stairmaster"], spec: { fields: ["duration", "distance"], distanceUnit: "km" } },
  { keys: ["remo", "rowing", "rower", "ergometro"], spec: { fields: ["duration", "distance"], distanceUnit: "m" } },
  { keys: ["piscina", "natacao", "nadar", "swim"], spec: { fields: ["duration", "laps"], distanceUnit: "m" } },
  { keys: ["corda", "burpee", "jumping jack", "skipping", "circuito", "rondas"], spec: { fields: ["duration", "laps"], distanceUnit: "km" } },
];

/** Os campos de cardio deste exercício, ou null se não o conhece. */
export function cardioSpecFor(name: unknown): CardioSpec | null {
  const key = foodKey(name);
  if (!key) return null;
  const words = ` ${key} `;
  for (const { keys, spec } of CATALOG) {
    if (keys.some((k) => words.includes(` ${k}`))) return { fields: [...spec.fields], distanceUnit: spec.distanceUnit };
  }
  return null;
}

/** Só os valores válidos, pela ordem canónica, sem repetidos. */
export function normalizeCardioFields(raw: unknown): CardioField[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.filter((f): f is string => typeof f === "string").map((f) => f.trim()));
  return CARDIO_FIELDS.filter((f) => set.has(f));
}
