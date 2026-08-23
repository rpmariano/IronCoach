import { describe, it, expect } from 'vitest';
import {
  weightFactor,
  effectiveLifespanKm,
  accumulatedKm,
  wearStatus,
  shoeLabel,
  shoesNeedingAttention,
  REFERENCE_WEIGHT_KG,
} from './shoes';

const shoe = (over = {}) => ({
  id: 'shoe-1', brand: 'Nike', model: 'Pegasus 40',
  initial_km: 0, lifespan_km: 700, status: 'ativa', ...over,
});

describe('weightFactor', () => {
  it('é neutro no peso de referência', () => {
    expect(weightFactor(REFERENCE_WEIGHT_KG)).toBe(1);
  });

  it('encurta a vida útil de um atleta mais pesado e alarga a de um mais leve', () => {
    expect(weightFactor(85)).toBeLessThan(1);
    expect(weightFactor(60)).toBeGreaterThan(1);
  });

  it('trava nos extremos para não fingir precisão que não existe', () => {
    expect(weightFactor(200)).toBe(0.70);
    expect(weightFactor(30)).toBe(1.15);
  });

  it('devolve 1 sem peso conhecido, em vez de inventar um ajuste', () => {
    expect(weightFactor(null)).toBe(1);
    expect(weightFactor(undefined)).toBe(1);
    expect(weightFactor(0)).toBe(1);
    expect(weightFactor('abc')).toBe(1);
  });
});

describe('effectiveLifespanKm', () => {
  it('aplica o ajuste de peso à vida útil de referência', () => {
    expect(effectiveLifespanKm(shoe({ lifespan_km: 700 }), REFERENCE_WEIGHT_KG)).toBe(700);
    expect(effectiveLifespanKm(shoe({ lifespan_km: 700 }), 90)).toBe(544); // 700 * (70/90)
  });

  it('devolve null quando não há estimativa nenhuma', () => {
    expect(effectiveLifespanKm(shoe({ lifespan_km: null }), 70)).toBeNull();
    expect(effectiveLifespanKm(shoe({ lifespan_km: 0 }), 70)).toBeNull();
  });
});

describe('accumulatedKm', () => {
  it('soma os km iniciais às corridas atribuídas a este par', () => {
    const runs = [
      { shoe_id: 'shoe-1', distance_km: 10 },
      { shoe_id: 'shoe-1', distance_km: 5.5 },
      { shoe_id: 'shoe-2', distance_km: 100 },
      { shoe_id: null, distance_km: 42 },
    ];
    expect(accumulatedKm(shoe({ initial_km: 120 }), runs)).toBe(135.5);
  });

  it('ignora corridas sem distância registada', () => {
    const runs = [
      { shoe_id: 'shoe-1', distance_km: 10 },
      { shoe_id: 'shoe-1', distance_km: null },
      { shoe_id: 'shoe-1' },
    ];
    expect(accumulatedKm(shoe(), runs)).toBe(10);
  });

  it('parte de zero sem km iniciais nem corridas', () => {
    expect(accumulatedKm(shoe({ initial_km: null }), [])).toBe(0);
  });
});

describe('wearStatus', () => {
  const runsFor = (km) => [{ shoe_id: 'shoe-1', distance_km: km }];

  it('classifica os patamares de desgaste', () => {
    expect(wearStatus(shoe(), runsFor(300), 70).level).toBe('ok');
    expect(wearStatus(shoe(), runsFor(550), 70).level).toBe('atencao');   // 78%
    expect(wearStatus(shoe(), runsFor(650), 70).level).toBe('substituir'); // 93%
    expect(wearStatus(shoe(), runsFor(750), 70).level).toBe('excedida');   // 107%
  });

  it('devolve percentagem e km em falta', () => {
    const w = wearStatus(shoe(), runsFor(350), 70);
    expect(w.km).toBe(350);
    expect(w.lifespanKm).toBe(700);
    expect(w.pct).toBe(50);
    expect(w.remainingKm).toBe(350);
  });

  it('um atleta mais pesado chega ao aviso com menos km no mesmo modelo', () => {
    // Mesmos 550 km no mesmo modelo: a 60 kg ainda sobra vida (~805 km de
    // vida útil), a 85 kg já está quase no fim (~576 km).
    const leve = wearStatus(shoe(), runsFor(550), 60);
    const pesado = wearStatus(shoe(), runsFor(550), 85);
    expect(leve.level).toBe('ok');
    expect(pesado.level).toBe('substituir');
    expect(pesado.lifespanKm).toBeLessThan(leve.lifespanKm);
  });

  it('um atleta bastante mais pesado pode já ter excedido o par', () => {
    expect(wearStatus(shoe(), runsFor(550), 95).level).toBe('excedida');
  });

  it('sem estimativa não inventa desgaste', () => {
    const w = wearStatus(shoe({ lifespan_km: null }), runsFor(900), 70);
    expect(w.level).toBe('sem_estimativa');
    expect(w.pct).toBeNull();
    expect(w.km).toBe(900);
  });
});

describe('shoeLabel', () => {
  it('junta marca e modelo', () => {
    expect(shoeLabel({ brand: 'Nike', model: 'Pegasus 40' })).toBe('Nike Pegasus 40');
  });

  it('aguenta campos em falta', () => {
    expect(shoeLabel({ brand: 'Nike', model: '' })).toBe('Nike');
    expect(shoeLabel({})).toBe('Sapatilhas sem nome');
  });
});

describe('shoesNeedingAttention', () => {
  const runs = [
    { shoe_id: 'a', distance_km: 690 }, // 99%
    { shoe_id: 'b', distance_km: 560 }, // 80%
    { shoe_id: 'c', distance_km: 100 }, // 14%
    { shoe_id: 'd', distance_km: 900 }, // aposentada
  ];
  const shoes = [
    shoe({ id: 'a' }), shoe({ id: 'b' }), shoe({ id: 'c' }),
    shoe({ id: 'd', status: 'aposentada' }),
  ];

  it('devolve só os pares gastos, do mais gasto para o menos', () => {
    const result = shoesNeedingAttention(shoes, runs, 70);
    expect(result.map(r => r.shoe.id)).toEqual(['a', 'b']);
  });

  it('não avisa sobre pares já aposentados', () => {
    const result = shoesNeedingAttention(shoes, runs, 70);
    expect(result.some(r => r.shoe.id === 'd')).toBe(false);
  });

  it('devolve vazio sem sapatilhas', () => {
    expect(shoesNeedingAttention([], [], 70)).toEqual([]);
  });
});
