import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

/**
 * "Separador assente" do carrossel da Evolução (2026-10-04, F5 — animação ao
 * ficar visível, plano §2.1).
 *
 * Os gráficos mexem quando o atleta os VÊ: separador parado + gráfico no
 * ecrã + dados prontos. O `activeTab` do store não serve de gatilho — muda a
 * meio do gesto, quando a página passa os 50 % (haptics.js), e antes de o
 * scroll suave da SubNav chegar ao destino. Este módulo diz qual é a página
 * em que o carrossel ASSENTOU:
 * - só sem toque ativo (o dedo parado a meio do deslize não gera eventos de
 *   scroll, e um debounce sozinho dava como assente uma página meio à vista);
 * - e com `scrollLeft` alinhado à página (|scrollLeft − idx·largura| ≤ folga,
 *   com a largura FRACIONÁRIA e uma folga relativa — 2026-10-05, A1);
 * - `scrollend` assenta logo, quando o browser o tem; o debounce de 120 ms
 *   fica sempre como rede (o iOS antigo não tem `scrollend`, e às vezes não
 *   dispara);
 * - e, por cima de tudo, a rede de segurança de SETTLE_SAFETY_MS: parado sem
 *   página assente → a mais próxima (2026-10-05).
 * Um toque ou um scroll VERTICAL não desfazem o assentamento: só o scroll
 * horizontal desalinhado o desfaz. Senão arrastar a página para baixo com o
 * dedo pousado atrasava os gráficos que entram por baixo (e podia rearmá-los).
 *
 * É um store externo pequeno (useSyncExternalStore) e não estado do
 * Dashboard nem do zustand: cada consumidor lê um BOOLEANO da sua página
 * (`settledIndex === i`), por isso um assentamento só redesenha os hooks das
 * duas páginas que mudaram — nunca os cinco separadores.
 *
 * Fora do carrossel da Evolução não há `TabPageContext` (o valor é `null`) e
 * tudo conta como sempre assente: os usos do `useRevealAnimation` no Início e
 * no Perfil não mudam.
 */

/** Sem scroll durante isto (e sem toque), o carrossel conta como parado. */
export const SETTLE_DEBOUNCE_MS = 120;
/** Folga mínima para o `scrollLeft` fracionário dos ecrãs de alta densidade. */
export const SETTLE_TOLERANCE_PX = 1;
/** Folga relativa à largura da página (2026-10-05, A1): com zoom do browser
 *  ou aA do Safari o `scrollLeft` vem arredondado a píxeis do dispositivo e a
 *  posição do snap é calculada em subpíxeis — 1 px fixo não chega em todas as
 *  densidades. 1 % (≈ 3,8 px numa página de 379 px) continua a ser "parado na
 *  página" para quem olha. */
export const SETTLE_TOLERANCE_RATIO = 0.01;
/** Rede de segurança (2026-10-05, A1): sem scroll nem toque durante isto e
 *  ainda nenhuma página assente → assenta na mais próxima. Um gráfico nunca
 *  pode ficar invisível para sempre por uma conta de alinhamento que falhou. */
export const SETTLE_SAFETY_MS = 600;

/** O índice da página do carrossel em que o componente vive; `null` fora dele. */
export const TabPageContext = createContext(null);
/** Os dados do separador desta página já chegaram (sliceReady por fatia, não o
 *  `dataPending` global, que pode esperar 45 s por uma fatia que nada tem a
 *  ver)? Fora do carrossel conta como pronto. */
export const TabReadyContext = createContext(true);

let settledIndex = -1;
// A última página assente, que sobrevive ao −1 de um gesto em curso: é a que
// manda na altura do carrossel (só muda quando assenta noutra).
let lastSettledIndex = -1;
const listeners = new Set();

function emit() {
  // Cópia: um ouvinte pode cancelar-se (ou cancelar outro) durante a volta.
  [...listeners].forEach((l) => l());
}

export function getSettledIndex() { return settledIndex; }
export function getLastSettledIndex() { return lastSettledIndex; }

/** Marca a página assente; `-1` (ou qualquer valor inválido) = nenhuma, a meio
 *  de um gesto ou de um scroll programático. */
export function setSettledIndex(i) {
  const next = Number.isInteger(i) && i >= 0 ? i : -1;
  if (next === settledIndex) return;
  settledIndex = next;
  if (next >= 0) lastSettledIndex = next;
  emit();
}

export function subscribeSettled(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** O índice da página em que o componente vive (`null` fora do carrossel). */
export function useTabPage() {
  return useContext(TabPageContext);
}

/** A página deste componente está assente? Booleano por página, para não
 *  redesenhar as outras. Sem `TabPageContext`, sempre `true`. */
export function useTabSettled() {
  const page = useContext(TabPageContext);
  const snap = () => page == null || settledIndex === page;
  return useSyncExternalStore(subscribeSettled, snap, snap);
}

/** A página deste componente é a assente ou uma vizinha (a ±`range`)? É o
 *  critério da pré-criação dos gráficos em tempo morto. Sem contexto: `false`. */
export function useTabNearSettled(range = 1) {
  const page = useContext(TabPageContext);
  const snap = () => page != null && settledIndex >= 0 && Math.abs(settledIndex - page) <= range;
  return useSyncExternalStore(subscribeSettled, snap, snap);
}

/** A última página assente (−1 antes da primeira). */
export function useLastSettledIndex() {
  return useSyncExternalStore(subscribeSettled, getLastSettledIndex, getLastSettledIndex);
}

/**
 * A largura REAL de uma página do carrossel, com casas decimais.
 *
 * 2026-10-05 (A1, P0 — "gráficos que não carregam"): era `offsetWidth`, que o
 * browser arredonda a inteiro. Num Pixel (411,43 px de ecrã → carrossel de
 * 379,43 px) ou com o zoom do Chrome/aA do Safari, o snap pára em
 * `idx × 379,43` e a conta com 379 errava 0,43 px por página: no Corpo
 * (índice 4) já eram 1,7 px, a página nunca contava como assente e o canvas
 * nunca montava. `getBoundingClientRect()` dá a largura fracionária; no jsdom
 * (sem layout, rect a 0) cai no `offsetWidth` que os testes simulam.
 */
export function carouselPageWidth(el) {
  if (!el) return 0;
  let width = 0;
  try {
    width = el.getBoundingClientRect?.().width || 0;
  } catch {
    width = 0;
  }
  if (!(width > 0)) width = el.offsetWidth || 0;
  return width > 0 ? width : 0;
}

/** A folga do alinhamento para uma página desta largura (ver SETTLE_TOLERANCE_RATIO). */
export function settleTolerance(width) {
  return Math.max(SETTLE_TOLERANCE_PX, (width || 0) * SETTLE_TOLERANCE_RATIO);
}

/** A página mais próxima da posição atual (−1 sem largura). É a da rede de
 *  segurança: a que tem mais de metade à vista. */
export function nearestPageIndex(el, pageCount = Infinity) {
  const width = carouselPageWidth(el);
  if (!(width > 0)) return -1;
  const idx = Math.round((el.scrollLeft || 0) / width);
  const last = Number.isFinite(pageCount) ? pageCount - 1 : idx;
  return Math.max(0, Math.min(last, idx));
}

/** A página em que o carrossel está ALINHADO, ou −1 se está entre duas. */
export function alignedPageIndex(el, pageCount = Infinity) {
  const width = carouselPageWidth(el);
  if (!(width > 0)) return -1;
  const left = el.scrollLeft || 0;
  const idx = Math.round(left / width);
  if (idx < 0 || idx >= pageCount) return -1;
  return Math.abs(left - idx * width) <= settleTolerance(width) ? idx : -1;
}

/**
 * Liga o sinal ao elemento do carrossel (`.tab-swipe-carousel`). Devolve a
 * função que desliga. Sem React, para se poder testar com `scrollLeft` e
 * `offsetWidth` simulados.
 */
export function trackSettledTab(el, { pageCount = Infinity } = {}) {
  if (!el || typeof el.addEventListener !== 'function') return () => {};
  let touching = false;
  let timer = null;
  let safety = null;
  let untrackTarget = null;

  const clear = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
  const clearSafety = () => {
    if (safety !== null) { clearTimeout(safety); safety = null; }
  };
  const settle = () => {
    clear();
    if (touching) return;
    const idx = alignedPageIndex(el, pageCount);
    if (idx >= 0) setSettledIndex(idx);
  };
  /* Rede de segurança (2026-10-05, A1): passados SETTLE_SAFETY_MS sem scroll
     nem toque, se ainda nenhuma página está assente (um alinhamento que a
     conta não reconheceu — outra densidade, outro zoom, um snap que parou a
     2 px), assenta na página mais próxima. Com o dedo pousado não: é o gesto
     a meio, e o `touchend` volta a armar esta rede. */
  const safetyNet = () => {
    safety = null;
    if (touching || settledIndex >= 0) return;
    const idx = nearestPageIndex(el, pageCount);
    if (idx >= 0) setSettledIndex(idx);
  };
  const armSafety = () => {
    clearSafety();
    safety = setTimeout(safetyNet, SETTLE_SAFETY_MS);
  };
  const settleLater = () => {
    clear();
    timer = setTimeout(settle, SETTLE_DEBOUNCE_MS);
    armSafety();
  };
  const onScroll = () => {
    // Desalinhado = a meio de um deslize ou de um salto da SubNav: nenhuma
    // página está assente (as intermédias de um salto nunca chegam a estar).
    if (alignedPageIndex(el, pageCount) < 0) setSettledIndex(-1);
    settleLater();
  };
  const onUp = (e) => {
    if (e?.touches?.length) return; // ainda há dedos no ecrã
    untrackTarget?.();
    untrackTarget = null;
    touching = false;
    settleLater();
  };
  /* 2026-10-05 (A6): o `touchend` vai para o elemento onde o toque COMEÇOU.
     Se esse elemento sair do DOM a meio do gesto (um separador que troca o
     "ainda sem dados" pelos gráficos quando a fatia chega), o evento fica
     nesse nó desligado e não borbulha até ao carrossel — o `touching` ficava
     preso e nada assentava até ao toque seguinte. Escuta-se também no próprio
     alvo; só conta lá quando ele já não está dentro do carrossel (senão o
     carrossel recebe-o na mesma e contava duas vezes). */
  const trackTarget = (target) => {
    untrackTarget?.();
    untrackTarget = null;
    if (!target || target === el || typeof target.addEventListener !== 'function') return;
    const onTargetUp = (e) => {
      if (typeof el.contains === 'function' && el.contains(target)) return;
      onUp(e);
    };
    const types = ['touchend', 'touchcancel', 'pointerup', 'pointercancel'];
    types.forEach((t) => target.addEventListener(t, onTargetUp, { passive: true }));
    untrackTarget = () => types.forEach((t) => target.removeEventListener(t, onTargetUp));
  };
  const onDown = (e) => {
    touching = true;
    clear();
    clearSafety();
    trackTarget(e?.target);
  };

  // Toque: os eventos de toque, onde existem. Os de ponteiro só quando não
  // há toque — no Android o browser cancela o `pointer` (pointercancel) assim
  // que o scroll pega, com o dedo ainda pousado.
  const hasTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
  const onPointerDown = (e) => { if (e.pointerType && e.pointerType !== 'mouse') onDown(e); };
  const onPointerUp = (e) => { if (e.pointerType && e.pointerType !== 'mouse') onUp(); };
  const downEvents = hasTouch ? ['touchstart'] : ['touchstart', 'pointerdown'];
  const upEvents = hasTouch ? ['touchend', 'touchcancel'] : ['touchend', 'touchcancel', 'pointerup', 'pointercancel'];
  const handlerFor = (type) => (type.startsWith('pointer') ? (type === 'pointerdown' ? onPointerDown : onPointerUp) : (type === 'touchstart' ? onDown : onUp));

  el.addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('scrollend', settle);
  downEvents.forEach((t) => el.addEventListener(t, handlerFor(t), { passive: true }));
  upEvents.forEach((t) => el.addEventListener(t, handlerFor(t), { passive: true }));
  // Também à entrada: se nada assentar sozinho (nem o salto inicial do
  // Dashboard), a rede assenta na página onde o carrossel está.
  armSafety();

  return () => {
    clear();
    clearSafety();
    untrackTarget?.();
    untrackTarget = null;
    el.removeEventListener('scroll', onScroll);
    el.removeEventListener('scrollend', settle);
    downEvents.forEach((t) => el.removeEventListener(t, handlerFor(t)));
    upEvents.forEach((t) => el.removeEventListener(t, handlerFor(t)));
  };
}

/** `trackSettledTab` ligado ao `ref` do carrossel durante a vida do componente. */
export function useSettledTabTracker(scrollRef, pageCount) {
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    return trackSettledTab(el, { pageCount });
  }, [scrollRef, pageCount]);
}

/* ── Tempo morto, um trabalho de cada vez ─────────────────────────────────
   Criar um gráfico do Chart.js é o que mais custa à entrada. O gráfico à
   vista cria-se quando o separador assenta; os das páginas vizinhas (e os
   logo abaixo da dobra) pré-criam-se aqui, um por tempo morto (≈ um por
   frame), já no estado zero — para que, ao deslizar para lá, o reveal seja só
   um `update()`. Parado a meio de um gesto (nenhuma página assente), espera
   que o carrossel assente: não se rouba frames ao deslize. */
const idleQueue = [];
let idleCancel = null;
let waitingSettle = null;

function runWhenIdle(fn) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 500 });
    return () => window.cancelIdleCallback?.(id);
  }
  // Safari/iOS não tem requestIdleCallback: dois frames de folga.
  const id = setTimeout(fn, 32);
  return () => clearTimeout(id);
}

function pump() {
  if (idleCancel || waitingSettle || idleQueue.length === 0) return;
  if (settledIndex < 0) {
    waitingSettle = subscribeSettled(() => {
      if (settledIndex < 0) return;
      waitingSettle?.();
      waitingSettle = null;
      pump();
    });
    return;
  }
  idleCancel = runWhenIdle(() => {
    idleCancel = null;
    if (settledIndex >= 0) {
      const job = idleQueue.shift();
      if (job && !job.cancelled && Math.abs(settledIndex - job.page) <= job.range) job.run();
    }
    pump();
  });
}

/**
 * Corre `run` em tempo morto, com o carrossel assente e a página `page` a
 * ±`range` da assente (verificado outra vez na hora: o atleta pode ter
 * deslizado entretanto). Devolve a função que cancela.
 */
export function scheduleWhenSettled(page, run, range = 1) {
  const job = { page, run, range, cancelled: false };
  idleQueue.push(job);
  pump();
  return () => {
    job.cancelled = true;
    const i = idleQueue.indexOf(job);
    if (i >= 0) idleQueue.splice(i, 1);
  };
}

/** Esquece tudo: nenhuma página assente, fila vazia. Para os testes (estado de
 *  módulo que passaria de um teste para o seguinte) e para quando o Dashboard
 *  desmonta (a próxima entrada começa do zero, sem a altura da anterior). */
export function resetSettledTab() {
  idleQueue.length = 0;
  idleCancel?.();
  idleCancel = null;
  waitingSettle?.();
  waitingSettle = null;
  const changed = settledIndex !== -1 || lastSettledIndex !== -1;
  settledIndex = -1;
  lastSettledIndex = -1;
  if (changed) emit();
}
