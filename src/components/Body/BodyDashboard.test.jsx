import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Corpo — factos errados C1–C5 (evolução 2026-10-04). O BodyDashboard
   monta-se inteiro, com o store simulado e os gráficos substituídos por
   marcadores (o jsdom não tem canvas). Hoje fixo a 4 out 2026; o filtro por
   omissão é o trimestre (depois de 4 jul). */

const h = vi.hoisted(() => ({ state: {}, lines: [] }));

vi.mock('../../store', () => ({ useAppStore: () => h.state }));
vi.mock('react-chartjs-2', () => ({
  Line: (props) => { h.lines.push(props); return <div data-testid="chart-line" />; },
  Bar: () => <div data-testid="chart-bar" />,
}));

import BodyDashboard from './BodyDashboard';

const av = (date, over = {}) => ({ id: `a-${date}`, date, ...over });

function monta(bodyAssessments) {
  h.state = { bodyAssessments, gymSessions: [], profile: {}, setOpenCreationMode: vi.fn() };
  return render(<BodyDashboard />);
}

const frame = (label) => screen.getAllByTestId('chart-frame').find((f) => within(f).queryAllByText(label).length > 0);

beforeEach(() => {
  h.lines.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('C4 — número grande da métrica selecionada', () => {
  it('sai "72,4" com a unidade à parte (não "72.4 kg kg") e conta', () => {
    monta([av('2026-09-20', { weight_kg: 72.0 }), av('2026-10-01', { weight_kg: 72.4 })]);
    const f = frame('Peso');
    const value = within(f).getByTestId('chart-frame-value');
    expect(value).toHaveTextContent('72,4');
    expect(value).not.toHaveTextContent('kg');
    expect(value.getAttribute('data-count-to')).toBe('72.4');
    expect(within(f).getByTestId('chart-frame-unit')).toHaveTextContent('kg');
    expect(f.textContent).not.toMatch(/72\.4/);
  });

  it('o cartão escreve valor e delta com vírgula decimal', () => {
    monta([av('2026-09-20', { weight_kg: 72.0 }), av('2026-10-01', { weight_kg: 72.4 })]);
    expect(screen.getByTestId('body-card-value-weight_kg')).toHaveTextContent('72,4 kg');
    expect(screen.getByText('+0,4 kg')).toBeInTheDocument();
  });
});

describe('C1/C2 — ritmo semanal da tendência de peso', () => {
  it('2 pesagens a 3 dias não dão "kg/semana" — diz o que falta', () => {
    monta([av('2026-10-01', { weight_kg: 80 }), av('2026-10-04', { weight_kg: 80.6 })]);
    const f = frame('Evolução de peso');
    expect(f.textContent).not.toMatch(/kg\/semana/);
    expect(f).toHaveTextContent('Preciso de 3 pesagens em 10 dias para a tendência');
    expect(f).toHaveTextContent('há 2 pesagens em 3 dias');
  });

  it('80,0 a 10/07 e 74,0 a 01/10: sem ritmo inventado', () => {
    monta([av('2026-07-10', { weight_kg: 80 }), av('2026-10-01', { weight_kg: 74 })]);
    const f = frame('Evolução de peso');
    expect(f.textContent).not.toMatch(/kg\/semana/);
    expect(f).toHaveTextContent('só há essa');
  });

  it('4 pesagens em 14 dias a descer 0,1 kg/dia → −0,7 kg/semana', () => {
    monta([
      av('2026-09-17', { weight_kg: 80 }),
      av('2026-09-21', { weight_kg: 79.6 }),
      av('2026-09-26', { weight_kg: 79.1 }),
      av('2026-10-01', { weight_kg: 78.6 }),
    ]);
    const f = frame('Evolução de peso');
    expect(f).toHaveTextContent('−0,7 kg/semana');
    expect(f.textContent).not.toMatch(/Preciso de/);
  });

  it('plural certo com uma só pesagem', () => {
    monta([av('2026-10-01', { weight_kg: 74 })]);
    expect(frame('Evolução de peso')).toHaveTextContent('1 pesagem');
  });
});

describe('C5 — métrica sem leitura no período', () => {
  const dados = () => [
    av('2025-11-01', { weight_kg: 85, body_fat_pct: 25.3 }),
    av('2026-10-01', { weight_kg: 78 }),
  ];

  it('o cartão mostra o último valor com a data dele, não como se fosse do período', () => {
    monta(dados());
    expect(screen.getByTestId('body-card-value-body_fat_pct')).toHaveTextContent('25,3 %');
    expect(screen.getByTestId('body-card-date-body_fat_pct')).toHaveTextContent('a 1 nov 2025');
  });

  it('métrica que nunca teve leitura fica "—", sem data', () => {
    monta(dados());
    expect(screen.getByTestId('body-card-value-bone_mass_kg')).toHaveTextContent('—');
    expect(screen.queryByTestId('body-card-date-bone_mass_kg')).not.toBeInTheDocument();
  });

  it('ao tocar no cartão, o gráfico diz de quando é a última leitura', () => {
    monta(dados());
    fireEvent.click(screen.getByTestId('body-card-value-body_fat_pct').closest('button'));
    const f = frame('Gordura corporal');
    expect(f).toHaveTextContent('Sem leituras desta métrica no período selecionado. A última é de 1 nov 2025 (25,3 %).');
  });

  it('as leituras do período não levam data', () => {
    monta(dados());
    expect(screen.getByTestId('body-card-value-weight_kg')).toHaveTextContent('78,0 kg');
    expect(screen.queryByTestId('body-card-date-weight_kg')).not.toBeInTheDocument();
  });
});

describe('C3 — composição corporal sem gordura medida', () => {
  it('uma pesagem sem gordura não vira "+14,0 kg de massa magra" nem "Massa gorda 0,0 kg"', () => {
    monta([
      av('2026-08-01', { weight_kg: 80, body_fat_pct: 20 }),
      av('2026-10-01', { weight_kg: 78, body_fat_pct: null }),
    ]);
    const f = frame('Composição corporal');
    expect(f).toHaveTextContent('1 avaliação');
    expect(f.textContent).not.toMatch(/\+14,0/);
    expect(f.textContent).not.toMatch(/Massa gorda 0,0/);
    expect(f).toHaveTextContent('Preciso de 2 avaliações com gordura medida');
  });
});

describe('F5 — gráficos de linha sem animação própria e com props estáveis (2026-10-04)', () => {
  it('as linhas pedem a transição curta, partilham as opções e não definem `animation`', () => {
    monta([av('2026-09-20', { weight_kg: 72.0 }), av('2026-09-25', { weight_kg: 72.2 }), av('2026-10-01', { weight_kg: 72.4 })]);
    expect(h.lines.length).toBeGreaterThanOrEqual(2);
    for (const l of h.lines) expect(l.updateMode).toBe('period');
    const [a, b] = h.lines;
    expect(a.options).toBe(b.options);
    expect(a.options.animation).toBeUndefined();
  });

  it('um render igual não troca `data` nem `options` (cada referência nova faz chart.update())', () => {
    const rows = [av('2026-09-20', { weight_kg: 72.0 }), av('2026-09-25', { weight_kg: 72.2 }), av('2026-10-01', { weight_kg: 72.4 })];
    const { rerender } = monta(rows);
    const first = h.lines.filter((l) => l.data.datasets.length === 1).at(-1);
    h.lines.length = 0;
    rerender(<BodyDashboard />);
    const again = h.lines.filter((l) => l.data.datasets.length === 1).at(-1);
    expect(again.data).toBe(first.data);
    expect(again.options).toBe(first.options);
  });

  it('trocar de métrica muda os dados (transição de 300 ms), não as opções', () => {
    monta([av('2026-09-20', { weight_kg: 72.0, body_fat_pct: 18 }), av('2026-10-01', { weight_kg: 72.4, body_fat_pct: 17.5 })]);
    const before = h.lines.filter((l) => l.data.datasets.length === 1).at(-1);
    fireEvent.click(screen.getByTestId('body-card-value-body_fat_pct').closest('button'));
    const after = h.lines.filter((l) => l.data.datasets.length === 1).at(-1);
    expect(after.data).not.toBe(before.data);
    expect(after.options).toBe(before.options);
  });
});
