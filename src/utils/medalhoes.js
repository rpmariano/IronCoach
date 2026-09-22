/* O Palmarés — os medalhões (specs/palmares-medalhoes.md).

   Seis medalhões, sempre pela mesma ordem, cada um com os seus encaixes. O
   encaixe vazio à vista é o objetivo; a estrela encaixada é o facto. Tudo se
   recalcula dos dados que já existem — corridas, provas, planos da Carol —
   sem rede e sem relógio escondido: `today` entra como argumento, para os
   testes e para o momento da medalha nunca discordarem sobre o dia.

   Este ficheiro é UMA das duas vistas do motor dos prémios: as regras (que
   provas contam, o que é objetivo batido, o que é um elo de sequência, o que
   é trail) vivem em `utils/premios.js` e são as mesmas que `utils/
   achievements.js` usa para as conquistas de cada prova. Aqui só se conta,
   se data e se escreve a frase — nada se decide duas vezes.

   O que NÃO se recalcula (quando o atleta viu o momento, as re-cunhagens já
   guardadas) vive em `medal_awards`, sincronizado por `utils/medalAwards.js`
   a partir da lista `due` que esta função devolve.

   Datas: ver `utils/premios.js` — tudo é aritmética de calendário em UTC
   sobre strings `YYYY-MM-DD`.

   Quando se fecha um período: um mês (semana, trimestre...) só está fechado
   no dia a SEGUIR ao último dia — no próprio último dia ainda se pode correr.
   Por isso as medalhas que se ganham "no fecho" (a primeira de cada encaixe
   d'O Ano em Km) têm `awardedOn` = o primeiro dia depois do período: é o
   primeiro dia em que os dados o provam.

   As cores seguem a lei da app, uma cor um significado: ciano é o módulo da
   corrida (O Ano em Km, o volume; Os Níveis, o tempo), âmbar é a prova em
   si (As Distâncias), verde é o objetivo batido (A Superação, o mesmo tom
   da conquista `objetivo_batido`). O que só conta ocorrências — O Terreno e
   A Sequência — fica em prata, sem esmalte: não há cor para "quantas". */

import {
  TERRENOS,
  addDays,
  bateuObjetivo,
  capitalize,
  completedRaces,
  dayOf,
  daysBetween,
  fmtKmLinha,
  newestFirst,
  plural,
  provasDoTerreno,
  requireToday,
  runKindLabel,
  varrerSequencia,
} from './premios';
import { findRaceRun, formatDuration, formatPace, raceDistanceLabel } from './run';
import { formatDelta } from './raceOutcome';
import { calculateVDOT } from '@formulas/racePrediction.ts';
import { computeBestPace } from '@formulas/bestPace.ts';

export const MEDALHAO_KEYS = ['ano_km', 'distancias', 'niveis', 'terreno', 'sequencia', 'superacao'];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Datas ────────────────────────────────────────────────────────────────

function isoOf(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Último dia do mês `m` (1–12) do ano `y`. */
function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "10 set", com o ano quando não é o de hoje ("10 set 2025"). */
function fmtDate(iso, todayYear) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const base = `${Number(d)} ${MESES_CURTOS[Number(m) - 1]}`;
  return y === todayYear ? base : `${base} ${y}`;
}

// ── Números ──────────────────────────────────────────────────────────────

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "1 240": espaço de milhar, como o resto da app. */
function milhares(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Km como se gravam na estrela: inteiros a partir de 10 ("182"), uma casa
 *  decimal abaixo disso ("9,5"). */
function fmtKm(value) {
  const v = Math.max(0, value || 0);
  if (v >= 10) return milhares(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return String(r).replace('.', ',');
}

/** O que falta para ULTRAPASSAR um valor — nunca "a 0 km". */
function fmtKmRemaining(value) {
  const v = Math.max(value, 0);
  if (v >= 10) return milhares(Math.max(1, Math.ceil(v)));
  return String(Math.max(0.1, Math.ceil(v * 10) / 10)).replace('.', ',');
}

const round2 = (v) => Math.round(v * 100) / 100;

/** "a", "a e b", "a, b e c". */
function juntar(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

// ── Blocos comuns ────────────────────────────────────────────────────────

function slot(fields) {
  return {
    key: '',
    label: '',
    shortLabel: '',
    state: 'empty',
    enamel: 'amber',
    value: null,
    valueLabel: null,
    periodKey: '',
    awardedOn: null,
    raceId: null,
    detail: '',
    progress: null,
    remainingLabel: null,
    wins: 0,
    contributions: [],
    contributionsPeriodLabel: null,
    contributionsSummary: null,
    ...fields,
  };
}

// ── Os registos por trás de um encaixe ──────────────────────────────────

/* Cada encaixe leva `contributions`: os registos que o encheram (ou que o
   estão a encher), da mais recente para a mais antiga, para a persiana dos
   registos (Perfil/MedalhaoContribSheet.jsx) poder abrir cada um no sítio
   onde ele já vive. Uma corrida ligada a uma prova é `kind: 'race'` — abre o
   hub da prova, que é onde essa corrida se lê; as outras são `kind: 'run'`
   (abrem o registo da corrida); as sessões de ginásio do plano são
   `kind: 'gym'` e não abrem nada, porque o plano não guarda qual foi a
   sessão gravada. Forma: { kind, id, raceId, runId, date, title, meta }. */

/* O nome de um registo (`runKindLabel`), a distância numa linha
   (`fmtKmLinha`) e a ordem da lista (`newestFirst`) vivem no motor
   (utils/premios.js) desde que os badges de treino (utils/badges.js)
   passaram a montar as mesmas listas. */

function raceContribution({ race, run, outcome }, { metaExtra = [], ...extra } = {}) {
  return {
    kind: 'race',
    id: race.id ?? null,
    raceId: race.id ?? null,
    runId: run?.id ?? null,
    date: dayOf(race.date),
    title: race.name || 'Prova sem nome',
    meta: [
      raceDistanceLabel(Number(race.distance_km) || null),
      outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null,
      ...metaExtra,
    ].filter(Boolean).join(' · '),
    ...extra,
  };
}

function runContribution(run, raceByRun, { metaExtra = [] } = {}) {
  const race = run?.id != null ? raceByRun?.get(run.id) : null;
  const km = num(run?.distance_km);
  const meta = [
    km ? fmtKmLinha(km) : null,
    num(run?.duration_seconds) ? formatDuration(Math.round(num(run.duration_seconds))) : null,
    ...metaExtra,
  ].filter(Boolean).join(' · ');
  if (race) {
    return { kind: 'race', id: race.id ?? null, raceId: race.id ?? null, runId: run.id ?? null, date: dayOf(run.date), title: race.name || 'Prova sem nome', meta };
  }
  return { kind: 'run', id: run?.id ?? null, raceId: null, runId: run?.id ?? null, date: dayOf(run?.date), title: run?.title || run?.name || runKindLabel(run), meta };
}

function bestProgressSlot(slots) {
  let best = null;
  for (const s of slots) {
    if (s.progress == null || s.progress >= 1) continue;
    if (!best || s.progress > best.progress) best = s;
  }
  return best;
}

function medalhao({ key, name, engraving, year = null, footer = null, rule, slots, summaryMissing }) {
  const wonCount = slots.filter((s) => s.state === 'won').length;
  // As Distâncias dizem quanto falta em dias até uma prova marcada, sem
  // fração de progresso — sem este recurso a frase nunca aparecia.
  const comFrase = slots.filter((s) => s.remainingLabel);
  const top = bestProgressSlot(comFrase) || comFrase.find((s) => s.state === 'empty') || comFrase[0] || null;
  // `summaryMissing` explícito (mesmo null) manda; omitido, lista os vazios.
  const summaryTail = summaryMissing !== undefined ? summaryMissing : (() => {
    const faltam = slots.filter((s) => s.state === 'empty').map((s) => s.shortLabel || s.label);
    return faltam.length ? `falta ${juntar(faltam)}` : null;
  })();
  return {
    key,
    name,
    engraving,
    year,
    footer,
    rule,
    slots,
    wonCount,
    totalSlots: slots.length,
    progressLine: top ? capitalize(top.remainingLabel) : null,
    summary: summaryTail ? `${wonCount} de ${slots.length} · ${summaryTail}` : `${wonCount} de ${slots.length}`,
  };
}

// ── 1. O Ano em Km ───────────────────────────────────────────────────────

const GRANULARIDADES = [
  { key: 'mes', label: 'Mês', nome: 'mês', num: 'num mês', recorde: 'Mês recorde', primeiro: 'Primeiro mês' },
  { key: 'trimestre', label: 'Trimestre', nome: 'trimestre', num: 'num trimestre', recorde: 'Trimestre recorde', primeiro: 'Primeiro trimestre' },
  { key: 'semestre', label: 'Semestre', nome: 'semestre', num: 'num semestre', recorde: 'Semestre recorde', primeiro: 'Primeiro semestre' },
  { key: 'ano', label: 'Ano', nome: 'ano', num: 'num ano', recorde: 'Ano recorde', primeiro: 'Primeiro ano' },
];

/** O período civil de `iso` nesta granularidade: { key, start, end }. */
function periodOf(gran, iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  if (gran === 'mes') {
    return { key: iso.slice(0, 7), start: isoOf(y, m, 1), end: isoOf(y, m, lastDayOfMonth(y, m)) };
  }
  if (gran === 'trimestre') {
    const q = Math.ceil(m / 3);
    return { key: `${y}-Q${q}`, start: isoOf(y, q * 3 - 2, 1), end: isoOf(y, q * 3, lastDayOfMonth(y, q * 3)) };
  }
  if (gran === 'semestre') {
    const h = m <= 6 ? 1 : 2;
    return { key: `${y}-H${h}`, start: isoOf(y, h === 1 ? 1 : 7, 1), end: isoOf(y, h === 1 ? 6 : 12, h === 1 ? 30 : 31) };
  }
  return { key: String(y), start: isoOf(y, 1, 1), end: isoOf(y, 12, 31) };
}

/** "em agosto", "no 3.º trimestre", "no 2.º semestre de 2025", "em 2025". */
function periodPhrase(gran, periodKey, todayYear) {
  const y = periodKey.slice(0, 4);
  const deAno = y === todayYear ? '' : ` de ${y}`;
  if (gran === 'mes') return `em ${MESES[Number(periodKey.slice(5, 7)) - 1]}${deAno}`;
  if (gran === 'trimestre') return `no ${periodKey.slice(6)}.º trimestre${deAno}`;
  if (gran === 'semestre') return `no ${periodKey.slice(6)}.º semestre${deAno}`;
  return `em ${y}`;
}

/** "agosto de 2026", "3.º trimestre de 2026", "2026" — o título da persiana
 *  dos registos, sempre com o ano (a lista pode ser de um período antigo). */
function periodLabel(gran, periodKey) {
  const y = periodKey.slice(0, 4);
  if (gran === 'mes') return `${MESES[Number(periodKey.slice(5, 7)) - 1]} de ${y}`;
  if (gran === 'trimestre') return `${periodKey.slice(6)}.º trimestre de ${y}`;
  if (gran === 'semestre') return `${periodKey.slice(6)}.º semestre de ${y}`;
  return y;
}

/** "de setembro", "do 3.º trimestre" — para o fecho do período em curso. */
function periodPhraseDe(gran, periodKey, todayYear) {
  const em = periodPhrase(gran, periodKey, todayYear);
  if (gran === 'mes') return em.replace(/^em /, 'de ');
  if (gran === 'ano') return em.replace(/^em /, 'de ');
  return em.replace(/^no /, 'do ');
}

function anoKm({ runs, raceByRun, today, todayYear }) {
  const daily = new Map();
  // A mesma régua para a soma e para a lista dos registos: com data, com
  // quilómetros, e não no futuro.
  const counted = (runs || []).filter((r) => {
    const d = dayOf(r?.date);
    return d && num(r?.distance_km) && d <= today;
  });
  for (const r of counted) {
    const d = dayOf(r.date);
    daily.set(d, (daily.get(d) || 0) + num(r.distance_km));
  }
  const days = [...daily.keys()].sort();
  const due = [];

  const slots = GRANULARIDADES.map((g) => {
    const periods = new Map();
    for (const d of days) {
      const p = periodOf(g.key, d);
      if (!periods.has(p.key)) periods.set(p.key, { ...p, total: 0, days: [] });
      const entry = periods.get(p.key);
      entry.total += daily.get(d);
      entry.days.push(d);
    }
    const list = [...periods.values()].sort((a, b) => a.start.localeCompare(b.start));

    // Cada período compara-se com o melhor dos ANTERIORES — que, por serem
    // anteriores, já estão todos fechados quando este começa.
    const wins = [];
    let bestBefore = 0;
    for (const p of list) {
      if (bestBefore === 0) {
        // Primeira vez: ganha-se no fecho, com qualquer quilómetro.
        if (p.end < today && p.total > 0) {
          wins.push({ periodKey: p.key, awardedOn: addDays(p.end, 1), value: round2(p.total), first: true });
        }
      } else {
        // Depois: no dia em que o acumulado passa o melhor anterior.
        let cum = 0;
        for (const d of p.days) {
          cum += daily.get(d);
          if (Math.round(cum * 100) > Math.round(bestBefore * 100)) {
            wins.push({ periodKey: p.key, awardedOn: d, value: round2(p.total), first: false });
            break;
          }
        }
      }
      bestBefore = Math.max(bestBefore, p.total);
    }

    const current = periodOf(g.key, today);
    const cur = periods.get(current.key)?.total || 0;
    const bestClosed = list.filter((p) => p.end < today).reduce((m, p) => Math.max(m, p.total), 0);
    const allBest = list.reduce((m, p) => Math.max(m, p.total), 0);
    const last = wins[wins.length - 1] || null;
    const medalha = `a medalha do ${g.nome}`;

    for (const w of wins) {
      due.push({
        medalhao: 'ano_km',
        slot: g.key,
        periodKey: w.periodKey,
        value: w.value,
        valueLabel: fmtKm(w.value),
        raceId: null,
        awardedOn: w.awardedOn,
        title: w.first ? g.primeiro : g.recorde,
        line: w.first
          ? `${fmtKm(w.value)} km ${periodPhrase(g.key, w.periodKey, todayYear)} — a primeira medalha do ${g.nome}.`
          : `${fmtKm(w.value)} km ${periodPhrase(g.key, w.periodKey, todayYear)} — o teu melhor ${g.nome} de sempre.`,
      });
    }

    let progress = null;
    let remainingLabel = null;
    let detail;
    if (!last) {
      // Ainda nenhum período fechado com quilómetros: a primeira medalha
      // chega no fecho do período em curso, se houver lá corridas.
      const total = daysBetween(current.start, current.end) + 1;
      const elapsed = daysBetween(current.start, today) + 1;
      const fecho = periodPhraseDe(g.key, current.key, todayYear);
      if (cur > 0) {
        progress = Math.min(elapsed / total, 0.99);
        const faltam = daysBetween(today, current.end) + 1;
        remainingLabel = `a ${faltam} ${plural(faltam, 'dia', 'dias')} de ganhares ${medalha}`;
        detail = `${fmtKm(cur)} km até agora · ganha-se no fecho ${fecho}`;
      } else {
        progress = 0;
        detail = `corre e ${medalha} é tua no fecho ${fecho}`;
      }
    } else {
      const repetir = `para repetir: mais de ${fmtKm(allBest)} km ${g.num}`;
      detail = `ganha ${periodPhrase(g.key, last.periodKey, todayYear)} · ${repetir}`;
      if (last.periodKey !== current.key && bestClosed > 0) {
        progress = Math.min(cur / bestClosed, 0.99);
        remainingLabel = `a ${fmtKmRemaining(bestClosed - cur)} km de voltares a ganhar ${medalha}`;
      }
    }

    // Os registos do período cujo número o encaixe mostra: ganho, o melhor
    // período de sempre (o valor gravado na estrela); por ganhar, o que está
    // a decorrer.
    const shown = last
      ? list.find((p) => Math.round(p.total * 100) === Math.round(allBest * 100)) || current
      : current;
    const doPeriodo = counted.filter((r) => {
      const d = dayOf(r.date);
      return d >= shown.start && d <= shown.end;
    });
    const periodTotal = round2(doPeriodo.reduce((s, r) => s + num(r.distance_km), 0));

    return slot({
      key: g.key,
      label: g.label,
      shortLabel: g.nome,
      state: last ? 'won' : 'empty',
      // Ciano: é o volume de corrida (--run), não a prova.
      enamel: 'cyan',
      value: last ? round2(allBest) : null,
      valueLabel: last ? fmtKm(allBest) : null,
      periodKey: last ? last.periodKey : '',
      awardedOn: last ? last.awardedOn : null,
      detail,
      progress,
      remainingLabel,
      wins: wins.length,
      currentValue: round2(cur),
      currentPeriodKey: current.key,
      contributions: newestFirst(doPeriodo.map((r) => runContribution(r, raceByRun))),
      contributionsPeriodKey: shown.key,
      contributionsPeriodLabel: periodLabel(g.key, shown.key),
      contributionsTotal: periodTotal,
      contributionsSummary: doPeriodo.length
        ? `${fmtKm(periodTotal)} km · ${doPeriodo.length} ${plural(doPeriodo.length, 'corrida', 'corridas')}`
        : null,
    });
  });

  const yearTotal = days.filter((d) => d.startsWith(todayYear)).reduce((s, d) => s + daily.get(d), 0);
  return {
    medalhao: medalhao({
      key: 'ano_km',
      name: 'O Ano em Km',
      engraving: 'O ANO EM KM',
      year: todayYear,
      footer: yearTotal > 0 ? `${milhares(Math.round(yearTotal))} KM CORRIDOS` : null,
      rule: 'A primeira medalha de cada encaixe ganha-se no fecho do primeiro período com quilómetros; as seguintes, no dia em que passas o teu melhor período de sempre.',
      slots,
    }),
    due,
  };
}

// ── Provas: 2. As Distâncias, 3. Os Níveis, 6. A Superação ──────────────

/* A medalha de uma distância pede a distância OFICIAL, não a categoria de
   treino de categorizeDistance: aí a "meia" vai de 11 a 22,5 km e a
   "maratona" de 22,5 a 50 — uma prova de 15 km dava a medalha dos 21,1. A
   folga cobre o GPS e os percursos medidos por cima. */
const DISTANCIAS = [
  { key: '5k', min: 4.8, max: 5.5, label: '5 km', short: '5', nome: '5 km', primeira: 'Primeiros 5 km', recorde: 'Recorde nos 5 km' },
  { key: '10k', min: 9.5, max: 11, label: '10 km', short: '10', nome: '10 km', primeira: 'Primeiros 10 km', recorde: 'Recorde nos 10 km' },
  { key: '21k', min: 20.5, max: 22.5, label: '21,1 km', short: '21,1', nome: 'meia maratona', primeira: 'Primeira meia maratona', recorde: 'Recorde na meia maratona' },
  { key: '42k', min: 41.5, max: 43.5, label: '42,2 km', short: '42,2', nome: 'maratona', primeira: 'Primeira maratona', recorde: 'Recorde na maratona' },
];

function naDistancia(dist, race, outcome) {
  const km = Number(race?.distance_km) || Number(outcome?.distanceKm);
  return Number.isFinite(km) && km >= dist.min && km <= dist.max;
}

function distancias({ completed, raceEvents, today, todayYear }) {
  const due = [];
  const slots = DISTANCIAS.map((dist) => {
    const races = completed.filter(({ race, outcome }) => naDistancia(dist, race, outcome));
    const first = races[0] || null;
    if (first) {
      const date = dayOf(first.race.date);
      due.push({
        medalhao: 'distancias',
        slot: dist.key,
        periodKey: '',
        value: null,
        valueLabel: null,
        raceId: first.race.id ?? null,
        awardedOn: date,
        title: dist.primeira,
        line: `${dist.label} — ${first.race.name || 'a prova'}, a tua primeira prova nesta distância.`,
      });
      return slot({
        key: dist.key,
        label: dist.label,
        shortLabel: dist.short,
        state: 'won',
        enamel: 'amber',
        periodKey: '',
        awardedOn: date,
        raceId: first.race.id ?? null,
        detail: [
          `ganha a ${fmtDate(date, todayYear)}`,
          first.race.name || null,
          races.length > 1 ? `${races.length} provas nesta distância` : null,
        ].filter(Boolean).join(' · '),
        wins: 1,
        count: races.length,
        // Todas as provas nesta distância; a que deu a medalha leva `first`.
        contributions: newestFirst(races.map((entry, i) => raceContribution(entry, { first: i === 0 }))),
        contributionsSummary: `${races.length} ${plural(races.length, 'prova', 'provas')} nesta distância`,
      });
    }
    // Por ganhar: se há uma prova marcada nesta distância, é ela que enche.
    const next = (raceEvents || [])
      .filter((r) => r && r.status !== 'concluida' && dayOf(r.date) && dayOf(r.date) >= today)
      .filter((r) => naDistancia(dist, r, null))
      .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)))[0];
    let remainingLabel = null;
    let detail = `conclui uma prova de ${dist.label} e regista a corrida`;
    if (next) {
      const dias = daysBetween(today, dayOf(next.date));
      detail = `${next.name || 'A prova'}, a ${fmtDate(dayOf(next.date), todayYear)}, enche este encaixe`;
      remainingLabel = dias === 0
        ? `hoje há ${next.name || 'prova'} — a medalha dos ${dist.label}`
        : `a ${dias} ${plural(dias, 'dia', 'dias')} da medalha dos ${dist.label}`;
    }
    return slot({
      key: dist.key,
      label: dist.label,
      shortLabel: dist.short,
      enamel: 'amber',
      detail,
      remainingLabel,
      raceId: next?.id ?? null,
      count: 0,
    });
  });

  return {
    medalhao: medalhao({
      key: 'distancias',
      name: 'As Distâncias',
      engraving: 'AS DISTÂNCIAS',
      footer: completed.length ? `${completed.length} ${plural(completed.length, 'PROVA', 'PROVAS')}` : null,
      rule: 'Uma medalha por distância na primeira prova concluída com a corrida registada: 5, 10, 21,1 e 42,2 km.',
      slots,
    }),
    due,
  };
}

/* ── A escala d'Os Níveis: bronze, prata, ouro ─────────────────────────────

   Pedido do utilizador ("criar badges bronze, prata e ouro para: melhor
   corrida de 5k/10km/21km/42km, passe mais rápido, melhor nível VO2").
   Antes, cada encaixe deste medalhão era binário: ou tinhas batido o teu
   tempo anterior naquela distância, ou não tinhas. Passa a ter três níveis,
   e os dois encaixes novos — o ritmo e o VO2 — completam a lista pedida.

   Chamou-se "Os Recordes" até 2026-09-21 e o nome mentia: isto não é o
   recorde de ninguém, é uma ESCALA DE APTIDÃO — sobe-se de bronze para prata
   sem bater tempo próprio nenhum, e um 10 km de ouro e uma maratona de ouro
   valem o mesmo. O recorde pessoal (o melhor tempo do atleta naquela
   categoria) é outra regra, vive na conquista `recorde_pessoal` de
   utils/achievements.js e continua a ser dela — ter os dois com o mesmo nome
   era a confusão que a fusão dos motores veio desfazer. A chave mudou de
   'recordes' para 'niveis': ver a migração
   supabase/migrations/20260921140000_medal_awards_niveis.sql.

   A RÉGUA É O VDOT (Daniels-Gilbert, @formulas/racePrediction.ts), que a app
   já calcula e já mostra na tendência do dashboard de corrida. Escolheu-se
   por ser a única medida que compara distâncias diferentes: um 10 km de ouro
   e uma maratona de ouro exigem a mesma aptidão aeróbica, o que uma tabela
   de tempos por distância nunca conseguiria. Os limiares estão TODOS aqui,
   neste sítio e só neste, para se poderem afinar sem procurar:

     VDOT 35 (bronze) = 5 km 27:01 · 10 km 56:06 · meia 2:04:22 · maratona 4:16:24
     VDOT 45 (prata)  = 5 km 21:50 · 10 km 45:16 · meia 1:40:20 · maratona 3:28:27
     VDOT 55 (ouro)   = 5 km 18:23 · 10 km 38:07 · meia 1:24:20 · maratona 2:56:03

   O encaixe do RITMO não usa VDOT: mede velocidade pura (s/km) no melhor
   esforço de sempre, venha de prova ou de treino, por isso tem a sua própria
   escala. O do VO2 usa o melhor VDOT alguma vez atingido em qualquer corrida
   — é o pico de forma, não o de hoje.

   Quem não chega ao bronze não fica sem nada: o medalhão "As Distâncias"
   continua a marcar a PRIMEIRA vez em cada distância, que é a recompensa de
   quem está a começar. Este é o do mérito. */

export const NIVEIS = [
  { key: 'bronze', label: 'Bronze', enamel: 'bronze', vdot: 35, paceSeconds: 360 },
  { key: 'prata', label: 'Prata', enamel: 'prata', vdot: 45, paceSeconds: 300 },
  { key: 'ouro', label: 'Ouro', enamel: 'ouro', vdot: 55, paceSeconds: 255 },
];

/** O nível de um VDOT, ou null se ainda não chega ao bronze. */
function nivelPorVdot(vdot) {
  if (!Number.isFinite(vdot) || vdot <= 0) return null;
  let atingido = null;
  for (const n of NIVEIS) if (vdot >= n.vdot) atingido = n;
  return atingido;
}

/** O nível de um ritmo em s/km (mais baixo é melhor), ou null. */
function nivelPorRitmo(secPerKm) {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return null;
  let atingido = null;
  for (const n of NIVEIS) if (secPerKm <= n.paceSeconds) atingido = n;
  return atingido;
}

/** O nível a seguir ao atingido — o que falta subir. */
function proximoNivel(atual) {
  const i = atual ? NIVEIS.findIndex((n) => n.key === atual.key) : -1;
  return NIVEIS[i + 1] || null;
}

/* Acima disto não é um atleta: é um registo com o GPS a delirar, uma corrida
   de bicicleta mal classificada, ou um tempo mal escrito. O recorde mundial
   dos 10 000 m anda em VDOT ~85, por isso qualquer coisa acima disso num
   registo de amador é dado sujo. Importa porque `medal_awards` é histórico:
   uma medalha de ouro cunhada por um registo errado fica lá para sempre,
   mesmo depois de o atleta corrigir a corrida. */
const VDOT_MAXIMO_PLAUSIVEL = 85;

/* O VO2 máximo que o RELÓGIO mediu nesta corrida.

   Era o VDOT calculado a partir do tempo, e isso pôs o medalhão a dizer 39,2
   enquanto o cartão da mesma corrida dizia 44,5 — dois números para a mesma
   coisa, à frente um do outro (relatado pelo utilizador: "o Record Passos e
   vo2 não fazem muito sentido"). Passa a ser o número que ele já conhece.
   As chaves alternativas são as mesmas que Run/RunCard.jsx aceita, porque o
   valor chega por vias diferentes conforme o relógio e a análise da foto. */
function vo2DaCorrida(run) {
  const bruto = run?.details?.vo2_max ?? run?.vo2_max ?? run?.vo2max ?? run?.metrics?.vo2_max;
  const vo2 = num(bruto);
  if (!vo2) return 0;
  // Mesmo teto de plausibilidade: um valor absurdo cunhava ouro para sempre.
  return vo2 > VDOT_MAXIMO_PLAUSIVEL ? 0 : vo2;
}

function niveis({ completed, todayYear, runs, raceByRun }) {
  const due = [];

  /* Um encaixe de escala: o nível já atingido dá a cor e a gravação; o que
     falta para o seguinte dá a linha de "para subir". `due` leva uma entrada
     por nível NOVO — assim a cerimónia da medalha dispara em cada subida, e
     a chave única de medal_awards (user, medalhão, encaixe, period_key)
     guarda o nível em period_key sem precisar de coluna nova. */
  const escalaSlot = ({ key, label, shortLabel, nivel, valor, valueLabel, awardedOn, raceId, contexto, porSubir, semDados, contributions = [], contributionsSummary = null }) => {
    const seguinte = proximoNivel(nivel);
    if (!nivel) {
      return slot({
        key, label, shortLabel, enamel: 'bronze',
        detail: semDados || `para ganhar bronze: ${porSubir(NIVEIS[0])}`,
        contributions, contributionsSummary,
      });
    }
    return slot({
      key, label, shortLabel, state: 'won', enamel: nivel.enamel,
      // O número medido (segundos de prova, s/km, VDOT), não o limiar do
      // nível: é o que a coluna `value` de medal_awards diz guardar.
      value: valor ?? nivel.vdot, valueLabel,
      periodKey: nivel.key,
      awardedOn, raceId,
      detail: [
        `${nivel.label}, ganho a ${fmtDate(awardedOn, todayYear)}`,
        contexto || null,
        seguinte ? `para ${seguinte.label.toLowerCase()}: ${porSubir(seguinte)}` : 'o nível mais alto desta escala',
      ].filter(Boolean).join(' · '),
      wins: NIVEIS.findIndex((n) => n.key === nivel.key) + 1,
      contributions, contributionsSummary,
    });
  };

  /* Cada nível conquistado até ao atual entra em `due` uma vez. Sem isto, um
     atleta que chegasse direto a ouro nunca veria a cerimónia do bronze e da
     prata — e o Palmarés mostraria um salto sem história. */
  const cunharAte = (nivel, base, valor = null) => {
    if (!nivel) return;
    for (const n of NIVEIS) {
      // `value` guarda o número MEDIDO (segundos da prova, s/km, VDOT) — é o
      // que a coluna de medal_awards diz guardar. O nível já vai em periodKey.
      due.push({ ...base, slot: base.slot, periodKey: n.key, value: valor ?? n.vdot, title: `${base.title} · ${n.label}` });
      if (n.key === nivel.key) break;
    }
  };

  // ── Os quatro encaixes de distância ────────────────────────────────────
  const slotsDistancia = DISTANCIAS.map((dist) => {
    const races = completed.filter(({ race, outcome }) => outcome?.officialSeconds && naDistancia(dist, race, outcome));
    const contributions = newestFirst(races.map((entry) => {
      const vdot = calculateVDOT(num(entry.race.distance_km) || dist.min, entry.outcome.officialSeconds);
      const n = nivelPorVdot(vdot);
      const vdotTxt = String(vdot).replace('.', ',');
      return raceContribution(entry, { metaExtra: n ? [`${n.label} · VDOT ${vdotTxt}`] : [`VDOT ${vdotTxt}`] });
    }));
    const contributionsSummary = races.length
      ? `${races.length} ${plural(races.length, 'prova', 'provas')} de ${dist.label}`
      : null;

    // A melhor prova da distância é a de menor tempo oficial — é essa que
    // define o nível, não a última que se correu.
    let melhor = null;
    for (const entry of races) {
      if (!melhor || entry.outcome.officialSeconds < melhor.outcome.officialSeconds) melhor = entry;
    }
    const vdotBruto = melhor ? calculateVDOT(num(melhor.race.distance_km) || dist.min, melhor.outcome.officialSeconds) : 0;
    // Mesmo teto de plausibilidade dos treinos: um tempo oficial mal escrito
    // (minutos em vez de horas) cunhava ouro e a medalha não se apaga.
    const vdot = vdotBruto > VDOT_MAXIMO_PLAUSIVEL ? 0 : vdotBruto;
    const nivel = nivelPorVdot(vdot);

    /* O tempo que aquele nível exigiria NESTA distância: é o que torna a
       meta concreta ("abaixo de 1:40:20 numa meia") em vez de um número de
       VDOT que ninguém corre. Procura-se o tempo por bissecção porque a
       equação de Daniels não se inverte em forma fechada. */
    const tempoParaVdot = (alvo) => {
      const km = num(melhor?.race?.distance_km) || (dist.min + dist.max) / 2;
      let rapido = 60; let lento = 60 * 60 * 12;
      for (let i = 0; i < 60; i++) {
        const meio = (rapido + lento) / 2;
        if (calculateVDOT(km, meio) >= alvo) rapido = meio; else lento = meio;
      }
      return Math.round(lento);
    };

    if (nivel) {
      cunharAte(nivel, {
        medalhao: 'niveis',
        slot: dist.key,
        raceId: melhor.race.id ?? null,
        awardedOn: dayOf(melhor.race.date),
        valueLabel: formatDuration(melhor.outcome.officialSeconds),
        title: dist.recorde,
        line: `${formatDuration(melhor.outcome.officialSeconds)} em ${dist.nome} — ${melhor.race.name || 'a prova'}. VDOT ${String(vdot).replace('.', ',')}.`,
      }, melhor.outcome.officialSeconds);
    }

    return escalaSlot({
      key: dist.key,
      label: dist.label,
      shortLabel: dist.short,
      nivel,
      valor: melhor ? melhor.outcome.officialSeconds : null,
      valueLabel: melhor ? formatDuration(melhor.outcome.officialSeconds) : null,
      awardedOn: melhor ? dayOf(melhor.race.date) : null,
      raceId: melhor?.race?.id ?? null,
      contexto: melhor?.race?.name || null,
      porSubir: (n) => `abaixo de ${formatDuration(tempoParaVdot(n.vdot))} numa prova de ${dist.label}`,
      semDados: races.length ? null : `precisa de uma prova de ${dist.label} com tempo oficial`,
      contributions,
      contributionsSummary,
    });
  });

  // ── O ritmo: o passo mais rápido de sempre, de prova ou de treino ──────
  const BUCKETS_RITMO = [5, 10, 21];
  const melhorPaceDe = (lista) => BUCKETS_RITMO
    .map((km) => computeBestPace(lista, km))
    .filter(Boolean)
    .reduce((melhor, r) => (!melhor || r.pace < melhor.pace ? r : melhor), null);
  const melhorRitmo = melhorPaceDe(runs || []);
  const nivelRitmo = nivelPorRitmo(melhorRitmo?.pace);

  /* Os registos por trás deste encaixe. Faltavam por inteiro: o encaixe
     aparecia ganho, com nível e valor, e a persiana dos registos dizia
     "ainda não há registos para este encaixe" (relatado pelo utilizador).
     Cada corrida passa sozinha pelo MESMO computeBestPace do total, para a
     lista usar exatamente a régua do encaixe — parciais incluídos — em vez
     de uma conta paralela que podia discordar dela. */
  const ritmoPorCorrida = (runs || [])
    .map((run) => ({ run, melhor: melhorPaceDe([run]) }))
    .filter((e) => e.melhor);
  const contributionsRitmo = newestFirst(ritmoPorCorrida.map(({ run, melhor }) => runContribution(run, raceByRun, {
    metaExtra: [
      `${formatPace(melhor.pace)}/km`,
      melhorRitmo && melhor.pace === melhorRitmo.pace && dayOf(run.date) === dayOf(melhorRitmo.date) ? 'o teu melhor' : null,
    ].filter(Boolean),
  })));
  const contributionsSummaryRitmo = ritmoPorCorrida.length
    ? `${ritmoPorCorrida.length} ${plural(ritmoPorCorrida.length, 'corrida medida', 'corridas medidas')}`
    : null;
  if (nivelRitmo) {
    cunharAte(nivelRitmo, {
      medalhao: 'niveis',
      slot: 'ritmo',
      raceId: null,
      awardedOn: dayOf(melhorRitmo.date),
      valueLabel: `${formatPace(melhorRitmo.pace)}/km`,
      title: 'Passo mais rápido',
      line: `${formatPace(melhorRitmo.pace)}/km — o teu passo mais rápido de sempre.`,
    }, melhorRitmo.pace);
  }
  const slotRitmo = escalaSlot({
    key: 'ritmo',
    label: 'Passo',
    shortLabel: 'passo',
    nivel: nivelRitmo,
    valor: melhorRitmo ? melhorRitmo.pace : null,
    valueLabel: melhorRitmo ? `${formatPace(melhorRitmo.pace)}/km` : null,
    awardedOn: melhorRitmo ? dayOf(melhorRitmo.date) : null,
    raceId: null,
    contexto: melhorRitmo ? (melhorRitmo.source === 'split' ? 'num parcial' : 'numa corrida inteira') : null,
    porSubir: (n) => `um esforço a ${formatPace(n.paceSeconds)}/km ou melhor`,
    semDados: melhorRitmo ? null : 'precisa de uma corrida com distância e tempo',
    contributions: contributionsRitmo,
    contributionsSummary: contributionsSummaryRitmo,
  });

  // ── O VO2: o melhor VO2 máximo medido pelo relógio ───────────────
  const vo2PorCorrida = (runs || [])
    .map((run) => ({ run, vo2: vo2DaCorrida(run) }))
    .filter((e) => e.vo2 > 0);
  let melhorVo2Run = null;
  let melhorVo2 = 0;
  for (const { run, vo2 } of vo2PorCorrida) {
    if (vo2 > melhorVo2) { melhorVo2 = vo2; melhorVo2Run = run; }
  }
  const nivelVo2 = nivelPorVdot(melhorVo2);
  // Vírgula decimal, como o resto dos números da app (ver fmtKm).
  const vo2Label = String(melhorVo2).replace('.', ',');

  // Os registos deste encaixe — as corridas em que o relógio mediu VO2.
  const contributionsVo2 = newestFirst(vo2PorCorrida.map(({ run, vo2 }) => runContribution(run, raceByRun, {
    metaExtra: [
      `VO2 ${String(vo2).replace('.', ',')}`,
      run === melhorVo2Run ? 'o teu melhor' : null,
    ].filter(Boolean),
  })));
  const contributionsSummaryVo2 = vo2PorCorrida.length
    ? `${vo2PorCorrida.length} ${plural(vo2PorCorrida.length, 'corrida com VO2', 'corridas com VO2')}`
    : null;

  if (nivelVo2) {
    cunharAte(nivelVo2, {
      medalhao: 'niveis',
      slot: 'vo2',
      raceId: null,
      awardedOn: dayOf(melhorVo2Run?.date),
      valueLabel: vo2Label,
      title: 'Nível de VO2',
      line: `VO2 máximo de ${vo2Label} — o teu melhor de sempre.`,
    }, melhorVo2);
  }
  const slotVo2 = escalaSlot({
    key: 'vo2',
    label: 'VO2',
    shortLabel: 'VO2',
    nivel: nivelVo2,
    valor: melhorVo2 || null,
    valueLabel: melhorVo2 ? vo2Label : null,
    awardedOn: melhorVo2Run ? dayOf(melhorVo2Run.date) : null,
    raceId: null,
    contexto: melhorVo2Run ? 'medido pelo relógio' : null,
    porSubir: (n) => `VO2 máximo de ${n.vdot} ou mais numa corrida`,
    semDados: melhorVo2 ? null : 'precisa de uma corrida com VO2 máximo registado',
    contributions: contributionsVo2,
    contributionsSummary: contributionsSummaryVo2,
  });

  return {
    medalhao: medalhao({
      key: 'niveis',
      name: 'Os Níveis',
      engraving: 'OS NÍVEIS',
      rule: 'Três níveis — bronze, prata e ouro — em cada uma das quatro distâncias, no passo mais rápido e no nível de VO2. A régua é o VDOT, que compara distâncias diferentes pela aptidão que exigem.',
      slots: [...slotsDistancia, slotRitmo, slotVo2],
    }),
    due,
  };
}

const OBJETIVOS = [1, 3, 5, 10];

function superacao({ completed, todayYear }) {
  const batidos = completed.filter(({ outcome }) => bateuObjetivo(outcome));
  const count = batidos.length;
  const due = [];
  const slots = OBJETIVOS.map((n) => {
    const medalha = n === 1 ? 'a medalha do primeiro objetivo' : `a medalha dos ${n} objetivos`;
    const label = `${n} ${plural(n, 'objetivo', 'objetivos')}`;
    const nth = batidos[n - 1] || null;
    // Os objetivos batidos que contam para este encaixe: os primeiros N.
    const contam = batidos.slice(0, n);
    const contributions = newestFirst(contam.map((entry) => raceContribution(entry, {
      metaExtra: entry.outcome?.targetSeconds ? [`objetivo ${formatDuration(entry.outcome.targetSeconds)}`] : [],
    })));
    const contributionsSummary = contam.length
      ? `${contam.length} de ${n} ${plural(n, 'objetivo batido', 'objetivos batidos')}`
      : null;
    if (nth) {
      const { race, outcome } = nth;
      const date = dayOf(race.date);
      due.push({
        medalhao: 'superacao',
        slot: `o${n}`,
        periodKey: '',
        value: n,
        valueLabel: String(n),
        raceId: race.id ?? null,
        awardedOn: date,
        title: n === 1 ? 'Primeiro objetivo batido' : `${n} objetivos batidos`,
        line: `${formatDuration(outcome.officialSeconds)} para um objetivo de ${formatDuration(outcome.targetSeconds)} — ${race.name || 'a prova'}, o ${n}.º objetivo batido.`,
      });
      return slot({
        key: `o${n}`,
        label,
        shortLabel: String(n),
        state: 'won',
        // Verde: o mesmo tom da conquista `objetivo_batido` (tone 'ok') no
        // hub e na RecordConfirmation — objetivo batido é sempre verde.
        enamel: 'ok',
        value: n,
        valueLabel: String(n),
        periodKey: '',
        awardedOn: date,
        raceId: race.id ?? null,
        detail: [`ganha a ${fmtDate(date, todayYear)}`, race.name || null].filter(Boolean).join(' · '),
        wins: 1,
        contributions,
        contributionsSummary,
      });
    }
    const falta = n - count;
    return slot({
      key: `o${n}`,
      label,
      shortLabel: String(n),
      enamel: 'ok',
      detail: `${count} de ${n} ${plural(n, 'objetivo batido', 'objetivos batidos')}`,
      progress: count / n,
      remainingLabel: `a ${falta} ${plural(falta, 'objetivo batido', 'objetivos batidos')} d${medalha}`,
      contributions,
      contributionsSummary,
    });
  });

  const faltam = slots.filter((s) => s.state === 'empty').map((s) => s.shortLabel);
  return {
    medalhao: medalhao({
      key: 'superacao',
      name: 'A Superação',
      engraving: 'A SUPERAÇÃO',
      footer: count ? `${count} ${plural(count, 'OBJETIVO BATIDO', 'OBJETIVOS BATIDOS')}` : null,
      rule: 'Conta os objetivos de prova batidos: o tempo oficial igual ou abaixo do objetivo que marcaste.',
      slots,
      summaryMissing: faltam.length ? `falta ${juntar(faltam)} objetivos` : null,
    }),
    due,
  };
}

// ── 4. O Terreno ─────────────────────────────────────────────────────────

/* Estrada e trail são os dois únicos terrenos (RACE_TERRAIN_TYPES em
   utils/run.js) e são um eixo diferente da distância: 21 km em trail não é
   a mesma prova que 21 km em estrada. Este medalhão é a casa da regra: a
   conquista `primeira_trail` do hub é hoje a mesma pergunta feita a uma
   prova só (`provasDoTerreno` em utils/premios.js), e não uma segunda
   contagem que podia discordar desta. O par que faltava à conquista — a
   primeira de estrada — e o marco de veterano, a 5.ª, só existem aqui.

   Sem esmalte: isto conta ocorrências, não um tempo nem um objetivo batido
   — não há cor que queira dizer "quantas". */

const TERRENO_MARCOS = [1, 5];

function terreno({ completed, todayYear }) {
  const porTerreno = new Map(TERRENOS.map((t) => [t.key, provasDoTerreno(completed, t.key)]));
  const due = [];
  const slots = [];

  // A ordem é a leitura do medalhão: as duas primeiras em cima, as duas
  // quintas em baixo — estrada à esquerda, trail à direita.
  for (const n of TERRENO_MARCOS) {
    for (const t of TERRENOS) {
      const provas = porTerreno.get(t.key) || [];
      const count = provas.length;
      const nth = provas[n - 1] || null;
      const key = `${t.key}${n}`;
      const label = n === 1 ? `1.ª ${t.nome}` : `${n} ${t.nome}`;
      const medalha = n === 1 ? `a primeira medalha ${t.em}` : `a medalha das ${n} ${t.em}`;
      // As provas que contam para este encaixe: as primeiras N do terreno.
      const contam = provas.slice(0, n);
      const contributions = newestFirst(contam.map((entry, i) => raceContribution(entry, { first: i === 0 })));
      const contributionsSummary = contam.length
        ? `${contam.length} de ${n} ${plural(n, 'prova', 'provas')} ${t.em}`
        : null;

      if (nth) {
        const { race } = nth;
        const date = dayOf(race.date);
        due.push({
          medalhao: 'terreno',
          slot: key,
          periodKey: '',
          value: n,
          valueLabel: null,
          raceId: race.id ?? null,
          awardedOn: date,
          title: n === 1 ? `Primeira ${t.em}` : `${n} provas ${t.em}`,
          line: n === 1
            ? `${race.name || 'A prova'} — a tua primeira prova ${t.em}.`
            : `${race.name || 'A prova'} — a tua ${n}.ª prova ${t.em}.`,
        });
        slots.push(slot({
          key,
          label,
          shortLabel: label,
          state: 'won',
          enamel: 'silver',
          value: n,
          periodKey: '',
          awardedOn: date,
          raceId: race.id ?? null,
          detail: [
            `${n}.ª prova ${t.em}`,
            `ganha a ${fmtDate(date, todayYear)}`,
            race.name || null,
          ].filter(Boolean).join(' · '),
          wins: 1,
          count,
          contributions,
          contributionsSummary,
        }));
        continue;
      }
      const falta = n - count;
      slots.push(slot({
        key,
        label,
        shortLabel: label,
        enamel: 'silver',
        detail: `${count} de ${n} ${plural(n, 'prova', 'provas')} ${t.em}`,
        progress: count / n,
        remainingLabel: `a ${falta} ${plural(falta, 'prova', 'provas')} ${t.em} de ganhares ${medalha}`,
        count,
        contributions,
        contributionsSummary,
      }));
    }
  }

  const estrada = (porTerreno.get('estrada') || []).length;
  const trail = (porTerreno.get('trail') || []).length;
  return {
    medalhao: medalhao({
      key: 'terreno',
      name: 'O Terreno',
      engraving: 'O TERRENO',
      footer: estrada + trail > 0 ? `${estrada} EM ESTRADA · ${trail} EM TRAIL` : null,
      rule: 'Uma medalha na primeira prova de cada terreno e outra na quinta; estrada e trail contam em separado.',
      slots,
    }),
    due,
  };
}

// ── 5. A Sequência ───────────────────────────────────────────────────────

const SEQUENCIAS = [2, 3, 5, 8];

/* O varrimento é um só e vive em `utils/premios.js` (`varrerSequencia`): do
   princípio para o fim, com um máximo corrente, como `anoKm` faz com o
   melhor período. Aqui fica-se com a MAIOR sequência de sempre — porque uma
   medalha ganha não se perde no dia em que a sequência seguinte quebra — e
   com os marcos: cada vez que o máximo cresce E cai num marco (2, 3, 5, 8),
   esse encaixe cunha-se no dia da prova que o confirmou. É a re-cunhagem
   d'Os Níveis vista do outro lado: como o máximo só cresce de um em um,
   um recorde novo enche sempre um encaixe novo — nunca o mesmo duas vezes.

   A outra metade da história — em que elo ficou CADA prova, que é o "N
   provas seguidas" do hub — sai do mesmo varrimento (`posicaoDe`), em
   utils/achievements.js. Eram dois cálculos e passaram a um. */

function sequencia({ completed, raceEvents, runs, today, todayYear }) {
  const { recordes, best, atual } = varrerSequencia({ raceEvents, runs, today });
  const wins = recordes.filter((w) => SEQUENCIAS.includes(w.n));
  const entryByRace = new Map(completed.map((entry) => [entry.race.id, entry]));
  const contribsOf = (races) => newestFirst(races
    .map((race) => entryByRace.get(race.id))
    .filter(Boolean)
    .map((entry) => raceContribution(entry)));

  const due = wins.map((w) => ({
    medalhao: 'sequencia',
    slot: `seq${w.n}`,
    periodKey: '',
    value: w.n,
    valueLabel: null,
    raceId: w.race.id ?? null,
    awardedOn: w.awardedOn,
    title: `${w.n} provas seguidas`,
    line: `${w.n} provas seguidas com a corrida registada — a última foi ${w.race.name || 'a prova'}, a ${fmtDate(w.awardedOn, todayYear)}.`,
  }));

  const slots = SEQUENCIAS.map((n) => {
    const win = wins.find((w) => w.n === n) || null;
    // Os registos por trás do encaixe: ganho, as N provas que o encheram;
    // por ganhar, a sequência em curso.
    const races = win ? win.races : atual;
    const periodo = races.length
      ? `${fmtDate(dayOf(races[0].date), todayYear)} a ${fmtDate(dayOf(races[races.length - 1].date), todayYear)}`
      : null;
    const comum = {
      key: `seq${n}`,
      label: `${n} provas`,
      shortLabel: String(n),
      enamel: 'silver',
      contributions: contribsOf(races),
      contributionsPeriodLabel: periodo,
      contributionsSummary: races.length
        ? `${races.length} ${plural(races.length, 'prova seguida', 'provas seguidas')}`
        : null,
    };
    if (win) {
      return slot({
        ...comum,
        state: 'won',
        value: n,
        periodKey: '',
        awardedOn: win.awardedOn,
        raceId: win.race.id ?? null,
        detail: [
          `ganha a ${fmtDate(win.awardedOn, todayYear)}`,
          win.race.name || null,
          `melhor sequência: ${best} ${plural(best, 'prova', 'provas')}`,
        ].filter(Boolean).join(' · '),
        wins: 1,
      });
    }
    const falta = n - atual.length;
    return slot({
      ...comum,
      detail: atual.length
        ? `${atual.length} de ${n} provas seguidas`
        : 'regista a corrida de cada prova que corres e a sequência começa',
      progress: atual.length / n,
      remainingLabel: `a ${falta} ${plural(falta, 'prova', 'provas')} de ganhares a medalha das ${n} provas seguidas`,
    });
  });

  const faltam = slots.filter((s) => s.state === 'empty').map((s) => s.shortLabel);
  return {
    medalhao: medalhao({
      key: 'sequencia',
      name: 'A Sequência',
      engraving: 'A SEQUÊNCIA',
      footer: best > 0 ? `${best} ${plural(best, 'PROVA SEGUIDA', 'PROVAS SEGUIDAS')}` : null,
      rule: 'Conta as provas seguidas com a corrida registada e guarda a maior de sempre: uma prova que passa sem registo quebra a sequência, mas não apaga a medalha já ganha.',
      slots,
      summaryMissing: faltam.length ? `falta ${juntar(faltam)} provas seguidas` : null,
    }),
    due,
    bestStreak: best,
    currentStreak: atual.length,
  };
}

// ── Tudo junto ───────────────────────────────────────────────────────────

/* O medalhão herói: o que está mais perto da próxima medalha — o maior
   `progress` entre os encaixes que ainda se podem ganhar. Em empate (ou sem
   progresso nenhum), O Ano em Km. */
function pickHero(medalhoes) {
  let heroKey = 'ano_km';
  let heroProgress = -1;
  for (const m of medalhoes) {
    const top = bestProgressSlot(m.slots);
    const p = top ? top.progress : -1;
    if (p > heroProgress || (p === heroProgress && m.key === 'ano_km')) {
      heroKey = m.key;
      heroProgress = p;
    }
  }
  return heroKey;
}

export function computeMedalhoes({ runs = [], raceEvents = [], profile = {}, today } = {}) {
  const hoje = requireToday(today, 'computeMedalhoes');
  const todayYear = hoje.slice(0, 4);
  // Da mais antiga para a mais recente: "a primeira", "o 3.º objetivo". O
  // filtro das provas com data futura é da régua (`completedRaces`), não
  // daqui — era a divergência que os dois motores tinham entre si.
  const completed = completedRaces({ raceEvents, runs, profile: profile || {}, today: hoje }).reverse();

  // Que prova é de cada corrida — a mesma ligação do hub (findRaceRun), para
  // uma corrida de prova na lista abrir o hub e não o registo solto.
  const raceByRun = new Map();
  for (const race of raceEvents || []) {
    const linked = race ? findRaceRun(runs || [], race) : null;
    if (linked?.id != null && !raceByRun.has(linked.id)) raceByRun.set(linked.id, race);
  }

  const ctx = { runs, raceEvents, completed, raceByRun, today: hoje, todayYear };
  const parts = {
    ano_km: anoKm(ctx),
    distancias: distancias(ctx),
    niveis: niveis(ctx),
    terreno: terreno(ctx),
    sequencia: sequencia(ctx),
    superacao: superacao(ctx),
  };

  const medalhoes = MEDALHAO_KEYS.map((key) => parts[key].medalhao);
  const seen = new Set();
  const due = [];
  for (const key of MEDALHAO_KEYS) {
    for (const entry of parts[key].due) {
      const id = `${entry.medalhao}|${entry.slot}|${entry.periodKey}`;
      if (seen.has(id)) continue;
      seen.add(id);
      due.push(entry);
    }
  }

  return { medalhoes, heroKey: pickHero(medalhoes), due };
}
