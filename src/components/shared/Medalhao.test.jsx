import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Medalhao, { MedalhaoDefs, slotPosition, STAR_DIAMETER, LG_POSITIONS, SM_POSITIONS } from './Medalhao';

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

  it('pequeno: sem fita nem número, prata sem esmalte, e com 5 encaixes desenha os 5 (anel)', () => {
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
    expect(container.querySelectorAll('[data-medal-socket]')).toHaveLength(3);
    expect(container.querySelector('text')).toBeNull();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'A Época: 2 de 5 medalhas');
  });

  it('um aria-label dado substitui o calculado', () => {
    render(<Medalhao size="sm" slots={SLOTS} ariaLabel="Etiqueta própria" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Etiqueta própria');
  });

  it('mais de 8 provas: desenha 8, o aria-label conta todas; e em anel sai o rodapé', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ key: `r${i}`, state: i < 3 ? 'won' : 'empty', enamel: 'silver' }));
    const { container } = render(<Medalhao size="lg" engraving="A Época" footer="3 provas" slots={many} />);
    expect(container.querySelectorAll('[data-medal-star]').length + container.querySelectorAll('[data-medal-socket]').length).toBe(8);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'A Época: 3 de 10 medalhas');
    expect(container.querySelector('.ic-medal-engrave--footer')).toBeNull();
  });

  it('até 4 encaixes o rodapé continua gravado', () => {
    const { container } = render(<Medalhao size="lg" engraving="O Ano em Km" footer="1 240 km corridos" slots={SLOTS} />);
    expect(container.querySelector('.ic-medal-engrave--footer')).toHaveTextContent('1 240 km corridos');
  });

  it('MedalhaoDefs tem as formas com ids prefixados', () => {
    const { container } = render(<MedalhaoDefs />);
    for (const id of ['star-ag', 'star-socket', 'amber', 'cyan', 'star-drop', 'inset-deep', 'rib-a', 'rib-b']) {
      expect(container.querySelector(`#ic-medal-${id}`)).not.toBeNull();
    }
  });
});

/* A Época com 5–8 provas: os encaixes em anel à volta da gravação. Nenhuma
   estrela pode tocar na vizinha, e a primeira fica em cima. */
describe('slotPosition — o anel', () => {
  const CENTER = { lg: [150, 150, 92], sm: [48, 48, 27] };

  it('até 4 são as diagonais de sempre, à escala de sempre', () => {
    [0, 1, 2, 3].forEach((i) => {
      expect(slotPosition(i, 4, 'lg')).toEqual({ x: LG_POSITIONS[i][0], y: LG_POSITIONS[i][1], scale: 1 });
      expect(slotPosition(i, 4, 'sm')).toEqual({ x: SM_POSITIONS[i][0], y: SM_POSITIONS[i][1], scale: 1 });
    });
  });

  for (const size of ['lg', 'sm']) {
    for (const n of [5, 6, 8]) {
      it(`${size}, ${n} encaixes: no círculo, o 1.º em cima, sentido horário, sem sobreposição`, () => {
        const [cx, cy, r] = CENTER[size];
        const pts = Array.from({ length: n }, (_, i) => slotPosition(i, n, size));
        const { scale } = pts[0];
        expect(scale).toBeGreaterThan(0);
        expect(scale).toBeLessThanOrEqual(1);
        pts.forEach((p) => {
          expect(p.scale).toBe(scale);
          expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(r, 0);
        });
        expect(pts[0].x).toBeCloseTo(cx, 5);
        expect(pts[0].y).toBeCloseTo(cy - r, 0);
        expect(pts[1].x).toBeGreaterThan(cx); // o 2.º à direita: sentido dos ponteiros
        const diameter = STAR_DIAMETER[size] * scale;
        for (let a = 0; a < n; a += 1) {
          for (let b = a + 1; b < n; b += 1) {
            expect(Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y)).toBeGreaterThanOrEqual(diameter);
          }
        }
      });
    }
  }

  it('com 8 as estrelas encolhem; com 5 ficam à escala das diagonais (nunca crescem)', () => {
    expect(slotPosition(0, 5, 'lg').scale).toBe(1);
    expect(slotPosition(0, 8, 'lg').scale).toBeLessThan(1);
    expect(slotPosition(0, 8, 'sm').scale).toBeLessThan(1);
  });
});
