import { useSyncExternalStore } from 'react';

/* O Design v2 (direção C · Painel, aprovado pelo Rui, 2026-11-24): um ensaio do design novo que o
   Rui testa em produção sem mudar nada para os atletas. É um interruptor LOCAL, por dispositivo —
   localStorage 'ironcoach.designV2' = '1' — que só um admin vê (Admin › Funcionalidades). Desligado
   (o defeito), a app fica exatamente como está: sem a classe no <html>, os componentes escolhem
   a variante de sempre.

   Ligado: a classe `design-v2` no <html> ativa os tokens de src/styles/v2.css, e o Início e o hub
   da prova trocam para os componentes V2 (HomeV2, RaceHubV2). */

export const DESIGN_V2_KEY = 'ironcoach.designV2';
export const DESIGN_V2_CLASS = 'design-v2';
const EVENT = 'ironcoach:design-v2';

export function isDesignV2() {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(DESIGN_V2_KEY) === '1';
  } catch {
    return false;
  }
}

/** Põe ou tira a classe no <html>. Síncrono e barato: corre no main.jsx antes do primeiro render. */
export function applyDesignV2Class(on = isDesignV2()) {
  try {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle(DESIGN_V2_CLASS, !!on);
  } catch { /* sem DOM, nada a fazer */ }
}

export function setDesignV2(on) {
  try {
    if (on) window.localStorage.setItem(DESIGN_V2_KEY, '1');
    else window.localStorage.removeItem(DESIGN_V2_KEY);
  } catch { /* armazenamento bloqueado: fica o que estava */ }
  applyDesignV2Class();
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* idem */ }
}

function subscribe(cb) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e) => { if (!e || e.key === null || e.key === DESIGN_V2_KEY) { applyDesignV2Class(); cb(); } };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** O interruptor como hook: troca sem recarregar quando o admin o muda. */
export function useDesignV2() {
  return useSyncExternalStore(subscribe, isDesignV2, () => false);
}
