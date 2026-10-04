import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CrossAnalysisSection, { closestWeighing } from './CrossAnalysisSection';
import { todayISO, addDaysISO } from '../../lib/utils';

/* Análise Cruzada — factos reais (2026-10-04).
   O5: o "peso mais próximo" é a distância real em dias, máx. ±7;
   O6: sem RPE real não há gráfico nem "Boa Gestão… Continua assim!". */

// O gráfico em si tem testes próprios — aqui interessa o que lhe é entregue.
const charts = [];
vi.mock('./CrossMetricsChart', () => ({
  default: (props) => { charts.push(props); return <div data-testid={`chart-${props.title}`} />; },
}));

const ago = (n) => addDaysISO(todayISO(), -n);
// Corrida que qualifica para VDOT (competição, ≥3 km, com tempo).
const trial = (daysAgo, extra = {}) => ({
  id: `t${daysAgo}`, date: ago(daysAgo), kind: 'competicao', distance_km: 10, duration_seconds: 3000, ...extra,
});
const pesagem = (daysAgo, kg) => ({ id: `p${daysAgo}`, date: ago(daysAgo), weight_kg: kg });
const forca = (daysAgo, kg = 1000) => ({
  id: `f${daysAgo}`, date: ago(daysAgo), kind: 'forca', workout_session_sets: [{ reps: 10, weight: kg / 10 }],
});
// Corrida normal (não qualifica para VDOT) com ou sem RPE.
const rodagem = (daysAgo, rpe) => ({ id: `r${daysAgo}`, date: ago(daysAgo), distance_km: 8, duration_seconds: 2700, effort_rpe: rpe });

const chart = (title) => charts.find((c) => c.title === title);

beforeEach(() => { charts.length = 0; });

describe('closestWeighing (O5)', () => {
  const pts = [
    { date: '2026-06-01', weight: 85 },
    { date: '2026-08-01', weight: 80 },
    { date: '2026-09-30', weight: 75 },
  ];
  it('escolhe pela distância real em dias, não pelo primeiro ponto', () => {
    expect(closestWeighing(pts, '2026-10-01').weight).toBe(75);
    expect(closestWeighing(pts, '2026-08-03').weight).toBe(80);
  });
  it('ao fim de mais de 7 dias não há pesagem: null', () => {
    expect(closestWeighing(pts, '2026-09-15')).toBeNull();
    expect(closestWeighing(pts, '2026-08-08').weight).toBe(80); // exatamente 7 dias ainda conta
    expect(closestWeighing(pts, '2026-08-09')).toBeNull();
  });
  it('funciona para pesagens antes e depois da corrida (±7)', () => {
    expect(closestWeighing(pts, '2026-07-26').weight).toBe(80);
  });
  it('sem pesagens: null', () => {
    expect(closestWeighing([], '2026-10-01')).toBeNull();
    expect(closestWeighing(undefined, '2026-10-01')).toBeNull();
  });
});

describe('CrossAnalysisSection — Eficiência Aeróbica vs. Peso (O5)', () => {
  it('cada ponto de VDOT leva a pesagem mais próxima, não a 1.ª de sempre', () => {
    render(
      <CrossAnalysisSection
        runs={[trial(100), trial(29), trial(9)]}
        gymSessions={[]}
        meals={[]}
        bodyAssessments={[pesagem(200, 90), pesagem(100, 85), pesagem(30, 80), pesagem(10, 78)]}
      />,
    );
    const c = chart('Eficiência Aeróbica vs. Peso');
    // antes: 85, 90, 90 (a 1.ª pesagem de sempre para as duas últimas)
    expect(c.leftData.data.map((d) => d.y)).toEqual([85, 80, 78]);
  });

  it('a corrida sem pesagem a ≤7 dias fica de fora', () => {
    render(
      <CrossAnalysisSection
        runs={[trial(60), trial(9)]}
        gymSessions={[]}
        meals={[]}
        bodyAssessments={[pesagem(200, 90), pesagem(10, 78)]}
      />,
    );
    const c = chart('Eficiência Aeróbica vs. Peso');
    expect(c.leftData.data).toHaveLength(1);
    expect(c.leftData.data[0].y).toBe(78);
  });

  it('sem nenhuma pesagem a ≤7 dias de uma corrida, o gráfico não aparece e diz o que falta', () => {
    render(<CrossAnalysisSection runs={[trial(60)]} gymSessions={[]} meals={[]} bodyAssessments={[pesagem(200, 90)]} />);
    expect(chart('Eficiência Aeróbica vs. Peso')).toBeUndefined();
    expect(screen.getByText(/pesagem a, no máximo, 7 dias de cada uma/)).toBeInTheDocument();
  });
});

describe('CrossAnalysisSection — Impacto do Ginásio na Corrida (O6)', () => {
  it('sem nenhum RPE registado: sem gráfico, sem "Boa Gestão", e diz o que registar', () => {
    render(
      <CrossAnalysisSection
        runs={[rodagem(3), rodagem(10), rodagem(17)]}
        gymSessions={[forca(2), forca(9), forca(16)]}
        meals={[]}
        bodyAssessments={[]}
      />,
    );
    expect(chart('Impacto do Ginásio na Corrida')).toBeUndefined();
    expect(document.body.textContent).not.toMatch(/Boa Gestão|Continua assim|Interferência/);
    expect(screen.getByTestId('cross-rpe-empty').textContent).toMatch(/nenhuma corrida nos últimos 30 dias com RPE registado/);
  });

  it('só ginásio e nenhuma corrida: também sem "Boa Gestão"', () => {
    render(<CrossAnalysisSection runs={[]} gymSessions={[forca(2), forca(9)]} meals={[]} bodyAssessments={[]} />);
    expect(chart('Impacto do Ginásio na Corrida')).toBeUndefined();
    expect(document.body.textContent).not.toMatch(/Boa Gestão|Continua assim/);
  });

  it('RPE sem ginásio com carga: sem gráfico, diz para registar a carga', () => {
    render(<CrossAnalysisSection runs={[rodagem(3, 5), rodagem(10, 5)]} gymSessions={[]} meals={[]} bodyAssessments={[]} />);
    expect(chart('Impacto do Ginásio na Corrida')).toBeUndefined();
    expect(screen.getByTestId('cross-rpe-empty').textContent).toMatch(/nenhum treino de ginásio com carga/);
  });

  it('com RPE e ginásio mas menos de 3 semanas fechadas: gráfico sem veredicto, a dizer quantas há', () => {
    render(
      <CrossAnalysisSection
        runs={[rodagem(10, 5), rodagem(17, 4)]}
        gymSessions={[forca(9), forca(16)]}
        meals={[]}
        bodyAssessments={[]}
      />,
    );
    const c = chart('Impacto do Ginásio na Corrida');
    expect(c).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Boa Gestão|Continua assim|Interferência/);
    expect(screen.getByTestId('cross-rpe-calibrating').textContent).toMatch(/Só tenho 2 semanas fechadas com RPE registado/);
  });

  it('semanas sem RPE são buracos (null) no gráfico, nunca 0 nem 5', () => {
    render(
      <CrossAnalysisSection
        runs={[rodagem(10, 6), rodagem(17)]}
        gymSessions={[forca(9), forca(16), forca(23)]}
        meals={[]}
        bodyAssessments={[]}
      />,
    );
    const c = chart('Impacto do Ginásio na Corrida');
    const rpes = c.rightData.data.map((d) => d.y);
    expect(rpes.some((y) => y === 0 || y === 5)).toBe(false);
    expect(rpes.filter((y) => y == null).length).toBeGreaterThan(0);
    expect(rpes.filter((y) => y === 6)).toHaveLength(1);
  });

  it('com ≥3 semanas fechadas com RPE real e esforço baixo, "Boa Gestão" aparece', () => {
    // O alerta olha para as semanas FECHADAS (a atual fica de fora); 3 semanas
    // antes da atual cabem sempre nos últimos 30 dias do filtro 'mes'.
    const segundaAtual = (() => {
      const d = new Date(`${todayISO()}T00:00:00Z`);
      const dow = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
      return d.toISOString().slice(0, 10);
    })();
    const diasAteSegundaAtual = Math.round((Date.parse(`${todayISO()}T00:00:00Z`) - Date.parse(`${segundaAtual}T00:00:00Z`)) / 86400000);
    // quarta-feira de cada uma das 3 semanas anteriores
    const quarta = (semanasAtras) => diasAteSegundaAtual + 7 * semanasAtras - 2;
    render(
      <CrossAnalysisSection
        runs={[rodagem(quarta(1), 4), rodagem(quarta(2), 5), rodagem(quarta(3), 4)]}
        gymSessions={[forca(quarta(1)), forca(quarta(2)), forca(quarta(3))]}
        meals={[]}
        bodyAssessments={[]}
      />,
    );
    expect(screen.getByText('Boa Gestão da Carga Cruzada')).toBeInTheDocument();
  });
});

describe('CrossAnalysisSection — ≥3 semanas fechadas mas sem veredicto (revisão 2026-10-04)', () => {
  // quarta-feira de cada uma das semanas anteriores à atual (sempre nos últimos 30 dias)
  const diasAteSegundaAtual = (() => {
    const d = new Date(`${todayISO()}T00:00:00Z`);
    const dow = d.getUTCDay();
    return dow === 0 ? 6 : dow - 1;
  })();
  const quarta = (semanasAtras) => diasAteSegundaAtual + 7 * semanasAtras - 2;

  it('RPE moderado (zona neutra) com ginásio todas as semanas: nota factual, nunca "Só tenho 3…"', () => {
    render(
      <CrossAnalysisSection
        runs={[rodagem(quarta(1), 6.5), rodagem(quarta(2), 6.5), rodagem(quarta(3), 6.5)]}
        gymSessions={[forca(quarta(1)), forca(quarta(2)), forca(quarta(3))]}
        meals={[]}
        bodyAssessments={[]}
      />,
    );
    expect(chart('Impacto do Ginásio na Corrida')).toBeTruthy();
    expect(screen.queryByTestId('cross-rpe-calibrating')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Só tenho|Boa Gestão|Interferência/);
    const nota = screen.getByTestId('cross-rpe-neutral').textContent;
    expect(nota).toMatch(/Nas últimas 3 semanas fechadas com RPE registado/);
    expect(nota).toMatch(/esforço médio das corridas foi 6,5/);
    expect(nota).toMatch(/ginásio 1\u00a0000 kg por semana/);
    expect(nota).toMatch(/sem sinal claro de interferência/);
  });

  it('ginásio só na semana em curso: diz que nas semanas fechadas não houve treino com carga', () => {
    render(
      <CrossAnalysisSection
        runs={[rodagem(quarta(1), 4), rodagem(quarta(2), 4), rodagem(quarta(3), 4)]}
        gymSessions={[forca(0)]}
        meals={[]}
        bodyAssessments={[]}
      />,
    );
    expect(screen.queryByTestId('cross-rpe-calibrating')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Só tenho|Boa Gestão/);
    expect(screen.getByTestId('cross-rpe-neutral').textContent).toMatch(/não houve treino de ginásio com carga/);
  });

  it('RPE alto com ginásio leve (<=5000 kg) também não é "interferência": nota neutra', () => {
    render(
      <CrossAnalysisSection
        runs={[rodagem(quarta(1), 8), rodagem(quarta(2), 8), rodagem(quarta(3), 8)]}
        gymSessions={[forca(quarta(1)), forca(quarta(2)), forca(quarta(3))]}
        meals={[]}
        bodyAssessments={[]}
      />,
    );
    expect(screen.getByTestId('cross-rpe-neutral').textContent).toMatch(/esforço médio das corridas foi 8,0/);
    expect(document.body.textContent).not.toMatch(/Interferência/);
  });
});

describe('CrossAnalysisSection — revelação dos gráficos (F5, 2026-10-04)', () => {
  const props = () => ({
    runs: [trial(100), trial(29), trial(9)],
    gymSessions: [],
    meals: [],
    bodyAssessments: [pesagem(100, 85), pesagem(30, 80), pesagem(10, 78)],
  });
  const lastVdot = () => charts.filter((c) => c.title === 'Eficiência Aeróbica vs. Peso').at(-1);
  const grid = () => document.querySelector('.grid.transition-all');

  it('fechada, os gráficos não estão prontos; abrir só os liberta no fim da transição', () => {
    render(<CrossAnalysisSection {...props()} />);
    expect(lastVdot().ready).toBe(false);
    fireEvent.click(screen.getByText('Análise Cruzada'));
    // a meio da abertura ainda não: a área mede metade e animava-se a esconder-se
    expect(lastVdot().ready).toBe(false);
    // o transitionend de um filho que borbulha não conta
    fireEvent.transitionEnd(grid().firstChild);
    expect(lastVdot().ready).toBe(false);
    fireEvent.transitionEnd(grid());
    expect(lastVdot().ready).toBe(true);
  });

  it('sem transitionend (movimento reduzido no CSS) o prazo liberta na mesma; fechar volta a segurar', () => {
    vi.useFakeTimers();
    try {
      render(<CrossAnalysisSection {...props()} />);
      fireEvent.click(screen.getByText('Análise Cruzada'));
      expect(lastVdot().ready).toBe(false);
      act(() => { vi.advanceTimersByTime(500); });
      expect(lastVdot().ready).toBe(true);
      fireEvent.click(screen.getByText('Análise Cruzada'));
      expect(lastVdot().ready).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('as séries entregues ao gráfico mantêm a referência entre renders (senão: chart.update())', () => {
    render(<CrossAnalysisSection {...props()} />);
    const a = lastVdot();
    // mesmas listas, outro render (abrir a secção é um)
    fireEvent.click(screen.getByText('Análise Cruzada'));
    const b = lastVdot();
    expect(b.leftData).toBe(a.leftData);
    expect(b.rightData).toBe(a.rightData);
  });
});
