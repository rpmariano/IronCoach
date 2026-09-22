/* `buildBadgesContext` — o bloco de badges que entra no prompt da Carol.
 *
 * Vitest-only (*.spec.ts), pela mesma razão dos testes das fórmulas: o
 * `deno test` recolhe só `**\/*.test.ts` (supabase/functions/deno.json), e
 * estes asserts são de Vitest. A montagem de `fetchChatMemoryBlocks` com o
 * Supabase falso continua do lado Deno, em `carolMemory.test.ts`.
 *
 * O que estes testes protegem não é a formatação — é a REGRA: o bloco diz o
 * que já foi ganho e nunca o que falta, porque é a ausência do número que
 * cumpre o R1 e o R3 da doutrina 6 #6. Um teste que só verificasse texto
 * deixaria passar um "faltam-te X" acrescentado por distração.
 */

import { describe, it, expect } from 'vitest';
import { buildBadgesContext } from './carolMemory.ts';

const linha = (badge_key: string, extra: Record<string, unknown> = {}) => ({
  badge_key,
  tier: '',
  period_key: '',
  awarded_at: '2026-09-20T10:00:00Z',
  ...extra,
});

describe('buildBadgesContext — o vazio', () => {
  it('não devolve bloco nenhum sem badges', () => {
    expect(buildBadgesContext([])).toBeNull();
    expect(buildBadgesContext(null)).toBeNull();
    expect(buildBadgesContext(undefined)).toBeNull();
  });

  it('ignora linhas sem chave e chaves que o catálogo não conhece', () => {
    expect(buildBadgesContext([linha('badge_do_futuro'), { tier: '' }, null])).toBeNull();
  });
});

describe('buildBadgesContext — o que mostra', () => {
  it('agrupa por família, pela ordem da Vitrina', () => {
    const texto = buildBadgesContext([
      linha('numero_certo'),
      linha('escalada', { tier: 'bronze' }),
      linha('semana_100', { period_key: '2026-09-14' }),
      linha('z2_mestre', { period_key: 'run-1' }),
    ])!;
    const pos = (s: string) => texto.indexOf(s);
    expect(pos('- Desempenho:')).toBeGreaterThan(-1);
    expect(pos('- Desempenho:')).toBeLessThan(pos('- Disciplina:'));
    expect(pos('- Disciplina:')).toBeLessThan(pos('- Acumulação:'));
    expect(pos('- Acumulação:')).toBeLessThan(pos('- Amuletos:'));
  });

  it('dá o nome do badge, o nível e a data da última vez', () => {
    const texto = buildBadgesContext([linha('escalada', { tier: 'bronze', awarded_at: '2026-08-03T09:00:00Z' })])!;
    expect(texto).toContain('A Escalada (bronze, a última a 2026-08-03)');
  });

  it('conta as repetições por linha, e mostra só a mais recente', () => {
    const texto = buildBadgesContext([
      linha('semana_100', { period_key: '2026-09-07', awarded_at: '2026-09-07T10:00:00Z' }),
      linha('semana_100', { period_key: '2026-09-14', awarded_at: '2026-09-14T10:00:00Z' }),
      linha('semana_100', { period_key: '2026-08-31', awarded_at: '2026-08-31T10:00:00Z' }),
    ])!;
    expect(texto).toContain('Semana 100% (3×, a última a 2026-09-14)');
  });

  it('num badge com escala mostra o maior nível, e conta só as desse nível', () => {
    const texto = buildBadgesContext([
      linha('escalada', { tier: 'bronze', awarded_at: '2026-01-10T10:00:00Z' }),
      linha('escalada', { tier: 'ouro', awarded_at: '2026-09-01T10:00:00Z' }),
      linha('escalada', { tier: 'prata', awarded_at: '2026-05-04T10:00:00Z' }),
    ])!;
    expect(texto).toContain('A Escalada (ouro,');
    expect(texto).not.toContain('3×');
  });
});

describe('buildBadgesContext — o que NUNCA mostra (6 #6)', () => {
  const todos = [
    linha('z2_mestre', { period_key: 'run-1' }),
    linha('semana_100', { period_key: '2026-09-14' }),
    linha('escalada', { tier: 'prata' }),
    linha('coruja', { tier: 'bronze' }),
  ];

  /* As asserções abaixo são sobre a metade dos DADOS, não sobre o bloco
     inteiro: o texto das regras contém de propósito as palavras proibidas
     ("não dizes 'faltam-te X km/metros'"), e é aí que elas têm de estar. O
     que não pode existir é um número por conquistar nas linhas de cima. */
  const dados = (rows: unknown[]) => buildBadgesContext(rows)!.split('REGRAS (')[0];

  it('não deixa entrar o `value` — é o número que faria um "faltam-te X"', () => {
    const texto = dados(todos.map((r) => ({ ...r, value: 12345, value_unit: 'metros' })));
    expect(texto).not.toContain('12345');
    expect(texto).not.toContain('metros');
  });

  it('não fala de alvo, de progresso nem do que falta', () => {
    const texto = dados(todos).toLowerCase();
    for (const proibido of ['faltam', 'progresso', 'alvo', 'a caminho', 'próximo degrau']) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  /* O cabeçalho diz "o que falta para o próximo NÃO te é dado" — é a frase
     que explica a ausência, e tem de sobreviver a qualquer reescrita. */
  it('avisa no cabeçalho que a ausência do progresso é intencional', () => {
    expect(dados(todos)).toContain('o que falta para o próximo NÃO te é dado, e isso é intencional');
  });

  it('carrega as três regras com os dados, no mesmo bloco', () => {
    const texto = buildBadgesContext(todos)!;
    // R1 e R3 — as duas famílias que ela não propõe, nomeadas.
    expect(texto).toContain('Acumulação e Amuletos');
    expect(texto).toContain('nunca proponhas antes');
    // A exceção: perguntado diretamente, responde sem encorajar.
    expect(texto).toContain('sem nenhum encorajamento');
    // O que ela PODE sugerir.
    expect(texto).toContain('Desempenho e Disciplina podes sugerir');
    // R2 — o padrão, não o número.
    expect(texto).toContain('ACELERAÇÃO NO FIM DO PERÍODO');
    expect(texto).toContain('comenta O PADRÃO, não o número');
  });

  it('põe as regras mesmo quando o atleta só tem badges que ela pode sugerir', () => {
    const texto = buildBadgesContext([linha('z2_mestre', { period_key: 'run-1' })])!;
    expect(texto).toContain('Acumulação e Amuletos');
    expect(texto).toContain('ACELERAÇÃO NO FIM DO PERÍODO');
  });
});
