import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CarolCenasPreview from './CarolCenasPreview';

/* A pré-visualização das cenas da análise (?cenas=preview): 4 áreas × 4 modos, com o
   CarolCena real, cada célula com o seu «Repetir». */

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 804"><path d="M0 0 L9 9"/></svg>';
const originalMatchMedia = window.matchMedia;
const originalImage = global.Image;
const originalFetch = global.fetch;
let pedidos;

beforeEach(() => {
  pedidos = [];
  global.Image = class {
    set src(v) { this.naturalWidth = 600; this.naturalHeight = 804; queueMicrotask(() => this.onload?.()); }
  };
  global.fetch = vi.fn((url) => {
    pedidos.push(url);
    // Só a corrida tem os SVG; as outras áreas dão 404.
    return /corrida-/.test(url)
      ? Promise.resolve({ ok: true, text: () => Promise.resolve(SVG) })
      : Promise.resolve({ ok: false, text: () => Promise.resolve('') });
  });
  window.matchMedia = () => ({ matches: false });
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  global.Image = originalImage;
  global.fetch = originalFetch;
});
const flush = () => act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); });

describe('CarolCenasPreview', () => {
  it('16 células (4 áreas × 4 modos), cada uma com o modo forçado', async () => {
    render(<CarolCenasPreview />);
    await flush();
    for (const kind of ['run', 'gym', 'body', 'meal']) {
      for (const modo of ['mascara', 'traco', 'carreiras', 'pontos']) {
        expect(screen.getByTestId(`cena-celula-${kind}-${modo}`)).toBeInTheDocument();
      }
    }
    // A corrida tem os quatro; os gerados existem em todas as áreas.
    const corrida = screen.getByTestId('cena-celula-run-mascara');
    expect(within(corrida).getByTestId('carol-cena')).toHaveAttribute('data-modo', 'mascara');
    expect(within(screen.getByTestId('cena-celula-gym-pontos')).getByTestId('carol-cena')).toHaveAttribute('data-modo', 'pontos');
    expect(within(screen.getByTestId('cena-celula-body-carreiras')).getByTestId('carol-cena')).toHaveAttribute('data-modo', 'carreiras');
  });

  it('um modo sem o SVG da área diz «sem ficheiro» (e o traço forçado não cai noutro)', async () => {
    render(<CarolCenasPreview />);
    await flush();
    expect(within(screen.getByTestId('cena-celula-meal-traco')).getByText('sem ficheiro')).toBeInTheDocument();
    // A máscara forçada de uma área sem máscara cai no traço dela, e esse também falta.
    expect(within(screen.getByTestId('cena-celula-gym-mascara')).getByText('sem ficheiro')).toBeInTheDocument();
  });

  it('«Repetir» volta a montar só essa célula; «Repetir tudo» volta a montar todas', async () => {
    render(<CarolCenasPreview />);
    await flush();
    const antes = pedidos.length;
    fireEvent.click(screen.getByRole('button', { name: 'Repetir a animação Pontos (gym)' }));
    await flush();
    // Os pontos são gerados: não pedem SVG; a imagem volta a montar-se.
    expect(pedidos.length).toBe(antes);
    fireEvent.click(screen.getByRole('button', { name: 'Repetir a animação Traço (run)' }));
    await flush();
    expect(pedidos.length).toBe(antes + 1);
    const antesTudo = pedidos.length;
    fireEvent.click(screen.getByRole('button', { name: /Repetir tudo/ }));
    await flush();
    // Os traços e máscaras pedem os seus SVG outra vez: 4 traços + a máscara da corrida + (3 áreas sem máscara: máscara e depois traço) 3×2.
    expect(pedidos.length).toBe(antesTudo + 11);
  });

  it('movimento reduzido: avisa que só se vê a imagem final', async () => {
    window.matchMedia = () => ({ matches: true });
    render(<CarolCenasPreview />);
    await flush();
    expect(screen.getByRole('note')).toHaveTextContent('menos movimento');
    expect(within(screen.getByTestId('cena-celula-run-traco')).getByTestId('carol-cena')).toHaveAttribute('data-fase', 'final');
  });

  it('acessível: botões de 44 px com nome próprio por célula', async () => {
    render(<CarolCenasPreview />);
    await flush();
    const botoes = screen.getAllByRole('button', { name: /Repetir a animação/ });
    expect(botoes).toHaveLength(16);
    expect(botoes[0].style.minHeight).toBe('44px');
  });

  it('o seletor de borda: por omissão a escolhida (suaves com halo); escolher aplica às 16 células', async () => {
    render(<CarolCenasPreview />);
    await flush();
    const celulas = () => screen.getAllByTestId('carol-cena');
    // Nos testes só a corrida tem SVG: 4 + 3×2 gerados = 10 cenas montadas (as outras 6 dizem «sem ficheiro»).
    expect(screen.getAllByTestId(/^cena-celula-/)).toHaveLength(16);
    expect(celulas()).toHaveLength(10);
    expect(celulas().every((c) => c.getAttribute('data-borda') === 'suave-halo')).toBe(true);
    expect(screen.getByRole('radio', { name: /Suaves com halo/ })).toBeChecked();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    fireEvent.click(screen.getByRole('radio', { name: /Vinheta oval/ }));
    expect(celulas().every((c) => c.getAttribute('data-borda') === 'oval')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Halo/ }));
    expect(celulas().every((c) => c.getAttribute('data-borda') === 'halo')).toBe(true);
    expect(screen.getAllByTestId('carol-cena-brilho')).toHaveLength(10);
  });
});
