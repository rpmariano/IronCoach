import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Medalhao, { MedalhaoDefs } from './Medalhao';

/* O artwork do medalhão: a estrela ganha é o facto, o encaixe vazio é o
   objetivo — os dois têm de se contar certos, e o leitor de ecrã tem de
   ouvir o mesmo que se vê. */

const SLOTS = [
  { key: 'mes', label: 'mês', state: 'won', enamel: 'amber', valueLabel: '182 km' },
  { key: 'trimestre', label: 'trimestre', state: 'won', enamel: 'cyan', valueLabel: '410 km' },
  { key: 'semestre', label: 'semestre', state: 'empty' },
  { key: 'ano', label: 'ano', state: 'empty' },
];

describe('Medalhao', () => {
  it('grande: estrelas ganhas com o número gravado, encaixes vazios, fita e gravação', () => {
    const { container } = render(<Medalhao size="lg" ribbon engraving="O Ano em Km" year={2026} footer="1 240 km corridos" slots={SLOTS} />);
    const el = screen.getByRole('img');
    expect(el).toHaveAttribute('aria-label', 'O Ano em Km: 2 de 4 medalhas, mês 182 km, trimestre 410 km');
    expect(container.querySelectorAll('[data-medal-star]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-medal-socket]')).toHaveLength(2);
    expect(container.querySelector('[data-medal-star="amber"] text')).toHaveTextContent('182');
    expect(container.querySelector('[data-medal-star="cyan"] text')).toHaveTextContent('410');
    expect(container.querySelector('.ic-medal-ribbon')).toBeInTheDocument();
    expect(el).toHaveTextContent('O Ano em Km');
    expect(el).toHaveTextContent('2026');
  });

  it('pequeno: sem fita nem número, prata sem esmalte, e só 4 encaixes à vista', () => {
    const epoca = [
      { key: 'r1', state: 'won', enamel: 'silver' },
      { key: 'r2', state: 'won', enamel: 'silver' },
      { key: 'r3', state: 'empty' },
      { key: 'r4', state: 'empty' },
      { key: 'r5', state: 'empty' },
    ];
    const { container } = render(<Medalhao size="sm" engraving="A Época" slots={epoca} />);
    expect(container.querySelector('.ic-medal-ribbon')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-medal-star="silver"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-medal-socket]')).toHaveLength(2);
    expect(container.querySelector('text')).toBeNull();
    // O aria-label conta todos os encaixes, mesmo os que ainda não se desenham.
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'A Época: 2 de 5 medalhas');
  });

  it('um aria-label dado substitui o calculado', () => {
    render(<Medalhao size="sm" slots={SLOTS} ariaLabel="Etiqueta própria" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Etiqueta própria');
  });

  it('MedalhaoDefs tem as formas com ids prefixados', () => {
    const { container } = render(<MedalhaoDefs />);
    for (const id of ['star-ag', 'star-socket', 'amber', 'cyan', 'star-drop', 'inset-deep', 'rib-a', 'rib-b']) {
      expect(container.querySelector(`#ic-medal-${id}`)).not.toBeNull();
    }
  });
});
