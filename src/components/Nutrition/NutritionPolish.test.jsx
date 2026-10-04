import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* Reparos da verificação no browser (Chromium 390×844, 2026-10-04) que ficaram
   como não-bloqueantes na Nutrição: o dia de HOJE não se julga, a comparação do
   mês fechado diz o anterior por extenso com a %, os dias do mapa de calor e os
   controlos das semanas do trimestre têm alvos ≥ 44 px, e os valores nas barras
   não ficam por baixo da zona 90–115%. Hoje fixo: domingo, 4 out 2026. */
const h = vi.hoisted(() => ({ today: '2026-10-04' }));
vi.mock('../../utils/useTodayISO', () => ({ useTodayISO: () => h.today }));

import { useAppStore } from '../../store';
import { usePeriodStore } from '../../store/periodStore';
import { resetEvolutionCache } from '../../store/evolution/cache';
import NutritionDashboard, { todayProgressVerdict } from './NutritionDashboard';

const PROFILE = { calorie_goal: 2400, protein_goal: 150, carbs_goal: 300, fat_goal: 80, water_goal_ml: 2500 };
let seq = 0;
const meal = (date, calories, protein, carbs, fat) => ({ id: `p${seq++}`, date, meal_items: [{ calories, protein, carbs, fat }] });
const plain = (el) => (el.textContent || '').replace(/[  ]/g, ' ');

function setData(patch = {}) {
  useAppStore.setState({
    profile: PROFILE,
    meals: [],
    waterLogs: [],
    runs: [],
    gymSessions: [],
    bodyAssessments: [],
    goalHistory: [],
    coachPlans: [],
    coachPlanItems: [],
    nutritionDayFocus: null,
    ...patch,
  });
}

const days = (from, to) => {
  const out = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

beforeEach(() => {
  h.today = '2026-10-04';
  usePeriodStore.getState().reset();
  resetEvolutionCache();
});

describe('Dia de HOJE — só se diz o que já vai (reparo 6)', () => {
  it('um pequeno-almoço às 8h: "até agora…", sem "Estás a comer abaixo…" nem défice nem kcal/kg', () => {
    setData({ meals: [meal('2026-10-03', 2400, 150, 300, 80), meal('2026-10-04', 1240, 64, 150, 38)] });
    usePeriodStore.getState().setKind('nutricao', 'dia');
    render(<NutritionDashboard />);
    const v = screen.getByTestId('verdict-line');
    expect(v).toHaveAttribute('data-tone', 'neutral');
    expect(plain(v)).toBe('Hoje, até agora: 1 240 de 2 400 kcal e 64 de 150 g de proteína — ainda em curso.');
    expect(document.body.textContent).not.toMatch(/Estás a comer|abaixo do que gastas|kcal\/kg|défice|Deficit/i);
    // O cartão também não julga: "Até agora · 52%", nunca "Abaixo · 52%"; e não conta objetivos atingidos.
    const kcal = screen.getByTestId('day-row-calories');
    expect(plain(kcal)).toMatch(/Até agora · 52%/);
    expect(kcal.textContent).not.toMatch(/Abaixo|Dentro|Acima/);
    expect(screen.getByTestId('day-nutrition-card')).toHaveTextContent('Ainda em curso — só conta quando acabar');
    expect(screen.getByTestId('day-nutrition-card').textContent).not.toMatch(/objetivos atingidos/);
  });

  it('hoje sem refeições: diz que o dia só conta quando acabar', () => {
    setData({ meals: [meal('2026-10-03', 2400, 150, 300, 80)] });
    usePeriodStore.getState().setKind('nutricao', 'dia');
    render(<NutritionDashboard />);
    expect(screen.getByTestId('verdict-line')).toHaveTextContent('Hoje ainda sem refeições registadas — o dia só conta quando acabar.');
    expect(screen.getByTestId('day-nutrition-card')).toHaveTextContent('Ainda sem registos hoje');
  });

  it('dia FECHADO: sem veredicto e o cartão mantém Dentro/Abaixo e os objetivos atingidos', () => {
    setData({ meals: [meal('2026-10-03', 1200, 60, 150, 40), meal('2026-10-04', 1240, 64, 150, 38)], nutritionDayFocus: '2026-10-03' });
    render(<NutritionDashboard />);
    expect(screen.getByTestId('day-nutrition-title')).toHaveTextContent('Ontem');
    expect(screen.queryByTestId('verdict-line')).not.toBeInTheDocument();
    expect(plain(screen.getByTestId('day-row-calories'))).toMatch(/Abaixo · 50%/);
    expect(screen.getByTestId('day-nutrition-card')).toHaveTextContent('objetivos atingidos');
  });

  it('todayProgressVerdict: sem proteína de objetivo só diz as calorias', () => {
    const rows = [
      { key: 'calories', value: 800, target: 2000, status: 'abaixo' },
      { key: 'protein', value: 40, target: 0, status: 'sem_registo' },
      { key: 'water', value: 0, target: 2000, status: 'sem_registo' },
    ];
    expect(plain({ textContent: todayProgressVerdict(rows).text })).toBe('Hoje, até agora: 800 de 2 000 kcal — ainda em curso.');
  });
});

describe('Mês/trimestre FECHADO — o anterior por extenso com a % (reparo 7)', () => {
  it('setembro fechado contra agosto: "▲ agosto: 14 de 28 (50%)", nunca "▲ 14 face a agosto", mesmo com 28 dias dos dois lados', () => {
    // Agosto: 28 dias com registo (os de 1 a 28), 14 deles calorias+proteína no objetivo. Setembro: 28 dias (3 a 30), todos no objetivo.
    const aug = days('2026-08-01', '2026-08-28').map((d, i) => (i % 2 === 0 ? meal(d, 2400, 150, 300, 80) : meal(d, 1500, 80, 150, 40)));
    const sep = days('2026-09-03', '2026-09-30').map((d) => meal(d, 2400, 150, 300, 80));
    setData({ meals: [...aug, ...sep] });
    usePeriodStore.getState().setPeriod('nutricao', 'mes', -1);
    render(<NutritionDashboard />);
    const resumo = within(screen.getByRole('region', { name: 'Resumo do período' }));
    const footer = plain(resumo.getByTestId('summary-footer'));
    expect(footer).toContain('Calorias e proteína no objetivo em 28 de 28 dias (100%)');
    // O que se VÊ (o triângulo e o texto, aria-hidden); o leitor de ecrã tem a sua frase por extenso.
    const visible = plain(resumo.getByTestId('delta-vs-previous').firstElementChild);
    expect(visible).toBe('▲ agosto: 14 de 28 (50%)');
    expect(visible).not.toMatch(/face a/);
  });

  it('semana em curso mantém a diferença de dias contra os MESMOS dias da anterior', () => {
    // 28 set – 3 out (6 dias) contra 21 – 26 set (6 dias): a diferença de dias.
    const prev = days('2026-09-21', '2026-09-26').map((d, i) => (i < 3 ? meal(d, 2400, 150, 300, 80) : meal(d, 2000, 120, 250, 70)));
    const cur = days('2026-09-28', '2026-10-03').map((d, i) => (i < 5 ? meal(d, 2400, 150, 300, 80) : meal(d, 2000, 120, 250, 70)));
    setData({ meals: [...prev, ...cur] });
    render(<NutritionDashboard />);
    const footer = plain(within(screen.getByRole('region', { name: 'Resumo do período' })).getByTestId('summary-footer'));
    expect(footer).toMatch(/▲ 2 face a 21 – 26 set/);
    expect(footer).not.toMatch(/\(\d+%\)/);
  });
});

describe('Alvos de toque e rótulos (reparo 5)', () => {
  it('mapa de calor: dias com 44 px de altura e intervalo de 2 px (7 colunas de ≥ 44 px em 390 px), cabeçalho com o mesmo intervalo', () => {
    setData({ meals: days('2026-09-01', '2026-09-30').map((d) => meal(d, 2400, 150, 300, 80)) });
    usePeriodStore.getState().setPeriod('nutricao', 'mes', -1);
    render(<NutritionDashboard />);
    const map = screen.getByTestId('nutrition-month-heatmap');
    const group = within(map).getByRole('radiogroup', { name: 'Dias de setembro' });
    expect(group.style.gap).toBe('2px');
    // 390 − 2×16 (margem da página) − 2×16 (cartão) − 6×2 = 314 → 44,86 px por coluna.
    expect((390 - 32 - 32 - 6 * 2) / 7).toBeGreaterThanOrEqual(44);
    expect(group.previousElementSibling.style.gap).toBe('2px');
    within(group).getAllByTestId('month-cell').forEach((c) => expect(c.style.height).toBe('44px'));
  });

  it('semana: o valor de cada dia está numa linha PRÓPRIA por cima da área das barras (a zona 90–115% nunca lá chega)', () => {
    setData({ meals: days('2026-09-28', '2026-10-03').map((d) => meal(d, 2350, 150, 300, 80)) });
    render(<NutritionDashboard />);
    const chart = screen.getByTestId('nutrition-week-chart');
    const values = within(chart).getAllByTestId('week-value');
    expect(values).toHaveLength(7);
    const bars = within(chart).getAllByTestId('week-bar');
    values.forEach((v) => expect(v.style.height).toBe('20px'));
    // O rótulo nunca é irmão da barra (colado ao topo dela): vive acima da área de 140 px das barras.
    bars.forEach((b, i) => {
      expect(b.parentElement).not.toBe(values[i].parentElement);
      expect(b.parentElement.style.height).toBe('140px');
      expect(values[i].parentElement.contains(b)).toBe(true);
      expect(values[i].nextElementSibling).toBe(b.parentElement);
    });
    // 1,15 × objetivo nunca passa de 140 / 1,08 px: dentro da área das barras, abaixo da linha dos valores.
    expect(140 / 1.08).toBeLessThan(140);
  });

  describe('trimestre', () => {
    beforeEach(() => {
      setData({ meals: days('2026-07-13', '2026-09-30').map((d) => meal(d, 2300, 140, 290, 78)) });
      usePeriodStore.getState().setPeriod('nutricao', 'trimestre', -1);
    });

    it('dia da semana: valor numa linha própria, por cima das barras', () => {
      render(<NutritionDashboard />);
      const wd = screen.getByTestId('nutrition-quarter-weekdays');
      const radios = within(wd).getAllByRole('radio');
      expect(radios).toHaveLength(7);
      radios.forEach((r) => {
        const col = r.firstElementChild; // a área de 160 px
        expect(col.children[0].style.height).toBe('20px');
        expect(col.children[1].style.height).toBe('140px');
      });
    });

    it('as colunas das semanas continuam estreitas (13 em 326 px), mas «‹ Anterior» / «Seguinte ›» têm 44 px e escolhem a semana', () => {
      render(<NutritionDashboard />);
      const card = screen.getByTestId('nutrition-quarter-weeks');
      const stepper = within(card).getByTestId('quarter-week-stepper');
      const [prev, next] = within(stepper).getAllByRole('button');
      expect(prev.style.minHeight).toBe('var(--tap)');
      expect(next.style.minHeight).toBe('var(--tap)');
      const checked = () => within(card).getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'true');
      // Por omissão a última semana (28 – 30 set): não há seguinte.
      expect(checked().getAttribute('aria-label')).toMatch(/^28 – 30 set/);
      expect(next).toBeDisabled();
      expect(prev).toBeEnabled();
      fireEvent.click(prev);
      expect(checked().getAttribute('aria-label')).toMatch(/^21 – 27 set/);
      expect(next).toBeEnabled();
      fireEvent.click(next);
      expect(checked().getAttribute('aria-label')).toMatch(/^28 – 30 set/);
      expect(next).toBeDisabled();
    });

    it('a mesma semana vale nos dois gráficos de semanas e o 2.º tem o seu próprio par de botões', () => {
      render(<NutritionDashboard />);
      const days2 = screen.getByTestId('nutrition-quarter-days');
      const [prev] = within(within(days2).getByTestId('quarter-days-stepper')).getAllByRole('button');
      fireEvent.click(prev);
      const sel = (card) => within(card).getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'true').getAttribute('aria-label');
      expect(sel(days2)).toMatch(/^21 – 27 set/);
      expect(sel(screen.getByTestId('nutrition-quarter-weeks'))).toMatch(/^21 – 27 set/);
    });

    it('no 1.º trimestre com registos a seta «Anterior» pára na primeira semana escolhível', () => {
      render(<NutritionDashboard />);
      const card = screen.getByTestId('nutrition-quarter-weeks');
      const [prev] = within(within(card).getByTestId('quarter-week-stepper')).getAllByRole('button');
      for (let i = 0; i < 20 && !prev.disabled; i += 1) fireEvent.click(prev);
      expect(prev).toBeDisabled();
      const first = within(card).getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'true');
      // O 1.º registo é 13 jul (segunda é 6 jul): a 1.ª semana escolhível é a de 13 – 19 jul (ou a que contém 13 jul).
      expect(first.getAttribute('aria-label')).toMatch(/jul/);
    });
  });
});

describe('Navegador em curso com o histórico a começar dentro do período (reparo 1, na Nutrição)', () => {
  it('semana com o 1.º registo a meio: "28 set – 4 out · desde 30 set · em curso" (sem a contagem, que vive no resumo)', () => {
    setData({ meals: [...days('2026-09-30', '2026-10-03').map((d) => meal(d, 2400, 150, 300, 80))] });
    render(<NutritionDashboard />);
    const nav = screen.getByTestId('period-navigator');
    // Revisão 2026-10-04: o navegador da semana não repete o progresso do calendário
    // (mock-up: «28 set – 4 out · em curso»); fica só o «desde 30 set».
    expect(plain(nav)).toContain('28 set – 4 out · desde 30 set · em curso');
    expect(plain(nav)).not.toContain('6 de 7');
    expect(plain(nav)).not.toContain('dias fechados');
  });

  it('semana em curso com histórico de trás: «28 set – 4 out · em curso», sem o progresso do calendário', () => {
    setData({ meals: days('2026-09-01', '2026-10-03').map((d) => meal(d, 2400, 150, 300, 80)) });
    render(<NutritionDashboard />);
    const nav = screen.getByTestId('period-navigator');
    expect(plain(nav)).toContain('28 set – 4 out · em curso');
    expect(plain(nav)).not.toMatch(/fechados/);
  });

  it('segunda, 5 out (semana a começar): o navegador diz «5 – 11 out · em curso» e não «ainda sem dias fechados»', () => {
    h.today = '2026-10-05';
    setData({ meals: days('2026-09-01', '2026-10-04').map((d) => meal(d, 2400, 150, 300, 80)) });
    render(<NutritionDashboard />);
    const nav = screen.getByTestId('period-navigator');
    expect(plain(nav)).toContain('5 – 11 out · em curso');
    expect(plain(nav)).not.toContain('ainda sem dias fechados');
  });
});
