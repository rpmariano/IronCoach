import { describe, it, expect, afterEach } from 'vitest';
import { splitIntoBubbles, typingDelayFor, prefersReducedMotion, TYPING_MIN_MS, TYPING_MAX_MS } from './coachBubbles';

describe('coachBubbles — ritmo humano na escrita da Carol (CAROL.md §5)', () => {
  it('uma mensagem curta fica numa bolha só', () => {
    expect(splitIntoBubbles('Bom dia. Hoje é rodagem longa.')).toEqual(['Bom dia. Hoje é rodagem longa.']);
  });

  it('divide pelos parágrafos em branco — uma ideia por bolha', () => {
    const msg = 'Não gostei dos teus almoços esta semana.\n\nA ingestão ficou 12% abaixo do alvo nos dias longos.\n\nQueres que refaça a semana?';
    expect(splitIntoBubbles(msg)).toEqual([
      'Não gostei dos teus almoços esta semana.',
      'A ingestão ficou 12% abaixo do alvo nos dias longos.',
      'Queres que refaça a semana?',
    ]);
  });

  it('nunca passa de 3 bolhas: o resto junta-se à última', () => {
    const msg = 'Um.\n\nDois.\n\nTrês.\n\nQuatro.\n\nCinco.';
    const bubbles = splitIntoBubbles(msg);
    expect(bubbles).toHaveLength(3);
    expect(bubbles[2]).toBe('Três.\n\nQuatro.\n\nCinco.');
  });

  it('uma lista não abre bolha nova — fica presa ao parágrafo que a introduz', () => {
    const msg = 'O plano da semana:\n\n- seg: 8 km fácil\n- qua: intervalados\n\n- sáb: longo 16 km\n\nDiz-me se encaixa.';
    const bubbles = splitIntoBubbles(msg);
    expect(bubbles[0]).toContain('- seg: 8 km fácil');
    expect(bubbles[0]).toContain('- sáb: longo 16 km');
    // a frase a seguir a uma lista ainda pertence ao bloco da lista
    expect(bubbles[0]).toContain('Diz-me se encaixa.');
    expect(bubbles).toHaveLength(1);
  });

  it('um título em negrito não abre bolha sozinho', () => {
    const msg = 'Vamos ao que interessa.\n\n**Hoje**\n\nRodagem de 8 km a 5:40.';
    expect(splitIntoBubbles(msg)).toEqual(['Vamos ao que interessa.', '**Hoje**\n\nRodagem de 8 km a 5:40.']);
  });

  it('ignora espaços e linhas vazias a mais', () => {
    expect(splitIntoBubbles('  Olá.  \n\n\n\n   \n\nAdeus.  ')).toEqual(['Olá.', 'Adeus.']);
    expect(splitIntoBubbles('')).toEqual([]);
    expect(splitIntoBubbles(null)).toEqual([]);
  });

  it('"a escrever…" dura 600 a 900 ms, proporcional ao tamanho', () => {
    expect(typingDelayFor('')).toBe(TYPING_MIN_MS);
    expect(typingDelayFor('Estás bem?')).toBeGreaterThanOrEqual(TYPING_MIN_MS);
    expect(typingDelayFor('Estás bem?')).toBeLessThan(TYPING_MAX_MS);
    expect(typingDelayFor('x'.repeat(2000))).toBe(TYPING_MAX_MS);
  });

  describe('prefersReducedMotion', () => {
    const original = window.matchMedia;
    afterEach(() => {
      window.matchMedia = original;
    });

    it('sem matchMedia (jsdom, WebViews antigos) assume movimento reduzido — não anima', () => {
      window.matchMedia = undefined;
      expect(prefersReducedMotion()).toBe(true);
    });

    it('lê a media query quando existe', () => {
      window.matchMedia = () => ({ matches: false });
      expect(prefersReducedMotion()).toBe(false);
      window.matchMedia = () => ({ matches: true });
      expect(prefersReducedMotion()).toBe(true);
    });
  });
});
