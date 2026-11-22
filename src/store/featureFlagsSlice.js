import { supabase } from '../lib/supabase';
import { withDeadline } from '../utils/bootDeadline';

/* Interruptores por funcionalidade («v1 lite», aprovado pelo Rui, 2026-11-22). O código não se
   apaga, só se esconde: cada chave liga ou desliga uma parte da app, e só o admin as muda (Admin ·
   Funcionalidades). A tabela é public.app_feature_flags (key, enabled, updated_at, updated_by):
   todos os autenticados leem, só o admin escreve.

   Nunca trava o arranque (lembra o bug do logotipo, 2026-11-17): o store nasce com a cache deste
   dispositivo (localStorage) ou, sem ela, com os valores por defeito do código — que são os do
   lançamento. A leitura do servidor vai por baixo, com prazo, depois de haver sessão e ao voltar
   à app; se falhar, fica o que havia. */

/** As chaves, o estado no lançamento, e o nome e a descrição para o Admin. */
export const FEATURES = [
  { key: 'cup', default: false, label: 'Troféu (Taça)', description: 'Jornadas, classificações, equipas, inscrições e os avisos da competição. As provas que já vieram da Taça ficam como provas normais.' },
  { key: 'race_memories', default: false, label: 'Memórias da prova', description: 'Diploma, medalha, mural e fotos da prova. Os campos do resultado (dorsal, escalão, posição) ficam sempre.' },
  { key: 'badges', default: false, label: 'Conquistas', description: 'Conquistas e medalhas em todo o lado, incluindo depois da prova.' },
  { key: 'water', default: false, label: 'Água', description: 'O registo de água no Início e na Nutrição e os lembretes de água no Perfil.' },
  { key: 'pantry_advanced', default: false, label: 'Despensa avançada', description: 'As regras e os modelos de refeição. A despensa básica e os alimentos frequentes ficam sempre.' },
  { key: 'advanced_charts', default: false, label: 'Gráficos avançados', description: 'As análises cruzadas, a carga (ACWR) e os gráficos técnicos da Evolução. Sem isto, ficam 2 ou 3 gráficos por área.' },
  { key: 'tutorial', default: false, label: 'Tutorial', description: 'O tutorial da Carol no primeiro acesso e o «Rever o tutorial» no Perfil.' },
  { key: 'shoes', default: true, label: 'Sapatilhas', description: 'O armário de sapatilhas e o desgaste de cada par.' },
  { key: 'load_profile_choice', default: true, label: 'Perfil de carga', description: 'A escolha Prudente / Mais volume, no hub da prova e na conversa com a Carol.' },
];

export const FEATURE_DEFAULTS = Object.freeze(Object.fromEntries(FEATURES.map((f) => [f.key, f.default])));

/* Nos testes, tudo ligado por defeito: os testes de cada funcionalidade continuam a vê-la, e os dos
   interruptores desligam-na de propósito (featureFlags no store). Na app, os do lançamento. */
const IS_TEST = (() => { try { return import.meta.env?.MODE === 'test'; } catch { return false; } })();
export const FEATURE_BASE = IS_TEST ? Object.freeze(Object.fromEntries(FEATURES.map((f) => [f.key, true]))) : FEATURE_DEFAULTS;
export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export const FEATURE_CACHE_KEY = 'ironcoach:feature-flags';
export const FEATURE_READ_TIMEOUT_MS = 6000;

/** Os valores efetivos: o código por defeito, por cima o que o servidor (ou a cache) disse.
 *  Uma chave desconhecida do código ignora-se; uma que falta vale o defeito. */
export function resolveFeatureFlags(rows, base = FEATURE_BASE) {
  const out = { ...base };
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r && typeof r.key === 'string' && r.key in out && typeof r.enabled === 'boolean') out[r.key] = r.enabled;
  }
  return out;
}

export function readFeatureCache(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(FEATURE_CACHE_KEY) || 'null');
    return Array.isArray(raw?.rows) ? raw.rows : null;
  } catch {
    return null;
  }
}

function writeFeatureCache(rows, storage = globalThis.localStorage) {
  try { storage?.setItem(FEATURE_CACHE_KEY, JSON.stringify({ rows, at: Date.now() })); } catch { /* sem storage */ }
}

const initialRows = readFeatureCache();

export const createFeatureFlagsSlice = (set, get) => ({
  /** { key: boolean } — sempre completo (os defeitos por baixo). */
  featureFlags: resolveFeatureFlags(initialRows),
  /** As linhas como vieram (para o Admin: quando e por quem). */
  featureFlagRows: initialRows || [],
  /** De onde vêm os valores: 'defaults' | 'cache' | 'server'. */
  featureFlagsSource: initialRows ? 'cache' : 'defaults',

  /** Lê a tabela (com prazo). Falha → fica o que havia. Devolve true se leu do servidor. */
  loadFeatureFlags: async () => {
    try {
      const res = await withDeadline(
        supabase.from('app_feature_flags').select('key, enabled, updated_at, updated_by'),
        FEATURE_READ_TIMEOUT_MS,
        'feature flags',
      );
      if (res?.error || !Array.isArray(res?.data)) return false;
      writeFeatureCache(res.data);
      set({ featureFlags: resolveFeatureFlags(res.data), featureFlagRows: res.data, featureFlagsSource: 'server' });
      return true;
    } catch {
      return false;
    }
  },

  /** Só o admin (a RLS recusa os outros). Grava, relê a linha e atualiza o store e a cache. */
  setFeatureFlag: async (key, enabled) => {
    if (!FEATURE_KEYS.includes(key)) return { ok: false, message: 'Chave desconhecida.' };
    const { data, error } = await supabase
      .from('app_feature_flags')
      .upsert({ key, enabled: !!enabled }, { onConflict: 'key' })
      .select('key, enabled, updated_at, updated_by')
      .maybeSingle();
    if (error || !data) return { ok: false, message: error?.message || 'Não consegui gravar.' };
    const rows = [...(get().featureFlagRows || []).filter((r) => r.key !== key), data];
    writeFeatureCache(rows);
    set({ featureFlags: resolveFeatureFlags(rows), featureFlagRows: rows, featureFlagsSource: 'server' });
    return { ok: true, row: data };
  },
});
