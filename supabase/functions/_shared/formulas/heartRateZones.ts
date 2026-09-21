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

// ── FCmáx a partir dos prints (ação 5.4) ──────────────────────────────────
//
// Um relógio grava a FC máxima de cada corrida em details.max_heart_rate_bpm.
// A maior repetida nos últimos 12 meses é uma medida real, mais fiável do
// que Tanaka para quem já tem esse histórico — mas um sensor ótico dá picos
// isolados (artefactos de movimento), por isso um valor sem outro registo
// perto não conta sozinho.

export interface ObservedHrReading {
  bpm: number;
  date: string;
}

export interface ResolvedMaxHR {
  bpm: number;
  source: "tanaka" | "observada";
  /** A data da leitura, só quando source === "observada". */
  date: string | null;
}

const MIN_PLAUSIBLE_HR_BPM = 120;
const MAX_PLAUSIBLE_HR_BPM = 220;
/** Duas leituras "são a mesma FCmáx" se estiverem a 5 bpm ou menos uma da outra. */
const OPTICAL_SPIKE_TOLERANCE_BPM = 5;

/**
 * A FCmáx a usar: a maior repetida nos prints, senão a segunda maior (nunca
 * a maior isolada — pode ser um pico ótico), senão Tanaka a partir da idade.
 * Sem idade e sem leituras utilizáveis, devolve null — sem zona nenhuma,
 * nunca uma estimativa inventada.
 */
export function resolveMaxHR(age: number | null, observed: ObservedHrReading[] | null | undefined): ResolvedMaxHR | null {
  const plausible = (observed || []).filter((o) => Number.isFinite(o?.bpm) && o.bpm >= MIN_PLAUSIBLE_HR_BPM && o.bpm <= MAX_PLAUSIBLE_HR_BPM);
  const repeated = plausible.filter((o) => plausible.some((other) => other !== o && Math.abs(other.bpm - o.bpm) <= OPTICAL_SPIKE_TOLERANCE_BPM));
  let candidate: ObservedHrReading | null = null;
  if (repeated.length) {
    candidate = repeated.slice().sort((a, b) => b.bpm - a.bpm)[0];
  } else if (plausible.length >= 2) {
    candidate = plausible.slice().sort((a, b) => b.bpm - a.bpm)[1];
  }
  if (candidate) return { bpm: candidate.bpm, source: "observada", date: candidate.date };
  return age !== null ? { bpm: computeMaxHR(age), source: "tanaka", date: null } : null;
}

export interface ResolvedHrZones {
  zones: HeartRateZones;
  method: "karvonen" | "pctMax";
}

/** Karvonen com FC de repouso; sem ela, %FCmáx — a mesma escolha que já
 *  existia em coach-chat, agora reutilizável pelos três sítios. */
export function resolveHrZones(maxHRBpm: number, restingHrBpm: number | null | undefined): ResolvedHrZones {
  return restingHrBpm
    ? { zones: computeKarvonenZones(maxHRBpm, restingHrBpm), method: "karvonen" }
    : { zones: computePctMaxZones(maxHRBpm), method: "pctMax" };
}

/** Em que zona cai uma FC — as zonas são [min, max) exceto a Z5, que vai até
 *  ao topo inclusive; os limites são contíguos (z1[1] === z2[0]), por isso
 *  compara-se de cima para baixo. null abaixo da Z1 (recuperação total, fora
 *  das zonas de esforço) ou com um valor inválido. */
export function zoneOf(bpm: number, zones: HeartRateZones): "Z1" | "Z2" | "Z3" | "Z4" | "Z5" | null {
  if (!Number.isFinite(bpm)) return null;
  if (bpm >= zones.z5[0]) return "Z5";
  if (bpm >= zones.z4[0]) return "Z4";
  if (bpm >= zones.z3[0]) return "Z3";
  if (bpm >= zones.z2[0]) return "Z2";
  if (bpm >= zones.z1[0]) return "Z1";
  return null;
}
