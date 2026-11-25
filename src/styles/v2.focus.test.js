import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* A regra global do v2 tira as sombras, mas não o foco (revisão do P1, 2026-11-25): os anéis
   focus-visible:ring-* do Tailwind são box-shadow, e um campo ou um botão com foco pelo teclado têm
   de ter um indicador visível. O jsdom não calcula :focus-visible, por isso lê-se a folha. */
const css = readFileSync(resolve(__dirname, 'v2.css'), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('v2.css — o foco', () => {
  it('a regra que tira as sombras exclui o foco', () => {
    const shadow = rules.split('}').find((r) => /box-shadow:\s*none\s*!important/.test(r) && /shadow-\[/.test(r));
    expect(shadow).toBeTruthy();
    const selectors = shadow.split('{')[0].split(',').map((s) => s.trim()).filter(Boolean);
    for (const sel of selectors) expect(sel).toMatch(/:not\(:focus-visible\)$/);
  });

  it('há um contorno de foco do v2 em tudo o que recebe foco pelo teclado', () => {
    expect(rules).toMatch(/html\.design-v2 :focus-visible\s*\{\s*outline:\s*2px solid var\(--v2-acc\)/);
  });

  it('a regra das caixas aninhadas não toca em controlos, ligações, papéis ARIA, estados nem caixas tingidas', () => {
    const nested = rules.split('}').find((r) => /border-color:\s*transparent\s*!important/.test(r));
    for (const x of ['button', 'label', 'a,', '[role]', '[aria-checked]', '[aria-selected]', '[aria-pressed]', '[class*="tint-"]']) {
      expect(nested).toContain(x);
    }
  });
});
