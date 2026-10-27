import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExerciseEditor, { exerciseSummary } from './ExerciseEditor';
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
const abrir = (nome) => fireEvent.click(screen.getByRole('button', { name: `Abrir ${nome}` }));
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

  it('bug #69: um exercício novo entra no TOPO da lista, não no fundo', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca' })]} lockerRows={LOCKER} />);
    fireEvent.click(screen.getByText('Adicionar exercício'));
    expect(state().map(e => e.name)).toEqual(['', 'Prensa']);
    // Da biblioteca também: o último a entrar fica por cima.
    fireEvent.click(screen.getByRole('button', { name: /Da biblioteca/ }));
    fireEvent.click(screen.getByRole('button', { name: /Leg Press/ }));
    expect(state().map(e => e.name)).toEqual(['Leg Press', '', 'Prensa']);
  });

  it('#91: − / + nas reps (1 em 1) e no peso (2,5 em 2,5 kg), com alvos de 44 px, e continua a escrever-se', () => {
    render(<Harness initial={[newExercise({ name: 'Leg Press', type: 'forca' })]} lockerRows={LOCKER} />);
    abrir('Leg Press');
    fireEvent.click(screen.getByRole('button', { name: /^Mais 1 repetição da série 1/ }));
    expect(state()[0].sets[0].reps).toBe('11'); // a sugestão da última vez (10) + 1
    fireEvent.click(screen.getByRole('button', { name: /^Menos 1 repetição da série 1/ }));
    expect(state()[0].sets[0].reps).toBe('10');
    fireEvent.click(screen.getByRole('button', { name: /^Mais 2,5 kg da série 1/ }));
    expect(state()[0].sets[0].weight).toBe('102.5');
    fireEvent.click(screen.getByRole('button', { name: /^Menos 2,5 kg da série 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Menos 2,5 kg da série 1/ }));
    expect(state()[0].sets[0].weight).toBe('97.5');
    for (const b of screen.getAllByRole('button', { name: /^(Mais|Menos) / })) expect(b.className).toMatch(/tap-44/);
    fireEvent.change(screen.getByLabelText(/^Repetições da série 1 —/), { target: { value: '8' } });
    expect(state()[0].sets[0].reps).toBe('8');
  });

  it('#91: os exercícios vêm colapsados, com o nome e o resumo na linha; tocar abre e fecha', () => {
    const ex = newExercise({ name: 'Leg Press', type: 'forca', sets: [{ ...newSet(), reps: '12', weight: '40' }, { ...newSet(), reps: '12', weight: '40' }, { ...newSet(), reps: '10', weight: '45' }] });
    render(<Harness initial={[ex]} />);
    const bloco = screen.getByTestId('exercicio-bloco');
    expect(bloco).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('exercicio-resumo')).toHaveTextContent('3 séries × 10–12 reps × 40–45 kg');
    expect(screen.queryByRole('button', { name: /^Série 1 de Leg Press feita$/ })).toBeNull();
    abrir('Leg Press');
    expect(bloco).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: /^Série 1 de Leg Press feita$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Leg Press' }));
    expect(bloco).toHaveAttribute('data-open', 'false');
  });

  it('exerciseSummary: valores iguais, alvo do plano e cardio', () => {
    expect(exerciseSummary(newExercise({ name: 'A', type: 'forca', sets: [{ ...newSet(), reps: '12', weight: '40' }, { ...newSet(), reps: '12', weight: '40' }] }))).toBe('2 séries × 12 reps × 40 kg');
    expect(exerciseSummary(newExercise({ name: 'B', type: 'forca', sets: [{ ...newSet(), plan: { reps: '10' } }] }))).toBe('1 série × 10 reps');
    expect(exerciseSummary(newExercise({ name: 'C', type: 'cardio', sets: [{ ...newSet(), durationMin: '20', distance: '2' }] }))).toBe('20 min · 2 km');
  });

  it('#92: «Adicionar exercício» abre o novo e põe o foco no nome dele, à vista', () => {
    vi.useFakeTimers();
    const rolar = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = rolar;
    try {
      render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca' })]} />);
      fireEvent.click(screen.getByText('Adicionar exercício'));
      const campo = screen.getAllByLabelText('Nome do exercício')[0];
      expect(campo).toHaveValue('');
      expect(document.activeElement).toBe(campo);
      expect(screen.getAllByTestId('exercicio-bloco')[0]).toHaveAttribute('data-open', 'true');
      expect(screen.getAllByTestId('exercicio-bloco')[1]).toHaveAttribute('data-open', 'false');
      vi.advanceTimersByTime(400);
      expect(rolar).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    } finally {
      Element.prototype.scrollIntoView = orig;
      vi.useRealTimers();
    }
  });

  it('#92: ao focar qualquer caixa de texto, fica à vista (centrada) quando o teclado abre', () => {
    vi.useFakeTimers();
    const rolar = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = rolar;
    try {
      render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca' })]} />);
      abrir('Prensa');
      fireEvent.focus(screen.getByLabelText('Objetivo — Prensa'));
      vi.advanceTimersByTime(400);
      expect(rolar).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    } finally {
      Element.prototype.scrollIntoView = orig;
      vi.useRealTimers();
    }
  });

  it('#93: objetivo e afinação são caixas de texto com etiqueta (quebram a linha, sem scroll lateral)', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca', goal: 'descida controlada em 3 segundos, pausa de 1 s em baixo e subida rápida' })]} />);
    abrir('Prensa');
    const objetivo = screen.getByLabelText('Objetivo — Prensa');
    expect(objetivo.tagName).toBe('TEXTAREA');
    expect(screen.getByText('Objetivo (opcional)')).toBeTruthy();
    expect(screen.getByLabelText(/^Afinação da máquina — Prensa/).tagName).toBe('TEXTAREA');
    expect(objetivo.className).toMatch(/rounded-xl/);
  });

  it('nome, objetivo, reps e kg', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca' })]} />);
    abrir('Prensa');
    fireEvent.change(screen.getByLabelText('Objetivo — Prensa'), { target: { value: 'descida em 3 s' } });
    fireEvent.change(screen.getByLabelText(/^Repetições da série 1 —/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/^Peso da série 1 \(kg\) —/), { target: { value: '85' } });
    expect(state()[0]).toMatchObject({ goal: 'descida em 3 s', sets: [{ reps: '12', weight: '85' }] });
  });

  it('o ✓ de uma série vazia usa a última vez do Armário; desmarcar não apaga', () => {
    render(<Harness initial={[newExercise({ name: 'Leg Press', type: 'forca' })]} lockerRows={LOCKER} />);
    abrir('Leg Press');
    expect(screen.getByText('da última vez: 100 kg × 10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Série 1 de .* feita$/ }));
    expect(state()[0].sets[0]).toMatchObject({ done: true, reps: '10', weight: '100' });
    fireEvent.click(screen.getByRole('button', { name: /^Série 1 de .* feita$/ }));
    expect(state()[0].sets[0]).toMatchObject({ done: false, reps: '10', weight: '100' });
  });

  it('trocar para cardio mostra os campos do exercício e "+ voltas"', () => {
    render(<Harness initial={[newExercise({ name: 'Remo', type: 'forca', sets: [newSet()] })]} />);
    abrir('Remo');
    fireEvent.click(screen.getByRole('button', { name: 'Cardio' }));
    expect(screen.getByLabelText('Tempo (min) — Remo')).toBeTruthy();
    expect(screen.getByLabelText('Distância (m) — Remo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ voltas' }));
    expect(screen.getByLabelText('Voltas — Remo')).toBeTruthy();
  });

  it('remover exercício e série', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca', sets: [newSet(), newSet()] })]} />);
    abrir('Prensa');
    fireEvent.click(screen.getByLabelText(/^Remover série 2 /));
    expect(state()[0].sets).toHaveLength(1);
    fireEvent.click(screen.getByLabelText(/^Remover exercício/));
    expect(state()).toHaveLength(0);
  });

  it('o Armário: procura, filtra e junta', () => {
    render(<Harness lockerRows={LOCKER} />);
    fireEvent.click(screen.getByRole('button', { name: /Da biblioteca/ }));
    fireEvent.change(screen.getByLabelText('Procurar na biblioteca'), { target: { value: 'leg' } });
    expect(screen.queryByRole('button', { name: /^Remo/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Leg Press/ }));
    expect(state()[0]).toMatchObject({ name: 'Leg Press', type: 'forca' });
    expect(state()[0].sets).toHaveLength(3);
  });

  it('o Armário vazio explica como se enche', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Da biblioteca/ }));
    expect(screen.getByText(/A biblioteca enche-se sozinha/)).toBeTruthy();
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
    abrir('Supino');
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

describe('ExerciseEditor — stepper sem valores absurdos', () => {
  const abrirEx = (nome) => fireEvent.click(screen.getByRole('button', { name: `Abrir ${nome}` }));
  it('«−» sem valor nem sugestão não faz nada (não grava 0)', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca' })]} />);
    abrirEx('Prensa');
    fireEvent.click(screen.getByRole('button', { name: /^Menos 1 repetição da série 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Menos 2,5 kg da série 1/ }));
    expect(state()[0].sets[0]).toMatchObject({ reps: '', weight: '' });
  });
  it('descer até 0 limpa o campo; escrever «-» não deixa negativos; os campos têm min=0', () => {
    render(<Harness initial={[newExercise({ name: 'Prensa', type: 'forca', sets: [{ ...newSet(), reps: '1', weight: '2.5' }] })]} />);
    abrirEx('Prensa');
    fireEvent.click(screen.getByRole('button', { name: /^Menos 1 repetição da série 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Menos 2,5 kg da série 1/ }));
    expect(state()[0].sets[0]).toMatchObject({ reps: '', weight: '' });
    fireEvent.change(screen.getByLabelText(/^Repetições da série 1 —/), { target: { value: '-5' } });
    expect(state()[0].sets[0].reps).toBe('5');
    expect(screen.getByLabelText(/^Peso da série 1 \(kg\) —/)).toHaveAttribute('min', '0');
  });
});
