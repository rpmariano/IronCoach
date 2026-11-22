import { useAppStore } from '../store';
import { FEATURE_BASE } from '../store/featureFlagsSlice';

/* Ler um interruptor (store/featureFlagsSlice.js): fora do React, isFeatureOn(key); num componente,
   useFeature(key) — que volta a desenhar quando o admin muda o valor e a app o relê. */

/** O valor agora. Uma chave desconhecida conta como ligada (nada se esconde por engano). */
export function isFeatureOn(key, state) {
  let st = state;
  if (st === undefined) {
    try { st = useAppStore.getState?.(); } catch { st = null; }
  }
  const flags = st?.featureFlags || FEATURE_BASE;
  return key in flags ? !!flags[key] : true;
}

export function useFeature(key) {
  return !!useAppStore((s) => isFeatureOn(key, s));
}
