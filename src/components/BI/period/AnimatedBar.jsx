import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRevealAnimation } from '../../../utils/useRevealAnimation';
import { getSettledIndex, useTabPage } from '../../../utils/settledTab';
import { STAGGER_BARS, STAGGER_BARS_MAX_SPAN } from '../../../utils/introAnimations';

/**
 * AnimatedBar — a barra horizontal do resumo do período e do cartão do dia
 * (2026-10-05). Até aqui estas barras tinham `width` fixa: ao entrar no
 * separador apareciam já cheias, ao mudar de período saltavam, e ao voltar ao
 * separador não repetiam (auditoria da revelação, A3) — enquanto os gráficos
 * por baixo cresciam. Passam a seguir a mesma regra dos gráficos:
 *
 *  - ENTRADA: dentro do carrossel da Evolução, a barra parte do zero e cresce
 *    quando o separador assenta E o cartão está à vista (useRevealAnimation em
 *    modo separador, como a Prontidão do Início). Escalonada entre linhas
 *    (STAGGER_BARS, com teto). Ao sair do separador e voltar (rearmar) repete.
 *  - MUDAR DE PERÍODO/DIA: a barra desliza do valor anterior para o novo em
 *    ~300 ms, sem voltar ao zero (o elemento é o mesmo, só muda o `scaleX`).
 *  - ENTRADA CALADA (D4): se o cartão MONTA com o separador já assente e já
 *    visto (Dia → Semana troca o cartão), nasce no valor final, sem crescer
 *    outra vez — ver `BarsEnteredContext`.
 *  - reduced-motion, ou fora do carrossel (sem IntersectionObserver): valor
 *    final logo, sem transição nenhuma.
 *
 * Cresce por `transform: scaleX` com origem à esquerda, não por `width`: as
 * barras crescem todas ao mesmo tempo e animar `width` refaz o layout a cada
 * frame; `scaleX` fica no compositor (mesma razão da barra da Prontidão).
 *
 * Uso: um `useBarsReveal()` por cartão (o `ref` vai no que se observa) e as
 * `<AnimatedBar bars={…} index={i} />` das linhas.
 *
 * O que se observa tem de ser BAIXO (2026-10-05): o critério do separador pede
 * 55 % da altura observada (limitada ao ecrã) à vista, e uma lista alta nunca
 * o cumpre à entrada — no Corpo (13 linhas, 887 px) a barra do Peso ficava a
 * zero, à vista, até haver scroll. O PeriodSummary observa a linha da 1.ª
 * barra; o cartão do dia (5 linhas) observa a lista, que cabe.
 */

/** Quanto demora a barra a deslizar de um valor para outro (mudar de período). */
export const BAR_SLIDE_MS = 300;

/**
 * Ref `{ current }` que fica `true` depois de o separador assentar à vista pela
 * 1.ª vez (NutritionDashboard dá-lhe o mesmo ref do NutritionEnteredContext).
 * Sem Provider (Corrida, Ginásio, Corpo) não há entrada calada.
 */
export const BarsEnteredContext = createContext(null);

/** O que o AnimatedBar usa quando não há hook (fora de um cartão com reveal). */
const STATIC_BARS = Object.freeze({ motion: false, atFinal: true, revealing: false });

export function useBarsReveal() {
  const reveal = useRevealAnimation();
  const reduced = !!reveal.reduced;
  // Só há movimento a gerir dentro do carrossel da Evolução e sem reduced-motion.
  const motion = reveal.active === true && !reduced;

  // Entrada calada (como o NutritionChartCard, D4): montado com o separador já
  // assente e já visto → não cresce do zero. Deixa de valer se o atleta sair do
  // separador antes de a 1.ª revelação acontecer, ou quando rearma.
  const entered = useContext(BarsEnteredContext);
  const page = useTabPage();
  const [quietMount] = useState(() => !!entered?.current && (page == null || getSettledIndex() === page));
  const quietOver = useRef(false);
  if (quietMount && motion && reveal.settled === false && !(reveal.playKey > 0)) quietOver.current = true;
  const quiet = quietMount && !quietOver.current && !(reveal.playKey > 1) && !reveal.armed;

  // Zero até à 1.ª revelação e depois de rearmar.
  const hold = motion && !quiet && (reveal.seen === false || reveal.armed === true);
  // `drawn` liga num rAF DEPOIS da revelação: o cartão aparece primeiro no zero
  // e só então muda para o valor, que é o que dispara a transição CSS.
  const [drawn, setDrawn] = useState(!motion);
  useEffect(() => {
    if (!motion || quiet) { setDrawn(true); return undefined; }
    if (hold) { setDrawn(false); return undefined; }
    if (typeof requestAnimationFrame !== 'function') { setDrawn(true); return undefined; }
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, [motion, quiet, hold, reveal.playKey]);
  // Ao rearmar volta ao zero já, no mesmo render (sem um frame de valor cheio).
  const atFinal = !motion || quiet || (!hold && drawn);

  return {
    ref: motion ? reveal.ref : undefined,
    motion,
    atFinal,
    // A janela da entrada (1,6 s depois de revelar): a transição é a longa,
    // escalonada. Fora dela, mudar de período é só o deslize curto.
    revealing: motion && !quiet && !!reveal.animate,
  };
}

export function AnimatedBar({
  pct,
  color,
  index = 0,
  bars = STATIC_BARS,
  height = 6,
  track = 'var(--border-hairline)',
  glow = true,
  testId,
  style,
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(Number(pct)) ? Number(pct) : 0));
  const scale = bars.atFinal ? Math.round(clamped * 100) / 10000 : 0;
  let transition = 'none';
  if (bars.motion && bars.atFinal) {
    const delay = Math.min(Math.round(index * STAGGER_BARS), STAGGER_BARS_MAX_SPAN);
    transition = bars.revealing
      ? `transform var(--dur-bars) var(--ease-out) ${delay}ms`
      : `transform ${BAR_SLIDE_MS}ms var(--ease-out)`;
  }
  return (
    <span
      aria-hidden="true"
      style={{
        flex: 1,
        height,
        borderRadius: 99,
        background: track,
        overflow: 'hidden',
        display: 'block',
        ...style,
      }}
    >
      <span
        data-testid={testId}
        data-pct={clamped}
        style={{
          display: 'block',
          height: '100%',
          width: '100%',
          borderRadius: 99,
          background: color,
          // Sem brilho a zero: uma barra de largura nula deixava um borrão no início da calha.
          boxShadow: glow && clamped > 0 ? `0 0 8px ${color}` : undefined,
          transform: `scaleX(${scale})`,
          transformOrigin: 'left',
          transition,
        }}
      />
    </span>
  );
}

export default AnimatedBar;
