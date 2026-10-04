import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MicronutrientsCard from './MicronutrientsCard';
import { micronutrientAverages } from '@formulas/nutritionPeriod.ts';

/* Cobertura dos micronutrientes (D6 da Evolução, 2026-10-05): "dado em X% dos
   alimentos" só quando é honesta — todos os alimentos do período gravados
   depois de a analyze-meal passar a gravar null. Antes disso, os zeros são
   ambíguos e fica "São mínimos". */

// A data da mudança passa-se explícita (revisão 2026-10-05): MICROS_NULL_SINCE
// é null até ao deploy real da analyze-meal nova.
const SINCE = { since: '2026-10-05T00:00:00Z' };
const plain = (el) => (el.textContent || '').replace(/[  ]/g, ' ');
const item = (created_at, extra = {}) => ({
  quantity_grams: 100, calories_per_100g: 100, protein_per_100g: 5, carbs_per_100g: 10, fat_per_100g: 2,
  fiber_per_100g: null, sugar_per_100g: null, sodium_per_100g: null, iron_mg_per_100g: null,
  calcium_mg_per_100g: null, vitamin_c_mg_per_100g: null, potassium_mg_per_100g: null,
  created_at, ...extra,
});

function open(props) {
  render(<MicronutrientsCard title="Micronutrientes · média por dia" subtitle="6 – 7 out · 2 dias" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Micronutrientes/ }));
}

describe('MicronutrientsCard — cobertura (D6)', () => {
  it('período todo depois da mudança: "pelo menos" e "dado em X% dos alimentos"; sem dados quando nenhum traz', () => {
    // 13 itens, ferro dado em 7 (54%), fibra em todos, potássio em nenhum.
    const items = Array.from({ length: 13 }, (_, i) => item('2026-10-06T12:00:00+00:00', {
      fiber_per_100g: 2,
      ...(i < 7 ? { iron_mg_per_100g: 2 } : {}),
    }));
    const micros = micronutrientAverages([{ date: '2026-10-06', meal_items: items }], ['2026-10-06'], SINCE);
    expect(micros.coverageKnown).toBe(true);
    open({ values: micros.avg, coverage: micros.coverage, coverageKnown: micros.coverageKnown });

    expect(plain(screen.getByTestId('micro-iron_mg'))).toContain('pelo menos 14 mg/dia');
    expect(screen.getByTestId('micro-iron_mg-coverage')).toHaveTextContent('dado em 54% dos alimentos');
    expect(plain(screen.getByTestId('micro-fiber'))).not.toContain('pelo menos');
    expect(screen.getByTestId('micro-fiber-coverage')).toHaveTextContent('dado em todos os alimentos');
    expect(screen.getByTestId('micro-potassium_mg')).toHaveTextContent('sem dados');
    expect(screen.getByTestId('micro-potassium_mg-coverage')).toHaveTextContent('nenhum alimento traz este valor');
    expect(screen.queryByText(/São mínimos/)).toBeNull();
    expect(screen.getByText('«Pelo menos»: os alimentos sem esta informação ficam de fora da soma.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('período com alimentos de antes da mudança: sem cobertura, "São mínimos" como antes', () => {
    const micros = micronutrientAverages([
      { date: '2026-10-04', meal_items: [item('2026-10-04T13:00:00+00:00', { iron_mg_per_100g: 0 })] },
      { date: '2026-10-06', meal_items: [item('2026-10-06T13:00:00+00:00', { iron_mg_per_100g: 3 })] },
    ], ['2026-10-04', '2026-10-05', '2026-10-06'], SINCE);
    expect(micros.coverageKnown).toBe(false);
    open({ values: micros.avg, coverage: micros.coverage, coverageKnown: micros.coverageKnown });
    expect(screen.getByText('São mínimos: alimentos sem esta informação contam como zero.')).toBeInTheDocument();
    expect(screen.queryByTestId('micro-iron_mg-coverage')).toBeNull();
    expect(plain(screen.getByTestId('micro-iron_mg'))).not.toContain('pelo menos');
    expect(plain(screen.getByTestId('micro-iron_mg'))).toContain('1,5 mg/dia');
  });

  it('vista Dia (perDay=false): "pelo menos 3 mg" sem "/dia"; um valor null nunca aparece como NaN', () => {
    open({
      values: { fiber: null, sugar: undefined, sodium: NaN, iron_mg: 3, calcium_mg: 0, vitamin_c_mg: 0, potassium_mg: 0 },
      coverage: { fiber: 0, sugar: 0, sodium: 0, iron_mg: 0.5, calcium_mg: 1, vitamin_c_mg: 1, potassium_mg: 1 },
      coverageKnown: true,
      perDay: false,
    });
    expect(plain(screen.getByTestId('micro-iron_mg'))).toContain('pelo menos 3 mg');
    expect(plain(screen.getByTestId('micro-iron_mg'))).not.toContain('/dia');
    expect(document.body.textContent).not.toMatch(/NaN/);
  });

  it('antes do deploy (MICROS_NULL_SINCE null): sete zeros da função antiga nunca viram "dado em todos os alimentos"', () => {
    const zeros = { fiber_per_100g: 0, sugar_per_100g: 0, sodium_per_100g: 0, iron_mg_per_100g: 0,
      calcium_mg_per_100g: 0, vitamin_c_mg_per_100g: 0, potassium_mg_per_100g: 0 };
    const micros = micronutrientAverages([{ date: '2026-10-05', meal_items: [item('2026-10-05T10:00:00Z', zeros)] }], ['2026-10-05']);
    expect(micros.coverageKnown).toBe(false);
    open({ values: micros.avg, coverage: micros.coverage, coverageKnown: micros.coverageKnown });
    expect(screen.getByText('São mínimos: alimentos sem esta informação contam como zero.')).toBeInTheDocument();
    expect(screen.queryByText(/dado em todos os alimentos/)).toBeNull();
  });

  it('cobertura parcial com soma 0: sem "pelo menos 0", diz que os dados deram 0', () => {
    open({
      values: { fiber: 0, sugar: 0, sodium: 0, iron_mg: 0, calcium_mg: 0, vitamin_c_mg: 0, potassium_mg: 0 },
      coverage: { fiber: 1, sugar: 1, sodium: 1, iron_mg: 1, calcium_mg: 1, vitamin_c_mg: 0.4, potassium_mg: 1 },
      coverageKnown: true,
    });
    expect(plain(screen.getByTestId('micro-vitamin_c_mg'))).not.toContain('pelo menos');
    expect(plain(screen.getByTestId('micro-vitamin_c_mg'))).toContain('0 mg/dia');
    expect(screen.getByTestId('micro-vitamin_c_mg-coverage')).toHaveTextContent('dado em 40% dos alimentos, sempre com 0');
  });

  it('sem coverage (chamador antigo): comportamento de antes', () => {
    open({ values: { fiber: 5, sugar: 0, sodium: 0, iron_mg: 0, calcium_mg: 0, vitamin_c_mg: 0, potassium_mg: 0 } });
    expect(screen.getByText('São mínimos: alimentos sem esta informação contam como zero.')).toBeInTheDocument();
    expect(screen.queryByTestId('micro-fiber-coverage')).toBeNull();
  });
});
