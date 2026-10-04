import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getEvolutionView, peekEvolutionView, isEvolutionViewCached, fingerprintOf, hasFingerprint,
  primeFingerprints, resetEvolutionCache, evolutionCacheStats, evolutionCacheKey, evolutionCacheKeys,
  evolutionEntryDeps, depsMayMatch, EVOLUTION_CACHE_MAX,
} from './cache';
import { registerEvolutionView, resetEvolutionRegistry, getEvolutionViewDef } from './registry';

/* Cache das vistas da Evolução (2026-10-04, F6). A vista de exemplo existe só
   aqui: conta os dias com refeições do período e devolve dados de gráfico
   (arrays que o Chart.js escreveria). */
const TODAY = '2026-10-04';
const SEMANA = { kind: 'semana', offset: 0 };

function exampleBuild([meals, profile], period, todayISO) {
  return {
    period,
    todayISO,
    days: new Set(meals.map((m) => m.date)).size,
    goal: profile?.calorie_goal ?? null,
    chart: { labels: meals.map((m) => m.date), data: meals.map((m) => m.calories) },
  };
}

const meal = (id, date, calories, items = []) => ({ id, date, calories, meal_items: items });

describe('cache das vistas da Evolução', () => {
  let build;
  beforeEach(() => {
    resetEvolutionCache();
    resetEvolutionRegistry();
    build = vi.fn(exampleBuild);
    registerEvolutionView('exemplo', { deps: (s) => [s.meals, s.profile], build });
  });

  it('a chave é separador|kind|offset|hoje', () => {
    expect(evolutionCacheKey('nutricao', { kind: 'mes', offset: -1 }, TODAY)).toBe('nutricao|mes|-1|2026-10-04');
  });

  it('mesma entrada → o mesmo objeto (toBe), sem recalcular', () => {
    const meals = [meal('a', '2026-10-01', 500)];
    const profile = { calorie_goal: 2000 };
    const v1 = getEvolutionView('exemplo', SEMANA, [meals, profile], TODAY);
    const v2 = getEvolutionView('exemplo', SEMANA, [meals, profile], TODAY);
    expect(v2).toBe(v1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(v1.days).toBe(1);
    expect(evolutionCacheStats().hits).toBe(1);
  });

  it('o build recebe {kind, offset} e o dia', () => {
    const v = getEvolutionView('exemplo', { kind: 'mes', offset: -2 }, [[], null], TODAY);
    expect(v.period).toEqual({ kind: 'mes', offset: -2 });
    expect(v.todayISO).toBe(TODAY);
  });

  it('lista nova com o mesmo conteúdo, impressões primadas (tempo morto) → acerto por impressão, sem recalcular', () => {
    const meals = [meal('a', '2026-10-01', 500, [{ name: 'pão', grams: 50 }])];
    const deps1 = [meals, { calorie_goal: 2000 }];
    const v1 = getEvolutionView('exemplo', SEMANA, deps1, TODAY);
    // Recarregamento: listas e perfil novos, conteúdo igual.
    const reloaded = [meal('a', '2026-10-01', 500, [{ name: 'pão', grams: 50 }])];
    const deps2 = [reloaded, { calorie_goal: 2000 }];
    expect(isEvolutionViewCached('exemplo', SEMANA, deps2, TODAY)).toBe(false); // identidade falha
    expect(evolutionEntryDeps('exemplo', SEMANA, TODAY)).toBe(deps1);
    // O que a preparação faz em tempo morto: primar os dois lados.
    primeFingerprints([...deps2, ...deps1]);
    const hashed = evolutionCacheStats().hashed;
    const v2 = getEvolutionView('exemplo', SEMANA, deps2, TODAY);
    expect(v2).toBe(v1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(evolutionCacheStats().fingerprintHits).toBe(1);
    expect(evolutionCacheStats().hashed).toBe(hashed); // a comparação não calculou nada
    // A entrada passa a ter os deps novos: a seguir acerta por identidade.
    expect(isEvolutionViewCached('exemplo', SEMANA, deps2, TODAY)).toBe(true);
  });

  /* Revisão 2026-10-04: o render nunca calcula impressões (1000 refeições
     custavam 36–68 ms em desktop só a comparar, a cada gravação). */
  it('render: lista nova com outro comprimento → recalcula sem calcular impressão nenhuma', () => {
    const big = Array.from({ length: 200 }, (_, i) => meal(`m${i}`, '2026-10-01', 500, [{ name: 'pão', grams: i }]));
    const v1 = getEvolutionView('exemplo', SEMANA, [big, null], TODAY); // feita no render, sem impressões
    // Mesmo com o lado antigo primado, o comprimento diferente falha logo.
    primeFingerprints([big]);
    const hashed = evolutionCacheStats().hashed;
    const plusOne = [...big, meal('novo', '2026-10-02', 300)];
    const v2 = getEvolutionView('exemplo', SEMANA, [plusOne, null], TODAY);
    expect(v2).not.toBe(v1);
    expect(build).toHaveBeenCalledTimes(2);
    expect(evolutionCacheStats().hashed).toBe(hashed);
    expect(hasFingerprint(plusOne)).toBe(false);
    // E apagar uma linha também.
    getEvolutionView('exemplo', SEMANA, [big.slice(1), null], TODAY);
    expect(build).toHaveBeenCalledTimes(3);
    expect(evolutionCacheStats().hashed).toBe(hashed);
  });

  it('render: lista nova com o mesmo conteúdo mas sem impressões → recalcula, sem hash no render', () => {
    const rows = () => Array.from({ length: 50 }, (_, i) => meal(`m${i}`, '2026-10-01', 500, [{ grams: i }]));
    const v1 = getEvolutionView('exemplo', SEMANA, [rows(), null], TODAY);
    const next = [rows(), null];
    expect(peekEvolutionView('exemplo', SEMANA, next, TODAY)).toBeUndefined();
    const v2 = getEvolutionView('exemplo', SEMANA, next, TODAY);
    expect(v2).not.toBe(v1);
    expect(v2).toEqual(v1); // conteúdo igual, só refeita
    expect(evolutionCacheStats().hashed).toBe(0);
    expect(evolutionCacheStats().fingerprintHits).toBe(0);
    // Só um lado primado também não chega (o outro teria de se calcular).
    primeFingerprints([next[0]]);
    const hashed = evolutionCacheStats().hashed;
    expect(getEvolutionView('exemplo', SEMANA, [rows(), null], TODAY)).not.toBe(v2);
    expect(evolutionCacheStats().hashed).toBe(hashed);
  });

  it('uma vista undefined também fica em cache; NaN como dep acerta por identidade', () => {
    const undef = vi.fn(() => undefined);
    const deps = [[], NaN];
    expect(getEvolutionView('u', SEMANA, deps, TODAY, undef)).toBeUndefined();
    expect(getEvolutionView('u', SEMANA, [deps[0], NaN], TODAY, undef)).toBeUndefined();
    expect(undef).toHaveBeenCalledTimes(1);
  });

  it('conteúdo diferente → recalcula (também numa linha aninhada)', () => {
    const v1 = getEvolutionView('exemplo', SEMANA, [[meal('a', '2026-10-01', 500, [{ grams: 50 }])], null], TODAY);
    const v2 = getEvolutionView('exemplo', SEMANA, [[meal('a', '2026-10-01', 500, [{ grams: 60 }])], null], TODAY);
    expect(v2).not.toBe(v1);
    const v3 = getEvolutionView('exemplo', SEMANA, [[meal('a', '2026-10-01', 500, [{ grams: 60 }]), meal('b', '2026-10-02', 300)], null], TODAY);
    expect(v3.days).toBe(2);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('primitivos diferentes nos deps → recalcula', () => {
    registerEvolutionView('prim', { deps: () => [], build: (d) => ({ d }) });
    const a = getEvolutionView('prim', SEMANA, [1, 'x'], TODAY);
    expect(getEvolutionView('prim', SEMANA, [1, 'x'], TODAY)).toBe(a);
    expect(getEvolutionView('prim', SEMANA, [2, 'x'], TODAY)).not.toBe(a);
  });

  it('outro dia, outro período ou outro separador → entradas diferentes', () => {
    const deps = [[], null];
    const a = getEvolutionView('exemplo', SEMANA, deps, TODAY);
    expect(getEvolutionView('exemplo', SEMANA, deps, '2026-10-05')).not.toBe(a);
    expect(getEvolutionView('exemplo', { kind: 'semana', offset: -1 }, deps, TODAY)).not.toBe(a);
    expect(getEvolutionView('exemplo', { kind: 'mes', offset: 0 }, deps, TODAY)).not.toBe(a);
    expect(build).toHaveBeenCalledTimes(4);
  });

  it(`LRU: no máximo ${EVOLUTION_CACHE_MAX} entradas, sai a menos usada`, () => {
    const deps = [[], null];
    const first = getEvolutionView('exemplo', { kind: 'semana', offset: 0 }, deps, TODAY);
    getEvolutionView('exemplo', { kind: 'semana', offset: -1 }, deps, TODAY);
    for (let i = 2; i < EVOLUTION_CACHE_MAX; i++) getEvolutionView('exemplo', { kind: 'semana', offset: -i }, deps, TODAY);
    expect(evolutionCacheStats().size).toBe(EVOLUTION_CACHE_MAX);
    // Usar a primeira põe-na no fim da fila; a que sai é a segunda (offset -1).
    expect(getEvolutionView('exemplo', { kind: 'semana', offset: 0 }, deps, TODAY)).toBe(first);
    getEvolutionView('exemplo', { kind: 'mes', offset: 0 }, deps, TODAY);
    expect(evolutionCacheStats().size).toBe(EVOLUTION_CACHE_MAX);
    const keys = evolutionCacheKeys();
    expect(keys).toContain('exemplo|semana|0|2026-10-04');
    expect(keys).not.toContain('exemplo|semana|-1|2026-10-04');
    expect(peekEvolutionView('exemplo', { kind: 'semana', offset: -1 }, deps, TODAY)).toBeUndefined();
  });

  it('as vistas não são congeladas (o Chart.js escreve nos arrays)', () => {
    const v = getEvolutionView('exemplo', SEMANA, [[meal('a', '2026-10-01', 500)], null], TODAY);
    expect(Object.isFrozen(v)).toBe(false);
    expect(Object.isFrozen(v.chart.data)).toBe(false);
    expect(() => { v.chart.data._chartjs = { listeners: [] }; }).not.toThrow();
  });

  it('sem vista registada devolve null; com build à mão calcula', () => {
    expect(getEvolutionView('nada', SEMANA, [], TODAY)).toBeNull();
    expect(getEvolutionView('nada', SEMANA, [], TODAY, () => ({ ok: 1 }))).toEqual({ ok: 1 });
  });

  it('reset limpa tudo', () => {
    getEvolutionView('exemplo', SEMANA, [[], null], TODAY);
    resetEvolutionCache();
    expect(evolutionCacheStats()).toEqual({ hits: 0, fingerprintHits: 0, builds: 0, hashed: 0, size: 0 });
  });
});

describe('impressão digital', () => {
  beforeEach(() => resetEvolutionCache());

  it('é memorizada por identidade e calculada só quando pedida', () => {
    const list = [{ id: 1, v: 2 }];
    expect(hasFingerprint(list)).toBe(false);
    const fp = fingerprintOf(list);
    expect(hasFingerprint(list)).toBe(true);
    expect(fingerprintOf(list)).toBe(fp);
    expect(hasFingerprint(null)).toBe(true); // primitivos não precisam
  });

  it('distingue comprimento, ids, ordem e conteúdo', () => {
    const base = fingerprintOf([{ id: 1, v: 2 }, { id: 2, v: 3 }]);
    expect(fingerprintOf([{ id: 1, v: 2 }, { id: 2, v: 3 }])).toBe(base);
    expect(fingerprintOf([{ id: 1, v: 2 }])).not.toBe(base);
    expect(fingerprintOf([{ id: 1, v: 2 }, { id: 3, v: 3 }])).not.toBe(base);
    expect(fingerprintOf([{ id: 2, v: 3 }, { id: 1, v: 2 }])).not.toBe(base);
    expect(fingerprintOf([{ id: 1, v: 2 }, { id: 2, v: 4 }])).not.toBe(base);
    expect(fingerprintOf([{ id: 1, v: 2 }, { id: 2, v: '3' }])).not.toBe(base); // tipo conta
    expect(fingerprintOf([{ id: 1, v: 2 }, { id: 2, v: 3, extra: null }])).not.toBe(base);
  });

  it('objetos (o profile) também', () => {
    expect(fingerprintOf({ a: 1, b: [1, 2] })).toBe(fingerprintOf({ a: 1, b: [1, 2] }));
    expect(fingerprintOf({ a: 1, b: [1, 2] })).not.toBe(fingerprintOf({ a: 1, b: [1, 3] }));
  });

  it('depsMayMatch: sem hash, falha com comprimentos ou primitivos diferentes', () => {
    const a = [{ id: 1 }];
    expect(depsMayMatch([a, 1], [a, 1])).toBe(true);
    expect(depsMayMatch([a, { x: 1 }], [[{ id: 9 }], { y: 2 }])).toBe(true); // só o conteúdo decide
    expect(depsMayMatch([a], [[{ id: 1 }, { id: 2 }]])).toBe(false);
    expect(depsMayMatch([a, 1], [a, 2])).toBe(false);
    expect(depsMayMatch([a], [{ 0: { id: 1 } }])).toBe(false); // lista vs objeto
    expect(depsMayMatch([a], [a, a])).toBe(false);
    expect(evolutionCacheStats().hashed).toBe(0);
  });

  it('primeFingerprints cede A MEIO de uma lista e retoma onde ficou (mesma impressão)', () => {
    const mk = () => Array.from({ length: 100 }, (_, i) => ({ id: i, kcal: i * 3, items: [{ g: i }] }));
    const list = mk();
    let calls = 0;
    // "Fatia" de 10 linhas: cede quando o contador passa de 10.
    const slice = () => { calls = 0; return () => ++calls > 10; };
    expect(primeFingerprints([list], slice())).toBe(0);
    expect(hasFingerprint(list)).toBe(false); // a meio
    let slices = 1;
    while (!hasFingerprint(list)) { primeFingerprints([list], slice()); slices++; }
    expect(slices).toBeGreaterThanOrEqual(9);
    expect(fingerprintOf(list)).toBe(fingerprintOf(mk())); // retomada = de uma vez
    // Uma linha alterada continua a dar outra impressão.
    const other = mk();
    other[57] = { ...other[57], kcal: 1 };
    expect(fingerprintOf(other)).not.toBe(fingerprintOf(list));
  });

  it('primeFingerprints avança sempre pelo menos uma linha (nunca fica parada)', () => {
    const list = [{ id: 1 }, { id: 2 }];
    primeFingerprints([list], () => true);
    expect(hasFingerprint(list)).toBe(false);
    primeFingerprints([list], () => true);
    expect(hasFingerprint(list)).toBe(true);
  });

  it('primeFingerprints calcula o que falta e pode ceder a meio', () => {
    const a = [{ id: 1 }];
    const b = [{ id: 2 }];
    expect(primeFingerprints([a, b, null, 3], () => true)).toBe(1); // cede depois da primeira
    expect(hasFingerprint(a)).toBe(true);
    expect(hasFingerprint(b)).toBe(false);
    expect(primeFingerprints([a, b])).toBe(1);
    expect(primeFingerprints([a, b])).toBe(0);
  });
});

describe('registo', () => {
  beforeEach(() => resetEvolutionRegistry());

  it('exige deps e build, e o desregisto só tira a própria', () => {
    expect(() => registerEvolutionView('x', { build: () => 1 })).toThrow();
    const un1 = registerEvolutionView('x', { deps: () => [], build: () => 1 });
    const def2 = { deps: () => [], build: () => 2 };
    registerEvolutionView('x', def2); // HMR: substitui
    un1();
    expect(getEvolutionViewDef('x').build).toBe(def2.build);
  });
});
