import { describe, it, expect } from 'vitest';
import { colapsarMedios, easeBack, escalaDoAward, partesDoNumero, planBadgeMoments, textoContado } from './badgeMoment';

/* As regras do momento do badge (fase 4 da reforma da gamificação).

   O que estes testes guardam:

   1. a FAMÍLIA decide — um amuleto nunca para o ecrã, por mais estreia que
      seja (é a mesma regra da doutrina 6 #6 vista do lado do ecrã);
   2. a estreia, o ouro e a prova são o que merece a escala grande;
   3. os grandes em FILA e os médios COLAPSADOS, que foi o que se decidiu com
      o utilizador;
   4. o número conta-se sem estragar o "k", o "s" nem o "/7". */

const award = (over = {}) => ({
  id: 'a1', badge_key: 'z2_mestre', tier: '', period_key: 'run-1', value: 94,
  value_unit: 'pct', race_id: null, awarded_at: '2026-09-20T12:00:00.000Z',
  title: 'Mestre da Z2', line: '94% do treino em Z1-Z2.', ...over,
});

const badge = (over = {}) => ({ key: 'z2_mestre', name: 'Mestre da Z2', familia: 'desempenho', cor: 'run', count: 1, centro: '94', ...over });

describe('escalaDoAward — a família decide', () => {
  it('um amuleto nunca leva a escala grande, nem na estreia nem no ouro', () => {
    const amuleto = badge({ key: 'coruja', familia: 'amuletos', cor: 'neutro' });
    expect(escalaDoAward(award({ badge_key: 'coruja' }), amuleto, { primeiraVez: true })).toBe('medio');
    expect(escalaDoAward(award({ badge_key: 'coruja', tier: 'ouro' }), amuleto, { primeiraVez: true })).toBe('medio');
  });

  it('o ouro, a estreia e o que nasce de uma prova param o ecrã', () => {
    expect(escalaDoAward(award({ tier: 'ouro' }), badge({ count: 3 }))).toBe('grande');
    expect(escalaDoAward(award(), badge(), { primeiraVez: true })).toBe('grande');
    expect(escalaDoAward(award({ race_id: 'p2' }), badge({ key: 'recorde_pessoal', cor: 'race', count: 4 }))).toBe('grande');
  });

  it('uma repetição sem nível de ouro é um cartão', () => {
    expect(escalaDoAward(award(), badge({ count: 5 }), { primeiraVez: false })).toBe('medio');
    expect(escalaDoAward(award({ tier: 'prata' }), badge({ count: 2 }))).toBe('medio');
  });
});

describe('planBadgeMoments — a estreia é a que nunca foi vista', () => {
  it('com todas as ocorrências por ver, a mais antiga é a estreia e as outras são repetições', () => {
    const pending = [
      award({ id: 'a2', period_key: 'run-2', awarded_at: '2026-09-21T12:00:00.000Z' }),
      award({ id: 'a1', period_key: 'run-1', awarded_at: '2026-09-19T12:00:00.000Z' }),
    ];
    const plano = planBadgeMoments(pending, [badge({ count: 2 })]);
    expect(plano.todos.map((e) => e.award.id)).toEqual(['a1', 'a2']);
    expect(plano.grandes.map((e) => e.award.id)).toEqual(['a1']);
    expect(plano.medios.map((e) => e.award.id)).toEqual(['a2']);
  });

  it('com uma já vista, a nova é só mais uma', () => {
    // count 3 e uma só por ver: duas já foram vistas.
    const plano = planBadgeMoments([award({ id: 'a3' })], [badge({ count: 3 })]);
    expect(plano.grandes).toHaveLength(0);
    expect(plano.medios).toHaveLength(1);
  });

  it('um badge que o cálculo já não conhece não rebenta nada — fica um cartão', () => {
    const plano = planBadgeMoments([award({ badge_key: 'desaparecido' })], []);
    expect(plano.medios).toHaveLength(1);
    expect(plano.medios[0].badge).toBeNull();
  });
});

describe('colapsarMedios — os médios num cartão só', () => {
  it('um badge mostra-se a si próprio', () => {
    const plano = planBadgeMoments([award({ id: 'a9' })], [badge({ count: 4 })]);
    const c = colapsarMedios(plano.medios);
    expect(c).toMatchObject({ n: 1, titulo: 'Mestre da Z2', linha: '94% do treino em Z1-Z2.', ids: ['a9'] });
  });

  it('dois ou mais dizem quantos são, e os nomes por baixo', () => {
    const c = colapsarMedios([
      { award: award({ id: 'a1', title: 'Mestre da Z2' }), badge: badge() },
      { award: award({ id: 'a2', title: 'Semana 100%' }), badge: badge({ key: 'semana_100' }) },
    ]);
    expect(c.titulo).toBe('2 badges novos');
    expect(c.linha).toBe('Mestre da Z2 · Semana 100%');
    expect(c.ids).toEqual(['a1', 'a2']);
  });

  it('acima de três nomes, os que sobram contam-se', () => {
    const c = colapsarMedios(['A', 'B', 'C', 'D', 'E'].map((t, i) => ({ award: award({ id: `a${i}`, title: t }), badge: badge() })));
    expect(c.titulo).toBe('5 badges novos');
    expect(c.linha).toBe('A · B · C · e mais 2');
  });

  it('sem médios não há cartão', () => {
    expect(colapsarMedios([])).toBeNull();
  });
});

describe('o número a contar', () => {
  it('conta só a parte numérica e deixa o resto quieto', () => {
    expect(textoContado('94', 0)).toBe('0');
    expect(textoContado('94', 0.5)).toBe('47');
    expect(textoContado('94', 1)).toBe('94');
    expect(textoContado('12k', 0.5)).toBe('6k');
    expect(textoContado('9,8k', 1)).toBe('9,8k');
    expect(textoContado('9,8k', 0.5)).toBe('4,9k');
    expect(textoContado('+42s', 1)).toBe('+42s');
    expect(textoContado('5/7', 1)).toBe('5/7');
  });

  it('sem número nenhum, o texto fica como está', () => {
    expect(partesDoNumero('—')).toBeNull();
    expect(textoContado('—', 0)).toBe('—');
    expect(textoContado(undefined, 0.3)).toBe('');
  });

  /* A mesma curva do anel (--ease-back): os dois partem juntos e chegam
     juntos. O que importa é começar em 0, acabar em 1 e nunca recuar. */
  it('a curva do anel começa em 0, acaba em 1 e não recua', () => {
    expect(easeBack(0)).toBe(0);
    expect(easeBack(1)).toBe(1);
    let anterior = 0;
    for (let i = 1; i <= 20; i += 1) {
      const v = easeBack(i / 20);
      expect(v).toBeGreaterThanOrEqual(anterior);
      anterior = v;
    }
    // Sai depressa e abranda no fim, como o anel.
    expect(easeBack(0.5)).toBeGreaterThan(0.5);
  });
});
