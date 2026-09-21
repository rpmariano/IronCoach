import { describe, it, expect, vi, beforeEach } from 'vitest';

/* A leitura das impressões (ação 5.1): os dois conjuntos do store, a
   sementeira dos insights dispensados e a coerência do próprio telemóvel
   depois de gravar. O Supabase é um esboço: `from()` devolve uma consulta
   encadeável que resolve com o que `mocks.rows`/`mocks.error` disserem. */
const mocks = { rows: [], error: null, from: vi.fn(), upsert: vi.fn() };
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      mocks.from(table);
      const q = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        then: (resolve, reject) => Promise.resolve({ data: mocks.rows, error: mocks.error }).then(resolve, reject),
        upsert: (...args) => { mocks.upsert(...args); return Promise.resolve({ error: mocks.error }); },
      };
      return q;
    },
  },
  invokeEdgeFunctionWithTimeout: vi.fn(),
}));

const { useAppStore, impressionKeySets } = await import('./index');

const linha = (kind, key, dismissed = false) => ({ kind, key, dismissed_at: dismissed ? '2026-09-20T10:00:00Z' : null });

describe('impressionKeySets', () => {
  it('chave composta kind:key; o dispensado entra nos dois conjuntos', () => {
    const { shown, dismissed } = impressionKeySets([
      linha('welcome', '2026-09-20:manha'),
      linha('moment', 'weekdone:2026-09-14'),
      linha('alert', 'race_after:r1:run-1', true),
      { kind: 'insights', key: null },
      null,
    ]);
    expect([...shown].sort()).toEqual(['alert:race_after:r1:run-1', 'moment:weekdone:2026-09-14', 'welcome:2026-09-20:manha']);
    expect([...dismissed]).toEqual(['alert:race_after:r1:run-1']);
  });

  it('sem linhas, dois conjuntos vazios', () => {
    const { shown, dismissed } = impressionKeySets(null);
    expect(shown.size).toBe(0);
    expect(dismissed.size).toBe(0);
  });
});

describe('refreshImpressionKeys', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.rows = [];
    mocks.error = null;
    mocks.from.mockClear();
    mocks.upsert.mockClear();
    useAppStore.setState({
      session: { user: { id: 'u1' } },
      profile: { id: 'u1' },
      insightStates: {},
      impressionShown: new Set(),
      impressionDismissed: new Set(),
    });
  });

  it('enche os dois conjuntos com o que o servidor tem', async () => {
    mocks.rows = [linha('welcome', '2026-09-20:manha'), linha('moment', 'daydone:2026-09-20'), linha('alert', 'race_after:r1:run-1', true)];
    await useAppStore.getState().refreshImpressionKeys();
    expect(mocks.from).toHaveBeenCalledWith('coach_impressions');
    const s = useAppStore.getState();
    expect(s.impressionShown.has('welcome:2026-09-20:manha')).toBe(true);
    expect(s.impressionShown.has('moment:daydone:2026-09-20')).toBe(true);
    expect(s.impressionShown.has('alert:race_after:r1:run-1')).toBe(true);
    expect([...s.impressionDismissed]).toEqual(['alert:race_after:r1:run-1']);
  });

  it('sem sessão não consulta nada', async () => {
    useAppStore.setState({ session: null, profile: null });
    await useAppStore.getState().refreshImpressionKeys();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('em erro, os conjuntos ficam como estavam', async () => {
    useAppStore.setState({ impressionShown: new Set(['welcome:2026-09-20:manha']) });
    mocks.error = { message: 'falhou' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await useAppStore.getState().refreshImpressionKeys();
    expect(useAppStore.getState().impressionShown.has('welcome:2026-09-20:manha')).toBe(true);
    warn.mockRestore();
  });

  it('semeia insightStates com os insights dispensados, sem pisar um estado que já exista', async () => {
    useAppStore.setState({ insightStates: { acwr_danger: 'understood' } });
    mocks.rows = [linha('insights', 'low_adherence', true), linha('insights', 'acwr_danger', true), linha('insights', 'bf_low')];
    await useAppStore.getState().refreshImpressionKeys();
    expect(useAppStore.getState().insightStates).toEqual({ acwr_danger: 'understood', low_adherence: 'ignored' });
    // Pelo mesmo caminho do "Ignorar": fica também na cache local.
    expect(JSON.parse(window.localStorage.getItem('ironcoach_insight_states'))).toEqual({ acwr_danger: 'understood', low_adherence: 'ignored' });
  });
});

describe('logImpression e logImpressionDismissed — o próprio telemóvel fica coerente', () => {
  beforeEach(() => {
    mocks.error = null;
    mocks.upsert.mockClear();
    useAppStore.setState({ session: { user: { id: 'u1' } }, profile: { id: 'u1' }, impressionShown: new Set(), impressionDismissed: new Set() });
  });

  it('gravar um momento acrescenta a chave a impressionShown', async () => {
    await useAppStore.getState().logImpression({ kind: 'moment', key: 'weekdone:2026-09-14', title: null });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().impressionShown.has('moment:weekdone:2026-09-14')).toBe(true);
    expect(useAppStore.getState().impressionDismissed.size).toBe(0);
  });

  it('dispensar acrescenta a chave aos dois conjuntos', async () => {
    await useAppStore.getState().logImpressionDismissed({ kind: 'alert', key: 'race_after:r1:run-1', title: 'O balanço da prova' });
    expect(useAppStore.getState().impressionShown.has('alert:race_after:r1:run-1')).toBe(true);
    expect(useAppStore.getState().impressionDismissed.has('alert:race_after:r1:run-1')).toBe(true);
  });

  it('se o servidor recusar, a chave não entra', async () => {
    mocks.error = { message: '23514' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await useAppStore.getState().logImpression({ kind: 'welcome', key: '2026-09-20:manha', title: 'Bom dia.' });
    expect(useAppStore.getState().impressionShown.size).toBe(0);
    warn.mockRestore();
  });

  it('terminar sessão esvazia os conjuntos', () => {
    useAppStore.setState({ impressionShown: new Set(['welcome:2026-09-20:manha']), impressionDismissed: new Set(['alert:balanco']) });
    useAppStore.getState().setSession(null);
    expect(useAppStore.getState().impressionShown.size).toBe(0);
    expect(useAppStore.getState().impressionDismissed.size).toBe(0);
  });

  it('terminar sessão limpa também a cache dos insights, para o utilizador seguinte não a herdar', () => {
    window.localStorage.clear();
    useAppStore.setState({ insightStates: {} });
    useAppStore.getState().setInsightState('acwr_danger', 'ignored');
    expect(JSON.parse(window.localStorage.getItem('ironcoach_insight_states'))).toEqual({ acwr_danger: 'ignored' });
    useAppStore.getState().setSession(null);
    expect(useAppStore.getState().insightStates).toEqual({});
    expect(window.localStorage.getItem('ironcoach_insight_states')).toBeNull();
  });
});
