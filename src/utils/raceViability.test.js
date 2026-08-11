import { describe, it, expect } from 'vitest';
import {
  categorizeDistance,
  recentWeeklyVolume,
  assessRaceViability,
  MIN_PREP_WEEKS,
  MIN_VOLUME_KM,
} from './raceViability';

// ─── categorizeDistance ───────────────────────────────────────────────────────

describe('categorizeDistance', () => {
  it('5 km → 5k', () => expect(categorizeDistance(5)).toBe('5k'));
  it('5.5 km → 5k (limite)', () => expect(categorizeDistance(5.5)).toBe('5k'));
  it('8 km → 10k', () => expect(categorizeDistance(8)).toBe('10k'));
  it('10 km → 10k', () => expect(categorizeDistance(10)).toBe('10k'));
  it('21.0975 km → meia', () => expect(categorizeDistance(21.0975)).toBe('meia'));
  it('42.195 km → maratona', () => expect(categorizeDistance(42.195)).toBe('maratona'));
  it('50 km → maratona (limite)', () => expect(categorizeDistance(50)).toBe('maratona'));
  it('60 km → ultra', () => expect(categorizeDistance(60)).toBe('ultra'));
  it('100 km → ultra', () => expect(categorizeDistance(100)).toBe('ultra'));
  it('null → null', () => expect(categorizeDistance(null)).toBeNull());
  it('NaN → null', () => expect(categorizeDistance(NaN)).toBeNull());
});

// ─── recentWeeklyVolume ───────────────────────────────────────────────────────

describe('recentWeeklyVolume', () => {
  const TODAY = '2026-08-11';

  it('devolve 0 com lista vazia', () => {
    expect(recentWeeklyVolume([], TODAY)).toBe(0);
  });

  it('devolve 0 com null', () => {
    expect(recentWeeklyVolume(null, TODAY)).toBe(0);
  });

  it('soma as corridas das últimas 4 semanas e divide por 4', () => {
    const runs = [
      { date: '2026-08-10', distance_km: 10 },
      { date: '2026-08-05', distance_km: 8 },
      { date: '2026-07-20', distance_km: 5 }, // dentro das 4 semanas (14 Jul)
    ];
    // cutoff = 2026-08-11 - 28 dias = 2026-07-14
    // todas dentro → (10+8+5)/4 = 5.8
    expect(recentWeeklyVolume(runs, TODAY)).toBe(5.8);
  });

  it('exclui corridas fora da janela de 4 semanas', () => {
    const runs = [
      { date: '2026-08-10', distance_km: 20 },
      { date: '2026-07-01', distance_km: 100 }, // fora das 4 semanas
    ];
    expect(recentWeeklyVolume(runs, TODAY)).toBe(5); // 20/4
  });

  it('aceita janela personalizada', () => {
    const runs = [{ date: '2026-08-10', distance_km: 8 }];
    expect(recentWeeklyVolume(runs, TODAY, 2)).toBe(4); // 8/2
  });
});

// ─── assessRaceViability ─────────────────────────────────────────────────────

describe('assessRaceViability', () => {

  // ── sem flags ──────────────────────────────────────────────────────────────

  it('viável quando tudo está OK', () => {
    const { flags, isViable } = assessRaceViability({
      distanceKm: 10,
      experienceLevel: 'basico',
      weeksToRace: 10,        // mínimo para básico × 10k é 8 → OK
      weeklyVolumeKm: 30,     // mínimo é 25 → OK
    });
    expect(isViable).toBe(true);
    expect(flags).toHaveLength(0);
  });

  it('não avalia provas já passadas (weeksToRace <= 0)', () => {
    const { isViable } = assessRaceViability({
      distanceKm: 42.195,
      experienceLevel: 'iniciante',
      weeksToRace: 0,
      weeklyVolumeKm: 5,
    });
    expect(isViable).toBe(true);
  });

  it('não avalia quando o nível é desconhecido', () => {
    const { isViable } = assessRaceViability({
      distanceKm: 10,
      experienceLevel: null,
      weeksToRace: 4,
      weeklyVolumeKm: 10,
    });
    expect(isViable).toBe(true);
  });

  it('não avalia quando a distância é desconhecida', () => {
    const { isViable } = assessRaceViability({
      distanceKm: null,
      experienceLevel: 'medio',
      weeksToRace: 8,
      weeklyVolumeKm: 30,
    });
    expect(isViable).toBe(true);
  });

  // ── ultra_para_iniciante ───────────────────────────────────────────────────

  it('flag ultra_para_iniciante quando iniciante tenta ultra', () => {
    const { flags } = assessRaceViability({
      distanceKm: 60,
      experienceLevel: 'iniciante',
      weeksToRace: 40,        // muitas semanas — não é isso que falha
      weeklyVolumeKm: 50,     // volume OK para ultra iniciante
    });
    expect(flags).toContain('ultra_para_iniciante');
  });

  it('ultra para básico é avaliado normalmente (sem flag especial)', () => {
    const { flags } = assessRaceViability({
      distanceKm: 60,
      experienceLevel: 'basico',
      weeksToRace: 30,        // mínimo para básico × ultra é 24 → OK
      weeklyVolumeKm: 60,     // mínimo é 55 → OK
    });
    expect(flags).not.toContain('ultra_para_iniciante');
    expect(flags).toHaveLength(0);
  });

  // ── tempo_insuficiente ────────────────────────────────────────────────────

  it('flag tempo_insuficiente quando faltam menos semanas do que o mínimo', () => {
    const { flags } = assessRaceViability({
      distanceKm: 21.0975,
      experienceLevel: 'basico',  // mínimo = 12 semanas
      weeksToRace: 10,
      weeklyVolumeKm: 40,
    });
    expect(flags).toContain('tempo_insuficiente');
  });

  it('sem tempo_insuficiente exatamente no limite mínimo', () => {
    const { flags } = assessRaceViability({
      distanceKm: 21.0975,
      experienceLevel: 'basico',  // mínimo = 12 semanas
      weeksToRace: 12,
      weeklyVolumeKm: 40,
    });
    expect(flags).not.toContain('tempo_insuficiente');
  });

  it('avançado precisa de menos semanas (meia: 8)', () => {
    const { flags } = assessRaceViability({
      distanceKm: 21.0975,
      experienceLevel: 'avancado',
      weeksToRace: 7,            // mínimo = 8 → insuficiente
      weeklyVolumeKm: 65,
    });
    expect(flags).toContain('tempo_insuficiente');
  });

  // ── volume_insuficiente ───────────────────────────────────────────────────

  it('flag volume_insuficiente quando a média semanal está abaixo do pré-requisito', () => {
    const { flags } = assessRaceViability({
      distanceKm: 42.195,
      experienceLevel: 'medio',   // mínimo = 60 km/sem
      weeksToRace: 20,
      weeklyVolumeKm: 45,
    });
    expect(flags).toContain('volume_insuficiente');
  });

  it('sem volume_insuficiente exatamente no mínimo', () => {
    const { flags } = assessRaceViability({
      distanceKm: 42.195,
      experienceLevel: 'medio',
      weeksToRace: 20,
      weeklyVolumeKm: 60,        // igual ao mínimo → OK
    });
    expect(flags).not.toContain('volume_insuficiente');
  });

  it('sem volume_insuficiente quando weeklyVolumeKm é null (sem dados de corrida)', () => {
    // Sem dados não acusamos o atleta de ter volume insuficiente.
    const { flags } = assessRaceViability({
      distanceKm: 42.195,
      experienceLevel: 'medio',
      weeksToRace: 20,
      weeklyVolumeKm: null,
    });
    expect(flags).not.toContain('volume_insuficiente');
  });

  // ── múltiplas flags ───────────────────────────────────────────────────────

  it('pode ter tempo E volume insuficientes ao mesmo tempo', () => {
    const { flags, isViable } = assessRaceViability({
      distanceKm: 42.195,
      experienceLevel: 'basico',  // mínimo: 18 semanas, 45 km/sem
      weeksToRace: 10,
      weeklyVolumeKm: 20,
    });
    expect(flags).toContain('tempo_insuficiente');
    expect(flags).toContain('volume_insuficiente');
    expect(isViable).toBe(false);
  });

  // ── tabelas de constantes ─────────────────────────────────────────────────

  it('MIN_PREP_WEEKS tem entradas para os 4 níveis × 5 distâncias', () => {
    const levels = ['iniciante', 'basico', 'medio', 'avancado'];
    const cats   = ['5k', '10k', 'meia', 'maratona', 'ultra'];
    for (const l of levels) {
      for (const c of cats) {
        expect(MIN_PREP_WEEKS[l]).toHaveProperty(c);
      }
    }
  });

  it('MIN_VOLUME_KM tem entradas para os 4 níveis × 5 distâncias', () => {
    const levels = ['iniciante', 'basico', 'medio', 'avancado'];
    const cats   = ['5k', '10k', 'meia', 'maratona', 'ultra'];
    for (const l of levels) {
      for (const c of cats) {
        expect(MIN_VOLUME_KM[l]).toHaveProperty(c);
      }
    }
  });

  it('ultra para iniciante tem min weeks null (desaconselhado, não "impossível com X semanas")', () => {
    expect(MIN_PREP_WEEKS.iniciante.ultra).toBeNull();
  });
});
