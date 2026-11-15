// O tempo de uma prova é possível? E o que conta para o balanço da Carol? —
// fórmula pura, partilhada pela app (@formulas) e pelo coach-chat.
//
// Bug de 2026-11-15: a atleta escreveu o tempo oficial «1:23» (1 h 23 min) e
// a app leu-o como 1 min 23 s (parseDurationToSeconds lê «a:b» como mm:ss).
// 83 s em 10,97 km são 7,6 s/km — e a Carol fez o balanço com eles («55:17
// abaixo da tua meta de 56:40»), mais a conquista «Objetivo batido».
//
// Regras do Rui (2026-11-15): um tempo é erro de entrada se
//   - o ritmo for mais rápido do que 2:40/km (o recorde do mundo dos 10 km
//     anda pelos 2:37/km: nenhum atleta da app lá chega), ou
//   - for menos de metade do objetivo ou da previsão do treino.
// Com um tempo assim não há factos nem conquistas: a Carol pede ao atleta para
// o confirmar («1:23 parece minutos — querias dizer 1:23:00?»).
// O teto (60 min/km) só trava o absurdo — um quilómetro vertical passa os 40.

export const MIN_RACE_PACE_SEC_PER_KM = 160;
export const MIN_RATIO_OF_REFERENCE = 0.5;
export const MAX_RACE_PACE_SEC_PER_KM = 3600;

export interface RaceTimeContext {
  distanceKm?: unknown;
  targetSeconds?: unknown;
  predictedSeconds?: unknown;
}

const pos = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** O tempo (s) é possível nesta prova? Sem distância nem referências, só se
 *  exige > 0. */
export function isPlausibleRaceSeconds(seconds: unknown, ctx: RaceTimeContext = {}): boolean {
  const s = pos(seconds);
  if (!s) return false;
  const km = pos(ctx.distanceKm);
  if (km) {
    const pace = s / km;
    if (pace < MIN_RACE_PACE_SEC_PER_KM || pace > MAX_RACE_PACE_SEC_PER_KM) return false;
  }
  for (const ref of [pos(ctx.targetSeconds), pos(ctx.predictedSeconds)]) {
    if (ref && s < ref * MIN_RATIO_OF_REFERENCE) return false;
  }
  return true;
}

/** O tempo que ele provavelmente queria dizer: «a:b» lido como mm:ss que,
 *  como h:mm (× 60), já é possível. null se nem assim. */
export function likelyIntendedRaceSeconds(seconds: unknown, ctx: RaceTimeContext = {}): number | null {
  const s = pos(seconds);
  if (!s || isPlausibleRaceSeconds(s, ctx)) return null;
  const asHours = Math.round(s * 60);
  return isPlausibleRaceSeconds(asHours, ctx) ? asHours : null;
}

/** h:mm:ss / m:ss (o formatDuration da app e o formatHms do coach-chat). */
export function formatRaceSeconds(total: number): string {
  const t = Math.round(total);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** A pergunta a fazer com um tempo impossível — a mesma no hub e na Carol. */
export function suspectRaceTimeQuestion(seconds: number, ctx: RaceTimeContext = {}): string {
  const intended = likelyIntendedRaceSeconds(seconds, ctx);
  const shown = formatRaceSeconds(seconds);
  return intended
    ? `${shown} parece minutos — querias dizer ${formatRaceSeconds(intended)}?`
    : `${shown} não bate certo com esta prova — confirmas o tempo?`;
}

/**
 * Lê o tempo de uma prova escrito à mão. «a:b» é mm:ss, a não ser que dê um
 * tempo impossível e h:mm dê um possível («1:23» numa prova de 11 km é
 * 1 h 23 min). «a:b:c» é sempre h:mm:ss; um número sozinho são minutos.
 */
export function parseRaceDuration(text: unknown, ctx: RaceTimeContext = {}): number | null {
  if (typeof text !== "string" && typeof text !== "number") return null;
  const str = String(text).trim().toLowerCase();
  if (!str) return null;
  const parts = str.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) {
    if (/^\d+(\.\d+)?\s*m(in)?$/.test(str)) return Math.round(parseFloat(str) * 60);
    return null;
  }
  const n = parts.map(Number);
  if (n.length === 1) return Math.round(n[0] * 60);
  if (n.length === 3) return Math.round(n[0] * 3600 + n[1] * 60 + n[2]);
  const asMinSec = Math.round(n[0] * 60 + n[1]);
  if (n[1] >= 60) return asMinSec;
  return likelyIntendedRaceSeconds(asMinSec, ctx) ?? asMinSec;
}

/**
 * A impressão digital do que conta para o balanço da prova: o tempo, a
 * distância, o objetivo e o tipo. O balanço guarda-a; se mudar (o atleta
 * corrigiu alguma coisa), refaz-se — os factos e as conquistas também.
 * Recebe o `race_outcome` (snake_case, o que vai para o coach-chat).
 */
export function raceBalanceFingerprint(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { official_seconds?: unknown; distance_km?: unknown; target_seconds?: unknown; race_type?: unknown };
  const sec = pos(o.official_seconds);
  const km = pos(o.distance_km);
  const target = pos(o.target_seconds);
  const type = typeof o.race_type === "string" ? o.race_type : "";
  return `v1|${sec ? Math.round(sec) : ""}|${km ? Math.round(km * 100) / 100 : ""}|${target ? Math.round(target) : ""}|${type}`;
}
