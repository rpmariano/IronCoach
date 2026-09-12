import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/* Guarda da passagem "animate" da auditoria.
 *
 * O handoff resolve prefers-reduced-motion pelos TOKENS: tokens/motion.css
 * redefine --dur-* para 120ms (ou zero) e os tempos calculados em JS lêem
 * prefersReducedMotion(). O globals.css tinha, por cima disso, o reset
 * universal de sempre — `*, *::before, *::after { animation-duration: .01ms
 * !important; transition-duration: .01ms !important }` — que apagava também
 * o feedback com significado (o check da confirmação de registo, a persiana
 * a abrir, a entrada de separador). "Menos e mais suave", nunca "nada".
 *
 * Este teste não desenha nada: só impede que o reset universal volte por
 * distração, e confirma que os tokens continuam a ser quem manda. */

const ler = (p) => readFileSync(resolve(__dirname, p), 'utf-8');

describe('movimento reduzido', () => {
  it('globals.css não volta a matar todas as animações com o seletor universal', () => {
    const css = ler('./globals.css');
    const blocos = css.split('@media (prefers-reduced-motion: reduce)').slice(1);
    expect(blocos.length).toBeGreaterThan(0);
    for (const bloco of blocos) {
      const corpo = bloco.slice(0, bloco.indexOf('\n}\n') + 1);
      expect(corpo).not.toMatch(/\*\s*,\s*\*::before/);
      expect(corpo).not.toMatch(/animation-duration:\s*\.01ms/);
      expect(corpo).not.toMatch(/transition-duration:\s*\.01ms/);
    }
  });

  it('os tokens continuam a encurtar as durações sob movimento reduzido', () => {
    const css = ler('./tokens/motion.css');
    const bloco = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(bloco).toContain('--dur-confirm: 120ms');
    expect(bloco).toContain('--dur-sheet-open: 120ms');
    expect(bloco).toContain('--dur-tab-content: 120ms');
  });

  it('os loops decorativos param — em movimento reduzido e com a página escondida', () => {
    const css = ler('./globals.css');
    expect(css).toMatch(/\.coach-wave-ring\s*\{\s*animation-iteration-count:\s*1\s*!important/);
    expect(css).toContain('html[data-page-hidden] .coach-wave-ring');
    // O impulso único que substituiu o animate-bounce corre uma só vez.
    expect(css).toMatch(/\.coach-nudge\s*\{[^}]*var\(--dur-confirm\)[^}]*\s1\s/);
  });
});
