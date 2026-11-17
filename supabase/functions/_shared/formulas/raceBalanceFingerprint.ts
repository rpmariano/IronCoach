// A impressão digital do que conta para o balanço da prova — fórmula pura,
// partilhada pela app (@formulas, a cópia local do hub) e pelo coach-chat (o
// carimbo no coach_proactive_log).
//
// Regra do Rui (2026-11-15): se alguma coisa da prova ou da corrida dela mudar
// — o tempo oficial (ou a duração, que o substitui sem ele), a distância, o
// objetivo, o tipo —, a Carol recalcula tudo: o balanço, os factos, as
// conquistas. O balanço guarda esta impressão; se a de agora for outra,
// refaz-se e substitui o anterior. Recebe o `race_outcome` (snake_case, o que
// vai para o coach-chat).
//
// A regra do tempo impossível NÃO é esta: é raceTimeSanity.ts (checkRaceTime).

const pos = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function raceBalanceFingerprint(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { official_seconds?: unknown; distance_km?: unknown; target_seconds?: unknown; race_type?: unknown };
  const sec = pos(o.official_seconds);
  const km = pos(o.distance_km);
  const target = pos(o.target_seconds);
  const type = typeof o.race_type === "string" ? o.race_type : "";
  return `v1|${sec ? Math.round(sec) : ""}|${km ? Math.round(km * 100) / 100 : ""}|${target ? Math.round(target) : ""}|${type}`;
}
