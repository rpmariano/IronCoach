/* Paridade entre as regras dos badges (src/utils/badges.js) e o catálogo que
   a Carol lê (supabase/functions/_shared/badgeCatalog.ts).

   O catálogo é uma cópia deliberada — o Deno não importa o badges.js — e este
   teste é a única coisa que impede a cópia de derivar. Se ele parte, não se
   "arranja o teste": decide-se em que família cai o badge novo, porque é a
   família que diz se a Carol pode ou não falar dele (doutrina 6 #6). */

import { describe, it, expect } from 'vitest';
import { computeBadges, FAMILIA_KEYS, BADGE_KEYS } from './badges';
import {
  BADGE_CATALOG,
  FAMILIA_ORDER,
  FAMILIAS_QUE_NAO_SE_SUGEREM,
  familiaDoBadge,
  nomeDoBadge,
} from '../../supabase/functions/_shared/badgeCatalog.ts';

const badgesDaApp = () => computeBadges({ today: '2026-09-22' }).badges;

describe('badgeCatalog — paridade com src/utils/badges.js', () => {
  it('cobre exatamente as mesmas chaves, sem sobras de nenhum dos lados', () => {
    expect(Object.keys(BADGE_CATALOG).sort()).toEqual([...BADGE_KEYS].sort());
  });

  it('dá a cada badge o mesmo nome e a mesma família que a app', () => {
    for (const badge of badgesDaApp()) {
      expect(nomeDoBadge(badge.key), `nome de ${badge.key}`).toBe(badge.name);
      expect(familiaDoBadge(badge.key), `família de ${badge.key}`).toBe(badge.familia);
    }
  });

  it('usa as mesmas quatro famílias, pela mesma ordem', () => {
    expect(FAMILIA_ORDER).toEqual(FAMILIA_KEYS);
  });
});

describe('badgeCatalog — as famílias que a Carol não sugere (6 #6)', () => {
  it('são a acumulação (R1) e os amuletos (R3), e só essas', () => {
    expect([...FAMILIAS_QUE_NAO_SE_SUGEREM].sort()).toEqual(['acumulacao', 'amuletos']);
  });

  /* A regra é sobre a FAMÍLIA, não sobre a lista de chaves: um amuleto novo
     fica proibido no dia em que nasce, sem ninguém se lembrar de o vir cá
     inscrever. Este teste prova que a proibição apanha todos os que existem
     hoje — e o teste de paridade acima garante que não nasce nenhum fora do
     catálogo. */
  it('apanham A Escalada e os sete amuletos', () => {
    const proibidos = Object.entries(BADGE_CATALOG)
      .filter(([, e]) => FAMILIAS_QUE_NAO_SE_SUGEREM.includes(e.familia))
      .map(([k]) => k)
      .sort();
    expect(proibidos).toEqual([
      'anos', 'coruja', 'escalada', 'numero_certo',
      'quatro_estacoes', 'relogio_suico', 'solsticio', 'volta_ao_relogio',
    ]);
  });

  it('deixa de fora o desempenho e a disciplina, que ela pode sugerir', () => {
    for (const badge of badgesDaApp()) {
      const podeSugerir = !FAMILIAS_QUE_NAO_SE_SUGEREM.includes(badge.familia);
      expect(podeSugerir, `${badge.key} (${badge.familia})`)
        .toBe(badge.familia === 'desempenho' || badge.familia === 'disciplina');
    }
  });
});

describe('badgeCatalog — o que não conhece', () => {
  it('devolve null para uma chave desconhecida, em vez de adivinhar família', () => {
    expect(familiaDoBadge('badge_que_ainda_nao_existe')).toBeNull();
    expect(nomeDoBadge('badge_que_ainda_nao_existe')).toBeNull();
  });

  it('devolve null para o que nem sequer é uma chave', () => {
    for (const lixo of [null, undefined, 42, {}, []]) {
      expect(familiaDoBadge(lixo)).toBeNull();
      expect(nomeDoBadge(lixo)).toBeNull();
    }
  });
});
