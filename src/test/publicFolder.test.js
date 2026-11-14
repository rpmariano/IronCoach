import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

/* Auditoria de segurança M5 (2026-11-14): os 17 mockups de conceitos em public/ eram publicados
   com a app (GitHub Pages serve tudo o que lá está). Vivem agora em specs/mockups/. Nenhum HTML
   solto volta a public/ — a única página é o index.html da raiz.
   Conta o que o git segue: é isso que o workflow publica. Uma pasta local ignorada pelo
   .gitignore (public/carol/, os ensaios da Carol) nunca chega ao GitHub Pages. */
describe('public/ — sem páginas soltas', () => {
  it('não há ficheiros .html versionados em public/', () => {
    const tracked = execFileSync('git', ['ls-files', 'public'], { cwd: process.cwd(), encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.toLowerCase().endsWith('.html'));
    expect(tracked).toEqual([]);
  });
});
