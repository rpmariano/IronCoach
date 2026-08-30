// T1 — Zonas de frequência cardíaca: FCmáx (Tanaka) + zonas (Karvonen ou
// %FCmáx). Fórmulas puras, sem cópias a eliminar — já era sítio único
// (coach-chat/index.ts). Movida por consistência arquitetural, não por
// bug (specs/formulas-checklist.md Fase C/E).
//
// @doutrina specs/coach-investigacao.md Corrida 2.2 #4
// FCmáx por Tanaka (208 − 0,7 × idade), mais defensável que a fórmula
// clássica 220 − idade. Zonas preferencialmente por Karvonen (FC de
// reserva, precisa de FC de repouso); sem FC de repouso, cai-se para
// %FCmáx simples, menos preciso.

export function computeMaxHR(age: number): number {
  return Math.round(208 - 0.7 * age);
}

export interface HeartRateZones {
  z1: [number, number];
  z2: [number, number];
  z3: [number, number];
  z4: [number, number];
  z5: [number, number];
}

// Karvonen (FC de reserva) — zona = FCrepouso + %×(FCmáx − FCrepouso).
export function computeKarvonenZones(maxHR: number, restingHR: number): HeartRateZones {
  const reserve = maxHR - restingHR;
  const z = (pct: number) => Math.round(restingHR + pct * reserve);
  return {
    z1: [z(0.50), z(0.60)],
    z2: [z(0.60), z(0.70)],
    z3: [z(0.70), z(0.80)],
    z4: [z(0.80), z(0.90)],
    z5: [z(0.90), maxHR],
  };
}

// %FCmáx simples — fallback sem FC de repouso conhecida.
export function computePctMaxZones(maxHR: number): HeartRateZones {
  const z = (pct: number) => Math.round(maxHR * pct);
  return {
    z1: [z(0.50), z(0.60)],
    z2: [z(0.60), z(0.70)],
    z3: [z(0.70), z(0.80)],
    z4: [z(0.80), z(0.90)],
    z5: [z(0.90), maxHR],
  };
}
