import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FirstDayCard from './FirstDayCard';

const handlers = () => ({ onTalk: vi.fn(), onCreateRace: vi.fn(), onRegisterRun: vi.fn(), onRegisterMeal: vi.fn() });

describe('FirstDayCard — a Carol lembra-se do arranque', () => {
  it('quem veio correr mais rápido: o pedido é a corrida, e a segunda via é falar com ela', () => {
    const h = handlers();
    render(<FirstDayCard firstName="Rui" goal="ritmo" facts={['Corres há 1 a 3 anos', '38 km por semana']} {...h} />);
    expect(screen.getByText('Rui, vamos pôr-te mais rápido.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Registar uma corrida/ }));
    expect(h.onRegisterRun).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Falar com a Carol' }));
    expect(h.onTalk).toHaveBeenCalled();
  });

  it('mostra o que ela guardou, como lista', () => {
    render(<FirstDayCard firstName="Rui" goal="saude" facts={['Corres há 1 a 3 anos', 'Sem lactose']} {...handlers()} />);
    const lista = screen.getByRole('list', { name: 'O que a Carol já sabe de ti' });
    expect(lista.querySelectorAll('li')).toHaveLength(2);
    expect(lista).toHaveTextContent('Sem lactose');
  });

  it('quem veio preparar uma prova: marcar a prova, em âmbar', () => {
    const h = handlers();
    render(<FirstDayCard firstName="Rui" goal="prova" {...h} />);
    fireEvent.click(screen.getByRole('button', { name: /Marcar a prova/ }));
    expect(h.onCreateRace).toHaveBeenCalled();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('sem objetivo: o cartão de sempre', () => {
    const h = handlers();
    render(<FirstDayCard firstName="Rui" {...h} />);
    expect(screen.getByText('Olá, Rui. Vamos escolher a tua prova.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Falar com a Carol/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar a prova à mão' }));
    expect(h.onTalk).toHaveBeenCalled();
    expect(h.onCreateRace).toHaveBeenCalled();
  });

  // Revisão de 2026-09-26: com as notas ainda a chegar, o "sem objetivo"
  // saía antes de se saber se havia objetivo.
  it('com as notas ainda a chegar: só o avatar e o olá', () => {
    render(<FirstDayCard firstName="Rui" notesLoaded={false} facts={['Corres há 1 a 3 anos']} {...handlers()} />);
    const card = screen.getByTestId('first-day-card');
    expect(screen.getByText('Olá, Rui.')).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/escolher a tua prova|Sem uma prova marcada/);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  // Revisão de 2026-09-26 (backlog, FirstDayCard.jsx:30): "eu mesmo" tinha
  // género, e uma atleta diria "eu mesma".
  it('a segunda via não tem género', () => {
    render(<FirstDayCard firstName="Ana" {...handlers()} />);
    expect(screen.queryByText(/eu mesm[oa]/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar a prova à mão' })).toBeInTheDocument();
  });

  /* O contexto primeiro (revisão de 2026-09-26): com a cirurgia de ontem na
     memória dela, quem veio voltar de uma pausa tinha «Registar uma
     corrida» como botão principal. */
  it('com uma cirurgia na memória, o botão principal é falar com ela, não registar uma corrida', () => {
    const h = handlers();
    const vida = { tipo: 'cirurgia', dias: 1, a: 'a cirurgia', da: 'da cirurgia' };
    render(<FirstDayCard firstName="Rui" goal="regresso" vida={vida} {...h} />);
    expect(screen.getByText('Rui, voltamos com calma.')).toBeInTheDocument();
    expect(screen.getByText(/^Não me esqueci da cirurgia\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registar uma corrida/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('first-day-card')).not.toHaveTextContent(/te ver correr|primeiras saídas/);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(h.onTalk).toHaveBeenCalled();
    expect(h.onRegisterRun).not.toHaveBeenCalled();
  });
});
