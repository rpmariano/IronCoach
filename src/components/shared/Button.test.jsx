import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Button, { resolveModuleInk } from './Button';

/* O variant="module" pinta-se com a cor cheia do módulo, e essas seis cores
   são todas claras: sobre elas o handoff manda texto ESCURO ("o texto sobre a
   cor cheia é escuro — --race-ink, --coach-ink"). Até ao impeccable polish o
   variant tinha `text-white` fixo, o que dava 1,59:1 sobre --run e 2,83:1
   sobre --body. A tinta certa é resolvida a partir do moduleColor recebido. */
describe('Button — variant="module" escolhe a tinta a partir do moduleColor', () => {
  it.each([
    ['var(--mod-corrida)', 'var(--run-ink)'],
    ['var(--mod-corrida-to)', 'var(--run-ink)'],
    ['var(--run)', 'var(--run-ink)'],
    ['var(--mod-ginasio-to)', 'var(--gym-ink)'],
    ['var(--mod-nutricao)', 'var(--nutrition-ink)'],
    ['var(--mod-corpo-to)', 'var(--body-ink)'],
    ['var(--mod-prova)', 'var(--race-ink)'],
    ['var(--grad-race)', 'var(--race-ink)'],
    ['var(--mod-coach-to)', 'var(--coach-ink)'],
    ['var(--grad-coach-legible)', 'var(--coach-ink)'],
    ['var(--ok)', 'var(--ok-ink)'],
  ])('%s → %s', (moduleColor, ink) => {
    expect(resolveModuleInk(moduleColor)).toBe(ink);
  });

  it('um gradiente do Coach continua a resolver para a tinta do Coach', () => {
    expect(resolveModuleInk('linear-gradient(135deg, var(--mod-coach-from), var(--mod-coach-to))'))
      .toBe('var(--coach-ink)');
  });

  it('uma cor desconhecida cai na tinta do Coach (omissão segura: as cores desta app são todas claras)', () => {
    expect(resolveModuleInk('#ff00ff')).toBe('var(--coach-ink)');
  });

  it('sem moduleColor o botão não tem fundo próprio — fica com o texto normal', () => {
    expect(resolveModuleInk(undefined)).toBe('var(--text-1)');
  });

  it('aplica a tinta por style e já não força text-white', () => {
    render(<Button variant="module" moduleColor="var(--mod-corrida)">Nova corrida</Button>);
    const btn = screen.getByRole('button', { name: /nova corrida/i });
    expect(btn.style.color).toBe('var(--run-ink)');
    expect(btn.style.background).toBe('var(--mod-corrida)');
    expect(btn.className).not.toMatch(/\btext-white\b/);
  });

  it('o "primary" pede a tinta do --accent, não o texto claro que dava 2,06:1', () => {
    render(<Button variant="primary">Fechar</Button>);
    const btn = screen.getByRole('button', { name: /fechar/i });
    expect(btn.className).toMatch(/bg-\[var\(--accent\)\]/);
    expect(btn.className).toMatch(/text-\[var\(--accent-on\)\]/);
  });
});
