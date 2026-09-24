import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { create } from 'zustand';
import { startDailySummaryRefresh } from './dailySummaryRefresh';

const TODAY = '2026-09-24';
const session = { user: { id: 'u1' } };
const loaded = (uid = 'u1') => ({ trainingLoadedFor: uid });
const run = (id, date = TODAY, km = 5) => ({ id, date, distance_km: km });

function setup() {
  const loadDailySummary = vi.fn(() => Promise.resolve(null));
  const store = create(() => ({ session: null, runs: [], gymSessions: [], profile: null, loadDailySummary }));
  const stop = startDailySummaryRefresh(store, { delayMs: 100, today: () => TODAY });
  return { store, loadDailySummary, stop };
}

describe('startDailySummaryRefresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a primeira lista da sessão é o ponto de partida, não uma novidade', () => {
    const { store, loadDailySummary } = setup();
    store.setState({ session });
    store.setState({ ...loaded(), runs: [run('a')], gymSessions: [{ id: 'g', date: TODAY }] });
    vi.advanceTimersByTime(500);
    expect(loadDailySummary).not.toHaveBeenCalled();
  });

  it('uma corrida nova de hoje refaz o resumo, com force', () => {
    const { store, loadDailySummary } = setup();
    store.setState({ session });
    store.setState({ ...loaded(), runs: [run('a', '2026-09-21')] });
    store.setState({ ...loaded(), runs: [run('a', '2026-09-21'), run('b')] });
    vi.advanceTimersByTime(100);
    expect(loadDailySummary).toHaveBeenCalledTimes(1);
    expect(loadDailySummary).toHaveBeenCalledWith({ force: true });
  });

  it('o registo e a reanálise com outra distância juntam-se num pedido', () => {
    const { store, loadDailySummary } = setup();
    store.setState({ session });
    store.setState({ ...loaded(), runs: [] });
    store.setState({ ...loaded(), runs: [run('b', TODAY, 5)] });
    vi.advanceTimersByTime(50);
    store.setState({ ...loaded(), runs: [run('b', TODAY, 5.03)] });
    vi.advanceTimersByTime(100);
    expect(loadDailySummary).toHaveBeenCalledTimes(1);
  });

  it('treino de ginásio novo e treino apagado também contam', () => {
    const { store, loadDailySummary } = setup();
    store.setState({ session });
    store.setState({ ...loaded(), runs: [run('a')], gymSessions: [] });
    store.setState({ ...loaded(), gymSessions: [{ id: 'g', date: TODAY }] });
    vi.advanceTimersByTime(100);
    store.setState({ ...loaded(), runs: [] });
    vi.advanceTimersByTime(100);
    expect(loadDailySummary).toHaveBeenCalledTimes(2);
  });

  it('fora dos últimos 7 dias, ou só com outros campos a mudar, não pede nada', () => {
    const { store, loadDailySummary } = setup();
    store.setState({ session });
    store.setState({ ...loaded(), runs: [run('a')] });
    store.setState({ ...loaded(), runs: [run('a'), run('old', '2026-09-10')] });
    store.setState({ ...loaded(), runs: [{ ...run('a'), details: { notas: 'x' } }, run('old', '2026-09-10')] });
    store.setState({ profile: { id: 'u1' } });
    vi.advanceTimersByTime(500);
    expect(loadDailySummary).not.toHaveBeenCalled();
  });

  it('uma recarga falhada (listas vazias) não conta como treinos apagados', () => {
    const { store, loadDailySummary } = setup();
    store.setState({ session });
    store.setState({ ...loaded(), runs: [run('a')], gymSessions: [] });
    store.setState({ ...loaded(), runs: [], gymSessions: [] });
    store.setState({ ...loaded(), runs: [run('a')], gymSessions: [] });
    vi.advanceTimersByTime(500);
    expect(loadDailySummary).not.toHaveBeenCalled();
  });

  it('outra conta: a lista dela é um ponto de partida novo', () => {
    const { store, loadDailySummary } = setup();
    store.setState({ session });
    store.setState({ ...loaded(), runs: [run('a')] });
    store.setState({ session: null });
    store.setState({ session: { user: { id: 'u2' } } });
    store.setState({ ...loaded('u2'), runs: [run('z')] });
    vi.advanceTimersByTime(500);
    expect(loadDailySummary).not.toHaveBeenCalled();
  });

  it('antes de as corridas desta conta chegarem, nada é ponto de partida', () => {
    const { store, loadDailySummary } = setup();
    store.setState({ session });
    // O arranque: listas vazias (ou de outra conta) antes do carregamento…
    store.setState({ runs: [], gymSessions: [] });
    // …e depois as corridas a sério, com a marca da conta.
    store.setState({ ...loaded(), runs: [run('a'), run('b')] });
    vi.advanceTimersByTime(500);
    expect(loadDailySummary).not.toHaveBeenCalled();
  });

  it('parar cancela o pedido pendente', () => {
    const { store, loadDailySummary, stop } = setup();
    store.setState({ session });
    store.setState({ ...loaded(), runs: [] });
    store.setState({ ...loaded(), runs: [run('b')] });
    stop();
    vi.advanceTimersByTime(500);
    expect(loadDailySummary).not.toHaveBeenCalled();
  });
});
