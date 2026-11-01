import { currentBuild } from './appUpdate';

/* Diz ao service worker que versão da app está a correr e que ficheiros de /assets/ ela já usou
   (bug #97): o service worker guarda esses ficheiros em cache e, quando a versão muda, apaga os
   das versões antigas (public/sw.js, onAppBuild). Em desenvolvimento e nos testes não há versão
   (currentBuild() === '') e nada se manda. */
export function assetsInUse(perf = globalThis.performance) {
  try {
    return (perf?.getEntriesByType?.('resource') || [])
      .map((e) => e.name)
      .filter((n) => typeof n === 'string' && /\/assets\//.test(n));
  } catch {
    return [];
  }
}

export async function announceBuildToServiceWorker({
  build = currentBuild(),
  sw = globalThis.navigator?.serviceWorker,
  perf = globalThis.performance,
} = {}) {
  if (!build || !sw) return false;
  try {
    const reg = await sw.ready;
    const target = sw.controller || reg?.active;
    if (!target) return false;
    target.postMessage({ type: 'app-build', build, inUse: assetsInUse(perf) });
    return true;
  } catch {
    return false;
  }
}
