import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TODAY, PATTY_RUNS, PATTY_PLAN_ITEMS, PATTY_PLANS, TRAIL, MEIA } from '../test/pattyLoad';
import { loadTopicCandidate, loadTopicMessage, loadTopicSignature, markLoadTopicHandled, wasLoadTopicHandled } from './loadTopic';

/* Bug #123 (2026-11-17, o Rui: «não seria melhor ser um alerta da Carol e ir ao chat falar com
   ela?»): a carga e o volume deixam de ser um cartão no Início e passam a um assunto dela — uma vez
   por mudança de estado, e sai quando ele fala com ela ou escolhe. */

vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, invokeEdgeFunctionWithTimeout: vi.fn(), logAppEvent: vi.fn() }));

const RACE = { id: 'meia', name: 'Meia dos Descobrimentos' };

describe('loadTopic — a frase, a assinatura e a marca', () => {
  beforeEach(() => localStorage.clear());

  it('a frase na voz dela, sem números, pelo estado — com a prova concluída que subiu a carga', () => {
    expect(loadTopicMessage({ state: 'carga', race: RACE, acuteFromRace: { name: 'Corrida do Tejo', km: 10 } }))
      .toBe('A Corrida do Tejo subiu a tua carga desta semana. Quero falar contigo sobre os próximos dias.');
    expect(loadTopicMessage({ state: 'carga', race: RACE })).toBe('Nestes 7 dias correste bem mais do que o teu habitual. Quero falar contigo sobre os próximos dias.');
    expect(loadTopicMessage({ state: 'volume', race: RACE })).toBe('Para Meia dos Descobrimentos ainda corres menos do que ela pede. Quero ver contigo como chegar lá.');
    expect(loadTopicMessage({ state: 'conflito', race: RACE })).toMatch(/^Nestes 7 dias .* Quero decidir contigo o que pesa mais\.$/);
    expect(loadTopicMessage({ state: 'perfil', race: RACE, loadAlert: true })).toMatch(/Passaste o limite/);
    // Perfil escolhido dentro do limite, ou tudo bem: não há assunto.
    expect(loadTopicMessage({ state: 'perfil', race: RACE, loadAlert: false })).toBeNull();
    expect(loadTopicMessage({ state: 'ok', race: RACE })).toBeNull();
  });

  it('uma vez por estado: tratado, não volta; um estado novo (ou outra prova concluída) volta', () => {
    const carga = { state: 'carga', race: RACE };
    const sig = loadTopicSignature(carga);
    expect(sig).toBe('load:meia:carga');
    expect(loadTopicCandidate(carga, { userId: 'u1' })).toMatchObject({ signature: sig, raceId: 'meia', state: 'carga' });
    markLoadTopicHandled('u1', sig);
    expect(loadTopicCandidate(carga, { userId: 'u1' })).toBeNull();
    expect(loadTopicCandidate({ ...carga, state: 'conflito' }, { userId: 'u1' })).not.toBeNull();
    expect(loadTopicSignature({ ...carga, acuteFromRace: { name: 'Corrida do Tejo' } })).toBe('load:meia:carga:Corrida do Tejo');
  });

  it('falado ou dispensado noutro dispositivo (as impressões) também conta', () => {
    const sig = 'load:meia:volume';
    expect(wasLoadTopicHandled('u1', sig, { impressionShown: new Set([`moment:${sig}`]) })).toBe(true);
    expect(wasLoadTopicHandled('u1', sig, { impressionDismissed: new Set([`alert:${sig}`]) })).toBe(true);
    expect(wasLoadTopicHandled('u1', sig, { impressionShown: new Set(), impressionDismissed: new Set() })).toBe(false);
  });
});

describe('useCarolNotices — o aviso da carga no lugar do cartão', () => {
  let useAppStore;
  let useCarolNotices;
  let ToastProvider;
  beforeEach(async () => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
    ({ useAppStore } = await import('../store'));
    ({ default: useCarolNotices } = await import('../components/BI/useCarolNotices'));
    ({ ToastProvider } = await import('../components/shared/ToastProvider'));
    useAppStore.setState({
      session: { user: { id: 'u1' } }, profile: { id: 'u1', experience_level: 'basico' },
      raceEvents: [TRAIL, MEIA], runs: PATTY_RUNS, coachPlans: PATTY_PLANS, coachPlanItems: PATTY_PLAN_ITEMS,
      impressionShown: new Set(), impressionDismissed: new Set(), coachIntent: null, activeTab: 'home',
    });
  });
  afterEach(() => vi.useRealTimers());

  it('a Patty em conflito: um aviso dela; os avisos de ACWR e de volume não aparecem soltos; «Falar» abre o chat com o assunto', () => {
    const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;
    const { result } = renderHook(() => useCarolNotices(), { wrapper });
    const alert = result.current.alerts.find((a) => a.id === 'carga');
    expect(alert).toBeDefined();
    expect(alert.title).toBe('A tua carga de corrida');
    expect(alert.message).toMatch(/Quero decidir contigo o que pesa mais\./);
    expect(result.current.insights.filter((i) => i.id.startsWith('acwr_') || i.id === 'race_volume')).toEqual([]);

    act(() => { alert.onTalk(); });
    expect(useAppStore.getState().coachIntent).toEqual({ kind: 'load_topic', raceId: 'meia', state: 'conflito', signature: 'load:meia:conflito' });
    expect(useAppStore.getState().activeTab).toBe('coach');
  });

  it('«Dispensar» cala este estado', () => {
    useAppStore.setState({ logImpressionDismissed: vi.fn() });
    const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;
    const { result, rerender } = renderHook(() => useCarolNotices(), { wrapper });
    act(() => { result.current.alerts.find((a) => a.id === 'carga').onDismiss(); });
    rerender();
    expect(result.current.alerts.find((a) => a.id === 'carga')).toBeUndefined();
  });
});
