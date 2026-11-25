import React, { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import '../../styles/v2-components.css';
import '../../styles/v2-evolucao.css';
import { useAppStore, sliceReady, EVOLUTION_TAB_SLICES } from '../../store';
import { useEvolutionView } from '../../store/evolution/useEvolutionView';
import '../../store/evolution/views/run';
import '../../store/evolution/views/gym';
import '../../store/evolution/views/nutrition';
import '../../store/evolution/views/body';
import { useCalendarPeriod } from '../../utils/useCalendarPeriod';
import { TabReadyContext } from '../../utils/settledTab';
import { CORRIDA, GINASIO, NUTRICAO, CORPO } from '../BI/TimeFilterBar';
import { fmtNumber } from '../../utils/verdicts/shared';
import { formatPace } from '../../utils/run';
import { BODY_METRIC_BY_KEY, fmtMetric, fmtDayShort } from '../../utils/body';
import CoachInsightsDock from '../BI/CoachInsightsDock';
import Run from '../Run/Run';
import Gym from '../Gym/Gym';
import Nutrition from '../Nutrition/Nutrition';
import Body from '../Body/Body';

/* A Evolução no Design v2 (direção C · Painel, fase 2; utils/designV2.js). Só com o v2 ligado: o
   Dashboard.jsx escolhe-a. Um só nível de separadores (Corrida, Ginásio, Nutrição, Corpo) e o
   período num seletor compacto (o mesmo periodStore dos dashboards de sempre: mudar aqui muda lá).
   Em cada área, de cima para baixo:
   · o número herói do período (km, treinos, kcal por dia, peso);
   · a Carol numa linha, com o traço ciano, sem siglas (plainVerdict);
   · os blocos de sempre (os dashboards do v1 lite, com os gráficos, as entradas animadas e o
     botão de explicar de cada ChartFrame), vestidos pelo v2-evolucao.css: sem a barra de pílulas,
     sem o navegador ‹ › (sobe para o cabeçalho) e sem a frase do veredicto (já dita em cima).
   O Geral fica de fora (não tem um número herói); quem chega com «hub» vê a Corrida. */

export const AREAS = [
  { key: 'corrida', label: 'Corrida', options: CORRIDA, color: 'var(--run)', Body: Run },
  { key: 'ginasio', label: 'Ginásio', options: GINASIO, color: 'var(--gym)', Body: Gym },
  { key: 'nutricao', label: 'Nutrição', options: NUTRICAO, color: 'var(--nutrition)', Body: Nutrition },
  { key: 'corpo', label: 'Corpo', options: CORPO, color: 'var(--body)', Body: Body },
];
const AREA_BY_KEY = Object.fromEntries(AREAS.map((a) => [a.key, a]));
const ALIASES = { hub: 'corrida', holistica: 'corrida' };

const plural = (n, one, many) => (n === 1 ? one : many);

/* As siglas saem do texto visível do v2 (a fórmula partilhada não muda: só a frase mostrada).
   A ordem conta: «Z3+» antes de «Z3». Os travessões também saem (direção C). */
const PLAIN = [
  [/\bem Z3\+/g, 'acima do ritmo fácil'],
  [/\bZ3\+/g, 'acima do ritmo fácil'],
  [/\bem Z[12]\b/g, 'no ritmo fácil'],
  [/\bZ[12]\b/g, 'ritmo fácil'],
  [/\bZ3\b/g, 'ritmo moderado'],
  [/\bZ[45]\+?/g, 'ritmo forte'],
  [/\bO VDOT médio\b/g, 'A forma pelo treino'],
  [/\bo VDOT médio\b/g, 'a forma pelo treino'],
  [/\bVDOT\b/g, 'forma pelo treino'],
  [/\bACWR\b/g, 'carga'],
  [/\s*—,/g, ','],
  [/\s+—\s+/g, ': '],
  [/—/g, ', '],
];
export function plainVerdict(text) {
  if (!text) return '';
  return PLAIN.reduce((t, [re, to]) => t.replace(re, to), String(text));
}

/** O número herói de cada área, a partir da vista pré-calculada (a mesma dos dashboards). */
function heroOf(area, view, title) {
  if (!view) return null;
  if (area === 'corrida') {
    const cur = view.cur || {};
    if (!view.hasRuns) return { n: '0', u: 'km', l: 'ainda sem corridas registadas' };
    const pace = cur.paceSec > 0 ? { v: `${formatPace(cur.paceSec)}/km`, l: 'ritmo médio' } : null;
    return {
      n: fmtNumber(cur.km || 0, 1),
      u: 'km',
      l: `em ${cur.count || 0} ${plural(cur.count, 'corrida', 'corridas')}, ${title}`,
      right: pace,
    };
  }
  if (area === 'ginasio') {
    const cur = view.cur || {};
    if (!view.hasSessions) return { n: '0', u: 'treinos', l: 'ainda sem treinos registados' };
    const total = cur.total || 0;
    const per = view.weeks?.perWeekStrength;
    return {
      n: String(total),
      u: plural(total, 'treino', 'treinos'),
      l: `${cur.strength || 0} de força e ${cur.classes || 0} ${plural(cur.classes, 'aula', 'aulas')}, ${title}`,
      right: per != null ? { v: fmtNumber(per, 1), l: 'força por semana' } : null,
    };
  }
  if (area === 'nutricao') {
    if (view.kind === 'dia') return null; // o cartão do dia, logo abaixo, já é o número do dia
    const cal = view.summary?.byKey?.calories;
    const prot = view.summary?.byKey?.protein;
    if (!cal || cal.avg == null) return { n: '0', u: 'kcal', l: `sem refeições registadas, ${title}` };
    return {
      n: fmtNumber(Math.round(cal.avg), 0),
      u: 'kcal',
      l: `por dia, em ${cal.nDays} ${plural(cal.nDays, 'dia', 'dias')} com registo`,
      right: prot?.avg != null ? { v: `${fmtNumber(Math.round(prot.avg), 0)} g`, l: 'proteína por dia' } : null,
    };
  }
  if (area === 'corpo') {
    if (!view.hasAny) return { n: '0', u: 'avaliações', l: 'ainda sem avaliações registadas' };
    if (view.kind === 'dia' || !Array.isArray(view.rows)) return null;
    const row = view.rows.find((r) => r.key === 'weight_kg') || view.rows[0];
    if (!row) return null;
    const metric = BODY_METRIC_BY_KEY[row.key];
    const reading = row.last || row.lastBefore;
    if (!metric || !reading) {
      const n = view.count || 0;
      return { n: String(n), u: plural(n, 'avaliação', 'avaliações'), l: title };
    }
    const [num, ...unit] = fmtMetric(metric, reading.value).split(' ');
    return {
      n: num,
      u: unit.join(' '),
      l: `${metric.label ? `${metric.label.toLowerCase()}, ` : ''}${row.last ? 'última leitura' : 'a leitura anterior'} a ${fmtDayShort(reading.date, view.period?.end)}`,
      right: row.goal != null ? { v: fmtMetric(metric, row.goal), l: 'objetivo' } : null,
    };
  }
  return null;
}

function PeriodBar({ area, cal }) {
  const id = useId();
  const { options } = AREA_BY_KEY[area];
  const title = cal.label?.title || '';
  const sub = cal.kind === 'semana' ? cal.label?.range : null;
  // Na vista Dia, o cartão do dia (Nutrição) e a avaliação (Corpo) trazem o seu próprio navegador.
  const isDay = cal.kind === 'dia';
  return (
    <div className="v2-evo-period" data-testid="evo-v2-period">
      {isDay ? <p className="v2-evo-when" data-testid="evo-v2-period-title"><b>Dia</b></p> : (
      <div className="v2-evo-nav">
        <button type="button" className="v2-evo-arrow" onClick={cal.prev} aria-label="Período anterior">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <p className="v2-evo-when" aria-live="polite" data-testid="evo-v2-period-title">
          <b>{title}</b>
          {sub && <span>{sub}</span>}
        </p>
        <button type="button" className="v2-evo-arrow" onClick={cal.next} disabled={!cal.canGoNext} aria-label="Período seguinte">
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      )}
      <label className="v2-evo-select" htmlFor={id}>
        <span className="sr-only">Período</span>
        <select id={id} value={cal.kind} onChange={(e) => cal.setKind(e.target.value)} data-testid="evo-v2-kind">
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {!isDay && cal.offset < 0 && (
        <button type="button" className="v2-evo-back" onClick={() => cal.setKind(cal.kind)}>
          Voltar ao período atual
        </button>
      )}
    </div>
  );
}

function Area({ area }) {
  const view = useEvolutionView(area);
  const cal = useCalendarPeriod(area, { dataStartISO: view?.dataStartISO });
  const ready = useAppStore((s) => sliceReady(s, EVOLUTION_TAB_SLICES[area] || []));
  const { Body: AreaBody, label, color } = AREA_BY_KEY[area];
  const title = cal.label?.title || '';
  // A vista do Corpo ainda pode vir do tipo anterior durante a troca: só vale a do tipo atual.
  const v = view && view.kind === cal.kind ? view : null;
  const hero = heroOf(area, v, title);
  const say = plainVerdict(v?.verdict?.text);

  return (
    <div className="v2-evo-area" role="tabpanel" id={`evo-v2-panel-${area}`} aria-labelledby={`evo-v2-tab-${area}`} data-testid={`evo-v2-area-${area}`}>
      <PeriodBar area={area} cal={cal} />
      <div className="v2-evo-top v2-enter">
        {hero && (
          <section className="v2-hero" data-testid="evo-v2-hero" aria-label={`${label}, ${title}`}>
            <div className="min-w-0">
              <div className="v2-evo-hero-n">
                <span className="v2-hero-n v2-num" data-testid="evo-v2-hero-n">{hero.n}</span>
                {hero.u && <span className="v2-evo-hero-u">{hero.u}</span>}
              </div>
              <div className="v2-hero-l">
                <i className="v2-dot" style={{ background: color }} aria-hidden="true" />
                {hero.l}
              </div>
            </div>
            {hero.right && (
              <div className="v2-hero-r">
                <b className="v2-num">{hero.right.v}</b>
                <span>{hero.right.l}</span>
              </div>
            )}
          </section>
        )}
        {say && (
          <div className="v2-say" data-testid="evo-v2-say">
            <i aria-hidden="true" />
            <p><span className="v2-who">Carol.</span> {say}</p>
          </div>
        )}
      </div>
      {/* Os blocos de sempre (v1 lite): gráficos, entradas e o «Carol explica» de cada um. */}
      <div className="v2-evo-body" data-testid="evo-v2-body">
        <TabReadyContext.Provider value={ready}>
          <AreaBody />
        </TabReadyContext.Provider>
      </div>
    </div>
  );
}

export default function DashboardV2({ activeModule }) {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const key = ALIASES[activeModule] || activeModule;
  const area = AREA_BY_KEY[key] ? key : 'corrida';

  const go = (k) => { if (k !== area) setActiveTab?.(k); };
  const onKey = (e) => {
    const i = AREAS.findIndex((a) => a.key === area);
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % AREAS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + AREAS.length) % AREAS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = AREAS.length - 1;
    if (j == null) return;
    e.preventDefault();
    go(AREAS[j].key);
    // O foco segue o separador escolhido (padrão de separadores com ativação automática).
    requestAnimationFrame(() => document.getElementById(`evo-v2-tab-${AREAS[j].key}`)?.focus());
  };

  return (
    <div className="v2-screen v2-evo pb-2" data-testid="evolucao-v2">
      <h2 className="v2-title">Evolução</h2>
      <div className="v2-evo-tabs" role="tablist" aria-label="Área" data-testid="evo-v2-tabs" onKeyDown={onKey}>
        {AREAS.map((a) => {
          const on = a.key === area;
          return (
            <button
              key={a.key}
              type="button"
              role="tab"
              id={`evo-v2-tab-${a.key}`}
              aria-selected={on}
              aria-controls={`evo-v2-panel-${a.key}`}
              tabIndex={on ? 0 : -1}
              className={on ? 'is-on' : undefined}
              onClick={() => go(a.key)}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      {/* key: trocar de área remonta-a, e as entradas dos gráficos voltam a correr. */}
      <Area key={area} area={area} />
      <CoachInsightsDock />
    </div>
  );
}
