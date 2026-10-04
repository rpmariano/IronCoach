import { useSyncExternalStore } from 'react';
import { prefersReducedMotion } from './coachBubbles';

/**
 * `prefers-reduced-motion` em tempo real (2026-10-04, F5 — animação ao ficar
 * visível). Até aqui lia-se uma vez, à montagem, com `prefersReducedMotion()`;
 * com os gráficos a repetir a entrada ao voltar ao separador, a preferência
 * tem de ser lida a cada animação e reagir se o atleta a mudar com a app
 * aberta (Definições do sistema → Acessibilidade).
 *
 * A leitura síncrona vive em `coachBubbles.js` (já usada por 7 ecrãs) e é
 * reexportada daqui para quem só precisa do motor — com a MESMA regra: sem
 * `matchMedia` (jsdom, WebViews antigas) não há como saber, e a escolha
 * segura é não animar (devolve `true`).
 */
export { prefersReducedMotion };

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Subscreve mudanças da preferência; devolve a função que cancela. Tolerante
 * a ambientes sem `matchMedia`/`addEventListener` (jsdom não os traz; o
 * Safari < 14 só tem `addListener`) — nesses casos não há eventos e o
 * cancelamento é um no-op.
 */
export function subscribeReducedMotion(onChange) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  let mql;
  try {
    mql = window.matchMedia(QUERY);
  } catch {
    return () => {};
  }
  if (!mql) return () => {};
  if (mql.addEventListener) {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }
  mql.addListener?.(onChange);
  return () => mql.removeListener?.(onChange);
}

/** `true` quando o sistema pede menos movimento; re-renderiza se mudar. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
}

export default useReducedMotion;
