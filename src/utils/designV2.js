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
  const onStorage = (e) => { if (!e || e.key === null || e.key === DESIGN_V2_KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Ouve a mudança feita noutro separador (o evento 'storage') e re-aplica a classe no <html>,
 *  mesmo sem nenhum componente com useDesignV2 montado. Corre uma vez, no main.jsx. */
export function watchDesignV2Storage() {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e) => { if (!e || e.key === null || e.key === DESIGN_V2_KEY) applyDesignV2Class(); };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/* Só um admin pode ter o v2 (revisão de 2026-11-25): num telemóvel partilhado, um atleta nunca o
   vê. A flag apaga-se ao sair da conta (a sessão passa de alguém a ninguém) e quando o perfil
   carregado não é de admin. Antes de o perfil chegar não se decide nada: no arranque a sessão
   ainda é null e apagar ali tirava o v2 ao próprio admin. E só decide com uma leitura completa do
   perfil — a linha da BD traz `is_admin` (boolean); os sets parciais do perfil (o onboarding, as
   intervenções da Carol) podem nascer sem ele, e com um isAdmin ainda por ler apagavam a flag do
   admin (revisão de 2026-11-25). */
export function enforceDesignV2Access(store) {
  if (!store?.subscribe) return () => {};
  let prevSession = store.getState?.().session || null;
  return store.subscribe((s) => {
    const session = s.session || null;
    if (prevSession && !session) {
      if (isDesignV2()) setDesignV2(false);
    } else if (s.profile && typeof s.profile.is_admin === 'boolean' && s.profile.is_admin === false && !s.isAdmin && isDesignV2()) {
      setDesignV2(false);
    }
    prevSession = session;
  });
}

/** O interruptor como hook: troca sem recarregar quando o admin o muda. */
export function useDesignV2() {
  return useSyncExternalStore(subscribe, isDesignV2, () => false);
}
