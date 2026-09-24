import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './coachBubbles';

/* O logo, quando entra, vai até ao fim (pedido de produto 2026-09-24).

   O brasão desenha-se a traço (shared/LogoLoader, regras .logo-loader-* em
   globals.css) e, no arranque, o nome e o "AI-POWERED" entram por baixo.
   Até aqui o desenho era interrompido sempre que os dados ou o ecrã
   chegavam primeiro: a app saltava para o Início com o brasão a meio. As
   regras passam a ser:

   - no arranque, o ecrã do logo fica até o desenho completo acabar
     (LOGO_INTRO_MS), mesmo que os dados já tenham chegado;
   - no carregamento de um ecrã, o logo só aparece se a espera passar de
     SKELETON_DELAY_MS — um chunk em cache não mostra logo nenhum — e, se
     aparecer, o ecrã espera que o brasão acabe (LOGO_DRAW_MS).

   Com movimento reduzido o logo aparece já desenhado: não há desenho para
   esperar, e nada fica retido. */

/** Brasão desenhado, cheio e com o impulso final (logoPop acaba aos 2000 ms). */
export const LOGO_DRAW_MS = 2000;
/** O arranque inteiro: brasão, nome (1500 ms + 520) e "AI-POWERED"
 *  (1750 ms + 520), com um instante para se ler. */
export const LOGO_INTRO_MS = 2450;
/** Abaixo disto o ecrã chegou depressa: o logo nem aparece. */
export const SKELETON_DELAY_MS = 250;

export function logoIntroMs() {
  return prefersReducedMotion() ? 0 : LOGO_INTRO_MS;
}

/**
 * Verdadeiro enquanto `active` o for e, depois disso, até terem passado
 * `minMs` desde que ficou ativo. É o que segura o ecrã do logo: os dados
 * podem chegar a meio do desenho, o ecrã só sai quando o desenho acaba.
 */
export function useHeldWhile(active, minMs) {
  const startRef = useRef(active ? Date.now() : null);
  const [held, setHeld] = useState(active);

  useEffect(() => {
    if (active) {
      if (startRef.current == null) startRef.current = Date.now();
      setHeld(true);
      return undefined;
    }
    if (startRef.current == null) {
      setHeld(false);
      return undefined;
    }
    const left = startRef.current + minMs - Date.now();
    if (left <= 0) {
      startRef.current = null;
      setHeld(false);
      return undefined;
    }
    const t = setTimeout(() => {
      startRef.current = null;
      setHeld(false);
    }, left);
    return () => clearTimeout(t);
  }, [active, minMs]);

  return active || held;
}

/**
 * Embrulha a fábrica de um React.lazy: se o ecrã demorar o suficiente para o
 * logo aparecer (SKELETON_DELAY_MS), a promessa só resolve quando o brasão
 * acabar de se desenhar. Rápido, resolve logo — e o logo nunca apareceu.
 */
export function holdForLogo(load, { now = () => Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  return () => {
    const t0 = now();
    return load().then((mod) => {
      if (prefersReducedMotion()) return mod;
      const elapsed = now() - t0;
      if (elapsed <= SKELETON_DELAY_MS) return mod;
      const left = SKELETON_DELAY_MS + LOGO_DRAW_MS - elapsed;
      return left > 0 ? wait(left).then(() => mod) : mod;
    });
  };
}
