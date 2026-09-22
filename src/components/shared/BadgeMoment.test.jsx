import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import BadgeMoment from './BadgeMoment';

/* O momento do badge: o gesto é o da medalha (toque salta para o fim, o
   segundo fecha), é um diálogo modal a sério (foco, Tab preso, foco
   devolvido), não se fecha sozinho, e com movimento reduzido aparece tudo
   de uma vez. */

const BADGE = {
  key: 'z2_mestre', name: 'Mestre da Z2', familia: 'desempenho', cor: 'run',
  glifo: 'heart', state: 'won', ring: 1, centro: '94', count: 1,
};
const AMULETO = { ...BADGE, key: 'coruja', name: 'A Coruja', familia: 'amuletos', cor: 'neutro', centro: '15' };

const setReducedMotion = (reduce) => {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }));
};

afterEach(() => {
  delete window.matchMedia;
  vi.useRealTimers();
});

describe('BadgeMoment — a escala grande', () => {
  it('toque salta para o estado final; o segundo toque fecha', () => {
    setReducedMotion(false);
    const onClose = vi.fn();
    render(<BadgeMoment badge={BADGE} titulo="Mestre da Z2" linha="94% do treino em Z1-Z2." onClose={onClose} />);
    const momento = screen.getByTestId('badge-moment');
    expect(momento).toHaveAttribute('role', 'dialog');
    expect(momento).toHaveAttribute('aria-modal', 'true');
    expect(momento).toHaveAttribute('data-escala', 'grande');
    expect(momento).toHaveAttribute('data-final', 'false');
    expect(screen.getAllByTestId('badge-moment-spark')).toHaveLength(5);
    expect(screen.getByTestId('badge-moment-cta')).toHaveFocus();

    fireEvent.click(momento);
    expect(momento).toHaveAttribute('data-final', 'true');
    expect(screen.queryAllByTestId('badge-moment-spark')).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(momento);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ao centro está o anel do badge com o número, e por baixo o nome e a frase', () => {
    setReducedMotion(true);
    render(<BadgeMoment badge={BADGE} titulo="Mestre da Z2" linha="94% do treino em Z1-Z2." onClose={() => {}} />);
    const anel = screen.getByTestId('badge-ring-z2_mestre');
    expect(anel).toHaveAttribute('data-state', 'won');
    // Sem movimento não há contagem: o número está logo no valor final.
    expect(anel).toHaveTextContent('94');
    expect(screen.getByTestId('badge-moment')).toHaveTextContent('Mestre da Z2');
    expect(screen.getByTestId('badge-moment')).toHaveTextContent('94% do treino em Z1-Z2.');
  });

  /* É do atleta, não da Carol: partilha-se o mundo (as curvas de nível, a
     luz da hora), não a protagonista. */
  it('não tem o rosto da Carol', () => {
    setReducedMotion(true);
    const { baseElement } = render(<BadgeMoment badge={BADGE} titulo="Mestre da Z2" onClose={() => {}} />);
    expect(baseElement.querySelector('[data-testid="coach-avatar"]')).toBeNull();
    expect(baseElement.querySelectorAll('.bm-contours polyline').length).toBeGreaterThan(0);
  });

  /* A luz é a da hora, e é a mesma da sala da Carol (utils/ambientWorld.js):
     abrir isto às 7h e às 22h não pode dar o mesmo ecrã. */
  it('a luz responde à hora do dia', () => {
    setReducedMotion(true);
    const manha = render(<BadgeMoment badge={BADGE} titulo="X" now={new Date('2026-09-22T07:00:00+01:00')} onClose={() => {}} />);
    const fundoManha = screen.getByTestId('badge-moment').style.background;
    manha.unmount();
    render(<BadgeMoment badge={BADGE} titulo="X" now={new Date('2026-09-22T21:30:00+01:00')} onClose={() => {}} />);
    expect(screen.getByTestId('badge-moment').style.background).not.toBe(fundoManha);
  });

  /* Precedente de 2026-09-21 na sala da Carol: «todas as mensagens que têm
     este caráter temporário devem deixar de o ter». Este teste é o que
     impede um temporizador de voltar. */
  it('não se fecha sozinho — espera pelo atleta', () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<BadgeMoment badge={BADGE} titulo="Mestre da Z2" onClose={onClose} />);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(onClose).not.toHaveBeenCalled();
    // Ao fim da coreografia fica no estado final, à espera.
    expect(screen.getByTestId('badge-moment')).toHaveAttribute('data-final', 'true');
  });

  it('é um diálogo modal: Escape fecha, o Tab não sai, e o foco volta ao sítio de onde veio', () => {
    setReducedMotion(true);
    const antes = document.createElement('button');
    document.body.appendChild(antes);
    antes.focus();

    const onClose = vi.fn();
    const { unmount } = render(<BadgeMoment badge={BADGE} titulo="Mestre da Z2" onClose={onClose} />);
    const cta = screen.getByTestId('badge-moment-cta');
    expect(cta).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cta).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    expect(antes).toHaveFocus();
    antes.remove();
  });

  it('a fila diz quantos ficam para trás', () => {
    setReducedMotion(true);
    render(<BadgeMoment badge={BADGE} titulo="Mestre da Z2" restantes={2} onClose={() => {}} />);
    expect(screen.getByTestId('badge-moment-cta')).toHaveTextContent('e mais 2 badges');
  });
});

describe('BadgeMoment — a escala média', () => {
  it('é um cartão com × explícito, e o × fecha', () => {
    setReducedMotion(false);
    const onClose = vi.fn();
    render(<BadgeMoment escala="medio" badge={AMULETO} titulo="2 badges novos" linha="A Coruja · Número certo" onClose={onClose} />);
    const cartao = screen.getByTestId('badge-moment');
    expect(cartao).toHaveAttribute('data-escala', 'medio');
    expect(cartao).toHaveTextContent('2 badges novos');
    expect(cartao).toHaveTextContent('A Coruja · Número certo');
    // Sem clarão nem fagulhas: um cartão não faz fogo de artifício.
    expect(screen.queryAllByTestId('badge-moment-spark')).toHaveLength(0);

    const fechar = screen.getByTestId('badge-moment-cta');
    expect(fechar).toHaveAccessibleName('Fechar');
    fireEvent.click(fechar);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* O cartão sai a um toque, sem o passo de "saltar para o fim": esse é da
     cerimónia grande, que tem 2,6 s para saltar. */
  it('sai a um toque, sem passo intermédio', () => {
    setReducedMotion(false);
    const onClose = vi.fn();
    render(<BadgeMoment escala="medio" badge={AMULETO} titulo="A Coruja" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('badge-moment'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /* Não é modal, e é de propósito: não para o ecrã, o resto da app continua
     a responder e o Tab sai dele. */
  it('não é modal e não prende o Tab', () => {
    setReducedMotion(true);
    const fora = document.createElement('button');
    document.body.appendChild(fora);
    render(<BadgeMoment escala="medio" badge={AMULETO} titulo="A Coruja" onClose={() => {}} />);
    expect(screen.getByTestId('badge-moment')).toHaveAttribute('aria-modal', 'false');
    const fechar = screen.getByTestId('badge-moment-cta');
    expect(fechar).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    fora.focus();
    expect(fora).toHaveFocus();
    fora.remove();
  });
});
