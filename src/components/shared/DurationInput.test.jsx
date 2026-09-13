import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DurationInput, { formatDurationDigits } from './DurationInput';
import { parseDurationToSeconds } from '../../utils/run';

/* O teclado numérico do telemóvel não tem ":" (relatado 2026-09-13): o tempo
   escreve-se só com dígitos e os ":" nascem sozinhos. */

describe('formatDurationDigits', () => {
  it('enche da direita para a esquerda como um cronómetro', () => {
    expect(formatDurationDigits('5')).toBe('0:05');
    expect(formatDurationDigits('51')).toBe('0:51');
    expect(formatDurationDigits('512')).toBe('5:12');
    expect(formatDurationDigits('5128')).toBe('51:28');
    expect(formatDurationDigits('15128')).toBe('1:51:28');
    expect(formatDurationDigits('114500')).toBe('11:45:00');
  });

  it('lê pelos dígitos o que vier com ":", "," ou "." — e ignora o resto', () => {
    expect(formatDurationDigits('1:45:00')).toBe('1:45:00');
    expect(formatDurationDigits('51,28')).toBe('51:28');
    expect(formatDurationDigits('51.28')).toBe('51:28');
    expect(formatDurationDigits('50:00')).toBe('50:00');
    expect(formatDurationDigits('')).toBe('');
    expect(formatDurationDigits(null)).toBe('');
  });

  it('não passa de hh:mm:ss e não deixa zeros à esquerda a somar', () => {
    expect(formatDurationDigits('1234567')).toBe('23:45:67'.replace('67', '67'));
    expect(formatDurationDigits('0005128')).toBe('51:28');
  });

  it('o que sai é sempre legível pelo parser de sempre', () => {
    expect(parseDurationToSeconds(formatDurationDigits('5128'))).toBe(51 * 60 + 28);
    expect(parseDurationToSeconds(formatDurationDigits('15342'))).toBe(3600 + 53 * 60 + 42);
  });
});

function Campo() {
  const [v, setV] = useState('');
  return <DurationInput aria-label="Tempo" value={v} onChange={setV} />;
}

describe('DurationInput', () => {
  it('formata enquanto se escreve e apaga um dígito de cada vez', () => {
    render(<Campo />);
    const input = screen.getByLabelText('Tempo');
    expect(input).toHaveAttribute('inputmode', 'numeric');

    fireEvent.change(input, { target: { value: '5128' } });
    expect(input.value).toBe('51:28');

    // Backspace no fim: o browser entrega "51:2", e fica "5:12".
    fireEvent.change(input, { target: { value: '51:2' } });
    expect(input.value).toBe('5:12');
  });

  it('aceita um tempo colado com separadores', () => {
    render(<Campo />);
    const input = screen.getByLabelText('Tempo');
    fireEvent.change(input, { target: { value: '1:53:42' } });
    expect(input.value).toBe('1:53:42');
  });
});
