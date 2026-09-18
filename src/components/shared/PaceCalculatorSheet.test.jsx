import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PaceCalculatorSheet from './PaceCalculatorSheet';

/* O que aqui se protege é a regra dos dois campos ligados: um é escrito, o
   outro é derivado, e é o ÚLTIMO campo escrito que manda. Sem isso a
   calculadora entra em ciclo ou mostra um valor velho — e nenhuma das duas
   coisas se vê num teste de aritmética pura (esse vive em utils/paceMath).

   Os campos leem-se pela label; os dois usam a máscara do DurationInput, por
   isso escreve-se só dígitos ("530" → 5:30), como no telemóvel. */
const abrir = () => render(<PaceCalculatorSheet onClose={() => {}} />);
const ritmo = () => screen.getByLabelText('Ritmo');
const tempo = () => screen.getByLabelText('Tempo total');
const distancia = () => screen.getByLabelText('Distância em quilómetros');
const resultado = () => screen.getByTestId('pace-resultado').textContent.replace(/\s+/g, ' ').trim();

describe('PaceCalculatorSheet — escreve um, sai o outro', () => {
  it('abre com um exemplo já calculado, em vez de três campos vazios', () => {
    abrir();
    expect(distancia()).toHaveValue('10');
    expect(ritmo()).toHaveValue('5:30');
    expect(tempo()).toHaveValue('55:00');
    expect(resultado()).toBe('10 km a 5.30/km são 55:00');
  });

  it('o ritmo escrito dá o tempo total — 5 km a 5:00 são 25:00', () => {
    abrir();
    fireEvent.change(distancia(), { target: { value: '5' } });
    fireEvent.change(ritmo(), { target: { value: '500' } });
    expect(tempo()).toHaveValue('25:00');
    expect(resultado()).toBe('5 km a 5.00/km são 25:00');
  });

  it('o tempo escrito dá o ritmo — 10 km em 45:00 são 4:30/km', () => {
    abrir();
    fireEvent.change(tempo(), { target: { value: '4500' } });
    expect(ritmo()).toHaveValue('4:30');
    expect(resultado()).toBe('10 km a 4.30/km são 45:00');
  });

  it('mudar a distância mantém o que foi escrito e recalcula o outro', () => {
    abrir();
    // Ritmo escrito: mudar de 10 km para a meia mantém o ritmo e cresce o tempo.
    fireEvent.click(screen.getByLabelText('Distância Meia'));
    expect(ritmo()).toHaveValue('5:30');
    expect(tempo()).toHaveValue('1:56:03');

    // Tempo escrito: agora é o tempo que fica e o ritmo é que se ajusta.
    fireEvent.change(tempo(), { target: { value: '14500' } });
    // 1:45:00 = 6300 s; 6300 / 21,1 = 298,58 → 299 s = 4:59/km.
    expect(ritmo()).toHaveValue('4:59');
    fireEvent.click(screen.getByLabelText('Distância 10 km'));
    expect(tempo()).toHaveValue('1:45:00');
    expect(ritmo()).toHaveValue('10:30');
  });

  it('o campo derivado diz que é calculado, e o escrito diz que é do atleta', () => {
    abrir();
    expect(screen.getAllByText('calculado')).toHaveLength(1);
    expect(screen.getAllByText('escrito por ti')).toHaveLength(1);
    // Escrever no derivado inverte os papéis, sem nunca haver dois calculados.
    fireEvent.change(tempo(), { target: { value: '4000' } });
    expect(screen.getAllByText('calculado')).toHaveLength(1);
    expect(screen.getAllByText('escrito por ti')).toHaveLength(1);
  });

  it('sem distância utilizável não inventa resultado nenhum', () => {
    abrir();
    fireEvent.change(distancia(), { target: { value: '' } });
    expect(screen.getByTestId('pace-resultado-vazio')).toBeInTheDocument();
    expect(screen.queryByTestId('pace-resultado')).not.toBeInTheDocument();
    // "abc" e "0" também não são distâncias.
    fireEvent.change(distancia(), { target: { value: '0' } });
    expect(screen.getByTestId('pace-resultado-vazio')).toBeInTheDocument();
  });

  it('a vírgula é o separador decimal — 21,1 é a meia, não 211', () => {
    abrir();
    fireEvent.change(distancia(), { target: { value: '21,1' } });
    fireEvent.change(ritmo(), { target: { value: '500' } });
    expect(tempo()).toHaveValue('1:45:30');
    expect(resultado()).toBe('21,1 km a 5.00/km são 1:45:30');
  });

  it('fecha por onClose — a persiana trata da saída, não se desmonta à bruta', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<PaceCalculatorSheet onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Fechar'));
    vi.runAllTimers();
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
