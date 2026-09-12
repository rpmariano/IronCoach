import { useEffect, useRef, useState } from 'react';
import { fmtNumber } from './dashboardVerdicts';
import { DUR_COUNT } from './introAnimations';

/**
 * "Números que contam" — animação 2 de `design/IronCoach - Animacoes.dc.html`:
 * «Prontidão, dias para a prova, KPIs dos dashboards. Só à primeira leitura
 * do ecrã — quando o atleta volta atrás, o número já está lá. Contar de novo
 * a cada visita cansa.» 1400 ms, tabular-nums para não saltar.
 *
 * A contagem é o único valor que muda a cada frame — sai daqui, não do CSS
 * (é o que o próprio ficheiro de animações diz no seu script).
 */

/**
 * Avalia uma cubic-bezier CSS em JS. `--ease-back` (.22,1,.36,1) é a curva
 * que os tokens dão à contagem; sem isto ficaria uma aproximação à mão.
 * Newton-Raphson com queda para bissecção, como o próprio motor do browser.
 */
export function cubicBezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a;
  const B = (a, b) => 3 * b - 6 * a;
  const C = (a) => 3 * a;
  const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const d = slope(t, x1, x2);
      if (d === 0) break;
      const err = calc(t, x1, x2) - x;
      if (Math.abs(err) < 1e-5) break;
      t -= err / d;
    }
    // Se Newton saiu do intervalo, fecha à bruta.
    if (t < 0 || t > 1) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 20; i += 1) {
        const v = calc(t, x1, x2);
        if (Math.abs(v - x) < 1e-5) break;
        if (v > x) hi = t; else lo = t;
        t = (lo + hi) / 2;
      }
    }
    return calc(t, y1, y2);
  };
}

/** `--ease-back`: cubic-bezier(.22, 1, .36, 1). */
export const easeBack = cubicBezier(0.22, 1, 0.36, 1);

/**
 * Conta de 0 até `target` em `duration` ms com requestAnimationFrame.
 *
 * @param target   número de destino (não-número ⇒ devolve-se tal e qual)
 * @param options.animate   false (por omissão) mostra já o destino — é o
 *                          comportamento fora da primeira entrada da sessão
 *                          e com `prefers-reduced-motion`
 * @param options.duration  ms (por omissão --dur-count, 1400)
 * @returns o valor NUMÉRICO corrente (formatar com `useCountUpText` ou à mão)
 */
export function useCountUp(target, { animate = false, duration = DUR_COUNT } = {}) {
  const numeric = Number(target);
  const finite = Number.isFinite(numeric);
  // O destino é o estado inicial: sem animação (ou sem rAF, como no jsdom dos
  // testes) o número aparece logo no sítio, que é o que se quer.
  const [value, setValue] = useState(finite ? numeric : 0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!finite) return undefined;
    if (!animate || duration <= 0 || typeof requestAnimationFrame !== 'function') {
      setValue(numeric);
      return undefined;
    }

    let start = null;
    const tick = (now) => {
      if (start === null) start = now;
      const p = Math.min(1, (now - start) / duration);
      setValue(numeric * easeBack(p));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setValue(numeric); // fecha exatamente no destino, sem resto de vírgula
      }
    };
    setValue(0);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [numeric, finite, animate, duration]);

  return finite ? value : target;
}

/**
 * O que se RENDERIZA enquanto conta.
 *
 * Os frames intermédios saem formatados em português pelo `fmtNumber` dos
 * dashboards (vírgula decimal, espaço de milhar), com `decimals` fixo para o
 * número não mudar de largura a meio da contagem. O valor FINAL é o `display`
 * que o ecrã já mostrava — assim a contagem nunca reescreve a formatação que
 * cada gráfico/cartão escolheu (um pace "5:41", um alvo "/ 2400").
 */
export function useCountUpDisplay(target, { animate = false, duration = DUR_COUNT, decimals = 0, display } = {}) {
  const numeric = Number(target);
  const finite = Number.isFinite(numeric) && typeof target !== 'boolean' && target !== null && target !== '';
  const current = useCountUp(finite ? numeric : NaN, { animate: animate && finite, duration });
  const final = display !== undefined ? display : target;
  if (!finite || current === numeric) return final;
  return fmtNumber(current, decimals);
}

/** Igual, mas sempre formatado com `fmtNumber` (para números "crus"). */
export function useCountUpText(target, { animate = false, duration = DUR_COUNT, decimals = 0 } = {}) {
  const numeric = Number(target);
  const finite = Number.isFinite(numeric) && target !== null && target !== '';
  return useCountUpDisplay(target, { animate, duration, decimals, display: finite ? fmtNumber(numeric, decimals) : target });
}

export default useCountUp;
