// Formatação de ritmo (pace) — o formato canónico da app é com DOIS PONTOS
// ("5:20" = 5 min 20 s por km), em toda a app e na Carol.
//
// @doutrina src/utils/run.js (formatPace) — "o ritmo é SEMPRE apresentado
// com dois pontos" (decisão do Rui, 2026-11-26; specs/formulas-checklist.md).
// Antes era com ponto ("5.20", Fase D); o ponto lia-se como um decimal
// (5,2 minutos) e chocava com os tempos h:mm:ss, que já usavam dois pontos.
//
// @contexto Fase F: a Fase D unificou os três formatos que existiam no
// FRONTEND, mas deixou duas cópias por fechar do lado do backend —
// `coach-chat/index.ts` tinha `formatPaceMinKm` (byte-equivalente ao
// `formatPace` de run.js) e `formatPace` (variante de 2 argumentos). Ambas
// delegam aqui, e o backend mostra o mesmo formato que o atleta vê no ecrã.
//
// ARREDONDAMENTO (corrigido a 2026-11-26): arredonda-se o TOTAL de segundos
// antes de partir em minutos e segundos, por isso 299,7 s dá "5:00" e nunca
// "4:60" (a limitação que vinha das duas implementações originais).

/** Segundos por km → "5:20". Devolve "" para valores em falta/zero. */
export function formatPaceMinKm(secondsPerKm: number | null | undefined): string {
  if (!secondsPerKm) return "";
  const total = Math.round(secondsPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Distância + duração → "5:20/km". Devolve null quando não dá para calcular. */
export function formatPaceFromDistance(
  distanceKm: number | null | undefined,
  durationSeconds: number | null | undefined,
): string | null {
  if (!distanceKm || !durationSeconds || distanceKm <= 0) return null;
  return `${formatPaceMinKm(durationSeconds / distanceKm)}/km`;
}
