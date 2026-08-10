import { describe, it, expect } from 'vitest';
import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_TIEBREAK_HINT,
  experienceLevelLabel,
  experienceLevelDescription,
  experienceLevelCriteria,
} from './experience';

describe('EXPERIENCE_LEVELS', () => {
  // As chaves têm de bater certo com os check constraints de
  // profiles.experience_level e race_events.experience_level.
  const CHAVES_NA_BD = ['iniciante', 'basico', 'medio', 'avancado'];

  it('só usa chaves aceites pela base de dados', () => {
    for (const l of EXPERIENCE_LEVELS) {
      expect(CHAVES_NA_BD).toContain(l.key);
    }
  });

  it('cobre os quatro níveis, sem faltar nenhum', () => {
    expect(EXPERIENCE_LEVELS.map(l => l.key).sort()).toEqual([...CHAVES_NA_BD].sort());
  });

  it('está ordenado do menos para o mais experiente — a UI depende disso', () => {
    expect(EXPERIENCE_LEVELS.map(l => l.key)).toEqual(CHAVES_NA_BD);
  });

  it('tem etiqueta, descrição e critérios em todos', () => {
    for (const l of EXPERIENCE_LEVELS) {
      expect(experienceLevelLabel(l.key)).toBeTruthy();
      expect(experienceLevelDescription(l.key)).toBeTruthy();
      expect(experienceLevelCriteria(l.key).length).toBeGreaterThan(0);
    }
  });

  it('dá o mesmo número de critérios a todos os níveis', () => {
    // A ajuda mostra os quatro lado a lado — um nível com menos critérios que
    // os outros lê-se como informação em falta, não como nível mais simples.
    const contagens = EXPERIENCE_LEVELS.map(l => l.criteria.length);
    expect(new Set(contagens).size).toBe(1);
  });
});

describe('acessores', () => {
  it('devolvem a própria chave / vazio quando o nível não existe', () => {
    // Um valor antigo ou corrompido na BD não deve rebentar a UI.
    expect(experienceLevelLabel('inexistente')).toBe('inexistente');
    expect(experienceLevelDescription('inexistente')).toBe('');
    expect(experienceLevelCriteria('inexistente')).toEqual([]);
  });

  it('lidam com null/undefined sem rebentar', () => {
    expect(experienceLevelDescription(null)).toBe('');
    expect(experienceLevelCriteria(undefined)).toEqual([]);
  });
});

describe('EXPERIENCE_TIEBREAK_HINT', () => {
  it('existe e explica a regra de escolher o nível mais baixo', () => {
    // Bloco 0 #2 da investigação: em conflito, desce sempre para o mais
    // baixo. Se este texto mudar e deixar de o dizer, o autorrelato deixa de
    // bater certo com o que a doutrina espera.
    expect(EXPERIENCE_TIEBREAK_HINT).toMatch(/mais baixo/i);
  });
});
