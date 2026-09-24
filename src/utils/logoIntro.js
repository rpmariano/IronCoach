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
     aparecer, o ecrã espera que esse brasão acabe (LOGO_DRAW_MS).

   Com movimento reduzido o logo aparece já desenhado: não há desenho para
   esperar, e nada fica retido. */

/** Brasão desenhado, cheio e com o impulso final (logoPop acaba aos 2000 ms). */
export const LOGO_DRAW_MS = 2000;
/** O arranque inteiro: brasão, nome (1500 ms + 520) e "AI-POWERED"
 *  (1750 ms + 520), com um instante para se ler. Espelha os atrasos das
 *  regras .logo-loader-* em globals.css — mudar lá é mudar aqui. */
export const LOGO_INTRO_MS = 2450;
/** Abaixo disto o ecrã chegou depressa: o logo nem aparece. Tem de ficar
 *  acima dos 300 ms que o React 19 espera antes de trocar um fallback do
 *  Suspense pelo conteúdo (FALLBACK_THROTTLE_MS) — senão um ecrã que chega
 *  aos 250 ms era revelado aos 300, com o logo a acabar de entrar. */
export const SKELETON_DELAY_MS = 360;

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

/* ── Os logos de esqueleto que estão à vista ──────────────────────────────
   Cada esqueleto que chega a mostrar o brasão regista a hora a que ele
   apareceu, e apaga-a ao sair. O carregamento de um ecrã não adivinha
   quando o logo entrou: pergunta aqui. Assim, se o atleta sai de um
   separador a meio da espera e volta, conta o desenho novo, não o antigo. */
const visibleSince = new Map();
let nextId = 0;

/** Regista um brasão que acabou de ficar à vista. Devolve a função que o
 *  retira (ao desmontar). */
export function registerSkeletonLogo(now = Date.now()) {
  const id = ++nextId;
  visibleSince.set(id, now);
  return () => { visibleSince.delete(id); };
}

/** A hora a que entrou o brasão mais recente ainda à vista, ou null. */
export function skeletonLogoSince() {
  let latest = null;
  for (const t of visibleSince.values()) if (latest == null || t > latest) latest = t;
  return latest;
}

/**
 * Embrulha a fábrica de um React.lazy: quando o ecrã chega, se houver um
 * brasão de esqueleto à vista, a promessa só resolve quando ele acabar de se
 * desenhar — e volta a verificar, para o caso de ter entrado outro entretanto.
 * Sem logo à vista, resolve logo.
 */
export function holdForLogo(load, { now = () => Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  return () => load().then(async (mod) => {
    if (prefersReducedMotion()) return mod;
    for (;;) {
      const since = skeletonLogoSince();
      if (since == null) return mod;
      const left = since + LOGO_DRAW_MS - now();
      if (left <= 0) return mod;
      await wait(left);
    }
  });
}
