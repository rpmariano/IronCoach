// Formatação de ritmo (pace) — o formato canónico da app é com PONTO
// ("5.20" = 5 min 20 s por km), não com dois pontos.
//
// @doutrina src/utils/run.js:104 — "o ritmo é SEMPRE apresentado com ponto",
// unificado em toda a UI na Fase D (specs/formulas-checklist.md).
//
// @contexto Fase F: a Fase D unificou os três formatos que existiam no
// FRONTEND, mas deixou duas cópias por fechar do lado do backend —
// `coach-chat/index.ts` tinha `formatPaceMinKm` (byte-equivalente ao
// `formatPace` de run.js) e `formatPace` (variante de 2 argumentos que
// ainda devolvia o formato ANTIGO com dois pontos, "5:20/km", na lista de
// corridas que a Carol lê). Ambas passam a delegar aqui, e o backend passa
// a mostrar o mesmo formato que o atleta vê no ecrã.
//
// LIMITAÇÃO CONHECIDA (portada tal como estava, não introduzida aqui): com
// segundos fracionários ≥ 59,5 o arredondamento produz "4.60" em vez de
// "5.00" — as duas implementações originais tinham exatamente o mesmo
// comportamento. Corrigir muda o valor apresentado, por isso fica como
// decisão à parte, documentada em specs/formulas-checklist.md.

/** Segundos por km → "5.20". Devolve "" para valores em falta/zero. */
export function formatPaceMinKm(secondsPerKm: number | null | undefined): string {
  if (!secondsPerKm) return "";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}.${s.toString().padStart(2, "0")}`;
}

/** Distância + duração → "5.20/km". Devolve null quando não dá para calcular. */
export function formatPaceFromDistance(
  distanceKm: number | null | undefined,
  durationSeconds: number | null | undefined,
): string | null {
  if (!distanceKm || !durationSeconds || distanceKm <= 0) return null;
  return `${formatPaceMinKm(durationSeconds / distanceKm)}/km`;
}
