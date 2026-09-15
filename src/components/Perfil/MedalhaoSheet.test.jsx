import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MedalhaoSheet from './MedalhaoSheet';
import { makeMedalhoes } from '../../test/medalhoesFixture';

/* A persiana de um medalhão: título com o ano, a regra, um cartão por
   encaixe — ganho com o valor, por ganhar com a barra quando há progresso —
   e o histórico só quando há re-cunhagens. */

const { medalhoes } = makeMedalhoes();

describe('MedalhaoSheet', () => {
  it('mostra o título, a regra e os encaixes nos seus estados', () => {
    render(<MedalhaoSheet medalhao={medalhoes[0]} onClose={() => {}} />);
    const sheet = screen.getByTestId('medalhao-sheet-ano_km');
    expect(sheet).toHaveTextContent('Palmarés · medalhão');
    expect(sheet).toHaveTextContent('O Ano em Km · 2026');
    expect(sheet).toHaveTextContent('A regra de O Ano em Km.');

    const mes = screen.getByTestId('medalhao-slot-mes');
    expect(mes).toHaveAttribute('data-state', 'won');
    expect(mes).toHaveTextContent('182 km');
    expect(mes).toHaveTextContent('para repetir: mais de 182 km num mês');
    expect(mes.querySelector('[role="progressbar"]')).toBeNull();

    const semestre = screen.getByTestId('medalhao-slot-semestre');
    expect(semestre).toHaveAttribute('data-state', 'empty');
    expect(semestre.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '72');
    expect(semestre).toHaveTextContent('fecha o semestre a correr e a medalha é tua');

    // Sem progresso calculado, não há barra.
    expect(screen.getByTestId('medalhao-slot-ano').querySelector('[role="progressbar"]')).toBeNull();

    expect(screen.getByTestId('medalhao-historico')).toHaveTextContent('Mês ganho 2×');
  });

  it('sem re-cunhagens não mostra o histórico', () => {
    render(<MedalhaoSheet medalhao={medalhoes[1]} onClose={() => {}} />);
    expect(screen.getAllByTestId(/^medalhao-slot-/)).toHaveLength(4);
    expect(screen.queryByTestId('medalhao-historico')).not.toBeInTheDocument();
  });
});
