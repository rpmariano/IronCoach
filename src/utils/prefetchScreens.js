/* Pré-carrega os ecrãs em tempo morto, depois do arranque (relatado
   2026-09-24: "a app reinicia por vezes quando mudamos de menu").

   Cada separador vive num ficheiro próprio (code-splitting, App.jsx) que só
   se pede na primeira visita. Depois de uma publicação no GitHub Pages esses
   ficheiros deixam de existir: a primeira visita a um separador ainda não
   aberto nessa sessão falhava, e a app recarregava (retryOnce) — de volta ao
   logo de arranque. Com a rede lenta, a mesma primeira visita mostrava o
   brasão a desenhar-se ~2 s (o esqueleto do Suspense). Com os ecrãs já
   carregados, nem uma coisa nem outra.

   Um de cada vez, para não disputar a rede com o que o atleta está a fazer;
   os erros engolem-se (se o pedido a sério falhar, retryOnce trata dele);
   com a poupança de dados ligada, não se faz. Devolve a função que cancela. */
export function prefetchScreensWhenIdle(loaders, {
  delayMs = 4000,
  idle = runWhenIdle,
  saveData = prefersSavingData(),
} = {}) {
  if (saveData || !loaders?.length) return () => {};
  let cancelled = false;
  const timer = setTimeout(() => {
    idle(async () => {
      for (const load of loaders) {
        if (cancelled) return;
        try { await load(); } catch { /* fica para o pedido a sério */ }
      }
    });
  }, delayMs);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

function runWhenIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: 5000 });
  else setTimeout(fn, 0);
}

function prefersSavingData() {
  try { return !!globalThis.navigator?.connection?.saveData; } catch { return false; }
}
