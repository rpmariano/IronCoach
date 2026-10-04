import { useAppStore, sliceReady, EVOLUTION_TAB_SLICES } from '../index';
import { usePeriodStore, selectTabPeriod, PERIOD_TABS } from '../periodStore';
import { todayISO as localTodayISO } from '../../lib/utils';
import { getEvolutionViewDef, registeredEvolutionTabs } from './registry';
import {
  getEvolutionView, hasFingerprint, isEvolutionViewCached, primeFingerprints, depsMayMatch, evolutionEntryDeps,
} from './cache';

/**
 * Preparação das vistas da Evolução em tempo morto (2026-10-04, F6 / plano
 * §2.2, R10 "dados prontos antes de entrar").
 *
 * Depois de as fatias de cada separador chegarem (sliceReady), calcula as
 * vistas registadas e deixa-as na cache, para que entrar num separador seja
 * só ler (useEvolutionView). Regras, todas para não roubar fluidez:
 * - só em requestIdleCallback (sem ele, setTimeout com atraso maior e uma
 *   "fatia" fictícia de FALLBACK_BUDGET_MS);
 * - UM separador por fatia de tempo morto, e só se `timeRemaining()` der
 *   pelo menos MIN_IDLE_MS (ou o browser já tiver forçado a chamada);
 * - pausa enquanto houver toque, ponteiro em baixo ou scroll recente — o
 *   deslize entre separadores é exatamente quando não se pode calcular;
 * - ordem: o último separador aberto → Geral (hub) → o resto; primeiro o
 *   período escolhido de cada um, depois o anterior (para os ▲/▼);
 * - depois de cada seta ‹ ›, os períodos vizinhos desse separador passam à
 *   frente da fila;
 * - recalcula à mudança de dia (temporizador até à meia-noite + regresso à
 *   app), porque "hoje" entra na chave da cache;
 * - as impressões digitais (cache.js) calculam-se SÓ aqui, linha a linha,
 *   cedendo quando a fatia acaba (revisão 2026-10-04): antes de comparar
 *   uma entrada antiga com deps novos do mesmo tamanho, com o tempo que
 *   sobrar depois de cada vista, e numa tarefa de "primar" de menor
 *   prioridade para as entradas que o render fez sozinho (o render nunca
 *   as calcula).
 *
 * Este módulo chega por import() dentro de um callback de tempo morto
 * (App.jsx) — não faz crescer o chunk principal — e os módulos das vistas
 * (`./views/*.js`, fases 4–6) também, ao primeiro tempo morto. Nos testes não
 * arranca sozinho (App.jsx não o chama com MODE === 'test').
 */

export const MIN_IDLE_MS = 8;
export const IDLE_TIMEOUT_MS = 4000;
export const FALLBACK_DELAY_MS = 1500;
export const FALLBACK_BUDGET_MS = 10;
export const INTERACTION_QUIET_MS = 250;
// Quando o browser força a chamada (didTimeout) não há timeRemaining útil:
// a vista calcula-se na mesma, mas as impressões só até este orçamento.
export const FORCED_PRIME_BUDGET_MS = 10;
// Um touchend perdido (o browser cancela o gesto) não pode parar tudo.
const STUCK_TOUCH_MS = 10000;
const MAX_EXTRA_TASKS = 8;

const START_EVENTS = ['touchstart', 'pointerdown'];
const END_EVENTS = ['touchend', 'touchcancel', 'pointerup', 'pointercancel'];
const MOVE_EVENTS = ['scroll', 'wheel', 'touchmove'];

const defaultLoadViews = () => {
  const modules = import.meta.glob(['./views/*.js', '!./views/*.test.js', '!./views/*.spec.js']);
  return Promise.all(Object.values(modules).map((load) => load()));
};

function defaultNow() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function msToMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
  return Math.max(1000, next.getTime() - now.getTime());
}

const taskKey = (t) => `${t.tab}|${t.period.kind}|${t.period.offset}${t.prime ? '|primar' : ''}`;

/** "Último aberto → hub → resto", só com separadores que têm vista. */
export function prepareOrder(lastTab, tabs) {
  const out = [];
  const push = (t) => { if (tabs.includes(t) && !out.includes(t)) out.push(t); };
  push(lastTab);
  push('hub');
  for (const t of PERIOD_TABS) push(t);
  for (const t of tabs) push(t);
  return out;
}

/**
 * O motor, com tudo injetável para os testes. `startEvolutionPrepare()` usa
 * as omissões (store real, periodStore, requestIdleCallback global).
 */
export function createEvolutionPreparer({
  getState = () => useAppStore.getState(),
  subscribe = (fn) => useAppStore.subscribe(fn),
  getPeriods = () => usePeriodStore.getState(),
  subscribePeriods = (fn) => usePeriodStore.subscribe(fn),
  today = localTodayISO,
  loadViews = defaultLoadViews,
  target = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  now = defaultNow,
} = {}) {
  let stopped = true;
  let cancelIdle = null; // cancela o pedido de tempo morto em curso
  let viewsState = 'pending'; // 'pending' | 'loading' | 'ready'
  let queue = [];
  let extras = []; // vizinhos pedidos pelas setas, à frente da fila
  const failed = new Set(); // `key|hoje` de vistas cujo build rebentou
  let touchActiveSince = null;
  let lastActivity = -Infinity;
  let lastSignature = null;
  let lastPeriods = null;
  let lastToday = null;
  let midnightTimer = null;
  const unsubs = [];

  // ── toque / scroll ─────────────────────────────────────────────────────
  const onStart = () => { touchActiveSince = now(); lastActivity = now(); };
  const onEnd = () => { touchActiveSince = null; lastActivity = now(); };
  const onMove = () => { lastActivity = now(); };

  function interacting() {
    const t = now();
    if (touchActiveSince !== null && t - touchActiveSince < STUCK_TOUCH_MS) return true;
    return t - lastActivity < INTERACTION_QUIET_MS;
  }

  // ── tempo morto ────────────────────────────────────────────────────────
  function requestIdle(cb) {
    // Lido a cada pedido (os testes trocam-no com vi.stubGlobal) e chamado
    // como método: solto, o Chrome atira "Illegal invocation".
    if (typeof globalThis.requestIdleCallback === 'function') {
      const id = globalThis.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });
      return () => { if (typeof globalThis.cancelIdleCallback === 'function') globalThis.cancelIdleCallback(id); };
    }
    // Sem requestIdleCallback (Safari): espera mais e dá uma fatia curta.
    const id = setTimeout(() => {
      const start = now();
      cb({ didTimeout: false, timeRemaining: () => Math.max(0, FALLBACK_BUDGET_MS - (now() - start)) });
    }, FALLBACK_DELAY_MS);
    return () => clearTimeout(id);
  }

  function schedule() {
    if (stopped || cancelIdle) return;
    cancelIdle = requestIdle(onIdle);
  }

  // ── a fila ─────────────────────────────────────────────────────────────
  function tabsWithViews() {
    return registeredEvolutionTabs();
  }

  function periodOf(tab, periods = getPeriods()) {
    const p = selectTabPeriod(tab)(periods);
    return { kind: p.kind, offset: p.offset || 0 };
  }

  function depsOf(tab, state) {
    const def = getEvolutionViewDef(tab);
    if (!def) return null;
    try { return def.deps(state); } catch { return null; }
  }

  function readyFor(tab, state) {
    const def = getEvolutionViewDef(tab);
    const slices = def?.slices || EVOLUTION_TAB_SLICES[tab] || [];
    return sliceReady(state, slices);
  }

  /** Recalcula a fila do zero: barato (só lê referências), e evita guardar
   *  tarefas obsoletas quando os dados, o dia ou o período mudam. */
  function rebuildQueue() {
    const state = getState();
    const periods = getPeriods();
    const day = today();
    const tabs = tabsWithViews();
    const order = prepareOrder(state.lastDashboardTab, tabs);
    const wanted = [];
    for (const t of extras) wanted.push(t);
    for (const tab of order) wanted.push({ tab, period: periodOf(tab, periods) });
    for (const tab of order) {
      const p = periodOf(tab, periods);
      wanted.push({ tab, period: { kind: p.kind, offset: p.offset - 1 } });
    }
    const seen = new Set();
    const primeQueued = new Set(); // deps já cobertos por uma tarefa de primar
    const primes = [];
    queue = [];
    for (const t of wanted) {
      const k = taskKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!getEvolutionViewDef(t.tab) || failed.has(`${k}|${day}`)) continue;
      if (!readyFor(t.tab, state)) continue; // volta a entrar quando a fatia chegar
      const deps = depsOf(t.tab, state);
      if (!deps) continue;
      if (isEvolutionViewCached(t.tab, t.period, deps, day)) {
        // Feita no render (sem impressões): prima-as em tempo morto, no fim
        // da fila, para a próxima comparação já não as ter de calcular.
        const missing = deps.filter((d) => !hasFingerprint(d) && !primeQueued.has(d));
        if (missing.length) {
          missing.forEach((d) => primeQueued.add(d));
          primes.push({ ...t, prime: true });
        }
        continue;
      }
      queue.push(t);
    }
    queue.push(...primes);
    // Os vizinhos já feitos saem da lista de extras.
    extras = extras.filter((t) => queue.some((q) => taskKey(q) === taskKey(t)));
  }

  function onIdle(deadline) {
    cancelIdle = null;
    if (stopped) return;
    if (interacting()) { schedule(); return; }
    const forced = !!deadline?.didTimeout;
    const remaining = () => (deadline && typeof deadline.timeRemaining === 'function' ? deadline.timeRemaining() : 0);
    if (!forced && remaining() < MIN_IDLE_MS) { schedule(); return; }

    if (viewsState !== 'ready') {
      if (viewsState === 'pending') {
        viewsState = 'loading';
        Promise.resolve()
          .then(() => loadViews())
          .catch(() => {}) // uma vista que não carrega calcula-se no render, como hoje
          .finally(() => {
            viewsState = 'ready';
            if (!stopped) { rebuildQueue(); schedule(); }
          });
      }
      return;
    }

    if (lastToday !== today()) { lastToday = today(); rebuildQueue(); }
    const task = queue[0];
    if (!task) return; // nada a fazer: acorda com o store, as setas ou o dia

    const state = getState();
    const deps = depsOf(task.tab, state);
    const day = today();
    if (!deps || !readyFor(task.tab, state)) { queue.shift(); schedule(); return; }

    // Ceder a meio das impressões: quando a fatia acaba, ou — se o browser
    // forçou a chamada — ao fim de FORCED_PRIME_BUDGET_MS.
    const sliceStart = now();
    const shouldYield = forced
      ? () => now() - sliceStart >= FORCED_PRIME_BUDGET_MS
      : () => remaining() < 1;
    const finish = () => {
      queue.shift();
      extras = extras.filter((t) => taskKey(t) !== taskKey(task));
      if (queue.length) schedule();
    };

    if (task.prime || isEvolutionViewCached(task.tab, task.period, deps, day)) {
      // A vista já está (o render chegou primeiro): só falta primar.
      primeFingerprints(deps, shouldYield);
      if (!deps.every(hasFingerprint)) { schedule(); return; } // continua na próxima fatia
      finish();
      return;
    }

    // Há uma entrada antiga que PODE ter o mesmo conteúdo (mesmos tamanhos)?
    // Prima-se dos dois lados aqui, em tempo morto, para o acerto por
    // impressão; com tamanhos diferentes não vale a pena (falha certa).
    const old = evolutionEntryDeps(task.tab, task.period, day);
    if (old && depsMayMatch(old, deps)) {
      const both = [...deps, ...old];
      primeFingerprints(both, shouldYield);
      if (!both.every(hasFingerprint)) { schedule(); return; }
    }

    try {
      getEvolutionView(task.tab, task.period, deps, day);
    } catch (err) {
      failed.add(`${taskKey(task)}|${day}`);
      if (import.meta.env?.DEV) console.warn('[evolução] vista falhou na preparação', task.tab, err);
      finish();
      return;
    }
    // Com o tempo que sobrar, as impressões dos deps novos (para a próxima
    // comparação); o que faltar fica numa tarefa de primar no fim da fila.
    if (!forced && remaining() >= 1) primeFingerprints(deps, shouldYield);
    if (!deps.every(hasFingerprint) && !queue.some((q) => q.prime && taskKey(q) === taskKey({ ...task, prime: true }))) {
      queue.push({ tab: task.tab, period: task.period, prime: true });
    }
    finish();
  }

  // ── reações ────────────────────────────────────────────────────────────
  function signatureOf(state) {
    const sig = [state.lastDashboardTab, state.dataPending, state.loadedSlices];
    for (const tab of tabsWithViews()) {
      const deps = depsOf(tab, state);
      if (deps) sig.push(...deps);
    }
    return sig;
  }

  function sameSig(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function onStoreChange(state) {
    const sig = signatureOf(state);
    if (sameSig(sig, lastSignature)) return;
    lastSignature = sig;
    if (viewsState !== 'ready') { schedule(); return; }
    rebuildQueue();
    if (queue.length) schedule();
  }

  function onPeriodsChange(periods) {
    const prev = lastPeriods;
    lastPeriods = periods;
    for (const tab of tabsWithViews()) {
      const cur = periodOf(tab, periods);
      const old = prev ? periodOf(tab, prev) : null;
      if (old && old.kind === cur.kind && old.offset === cur.offset) continue;
      if (!old) continue;
      // Depois da seta: o período de antes e o de depois deste.
      const next = [{ tab, period: { kind: cur.kind, offset: cur.offset - 1 } }];
      if (cur.offset + 1 <= 0) next.push({ tab, period: { kind: cur.kind, offset: cur.offset + 1 } });
      extras = [...next, ...extras.filter((t) => !next.some((n) => taskKey(n) === taskKey(t)))].slice(0, MAX_EXTRA_TASKS);
    }
    if (viewsState !== 'ready') return;
    rebuildQueue();
    if (queue.length) schedule();
  }

  function checkDay() {
    if (stopped) return;
    if (today() !== lastToday) {
      lastToday = today();
      if (viewsState === 'ready') rebuildQueue();
      schedule();
    }
  }

  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => { checkDay(); scheduleMidnight(); }, msToMidnight());
  }

  const onVisibility = () => {
    if (doc && doc.visibilityState === 'hidden') return;
    checkDay();
    scheduleMidnight(); // o temporizador pode ter derivado com a app suspensa
  };

  function start() {
    if (!stopped) return stop;
    stopped = false;
    lastToday = today();
    lastPeriods = getPeriods();
    lastSignature = signatureOf(getState());
    unsubs.push(subscribe(onStoreChange));
    unsubs.push(subscribePeriods(onPeriodsChange));
    if (target?.addEventListener) {
      const opts = { capture: true, passive: true };
      for (const e of START_EVENTS) target.addEventListener(e, onStart, opts);
      for (const e of END_EVENTS) target.addEventListener(e, onEnd, opts);
      for (const e of MOVE_EVENTS) target.addEventListener(e, onMove, opts);
    }
    if (doc?.addEventListener) doc.addEventListener('visibilitychange', onVisibility);
    scheduleMidnight();
    schedule();
    return stop;
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (cancelIdle) { cancelIdle(); cancelIdle = null; }
    clearTimeout(midnightTimer);
    midnightTimer = null;
    while (unsubs.length) {
      try { unsubs.pop()(); } catch { /* já estava desligado */ }
    }
    if (target?.removeEventListener) {
      const opts = { capture: true };
      for (const e of START_EVENTS) target.removeEventListener(e, onStart, opts);
      for (const e of END_EVENTS) target.removeEventListener(e, onEnd, opts);
      for (const e of MOVE_EVENTS) target.removeEventListener(e, onMove, opts);
    }
    if (doc?.removeEventListener) doc.removeEventListener('visibilitychange', onVisibility);
    queue = [];
    extras = [];
  }

  return {
    start,
    stop,
    /** Para testes/diagnóstico: o que falta preparar, por ordem. */
    pending: () => queue.map(taskKey),
    isScheduled: () => !!cancelIdle,
  };
}

/** Arranca a preparação com o store real. Devolve a função que a para. */
export function startEvolutionPrepare(options) {
  return createEvolutionPreparer(options).start();
}
