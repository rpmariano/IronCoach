import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import MedalMoment from './MedalMoment';
import { slotPosition } from './Medalhao';
import { makeMedalhoes } from '../../test/medalhoesFixture';

/* O momento da medalha: toque salta para o fim, o segundo toque fecha, o
   botão leva ao Palmarés, e com movimento reduzido nada anima. */

const { medalhoes } = makeMedalhoes();
const ANO_KM = medalhoes[0];
const AWARD = { id: 'a1', medalhao: 'ano_km', slot: 'mes', period_key: '2026-08', value: 182, title: 'Mês recorde', line: '182 km em agosto — o teu melhor mês de sempre.' };

const setReducedMotion = (reduce) => {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
};

afterEach(() => {
  delete window.matchMedia;
});

describe('MedalMoment', () => {
  it('toque salta para o estado final; o segundo toque fecha', () => {
    setReducedMotion(false);
    const onClose = vi.fn();
    render(<MedalMoment award={AWARD} medalhao={ANO_KM} onClose={onClose} />);
    const moment = screen.getByTestId('medal-moment');
    expect(moment).toHaveAttribute('role', 'dialog');
    expect(moment).toHaveAttribute('data-final', 'false');
    expect(screen.getAllByTestId('medal-moment-spark')).toHaveLength(5);
    expect(screen.getByTestId('medal-moment-cta')).toHaveFocus();

    fireEvent.click(moment);
    expect(moment).toHaveAttribute('data-final', 'true');
    expect(screen.queryAllByTestId('medal-moment-spark')).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(moment);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o encaixe da medalha nova começa vazio e a estrela voa para ele', () => {
    setReducedMotion(false);
    const { baseElement } = render(<MedalMoment award={AWARD} medalhao={ANO_KM} onClose={() => {}} />);
    const disc = baseElement.querySelector('[data-testid="medalhao-lg"]');
    // Mês (o alvo) vazio + semestre + ano vazios; trimestre continua ganho.
    expect(disc.querySelectorAll('.ic-medal-stars [data-medal-socket]')).toHaveLength(3);
    expect(disc.querySelectorAll('.ic-medal-stars [data-medal-star]')).toHaveLength(1);
    expect(screen.getByTestId('medal-moment-star')).toHaveTextContent('182');
    expect(screen.getByTestId('medal-moment')).toHaveTextContent('Mês recorde');
    expect(screen.getByTestId('medal-moment')).toHaveTextContent('182 km em agosto — o teu melhor mês de sempre.');
  });

  it('A Época com 6 provas: a estrela da 6.ª voa para o lugar certo do anel', () => {
    setReducedMotion(false);
    const epoca = {
      key: 'epoca', name: 'A Época', engraving: "A Época '26", year: 2026,
      slots: Array.from({ length: 6 }, (_, i) => ({ key: `p${i + 1}`, label: `Prova ${i + 1}`, state: i < 5 ? 'won' : 'empty', enamel: 'silver', periodKey: `race-${i + 1}` })),
    };
    // Como o medalAwards grava A Época: slot 'prova' e o id da prova no
    // period_key — não a chave posicional p6 do encaixe.
    const award = { id: 'a6', medalhao: 'epoca', slot: 'prova', period_key: 'race-6', race_id: 'race-6', title: 'Prova 6' };
    const { baseElement } = render(<MedalMoment award={award} medalhao={epoca} onClose={() => {}} />);
    const disc = baseElement.querySelector('[data-testid="medalhao-lg"]');
    // Os 6 desenhados: 5 ganhos + o alvo, vazio à espera da estrela.
    expect(disc.querySelectorAll('.ic-medal-stars [data-medal-star]')).toHaveLength(5);
    expect(disc.querySelectorAll('.ic-medal-stars [data-medal-socket]')).toHaveLength(1);
    const { x, y, scale } = slotPosition(5, 6, 'lg');
    const star = screen.getByTestId('medal-moment-star');
    expect(Number(star.dataset.x)).toBe(x);
    expect(Number(star.dataset.y)).toBe(y);
    expect(star).toHaveStyle({ left: `${x - 36}px`, top: `${y - 36}px` });
    // E é o mesmo sítio onde o disco desenhou o encaixe.
    expect(disc.querySelector('[data-medal-socket]').getAttribute('transform')).toBe(scale === 1 ? `translate(${x},${y})` : `translate(${x},${y}) scale(${scale})`);
    expect(x).toBeLessThan(150); // a 6.ª de 6 fica à esquerda, em cima
    expect(y).toBeLessThan(150);
  });

  it('"Ver no Palmarés" abre o Palmarés e fecha, e conta as outras por ver', () => {
    setReducedMotion(false);
    const onClose = vi.fn();
    const onOpenPalmares = vi.fn();
    render(<MedalMoment award={AWARD} medalhao={ANO_KM} extraCount={2} onClose={onClose} onOpenPalmares={onOpenPalmares} />);
    const cta = screen.getByTestId('medal-moment-cta');
    expect(cta).toHaveTextContent('Ver no Palmarés · e mais 2 medalhas');
    fireEvent.click(cta);
    expect(onOpenPalmares).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('com prefers-reduced-motion começa no estado final, sem clarão nem fagulhas, e o primeiro toque fecha', () => {
    setReducedMotion(true);
    const onClose = vi.fn();
    render(<MedalMoment award={AWARD} medalhao={ANO_KM} onClose={onClose} />);
    const moment = screen.getByTestId('medal-moment');
    expect(moment).toHaveAttribute('data-final', 'true');
    expect(moment.querySelector('.m-flash')).toBeNull();
    expect(screen.queryAllByTestId('medal-moment-spark')).toHaveLength(0);
    fireEvent.click(moment);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
