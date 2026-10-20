import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Bugs #48/#52, fase C: a despensa na app — sugestões, habituais, e o que
   se grava quando o atleta ajusta à mão. */

const db = vi.hoisted(() => ({ calls: [], prev: null, prevError: null, result: { data: { id: 'f1' }, error: null } }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      const chain = {
        _table: table,
        upsert: (row, opts) => { db.calls.push({ table, op: 'upsert', row, opts }); return chain; },
        update: (row) => { db.calls.push({ table, op: 'update', row }); return chain; },
        insert: (row) => { db.calls.push({ table, op: 'insert', row }); return chain; },
        delete: () => { db.calls.push({ table, op: 'delete' }); return chain; },
        eq: () => chain,
        select: () => chain,
        single: () => Promise.resolve(db.result),
        maybeSingle: () => Promise.resolve({ data: db.prev, error: db.prevError }),
        then: (resolve) => resolve({ error: null }),
      };
      return chain;
    },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const {
  pantrySuggestions, habitualsForMealType, portionText, foodSubline, ruleInfo, visibleRules, isKnownFood, savePantryFood, saveFoodRule,
  microOrNull, microsTrusted, pantryMicro, missingMicroWords, isPantryComplete, listWords, MICRO_COLUMNS,
  isDishlessRule, isQuantityRule, ruleLabel, templateItems, templateTotals, templatesForMealType, saveMealTemplate, suggestedTemplateName, markMealTemplateUsed, foodDefaultGrams,
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
  beforeEach(() => { db.calls.length = 0; db.prev = null; db.prevError = null; });
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

  it('um alimento que já está na despensa não é escrito por cima', async () => {
    db.prev = { id: 'f9', times_seen: 4, source: 'manual', in_pantry: true };
    await expect(savePantryFood({ userId: 'u1', values: { ...confirmed }, confirmed })).rejects.toThrow('Já tens este alimento na despensa');
    expect(db.calls).toHaveLength(0);
  });

  it('se não consegue ver o que já lá está, não grava às cegas', async () => {
    db.prevError = { message: 'sem rede' };
    await expect(savePantryFood({ userId: 'u1', values: { ...confirmed }, confirmed })).rejects.toThrow('Não foi possível confirmar a despensa');
    expect(db.calls).toHaveLength(0);
  });
});

// Despensa com micronutrientes (2026-10-05): a regra espelha
// analyze-meal/pantry.ts — null por confirmar, 0 só é dado em linha marcada.
describe('micronutrientes da despensa', () => {
  const NOW = '2026-10-05T10:00:00.000Z';
  const todos = (v) => Object.fromEntries(MICRO_COLUMNS.map((k) => [k, v]));

  it('microOrNull: número ≥ 0 fica (vírgula também); vazio, null e lixo são null, nunca 0', () => {
    expect(microOrNull(0)).toBe(0);
    expect(microOrNull('3,5')).toBe(3.5);
    for (const v of [null, undefined, '', '  ', -1, 'abc', NaN]) expect(microOrNull(v)).toBeNull();
  });

  it('um 0 só é dado com micros_checked_at = updated_at; o PostgREST escreve +00:00', () => {
    const marcado = { ...todos(0), micros_checked_at: NOW, updated_at: '2026-10-05T10:00:00+00:00' };
    expect(microsTrusted(marcado)).toBe(true);
    expect(pantryMicro(marcado, 'fiber_per_100g')).toBe(0);
    expect(isPantryComplete(marcado)).toBe(true);
    // Mexido depois pelo código antigo (só mexe em updated_at): zeros por confirmar.
    const antigo = { ...marcado, updated_at: '2026-10-05T11:00:00Z' };
    expect(pantryMicro(antigo, 'fiber_per_100g')).toBeNull();
    expect(isPantryComplete(antigo)).toBe(false);
    // Positivos são sempre dados.
    expect(isPantryComplete(todos(2))).toBe(true);
  });

  it('o que falta, em palavras; acabado de vir da Carol, um 0 é dela', () => {
    const f = { ...todos(1), fiber_per_100g: 0, iron_mg_per_100g: null, vitamin_c_mg_per_100g: 0 };
    expect(missingMicroWords(f)).toEqual(['fibra', 'ferro', 'vitamina C']);
    expect(missingMicroWords(f, { fresh: true })).toEqual(['ferro']);
    expect(listWords(['fibra'])).toBe('fibra');
    expect(listWords(['fibra', 'ferro', 'vitamina C'])).toBe('fibra, ferro e vitamina C');
  });

  it('ao guardar um novo: os micronutrientes que a Carol deu, null nos outros; a linha fica marcada', async () => {
    db.calls.length = 0; db.prev = null; db.prevError = null;
    const confirmed = { name: 'Azeite', portion_grams: 10, calories_per_100g: 884, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100, fiber_per_100g: 0, vitamin_c_mg_per_100g: 0, iron_mg_per_100g: 0.6 };
    await savePantryFood({ userId: 'u1', values: { ...confirmed, portion_grams: '10' }, confirmed });
    const { row } = db.calls[0];
    expect(row).toMatchObject({ fiber_per_100g: 0, vitamin_c_mg_per_100g: 0, iron_mg_per_100g: 0.6, sodium_per_100g: null, potassium_mg_per_100g: null });
    expect(row.micros_checked_at).toBe(row.updated_at);
  });

  it('ao editar: os micronutrientes que a despensa sabe ficam; um 0 antigo passa a null (por confirmar)', async () => {
    db.calls.length = 0;
    const existing = { id: 'f1', name: 'Pão', name_key: 'pao', portion_grams: 40, calories_per_100g: 245, protein_per_100g: 9, carbs_per_100g: 45, fat_per_100g: 3, ...todos(0), sodium_per_100g: 450 };
    await savePantryFood({ userId: 'u1', values: { ...existing, calories_per_100g: '250' }, confirmed: existing, existing });
    const { row } = db.calls[0];
    expect(row).toMatchObject({ sodium_per_100g: 450, fiber_per_100g: null, calories_per_100g: 250 });
    expect(row.micros_checked_at).toBe(row.updated_at);
  });
});

describe('saveFoodRule', () => {
  beforeEach(() => { db.calls.length = 0; });
  it('uma regra escrita à mão fica confirmada logo', async () => {
    await saveFoodRule({ userId: 'u1', topic: 'Fritos', value: 'Azeite' });
    expect(db.calls[0].row).toMatchObject({ topic_key: 'fritos', value_key: 'azeite', status: 'confirmado', source: 'manual', confirmations: 2 });
  });
});

/* Bug #63 (fase D, 2026-10-17): refeições predefinidas. */
describe('refeições predefinidas', () => {
  const T = (name, items, extra = {}) => ({ id: name, name, items, times_used: 0, ...extra });

  it('templateItems limpa os itens: sem nome sai, gramas inválidas ficam null', () => {
    expect(templateItems(T('x', [{ name: ' Aveia em flocos ', grams: '40' }, { name: '', grams: 10 }, { name: 'Mel', grams: 0 }]))).toEqual([
      { food_id: null, name: 'Aveia em flocos', grams: 40 }, { food_id: null, name: 'Mel', grams: null },
    ]);
    expect(templateItems(null)).toEqual([]);
  });

  it('templateTotals conta pela despensa — sem gramas usa a porção habitual; fora da despensa não conta', () => {
    const t = T('Pequeno-almoço', [{ name: 'Iogurte grego 0%', grams: 170 }, { name: 'Aveia em flocos' }, { name: 'Banana', grams: 120 }]);
    // 170 × 0,59 = 100,3 + 40 × 1 = 40 → 140 kcal; 2 de 3 contados.
    expect(templateTotals(t, FOODS)).toMatchObject({ kcal: 140, known: 2, total: 3 });
  });

  it('templateTotals também dá hidratos e gordura', () => {
    const foods = [{ name: 'Aveia', name_key: 'aveia', portion_grams: 40, calories_per_100g: 372, protein_per_100g: 13, carbs_per_100g: 60, fat_per_100g: 7 }];
    expect(templateTotals(T('x', [{ name: 'Aveia', grams: 50 }]), foods)).toMatchObject({ kcal: 186, protein: 6.5, carbs: 30, fat: 3.5 });
  });

  it('suggestedTemplateName junta o tipo e o 1.º alimento', () => {
    expect(suggestedTemplateName('Almoço', [{ name: 'Arroz basmati', grams: 150 }, { name: 'Frango' }])).toBe('Almoço · Arroz basmati');
    expect(suggestedTemplateName('Ceia', [])).toBe('Ceia');
    // Comprido: corta numa palavra inteira, sem "·" pendurado.
    const longo = suggestedTemplateName('Pequeno-Almoço', [{ name: 'Iogurte grego natural sem açúcar com granola caseira e frutos vermelhos' }]);
    expect(longo.length).toBeLessThanOrEqual(60);
    expect(longo).toBe('Pequeno-Almoço · Iogurte grego natural sem açúcar com');
    // Uma palavra só, comprida: corta-a a direito, não deixa só o tipo.
    const palavra = suggestedTemplateName('Almoço', [{ name: 'X'.repeat(80) }]);
    expect(palavra).toBe(`Almoço · ${'X'.repeat(51)}`);
    // A palavra acaba mesmo no 60.º carácter: fica inteira.
    const certo = suggestedTemplateName('Almoço', [{ name: `${'a'.repeat(51)} resto` }]);
    expect(certo).toBe(`Almoço · ${'a'.repeat(51)}`);
    expect(certo).toHaveLength(60);
  });

  it('markMealTemplateUsed devolve o valor novo quando grava', async () => {
    db.calls.length = 0;
    expect(await markMealTemplateUsed({ id: 't1', times_used: 4 })).toBe(5);
    expect(db.calls.find((c) => c.table === 'athlete_meal_templates' && c.op === 'update').row).toMatchObject({ times_used: 5 });
  });

  it('para o registo: as deste tipo primeiro, depois as mais usadas', () => {
    const lista = [T('A', [], { times_used: 9 }), T('B', [], { default_meal_type: 'almoco', times_used: 1 }), T('C', [], { times_used: 3 })];
    expect(templatesForMealType(lista, 'almoco').map((t) => t.name)).toEqual(['B', 'A', 'C']);
    expect(templatesForMealType(lista, 'jantar').map((t) => t.name)).toEqual(['A', 'C', 'B']);
  });

  it('saveMealTemplate grava nome, chave e itens limpos; recusa sem nome ou sem alimentos', async () => {
    db.calls.length = 0;
    await saveMealTemplate({ userId: 'u1', values: { name: 'Pequeno-almoço de treino', default_meal_type: 'pequeno-almoco', items: [{ name: 'Aveia em flocos', grams: '40' }] } });
    expect(db.calls.find((c) => c.table === 'athlete_meal_templates' && c.op === 'insert').row).toMatchObject({
      user_id: 'u1', name: 'Pequeno-almoço de treino', name_key: 'pequeno almoco de treino', default_meal_type: 'pequeno-almoco',
      items: [{ food_id: null, name: 'Aveia em flocos', grams: 40 }],
    });
    // A editar não manda user_id (com o perfil por carregar ia a null).
    db.calls.length = 0;
    await saveMealTemplate({ userId: undefined, existing: { id: 't1' }, values: { name: 'Outro nome', items: [{ name: 'Mel', grams: 10 }] } });
    const upd = db.calls.find((c) => c.table === 'athlete_meal_templates' && c.op === 'update');
    expect(upd.row).toMatchObject({ name: 'Outro nome', items: [{ food_id: null, name: 'Mel', grams: 10 }] });
    expect('user_id' in upd.row).toBe(false);
    await expect(saveMealTemplate({ userId: 'u1', values: { name: ' ', items: [{ name: 'Mel' }] } })).rejects.toThrow('Dá um nome');
    await expect(saveMealTemplate({ userId: 'u1', values: { name: 'Vazia', items: [] } })).rejects.toThrow('pelo menos um alimento');
  });
});

describe('isDishlessRule (bug #74, revisão)', () => {
  const r = (topic, extra = {}) => ({ topic, status: 'confirmado', source: 'resposta', ...extra });
  it('um hábito de preparação aprendido sem prato fica marcado; quantidade, com prato, de categoria ou escrito por ele não', () => {
    expect(isDishlessRule(r('tempero'))).toBe(true);
    expect(isDishlessRule(r('molho'))).toBe(true);
    // Quantidade é da própria manteiga, quando vem à parte: a Carol usa-a.
    expect(isDishlessRule(r('manteiga · quantidade'))).toBe(false);
    expect(isDishlessRule(r('tempero (Salada mista)'))).toBe(false);
    expect(isDishlessRule(r('fritos'))).toBe(false);
    expect(isDishlessRule(r('azeite', { source: 'manual' }))).toBe(false);
    expect(isDishlessRule(r('tempero', { status: 'varia' }))).toBe(false);
  });
});

describe('isQuantityRule e ruleLabel: plural e a forma antiga (revisão do #74)', () => {
  it('reconhece "· quantidade", "quantidades" e "quantidade de X", e mostra só o alimento', () => {
    expect(isQuantityRule({ topic: 'manteiga · quantidade' })).toBe(true);
    expect(isQuantityRule({ topic: 'manteiga · quantidades' })).toBe(true);
    expect(isQuantityRule({ topic: 'quantidade de manteiga' })).toBe(true);
    expect(isQuantityRule({ topic: 'tempero (Salada mista)' })).toBe(false);
    expect(ruleLabel({ topic: 'manteiga · quantidades' })).toBe('manteiga');
    expect(ruleLabel({ topic: 'quantidade de manteiga' })).toBe('manteiga');
    expect(ruleLabel({ topic: 'quantidade dos ovos' })).toBe('ovos');
    expect(ruleLabel({ topic: 'quantidade das natas' })).toBe('natas');
    expect(isDishlessRule({ topic: 'quantidade de manteiga', status: 'confirmado', source: 'resposta' })).toBe(false);
  });
});

describe('foodDefaultGrams — o peso habitual (bug #75)', () => {
  const arroz = { name: 'Arroz branco cozido', name_key: 'arroz branco cozido', portion_grams: 90 };
  const regra = (over) => ({ topic: 'Arroz branco cozido · quantidade', value: '150 g', status: 'confirmado', ...over });

  it('um hábito confirmado ganha à porção da despensa', () => {
    expect(foodDefaultGrams(arroz, [regra()])).toEqual({ grams: 150, habitual: true });
  });
  it('por confirmar, a variar, de outro alimento ou sem gramas: fica a porção', () => {
    expect(foodDefaultGrams(arroz, [regra({ status: 'por_confirmar' })])).toEqual({ grams: 90, habitual: false });
    expect(foodDefaultGrams(arroz, [regra({ status: 'varia' })])).toEqual({ grams: 90, habitual: false });
    expect(foodDefaultGrams(arroz, [regra({ topic: 'Batata · quantidade' })])).toEqual({ grams: 90, habitual: false });
    expect(foodDefaultGrams(arroz, [regra({ value: 'um prato' })])).toEqual({ grams: 90, habitual: false });
    expect(foodDefaultGrams({ name: 'X', name_key: 'x' }, [])).toEqual({ grams: null, habitual: false });
  });
});
