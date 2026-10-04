import { useSyncExternalStore } from 'react';
import { todayISO } from '../lib/utils';

/**
 * "Hoje" reativo (2026-10-04). Um ecrã aberto de um dia para o outro ficava
 * com os períodos do dia anterior (o "hoje" fechava-se mal). Aqui um ÚNICO
 * temporizador partilhado (store externo) acorda à meia-noite local e
 * reavalia também no regresso à app (visibilitychange), que é quando o
 * telemóvel suspendeu o temporizador. O snapshot é a própria data, por isso
 * só há re-render quando o dia muda de facto.
 */
const listeners = new Set();
let timer = null;

function msToMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
  return Math.max(1000, next.getTime() - now.getTime());
}

function notify() {
  listeners.forEach((l) => l());
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    notify();
    schedule();
  }, msToMidnight());
}

function onVisibility() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  notify();
  schedule(); // o temporizador pode ter derivado enquanto estava suspenso
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    schedule();
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(timer);
      timer = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}

export function useTodayISO() {
  return useSyncExternalStore(subscribe, todayISO, todayISO);
}

export default useTodayISO;
