import { describe, it, expect } from 'vitest';
import { checkRaceTime, parseClock, formatClock, WORLD_RECORD_PACE_FLOOR_S_PER_KM } from '@formulas/raceTimeSanity.ts';

/* A regra partilhada do tempo impossível (bug de 2026-11-15). O caso real: 10 km, objetivo 56:40,
   «1:23» — lido como 1 min 23 s. */
describe('raceTimeSanity', () => {
  it('o caso dela: «1:23» em 10 km com objetivo 56:40 bloqueia e sugere 1:23:00', () => {
    const r = checkRaceTime({ text: '1:23', distanceKm: 10, referenceSeconds: 3400 });
    expect(r).toEqual({
      ok: false,
      reason: 'faster_than_world_record',
      message: '1:23 parece minutos — querias dizer 1:23:00?',
      suggestion: { seconds: 4980, text: '1:23:00' },
    });
    expect(checkRaceTime({ text: '1:23:00', distanceKm: 10, referenceSeconds: 3400 })).toEqual({ ok: true });
  });

  it('mais rápido do que 2:40/km bloqueia sempre, mesmo sem objetivo', () => {
    expect(WORLD_RECORD_PACE_FLOOR_S_PER_KM).toBe(160);
    expect(checkRaceTime({ seconds: 159 * 10, distanceKm: 10 }).ok).toBe(false);
    expect(checkRaceTime({ seconds: 160 * 10, distanceKm: 10 }).ok).toBe(true);
    // Sem sugestão que faça sentido: a frase diz o que está mal.
    const r = checkRaceTime({ text: '1:05:00', distanceKm: 42.195 });
    expect(r.ok).toBe(false);
    expect(r.suggestion).toBeNull();
    expect(r.message).toBe('1:05:00 dá um ritmo de elite mundial (mais rápido do que 2:40/km). Confirma o tempo.');
  });

  it('menos de metade do objetivo (ou da previsão) bloqueia', () => {
    const r = checkRaceTime({ text: '28:19', distanceKm: 10, referenceSeconds: 3400 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('under_half_reference');
    expect(r.message).toBe('28:19 é menos de metade do objetivo (56:40). Confirma o tempo.');
    expect(checkRaceTime({ text: '28:20', distanceKm: 10, referenceSeconds: 3400 }).ok).toBe(true);
  });

  it('a sugestão só quando o valor sugerido é plausível', () => {
    // 45:30 numa maratona de objetivo 3:30:00: 45:30:00 seria absurdo — sem sugestão.
    const r = checkRaceTime({ text: '45:30', distanceKm: 42.195, referenceSeconds: 12600 });
    expect(r.ok).toBe(false);
    expect(r.suggestion).toBeNull();
  });

  it('sem tempo, ou sem distância nem referência, não há o que recusar', () => {
    expect(checkRaceTime({ text: '', distanceKm: 10 })).toEqual({ ok: true });
    expect(checkRaceTime({ seconds: 60 })).toEqual({ ok: true });
  });

  it('parseClock / formatClock', () => {
    expect(parseClock('1:23')).toBe(83);
    expect(parseClock('1:23:00')).toBe(4980);
    expect(parseClock('abc')).toBeNull();
    expect(formatClock(3400)).toBe('56:40');
    expect(formatClock(4980)).toBe('1:23:00');
  });
});
