import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExerciseEditor from './ExerciseEditor';
import { lockerIndex, newExercise, newSet } from '../../../utils/gymSets';

function Harness({ initial = [], lockerRows = [] }) {
  const [exercises, setExercises] = useState(initial);
  return (
    <>
      <ExerciseEditor exercises={exercises} onChange={setExercises} locker={lockerIndex(lockerRows)} lockerRows={lockerRows} />
      <pre data-testid="state">{JSON.stringify(exercises)}</pre>
    </>
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent);

const LOCKER = [{ id: 'l1', name: 'Leg Press', name_key: 'leg press', category: 'Pernas Inferiores', block_type: 'forca', last_weight: 100, last_reps: 10 },
  { id: 'l2', name: 'Remo', name_key: 'remo', category: 'Cardio', block_type: 'cardio', cardio_fields: ['duration', 'distance'] }];

describe('ExerciseEditor', () => {
  it('sem exercícios mostra o estado vazio e deixa adicionar', () => {
    render(<Harness />);
    expect(screen.getByText('Sem exercícios ainda.')).toBeTruthy();
    fireEvent.click(screen.getByText('Adicionar exercício'));
    expect(state()).toHaveLength(1);
    expect(state()[0].type).toBe('forca');
  });

  it('nome, objetivo, reps e kg', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca' })]} />);
    fireEvent.change(screen.getByLabelText('Objetivo — Prensa'), { target: { value: 'descida em 3 s' } });
    fireEvent.change(screen.getByLabelText(/^Repetições da série 1 —/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/^Peso da série 1 \(kg\) —/), { target: { value: '85' } });
    expect(state()[0]).toMatchObject({ goal: 'descida em 3 s', sets: [{ reps: '12', weight: '85' }] });
  });

  it('o ✓ de uma série vazia usa a última vez do Armário; desmarcar não apaga', () => {
    render(<Harness initial={[newExercise({ name: 'Leg Press', type: 'forca' })]} lockerRows={LOCKER} />);
    expect(screen.getByText('da última vez: 100 kg × 10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Série 1 de .* feita$/ }));
    expect(state()[0].sets[0]).toMatchObject({ done: true, reps: '10', weight: '100' });
    fireEvent.click(screen.getByRole('button', { name: /^Série 1 de .* feita$/ }));
    expect(state()[0].sets[0]).toMatchObject({ done: false, reps: '10', weight: '100' });
  });

  it('ajuste rápido na série ativa: +2,5 kg a partir da sugestão', () => {
    render(<Harness initial={[newExercise({ name: 'Leg Press', type: 'forca' })]} lockerRows={LOCKER} />);
    fireEvent.click(screen.getByRole('button', { name: '+2,5 kg' }));
    expect(state()[0].sets[0].weight).toBe('102.5');
  });

  it('trocar para cardio mostra os campos do exercício e "+ voltas"', () => {
    render(<Harness initial={[newExercise({ name: 'Remo', type: 'forca', sets: [newSet()] })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cardio' }));
    expect(screen.getByLabelText('Tempo (min) — Remo')).toBeTruthy();
    expect(screen.getByLabelText('Distância (m) — Remo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ voltas' }));
    expect(screen.getByLabelText('Voltas — Remo')).toBeTruthy();
  });

  it('remover exercício e série', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca', sets: [newSet(), newSet()] })]} />);
    fireEvent.click(screen.getByLabelText(/^Remover série 2 /));
    expect(state()[0].sets).toHaveLength(1);
    fireEvent.click(screen.getByLabelText(/^Remover exercício/));
    expect(state()).toHaveLength(0);
  });

  it('o Armário: procura, filtra e junta', () => {
    render(<Harness lockerRows={LOCKER} />);
    fireEvent.click(screen.getByRole('button', { name: /Do Armário/ }));
    fireEvent.change(screen.getByLabelText('Procurar no Armário'), { target: { value: 'leg' } });
    expect(screen.queryByRole('button', { name: /^Remo/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Leg Press/ }));
    expect(state()[0]).toMatchObject({ name: 'Leg Press', type: 'forca' });
    expect(state()[0].sets).toHaveLength(3);
  });

  it('o Armário vazio explica como se enche', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Do Armário/ }));
    expect(screen.getByText(/O Armário enche-se sozinho/)).toBeTruthy();
  });

  it('afinação (decisão 10): mostra a do Armário e só vai no registo se a mudar', () => {
    const LOCKER2 = [{ id: 'l1', name: 'Leg Press', name_key: 'leg press', category: 'Pernas', block_type: 'forca', last_weight: 100, last_reps: 10, machine_settings: 'banco furo 3' }];
    render(<Harness initial={[newExercise({ name: 'Leg Press', type: 'forca' })]} lockerRows={LOCKER2} />);
    const campo = screen.getByLabelText(/^Afinação da máquina — Leg Press/);
    expect(campo).toHaveValue('banco furo 3');
    expect(state()[0].machineSettings).toBeUndefined();
    fireEvent.change(campo, { target: { value: 'banco furo 5' } });
    expect(state()[0].machineSettings).toBe('banco furo 5');
  });

  it('objetivo qualitativo (decisão 9): o "Cumpriste?" confirma-se com um toque e desfaz-se', () => {
    render(<Harness initial={[newExercise({ name: 'Supino', type: 'forca', goal: 'descida em 3 s' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    expect(state()[0].goalMet).toBe(true);
    expect(screen.getByRole('button', { name: 'Sim' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(state()[0].goalMet).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(state()[0].goalMet).toBe(null);
  });

  it('objetivo mensurável ou sem objetivo: não pergunta', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca', goal: 'chegar às 12 reps' }), newExercise({ name: 'Remo sentado', type: 'forca' })]} />);
    expect(screen.queryByText('Cumpriste o objetivo?')).toBeNull();
  });

  it('afinação: no cardio não há campo', () => {
    render(<Harness initial={[newExercise({ name: 'Remo', type: 'cardio', sets: [newSet()] })]} />);
    expect(screen.queryByLabelText(/Afinação da máquina/)).toBeNull();
  });
});
