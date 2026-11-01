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
