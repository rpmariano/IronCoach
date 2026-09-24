import { describe, it, expect } from 'vitest';
import { EXPERIENCE_LEVELS } from './experience';
import { LEVEL_WEEKLY_KM_RANGE } from '@formulas/vocabulary.ts';

/* O intervalo de km/semana de cada nível vive em texto no formulário do perfil
   e em número nas fórmulas (volume de partida da Carol sem histórico,
   2026-09-24). Os dois têm de dizer o mesmo. */
describe('níveis de experiência — km/semana', () => {
  it('o texto do perfil e LEVEL_WEEKLY_KM_RANGE batem certo', () => {
    for (const level of EXPERIENCE_LEVELS) {
      const [min, max] = LEVEL_WEEKLY_KM_RANGE[level.key];
      const texts = JSON.stringify(level);
      expect(texts).toContain(`${min}-${max} km/semana`);
    }
  });
});
