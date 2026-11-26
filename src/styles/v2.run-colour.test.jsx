import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setDesignV2, runHex, runRgb, V2_RUN_HEX } from '../utils/designV2';
import Button from '../components/shared/Button';
import AddButton from '../components/shared/AddButton';

/* P2 da 2.ª crítica (decisão do Rui, 2026-11-26): no v2 a corrida tem um ouro velho próprio (o
   ciano fica para a Carol e o foco), os links e o objetivo passam à tinta neutra, e as cores dos
   módulos deixam de encher botões. Na v1 nada muda. */

afterEach(() => act(() => setDesignV2(false)));

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const css = readFileSync(resolve(__dirname, 'v2.css'), 'utf8');

describe('O ouro da corrida no v2', () => {
  it('o token vive em v2.css e o --run só se redefine dentro do html.design-v2', () => {
    expect(css).toMatch(/--v2-run: #b8994a;/);
    expect(css).toMatch(/--run: var\(--v2-run\);/);
    const global = readFileSync(resolve(__dirname, 'tokens/colors.css'), 'utf8');
    expect(global).toMatch(/--run: #2ee0ff;/);
  });

  it('contraste AA: sobre o fundo e o painel do v2, e a tinta escura sobre a cor cheia', () => {
    expect(V2_RUN_HEX).toBe('#b8994a');
    expect(ratio(V2_RUN_HEX, '#0d1420')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(V2_RUN_HEX, '#152031')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(V2_RUN_HEX, '#1f1704')).toBeGreaterThanOrEqual(4.5);
  });

  it('distinto do âmbar da prova e do --warn, e longe do ciano da Carol', () => {
    expect(ratio(V2_RUN_HEX, '#fbbf24')).toBeGreaterThan(1.5);
    expect(V2_RUN_HEX).not.toBe('#fbbf24');
    expect(V2_RUN_HEX).not.toBe('#fb7c4d');
    expect(V2_RUN_HEX).not.toBe('#22d3ee');
  });

  it('os gráficos: runHex/runRgb dão o ouro no v2 e o ciano na v1', () => {
    expect(runHex()).toBe('#2ee0ff');
    expect(runRgb()).toBe('46, 224, 255');
    act(() => setDesignV2(true));
    expect(runHex()).toBe('#b8994a');
    expect(runRgb()).toBe('184, 153, 74');
  });
});

describe('Os links e o objetivo na tinta neutra', () => {
  it('o objetivo e as ligações deixam o ciano; o que é da Carol fica', () => {
    expect(css).toMatch(/html\.design-v2 \.v2-hero-r b \{ color: var\(--v2-ink\); \}/);
    expect(css).toMatch(/html\.design-v2 \.v2-act\.is-acc,/);
    expect(css).toMatch(/color: var\(--v2-link\); text-decoration: underline;/);
    expect(css).toMatch(/html\.design-v2 \.v2-say \.v2-act\.is-acc,[\s\S]*?\{ color: var\(--v2-acc\); text-decoration: none; \}/);
  });
});

describe('As cores dos módulos não enchem botões', () => {
  it('v2: um botão com a cor da corrida fica discreto, com a cor só no ícone', () => {
    act(() => setDesignV2(true));
    render(<Button variant="module" moduleColor="var(--mod-corrida-to)" icon={<svg data-testid="ic" />}>Mais prints</Button>);
    const b = screen.getByRole('button', { name: 'Mais prints' });
    expect(b).toHaveClass('v2-btn-module');
    expect(b.style.background).toBe('');
    expect(screen.getByTestId('ic').parentElement.style.color).toBe('var(--mod-corrida-to)');
  });

  it('v2: a Carol e a prova continuam cheias', () => {
    act(() => setDesignV2(true));
    render(<Button variant="module" moduleColor="var(--race)">Registar a prova</Button>);
    const b = screen.getByRole('button', { name: 'Registar a prova' });
    expect(b).not.toHaveClass('v2-btn-module');
    expect(b.style.background).toBe('var(--race)');
  });

  it('v1: o botão de sempre, cheio com a cor do módulo', () => {
    render(<Button variant="module" moduleColor="var(--mod-corrida-to)">Mais prints</Button>);
    const b = screen.getByRole('button', { name: 'Mais prints' });
    expect(b).not.toHaveClass('v2-btn-module');
    expect(b.style.background).toBe('var(--mod-corrida-to)');
  });

  it('o «+ Adicionar»: v2 com o texto na tinta e a cor só no «+»; v1 como sempre', () => {
    act(() => setDesignV2(true));
    const { unmount } = render(<AddButton variant="run">Adicionar parcial</AddButton>);
    let b = screen.getByRole('button', { name: /Adicionar parcial/ });
    expect(b.className).toContain('text-[var(--v2-ink)]');
    expect(b.querySelector('span').style.color).toBe('var(--mod-corrida-to)');
    unmount();
    act(() => setDesignV2(false));
    render(<AddButton variant="run">Adicionar parcial</AddButton>);
    b = screen.getByRole('button', { name: /Adicionar parcial/ });
    expect(b.className).toContain('text-[var(--mod-corrida-to)]');
    expect(b.querySelector('span').getAttribute('style')).toBeNull();
  });
});
