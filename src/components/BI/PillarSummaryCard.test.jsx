import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PillarSummaryCard from './PillarSummaryCard';

/* O cartão de pilar do Geral (2026-10-04, fase 6): além do `delta` em texto
   (kg/sem do Corpo), aceita o ▲/▼ face ao período anterior com a seta escondida
   do leitor de ecrã, e o subtítulo em várias linhas (uma por frase). */

const base = { title: 'Corrida', icon: <span />, kpi: '12,4', kpiUnit: 'km esta sem.', badge: { label: 'ACWR Ideal', color: 'green' }, onClick: () => {} };

describe('PillarSummaryCard', () => {
  it('delta em texto continua a funcionar (Corpo: "−2,3 kg/sem")', () => {
    render(<PillarSummaryCard {...base} delta="−2,3 kg/sem" subtitle="Uma frase" />);
    expect(screen.getByText('−2,3 kg/sem')).toBeInTheDocument();
    expect(screen.queryByTestId('pillar-delta')).not.toBeInTheDocument();
  });

  it('delta ▲/▼: seta visível, frase por extenso para o leitor de ecrã, cor cinzenta por omissão', () => {
    render(
      <PillarSummaryCard
        {...base}
        delta={{ direction: 'up', text: '8,2 km face à semana anterior', spoken: 'Subiu 8,2 km face à semana anterior' }}
      />,
    );
    const delta = screen.getByTestId('pillar-delta');
    expect(delta).toHaveAttribute('data-direction', 'up');
    const visible = delta.querySelector('[aria-hidden="true"]');
    expect(visible).toHaveTextContent('▲ 8,2 km face à semana anterior');
    expect(delta.querySelector('.sr-only')).toHaveTextContent('Subiu 8,2 km face à semana anterior');
    expect(delta.style.color).toBe('var(--text-4)');
  });

  it('com better="up" a subida é verde e a descida coral; igual é cinzento', () => {
    const { rerender } = render(<PillarSummaryCard {...base} delta={{ direction: 'up', better: 'up', text: 'a', spoken: 'a' }} />);
    expect(screen.getByTestId('pillar-delta').style.color).toBe('var(--ok)');
    rerender(<PillarSummaryCard {...base} delta={{ direction: 'down', better: 'up', text: 'a', spoken: 'a' }} />);
    expect(screen.getByTestId('pillar-delta').style.color).toBe('var(--warn)');
    rerender(<PillarSummaryCard {...base} delta={{ direction: 'flat', better: 'up', text: 'igual a x', spoken: 'Igual a x' }} />);
    const d = screen.getByTestId('pillar-delta');
    expect(d.style.color).toBe('var(--text-4)');
    expect(d.querySelector('[aria-hidden="true"]')).toHaveTextContent('= igual a x');
  });

  it('subtítulo em várias linhas: uma <p> por frase, sem vazias', () => {
    render(<PillarSummaryCard {...base} subtitle={['2 corridas esta semana', '', null, 'ACWR no fim dessa semana']} />);
    const card = screen.getByRole('button');
    const linhas = within(card).getAllByText(/corridas|ACWR no fim/);
    expect(linhas).toHaveLength(2);
    expect(card.querySelectorAll('p')).toHaveLength(2);
  });

  it('subtítulo em texto simples e sem subtítulo', () => {
    const { rerender } = render(<PillarSummaryCard {...base} subtitle="Sem corridas esta semana" />);
    expect(screen.getByText('Sem corridas esta semana')).toBeInTheDocument();
    rerender(<PillarSummaryCard {...base} />);
    expect(screen.getByRole('button').querySelectorAll('p')).toHaveLength(0);
  });

  it('o alvo de toque tem pelo menos 44 px e o clique chama onClick', () => {
    let clicks = 0;
    render(<PillarSummaryCard {...base} onClick={() => { clicks++; }} />);
    const b = screen.getByRole('button');
    expect(b.className).toMatch(/min-h-\[44px\]/);
    b.click();
    expect(clicks).toBe(1);
  });
});
