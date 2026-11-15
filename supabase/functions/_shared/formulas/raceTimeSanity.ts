/* Um tempo de prova impossível não se aceita (bug de 2026-11-15).

   O caso: 10 km, objetivo 56:40, a atleta escreveu «1:23» — o campo leu 1 min 23 s (m:ss), quando
   ela queria 1:23:00. Gravou-se uma prova a 8 s/km. Duas regras, as duas bloqueiam:

   1. Ritmo mais rápido do que 2:40/km — ritmo de elite mundial. Não é o recorde do mundo (o dos
      5 km anda pelos 2:34/km e o dos 10 km pelos 2:38/km), mas nenhum atleta da app lá chega: um
      tempo assim é erro de entrada (revisão pré-deploy de 2026-11-15).
   2. Menos de 50% da referência: o objetivo da prova ou, sem ele, a previsão.

   A frase explica o erro de entrada provável e sugere o valor: um «a:bb» que falha mas faria sentido
   como a:bb:00 → «1:23 parece minutos — querias dizer 1:23:00?».

   Partilhado: a app (registo da prova, na entrada e ao gravar) e o servidor usam esta regra. Sem
   imports, para correr igual em Deno e no Vite. */

export const WORLD_RECORD_PACE_FLOOR_S_PER_KM = 160; // 2:40/km
export const MIN_FRACTION_OF_REFERENCE = 0.5;

export type RaceTimeProblem = 'faster_than_world_record' | 'under_half_reference';

export type RaceTimeCheck =
  | { ok: true }
  | {
    ok: false;
    reason: RaceTimeProblem;
    message: string;
    suggestion: { seconds: number; text: string } | null;
  };

export interface RaceTimeInput {
  /** O tempo em segundos. Se vier `text`, é o texto que manda. */
  seconds?: number | null;
  /** O que o atleta escreveu (m:ss ou h:mm:ss) — é daqui que sai a sugestão. */
  text?: string | null;
  distanceKm?: number | null;
  /** O objetivo da prova ou, sem ele, a previsão (segundos). */
  referenceSeconds?: number | null;
}

/** m:ss ou h:mm:ss → segundos. Outra coisa → null. */
export function parseClock(text: string | null | undefined): number | null {
  const s = String(text ?? '').trim();
  if (!/^\d+(:\d{1,2}){1,2}$/.test(s)) return null;
  const parts = s.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** Segundos → m:ss ou h:mm:ss. */
export function formatClock(total: number): string {
  const t = Math.max(0, Math.round(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function problemOf(seconds: number, distanceKm: number | null, reference: number | null): RaceTimeProblem | null {
  if (distanceKm && distanceKm > 0 && seconds / distanceKm < WORLD_RECORD_PACE_FLOOR_S_PER_KM) return 'faster_than_world_record';
  if (reference && reference > 0 && seconds < reference * MIN_FRACTION_OF_REFERENCE) return 'under_half_reference';
  return null;
}

/** A regra. Sem tempo (ou sem distância e sem referência), não há o que recusar. */
export function checkRaceTime(input: RaceTimeInput): RaceTimeCheck {
  const text = input.text != null ? String(input.text).trim() : '';
  const seconds = text ? parseClock(text) : (Number.isFinite(input.seconds) ? Number(input.seconds) : null);
  if (!seconds || seconds <= 0) return { ok: true };
  const distanceKm = Number(input.distanceKm) > 0 ? Number(input.distanceKm) : null;
  const reference = Number(input.referenceSeconds) > 0 ? Number(input.referenceSeconds) : null;

  const reason = problemOf(seconds, distanceKm, reference);
  if (!reason) return { ok: true };

  // «a:bb» lido como minutos e segundos; a:bb:00 é o mais provável quando faz sentido.
  const shown = text || formatClock(seconds);
  const parts = shown.split(':');
  if (parts.length === 2) {
    const asHours = Number(parts[0]) * 3600 + Number(parts[1]) * 60;
    // E plausível: não mais lento do que 20 min/km, nem do que o triplo da referência.
    const plausible = (!distanceKm || asHours / distanceKm <= 1200) && (!reference || asHours <= reference * 3);
    if (Number(parts[1]) < 60 && plausible && !problemOf(asHours, distanceKm, reference)) {
      const suggested = `${shown}:00`;
      return {
        ok: false,
        reason,
        message: `${shown} parece minutos — querias dizer ${suggested}?`,
        suggestion: { seconds: asHours, text: suggested },
      };
    }
  }

  const message = reason === 'faster_than_world_record'
    ? `${shown} dá um ritmo de elite mundial (mais rápido do que 2:40/km). Confirma o tempo.`
    : `${shown} é menos de metade do objetivo (${formatClock(reference as number)}). Confirma o tempo.`;
  return { ok: false, reason, message, suggestion: null };
}
