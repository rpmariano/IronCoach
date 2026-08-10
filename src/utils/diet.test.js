import { describe, it, expect } from 'vitest';
import {
  DIETARY_RESTRICTIONS,
  dietaryRestrictionLabel,
  dietaryRestrictionDescription,
  toggleRestriction,
  normalizeRestrictions,
  describeRestrictionsForCoach,
} from './diet';

describe('DIETARY_RESTRICTIONS', () => {
  // Têm de bater certo com o check constraint de profiles.dietary_restrictions.
  const CHAVES_NA_BD = ['vegetariano', 'vegano', 'sem_lactose', 'sem_gluten'];

  it('só usa chaves aceites pela base de dados', () => {
    expect(DIETARY_RESTRICTIONS.map(r => r.key).sort()).toEqual([...CHAVES_NA_BD].sort());
  });

  it('tem etiqueta, descrição, substitutos e nutrientes críticos em todas', () => {
    for (const r of DIETARY_RESTRICTIONS) {
      expect(r.label).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.substitutes.length).toBeGreaterThan(0);
      expect(r.criticalNutrients.length).toBeGreaterThan(0);
    }
  });

  it('só obriga a B12 no vegano, não no vegetariano', () => {
    // Um vegetariano come ovos e lacticínios — mandá-lo suplementar B12 seria
    // errado e mina a credibilidade do resto. Bloco 7 #5.
    const vegano = DIETARY_RESTRICTIONS.find(r => r.key === 'vegano');
    const vegetariano = DIETARY_RESTRICTIONS.find(r => r.key === 'vegetariano');
    expect(vegano.criticalNutrients.join(' ')).toMatch(/B12/);
    expect(vegetariano.criticalNutrients.join(' ')).not.toMatch(/B12/);
  });

  it('mantém o multiplicador de ferro de 1,8x nas dietas sem carne', () => {
    // Este número é o que recalibra o alarme de ferro do Bloco 4.2 #2. Se
    // desaparecer daqui, o alarme volta a ficar calibrado para um omnívoro.
    for (const key of ['vegetariano', 'vegano']) {
      const r = DIETARY_RESTRICTIONS.find(x => x.key === key);
      expect(r.criticalNutrients.join(' ')).toMatch(/1,8×/);
    }
  });
});

describe('acessores', () => {
  it('devolvem a própria chave / vazio quando a restrição não existe', () => {
    expect(dietaryRestrictionLabel('inexistente')).toBe('inexistente');
    expect(dietaryRestrictionDescription('inexistente')).toBe('');
    expect(dietaryRestrictionDescription(null)).toBe('');
  });
});

describe('toggleRestriction', () => {
  it('acrescenta e remove', () => {
    expect(toggleRestriction([], 'sem_gluten')).toEqual(['sem_gluten']);
    expect(toggleRestriction(['sem_gluten'], 'sem_gluten')).toEqual([]);
  });

  it('desliga vegetariano ao escolher vegano, e vice-versa', () => {
    // A BD recusa os dois juntos; a interface tem de tornar isso invisível.
    expect(toggleRestriction(['vegetariano'], 'vegano')).toEqual(['vegano']);
    expect(toggleRestriction(['vegano'], 'vegetariano')).toEqual(['vegetariano']);
  });

  it('deixa as restrições combináveis coexistir', () => {
    // Vegetariano E sem lactose é uma combinação comum e legítima.
    expect(toggleRestriction(['vegetariano'], 'sem_lactose')).toEqual(['vegetariano', 'sem_lactose']);
  });

  it('devolve sempre a mesma ordem para a mesma escolha', () => {
    // Ordem instável faria a mesma escolha gravar valores diferentes na BD.
    expect(toggleRestriction(['sem_gluten'], 'vegano')).toEqual(
      toggleRestriction(['vegano'], 'sem_gluten')
    );
  });

  it('lida com null/undefined sem rebentar', () => {
    expect(toggleRestriction(null, 'vegano')).toEqual(['vegano']);
    expect(toggleRestriction(undefined, 'vegano')).toEqual(['vegano']);
  });
});

describe('normalizeRestrictions', () => {
  it('converte vazio em null para não deixar [] na base de dados', () => {
    expect(normalizeRestrictions([])).toBeNull();
    expect(normalizeRestrictions(null)).toBeNull();
    expect(normalizeRestrictions(['vegano'])).toEqual(['vegano']);
  });
});

describe('describeRestrictionsForCoach', () => {
  it('não diz nada quando não há restrições', () => {
    // Afirmar ausência gastaria tokens em todos os pedidos sem restrições.
    expect(describeRestrictionsForCoach(null, null)).toBe('');
    expect(describeRestrictionsForCoach([], '')).toBe('');
    expect(describeRestrictionsForCoach([], '   ')).toBe('');
  });

  it('inclui alternativas e nutrientes críticos', () => {
    const texto = describeRestrictionsForCoach(['vegano'], null);
    expect(texto).toMatch(/Vegano/);
    expect(texto).toMatch(/tofu/);
    expect(texto).toMatch(/B12/);
  });

  it('passa as notas em bruto e marca-as como absolutas', () => {
    const texto = describeRestrictionsForCoach([], 'alergia a frutos secos');
    expect(texto).toMatch(/alergia a frutos secos/);
    expect(texto).toMatch(/restrição absoluta/);
  });

  it('ignora chaves desconhecidas em vez de rebentar', () => {
    // Um valor antigo na BD não deve impedir o coach de responder.
    expect(describeRestrictionsForCoach(['inventada'], null)).toBe('');
  });
});
