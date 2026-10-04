import React, { useMemo } from 'react';
import { Footprints, Dumbbell, Utensils, Scale, ChartNoAxesColumn, Check, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import SmartInsightsBanner from '../BI/SmartInsightsBanner';
import RaceReadinessCard from '../BI/RaceReadinessCard';
import PillarSummaryCard from '../BI/PillarSummaryCard';
import EmptyModuleState from '../BI/EmptyModuleState';
import SectionLabel from '../shared/SectionLabel';
import CrossAnalysisSection from '../BI/CrossAnalysisSection';
import { PeriodNav, EarlyPeriodState, TodayExcludedNote, plural, APPROX_GOALS_NOTE } from '../BI/period';
import { WEIGHT_TREND_MIN_POINTS, WEIGHT_TREND_MIN_SPAN_DAYS, WEIGHT_TREND_WINDOW_DAYS } from '@formulas/weightTrend.ts';
import { fmtNumber } from '../../utils/dashboardVerdicts';
import { buildGettingStarted } from '../../utils/gettingStarted';
import { useCalendarPeriod } from '../../utils/useCalendarPeriod';
import { useTodayISO } from '../../utils/useTodayISO';
import { usePeriodStore } from '../../store/periodStore';
import { useEvolutionView } from '../../store/evolution/useEvolutionView';
// Regista a vista do Geral na cache (F6): sem este import só a preparação em
// tempo morto a carregaria.
import '../../store/evolution/views/hub';

/* Vírgula decimal (pt-PT) com casas fixas: "12,4 km", "74,6 kg" — o
   toFixed(1) dava ponto ("12.4"). */
const dec = (n, casas = 1) => fmtNumber(n, casas);

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "28 set" — a data curta de um dia ISO. */
const dataCurta = (iso) => {
  const [, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${MESES_CURTOS[m - 1]}`;
};

/* "há 3 dias" para a última pesagem (O4): o número vale pela data a que
   pertence. Dias de calendário, não horas. Mais de duas semanas: a data. Numa
   semana passada diz-se sempre a data — "há 3 dias" contado de hoje não diz
   nada sobre essa semana. */
function idadeDaPesagem(dataISO, ageDays, isCurrent) {
  if (!isCurrent) return dataCurta(dataISO);
  if (!Number.isFinite(ageDays)) return null;
  if (ageDays <= 0) return 'hoje';
  if (ageDays === 1) return 'ontem';
  if (ageDays <= 13) return `há ${ageDays} dias`;
  return dataCurta(dataISO);
}

/* ▲/▼/= face à semana anterior (R5): o objeto que o PillarSummaryCard desenha
   com a seta escondida do leitor de ecrã e uma frase por extenso. Subir não é
   bom nem mau por si (mais km, mais sessões): cinzento. `unit` pode ser uma
   função da grandeza arredondada, para o singular ("1 sessão"). */
function makeDelta({ cur, prev, decimals = 0, unit = '', label, better = 'none' }) {
  const diff = Number(cur) - Number(prev);
  if (!Number.isFinite(diff)) return null;
  const direction = Math.abs(diff) < 0.5 * 10 ** -decimals ? 'flat' : diff > 0 ? 'up' : 'down';
  const mag = Math.abs(diff);
  const u = typeof unit === 'function' ? unit(Math.round(mag * 10 ** decimals) / 10 ** decimals) : unit;
  const magText = `${dec(mag, decimals)}${u ? ` ${u}` : ''}`;
  return {
    direction,
    better,
    text: direction === 'flat' ? `igual ${label}` : `${magText} face ${label}`,
    spoken: direction === 'flat' ? `Igual ${label}` : `${diff > 0 ? 'Subiu' : 'Desceu'} ${magText} face ${label}`,
  };
}

/* Ponto 3 do redesenho ("cor com significado"): os pilares tinham um emoji
   por ícone (🏃 🏋️ 🥗 👤) e os badges traziam bolinhas 🟢🟡🔴⚪ à frente do
   texto. Saem os dois — o ícone passa a lucide na cor do módulo e o estado
   já é dito pela cor do badge (verde dentro do alvo, coral atenção,
   vermelho crítico). O texto das etiquetas não muda. */
const PILLAR_ICONS = {
  corrida: <Footprints size={15} style={{ color: 'var(--run)' }} />,
  ginasio: <Dumbbell size={15} style={{ color: 'var(--gym)' }} />,
  nutricao: <Utensils size={15} style={{ color: 'var(--nutrition)' }} />,
  corpo: <Scale size={15} style={{ color: 'var(--body)' }} />,
};

const ACWR_COLOR = { safe: 'green', caution: 'yellow', danger: 'red', neutral: 'neutral' };
const EA_ORIGIN = {
  medida: 'massa magra medida',
  estimada: 'massa magra estimada',
  omissao: 'estimativa: sem composição corporal medida',
};
const NO_DAYS = 'Ainda sem dias fechados';
/* R7: a semana vista é anterior ao 1.º registo do módulo — não houve "0", a app
   ainda não era usada. Badge neutro e uma frase que diz quando começam os registos. */
const BEFORE_DATA = { label: 'Antes do 1.º registo', color: 'neutral' };
const beforeText = (coisa, dataStart) => `Ainda não registavas ${coisa}: o primeiro registo é de ${dataCurta(dataStart)}.`;
/* Semana que começa a meio dos registos: os zeros só valem a partir dessa data. */
const partialText = (coisa, dataStart) => `Só há ${coisa} registados desde ${dataCurta(dataStart)}.`;
/* A nota do fundo diz o que os pilares fazem MESMO: o Corpo conta a pesagem de
   hoje e o ACWR da Corrida é o de hoje (revisão 2026-10-04: a frase genérica
   "hoje não entra nas contas" estava ao lado do número que a desmentia). */
const TODAY_NOTE = 'Hoje ainda não acabou: corrida, ginásio e nutrição contam só os dias fechados. A pesagem de hoje e o ACWR já entram.';

/* "Semana passada (28 set – 4 out): 24,5 km em 3 corridas · 2 sessões de força ·
   refeições em 5 dias" — o resumo do ecrã "a começar" (R8). Só diz o que houve. */
function previousWeekText(prev) {
  if (!prev) return null;
  const bits = [];
  if (prev.runs > 0) bits.push(`${dec(prev.km, 1)} km em ${prev.runs} ${plural(prev.runs, 'corrida', 'corridas')}`);
  if (prev.strength > 0) bits.push(`${prev.strength} ${plural(prev.strength, 'sessão de força', 'sessões de força')}`);
  if (prev.classes > 0) bits.push(`${prev.classes} ${plural(prev.classes, 'aula', 'aulas')}`);
  if (prev.mealDays > 0) bits.push(`refeições em ${prev.mealDays} ${plural(prev.mealDays, 'dia', 'dias')}`);
  return bits.length ? `Semana passada (${prev.range}): ${bits.join(' · ')}` : null;
}

/* Os quatro pilares de uma semana de calendário, só com dias FECHADOS (hoje
   ainda não acabou — R2). Os números vêm da vista pré-calculada
   (store/evolution/views/hub.js); aqui só se escreve a frase de cada pilar.
   Todos dizem o denominador ("N sessões", "X de N dias") e nenhum inventa o que
   não há (sem objetivo → sem %; sem tendência → "a calibrar"). */
function pillarsOf(view) {
  const closed = view.closedDays > 0;
  const isCurrent = view.period.isCurrent;
  const semana = isCurrent ? 'esta semana' : 'nessa semana';

  // ── Corrida ──
  const r = view.run;
  let run;
  {
    const missing = r.acwr.missing;
    // Numa semana passada o ACWR é o do FIM dessa semana: "faltavam", não "faltam".
    let badge = missing
      ? { label: `ACWR: ${r.acwr.atWeekEnd ? 'faltavam' : 'faltam'} ${missing} sem.`, color: 'neutral' }
      : { label: r.acwr.label === 'Sem dados' ? r.acwr.label : `ACWR ${r.acwr.label}`, color: ACWR_COLOR[r.acwr.tone] };
    const lines = [];
    if (!r.hasHistory) lines.push('Sem corridas registadas');
    else if (r.beforeData) { lines.push(beforeText('corridas', r.dataStart)); badge = BEFORE_DATA; }
    else if (!closed) lines.push(NO_DAYS);
    else {
      lines.push(r.count > 0 ? `${r.count} ${plural(r.count, 'corrida', 'corridas')} ${semana}` : `Sem corridas ${semana}`);
      if (r.partial && !isCurrent) lines.push(partialText('corridas', r.dataStart));
    }
    if (r.hasHistory && !r.beforeData && r.acwr.atWeekEnd) lines.push('ACWR no fim dessa semana');
    const shows = r.hasHistory && closed && !r.beforeData;
    run = {
      kpi: shows ? (r.km > 0 ? dec(r.km, 1) : '0') : '—',
      kpiUnit: shows ? `km ${isCurrent ? 'esta sem.' : 'na semana'}` : '',
      badge,
      delta: r.delta ? makeDelta({ cur: r.delta.km.cur, prev: r.delta.km.prev, decimals: 1, unit: 'km', label: r.delta.label }) : null,
      subtitle: lines,
    };
  }

  // ── Ginásio ──
  const g = view.gym;
  let gym;
  {
    const lines = [];
    if (!g.hasHistory) lines.push('Sem treinos registados');
    else if (g.beforeData) lines.push(beforeText('treinos', g.dataStart));
    else if (!closed) lines.push(NO_DAYS);
    else {
      if (g.kgPerSession != null) {
        // O3: a média é só sobre as sessões de força COM carga, e diz-se quantas são.
        lines.push(`${dec(g.kgPerSession, 0)} kg/sessão de força em média (${g.loadedSessions} ${plural(g.loadedSessions, 'sessão', 'sessões')})`);
      } else if (g.hasSetsWithoutLoad) {
        lines.push('Treino sem carga externa (peso do corpo)');
      } else if (g.strength > 0) {
        lines.push('Sem séries com peso registadas');
      }
      if (g.classes > 0) lines.push(`${g.classes} ${plural(g.classes, 'aula', 'aulas')} à parte`);
      if (g.strength === 0 && g.classes === 0) lines.push(`Sem treinos ${semana}`);
      if (g.partial && !isCurrent) lines.push(partialText('treinos', g.dataStart));
    }
    let badge = { label: 'Sem dados', color: 'neutral' };
    const gShows = g.hasHistory && closed && !g.beforeData;
    if (g.beforeData) badge = BEFORE_DATA;
    else if (gShows) {
      if (g.strength >= g.target) badge = { label: 'Alvo cumprido', color: 'green' };
      // Semana em curso, ou passada que só começou a ser registada a meio: com
      // menos dias de dados não se diz "abaixo do alvo" (R7) — diz-se quantas há.
      else if (isCurrent || g.partial) badge = { label: `${g.strength} de ${g.target} sessões`, color: 'neutral' };
      else badge = { label: 'Abaixo do alvo', color: 'yellow' };
    }
    gym = {
      kpi: gShows ? String(g.strength) : '—',
      kpiUnit: gShows ? plural(g.strength, 'sessão de força', 'sessões de força') : '',
      badge,
      delta: g.delta
        ? makeDelta({ cur: g.delta.strength.cur, prev: g.delta.strength.prev, unit: (n) => plural(n, 'sessão de força', 'sessões de força'), label: g.delta.label })
        : null,
      subtitle: lines,
    };
  }

  // ── Nutrição ──
  const n = view.nutrition;
  let nutri;
  {
    let kpi = '—';
    let kpiUnit = '';
    let badge = { label: 'Sem dados', color: 'neutral' };
    const lines = [];
    if (!n.hasHistory) {
      lines.push('Regista refeições');
    } else if (n.beforeData) {
      badge = BEFORE_DATA;
      lines.push(beforeText('refeições', n.dataStart));
    } else if (!closed) {
      lines.push(NO_DAYS);
    } else if (n.nDays === 0) {
      lines.push(`Sem refeições registadas ${semana}`);
    } else if (!n.hasGoal) {
      // Sem objetivo definido não há % (nem um 2000 kcal inventado — O1).
      kpi = dec(n.avgKcal, 0);
      kpiUnit = 'kcal/dia';
      badge = { label: 'Sem objetivo', color: 'neutral' };
      lines.push(`Média de ${n.nDays} ${plural(n.nDays, 'dia registado', 'dias registados')}. Define o objetivo no Perfil para veres a percentagem.`);
    } else if (!n.goalEnough) {
      kpi = dec(n.avgKcal, 0);
      kpiUnit = 'kcal/dia';
      badge = { label: 'Ainda é cedo', color: 'neutral' };
      lines.push(!n.enough
        ? `${n.nDays} ${plural(n.nDays, 'dia registado', 'dias registados')} — poucos para conclusões.`
        : `Só ${n.goalDays} ${plural(n.goalDays, 'dia', 'dias')} com objetivo definido — poucos para a percentagem.`);
    } else {
      kpi = `${n.pct}%`;
      kpiUnit = 'calorias';
      badge = n.status === 'ok'
        ? { label: 'Calorias OK', color: 'green' }
        : n.status === 'above' ? { label: 'Acima do objetivo', color: 'yellow' } : { label: 'Abaixo do objetivo', color: 'yellow' };
      lines.push(`Calorias no objetivo em ${n.daysInGoal} de ${n.goalDays} ${plural(n.goalDays, 'dia', 'dias')}`);
      // O1: os dias anteriores ao objetivo não se medem contra um número inventado.
      if (n.daysWithoutGoal > 0) {
        lines.push(`${n.daysWithoutGoal} ${plural(n.daysWithoutGoal, 'dia', 'dias')} sem objetivo definido ficam de fora`);
      }
      if (n.ea) {
        lines.push(`EA ${dec(n.ea.average, 1).replace(/,0$/, '')} kcal/kg (${EA_ORIGIN[n.ea.source] || EA_ORIGIN.omissao})`);
        if (n.ea.weightFallback && n.ea.hasRuns) lines.push('Gasto da corrida calculado com 70 kg (sem peso registado)');
      }
    }
    if (n.partial && !isCurrent && !n.beforeData && closed) lines.push(partialText('refeições', n.dataStart));
    // R5: "▲ face à semana anterior: 3 de 6 dias no objetivo" — o anterior por
    // extenso, não uma diferença em % (a seta diz se há mais ou menos dias no
    // objetivo; revisão 2026-10-04: sem "dias no objetivo" lia-se como 3 de 6 de quê).
    let nDelta = null;
    if (n.delta) {
      const pct = (x) => Math.round((x.k * 100) / Math.max(1, x.n));
      const dir = makeDelta({ cur: pct(n.delta.cur), prev: pct(n.delta.prev), label: n.delta.label, better: 'up' });
      const prevText = `${n.delta.prev.k} de ${n.delta.prev.n}`;
      nDelta = {
        direction: dir.direction,
        better: 'up',
        text: `${dir.direction === 'flat' ? 'igual' : 'face'} ${n.delta.label}: ${prevText} dias no objetivo`,
        spoken: `${dir.direction === 'flat' ? 'Igual' : dir.direction === 'up' ? 'Subiu' : 'Desceu'} face ${n.delta.label}, que teve ${prevText} dias com as calorias no objetivo`,
      };
    }
    nutri = { kpi, kpiUnit, badge, delta: nDelta, subtitle: lines };
  }

  // ── Corpo ──
  const b = view.body;
  let corpo;
  {
    // O4: o peso do cartão é a ÚLTIMA PESAGEM, com a data a que pertence — não a
    // média EWMA, que não tem data e pode andar quilos longe do que a balança
    // disse. A tendência (Em perda / Estável / Em ganho, kg/sem) só existe quando
    // o contrato de weightTrend a dá como suficiente (≥3 pesagens em ≥10 dias) e a
    // última pesagem é recente: com uma pesagem, ou pesagens muito espaçadas, o
    // cartão dizia "Estável · 0 kg/sem" — um facto inventado.
    const age = b.last ? idadeDaPesagem(b.last.date, b.ageDays, isCurrent) : null;
    const delta = b.trendKnown
      ? (Math.abs(b.weeklyRate) < 0.05 ? '0,0 kg/sem' : `${b.weeklyRate > 0 ? '+' : ''}${dec(b.weeklyRate, 1)} kg/sem`)
      : null;
    let badge;
    if (b.beforeData) badge = BEFORE_DATA;
    else if (!b.last) badge = { label: 'Sem dados', color: 'neutral' };
    else if (b.stale) badge = { label: 'Desatualizado', color: 'neutral' };
    else if (!b.trendKnown) badge = { label: 'A calibrar', color: 'neutral' };
    else if (b.trend === 'descendo') badge = { label: 'Em perda', color: 'blue' };
    else if (b.trend === 'subindo') badge = { label: 'Em ganho', color: 'yellow' };
    else badge = { label: 'Estável', color: 'green' };

    const weekText = b.assessments > 0
      ? `${b.assessments} ${plural(b.assessments, 'avaliação', 'avaliações')} ${semana}`
      : `Sem avaliações ${semana}`;
    // Sem tendência, diz-se o que FALTA, não o requisito em abstrato (revisão
    // 2026-10-04: "preciso de 3 pesagens em 10 dias (tenho 9 em 8 dias)" parecia
    // cumprido, e "(tenho 1)" com 2 registos escondia que a contagem é só da
    // janela). Duas faltas distintas, pela ordem do contrato:
    //  1) menos de 3 pesagens na janela de 14 dias até à última;
    //  2) pesagens que não cobrem 10 dias (ex.: 9 pesagens em 8 dias).
    let missing = '';
    if (b.last && !b.trendKnown) {
      if (b.stale) {
        // Numa semana passada a idade conta-se do fim dessa semana, não de hoje.
        missing = isCurrent
          ? `A última pesagem tem ${b.staleDays} dias; com pesagens recentes volto a calcular a tendência.`
          : `No fim dessa semana a última pesagem tinha ${b.staleDays} dias, por isso não há tendência.`;
      } else if (!Number.isFinite(b.pointsInWindow) || !Number.isFinite(b.spanDays)) {
        missing = `Para a tendência preciso de pelo menos ${WEIGHT_TREND_MIN_POINTS} pesagens que cubram ${WEIGHT_TREND_MIN_SPAN_DAYS} dias.`;
      } else if (b.pointsInWindow < WEIGHT_TREND_MIN_POINTS) {
        missing = `Para a tendência preciso de ${WEIGHT_TREND_MIN_POINTS} pesagens nos ${WEIGHT_TREND_WINDOW_DAYS} dias até à última (${isCurrent ? 'tenho' : 'tinha'} ${b.pointsInWindow}).`;
      } else {
        missing = `Para a tendência as pesagens têm de cobrir pelo menos ${WEIGHT_TREND_MIN_SPAN_DAYS} dias (as tuas cobrem ${b.spanDays} ${plural(b.spanDays, 'dia', 'dias')}).`;
      }
    }
    corpo = {
      kpi: b.last && b.last.weight > 0 ? dec(b.last.weight, 1) : '—',
      kpiUnit: b.last && b.last.weight > 0 ? `kg${age ? ` · ${age}` : ''}` : '',
      badge,
      delta,
      subtitle: b.beforeData
        ? beforeText('avaliações', b.dataStart)
        : b.last && !b.trendKnown ? `${weekText}. ${missing}` : weekText,
    };
  }

  return { run, gym, nutri, corpo };
}

function OverviewDashboard({ scrollToTab }) {
  /* Seletor com useShallow em vez de `useAppStore()` inteiro (2026-10-04): sem
     seletor, qualquer alteração ao store — um deslize entre separadores
     mexe em `lastDashboardTab` — redesenhava este separador (e recalculava os
     seus gráficos) mesmo escondido, que era o jank do deslize. Com o shallow só
     redesenha quando um destes campos muda de referência. */
  const {
    runs,
    gymSessions,
    meals,
    bodyAssessments,
    raceEvents,
    coachPlans,
    coachPlanItems,
    profile,
    shoes,
    setEditingRaceId,
    setOpenCreationMode,
    setActiveTab,
  } = useAppStore(useShallow((s) => ({
    runs: s.runs, gymSessions: s.gymSessions, meals: s.meals, bodyAssessments: s.bodyAssessments,
    raceEvents: s.raceEvents, coachPlans: s.coachPlans, coachPlanItems: s.coachPlanItems,
    profile: s.profile, shoes: s.shoes, setEditingRaceId: s.setEditingRaceId,
    setOpenCreationMode: s.setOpenCreationMode, setActiveTab: s.setActiveTab,
  })));

  const data = { runs, gymSessions, meals, bodyAssessments, raceEvents, coachPlans, coachPlanItems, shoes };

  /* A semana de calendário do Geral (D2, 2026-10-04): ‹ › andam de semana em
     semana e os pilares são só dos dias fechados dessa semana. A vista vem da
     cache (F6); a navegação é o periodStore, como nos outros separadores. */
  const view = useEvolutionView('hub');
  const today = useTodayISO();
  const cal = useCalendarPeriod('hub', { dataStartISO: view?.dataStartISO });

  const pillars = useMemo(() => (view ? pillarsOf(view) : null), [view]);

  // Tocar num pilar abre o separador NO MESMO PERÍODO (D2): a semana que se está a
  // ver aqui, não a omissão do separador. `setPeriod` antes de `scrollToTab`, para o
  // separador já estar na semana certa quando fica à vista.
  const offset = view?.offset ?? 0;
  const openTab = (tab) => {
    usePeriodStore.getState().setPeriod(tab, 'semana', offset);
    scrollToTab(tab);
  };

  /* ─────────────── Ponto 7: a Visão Geral sem dados ───────────────
     Mock "Dashboard · sem dados". Sem um único registo, os quatro pilares
     mostravam "—" com badges "Sem dados", a Análise Cruzada abria vazia e a
     Prontidão dava uma percentagem calculada sobre nada — quatro maneiras
     de dizer o mesmo, nenhuma delas a dizer o que fazer a seguir. Passa a
     ser o cartão do mock mais a lista "O que falta para começar", que é a
     única coisa acionável neste estado. O cartão da prova fica, se houver
     prova: "até lá mostro-te o que já tenho".
     Os textos são os do mock, finais. */
  const hasNoRecords =
    (runs?.length || 0) === 0 &&
    (gymSessions?.length || 0) === 0 &&
    (meals?.length || 0) === 0 &&
    (bodyAssessments?.length || 0) === 0;

  // O7 (2026-10-04): os critérios são os de utils/gettingStarted.js, os mesmos do
  // cartão do Início — a lista dizia "0 de 7" sobre dias que incluíam hoje, a meio.
  const ONCLICK = {
    perfil: () => setActiveTab('perfil'),
    prova: () => setOpenCreationMode('race'),
    corridas: () => setOpenCreationMode('run'),
    refeicoes: () => setOpenCreationMode('meal'),
  };
  const checklist = useMemo(
    () => buildGettingStarted({ profile, raceEvents, runs, meals, todayISO: today }),
    [profile, raceEvents, runs, meals, today],
  ).map((item) => ({ ...item, onClick: ONCLICK[item.key] }));

  if (hasNoRecords) {
    return (
      <div className="space-y-3 fade-in pb-8 pt-2" data-testid="overview-empty">
        {(raceEvents?.length || 0) > 0 && (
          <RaceReadinessCard
            runs={runs}
            meals={meals}
            bodyAssessments={bodyAssessments}
            gymSessions={gymSessions}
            raceEvents={raceEvents}
            profile={profile}
            coachPlans={coachPlans}
            coachPlanItems={coachPlanItems}
            onClickRace={(id) => setEditingRaceId(id)}
          />
        )}

        <EmptyModuleState icon={<ChartNoAxesColumn size={22} />}>
          A prontidão precisa de duas semanas de registos para dizer alguma coisa útil. Até lá mostro-te o que já tenho.
        </EmptyModuleState>

        <SectionLabel style={{ margin: '6px 2px 0' }}>O que falta para começar</SectionLabel>

        <div
          style={{
            borderRadius: 'var(--radius-xl)',
            background: 'var(--surface-glass)',
            border: '1px solid var(--border-glass)',
            padding: '6px 16px',
          }}
        >
          {checklist.map((item, i) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: i < checklist.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none',
              }}
            >
              <span
                aria-hidden="true"
                style={item.done
                  ? {
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--tint-ok-bg)', border: '1px solid var(--tint-ok-bd)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ok)',
                    }
                  : { width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: '1px dashed rgba(255,255,255,.28)' }}
              >
                {item.done && <Check size={12} />}
              </span>

              {item.done ? (
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-3)', padding: '13px 0' }}>
                  {item.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                    minHeight: 'var(--tap)', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 'var(--text-sm)', color: 'var(--text-3)', padding: 0,
                  }}
                >
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.progress
                    ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.progress}</span>
                    : <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sem vista (nunca acontece com a do Geral registada por import) não há o que mostrar.
  if (!view || !pillars) return null;

  return (
    <div className="space-y-4 fade-in pb-8 pt-2">
      {/* ─── Secção 1: Visão Estratégica ──────────────── */}
      <div className="px-1">
        <p className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-widest mb-2">Visão Estratégica</p>
      </div>

      <RaceReadinessCard
        runs={runs}
        meals={meals}
        bodyAssessments={bodyAssessments}
        gymSessions={gymSessions}
        raceEvents={raceEvents}
        profile={profile}
        coachPlans={coachPlans}
        coachPlanItems={coachPlanItems}
        onClickRace={(id) => setEditingRaceId(id)}
      />

      <SmartInsightsBanner data={data} profile={profile} maxItems={3} />

      {/* ─── Secção 2: os 4 pilares, por semana de calendário ──────── */}
      <div className="px-1 mt-2">
        <p className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-widest mb-2">Os 4 pilares</p>
      </div>

      {/* Só "Semana" (D2): ‹ › andam de semana em semana; o Geral não tem seletor
          de tipo de período. Cartão de vidro como o do PeriodHeader. */}
      <section
        aria-label="Período"
        style={{
          borderRadius: 'var(--radius-2xl)',
          padding: '14px 16px',
          background: 'var(--surface-glass)',
          border: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <PeriodNav cal={cal} module="hub" />
      </section>

      {view.earlyState === 'a_comecar' && view.period.isCurrent && (
        <EarlyPeriodState
          state="a_comecar"
          kind="semana"
          module="hub"
          onViewPrevious={cal.prev}
          previousSummary={previousWeekText(view.previousWeek)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <PillarSummaryCard
          title="Corrida"
          icon={PILLAR_ICONS.corrida}
          kpi={pillars.run.kpi}
          kpiUnit={pillars.run.kpiUnit}
          badge={pillars.run.badge}
          delta={pillars.run.delta}
          subtitle={pillars.run.subtitle}
          onClick={() => openTab('corrida')}
        />
        <PillarSummaryCard
          title="Ginásio"
          icon={PILLAR_ICONS.ginasio}
          kpi={pillars.gym.kpi}
          kpiUnit={pillars.gym.kpiUnit}
          badge={pillars.gym.badge}
          delta={pillars.gym.delta}
          subtitle={pillars.gym.subtitle}
          onClick={() => openTab('ginasio')}
        />
        <PillarSummaryCard
          title="Nutrição"
          icon={PILLAR_ICONS.nutricao}
          kpi={pillars.nutri.kpi}
          kpiUnit={pillars.nutri.kpiUnit}
          badge={pillars.nutri.badge}
          delta={pillars.nutri.delta}
          subtitle={pillars.nutri.subtitle}
          onClick={() => openTab('nutricao')}
        />
        <PillarSummaryCard
          title="Corpo"
          icon={PILLAR_ICONS.corpo}
          kpi={pillars.corpo.kpi}
          kpiUnit={pillars.corpo.kpiUnit}
          badge={pillars.corpo.badge}
          delta={pillars.corpo.delta}
          subtitle={pillars.corpo.subtitle}
          onClick={() => openTab('corpo')}
        />
      </div>

      {/* R2: hoje ainda não acabou. O Geral não tem vista "Dia" (sem "toca em Dia")
          e o Corpo e o ACWR contam hoje: o texto diz o que cada pilar faz de facto. */}
      <TodayExcludedNote period={view.period} text={TODAY_NOTE} />
      {view.nutrition.approxGoals && view.nutrition.enough && (
        <p
          data-testid="approx-goals-note"
          style={{ margin: 0, padding: '0 12px', textAlign: 'center', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-normal)', color: 'var(--text-4)' }}
        >
          {APPROX_GOALS_NOTE}
        </p>
      )}

      {/* ─── Secção 3: Análise Cruzada (colapsada) ───── */}
      <div className="px-1 mt-2">
        <p className="text-[11px] font-bold text-[var(--text-3)] uppercase tracking-widest mb-2">Análise Cruzada</p>
      </div>

      <CrossAnalysisSection
        runs={runs}
        gymSessions={gymSessions}
        meals={meals}
        bodyAssessments={bodyAssessments}
      />
    </div>
  );
}

/* React.memo (2026-10-04): ver Run.jsx. A única prop é `scrollToTab`, que o
   Dashboard passa estável (useCallback) — por isso o memo vale. */
export default React.memo(OverviewDashboard);
