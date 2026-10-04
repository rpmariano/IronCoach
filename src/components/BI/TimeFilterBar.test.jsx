import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TimeFilterBar, { NUTRICAO, CORPO, CORRIDA, GINASIO } from './TimeFilterBar';

const labels = (l) => l.map((o) => o.label);

describe('TimeFilterBar', () => {
  it('sem options mantém a lista atual (inclui 6 Meses)', () => {
    render(<TimeFilterBar activeRange="semana" />);
    ['Dia', 'Semana', 'Mês', 'Trimestre', '6 Meses', 'Ano'].forEach((t) =>
      expect(screen.getByRole('button', { name: t })).toBeInTheDocument());
  });

  it('com options mostra só essas e marca a ativa', () => {
    const onChange = vi.fn();
    render(<TimeFilterBar options={GINASIO} activeRange="mes" onChange={onChange} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Dia' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Trimestre' }));
    expect(onChange).toHaveBeenCalledWith('trimestre');
  });

  it('listas aprovadas', () => {
    expect(labels(NUTRICAO)).toEqual(['Dia', 'Semana', 'Mês', 'Trimestre']);
    expect(labels(CORPO)).toEqual(['Dia', 'Semana', 'Mês', 'Trimestre', 'Ano']);
    expect(labels(CORRIDA)).toEqual(['Semana', 'Mês', 'Trimestre', 'Ano']);
    expect(labels(GINASIO)).toEqual(['Semana', 'Mês', 'Trimestre']);
  });
});
