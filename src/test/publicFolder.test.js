import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/* Auditoria de segurança M5 (2026-11-14): os 17 mockups de conceitos em public/ eram publicados
   com a app (GitHub Pages serve tudo o que lá está). Vivem agora em specs/mockups/. Nenhum HTML
   solto volta a public/ — a única página é o index.html da raiz. */
describe('public/ — sem páginas soltas', () => {
  it('não há ficheiros .html em public/', () => {
    const htmlIn = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return htmlIn(p);
      return e.name.toLowerCase().endsWith('.html') ? [p] : [];
    });
    expect(htmlIn(join(process.cwd(), 'public'))).toEqual([]);
  });
});
