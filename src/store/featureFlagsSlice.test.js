import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Os interruptores por funcionalidade («v1 lite», 2026-11-22): os valores por defeito são os do
   lançamento, a cache vale quando a leitura falha, e a leitura nunca trava nada. */

const mocks = vi.hoisted(() => ({ select: null, upsert: null }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => mocks.select(),
      upsert: (row) => ({ select: () => ({ maybeSingle: () => mocks.upsert(row) }) }),
    }),
  },
}));

const { useAppStore } = await import('./index');
const { FEATURES, FEATURE_DEFAULTS, FEATURE_CACHE_KEY, resolveFeatureFlags, readFeatureCache } = await import('./featureFlagsSlice');
const { isFeatureOn } = await import('../utils/features');

describe('featureFlags', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ featureFlags: resolveFeatureFlags([], FEATURE_DEFAULTS), featureFlagRows: [], featureFlagsSource: 'defaults' });
  });

  it('o estado do lançamento: tudo desligado menos as sapatilhas e o perfil de carga', () => {
    expect(FEATURE_DEFAULTS).toEqual({
      cup: false, race_memories: false, badges: false, water: false, pantry_advanced: false,
      advanced_charts: false, tutorial: false, shoes: true, load_profile_choice: true,
    });
    expect(FEATURES.every((f) => f.label && f.description)).toBe(true);
  });

  it('as linhas do servidor por cima dos defeitos; chaves desconhecidas e valores que não são booleanos ignoram-se', () => {
    const flags = resolveFeatureFlags([{ key: 'water', enabled: true }, { key: 'xpto', enabled: true }, { key: 'cup', enabled: 'sim' }], FEATURE_DEFAULTS);
    expect(flags.water).toBe(true);
    expect(flags.cup).toBe(false);
    expect('xpto' in flags).toBe(false);
  });

  it('lida do servidor: o store e a cache ficam com ela', async () => {
    mocks.select = () => Promise.resolve({ data: [{ key: 'badges', enabled: true, updated_at: '2026-11-22T10:00:00Z', updated_by: 'admin-1' }], error: null });
    expect(await useAppStore.getState().loadFeatureFlags()).toBe(true);
    expect(isFeatureOn('badges')).toBe(true);
    expect(useAppStore.getState().featureFlagsSource).toBe('server');
    expect(readFeatureCache()).toEqual([{ key: 'badges', enabled: true, updated_at: '2026-11-22T10:00:00Z', updated_by: 'admin-1' }]);
  });

  it('a leitura falha (erro ou rede): fica o que havia, sem lançar', async () => {
    mocks.select = () => Promise.resolve({ data: null, error: { message: 'rls' } });
    expect(await useAppStore.getState().loadFeatureFlags()).toBe(false);
    mocks.select = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await useAppStore.getState().loadFeatureFlags()).toBe(false);
    expect(isFeatureOn('water')).toBe(false);
    expect(useAppStore.getState().featureFlagsSource).toBe('defaults');
  });

  it('a leitura pendurada não trava: desiste ao fim do prazo', async () => {
    vi.useFakeTimers();
    try {
      mocks.select = () => new Promise(() => {});
      const p = useAppStore.getState().loadFeatureFlags();
      await vi.advanceTimersByTimeAsync(6000);
      expect(await p).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a cache guardada é lida (é com ela que o store nasce no arranque seguinte)', () => {
    localStorage.setItem(FEATURE_CACHE_KEY, JSON.stringify({ rows: [{ key: 'cup', enabled: true }], at: 1 }));
    expect(readFeatureCache()).toEqual([{ key: 'cup', enabled: true }]);
    localStorage.setItem(FEATURE_CACHE_KEY, '{lixo');
    expect(readFeatureCache()).toBeNull();
  });

  it('o admin grava: upsert e o store passa a ter a linha nova', async () => {
    mocks.upsert = (row) => Promise.resolve({ data: { ...row, updated_at: '2026-11-22T11:00:00Z', updated_by: 'admin-1' }, error: null });
    const res = await useAppStore.getState().setFeatureFlag('tutorial', true);
    expect(res.ok).toBe(true);
    expect(isFeatureOn('tutorial')).toBe(true);
    expect(useAppStore.getState().featureFlagRows.find((r) => r.key === 'tutorial')).toMatchObject({ enabled: true, updated_by: 'admin-1' });
    mocks.upsert = () => Promise.resolve({ data: null, error: { message: 'permission denied' } });
    expect((await useAppStore.getState().setFeatureFlag('tutorial', false)).ok).toBe(false);
    expect(isFeatureOn('tutorial')).toBe(true);
    expect((await useAppStore.getState().setFeatureFlag('xpto', true)).ok).toBe(false);
  });

  it('uma chave que o código não conhece conta como ligada (nada se esconde por engano)', () => {
    expect(isFeatureOn('qualquer_coisa')).toBe(true);
  });
});
