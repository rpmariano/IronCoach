import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Corpo na Evolução por períodos de calendário (2026-10-04, fase 5 — plano §3
   Corpo e D1; C1–C5). Monta-se o separador inteiro com o store real e os
   gráficos substituídos por marcadores (o jsdom não tem canvas). Hoje fixo:
   domingo, 4 out 2026; por omissão o Corpo abre no trimestre (out – dez). */

const h = vi.hoisted(() => ({ today: '2026-10-04', lines: [] }));
vi.mock('../../utils/useTodayISO', () => ({ useTodayISO: () => h.today }));
vi.mock('react-chartjs-2', () => ({
  Line: (props) => { h.lines.push(props); return <div data-testid="chart-line" />; },
  Bar: () => <div data-testid="chart-bar" />,
}));

import { useAppStore } from '../../store';
import { usePeriodStore } from '../../store/periodStore';
import { resetEvolutionCache } from '../../store/evolution/cache';
import BodyDashboard from './BodyDashboard';

let seq = 0;
const av = (date, over = {}) => ({ id: `a${seq++}`, date, ...over });
const DADOS = [
  av('2026-07-05', { weight_kg: 80, body_fat_pct: 22 }),
  av('2026-08-02', { weight_kg: 79, body_fat_pct: 21.5 }),
  av('2026-09-01', { weight_kg: 77.8 }),
  av('2026-09-10', { weight_kg: 77.5 }),
  av('2026-09-15', { weight_kg: 77.3 }),
  av('2026-09-20', { weight_kg: 77.0, body_fat_pct: 20, muscle_mass_kg: 58 }),
  av('2026-09-24', { weight_kg: 76.8 }),
  av('2026-09-28', { weight_kg: 76.6 }),
  av('2026-10-01', { weight_kg: 76.4 }),
  av('2026-10-04', { weight_kg: 76.2 }),
];

function monta(bodyAssessments = DADOS, profile = {}) {
  useAppStore.setState({ bodyAssessments, profile, gymSessions: [], setOpenCreationMode: vi.fn() });
  return render(<BodyDashboard />);
}

const summary = () => screen.getByRole('region', { name: 'Resumo do período' });
const nameOf = (el) => (el.getAttribute('aria-label') || '').replace(/[  ]/g, ' ');
const row = (label) => within(summary()).getByRole('radio', { name: new RegExp(`^${label}:`) });
const frames = () => screen.queryAllByTestId('chart-frame');
const frame = (label) => frames().find((f) => within(f).queryAllByText(label).length > 0);
const setPeriod = (kind, offset = 0) => usePeriodStore.getState().setPeriod('corpo', kind, offset);

beforeEach(() => {
  h.today = '2026-10-04';
  h.lines.length = 0;
  usePeriodStore.getState().reset();
  resetEvolutionCache();
});

describe('seletor e navegador (D1, R1)', () => {
  it('Dia · Semana · Mês · Trimestre · Ano, com Trimestre por omissão', () => {
    monta();
    const group = screen.getAllByRole('group', { name: 'Período' })[0];
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dia', 'Semana', 'Mês', 'Trimestre', 'Ano']);
    expect(within(group).getByRole('button', { name: 'Trimestre' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('o navegador vive no resumo e conta avaliações (hoje conta)', () => {
    monta();
    expect(within(summary()).getByTestId('period-title')).toHaveTextContent('out – dez 2026');
    expect(within(summary()).getByText('em curso · 2 avaliações')).toBeInTheDocument();
  });

  it('‹ leva ao trimestre anterior, com "desde 5 jul" e "Voltar a este trimestre"', () => {
    monta();
    fireEvent.click(within(summary()).getByRole('button', { name: 'Trimestre anterior' }));
    expect(within(summary()).getByText('desde 5 jul · 8 avaliações')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar a este trimestre' })).toBeInTheDocument();
    expect(screen.getByText('Primeiro trimestre com registos — ainda não há outro para comparar.')).toBeInTheDocument();
  });
});

describe('resumo: última leitura do período com data (C5)', () => {
  it('peso: a pesagem de hoje é a última, com a data', () => {
    monta();
    const r = row('Peso');
    expect(within(r).getByTestId('row-value')).toHaveTextContent('76,2 kg');
    expect(r).toHaveTextContent('4 out');
    expect(within(summary()).getByText('Última leitura (2 avaliações)')).toBeInTheDocument();
  });

  it('métrica sem leitura no período: "—" com a data da última, nunca o valor como se fosse do período', () => {
    monta();
    const r = row('Gordura corporal');
    expect(within(r).getByTestId('row-value')).toHaveTextContent('—');
    expect(r).toHaveTextContent('sem leitura · última a 20 set');
    expect(nameOf(r)).toContain('a última é de 20 set, 20,0 %');
  });

  it('métricas nunca registadas não aparecem', () => {
    monta();
    expect(within(summary()).queryByRole('radio', { name: /^Massa óssea:/ })).not.toBeInTheDocument();
    expect(within(summary()).getAllByRole('radio')).toHaveLength(3);
  });

  it('setembro vs agosto: −2,4 kg; com objetivo abaixo, a verde (Dentro)', () => {
    setPeriod('mes', -1);
    monta(DADOS, { goal_weight_kg: 72 });
    const r = row('Peso');
    expect(r).toHaveTextContent('−2,4 kg vs agosto');
    expect(within(r).getByTestId('row-status')).toHaveAttribute('data-status', 'ok');
    expect(nameOf(r)).toContain('desceu 2,4 kg face a agosto, no bom sentido');
  });

  it('sem objetivo, o peso não tem cor de bom ou mau', () => {
    setPeriod('mes', -1);
    monta();
    expect(within(row('Peso')).getByTestId('row-status')).toHaveAttribute('data-status', 'none');
  });

  // 2026-10-04, revisão: os 14 dias são do histórico da métrica.
  it('histórico com menos de 14 dias: sem diferença, com a nota do porquê', () => {
    setPeriod('mes');
    monta([av('2026-09-25', { weight_kg: 77 }), av('2026-10-02', { weight_kg: 76 })]);
    expect(row('Peso')).toHaveTextContent('1 leitura');
    expect(screen.getByText(/aparecem quando as tuas leituras cobrirem pelo menos 14 dias/)).toBeInTheDocument();
  });

  it('na semana há diferença face à semana passada (era impossível com 14 dias entre leituras)', () => {
    setPeriod('semana');
    monta();
    expect(row('Peso')).toHaveTextContent('−0,6 kg vs semana passada');
    expect(screen.queryByText(/cobrirem pelo menos 14 dias/)).not.toBeInTheDocument();
  });

  it('período em curso com dados: linha do anterior com "Ver jul – set ›" (mock-up)', () => {
    monta();
    const s = summary();
    expect(s).toHaveTextContent('jul – set: última pesagem 76,6 kg a 28 set · 8 avaliações');
    fireEvent.click(within(s).getByRole('button', { name: /Ver jul – set/ }));
    expect(within(summary()).getByText('desde 5 jul · 8 avaliações')).toBeInTheDocument();
  });

  it('período antes da 1.ª avaliação: o veredicto diz-o com a data', () => {
    setPeriod('trimestre', -2);
    monta();
    expect(within(summary()).getByTestId('verdict-line')).toHaveTextContent('Este trimestre é anterior à tua primeira avaliação (5 jul).');
    expect(screen.getByText('Sem avaliações neste período — a primeira é de 5 jul.')).toBeInTheDocument();
  });
});

describe('gráficos', () => {
  it('Peso escolhido: só a tendência, sem o gráfico "Peso" duplicado (D5)', () => {
    setPeriod('mes', -1);
    monta();
    // 6 pesagens em setembro: já há linha de tendência (EWMA, ≥5).
    expect(frame('Tendência de peso')).toBeTruthy();
    expect(frames().filter((f) => within(f).queryAllByText('Peso', { exact: true }).length > 0)).toHaveLength(0);
  });

  it('eixo temporal real: os pontos ficam espaçados pelas datas', () => {
    setPeriod('mes', -1);
    monta();
    const raw = h.lines.at(-1).data.datasets.find((d) => d.label === 'Pesagens').data;
    const gaps = raw.slice(1).map((p, i) => p.x - raw[i].x);
    expect(gaps).toEqual([9, 5, 5, 4, 4]); // 1, 10, 15, 20, 24, 28 set
    expect(h.lines.at(-1).options.scales.x.type).toBe('linear');
  });

  it('número grande = última pesagem (um só "peso atual"), com a data', () => {
    setPeriod('mes', -1);
    monta();
    const f = frame('Tendência de peso');
    expect(within(f).getByTestId('chart-frame-value')).toHaveTextContent('76,6');
    expect(f).toHaveTextContent('6 pesagens · última a 28 set');
  });

  it('ritmo estável em texto quando |ritmo| < 0,05 kg/semana', () => {
    setPeriod('mes', -1);
    monta(['2026-09-14', '2026-09-19', '2026-09-24', '2026-09-28'].map((d) => av(d, { weight_kg: 75 })));
    expect(frame('Evolução de peso')).toHaveTextContent('estável');
    expect(frame('Evolução de peso').textContent).not.toMatch(/kg\/semana/);
  });

  it('perigo só para PERDA rápida, não para ganho', () => {
    const datas = ['2026-09-20', '2026-09-24', '2026-09-28', '2026-10-02'];
    setPeriod('mes', -1);
    const { unmount } = monta(datas.slice(0, 3).map((d, i) => av(d, { weight_kg: 80 + i * 1.2 })));
    const tones = () => screen.getAllByTestId('verdict-line').map((el) => el.getAttribute('data-tone'));
    expect(tones()).not.toContain('danger');
    unmount();
    resetEvolutionCache();
    // O ano em curso: perder 1,3 kg a cada 4 dias é perigo agora.
    setPeriod('ano', 0);
    const again = monta(datas.map((d, i) => av(d, { weight_kg: 80 - i * 1.3 })));
    expect(tones()).toContain('danger');
    expect(within(frame('Evolução de peso')).getByText(/kg\/semana/)).toBeInTheDocument();
    again.unmount();
    resetEvolutionCache();
    // O mesmo ritmo em março: história, não alarme de agora (revisão 2026-10-04).
    monta(['2026-03-01', '2026-03-05', '2026-03-09', '2026-03-13'].map((d, i) => av(d, { weight_kg: 80 - i * 1.3 })));
    expect(tones()).not.toContain('danger');
    expect(within(summary()).getByTestId('verdict-line')).toHaveTextContent('Até 13 mar perdias peso depressa demais');
  });

  it('pesagens que não chegam: diz o que falta, sem kg/semana (C1/C2)', () => {
    monta([av('2026-10-01', { weight_kg: 80 }), av('2026-10-04', { weight_kg: 80.6 })]);
    const f = frame('Evolução de peso');
    expect(f.textContent).not.toMatch(/kg\/semana/);
    expect(f).toHaveTextContent('nas duas semanas até 4 out há 2 pesagens em 3 dias');
  });

  /* Revisão 2026-10-04 (C1/C2): na semana o ritmo vem das pesagens até à
     última do período, também as de antes — a semana tem ritmo. */
  it('semana em curso: com ritmo (5 pesagens nas duas semanas até 4 out), sem "falta"', () => {
    setPeriod('semana');
    monta();
    // Há ≥5 pesagens no histórico: a linha é a EWMA, que entra vinda de 24 set.
    const f = frame('Tendência de peso');
    expect(f).toHaveTextContent('−0,4 kg/semana');
    expect(f.textContent).not.toMatch(/Preciso/);
    // Hoje é domingo, o último dia da semana: o eixo já acaba no fim dela.
    expect(f).toHaveTextContent('3 pesagens · última a 4 out');
    expect(f.textContent).not.toMatch(/até hoje/);
  });

  it('período em curso: o eixo acaba hoje, não a 31 dez', () => {
    monta();
    const x = h.lines.at(-1).options.scales.x;
    expect(x.max - x.min).toBe(3); // 1 → 4 out
    expect(frame('Tendência de peso')).toHaveTextContent('2 pesagens · última a 4 out · até hoje');
  });

  it('tocar noutra métrica troca o gráfico; sem leituras no período diz de quando é a última', () => {
    monta();
    fireEvent.click(row('Gordura corporal'));
    expect(frame('Gordura corporal')).toHaveTextContent('Sem leituras desta métrica neste período. A última é de 20 set (20,0 %).');
  });

  it('composição só aparece a quem já mediu gordura, e só com avaliações válidas', () => {
    setPeriod('trimestre', -1);
    const { unmount } = monta();
    expect(frame('Composição corporal')).toHaveTextContent('3 avaliações com gordura medida');
    unmount();
    resetEvolutionCache();
    monta([av('2026-09-20', { weight_kg: 77 })]);
    expect(frame('Composição corporal')).toBeUndefined();
  });

  it('período fechado: sem gordura medida não há cartão; com 1, o rodapé fala desse período', () => {
    const list = [av('2026-08-02', { weight_kg: 79, body_fat_pct: 21.5 }), av('2026-09-20', { weight_kg: 77, body_fat_pct: 20 }), av('2026-09-24', { weight_kg: 76.8 })];
    setPeriod('mes', -1);
    const { unmount } = monta(list);
    expect(frame('Composição corporal')).toHaveTextContent('Só houve 1 avaliação com gordura medida em setembro — a evolução precisa de 2.');
    unmount();
    resetEvolutionCache();
    setPeriod('semana', -1); // 21 – 27 set: só a de 24 set, sem gordura
    monta(list);
    expect(frame('Composição corporal')).toBeUndefined();
  });
});

describe('hoje conta (plano §3 Corpo: R2 só se aplica a médias)', () => {
  it('a nota do fundo diz que hoje conta, só no período em curso', () => {
    monta();
    expect(screen.getByTestId('today-excluded-note')).toHaveTextContent('No Corpo, hoje conta');
  });

  it('num período passado não há nota de hoje', () => {
    setPeriod('mes', -1);
    monta();
    expect(screen.queryByTestId('today-excluded-note')).not.toBeInTheDocument();
  });
});

describe('período a começar (R8)', () => {
  it('segunda sem avaliação: "A semana começou hoje", o resumo da anterior e os atalhos', () => {
    h.today = '2026-10-05';
    setPeriod('semana');
    monta();
    const early = screen.getByTestId('early-a-comecar');
    expect(within(early).getByRole('heading', { name: 'A semana começou hoje' })).toBeInTheDocument();
    expect(within(early).getByTestId('early-previous-summary')).toHaveTextContent('Semana passada (28 set – 4 out): última pesagem 76,2 kg a 4 out · 3 avaliações');
    expect(within(summary()).getByTestId('verdict-line')).toHaveTextContent('Ainda sem avaliações nesta semana. A última pesagem foi a 4 out: 76,2 kg.');
    fireEvent.click(within(early).getByRole('button', { name: /Ver a última avaliação/ }));
    expect(screen.getByTestId('body-day-title')).toHaveTextContent('Ontem');
  });

  it('"Ver semana passada" recua', () => {
    h.today = '2026-10-05';
    setPeriod('semana');
    monta();
    fireEvent.click(screen.getByRole('button', { name: /Ver semana passada/ }));
    expect(within(summary()).getByTestId('period-title')).toHaveTextContent('Semana passada');
  });
});

describe('sem avaliações nenhumas', () => {
  it('convite a registar, com o botão que abre o registo', () => {
    monta([]);
    expect(screen.getByText(/Ainda não há avaliações/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Registar avaliação/ }));
    expect(useAppStore.getState().setOpenCreationMode).toHaveBeenCalledWith('assessment');
  });
});

describe('F5 — gráficos com props estáveis', () => {
  it('um render igual não troca `data` nem `options`; pedem a transição curta', () => {
    setPeriod('mes', -1);
    const { rerender } = monta();
    const first = h.lines.at(-1);
    h.lines.length = 0;
    rerender(<BodyDashboard />);
    const again = h.lines.at(-1);
    expect(again.data).toBe(first.data);
    expect(again.options).toBe(first.options);
    expect(again.updateMode).toBe('period');
    expect(again.options.animation).toBeUndefined();
  });
});
