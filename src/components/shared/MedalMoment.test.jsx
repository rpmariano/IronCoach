import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import MedalMoment from './MedalMoment';
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
