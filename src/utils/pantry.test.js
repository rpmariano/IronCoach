import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Bugs #48/#52, fase C: a despensa na app — sugestões, habituais, e o que
   se grava quando o atleta ajusta à mão. */

const db = vi.hoisted(() => ({ calls: [], prev: null, result: { data: { id: 'f1' }, error: null } }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const chain = {
        _table: table,
        upsert: (row, opts) => { db.calls.push({ table, op: 'upsert', row, opts }); return chain; },
        update: (row) => { db.calls.push({ table, op: 'update', row }); return chain; },
        delete: () => { db.calls.push({ table, op: 'delete' }); return chain; },
        eq: () => chain,
        select: () => chain,
        single: () => Promise.resolve(db.result),
        maybeSingle: () => Promise.resolve({ data: db.prev, error: null }),
        then: (resolve) => resolve({ error: null }),
      };
      return chain;
    },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const {
  pantrySuggestions, habitualsForMealType, portionText, foodSubline, ruleInfo, visibleRules, isKnownFood, savePantryFood, saveFoodRule,
} = await import('./pantry');

const food = (name, name_key, times_seen, extra = {}) => ({ id: name_key, name, name_key, times_seen, portion_grams: 100, calories_per_100g: 100, ...extra });
const FOODS = [
  food('Iogurte natural', 'iogurte natural', 2),
  food('Iogurte grego 0%', 'iogurte grego 0%', 6, { portion_grams: 170, calories_per_100g: 59 }),
  food('Aveia em flocos', 'aveia em flocos', 5, { portion_grams: 40 }),
  food('Pão de mistura (Lidl)', 'pao de mistura lidl', 3, { portion_grams: 40, portion_label: '1 fatia' }),
];

describe('pantrySuggestions', () => {
  it('cada palavra escrita começa uma palavra do nome; os mais usados primeiro', () => {
    expect(pantrySuggestions('io', FOODS).map((f) => f.name)).toEqual(['Iogurte grego 0%', 'Iogurte natural']);
    expect(pantrySuggestions('io gr', FOODS).map((f) => f.name)).toEqual(['Iogurte grego 0%']);
    expect(pantrySuggestions('pão', FOODS).map((f) => f.name)).toEqual(['Pão de mistura (Lidl)']);
  });
  it('menos de 2 letras, ou nada parecido, não sugere', () => {
    expect(pantrySuggestions('i', FOODS)).toEqual([]);
    expect(pantrySuggestions('banana', FOODS)).toEqual([]);
  });
});

describe('habitualsForMealType', () => {
  const meal = (date, type, names) => ({ date, meal_type: type, meal_items: names.map((name) => ({ name })) });
  it('os da despensa que aparecem pelo menos 2 vezes nessa refeição, nos últimos 90 dias', () => {
    const meals = [
      meal('2026-10-01', 'pequeno-almoco', ['Aveia em flocos', 'Iogurte grego 0%', 'aveia em flocos']),
      meal('2026-10-02', 'pequeno-almoco', ['Aveia em flocos', 'Banana']),
      meal('2026-10-03', 'pequeno-almoco', ['Iogurte grego 0%', 'Aveia em flocos']),
      meal('2026-10-03', 'almoco', ['Pão de mistura (Lidl)', 'Pão de mistura (Lidl)']),
      meal('2026-05-01', 'pequeno-almoco', ['Pão de mistura (Lidl)']),
      meal('2026-05-02', 'pequeno-almoco', ['Pão de mistura (Lidl)']),
    ];
    const h = habitualsForMealType({ meals, foods: FOODS, mealType: 'pequeno-almoco', today: '2026-10-04' });
    // Aveia 3 refeições (uma vez por refeição), iogurte 2; o pão só há 5 meses.
    expect(h.map((f) => f.name)).toEqual(['Aveia em flocos', 'Iogurte grego 0%']);
  });
});

describe('textos', () => {
  it('porção e linha de baixo', () => {
    expect(portionText(FOODS[3])).toBe('1 fatia, 40 g');
    expect(portionText({})).toBe('');
    expect(foodSubline(FOODS[1])).toBe('170 g · 59 kcal/100 g');
  });
  it('o que diz cada regra, e quais se veem', () => {
    expect(ruleInfo({ status: 'varia' })).toMatch(/continuo a perguntar/);
    expect(ruleInfo({ status: 'confirmado', source: 'manual' })).toBe('Escrito por ti');
    expect(ruleInfo({ status: 'confirmado', source: 'resposta', confirmations: 3 })).toBe('Respondeste 3 vezes igual');
    expect(ruleInfo({ status: 'confirmado', source: 'observacao', confirmations: 2 })).toBe('Das tuas observações · 2×');
    expect(visibleRules([{ status: 'por_confirmar' }, { status: 'confirmado' }, { status: 'varia' }]).length).toBe(2);
    expect(isKnownFood('IOGURTE grego 0 %', FOODS)).toBe(true);
    expect(isKnownFood('Banana', FOODS)).toBe(false);
  });
});

describe('savePantryFood', () => {
  beforeEach(() => { db.calls.length = 0; db.prev = null; });
  const confirmed = { name: 'Pão de mistura (Lidl)', portion_grams: 40, portion_label: '1 fatia', calories_per_100g: 245, protein_per_100g: 9, carbs_per_100g: 45, fat_per_100g: 3, fiber_per_100g: 6 };

  it('novo, sem mexer nos valores da Carol: entra na despensa, não ajustado', async () => {
    await savePantryFood({ userId: 'u1', values: { ...confirmed, portion_grams: '40', calories_per_100g: '245' }, confirmed });
    const [{ op, row, opts }] = db.calls;
    expect(op).toBe('upsert');
    expect(opts).toEqual({ onConflict: 'user_id,name_key' });
    expect(row).toMatchObject({ name_key: 'pao de mistura lidl', in_pantry: true, edited_by_athlete: false, source: 'manual', times_seen: 0, fiber_per_100g: 6 });
  });

  it('novo com um valor mudado à mão: fica ajustado — a Carol passa a usar o dele', async () => {
    await savePantryFood({ userId: 'u1', values: { ...confirmed, protein_per_100g: '11' }, confirmed, source: 'rotulo' });
    expect(db.calls[0].row).toMatchObject({ edited_by_athlete: true, source: 'rotulo', protein_per_100g: 11 });
  });

  it('a editar: um valor mudado marca-o; sem mudanças fica como estava', async () => {
    const existing = { id: 'f1', ...confirmed, edited_by_athlete: false };
    await savePantryFood({ userId: 'u1', values: { ...confirmed, calories_per_100g: '250' }, confirmed: existing, existing });
    expect(db.calls[0]).toMatchObject({ op: 'update', row: { edited_by_athlete: true } });
    db.calls.length = 0;
    await savePantryFood({ userId: 'u1', values: { ...confirmed, name: 'Pão de mistura' }, confirmed: existing, existing });
    expect(db.calls[0].row.edited_by_athlete).toBe(false);
  });

  it('sem nome não grava', async () => {
    await expect(savePantryFood({ userId: 'u1', values: { ...confirmed, name: '  ' }, confirmed })).rejects.toThrow('Dá um nome');
  });

  // Revisão pré-master (2026-10-04).
  it('aceita a vírgula decimal do teclado português', async () => {
    await savePantryFood({ userId: 'u1', values: { ...confirmed, portion_grams: '37,5', fat_per_100g: '3,5' }, confirmed });
    expect(db.calls[0].row).toMatchObject({ portion_grams: 37.5, fat_per_100g: 3.5, edited_by_athlete: true });
  });

  it('um alimento já visto numa refeição entra sem perder as vezes que apareceu', async () => {
    db.prev = { id: 'f9', times_seen: 3, source: 'refeicao' };
    await savePantryFood({ userId: 'u1', values: { ...confirmed }, confirmed });
    expect(db.calls[0].row).toMatchObject({ times_seen: 3, source: 'manual', in_pantry: true });
    db.calls.length = 0;
    db.prev = { id: 'f9', times_seen: 1, source: 'rotulo' };
    await savePantryFood({ userId: 'u1', values: { ...confirmed }, confirmed });
    expect(db.calls[0].row).toMatchObject({ times_seen: 1, source: 'rotulo' });
  });
});

describe('saveFoodRule', () => {
  beforeEach(() => { db.calls.length = 0; });
  it('uma regra escrita à mão fica confirmada logo', async () => {
    await saveFoodRule({ userId: 'u1', topic: 'Fritos', value: 'Azeite' });
    expect(db.calls[0].row).toMatchObject({ topic_key: 'fritos', value_key: 'azeite', status: 'confirmado', source: 'manual', confirmations: 2 });
  });
});
