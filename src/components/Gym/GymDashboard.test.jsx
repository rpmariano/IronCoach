import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* Ginásio por períodos de calendário (evolução 2026-10-04, fase 5): G1–G7 e D5.
   O GymDashboard monta-se inteiro, com o store simulado e os gráficos
   substituídos por marcadores (o jsdom não tem canvas). "Hoje" é fixo (domingo,
   4 out 2026) e mexe-se por `h.today` para os testes de "a começar".
   Semanas: seg 21 set, seg 28 set; hoje (dom 4 out) a semana de 28 set é a em curso. */

const h = vi.hoisted(() => ({ state: {}, barProps: [], today: '2026-10-04', ready: true }));

vi.mock('../../utils/useTodayISO', () => ({ useTodayISO: () => h.today, default: () => h.today }));
vi.mock('../../store', () => ({ useAppStore: (sel) => (typeof sel === 'function' ? sel(h.state) : h.state), sliceReady: () => h.ready }));
vi.mock('react-chartjs-2', () => ({
  Bar: (props) => { h.barProps.push(props); return <div data-testid="chart-bar" />; },
  Line: () => <div data-testid="chart-line" />,
  Doughnut: () => <div data-testid="chart-donut" />,
}));

import GymDashboard from './GymDashboard';
import { usePeriodStore } from '../../store/periodStore';
import { resetEvolutionCache } from '../../store/evolution/cache';

let n = 0;
const sets = (count, weight = 50, reps = 10, name = 'Supino reto') =>
  Array.from({ length: count }, () => ({ exercise_name: name, reps, weight }));
const forca = (date, over = {}) => ({ id: `f${n++}`, date, kind: 'forca', categories: ['Peito'], workout_session_sets: sets(2), ...over });
const aula = (date, over = {}) => ({
  id: `a${n++}`, date, kind: 'aula', name: 'Pilates', class_types: ['Pilates'], categories: [], workout_session_sets: [], ...over,
});

function monta({ sessions = [], runs = [], kind = 'mes', offset = -1 } = {}) {
  h.state = { gymSessions: sessions, runs, setOpenCreationMode: vi.fn() };
  act(() => usePeriodStore.getState().setPeriod('ginasio', kind, offset));
  return render(<GymDashboard />);
}

const frame = (label) => screen.getAllByTestId('chart-frame').find((f) => within(f).queryAllByText(label).length > 0);
const linha = (label) => screen.getAllByTestId('summary-row').find((r) => within(r).queryByText(label));

// Duas por semana desde agosto, a semana de 14 set em branco (zero explícito).
const SETEMBRO = [
  forca('2026-08-25'),
  forca('2026-09-07'), forca('2026-09-10'),
  forca('2026-09-21'), forca('2026-09-24'),
  forca('2026-09-28'), forca('2026-09-30'),
];

beforeEach(() => {
  h.barProps.length = 0;
  h.today = '2026-10-04';
  h.ready = true;
  resetEvolutionCache();
  act(() => usePeriodStore.getState().reset());
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('o seletor e o navegador (R1)', () => {
  it('oferece Semana · Mês · Trimestre, sem Dia', () => {
    monta({ sessions: SETEMBRO });
    const grupo = screen.getByRole('group', { name: 'Período' });
    const botoes = within(grupo).getAllByRole('button').map((b) => b.textContent);
    expect(botoes).toEqual(['Semana', 'Mês', 'Trimestre']);
  });

  it('o navegador diz o período e volta ao atual', () => {
    monta({ sessions: SETEMBRO, kind: 'mes', offset: -1 });
    expect(screen.getByText('Voltar a este mês')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByText('Voltar a este mês')); });
    expect(usePeriodStore.getState().tabs.ginasio).toEqual({ kind: 'mes', offset: 0 });
  });

  it('a nota de hoje não manda tocar em Dia (o Ginásio não tem Dia)', () => {
    monta({ sessions: SETEMBRO, kind: 'mes', offset: 0 });
    const nota = screen.getByTestId('today-excluded-note');
    expect(nota).toHaveTextContent('Hoje ainda não acabou, por isso não entra nas contas.');
    expect(nota).not.toHaveTextContent(/toca em Dia/);
  });

  it('num período fechado não há nota de hoje', () => {
    monta({ sessions: SETEMBRO });
    expect(screen.queryByTestId('today-excluded-note')).not.toBeInTheDocument();
  });
});

describe('KPIs (G2): treinos de força com "/semana (semanas fechadas)"', () => {
  it('"N · X/semana" em semanas fechadas, com X de N semanas e sem bolinha decorativa', () => {
    monta({ sessions: [...SETEMBRO, aula('2026-09-22', { exertion: 7 })] });
    const l = linha('Treinos de força');
    // 6 sessões em setembro (7, 10, 21, 24, 28, 30); 4 nas 4 semanas fechadas que tocam o mês
    // (31 ago, 7, 14 e 21 set — a de 28 set só fecha a 4 out, 2026-10-05).
    expect(within(l).getByTestId('row-value')).toHaveTextContent('6 · 1/semana');
    expect(within(l).getByText('4 em 4 semanas fechadas')).toBeInTheDocument();
    expect(within(l).getByText('2 de 4')).toBeInTheDocument(); // semanas com 2+ treinos
    expect(screen.getByText(/As contas por semana usam as semanas seg–dom já fechadas que tocam o período \(31 ago – 27 set\)\./)).toBeInTheDocument();
    expect(screen.getByText('Semanas com 2+ treinos')).toBeInTheDocument();
    expect(screen.getByText('No período (30 dias fechados)')).toBeInTheDocument();
    expect(screen.queryByText('Vol. Carga')).not.toBeInTheDocument();
  });

  it('as aulas contam-se uma vez, no resumo, com /semana', () => {
    monta({ sessions: [...SETEMBRO, aula('2026-09-08'), aula('2026-09-15'), aula('2026-09-16'), aula('2026-09-22')] });
    const l = linha('Aulas');
    expect(within(l).getByTestId('row-value')).toHaveTextContent('4 · 1/semana');
    // O cartão de baixo já não repete a contagem.
    expect(screen.getByTestId('aulas')).not.toHaveTextContent(/^4 Aulas/);
  });

  it('G2: 3 sessões em 10 dias não dão "a menos": é cedo', () => {
    monta({ sessions: [forca('2026-09-24'), forca('2026-09-26'), forca('2026-09-30')], kind: 'mes', offset: -1 });
    expect(screen.queryByText(/a menos/)).not.toBeInTheDocument();
    expect(screen.getByText(/ainda é cedo para conclusões/)).toBeInTheDocument();
  });

  it('em Semana: as sessões da semana contra o alvo de 2', () => {
    monta({ sessions: SETEMBRO, kind: 'semana', offset: -1 });
    const l = linha('Treinos de força');
    expect(within(l).getByTestId('row-value')).toHaveTextContent('2');
    expect(within(l).getByText('No alvo (2)')).toBeInTheDocument();
    expect(screen.getByText('Dias com treino')).toBeInTheDocument();
    expect(screen.getByText(/Duas sessões de força na semana passada/)).toBeInTheDocument();
  });

  it('semana em curso com 1 sessão não leva estado vermelho', () => {
    monta({ sessions: [forca('2026-09-01'), forca('2026-09-29')], kind: 'semana', offset: 0 });
    const l = linha('Treinos de força');
    expect(within(l).getByTestId('row-status')).toHaveAttribute('data-status', 'none');
    expect(within(l).getByText('Alvo: 2 por semana')).toBeInTheDocument();
  });
});

describe('▲/▼ contra o período anterior (R5)', () => {
  const base = [forca('2026-09-01'), forca('2026-09-15'), forca('2026-09-21'), forca('2026-09-24')];

  it('semana fechada: 2 treinos contra 1 na anterior', () => {
    monta({ sessions: base, kind: 'semana', offset: -1 });
    const d = screen.getByTestId('gym-deltas');
    expect(within(d).getByTestId('delta-vs-previous')).toHaveAttribute('data-direction', 'up');
    expect(d).toHaveTextContent('semana de 14 set');
  });

  it('mês fechado de 31 dias contra um de 30: o treino de 31 out entra (▲ 3, não ▲ 2)', () => {
    h.today = '2026-11-10';
    vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0));
    const sessoes = ['2026-09-01', '2026-09-15', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-10-31'].map((d) => forca(d));
    monta({ sessions: sessoes, kind: 'mes', offset: -1 });
    const d = screen.getByTestId('gym-deltas');
    expect(d).toHaveTextContent('3 treinos face a setembro');
    expect(d).not.toHaveTextContent(/1 – 30 set/);
  });

  it('sem período anterior com registos, diz-o em vez de uma seta', () => {
    monta({ sessions: [forca('2026-09-21'), forca('2026-09-24')], kind: 'semana', offset: -1 });
    expect(screen.queryByTestId('gym-deltas')).not.toBeInTheDocument();
    expect(screen.getByText('Primeira semana com registos — ainda não há outra para comparar.')).toBeInTheDocument();
  });
});

describe('G3/G4: volume-carga semanal', () => {
  it('semanas de calendário com zeros e a em curso, número grande = última fechada', () => {
    monta({ sessions: SETEMBRO.map((s) => ({ ...s, workout_session_sets: sets(2, 100, 10) })) });
    const f = frame('Volume-carga semanal');
    expect(f).toBeTruthy();
    expect(within(f).getByText('kg · semana de 21 set')).toBeInTheDocument();
    const { data } = h.barProps.find((p) => p.data.datasets[0].label === 'Volume-carga');
    expect(data.labels).toEqual(['31 ago', '7 set', '14 set', '21 set', '28 set']);
    expect(data.datasets[0].data).toEqual([0, 4000, 0, 4000, 4000]);
    // Setembro é um período passado: sem semana em curso; a de 28 set (que
    // continua em outubro) só conta até 30 set e vem como "cortada".
    expect(within(f).queryByText(/Semana em curso/)).toBeNull();
    expect(within(f).getByText(/Semana cortada pelo fim do período/)).toBeInTheDocument();
  });

  it('D5: o KPI "Vol. Carga", o "Volume diário" e o ACWR do ginásio saíram', () => {
    const { container } = monta({ sessions: SETEMBRO });
    expect(container.textContent).not.toMatch(/Vol\. Carga|Volume diário|ACWR/);
  });
});

describe('G1: séries por músculo, em séries/semana', () => {
  const sess = [
    forca('2026-09-01'),
    forca('2026-09-21', { categories: ['Costas'], workout_session_sets: sets(6) }),
    forca('2026-09-22', { categories: ['Peito', 'Tríceps'], workout_session_sets: sets(20) }),
  ];

  it('não duplica as séries de uma sessão Peito+Tríceps: fica de fora e avisa', () => {
    monta({ sessions: sess, kind: 'semana', offset: -1 });
    const f = frame('Séries por músculo');
    expect(within(f).getByText('séries/semana em Costas')).toBeInTheDocument();
    expect(within(f).getByText('1 semana fechada')).toBeInTheDocument();
    expect(screen.queryByText(/séries.* em Peito/)).not.toBeInTheDocument();
    expect(within(f).getByText(/1 sessão com vários grupos não entra/)).toBeInTheDocument();
  });

  it('com várias sessões de vários grupos, o aviso vai no plural', () => {
    monta({
      sessions: [
        forca('2026-09-01'),
        forca('2026-09-21', { categories: ['Costas'], workout_session_sets: sets(6) }),
        forca('2026-09-22', { categories: ['Peito', 'Tríceps'], workout_session_sets: sets(5) }),
        forca('2026-09-23', { categories: ['Pernas Superiores', 'Glúteos'], workout_session_sets: sets(5) }),
      ],
      kind: 'semana', offset: -1,
    });
    expect(screen.getByText(/2 sessões com vários grupos não entram/)).toBeInTheDocument();
  });

  it('a semana em curso: "aparece quando a semana acabar", sem pedir semanas fechadas a quem vê uma semana', () => {
    monta({ sessions: SETEMBRO, kind: 'semana', offset: 0 });
    expect(screen.getByText(/Séries por músculo: aparece quando a semana acabar/)).toBeInTheDocument();
    expect(screen.queryByText(/preciso de pelo menos 1 semana fechada/)).not.toBeInTheDocument();
  });

  it('o valor grande não leva ",0" num número redondo', () => {
    monta({ sessions: SETEMBRO });
    expect(frame('Séries por músculo')).not.toHaveTextContent(/\d,0\b/);
  });
});

describe('D5: progressão por exercício', () => {
  const sess = [
    forca('2026-09-01'),
    forca('2026-09-15', { workout_session_sets: sets(3, 75, 8) }),
    forca('2026-09-21', { workout_session_sets: sets(3, 80, 8) }),
    forca('2026-09-24', { workout_session_sets: [...sets(3, 80, 8), ...sets(2, 60, 10, 'Remada')] }),
  ];

  it('lista os exercícios com 2+ sessões, com o 1RM estimado e ▲ face ao período anterior', () => {
    monta({ sessions: sess, kind: 'semana', offset: -1 });
    const card = screen.getByTestId('progressao');
    const linhas = within(card).getAllByTestId('progressao-linha');
    expect(linhas).toHaveLength(1); // a Remada só tem 1 sessão
    expect(linhas[0]).toHaveTextContent('Supino reto');
    expect(linhas[0]).toHaveTextContent('2 sessões · melhor série 80 kg × 8');
    expect(linhas[0]).toHaveTextContent(/101\s*kg 1RM/);
    expect(within(linhas[0]).getByTestId('delta-vs-previous')).toHaveAttribute('data-direction', 'up');
    expect(linhas[0]).toHaveTextContent('semana de 14 set');
  });

  it('um exercício sem registos no anterior não aparece e diz-se', () => {
    monta({ sessions: [...sess, forca('2026-09-22', { workout_session_sets: sets(2, 60, 10, 'Remada') })], kind: 'semana', offset: -1 });
    const card = screen.getByTestId('progressao');
    expect(within(card).getAllByTestId('progressao-linha')).toHaveLength(1);
    // Numa semana 1 sessão chega (G5): a Remada tem 2, mas nenhuma na semana anterior.
    expect(screen.getByTestId('progressao-notas')).toHaveTextContent('1 exercício desta semana não aparece');
  });

  it('sem nenhum comparável, o cartão dá lugar a uma nota', () => {
    monta({ sessions: [forca('2026-09-01'), forca('2026-09-21'), forca('2026-09-24')], kind: 'semana', offset: -1 });
    expect(screen.queryByTestId('progressao')).not.toBeInTheDocument();
    expect(screen.getByText(/Progressão por exercício: preciso de um exercício treinado na semana passada e no período anterior para comparar/)).toBeInTheDocument();
  });

  it('num mês continua a pedir 2 sessões do mesmo exercício', () => {
    monta({ sessions: [forca('2026-07-05'), forca('2026-08-05'), forca('2026-09-21')], kind: 'mes', offset: -1 });
    expect(screen.queryByTestId('progressao')).not.toBeInTheDocument();
    expect(screen.getByText(/Progressão por exercício: preciso de um exercício com pelo menos 2 sessões em setembro/)).toBeInTheDocument();
  });

  it('com o período "cedo" não há progressão', () => {
    monta({ sessions: [...sess, forca('2026-10-01', { workout_session_sets: sets(3, 80, 8) })], kind: 'mes', offset: 0 });
    expect(screen.queryByTestId('progressao')).not.toBeInTheDocument();
    // G4 (2026-10-05): já não promete "a partir de 4 dias" — diz o que a comparação pede.
    expect(screen.getByText(/Progressão por exercício: compara cada exercício com o período anterior — em outubro ainda só há 3 dias fechados\./)).toBeInTheDocument();
  });
});

describe('Aulas & Modalidades (G6, G7)', () => {
  const hiit = (d, exertion, extra = {}) => aula(d, { name: 'HIIT', class_types: ['HIIT'], exertion, ...extra });

  it('G6: mostra o RPE por modalidade e o geral, com vírgula decimal e denominadores', () => {
    monta({ sessions: [forca('2026-09-01'), hiit('2026-09-08', 8, { duration_seconds: 1800 }), hiit('2026-09-09', 7), hiit('2026-09-10', 7.5)] });
    const card = screen.getByTestId('aulas');
    expect(within(card).getByText('RPE 7,5')).toBeInTheDocument();
    expect(within(card).getByText('7,5 / 10')).toBeInTheDocument();
    expect(within(card).getByText('média de 3 de 3 aulas')).toBeInTheDocument();
  });

  it('R6: com menos de 3 aulas com RPE não há média, diz quantas há', () => {
    monta({ sessions: [forca('2026-09-01'), hiit('2026-09-08', 8), hiit('2026-09-09', 7)] });
    const card = screen.getByTestId('aulas');
    expect(within(card).queryByText(/^RPE 7,5$/)).not.toBeInTheDocument();
    expect(within(card).queryByText('7,5 / 10')).not.toBeInTheDocument();
    expect(within(card).getByText(/só 2 aulas com RPE, poucas para média/)).toBeInTheDocument();
  });

  it('sem RPE nenhum, diz que não há', () => {
    monta({ sessions: [forca('2026-09-01'), aula('2026-09-08'), aula('2026-09-09'), aula('2026-09-10')] });
    expect(within(screen.getByTestId('aulas')).getByText('sem RPE registado')).toBeInTheDocument();
  });

  it('G7: sem nenhuma duração registada, o Tempo Total é "—" e não "0 min"', () => {
    monta({ sessions: [forca('2026-09-01'), aula('2026-09-08'), aula('2026-09-09')] });
    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
    expect(screen.getByText('Tempo Total').previousSibling).toHaveTextContent('—');
  });

  it('G7: com duração só em parte das aulas, avisa "em N de M aulas"', () => {
    monta({ sessions: [forca('2026-09-01'), aula('2026-09-08', { duration_seconds: 3600 }), aula('2026-09-09')] });
    expect(screen.getByText('Tempo Total').previousSibling).toHaveTextContent('1h');
    expect(screen.getByText('em 1 de 2 aulas')).toBeInTheDocument();
  });

  it('G7: com duração em todas as aulas, não há aviso', () => {
    monta({ sessions: [forca('2026-09-01'), aula('2026-09-08', { duration_seconds: 1800 }), aula('2026-09-09', { duration_seconds: 1800 })] });
    expect(screen.getByText('Tempo Total').previousSibling).toHaveTextContent('1h');
    expect(screen.queryByText(/em \d+ de \d+ aulas/)).not.toBeInTheDocument();
  });

  it('as aulas não se repetem no cartão: a contagem "/semana" vive só no resumo', () => {
    monta({ sessions: [forca('2026-09-01'), aula('2026-09-08'), aula('2026-09-15'), aula('2026-09-16'), aula('2026-09-22')] });
    expect(screen.queryByTestId('aulas-por-semana')).not.toBeInTheDocument();
    expect(screen.queryByText(/aulas por semana, em/)).not.toBeInTheDocument();
    expect(linha('Aulas')).toHaveTextContent('4 · 1,3/semana');
  });

  it('G7 por modalidade: o tempo de uma modalidade com duração só em parte diz "em 1 de 3"', () => {
    monta({ sessions: [forca('2026-09-01'), aula('2026-09-08', { duration_seconds: 3000 }), aula('2026-09-09'), aula('2026-09-10')] });
    expect(screen.getByTestId('aulas')).toHaveTextContent('3 aulas · 50 min (em 1 de 3)');
  });
});

describe('estados: a começar, cedo, vazio (R6, R7, R8)', () => {
  it('segunda-feira sem dias fechados: "A semana começou hoje" com o resumo da anterior', () => {
    h.today = '2026-10-05';
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    monta({ sessions: [forca('2026-09-01'), forca('2026-09-29'), forca('2026-10-01'), forca('2026-10-05')], kind: 'semana', offset: 0 });
    expect(screen.getByRole('heading', { name: 'A semana começou hoje' })).toBeInTheDocument();
    expect(screen.getByText('Os dias contam quando acabarem — hoje já registaste 1 treino de força.')).toBeInTheDocument();
    expect(screen.getByText('Ver semana passada')).toBeInTheDocument();
    expect(screen.getByTestId('early-previous-summary')).toHaveTextContent('2 treinos de força');
    // Sem gráficos nem médias de 0 dias.
    expect(screen.queryByTestId('chart-frame')).not.toBeInTheDocument();
  });

  it('o mês em curso com 3 dias fechados: "Só 3 dias fechados em outubro"', () => {
    monta({ sessions: SETEMBRO, kind: 'mes', offset: 0 });
    expect(screen.getByText('Só 3 dias fechados em outubro — ainda é cedo para conclusões.')).toBeInTheDocument();
    expect(screen.getByText(/setembro: 6 treinos de força/)).toBeInTheDocument();
  });

  it('agosto fechado sem treinos, com histórico: o veredicto diz o facto, não "sem dados"', () => {
    monta({ sessions: [forca('2026-07-10'), forca('2026-07-20'), forca('2026-09-10')], kind: 'mes', offset: -2 });
    expect(screen.getByText('Nenhuma sessão de força em agosto — o alvo são duas por semana.')).toBeInTheDocument();
    expect(screen.queryByText(/Ainda não tenho dados suficientes/)).not.toBeInTheDocument();
    expect(linha('Treinos de força')).toHaveTextContent('0');
  });

  it('semana em curso com o alvo cumprido e poucos dias fechados: sem "ainda é cedo" a contradizer', () => {
    h.today = '2026-10-01'; // quinta: 3 dias fechados
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    monta({ sessions: [forca('2026-09-01'), forca('2026-09-28'), forca('2026-09-29')], kind: 'semana', offset: 0 });
    expect(screen.getByText(/o alvo de duas está cumprido/)).toBeInTheDocument();
    expect(screen.queryByText(/ainda é cedo para conclusões/)).not.toBeInTheDocument();
  });

  it('trimestre a começar com dados desde 25 ago: o anterior diz "desde 25 ago"', () => {
    h.today = '2026-10-01';
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    monta({ sessions: [forca('2026-08-25'), forca('2026-09-10'), forca('2026-09-20')], kind: 'trimestre', offset: 0 });
    expect(screen.getByTestId('early-previous-summary')).toHaveTextContent('desde 25 ago');
  });

  it('período sem treinos (mas com histórico): o estado vazio diz o último', () => {
    monta({ sessions: [forca('2026-06-10')], kind: 'mes', offset: -1 });
    expect(screen.getByText('Sem treinos em setembro')).toBeInTheDocument();
    expect(screen.getByText(/O último foi a 10 de junho/)).toBeInTheDocument();
  });

  it('período antes do 1.º registo', () => {
    monta({ sessions: [forca('2026-09-24')], kind: 'mes', offset: -2 });
    expect(screen.getByText('Antes do teu primeiro registo')).toBeInTheDocument();
    // Sem contas, sem a nota das contas por semana.
    expect(screen.queryByText(/As contas por semana usam/)).not.toBeInTheDocument();
  });

  it('sem nenhuma sessão: convite a registar, com o seletor à vista', () => {
    monta({ sessions: [], kind: 'mes', offset: 0 });
    expect(screen.getByTestId('empty-module-state')).toHaveTextContent('Ainda não há treinos');
    expect(screen.getByRole('group', { name: 'Período' })).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByText('Registar treino')); });
    expect(h.state.setOpenCreationMode).toHaveBeenCalledWith('workout');
  });
});

describe('limiares (2026-10-05) — onde estão os dados', () => {
  // Treina duas vezes por semana desde agosto: setembro tem semanas de sobra.
  const REGULAR = ['2026-08-10', '2026-08-12', '2026-08-17', '2026-08-19', '2026-08-24', '2026-08-26', '2026-08-31', '2026-09-02', '2026-09-07', '2026-09-09',
    '2026-09-14', '2026-09-16', '2026-09-21', '2026-09-23', '2026-10-01'].map((d) => forca(d));

  it('G2: 5 out, a semana 28 set – 4 out já fechou; o mês ainda diz "cedo" mas aponta setembro, com botão', () => {
    h.today = '2026-10-05';
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    monta({ sessions: REGULAR, kind: 'mes', offset: 0 });
    const resumo = screen.getByTestId('period-summary');
    expect(resumo).toHaveTextContent('Só 1 semana fechada em outubro — ainda é cedo para conclusões.');
    expect(resumo).toHaveTextContent(/Em setembro: \d+ de \d+ semanas com 2\+ treinos de força\./);
    expect(resumo).toHaveTextContent('As contas por semana usam as semanas seg–dom já fechadas que tocam o período (28 set – 4 out).');
  });

  it('G2: a 12 out o mês já tem 2 semanas fechadas e avalia a frequência (mínimo do mês: 2)', () => {
    h.today = '2026-10-12';
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
    monta({ sessions: [...REGULAR, forca('2026-10-06'), forca('2026-10-08')], kind: 'mes', offset: 0 });
    expect(screen.getByTestId('period-summary')).not.toHaveTextContent(/ainda é cedo/);
    expect(within(linha('Treinos de força')).getByText(/em 2 semanas fechadas/)).toBeInTheDocument();
  });

  it('G7: séries por músculo sem semana fechada: diz quando fecha a 1.ª e leva a setembro', () => {
    monta({ sessions: REGULAR, kind: 'mes', offset: 0 }); // hoje 4 out: a semana de 28 set fecha a 4 out
    const nota = screen.getAllByTestId('min-data-note').find((n) => n.textContent.includes('Séries por músculo'));
    expect(nota).toHaveTextContent('Séries por músculo: a 1.ª semana fechada em outubro acaba a 4 out. Em setembro já tem.');
    const botao = within(nota).getByRole('button', { name: 'Ver setembro' });
    expect(botao.style.minHeight).toBe('var(--tap)');
    expect(botao.style.color).toBe('var(--gym)');
    act(() => { fireEvent.click(botao); });
    expect(usePeriodStore.getState().tabs.ginasio).toEqual({ kind: 'mes', offset: -1 });
  });

  it('G7: na semana em curso aponta a semana passada', () => {
    monta({ sessions: REGULAR, kind: 'semana', offset: 0 });
    const nota = screen.getAllByTestId('min-data-note').find((n) => n.textContent.includes('Séries por músculo'));
    expect(nota).toHaveTextContent('aparece quando a semana acabar');
    expect(within(nota).getByRole('button', { name: 'Ver semana passada' })).toBeInTheDocument();
  });

  it('G4: a progressão em "cedo" diz o que a comparação pede e onde já há', () => {
    const ex = (date, w) => forca(date, { workout_session_sets: sets(2, w, 10, 'Agachamento') });
    monta({ sessions: [ex('2026-07-06', 60), ex('2026-07-20', 60), ex('2026-08-05', 70), ex('2026-08-20', 70), ex('2026-09-02', 80), ex('2026-09-20', 80), ex('2026-10-01', 90)], kind: 'mes', offset: 0 });
    const nota = screen.getAllByTestId('min-data-note').find((n) => n.textContent.includes('Progressão por exercício'));
    expect(nota).toHaveTextContent('Progressão por exercício: compara cada exercício com o período anterior — em outubro ainda só há 3 dias fechados. Em setembro já tem a sua.');
    act(() => { fireEvent.click(within(nota).getByRole('button', { name: 'Ver setembro' })); });
    expect(usePeriodStore.getState().tabs.ginasio).toEqual({ kind: 'mes', offset: -1 });
  });

  it('G4: progressão com o mês "ok" mas sem exercício comparável — diz que setembro já tem e leva lá (2026-10-05)', () => {
    h.today = '2026-10-12';
    vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
    const ex = (date, w, name = 'Agachamento') => forca(date, { workout_session_sets: sets(2, w, 10, name) });
    monta({ sessions: [ex('2026-08-05', 70), ex('2026-08-20', 70), ex('2026-09-02', 80), ex('2026-09-20', 80),
      ex('2026-10-01', 90), ex('2026-10-06', 60, 'Remada'), ex('2026-10-08', 60, 'Remada')], kind: 'mes', offset: 0 });
    const nota = screen.getAllByTestId('min-data-note').find((n) => n.textContent.includes('Progressão por exercício'));
    expect(nota).toHaveTextContent(/^Progressão por exercício: preciso de um exercício com pelo menos 2 sessões em outubro e registos no período anterior para comparar\..* Em setembro já tem a sua\./);
    const botao = within(nota).getByRole('button', { name: 'Ver setembro' });
    expect(botao.style.minHeight).toBe('var(--tap)');
    act(() => { fireEvent.click(botao); });
    expect(usePeriodStore.getState().tabs.ginasio).toEqual({ kind: 'mes', offset: -1 });
  });

  it('G5: numa semana um exercício com 1 sessão compara-se (singular "1 sessão")', () => {
    monta({
      sessions: [forca('2026-09-01'), forca('2026-09-16', { workout_session_sets: sets(3, 100, 5, 'Agachamento') }), forca('2026-09-23', { workout_session_sets: sets(3, 110, 5, 'Agachamento') })],
      kind: 'semana', offset: -1,
    });
    const linhas = within(screen.getByTestId('progressao')).getAllByTestId('progressao-linha');
    expect(linhas[0]).toHaveTextContent('Agachamento');
    expect(linhas[0]).toHaveTextContent('1 sessão · melhor série 110 kg × 5');
  });

  it('G1: um mês fechado com o 1.º registo nos últimos dias não está "cedo"', () => {
    monta({ sessions: [forca('2026-09-29'), forca('2026-09-30')], kind: 'mes', offset: -1 });
    expect(screen.queryByText(/Só 2 dias fechados em setembro/)).toBeNull();
    expect(screen.queryByText(/Progressão por exercício: compara cada exercício/)).toBeNull();
  });
});

describe('o período por omissão abre no anterior quando está a começar (2026-10-05)', () => {
  it('dia 1 do mês com registos antes: abre em outubro; quem já escolheu não é mexido', () => {
    h.today = '2026-11-01';
    vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
    h.state = { gymSessions: [forca('2026-10-06'), forca('2026-10-20')], runs: [], setOpenCreationMode: vi.fn() };
    const { unmount } = render(<GymDashboard />);
    expect(usePeriodStore.getState().tabs.ginasio).toEqual({ kind: 'mes', offset: -1 });
    unmount();
    act(() => usePeriodStore.getState().reset());
    act(() => usePeriodStore.getState().setPeriod('ginasio', 'mes', 0));
    render(<GymDashboard />);
    expect(usePeriodStore.getState().tabs.ginasio).toEqual({ kind: 'mes', offset: 0 });
  });
});

describe('abrir no mês anterior só depois de os treinos chegarem (revisão 2026-10-05)', () => {
  it('1.º render com a fatia por carregar não grava "nunca registou": quando chegam, abre no mês anterior', () => {
    h.today = '2026-11-01';
    vi.setSystemTime(new Date(2026, 10, 1, 12, 0, 0));
    h.ready = false;
    h.state = { gymSessions: [], runs: [], setOpenCreationMode: vi.fn() };
    const { rerender } = render(<GymDashboard />);
    expect(usePeriodStore.getState().tabs.ginasio.offset).toBe(0);
    expect(usePeriodStore.getState().opened.ginasio).toBeUndefined();
    h.ready = true;
    h.state = { ...h.state, gymSessions: [forca('2026-10-06'), forca('2026-10-20')] };
    act(() => { rerender(<GymDashboard />); });
    expect(usePeriodStore.getState().tabs.ginasio.offset).toBe(-1);
  });
});
