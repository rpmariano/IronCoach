import { registerEvolutionView } from '../registry';
import {
  calendarPeriod,
  previousPeriod,
  periodLabel,
  periodEarlyState,
  closedDaysOf,
  addDaysISO,
  mondayOf,
} from '@formulas/calendarPeriod.ts';
import { computeSessionVolumeKg } from '@formulas/sessionVolumeKg.ts';
import { computeMuscleGroupVolumeDetailed } from '@formulas/muscleGroupVolume.ts';
import { computeClassAnalytics } from '@formulas/classAnalytics.ts';
import { computeExerciseProgression } from '@formulas/strengthProgression.ts';
import { runsOnly } from '@formulas/runKinds.ts';
import { gymVerdict, GYM_TARGET_PER_WEEK, gymMinClosedWeeks } from '../../../utils/verdicts/gym';
import { whereOf, pickFallbackPeriod, closedWeekStarts, nextWeekCloseISO } from '../../../components/BI/period/periodText';

/**
 * Vista do Ginásio por período de calendário (2026-10-04, fase 5 do plano da
 * Evolução — erros G2, G3, G4, G6, G7 e D5; plano §3 "Ginásio").
 *
 * Tudo o que o separador mostra sai daqui, calculado UMA vez por período
 * (cache em tempo morto, F6) e só com DIAS FECHADOS (R2: hoje ainda não
 * acabou). As contas "por semana" usam só semanas FECHADAS (seg–dom inteiras
 * dentro do período, desde o 1.º registo): numerador e denominador são das
 * mesmas semanas (G2). Só conta treino de FORÇA nas frequências; as aulas
 * (kind 'aula') entram à parte.
 *
 * D5: o KPI "Vol. Carga" e o gráfico "Volume diário" somavam kg de exercícios
 * diferentes e saem; o ACWR do ginásio também. Entra a progressão por
 * exercício (strengthProgression.ts). O volume-carga semanal fica, mas com
 * semanas de calendário e zeros explícitos (G3/G4).
 *
 * Pura: o resultado só depende de (deps, período, hoje). Nada é congelado —
 * o Chart.js escreve nos arrays de `data`.
 */

/** Dias fechados mínimos para tirar conclusões do período (R6). */
export const GYM_MIN_CLOSED = 4;
/** O gráfico semanal mostra pelo menos estas semanas (4 fechadas + 1 em curso/última). */
export const CHART_MIN_WEEKS = 5;
/** Aulas com RPE (ou semanas) mínimas para mostrar uma média (R6). */
export const MIN_CLASSES_FOR_RPE = 3;
/** Exercícios mostrados na progressão; os restantes dizem-se numa nota. */
export const MAX_PROGRESSION_ROWS = 8;
/** Sessões do MESMO exercício para o comparar (G5, 2026-10-05): num mês ou mais
 *  2; numa semana 1 — quem treina em split (pernas um dia, peito outro) nunca tem
 *  2 sessões do mesmo exercício em 7 dias. Na semana compara a melhor série com
 *  a da semana anterior. */
export const progressionMinSessions = (kind) => (kind === 'semana' ? 1 : 2);

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const dayOf = (s) => (typeof s?.date === 'string' && s.date.length >= 10 ? s.date.slice(0, 10) : null);
const isClass = (s) => s?.kind === 'aula';
const dayNum = (iso) => Number(iso.slice(8, 10));
const monthShort = (iso) => MONTHS_SHORT[Number(iso.slice(5, 7)) - 1];
/** "21 set". */
export const dayLabel = (iso) => `${dayNum(iso)} ${monthShort(iso)}`;
/** "21 – 26 set", "28 set – 3 out", "3 out". Com `todayISO`, o ano aparece
 *  quando o intervalo não é do ano de hoje ("1 out – 29 dez 2025"), como no
 *  formatRange partilhado (2026-10-04, revisão). */
export function fmtRange(a, b, todayISO) {
  const yb = b.slice(0, 4);
  const ya = a.slice(0, 4);
  const withYear = !!todayISO && (yb !== todayISO.slice(0, 4) || ya !== todayISO.slice(0, 4));
  if (a === b) return withYear ? `${dayLabel(a)} ${ya}` : dayLabel(a);
  const startYear = withYear && ya !== yb ? ` ${ya}` : '';
  const endYear = withYear ? ` ${yb}` : '';
  if (a.slice(0, 7) === b.slice(0, 7)) return `${dayNum(a)} – ${dayNum(b)} ${monthShort(b)}${endYear}`;
  return `${dayLabel(a)}${startYear} – ${dayLabel(b)}${endYear}`;
}
const maxISO = (a, b) => (a > b ? a : b);

// ── Contagens de uma janela de dias ───────────────────────────────────────

function windowStats(sessions, from, to) {
  let strength = 0;
  let classes = 0;
  const strengthDays = new Set();
  const classDays = new Set();
  if (from && to && from <= to) {
    for (const s of sessions) {
      const d = dayOf(s);
      if (!d || d < from || d > to) continue;
      if (isClass(s)) { classes++; classDays.add(d); } else { strength++; strengthDays.add(d); }
    }
  }
  return { from, to, strength, classes, strengthDays: strengthDays.size, classDays: classDays.size, total: strength + classes };
}

/** Sessões de uma lista de semanas: força, aulas, kg e semanas no alvo. */
function weeksStats(sessions, weekStarts) {
  const index = new Map(weekStarts.map((m, i) => [m, i]));
  const weeks = weekStarts.map((weekStart) => ({ weekStart, strength: 0, classes: 0, load: 0 }));
  if (weekStarts.length) {
    for (const s of sessions) {
      const d = dayOf(s);
      if (!d) continue;
      const i = index.get(mondayOf(d));
      if (i === undefined) continue;
      if (isClass(s)) weeks[i].classes++;
      else { weeks[i].strength++; weeks[i].load += computeSessionVolumeKg(s); }
    }
  }
  const n = weeks.length;
  const strength = weeks.reduce((a, w) => a + w.strength, 0);
  const classes = weeks.reduce((a, w) => a + w.classes, 0);
  const onTarget = weeks.filter((w) => w.strength >= GYM_TARGET_PER_WEEK).length;
  return {
    weeks: n,
    list: weeks,
    strength,
    classes,
    onTarget,
    onTargetPct: n > 0 ? Math.round((onTarget * 100) / n) : null,
    perWeekStrength: n > 0 ? strength / n : null,
    perWeekClasses: n > 0 ? classes / n : null,
    loads: weeks.map((w) => w.load),
  };
}

// ── Volume-carga semanal para o gráfico (G3/G4) ───────────────────────────

/**
 * Semanas de calendário (seg–dom) que tocam o período — e pelo menos
 * CHART_MIN_WEEKS, acabando na do período — com ZEROS explícitos nas que não
 * tiveram treino (G4: antes só havia barras das semanas COM sessões). O valor
 * de uma semana é o volume real dessa semana (também dos dias fora do período)
 * até ONTEM: hoje não entra (R2). A semana em curso vem marcada `inProgress` e
 * o gráfico deixa-a fora da média e do delta; a que começa antes do 1.º
 * registo vem `partial`. Semanas inteiras antes do 1.º registo não existem
 * (não são zeros).
 */
function weeklyChart(sessions, period, todayISO, dataStartISO, kind) {
  if (!dataStartISO) return [];
  const yesterday = addDaysISO(todayISO, -1);
  /* 2026-10-05: num período PASSADO o gráfico mostra só as semanas do período
     (as que intersetam [início, fim], cortadas ao fim dele): antes juntava-se
     sempre a semana em curso e 4 semanas até hoje, e as do trimestre ficavam
     esborratadas ao lado de números de hoje. O preenchimento até
     CHART_MIN_WEEKS só faz sentido no período em curso — e na Semana passada,
     onde anda para trás a partir de mondayOf(fim) e nunca chega à semana de
     hoje: sem ele a Semana recuada ficava com 1 barra, sem delta nem média. */
  const lastWeek = mondayOf(period.isCurrent ? todayISO : period.end);
  let firstWeek = mondayOf(period.start);
  if (period.isCurrent || kind === 'semana') {
    const minFirst = addDaysISO(lastWeek, -7 * (CHART_MIN_WEEKS - 1));
    if (minFirst < firstWeek) firstWeek = minFirst;
  }
  // Último dia que conta: ontem (R2) e, num período passado, o fim do período.
  const limit = !period.isCurrent && period.end < yesterday ? period.end : yesterday;

  const perDay = new Map();
  for (const s of sessions) {
    const d = dayOf(s);
    if (!d || isClass(s)) continue;
    perDay.set(d, (perDay.get(d) || 0) + computeSessionVolumeKg(s));
  }

  const out = [];
  for (let m = firstWeek; m <= lastWeek; m = addDaysISO(m, 7)) {
    const end = addDaysISO(m, 6);
    if (end < dataStartISO) continue;
    let load = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDaysISO(m, i);
      if (d > limit) break;
      load += perDay.get(d) || 0;
    }
    // `cut`: semana de um período passado que continua depois do fim dele —
    // o valor é só até ao fim do período, não é uma semana inteira.
    const cut = !period.isCurrent && end > period.end && period.end <= yesterday;
    out.push({
      weekStart: m,
      weekLabel: dayLabel(m),
      volumeLoad: Math.round(load),
      inProgress: !cut && end > yesterday,
      cut,
      partial: m < dataStartISO,
    });
  }
  return out;
}

// ── Aulas: contagens que a fórmula partilhada não devolve ─────────────────

/** Nome(s) de modalidade de uma aula — a mesma regra de classAnalytics.ts. */
const classNames = (s) => {
  const raw = Array.isArray(s.class_types) && s.class_types.length > 0 ? s.class_types : s.name ? [s.name] : ['Aula de Grupo'];
  return raw.map((r) => String(r).trim());
};
const classRpe = (s) => {
  const v = s.exertion != null ? Number(s.exertion) : s.rpe != null ? Number(s.rpe) : null;
  return v !== null && !Number.isNaN(v) ? v : null;
};

/** Quantas aulas têm RPE, no geral e por modalidade (G6, "N de M aulas"). */
function classRpeCounts(classSessions) {
  let overall = 0;
  const byName = {};
  // G7 por modalidade: em quantas aulas de cada uma há duração.
  const durationByName = {};
  for (const s of classSessions) {
    if (Number(s.duration_seconds || 0) > 0) {
      for (const n of classNames(s)) durationByName[n] = (durationByName[n] || 0) + 1;
    }
    if (classRpe(s) === null) continue;
    overall++;
    for (const n of classNames(s)) byName[n] = (byName[n] || 0) + 1;
  }
  return { overall, byName, durationByName };
}

// ── O nome curto do período anterior, para "face a …" ─────────────────────

function shortName(title, kind, todayISO) {
  const t = String(title || '').trim();
  if (!t) return '';
  if (kind === 'mes') {
    const [name, year] = t.split(' ');
    return year && Number(year) === Number(todayISO.slice(0, 4)) ? name : t;
  }
  return t.charAt(0).toLowerCase() + t.slice(1);
}

const GYM_KINDS = ['semana', 'mes', 'trimestre'];
const capFirst = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// ── A vista ───────────────────────────────────────────────────────────────

export function buildGymView([sessionsIn, runsIn], periodSel, todayISO) {
  const sessions = Array.isArray(sessionsIn) ? sessionsIn : [];
  // Só corridas: o veredicto fala do "volume de corrida" (caminhadas à parte, runKinds.ts, 2026-10-05).
  const runsList = Array.isArray(runsIn) ? runsOnly(runsIn) : [];
  const kind = periodSel?.kind || 'mes';
  const offset = periodSel?.offset ?? 0;
  const period = calendarPeriod(kind, todayISO, offset);
  const previous = previousPeriod(period, todayISO);

  const dates = sessions.map(dayOf).filter(Boolean);
  const dataStartISO = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;

  const minWeeks = gymMinClosedWeeks(kind);
  const calEarly = periodEarlyState(period, todayISO, GYM_MIN_CLOSED);
  // A janela dos números: dias fechados do período, a partir do 1.º registo (R7).
  const closedDays = dataStartISO ? closedDaysOf(period, todayISO, dataStartISO) : [];
  const from = closedDays.length ? closedDays[0] : null;
  const to = closedDays.length ? closedDays[closedDays.length - 1] : null;
  const beforeData = !!dataStartISO && dataStartISO > period.end;
  /* O estado de arranque conta os dias fechados COM registo (a partir do 1.º):
     quem começou a 2 out não tem "3 dias fechados" em outubro, tem 2 (R6/R7).
     Sem nenhum e com o 1.º registo de hoje, é "a começar" na mesma, mas o
     título não diz "o mês começou hoje" (firstDay). */
  /* 2026-10-05 (G1): "ainda é cedo" só num período EM CURSO, como na Corrida.
     Num fechado (setembro com o 1.º registo a 28 set) nunca vai ficar mais tarde:
     os números são factos, e a progressão prometia "aparece a partir de 4 dias
     fechados" sobre um período que já acabou. */
  const earlyState = beforeData ? calEarly
    : (calEarly === 'a_comecar' || closedDays.length === 0) ? 'a_comecar'
    : (period.isCurrent && closedDays.length < Math.min(GYM_MIN_CLOSED, period.totalDays)) ? 'cedo' : 'ok';
  const firstDay = earlyState === 'a_comecar' && calEarly !== 'a_comecar';

  const cur = windowStats(sessions, from, to);

  // ── As semanas fechadas que tocam o período (G2/G7) ──
  const wkStarts = closedWeekStarts(period.start, period.end, todayISO, dataStartISO);
  const wk = weeksStats(sessions, wkStarts);
  const weeksRange = wkStarts.length ? fmtRange(wkStarts[0], addDaysISO(wkStarts[wkStarts.length - 1], 6), todayISO) : null;
  const weeksNextClose = nextWeekCloseISO(period.start, period.end, todayISO, dataStartISO);

  // ── O período anterior, equivalente e fechado (R5) ──
  const prevLabelFull = periodLabel(previous, todayISO, { dataStartISO });
  const prevName = shortName(prevLabelFull.title, kind, todayISO);
  const prevCoverage = !dataStartISO || dataStartISO > previous.end ? 'none' : dataStartISO > previous.start ? 'partial' : 'full';
  const prevFrom = prevCoverage === 'none' ? null : maxISO(previous.start, dataStartISO);
  const prevFull = prevCoverage === 'none' ? null : windowStats(sessions, prevFrom, previous.end);
  const prevWk = prevCoverage === 'none' ? null
    : weeksStats(sessions, closedWeekStarts(previous.start, previous.end, todayISO, dataStartISO));

  /* As janelas da comparação (2026-10-04, revisão: período fechado de tamanho
     diferente). Num período EM CURSO comparam-se as mesmas N primeiras datas dos
     dois ("21 – 26 set"). Num período FECHADO compara-se o período inteiro com o
     anterior inteiro: cortar a N = min(dias, dias do anterior) deixava de fora o
     31 de outubro contra setembro, e os últimos dias de um trimestre de 92 dias
     contra um de 90, e o rótulo "setembro" fingia uma comparação completa. */
  const cmp = (() => {
    if (prevCoverage !== 'full') return null;
    if (!period.isCurrent) {
      return { cur: { from: period.start, to: period.end }, prev: { from: previous.start, to: previous.end }, label: prevName, days: previous.totalDays };
    }
    const n = Math.min(period.closedDays, previous.totalDays);
    const prevEnd = addDaysISO(previous.start, n - 1);
    return {
      cur: { from: period.start, to: addDaysISO(period.start, n - 1) },
      prev: { from: previous.start, to: prevEnd },
      label: n === previous.totalDays ? prevName : fmtRange(previous.start, prevEnd, todayISO),
      days: n,
    };
  })();

  let delta = null;
  let weeksDelta = null;
  if (cmp && earlyState === 'ok') {
    const c = windowStats(sessions, cmp.cur.from, cmp.cur.to);
    const p = windowStats(sessions, cmp.prev.from, cmp.prev.to);
    if (c.total + p.total > 0) {
      delta = {
        label: cmp.label,
        windowDays: cmp.days,
        strength: { cur: c.strength, prev: p.strength },
        classes: { cur: c.classes, prev: p.classes },
      };
    }
    // "X de N semanas com 2+ treinos" contra o anterior, em % (mock-up): só
    // com semanas que cheguem dos dois lados (R6).
    if (kind !== 'semana' && wk.weeks >= minWeeks && prevCoverage === 'full' && prevWk && prevWk.weeks >= minWeeks) {
      weeksDelta = {
        current: wk.onTargetPct,
        previous: prevWk.onTargetPct,
        previousLabel: prevName,
        previousText: `${prevWk.onTarget} de ${prevWk.weeks} (${prevWk.onTargetPct}%)`,
      };
    }
  }

  // ── Dentro do período ──
  const inWindow = (s) => { const d = dayOf(s); return !!(d && from && d >= from && d <= to); };
  const closedSessions = from ? sessions.filter(inWindow) : [];
  const closedClasses = closedSessions.filter(isClass);

  const weeklyData = weeklyChart(sessions, period, todayISO, dataStartISO, kind);

  // Séries por músculo, em séries/semana, sobre as semanas fechadas (G1, D5).
  const muscle = (() => {
    if (wk.weeks === 0) return { weeks: 0, groups: [], multiGroupSessions: 0 };
    const a = wk.list[0].weekStart;
    const b = addDaysISO(wk.list[wk.list.length - 1].weekStart, 6);
    const inWeeks = sessions.filter((s) => { const d = dayOf(s); return d && d >= a && d <= b; });
    let res;
    try {
      // 'periodo' não é um filtro relativo: a lista já vem recortada.
      res = computeMuscleGroupVolumeDetailed(inWeeks, todayISO, 'periodo');
    } catch {
      res = { groups: {}, multiGroupSessions: 0 };
    }
    const groups = Object.keys(res.groups)
      .map((name) => ({ name, sets: res.groups[name].sets, perWeek: res.groups[name].sets / wk.weeks }))
      .sort((x, y) => y.sets - x.sets || x.name.localeCompare(y.name));
    return { weeks: wk.weeks, groups, multiGroupSessions: res.multiGroupSessions };
  })();

  // Progressão por exercício (D5): só com o período em condições (R6) e um
  // anterior equivalente e fechado com os mesmos dias de cada lado (R5).
  const progression = (() => {
    const base = { rows: [], withoutPrevious: 0, hidden: 0, label: '', minSessions: progressionMinSessions(kind) };
    if (earlyState !== 'ok' || !cmp || !from) return base;
    // A mesma regra das janelas do ▲/▼: em curso, as N primeiras datas; fechado, tudo.
    const res = computeExerciseProgression(sessions, cmp.cur, cmp.prev, { minSessions: progressionMinSessions(kind) });
    return {
      rows: res.rows.slice(0, MAX_PROGRESSION_ROWS),
      hidden: Math.max(0, res.rows.length - MAX_PROGRESSION_ROWS),
      withoutPrevious: res.withoutPrevious,
      label: cmp.label,
      minSessions: progressionMinSessions(kind),
    };
  })();

  /* ── Onde estão os dados quando o período ainda não chega (M2/M4/G2/G7) ──
     Cada porta fechada diz para onde ir: o período anterior equivalente e, se nem
     esse chega, o tipo maior (a vista só os descreve; o ecrã liga o botão). */
  const pickFb = (min, countIn, kinds = GYM_KINDS) => pickFallbackPeriod({
    kind, offset, todayISO, dataStartISO, kinds, min, countIn,
  });
  const weeksOf = (p) => closedWeekStarts(p.start, p.end, todayISO, dataStartISO);
  const periodOfFb = (fb) => (fb.type === 'prev' ? previousPeriod(period, todayISO) : calendarPeriod(fb.kind, todayISO, fb.offset || 0));
  const dsISO = dataStartISO;
  const windowOf = (p) => ({ from: dsISO && dsISO > p.start ? dsISO : p.start, to: p.lastClosed });

  const fbWeeks = kind !== 'semana' && wk.weeks < minWeeks
    ? pickFb(1, (f, t, p) => { const n = weeksOf(p).length; return n >= gymMinClosedWeeks(p.kind) ? n : 0; })
    : null;
  // "Em setembro: 3 de 4 semanas com 2+ treinos de força." — o facto que o período tem.
  const weeksHint = (() => {
    if (!fbWeeks) return null;
    const st = weeksStats(sessions, weeksOf(periodOfFb(fbWeeks)));
    if (st.weeks === 0) return null;
    return `${capFirst(fbWeeks.where)}: ${st.onTarget} de ${st.weeks} semanas com ${GYM_TARGET_PER_WEEK}+ treinos de força.`;
  })();
  const fbMuscle = muscle.groups.length === 0
    ? pickFb(1, (f, t, p) => weeksStats(sessions, weeksOf(p)).strength)
    : null;
  /* 2026-10-05 (verificação no browser): também com o período "ok" mas sem
     nenhum exercício comparável — outubro a 5 dizia "preciso de um exercício
     com pelo menos 2 sessões…" sem dizer que setembro já tem a sua. */
  const fbProgression = earlyState !== 'a_comecar' && (earlyState !== 'ok' || progression.rows.length === 0)
    ? pickFb(1, (f, t, p) => {
      const pp = previousPeriod(p, todayISO);
      if (!dsISO || dsISO > pp.end) return 0;
      return computeExerciseProgression(sessions, { from: f, to: t }, { from: pp.start, to: pp.end }, { minSessions: progressionMinSessions(kind) }).rows.length;
    }, [])
    : null;
  // Qualquer treino (força ou aula): para o período vazio / "cedo" dizerem onde há.
  const fbData = cur.total === 0 || earlyState === 'cedo'
    ? (() => {
      const fb = pickFb(1, (f, t) => windowStats(sessions, f, t).total);
      if (!fb) return null;
      const w = windowOf(periodOfFb(fb));
      const st = windowStats(sessions, w.from, w.to);
      return { ...fb, strength: st.strength, classes: st.classes };
    })()
    : null;

  // Aulas: análise da fórmula partilhada + os denominadores que ela não dá.
  const classAn = computeClassAnalytics(closedClasses, todayISO, 'periodo');
  const rpeCounts = classRpeCounts(closedClasses);

  const lastSessionDate = (() => {
    const limit = to || addDaysISO(period.start, -1);
    let best = null;
    for (const d of dates) if (d <= limit && (!best || d > best)) best = d;
    return best;
  })();

  const curLabel = periodLabel(period, todayISO, { dataStartISO });
  const scope = whereOf(kind, curLabel.title, period.isCurrent);

  const runsInPeriod = from
    ? runsList.filter((r) => { const d = dayOf(r); return !!(d && d >= from && d <= to); }).length
    : 0;
  const verdict = gymVerdict({
    kind,
    isCurrent: period.isCurrent,
    scope,
    periodStrength: cur.strength,
    classes: cur.classes,
    closedWeeks: wk.weeks,
    strengthInWeeks: wk.strength,
    weeklyLoads: wk.loads,
    // Corridas dos dias fechados do período (revisão: uma corrida há um ano não
    // justifica "para aguentares o volume de corrida").
    runCount: runsInPeriod,
    observedDays: closedDays.length,
    early: earlyState,
    minClosedWeeks: minWeeks,
    earlyHint: weeksHint,
  });

  return {
    today: todayISO,
    kind,
    offset,
    period,
    previous,
    dataStartISO,
    hasSessions: sessions.length > 0,
    beforeData,
    earlyState,
    firstDay,
    scope,
    closedDays: closedDays.length,
    cur,
    weeks: {
      count: wk.weeks,
      min: minWeeks,
      range: weeksRange,
      nextCloseISO: weeksNextClose,
      strength: wk.strength,
      classes: wk.classes,
      onTarget: wk.onTarget,
      onTargetPct: wk.onTargetPct,
      perWeekStrength: wk.perWeekStrength,
      perWeekClasses: wk.perWeekClasses,
    },
    prevName,
    prevLabel: { title: prevLabelFull.title, range: prevLabelFull.range, coverage: prevLabelFull.coverage || null },
    prevCoverage,
    prevFull,
    prevWeeks: prevWk ? { count: prevWk.weeks, onTarget: prevWk.onTarget, onTargetPct: prevWk.onTargetPct } : null,
    delta,
    weeksDelta,
    weeklyData,
    muscle,
    progression,
    fallbacks: { weeks: fbWeeks, muscle: fbMuscle, progression: fbProgression, data: fbData },
    classes: {
      ...classAn,
      rpeCount: rpeCounts.overall,
      rpeCountByName: rpeCounts.byName,
      durationCountByName: rpeCounts.durationByName,
    },
    lastSessionDate,
    todaySessions: windowStats(sessions, todayISO, todayISO),
    verdict,
  };
}

registerEvolutionView('ginasio', {
  deps: (s) => [s.gymSessions, s.runs],
  build: buildGymView,
});

export default buildGymView;
