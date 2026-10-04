import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BodyAssessmentDay from './BodyAssessmentDay';
import { sortAssessments } from '../../utils/body';

/* O "Dia" do Corpo é UMA avaliação (D1, 2026-10-04): ‹ › entre avaliações,
   todas as métricas medidas com a diferença face à anterior (por omissão) e
   "Comparar com…" para escolher outra; cor pela direção do objetivo ou da
   métrica; os dias entre as duas. Hoje: domingo, 4 out 2026 — a pesagem de
   hoje conta. */

const HOJE = '2026-10-04';
const LISTA = sortAssessments([
  { id: 'x3', date: HOJE, weight_kg: 76, body_fat_pct: 20, muscle_mass_kg: 56, bone_mass_kg: 3.1 },
  { id: 'x0', date: '2026-01-10', weight_kg: 82, body_fat_pct: 24 },
  { id: 'x2', date: '2026-09-12', weight_kg: 77.5, body_fat_pct: 21.2, muscle_mass_kg: 57.2 },
  { id: 'x1', date: '2026-07-05', weight_kg: 79, body_fat_pct: 22, muscle_mass_kg: 57 },
]);
const PERFIL = { goal_weight_kg: 74 };

const monta = (list = LISTA, profile = PERFIL) => render(<BodyAssessmentDay assessments={list} profile={profile} todayISO={HOJE} />);
const diff = (key) => screen.getByTestId(`body-day-diff-${key}`);

describe('BodyAssessmentDay', () => {
  it('abre na avaliação mais recente (a de hoje conta)', () => {
    monta();
    expect(screen.getByTestId('body-day-title')).toHaveTextContent('Hoje');
    expect(screen.getByText('Avaliação 4 de 4 · a mais recente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avaliação seguinte' })).toBeDisabled();
  });

  it('mostra todas as métricas medidas nessa avaliação, com vírgula decimal', () => {
    monta();
    expect(screen.getByTestId('body-day-value-weight_kg')).toHaveTextContent('76,0 kg');
    expect(screen.getByTestId('body-day-value-bone_mass_kg')).toHaveTextContent('3,1 kg');
    expect(screen.queryByTestId('body-day-row-visceral_fat')).not.toBeInTheDocument();
  });

  it('compara com a anterior por omissão: diferenças, cor pela direção e dias entre as duas', () => {
    monta();
    expect(screen.getByTestId('body-day-compare')).toHaveValue('prev');
    expect(screen.getByTestId('body-day-gap')).toHaveTextContent('12 set → 4 out · 22 dias entre as duas');
    // Peso com objetivo 74 kg: descer é bom.
    expect(diff('weight_kg')).toHaveTextContent('▼ 1,5 kg');
    expect(diff('weight_kg')).toHaveAttribute('data-tone', 'good');
    expect(diff('weight_kg')).toHaveTextContent('desceu 1,5 kg, no bom sentido');
    // Gordura a descer: bom; massa muscular a descer: mau.
    expect(diff('body_fat_pct')).toHaveAttribute('data-tone', 'good');
    expect(diff('muscle_mass_kg')).toHaveAttribute('data-tone', 'bad');
    // A anterior não mediu a massa óssea.
    expect(screen.getByTestId('body-day-row-bone_mass_kg')).toHaveTextContent('sem leitura a 12 set');
  });

  it('"Comparar com…" tem a anterior, há ~3 meses, a primeira e todas as anteriores', () => {
    monta();
    const sel = screen.getByRole('combobox', { name: 'Comparar com' });
    const opts = within(sel).getAllByRole('option').map((o) => o.textContent);
    expect(opts).toEqual([
      'A anterior · 12 set (22 dias antes)',
      'Há ~3 meses · 5 jul (91 dias antes)',
      'A primeira · 10 jan (267 dias antes)',
      '12 set (22 dias antes)',
      '5 jul (91 dias antes)',
      '10 jan (267 dias antes)',
    ]);
  });

  it('escolher "A primeira" muda a referência e os dias', () => {
    monta();
    fireEvent.change(screen.getByTestId('body-day-compare'), { target: { value: 'first' } });
    expect(screen.getByTestId('body-day-gap')).toHaveTextContent('10 jan → 4 out · 267 dias entre as duas');
    expect(diff('weight_kg')).toHaveTextContent('▼ 6,0 kg');
    // A primeira não tinha massa muscular.
    expect(screen.getByTestId('body-day-row-muscle_mass_kg')).toHaveTextContent('sem leitura a 10 jan');
  });

  it('‹ salta para a avaliação anterior (não para o dia anterior) e o modo mantém-se', () => {
    monta();
    fireEvent.change(screen.getByTestId('body-day-compare'), { target: { value: 'first' } });
    fireEvent.click(screen.getByRole('button', { name: 'Avaliação anterior' }));
    expect(screen.getByTestId('body-day-title')).toHaveTextContent('sáb, 12 set');
    expect(screen.getByText('Avaliação 3 de 4')).toBeInTheDocument();
    expect(screen.getByTestId('body-day-gap')).toHaveTextContent('10 jan → 12 set');
  });

  it('um id escolhido que deixa de ser anterior volta à anterior', () => {
    monta();
    fireEvent.change(screen.getByTestId('body-day-compare'), { target: { value: 'id:x2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Avaliação anterior' }));
    expect(screen.getByTestId('body-day-compare')).toHaveValue('prev');
    expect(screen.getByTestId('body-day-gap')).toHaveTextContent('5 jul → 12 set');
  });

  it('na primeira: ‹ desativado e diz que não há com que comparar', () => {
    monta();
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Avaliação anterior' }));
    expect(screen.getByRole('button', { name: 'Avaliação anterior' })).toBeDisabled();
    expect(screen.getByTestId('body-day-first')).toHaveTextContent('Esta é a primeira avaliação registada');
    expect(screen.queryByTestId('body-day-compare')).not.toBeInTheDocument();
  });

  it('peso sem objetivo fica neutro; abaixo do ruído é "igual"', () => {
    const list = sortAssessments([
      { id: 'p', date: '2026-09-20', weight_kg: 78, body_fat_pct: 20 },
      { id: 'q', date: '2026-10-01', weight_kg: 76, body_fat_pct: 20.4 },
    ]);
    monta(list, {});
    expect(diff('weight_kg')).toHaveAttribute('data-tone', 'neutral');
    expect(diff('body_fat_pct')).toHaveTextContent('= igual');
    expect(screen.getByText(/Diferenças abaixo do erro da balança contam como iguais/)).toBeInTheDocument();
  });

  it('alvos de toque de 44 px nas setas e no seletor', () => {
    monta();
    expect(screen.getByRole('button', { name: 'Avaliação anterior' }).style.height).toBe('44px');
    expect(screen.getByTestId('body-day-compare').style.minHeight).toBe('var(--tap)');
  });
});
