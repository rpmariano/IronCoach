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
 * - e com `scrollLeft` alinhado à página (|scrollLeft − idx·largura| ≤ 1 px);
 * - `scrollend` assenta logo, quando o browser o tem; o debounce de 120 ms
 *   fica sempre como rede (o iOS antigo não tem `scrollend`, e às vezes não
 *   dispara).
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
/** Folga para o `scrollLeft` fracionário dos ecrãs de alta densidade. */
export const SETTLE_TOLERANCE_PX = 1;

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

/** A página em que o carrossel está ALINHADO, ou −1 se está entre duas. */
export function alignedPageIndex(el, pageCount = Infinity) {
  const width = el?.offsetWidth;
  if (!(width > 0)) return -1;
  const left = el.scrollLeft || 0;
  const idx = Math.round(left / width);
  if (idx < 0 || idx >= pageCount) return -1;
  return Math.abs(left - idx * width) <= SETTLE_TOLERANCE_PX ? idx : -1;
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

  const clear = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
  const settle = () => {
    clear();
    if (touching) return;
    const idx = alignedPageIndex(el, pageCount);
    if (idx >= 0) setSettledIndex(idx);
  };
  const settleLater = () => {
    clear();
    timer = setTimeout(settle, SETTLE_DEBOUNCE_MS);
  };
  const onScroll = () => {
    // Desalinhado = a meio de um deslize ou de um salto da SubNav: nenhuma
    // página está assente (as intermédias de um salto nunca chegam a estar).
    if (alignedPageIndex(el, pageCount) < 0) setSettledIndex(-1);
    settleLater();
  };
  const onDown = () => { touching = true; clear(); };
  const onUp = (e) => {
    if (e?.touches?.length) return; // ainda há dedos no ecrã
    touching = false;
    settleLater();
  };

  // Toque: os eventos de toque, onde existem. Os de ponteiro só quando não
  // há toque — no Android o browser cancela o `pointer` (pointercancel) assim
  // que o scroll pega, com o dedo ainda pousado.
  const hasTouch = typeof window !== 'undefined' && 'ontouchstart' in window;
  const onPointerDown = (e) => { if (e.pointerType && e.pointerType !== 'mouse') onDown(); };
  const onPointerUp = (e) => { if (e.pointerType && e.pointerType !== 'mouse') onUp(); };
  const downEvents = hasTouch ? ['touchstart'] : ['touchstart', 'pointerdown'];
  const upEvents = hasTouch ? ['touchend', 'touchcancel'] : ['touchend', 'touchcancel', 'pointerup', 'pointercancel'];
  const handlerFor = (type) => (type.startsWith('pointer') ? (type === 'pointerdown' ? onPointerDown : onPointerUp) : (type === 'touchstart' ? onDown : onUp));

  el.addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('scrollend', settle);
  downEvents.forEach((t) => el.addEventListener(t, handlerFor(t), { passive: true }));
  upEvents.forEach((t) => el.addEventListener(t, handlerFor(t), { passive: true }));

  return () => {
    clear();
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
