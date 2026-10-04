import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import {
  INTRO_ANIMATIONS_KEY,
  introAnimationsPlayed,
  markIntroAnimationsPlayed,
  resetIntroAnimations,
  useIntroAnimation,
  barGrowAnimation,
  DUR_BARS,
  STAGGER_BARS,
  STAGGER_BARS_MAX_SPAN,
  DUR_CHART,
  DUR_CHART_PERIOD,
  DUR_COUNT_REVEAL,
  barStagger,
} from './introAnimations';

/* "Uma vez por sessão" — ponto 9 do handoff: «Anéis, números e barras animam
   à primeira entrada da sessão e ficam quietos no resto.» */

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  sessionStorage.clear();
  // Sem prefers-reduced-motion, salvo quando o teste disser o contrário.
  window.matchMedia = () => ({ matches: false });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('marca de sessão', () => {
  it('começa por não ter corrido nada', () => {
    expect(introAnimationsPlayed()).toBe(false);
    expect(introAnimationsPlayed('rings')).toBe(false);
  });

  it('marcar torna a chave "já vista" e guarda em sessionStorage', () => {
    markIntroAnimationsPlayed('rings');
    expect(introAnimationsPlayed('rings')).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(INTRO_ANIMATIONS_KEY))).toEqual(['rings']);
  });

  it('cada chave é independente — o Início não gasta a animação dos dashboards', () => {
    markIntroAnimationsPlayed('rings');
    expect(introAnimationsPlayed('bi-bars')).toBe(false);
  });

  it('marcar duas vezes não duplica', () => {
    markIntroAnimationsPlayed('rings');
    markIntroAnimationsPlayed('rings');
    expect(JSON.parse(sessionStorage.getItem(INTRO_ANIMATIONS_KEY))).toEqual(['rings']);
  });

  it('resetIntroAnimations esquece tudo', () => {
    markIntroAnimationsPlayed('rings');
    resetIntroAnimations();
    expect(introAnimationsPlayed('rings')).toBe(false);
  });

  it('conteúdo corrompido lê-se como "nada visto" em vez de rebentar', () => {
    sessionStorage.setItem(INTRO_ANIMATIONS_KEY, '{isto não é json');
    expect(() => introAnimationsPlayed('rings')).not.toThrow();
    expect(introAnimationsPlayed('rings')).toBe(false);
  });

  it('sem sessionStorage disponível não rebenta (anima, que é o mal menor)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('sem storage'); });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('sem storage'); });
    try {
      expect(introAnimationsPlayed('rings')).toBe(false);
      expect(() => markIntroAnimationsPlayed('rings')).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe('useIntroAnimation', () => {
  function Probe({ chave, onValue }) {
    const should = useIntroAnimation(chave);
    onValue(should);
    return null;
  }
  const probe = (chave, onValue) => React.createElement(Probe, { chave, onValue });

  it('anima na PRIMEIRA montagem da sessão e já não na segunda', () => {
    const valores = [];
    act(() => { render(probe('rings', (v) => valores.push(v))); });
    expect(valores[0]).toBe(true);

    const segundos = [];
    act(() => { render(probe('rings', (v) => segundos.push(v))); });
    expect(segundos[0]).toBe(false);
  });

  it('marca a chave como vista logo a seguir à montagem', () => {
    act(() => { render(probe('bi-bars', () => {})); });
    expect(introAnimationsPlayed('bi-bars')).toBe(true);
  });

  it('com prefers-reduced-motion nunca anima', () => {
    window.matchMedia = () => ({ matches: true });
    const valores = [];
    act(() => { render(probe('rings', (v) => valores.push(v))); });
    expect(valores[0]).toBe(false);
  });

  it('sem matchMedia (jsdom cru, WebViews antigas) também não anima', () => {
    window.matchMedia = undefined;
    const valores = [];
    act(() => { render(probe('rings', (v) => valores.push(v))); });
    expect(valores[0]).toBe(false);
  });
});

describe('barGrowAnimation (animação 4 — barras que crescem)', () => {
  it('sem animar devolve false — o Chart.js pinta a barra já no sítio', () => {
    expect(barGrowAnimation(false)).toBe(false);
  });

  it('a animar usa --dur-bars e o desfasamento por barra de --stagger-bars', () => {
    // 2026-10-04: o teste fixava o escalonamento SEM teto (6 × 60 = 360 para
    // qualquer nº de barras). Agora diz-se quantas barras são: 7 barras →
    // min(60, 450/6 = 75) = 60, e o valor antigo mantém-se onde cabia no teto.
    const anim = barGrowAnimation({ count: 7 });
    expect(DUR_BARS).toBe(550);
    expect(STAGGER_BARS).toBe(60);
    expect(anim.duration).toBe(550);
    expect(anim.delay({ type: 'data', mode: 'default', dataIndex: 0 })).toBe(0);
    expect(anim.delay({ type: 'data', mode: 'default', dataIndex: 6 })).toBe(360);
  });

  it('o escalonamento tem teto: 31 barras do mês demoram ~1 s, não 2,35 s', () => {
    const anim = barGrowAnimation({ count: 31 });
    const ultima = anim.delay({ type: 'data', mode: 'default', dataIndex: 30 });
    expect(STAGGER_BARS_MAX_SPAN).toBe(450);
    expect(ultima).toBeCloseTo(450, 5);
    expect(ultima + DUR_BARS).toBeLessThanOrEqual(1000);
    // antes: 30 × 60 + 550
    expect(30 * STAGGER_BARS + DUR_BARS).toBe(2350);
  });

  it('barStagger: 60 ms até 8 barras, depois 450/(n-1); sem n usa o do token', () => {
    expect(barStagger(2)).toBe(60);
    expect(barStagger(8)).toBe(60);       // 450/7 = 64,3 → 60
    expect(barStagger(13)).toBe(37.5);
    expect(barStagger(31)).toBe(15);
    expect(barStagger(undefined)).toBe(60);
    expect(barStagger(1)).toBe(60);
  });

  it('sem `count` lê o nº de barras do gráfico (labels, ou o dataset)', () => {
    const anim = barGrowAnimation(true);
    const labels = Array.from({ length: 31 }, (_, i) => i);
    expect(anim.delay({ type: 'data', mode: 'default', dataIndex: 30, chart: { data: { labels } } })).toBeCloseTo(450, 5);
    const datasets = [{ data: labels }];
    expect(anim.delay({ type: 'data', mode: 'default', dataIndex: 30, datasetIndex: 0, chart: { data: { datasets } } })).toBeCloseTo(450, 5);
  });

  it('com movimento reduzido devolve false — nas duas formas de chamar', () => {
    expect(barGrowAnimation({ reduced: true })).toBe(false);
    expect(barGrowAnimation({ reduced: true, count: 7 })).toBe(false);
    expect(barGrowAnimation(true, true)).toBe(false);
  });

  it('forma antiga com boolean continua a funcionar até os chamadores migrarem', () => {
    expect(barGrowAnimation(false)).toBe(false);
    expect(barGrowAnimation(true).duration).toBe(DUR_BARS);
    expect(barGrowAnimation({ animate: false })).toBe(false);
  });

  it('a duração da contagem do número alinha com a do gráfico (~800 ms)', () => {
    expect(DUR_CHART).toBe(700);
    expect(DUR_CHART_PERIOD).toBe(300);
    expect(DUR_COUNT_REVEAL).toBe(800);
  });

  it('só as barras se desfasam — o resto (escalas, redimensionar) entra a zero', () => {
    const anim = barGrowAnimation({ count: 7 });
    expect(anim.delay({ type: 'dataset', mode: 'resize', dataIndex: 3 })).toBe(0);
  });

  it('mudar de período (modo "period"/"none") não escalona — transição curta de 300 ms', () => {
    const anim = barGrowAnimation({ count: 31 });
    expect(anim.delay({ type: 'data', mode: 'period', dataIndex: 20 })).toBe(0);
    expect(anim.delay({ type: 'data', mode: 'active', dataIndex: 20 })).toBe(0);
  });
});
