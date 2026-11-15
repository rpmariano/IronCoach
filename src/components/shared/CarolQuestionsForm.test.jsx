import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CarolQuestionsForm from './CarolQuestionsForm';

/* O formulário das perguntas da Carol, sem a refeição (bug #106): quem o usa recebe as respostas
   em onSubmit e decide o que fazer com elas. */

const QS = [
  { id: 'q1', question: 'Que máquina era?', options: ['Prensa 45°', 'Prensa horizontal'], assumed: 'Prensa 45°' },
  { id: 'q2', question: 'Foi até à falha?', options: ['Sim', 'Não'], assumed: 'Não' },
];

describe('CarolQuestionsForm', () => {
  it('manda só as respondidas, com «Outro…» como texto, e mostra o que aprendeu', async () => {
    const onSubmit = vi.fn().mockResolvedValue([{ topic: 'máquina', value: 'Prensa 45°', status: 'confirmado' }]);
    render(<CarolQuestionsForm questions={QS} onSubmit={onSubmit} impactText={() => ''} />);
    expect(screen.getByTestId('carol-questions-submit')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Prensa 45°' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Outro…' })[1]);
    fireEvent.change(screen.getByLabelText('Outra resposta: Foi até à falha?'), { target: { value: 'quase' } });
    fireEvent.click(screen.getByTestId('carol-questions-submit'));
    await waitFor(() => expect(screen.getByTestId('carol-questions-done')).toBeInTheDocument());
    expect(onSubmit).toHaveBeenCalledWith([{ id: 'q1', answer: 'Prensa 45°' }, { id: 'q2', answer: 'quase' }]);
    expect(screen.getByText(/Guardei: máquina — Prensa 45°/)).toBeInTheDocument();
  });

  it('um erro de onSubmit aparece e deixa tentar outra vez', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('O Coach está ocupado.'));
    render(<CarolQuestionsForm questions={QS} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    fireEvent.click(screen.getByTestId('carol-questions-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('O Coach está ocupado.');
    expect(screen.getByTestId('carol-questions-submit')).toBeEnabled();
  });

  it('sem perguntas não desenha nada; sem onLater não há «Agora não»', () => {
    const { container, rerender } = render(<CarolQuestionsForm questions={[]} onSubmit={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CarolQuestionsForm questions={QS} onSubmit={vi.fn()} />);
    expect(screen.queryByTestId('carol-questions-later')).not.toBeInTheDocument();
  });
});

describe('as perguntas de uma leitura de prints (#106)', () => {
  const PQ = [
    { id: 'p1', kind: 'contexto', topic: 'local', item_name: null, question: 'Foi em passadeira?', options: ['Sim', 'Não'], assumed: 'Não', impact_kcal: 0, impact_protein_g: 0, answer: null, answered_at: null },
    { id: 'p2', kind: 'contexto', topic: 'jejum', item_name: null, question: 'Em jejum?', options: ['Sim', 'Não'], assumed: 'Não', impact_kcal: 0, impact_protein_g: 0, answer: null, answered_at: null },
  ];

  it('readQuestions: só arrays válidos, no máximo 3', async () => {
    const { readQuestions } = await import('./CarolQuestionsForm');
    expect(readQuestions({ questions: PQ })).toHaveLength(2);
    expect(readQuestions({ questions: [...PQ, { ...PQ[0], id: 'p3' }, { ...PQ[0], id: 'p4' }] })).toHaveLength(3);
    expect(readQuestions({})).toEqual([]);
    expect(readQuestions({ questions: [null, { id: 'x' }] })).toEqual([]);
  });

  it('questionsPayload: answer preenchido ou null, answered_at só com resposta, texto livre até 60', async () => {
    const { questionsPayload, OUTRO } = await import('./CarolQuestionsForm');
    const out = questionsPayload(PQ, { p1: { picked: 'Sim' }, p2: { picked: OUTRO, other: '  x'.padEnd(80, 'y') } }, () => 'AGORA');
    expect(out.carol_questions[0]).toMatchObject({ id: 'p1', answer: 'Sim', answered_at: 'AGORA' });
    expect(out.carol_questions[1].answer).toHaveLength(60);
    expect(questionsPayload(PQ, {}).carol_questions.map(q => q.answer)).toEqual([null, null]);
    expect(questionsPayload([], {})).toEqual({});
  });

  it('PrintQuestions: sem impacto nem placeholder de quantidade; tocar de novo desmarca', async () => {
    const { PrintQuestions } = await import('./CarolQuestionsForm');
    const onChange = vi.fn();
    const { rerender } = render(<PrintQuestions questions={PQ} answers={{}} onChange={onChange} />);
    expect(screen.queryByText(/kcal/)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Sim' })[0]);
    expect(onChange).toHaveBeenLastCalledWith({ p1: { picked: 'Sim' } });
    rerender(<PrintQuestions questions={PQ} answers={{ p1: { picked: 'Sim' } }} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Sim' })[0]);
    expect(onChange).toHaveBeenLastCalledWith({ p1: { picked: undefined } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Outro…' })[1]);
    rerender(<PrintQuestions questions={PQ} answers={{ p2: { picked: '__outro__' } }} onChange={onChange} />);
    expect(screen.getByLabelText('Outra resposta: Em jejum?')).not.toHaveAttribute('placeholder');
  });
});
