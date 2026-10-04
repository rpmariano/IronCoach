import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, ArrowDown, ArrowUp, Minus, ChevronRight, Footprints, Dumbbell } from 'lucide-react';
import { useRevealAnimation } from '../../utils/useRevealAnimation';
import { getSettledIndex, subscribeSettled, useTabPage } from '../../utils/settledTab';
import { BigNumber } from '../BI/ChartFrame';
import {
  DUR_BARS, DUR_COUNT, DUR_COUNT_REVEAL, STAGGER_BARS, STAGGER_BARS_MAX_SPAN,
} from '../../utils/introAnimations';
import { DAY_STATUS_STYLE } from '../../utils/nutrition';

/**
 * Moldura dos gráficos da Nutrição por período (fase 4 da Evolução,
 * 2026-10-04) — o cartão `.cf` do mock-up aprovado: etiqueta, ⓘ, pista à
 * direita, número grande com unidade e ▲/▼, o gráfico, a linha do elemento
 * escolhido ("ter, 29 set · 2 180 de 2 400 kcal · … · Ver dia") e a legenda.
 *
 * Os gráficos da Nutrição são HTML (barras, mapa de calor), não Chart.js:
 * cada dia/semana é um botão (radio) com nome por extenso, que se escolhe com
 * toque ou setas — o mock-up é assim, e um <canvas> não dá isso. A entrada
 * segue a mesma regra dos outros gráficos (R9, useRevealAnimation): dentro
 * do carrossel, as barras crescem da base quando o gráfico fica à vista com o
 * separador assente (e outra vez ao voltar ao separador); armado, fica na
 * base; com reduced-motion ou fora do carrossel não mexe nada. O número
 * grande conta com o BigNumber do ChartFrame.
 *
 * Mudar de período NÃO repete a entrada (D4, plano §2.1 ponto 2 — bloqueio da
 * revisão de 2026-10-04): os gráficos ficam a mesma instância entre ‹ ›
 * (sem `key` por período no NutritionDashboard; colunas com chave pela
 * posição), por isso as barras só mudam de altura numa transição de 300 ms e o
 * número grande troca sem contar de 0. Um gráfico que MONTA por causa de uma
 * mudança dentro do separador já assente (Semana → Mês troca o gráfico de
 * barras pelo mapa de calor; um período sem refeições → um com) entra calado:
 * nem transparente nem a crescer — ver NutritionEnteredContext.
 */

/**
 * O NutritionDashboard dá aqui um ref `{ current }` que fica `true` depois de o
 * separador assentar à vista pela 1.ª vez nesta montagem (useNutritionEntered).
 * Um cartão que monte com ele `true` e o separador assente é uma troca de
 * período/tipo, não uma entrada: a 1.ª revelação desse cartão não anima (D4).
 * Ao sair do separador e voltar anima como os outros (R9).
 */
export const NutritionEnteredContext = createContext(null);

/** Para o NutritionDashboard: o ref do NutritionEnteredContext, ligado ao
 *  "separador assente" sem redesenhar o separador (lê o store externo). */
export function useNutritionEntered() {
  const page = useTabPage();
  const ref = useRef(false);
  useEffect(() => {
    // Fora do carrossel tudo conta como assente.
    if (page == null) {
      ref.current = true;
      return undefined;
    }
    const check = () => { if (getSettledIndex() === page) ref.current = true; };
    check();
    return subscribeSettled(check);
  }, [page]);
  return ref;
}

/**
 * O dia/semana escolhido num gráfico, que vale só no período em que foi
 * escolhido: ao mudar de período volta ao de omissão (o último fechado) sem
 * remontar o gráfico — sem efeito, sem render a mais (2026-10-04, revisão).
 */
export function usePeriodPick(periodKey) {
  const [pick, setPick] = useState({ periodKey, id: null });
  const picked = pick.periodKey === periodKey ? pick.id : null;
  const setPicked = useCallback((id) => setPick({ periodKey, id }), [periodKey]);
  return [picked, setPicked];
}

const KEYFRAMES = '@keyframes nutriGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}'
  + '@keyframes nutriGrowX{from{transform:scaleX(0)}to{transform:scaleX(1)}}'
  + '@keyframes nutriPop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}';

/**
 * Estilo de entrada do elemento `i` de `n` (escalonamento com teto, plano
 * §2.1 ponto 6: a última barra começa no máximo 450 ms depois da primeira).
 * `kind`: 'grow' (barra vertical, da base), 'growX' (barra horizontal), 'pop'
 * (célula do mapa de calor).
 */
export function enterStyle(motion, i = 0, n = 1, kind = 'grow') {
  if (!motion?.active) return undefined;
  const origin = kind === 'grow' ? 'bottom' : kind === 'growX' ? 'left' : 'center';
  if (motion.hold) {
    if (kind === 'pop') return { opacity: 0 };
    return { transformOrigin: origin, transform: kind === 'grow' ? 'scaleY(0)' : 'scaleX(0)' };
  }
  if (!motion.animate) return undefined;
  const step = n > 1 ? Math.min(STAGGER_BARS, STAGGER_BARS_MAX_SPAN / (n - 1)) : 0;
  const name = kind === 'grow' ? 'nutriGrow' : kind === 'growX' ? 'nutriGrowX' : 'nutriPop';
  return { transformOrigin: origin, animation: `${name} ${DUR_BARS}ms var(--ease-out) ${Math.round(i * step)}ms both` };
}

const STATUS_ICON = { ok: Check, below: ArrowDown, above: ArrowUp, none: Minus };

/** ✓ ↓ ↑ – na cor do estado (o ícone repete a palavra, nunca a substitui). */
export function StatusIcon({ status, size = 12 }) {
  const Icon = STATUS_ICON[status];
  if (!Icon) return null;
  const color = (DAY_STATUS_STYLE[status] || DAY_STATUS_STYLE.none).color;
  return <Icon size={size} strokeWidth={2.2} color={color} aria-hidden="true" style={{ flexShrink: 0 }} />;
}

/** Corrida (pegadas) e/ou ginásio (haltere) num dia. */
export function TrainingIcons({ training, size = 12 }) {
  if (!training) return null;
  return (
    <>
      {training.runs > 0 && <Footprints size={size} color="var(--text-4)" strokeWidth={2} aria-hidden="true" />}
      {(training.gym > 0 || training.classes > 0) && <Dumbbell size={size} color="var(--text-4)" strokeWidth={2} aria-hidden="true" />}
    </>
  );
}

/** Um item da legenda: amostra (nó) + texto. */
export function LegendItem({ swatch, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-3)' }}>
      {swatch}
      {children}
    </span>
  );
}

export const swatch = {
  square: (color) => <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />,
  zone: () => <span aria-hidden="true" style={{ width: 14, height: 8, borderRadius: 2, background: 'rgba(255,255,255,.16)', flexShrink: 0 }} />,
  dashLine: () => <span aria-hidden="true" style={{ width: 14, height: 0, borderTop: '1px dashed rgba(255,255,255,.55)', flexShrink: 0 }} />,
  today: () => (
    <span
      aria-hidden="true"
      style={{
        width: 8, height: 8, borderRadius: 2, border: '1px dashed var(--text-4)', flexShrink: 0,
        background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.10) 0 3px, transparent 3px 7px)',
      }}
    />
  ),
  stub: () => <span aria-hidden="true" style={{ width: 14, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.12)', flexShrink: 0 }} />,
  dot: () => <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: 99, background: 'var(--text-3)', flexShrink: 0 }} />,
};

/** "Ver dia ›" / "Ver semana ›" — 44 px, tinta do módulo. */
export function ViewButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 'var(--tap)',
        padding: '0 12px',
        borderRadius: 11,
        background: 'var(--tint-nutrition-bg)',
        border: '1px solid var(--tint-nutrition-bd)',
        color: 'var(--nutrition)',
        fontSize: 'var(--text-sm)',
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
      <ChevronRight size={14} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}

/** A linha do elemento escolhido, por baixo do gráfico (aria-live: muda ao
 *  escolher outro dia/semana). */
export function DetailRow({ children, action, testId = 'chart-detail' }) {
  return (
    <div
      style={{
        marginTop: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 12,
        background: 'var(--surface-dim)',
        minHeight: 'var(--tap)',
      }}
    >
      <p
        data-testid={testId}
        aria-live="polite"
        style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', lineHeight: 1.45, color: 'var(--text-3)' }}
      >
        {children}
      </p>
      {action}
    </div>
  );
}

/** "· ✓ Dentro" dentro de uma frase. */
export function StatusWord({ status }) {
  const st = DAY_STATUS_STYLE[status];
  if (!st || status === 'none') return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, whiteSpace: 'nowrap', color: st.color }}>
      <StatusIcon status={status} />
      {st.word}
    </span>
  );
}

/**
 * Teclado de um grupo de radios (roving tabindex): ←/→ (e ↑/↓) andam entre os
 * itens escolhíveis, com volta; Home/End vão ao primeiro/último. `ids` são as
 * chaves escolhíveis, por ordem.
 *
 * `vertical(id, dir)` (dir = +1 ↓ / −1 ↑) é para uma grelha: devolve o id da
 * mesma coluna na linha de baixo/cima, ou null para ficar onde está. Num
 * calendário com dias por escolher (antes do 1.º registo, hoje) andar ±7 na
 * lista dos ESCOLHÍVEIS caía noutra coluna (revisão de 2026-10-04).
 */
export function useRovingRadios(ids, selected, onSelect, { vertical } = {}) {
  const refs = useRef(new Map());
  const setRef = useCallback((id) => (el) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  }, []);
  const onKeyDown = useCallback((e) => {
    const n = ids.length;
    if (!n) return;
    const i = Math.max(0, ids.indexOf(selected));
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % n;
    else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      if (vertical) {
        // Na grelha, sem dia escolhível na mesma coluna: fica (e a página não
        // faz scroll com a seta).
        e.preventDefault();
        const target = vertical(ids[i], dir);
        j = target != null ? ids.indexOf(target) : -1;
        if (j < 0) return;
      } else {
        j = (i + dir + n) % n;
      }
    } else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    if (j == null) return;
    e.preventDefault();
    onSelect(ids[j]);
    refs.current.get(ids[j])?.focus();
  }, [ids, selected, onSelect, vertical]);
  return { setRef, onKeyDown };
}

const headerLabel = {
  fontSize: 'var(--text-xs)',
  fontWeight: 800,
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: 'var(--text-3)',
};

export default function NutritionChartCard({
  label,
  info,
  hint,
  value,
  unit,
  valueColor = 'var(--text-1)',
  delta,
  ready = true,
  detail,
  legend,
  children,
  testId = 'nutrition-chart',
  className = '',
  style,
}) {
  const r = useRevealAnimation({ ready });
  const page = useTabPage();
  const tabMode = page != null;

  /* Entrada calada (D4, 2026-10-04): montado com o separador já assente e já
     visto nesta montagem do NutritionDashboard → foi uma troca de período ou
     de tipo, e a 1.ª revelação deste cartão não anima nem fica transparente.
     Acaba se o atleta sair do separador antes de o cartão chegar a ser
     revelado (ao voltar é uma entrada normal); depois de revelado calado, a
     próxima entrada (sair e voltar: rearma, playKey 2) anima como as outras. */
  const entered = useContext(NutritionEnteredContext);
  const [quietMount] = useState(() => !!entered?.current && (page == null || getSettledIndex() === page));
  const quietOver = useRef(false);
  if (quietMount && tabMode && r.settled === false && !(r.playKey > 0)) quietOver.current = true;
  const quiet = quietMount && !quietOver.current && !(r.playKey > 1) && !r.armed;

  const motion = {
    active: !!r.active,
    // Na base: antes do 1.º reveal e quando rearmado (fora do separador).
    hold: !!r.active && !quiet && (r.seen === false || !!r.armed),
    animate: !!r.animate && !quiet,
    playKey: r.playKey,
  };
  const hidden = tabMode && r.active && r.seen === false && !quiet;
  const fade = tabMode && r.active ? 'opacity var(--dur-tap) var(--ease-out)' : undefined;

  /* O número grande só conta o valor que estava à vista quando revelou: mudar
     de período dentro da janela da animação (1,6 s) mostra logo o novo, em vez
     de recomeçar a contagem do 0 (useCountUp recomeça a cada valor novo). Fica
     assim até à próxima revelação, mesmo que ‹ › volte ao valor de partida. */
  const countFrom = useRef({ play: null, value: null, changed: false });
  if (countFrom.current.play !== r.playKey) countFrom.current = { play: r.playKey, value, changed: false };
  else if (countFrom.current.value !== value) countFrom.current.changed = true;
  const countAnimate = motion.animate && !countFrom.current.changed;

  return (
    <section
      ref={tabMode ? undefined : r.ref}
      data-testid={testId}
      className={className}
      style={{
        background: 'var(--surface-glass)',
        border: '1px solid var(--border-glass)',
        borderRadius: 20,
        padding: 16,
        boxShadow: 'var(--shadow-card)',
        ...style,
        ...(tabMode || quiet ? null : r.style),
      }}
    >
      {/* React 19 junta estas regras no <head> uma vez só (href + precedence). */}
      <style href="nutrition-chart-motion" precedence="default">{KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 20 }}>
        <h3 style={{ margin: 0, ...headerLabel }}>{label}</h3>
        {info}
        {hint && <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-4)' }}>{hint}</span>}
      </div>
      {value != null && value !== '' && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 9, flexWrap: 'wrap', opacity: hidden ? 0 : 1, transition: fade }}>
          <BigNumber
            key={`n${r.playKey}`}
            value={value}
            unit={unit}
            color={valueColor}
            animate={countAnimate}
            duration={tabMode ? DUR_COUNT_REVEAL : DUR_COUNT}
            zero={motion.active && !!r.armed}
          />
          {delta && (
            <span data-testid="chart-delta" style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
              {delta}
            </span>
          )}
        </div>
      )}
      <div
        ref={tabMode ? r.ref : undefined}
        data-testid={`${testId}-plot`}
        style={{ marginTop: 12, opacity: hidden ? 0 : 1, transition: fade }}
      >
        {typeof children === 'function' ? children(motion) : children}
      </div>
      {detail}
      {legend && (
        <div data-testid={`${testId}-legend`} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: 11 }}>
          {legend}
        </div>
      )}
    </section>
  );
}
