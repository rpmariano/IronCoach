import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRevealAnimation } from '../../utils/useRevealAnimation';
import { useCountUpDisplay } from '../../utils/useCountUp';
import { DUR_COUNT, DUR_COUNT_REVEAL } from '../../utils/introAnimations';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { scheduleWhenSettled, useTabNearSettled, useTabPage } from '../../utils/settledTab';
import ChartJS from '../../lib/chartSetup';

/**
 * ChartFrame — a moldura de qualquer gráfico dos dashboards (ponto 6 do
 * redesenho 6c; auditoria, achado 1: "nos gráficos, tira as etiquetas de
 * dentro do SVG e põe o valor atual como número grande acima do gráfico").
 *
 * A regra é estrutural, não de tamanho: o texto SAI da tela do gráfico.
 * Dentro do <canvas>/<svg> ficam só formas — barras, linhas, pontos,
 * bandas. Tudo o que é palavra ou número vive em HTML à volta:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ ETIQUETA (eyebrow 11px)      ⓘ    pista  │
 *   │ 42,6 km            ▲ +3,4 km             │   ← número grande, 26px/900
 *   │ ┌──────────────────────────────────────┐ │
 *   │ │        só formas, sem texto          │ │
 *   │ └──────────────────────────────────────┘ │
 *   │ mín                                  máx │   ← extremos do eixo, opcional
 *   │ ● série A   ● série B                    │   ← legenda em HTML, 11px
 *   └──────────────────────────────────────────┘
 *
 * O número grande leva `data-count-to` com o valor numérico: é o gancho
 * para a animação de contagem do ponto 9 (1400 ms). Aqui não anima.
 *
 * Props:
 *   label     string — etiqueta uppercase do gráfico
 *   info      nó — normalmente um <MetricInfo />
 *   hint      string — nota curta à direita ("últimos 90 dias")
 *   value     string|number — o valor ATUAL, em número grande
 *   unit      string — unidade a 11px apagada
 *   valueColor string — cor do número (default --text-1)
 *   delta     { text, tone } — variação opcional ao lado do número
 *   legend    Array<{ label, color, shape?: 'dot'|'line'|'dash' }>
 *   axis      { min, max } — extremos do eixo em HTML, nos cantos
 *   height    number — altura da área do gráfico (default 176)
 *   footer    nó — nota livre por baixo
 *   reveal    o resultado de useRevealAnimation() de quem desenha o gráfico —
 *             passa-se quando o gráfico precisa de saber se anima (as opções
 *             do Chart.js vivem lá). Sem ele, a moldura observa-se sozinha.
 *   ready     (2026-10-04) false segura a entrada até os dados chegarem — para
 *             um gráfico que espera por uma fatia que o separador não lista
 *             (as do separador já vêm do Dashboard). Só com a moldura a
 *             observar-se sozinha; com `reveal`, vai na opção do hook.
 *
 * ── Dentro do carrossel da Evolução (2026-10-04, F5 — plano §2.1) ─────────
 * Com `TabPageContext` (Dashboard.jsx) a moldura deixa de esconder-se toda e
 * de remontar o gráfico a cada aparecimento:
 * - a moldura, a etiqueta, a legenda e os eixos ficam SEMPRE à vista (não se
 *   desliza para uma página vazia); só o número grande e a área do gráfico
 *   ficam com `opacity: 0` até ao 1.º reveal — opacity e nunca
 *   `visibility:hidden`, para o valor continuar no leitor de ecrã;
 * - observa-se a ÁREA do gráfico (≥ 55 % à vista), não o cartão: a etiqueta
 *   e o número já ocupam ~60 px e o gráfico crescia abaixo da dobra;
 * - o canvas (os `children`) só monta quando a área fica à vista com o
 *   separador assente, ou pré-criado em tempo morto quando a página é a
 *   assente ou a vizinha E a área está perto do ecrã — nunca dentro da
 *   Análise Cruzada fechada. Com reduced-motion também: não anima, mas não
 *   cria os 16 gráficos de uma vez à entrada;
 * - o Chart.js anima com a instância que já existe (`ChartJS.getChart`):
 *   · criado no próprio reveal → não se chama nada: o construtor já anima a
 *     partir da base;
 *   · ao rearmar (e logo a seguir a uma pré-criação) → stop() → reset() →
 *     draw(): fica na base, quieto, à espera;
 *   · ao revelar outra vez → stop() → reset() → update().
 *   O `stop()` vem SEMPRE antes do `reset()`: sem ele a animação em curso (a
 *   de entrada, ou uma transição 'period' de 300 ms) continua a escrever nos
 *   elementos a cada frame e desfaz o reset — e o `update()` seguinte
 *   reaproveita-a e perde o escalonamento das barras (medido com o Chart.js
 *   4.5.1 real, verificação dos céticos);
 *   Enquanto não está revelado a área leva `data-chart-hold`, e o plugin
 *   `ironHoldAtZero` (chartSetup) repõe a base depois de qualquer update lá
 *   dentro — também os que não passam por um render desta moldura (a
 *   instância que o React.StrictMode recria, um resize);
 * - o número, enquanto armado, mostra o estado zero ("0", "0,0") em vez do
 *   valor final que depois saltava para 0 (o piscar corrigido a 13/09); a
 *   contagem dura DUR_COUNT_REVEAL (800 ms), alinhada com o gráfico.
 * Fora do carrossel (sem contexto) tudo fica como era.
 */

const DELTA_COLOR = {
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  neutral: 'var(--text-4)',
};

/** O que fica por cima da área enquanto não se revelou: aparece num instante
 *  (o gráfico parte da base de qualquer forma), sem o "pop" seco de antes. */
const FADE_IN = 'opacity var(--dur-tap) var(--ease-out)';

/** Quanto acima/abaixo do ecrã ainda conta como "perto" para pré-criar: um
 *  ecrã inteiro — o que um gesto de scroll traz para a vista. */
const PRECREATE_MARGIN_SCREENS = 1;

/** Quantas casas decimais o valor já mostra — para a contagem não mudar de
 *  largura a meio ("42,6" conta com uma casa, "1 850" com nenhuma). */
function decimalsOf(value) {
  const dec = String(value ?? '').split(',')[1];
  return dec ? dec.replace(/\D/g, '').length : 0;
}

/** A instância do Chart.js desenhada dentro de `el`, se houver. Protegido: nos
 *  testes o react-chartjs-2 é um mock sem canvas, e um gráfico que falhou ao
 *  criar no jsdom também não regista instância. */
function chartIn(el) {
  const canvas = el?.querySelector?.('canvas');
  if (!canvas) return undefined;
  try {
    return ChartJS?.getChart?.(canvas) || undefined;
  } catch {
    return undefined;
  }
}

/** Na base e quieto (rearmado, ou acabado de pré-criar). */
function holdAtZero(chart) {
  try {
    chart.stop?.();
    chart.reset?.();
    chart.draw?.();
  } catch {
    /* gráfico a meio de ser destruído — nada a fazer */
  }
}

/** Outra vez a partir da base, com o escalonamento das barras (modo 'default'). */
function replayFromZero(chart) {
  try {
    chart.stop?.();
    chart.reset?.();
    chart.update?.();
  } catch {
    /* idem */
  }
}

// Os valores de overflow que cortam (pela positiva: um valor vazio, que o
// jsdom devolve para o que não sabe calcular, não corta).
const CLIPS = new Set(['hidden', 'clip', 'auto', 'scroll']);

/**
 * A área está perto do ecrã (na vertical) e não está cortada a zero por um
 * antepassado? A página vizinha está fora do ecrã de LADO — por isso só a
 * vertical conta aqui. Um antepassado com altura 0 e overflow cortado é a
 * Análise Cruzada fechada (grid-rows-[0fr] + overflow-hidden): lá dentro
 * nunca se cria nada.
 */
function isNearViewport(el) {
  if (!el?.getBoundingClientRect) return false;
  const rect = el.getBoundingClientRect();
  if (!(rect.height > 0)) return false;
  const viewHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const margin = viewHeight * PRECREATE_MARGIN_SCREENS;
  if (rect.bottom < -margin || rect.top > viewHeight + margin) return false;
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    if (a.classList?.contains('tab-swipe-page')) break;
    if (a.clientHeight === 0) {
      const cs = window.getComputedStyle?.(a);
      if (cs && (CLIPS.has(cs.overflowY) || CLIPS.has(cs.overflow))) return false;
    }
  }
  return true;
}

/** O número de destaque. Separado para o ponto 9 poder animá-lo sozinho:
 *  `animate` liga a contagem de --dur-count (1400 ms, --ease-back). O texto
 *  final é sempre o `value` que o gráfico passou — só os frames do meio é
 *  que são formatados aqui.
 *  `duration` (2026-10-04): na Evolução conta com DUR_COUNT_REVEAL (800 ms).
 *  `zero` (idem): o estado armado — mostra "0" com as mesmas casas decimais;
 *  o valor verdadeiro fica num texto só para o leitor de ecrã. Um valor que
 *  não é número ("5:41") não tem zero: fica transparente. */
export function BigNumber({ value, unit, color = 'var(--text-1)', size = 'var(--text-num)', animate = false, duration = DUR_COUNT, zero = false, style, ...rest }) {
  // 2026-10-04: um texto com ponto é um ritmo no formato canónico da app
  // ("5.20" = 5 min 20 s, formatPace), não um decimal — os números da app
  // usam vírgula. Contá-lo passava por "3", "4" e saltava para "5.20"; agora
  // não conta, como "5:41".
  const text = String(value ?? '');
  const numeric = typeof value === 'number'
    ? value
    : (text.includes('.') ? NaN : Number(text.replace(/\s/g, '').replace(',', '.')));
  const decimals = decimalsOf(value);

  const shown = useCountUpDisplay(isFinite(numeric) ? numeric : value, {
    animate,
    duration,
    decimals,
    display: value,
  });

  const zeroText = zero && isFinite(numeric) ? fmtNumber(0, decimals) : null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, ...style }} {...rest}>
      <span
        data-testid="chart-frame-value"
        data-count-to={isFinite(numeric) ? numeric : undefined}
        aria-hidden={zeroText != null ? true : undefined}
        style={{
          fontSize: size,
          fontWeight: 900,
          lineHeight: 1,
          color,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          ...(zero && zeroText == null ? { opacity: 0 } : null),
        }}
      >
        {zeroText ?? shown}
      </span>
      {zeroText != null && <span className="sr-only">{value}</span>}
      {unit && (
        <span
          data-testid="chart-frame-unit"
          style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-4)' }}
        >
          {unit}
        </span>
      )}
    </span>
  );
}

export default function ChartFrame({
  label,
  info,
  hint,
  value,
  unit,
  valueColor = 'var(--text-1)',
  delta,
  legend = [],
  axis,
  height = 176,
  footer,
  reveal,
  ready = true,
  children,
  className = '',
  style,
  ...rest
}) {
  /* Ponto 9, animações 2 e 4: o número conta e o gráfico cresce quando a
     moldura APARECE no ecrã, e outra vez quando se volta ao separador
     (useRevealAnimation, 2026-09-13). Antes era à primeira montagem da
     sessão: o Dashboard monta os cinco módulos juntos e tudo animava fora
     do ecrã. O `key` recomeça a contagem e remonta o gráfico, que é a única
     forma de o Chart.js voltar a animar. (Fora da Evolução; lá dentro, ver
     o bloco de 2026-10-04 acima.) */
  const page = useTabPage();
  const tabMode = page != null;
  const own = useRevealAnimation({ enabled: !reveal, ready });
  const r = reveal || own;

  // ── Modo separador. Os hooks correm sempre (ordem fixa); fora dele não
  //    fazem nada.
  const motion = tabMode && !!r.active;
  const observing = tabMode && !!r.observing;
  // Revelado = já visto e não rearmado. Um `reveal` sem estes campos (um
  // objeto feito à mão) conta como revelado.
  const shown = r.seen !== false && !r.armed;

  /* 2026-10-04 (verificação no browser, bloqueante da Corrida · «Previsão de
     prova»): um cartão SEM gráfico (height 0 — p.ex. a previsão com um só
     ponto de VDOT, o Corpo sem medições, a área empilhada sem dados) deixava
     o número invisível para sempre. Observava-se a área do gráfico, e um
     elemento com 0 px nunca tem 55 % "à vista" (`seenHeight <= 0` → fora):
     o reveal nunca disparava e a linha do valor ficava em opacity 0. Sem
     área para animar, observa-se a própria linha do valor (ou, sem ela, o
     cartão) — o número continua a contar quando aparece. */
  const hasValue = value !== undefined && value !== null && value !== '';
  const noPlot = !(Number(height) > 0);
  const watch = !tabMode ? null : (!noPlot ? 'plot' : (hasValue ? 'value' : 'frame'));

  const plotRef = useRef(null);
  const revealRef = r.ref;
  const setPlotRef = useCallback((el) => {
    plotRef.current = el;
    if (watch === 'plot') revealRef?.(el);
  }, [watch, revealRef]);
  const setValueRowRef = useCallback((el) => {
    if (watch === 'value') revealRef?.(el);
  }, [watch, revealRef]);
  const setFrameRef = useCallback((el) => {
    if (watch === 'frame') revealRef?.(el);
  }, [watch, revealRef]);

  // O canvas monta uma vez e fica: à vista com o separador assente, ou
  // pré-criado em tempo morto. Sem observer (jsdom, browsers antigos) monta
  // logo — os testes dos separadores continuam a ver os gráficos.
  const [mounted, setMounted] = useState(() => !tabMode || !observing);
  if (!mounted && (!tabMode || !observing || r.visible)) setMounted(true);

  const nearSettled = useTabNearSettled(1);
  useEffect(() => {
    if (!tabMode || !observing || mounted || !nearSettled) return undefined;
    return scheduleWhenSettled(page, () => {
      if (plotRef.current && isNearViewport(plotRef.current)) setMounted(true);
    });
  }, [tabMode, observing, mounted, nearSettled, page]);

  // Depois de cada commit (o filho do react-chartjs-2 já criou/atualizou o
  // gráfico nos efeitos dele, que correm antes destes): põe o Chart.js no
  // estado certo. Enquanto não está revelado, mantém-no na base — também
  // depois de os dados mudarem com a página fora da vista, senão entrava a
  // deslizar já cheio e saltava para zero ao assentar.
  const lastChartRef = useRef(null);
  const lastPlayRef = useRef(r.playKey);
  const heldRef = useRef(false);
  useEffect(() => {
    if (!motion) {
      /* 2026-10-04: o reduced-motion foi ligado com o gráfico seguro na base
         (rearmado ou pré-criado). O update('none') do syncChartMotion corre
         antes deste render, ainda com `data-chart-hold`, e o plugin
         mantinha-o na base; sem movimento já ninguém o revelava. Agora que o
         atributo saiu: valores finais, sem animação. */
      if (heldRef.current) {
        heldRef.current = false;
        const chart = chartIn(plotRef.current);
        try {
          chart?.stop?.();
          chart?.update?.('none');
        } catch {
          /* gráfico a meio de ser destruído */
        }
      }
      return undefined;
    }
    heldRef.current = !shown;
    const chart = chartIn(plotRef.current);
    const last = lastChartRef.current;
    /* 2026-10-04: uma instância anterior DESTRUÍDA não quer dizer que a atual
       nasceu neste commit. No React.StrictMode (o `npm run dev` onde a feature
       é aceite) o efeito de montagem do react-chartjs-2 corre duas vezes: cria
       #12, destrói-o e cria #13 logo a seguir, sem novo render da moldura — e
       este efeito só viu o #12. Medido no Chromium: o #13 ficava esquecido e,
       no reveal seguinte, "criado agora" saltava o replay (gráfico já cheio,
       parado). O `canvas` a null é o que o destroy() do Chart.js deixa. */
    const lastDestroyed = !!last && last.canvas === null;
    const created = !!chart && chart !== last && !lastDestroyed;
    lastChartRef.current = chart || null;
    const played = r.playKey !== lastPlayRef.current;
    lastPlayRef.current = r.playKey;
    if (chart) {
      if (!shown) holdAtZero(chart);
      else if (played && !created) replayFromZero(chart);
      // Criado agora, no próprio reveal: o construtor já anima da base.
    }

    /* 2026-10-04: e a instância que o StrictMode recria a seguir a este
       efeito (no mesmo flush, antes de qualquer frame)? Volta-se a olhar numa
       microtarefa: se a instância mudou, passa a ser a conhecida e, enquanto
       não está revelado, fica na base. (O plugin `ironHoldAtZero` do
       chartSetup já a segura no construtor pelo `data-chart-hold`; isto
       mantém o `lastChartRef` certo também onde o plugin não está — testes,
       ou um Chart.js sem ele.) Promise e não setTimeout/rAF: corre antes do
       1.º frame da animação do construtor. */
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const now = chartIn(plotRef.current);
      if (!now || now === lastChartRef.current) return;
      lastChartRef.current = now;
      if (!shown) holdAtZero(now);
    });
    return () => { cancelled = true; };
  });

  const hidden = motion && r.seen === false;
  const fade = motion ? FADE_IN : undefined;

  return (
    <div
      ref={tabMode ? setFrameRef : r.ref}
      data-testid="chart-frame"
      className={className}
      style={{
        background: 'var(--surface-glass)',
        backdropFilter: 'blur(var(--blur-card))',
        WebkitBackdropFilter: 'blur(var(--blur-card))',
        border: '1px solid var(--border-glass)',
        borderRadius: 20,
        padding: 16,
        boxShadow: 'var(--shadow-card)',
        ...style,
        ...(tabMode ? {} : (r.style || {})),
      }}
      {...rest}
    >
      {(label || info || hint) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          {label && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                letterSpacing: '.09em',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
              }}
            >
              {label}
            </span>
          )}
          {info}
          {hint && (
            <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>
              {hint}
            </span>
          )}
        </div>
      )}

      {hasValue && (
        <div
          ref={tabMode ? setValueRowRef : undefined}
          data-testid="chart-frame-value-row"
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginTop: 9,
            flexWrap: 'wrap',
            // Na linha (que não remonta) e não no número (que remonta a cada
            // reveal com o `key`): só assim o fade chega a correr.
            ...(tabMode ? { opacity: hidden ? 0 : 1, transition: fade } : null),
          }}
        >
          <BigNumber
            key={`n${r.playKey}`}
            value={value}
            unit={unit}
            color={valueColor}
            animate={r.animate}
            duration={tabMode ? DUR_COUNT_REVEAL : DUR_COUNT}
            zero={motion && !!r.armed}
          />
          {delta?.text && (
            <span
              data-testid="chart-frame-delta"
              style={{
                marginLeft: 'auto',
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                color: DELTA_COLOR[delta.tone] || DELTA_COLOR.neutral,
              }}
            >
              {delta.text}
            </span>
          )}
        </div>
      )}

      <div
        key={tabMode ? 'plot' : `p${r.playKey}`}
        ref={tabMode ? setPlotRef : undefined}
        data-testid="chart-frame-plot"
        // 2026-10-04: enquanto não está revelado, o plugin `ironHoldAtZero`
        // (chartSetup) mantém na base qualquer update do Chart.js aqui dentro
        // — o construtor de uma instância recriada pelo StrictMode, um resize
        // (rodar o telemóvel) ou o update('none') do reduced-motion — sem
        // depender de esta moldura voltar a renderizar.
        data-chart-hold={motion && !shown ? '1' : undefined}
        style={{
          position: 'relative',
          height,
          marginTop: 12,
          ...(tabMode ? { opacity: hidden ? 0 : 1, transition: fade } : null),
        }}
      >
        {mounted ? children : null}
      </div>

      {axis && (axis.min != null || axis.max != null) && (
        <div
          data-testid="chart-frame-axis"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{axis.min}</span>
          <span>{axis.max}</span>
        </div>
      )}

      {legend.length > 0 && (
        <div
          data-testid="chart-frame-legend"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 11 }}
        >
          {legend.map((item) => (
            <span
              key={item.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                color: 'var(--text-3)',
              }}
            >
              <span
                aria-hidden="true"
                style={
                  item.shape === 'line' || item.shape === 'dash'
                    ? {
                        width: 14,
                        height: 2,
                        borderRadius: 2,
                        background: item.shape === 'dash'
                          ? `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 8px)`
                          : item.color,
                        flexShrink: 0,
                      }
                    : { width: 8, height: 8, borderRadius: 99, background: item.color, flexShrink: 0 }
                }
              />
              {item.label}
            </span>
          ))}
        </div>
      )}

      {footer && (
        <div style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--text-4)', lineHeight: 1.5 }}>
          {footer}
        </div>
      )}
    </div>
  );
}
