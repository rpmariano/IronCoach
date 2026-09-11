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
    const anim = barGrowAnimation(true);
    expect(DUR_BARS).toBe(550);
    expect(STAGGER_BARS).toBe(60);
    expect(anim.duration).toBe(550);
    expect(anim.delay({ type: 'data', mode: 'default', dataIndex: 0 })).toBe(0);
    expect(anim.delay({ type: 'data', mode: 'default', dataIndex: 6 })).toBe(360);
  });

  it('só as barras se desfasam — o resto (escalas, redimensionar) entra a zero', () => {
    const anim = barGrowAnimation(true);
    expect(anim.delay({ type: 'dataset', mode: 'resize', dataIndex: 3 })).toBe(0);
  });
});
