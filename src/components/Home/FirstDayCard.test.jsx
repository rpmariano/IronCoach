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
    fireEvent.click(screen.getByRole('button', { name: 'Marcar prova eu mesmo' }));
    expect(h.onTalk).toHaveBeenCalled();
    expect(h.onCreateRace).toHaveBeenCalled();
  });
});
