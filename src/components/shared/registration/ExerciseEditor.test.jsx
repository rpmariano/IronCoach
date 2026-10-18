import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExerciseEditor from './ExerciseEditor';

function setup(exercises) {
  const fns = {
    onAddExercise: vi.fn(), onRemoveExercise: vi.fn(), onUpdateExercise: vi.fn(),
    onAddSet: vi.fn(), onRemoveSet: vi.fn(), onUpdateSet: vi.fn(), onDirty: vi.fn(),
  };
  render(<ExerciseEditor exercises={exercises} {...fns} />);
  return fns;
}

const EX = [{ key: 'e1', name: 'Prensa', sets: [{ key: 's1', reps: '10', weight: '80' }] }];

describe('ExerciseEditor', () => {
  it('sem exercícios mostra o estado vazio e deixa adicionar', () => {
    const fns = setup([]);
    expect(screen.getByText('Sem exercícios ainda.')).toBeTruthy();
    fireEvent.click(screen.getByText('Adicionar exercício'));
    expect(fns.onAddExercise).toHaveBeenCalled();
  });

  it('editar o nome, as reps e o peso chama o handler certo e marca como sujo', () => {
    const fns = setup(EX);
    fireEvent.change(screen.getByLabelText('Nome do exercício'), { target: { value: 'Prensa 45°' } });
    expect(fns.onUpdateExercise).toHaveBeenCalledWith('e1', { name: 'Prensa 45°' });
    fireEvent.change(screen.getByLabelText('Repetições da série 1'), { target: { value: '12' } });
    expect(fns.onUpdateSet).toHaveBeenCalledWith('e1', 's1', { reps: '12' });
    fireEvent.change(screen.getByLabelText('Peso da série 1 (kg)'), { target: { value: '85' } });
    expect(fns.onUpdateSet).toHaveBeenCalledWith('e1', 's1', { weight: '85' });
    expect(fns.onDirty).toHaveBeenCalledTimes(3);
  });

  it('remover exercício e série e juntar uma série', () => {
    const fns = setup(EX);
    fireEvent.click(screen.getByLabelText('Remover exercicio'));
    expect(fns.onRemoveExercise).toHaveBeenCalledWith('e1');
    fireEvent.click(screen.getByLabelText('Remover serie 1'));
    expect(fns.onRemoveSet).toHaveBeenCalledWith('e1', 's1');
    fireEvent.click(screen.getByText('Série'));
    expect(fns.onAddSet).toHaveBeenCalledWith('e1');
  });
});
