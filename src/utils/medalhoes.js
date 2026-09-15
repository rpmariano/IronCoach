/* O Palmarés — os medalhões (specs/palmares-medalhoes.md).

   Seis medalhões, sempre pela mesma ordem, cada um com os seus encaixes. O
   encaixe vazio à vista é o objetivo; a estrela encaixada é o facto. Tudo se
   recalcula dos dados que já existem — corridas, provas, planos da Carol —
   sem rede e sem relógio escondido: `today` entra como argumento, para os
   testes e para o momento da medalha nunca discordarem sobre o dia.

   A régua das provas continua a ser uma só: "concluída" é `completedRaces`
   de `utils/achievements.js` (concluída E com corrida ligada), "objetivo
   batido" e "recorde pessoal" saem de `utils/raceOutcome.js`. Este ficheiro
   não compara tempos — só conta, data e escreve a frase.

   O que NÃO se recalcula (quando o atleta viu o momento, as re-cunhagens já
   guardadas) vive em `medal_awards`, sincronizado por `utils/medalAwards.js`
   a partir da lista `due` que esta função devolve.

   Datas: as colunas `date` são ISO `YYYY-MM-DD` (dia local). Tudo aqui é
   aritmética de calendário em UTC sobre essas strings — nunca `new Date(iso)`
   sem fixar a hora, que à meia-noite em Lisboa ainda é o dia anterior em UTC.

   Quando se fecha um período: um mês (semana, trimestre...) só está fechado
   no dia a SEGUIR ao último dia — no próprio último dia ainda se pode correr.
   Por isso as medalhas que se ganham "no fecho" (a primeira de cada encaixe
   d'O Ano em Km, as semanas d'A Consistência) têm `awardedOn` = o primeiro
   dia depois do período: é o primeiro dia em que os dados o provam. */

import { completedRaces } from './achievements';
import { formatDuration } from './run';
import { formatDelta } from './raceOutcome';

export const MEDALHAO_KEYS = ['ano_km', 'distancias', 'recordes', 'epoca', 'consistencia', 'superacao'];

const DAY_MS = 86400000;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Datas ────────────────────────────────────────────────────────────────

function dayOf(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function utc(iso) {
  return Date.parse(`${iso}T00:00:00Z`);
}

function addDays(iso, n) {
  return new Date(utc(iso) + n * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromIso, toIso) {
  return Math.round((utc(toIso) - utc(fromIso)) / DAY_MS);
}

function isoOf(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Último dia do mês `m` (1–12) do ano `y`. */
function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** A segunda-feira da semana de `iso`. */
function mondayOf(iso) {
  const dow = new Date(utc(iso)).getUTCDay(); // 0 = domingo
  return addDays(iso, -((dow + 6) % 7));
}

/** O dia local (YYYY-MM-DD) de um timestamptz — aqui sim, com fuso: um
 *  `created_at` às 23:30 de Lisboa é desse dia, não do seguinte em UTC. */
function localDayOfTimestamp(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return isoOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
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

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "a", "a e b", "a, b e c". */
function juntar(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

const plural = (n, um, varios) => (n === 1 ? um : varios);

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
    ...fields,
  };
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
  // As Distâncias e A Época dizem quanto falta em dias até uma prova marcada,
  // sem fração de progresso — sem este recurso a frase nunca aparecia.
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

/** "de setembro", "do 3.º trimestre" — para o fecho do período em curso. */
function periodPhraseDe(gran, periodKey, todayYear) {
  const em = periodPhrase(gran, periodKey, todayYear);
  if (gran === 'mes') return em.replace(/^em /, 'de ');
  if (gran === 'ano') return em.replace(/^em /, 'de ');
  return em.replace(/^no /, 'do ');
}

function anoKm({ runs, today, todayYear }) {
  const daily = new Map();
  for (const r of runs || []) {
    const d = dayOf(r?.date);
    const km = num(r?.distance_km);
    if (!d || !km || d > today) continue;
    daily.set(d, (daily.get(d) || 0) + km);
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

    return slot({
      key: g.key,
      label: g.label,
      shortLabel: g.nome,
      state: last ? 'won' : 'empty',
      enamel: 'amber',
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

// ── Provas: 2. As Distâncias, 3. Os Recordes, 6. A Superação ────────────

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

function recordes({ completed, todayYear }) {
  const due = [];
  const slots = DISTANCIAS.map((dist) => {
    const races = completed.filter(({ race, outcome }) => outcome?.officialSeconds && naDistancia(dist, race, outcome));
    // O recorde conta-se DENTRO da distância oficial, pela ordem das provas
    // (completed vem da mais antiga para a mais recente). O isPersonalRecord
    // do raceOutcome compara pela categoria larga — um 15 km rápido tirava o
    // recorde a uma meia verdadeira.
    const pbs = [];
    let anterior = null;
    for (const entry of races) {
      const s = entry.outcome.officialSeconds;
      if (anterior != null && s < anterior) pbs.push({ ...entry, deltaBestSeconds: anterior - s });
      if (anterior == null || s < anterior) anterior = s;
    }
    const best = anterior;

    for (const { race, outcome, deltaBestSeconds } of pbs) {
      due.push({
        medalhao: 'recordes',
        slot: dist.key,
        periodKey: String(race.id ?? ''),
        value: outcome.officialSeconds,
        valueLabel: formatDuration(outcome.officialSeconds),
        raceId: race.id ?? null,
        awardedOn: dayOf(race.date),
        title: dist.recorde,
        line: `${formatDuration(outcome.officialSeconds)} — ${race.name || 'a prova'}, ${formatDelta(deltaBestSeconds)} abaixo do teu melhor anterior.`,
      });
    }

    const last = pbs[pbs.length - 1] || null;
    if (last) {
      const date = dayOf(last.race.date);
      return slot({
        key: dist.key,
        label: dist.label,
        shortLabel: dist.short,
        state: 'won',
        enamel: 'cyan',
        value: last.outcome.officialSeconds,
        valueLabel: formatDuration(last.outcome.officialSeconds),
        periodKey: String(last.race.id ?? ''),
        awardedOn: date,
        raceId: last.race.id ?? null,
        detail: [
          `ganho a ${fmtDate(date, todayYear)}`,
          last.race.name || null,
          `para repetir: abaixo de ${formatDuration(best)}`,
        ].filter(Boolean).join(' · '),
        wins: pbs.length,
      });
    }
    return slot({
      key: dist.key,
      label: dist.label,
      shortLabel: dist.short,
      enamel: 'cyan',
      detail: races.length
        ? `para ganhar: abaixo de ${formatDuration(best)} numa prova de ${dist.label}`
        : `precisa de duas provas de ${dist.label}: a primeira marca o tempo a bater`,
    });
  });

  return {
    medalhao: medalhao({
      key: 'recordes',
      name: 'Os Recordes',
      engraving: 'OS RECORDES',
      rule: 'Ganha-se quando uma prova bate o teu melhor tempo anterior na mesma distância, e volta a cunhar-se a cada recorde novo.',
      slots,
    }),
    due,
  };
}

const OBJETIVOS = [1, 3, 5, 10];

function superacao({ completed, todayYear }) {
  const batidos = completed.filter(({ outcome }) => outcome?.verdict === 'superado' && outcome?.basis === 'objetivo');
  const count = batidos.length;
  const due = [];
  const slots = OBJETIVOS.map((n) => {
    const medalha = n === 1 ? 'a medalha do primeiro objetivo' : `a medalha dos ${n} objetivos`;
    const label = `${n} ${plural(n, 'objetivo', 'objetivos')}`;
    const nth = batidos[n - 1] || null;
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
        enamel: 'amber',
        value: n,
        valueLabel: String(n),
        periodKey: '',
        awardedOn: date,
        raceId: race.id ?? null,
        detail: [`ganha a ${fmtDate(date, todayYear)}`, race.name || null].filter(Boolean).join(' · '),
        wins: 1,
      });
    }
    const falta = n - count;
    return slot({
      key: `o${n}`,
      label,
      shortLabel: String(n),
      enamel: 'amber',
      detail: `${count} de ${n} ${plural(n, 'objetivo batido', 'objetivos batidos')}`,
      progress: count / n,
      remainingLabel: `a ${falta} ${plural(falta, 'objetivo batido', 'objetivos batidos')} d${medalha}`,
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

// ── 4. A Época ───────────────────────────────────────────────────────────

function epoca({ completed, raceEvents, today, todayYear }) {
  const noAno = (race) => dayOf(race?.date)?.startsWith(todayYear);
  const ganhas = completed.filter(({ race }) => noAno(race));
  const ganhasIds = new Set(ganhas.map(({ race }) => race.id));
  const marcadas = (raceEvents || []).filter((r) => r && noAno(r));
  const porCorrer = marcadas
    .filter((r) => !ganhasIds.has(r.id))
    .sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)));
  const total = Math.max(4, marcadas.length, ganhas.length);
  const due = [];
  const slots = [];

  ganhas.forEach(({ race, outcome }, i) => {
    const date = dayOf(race.date);
    const ordem = i + 1;
    // O slot do `due` não é o `p1..pN` posicional (muda quando se marca uma
    // prova mais cedo no ano): é sempre 'prova', e a prova é o period_key.
    due.push({
      medalhao: 'epoca',
      slot: 'prova',
      periodKey: String(race.id ?? ''),
      value: outcome?.officialSeconds ?? null,
      valueLabel: outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null,
      raceId: race.id ?? null,
      awardedOn: date,
      title: `A Época ${todayYear}`,
      line: `${ordem}.ª prova de ${todayYear} — ${race.name || 'a prova'}${outcome?.officialSeconds ? `, ${formatDuration(outcome.officialSeconds)}` : ''}.`,
    });
    slots.push(slot({
      key: `p${slots.length + 1}`,
      label: race.name || `${ordem}.ª prova`,
      shortLabel: race.name || `${ordem}.ª prova`,
      state: 'won',
      enamel: 'silver',
      value: outcome?.officialSeconds ?? null,
      valueLabel: outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null,
      periodKey: String(race.id ?? ''),
      awardedOn: date,
      raceId: race.id ?? null,
      detail: [`concluída a ${fmtDate(date, todayYear)}`, outcome?.officialSeconds ? formatDuration(outcome.officialSeconds) : null].filter(Boolean).join(' · '),
      wins: 1,
    }));
  });

  for (const race of porCorrer) {
    const date = dayOf(race.date);
    let detail;
    let remainingLabel = null;
    if (date >= today) {
      const dias = daysBetween(today, date);
      detail = `marcada para ${fmtDate(date, todayYear)}`;
      remainingLabel = dias === 0 ? 'a prova é hoje' : `a ${dias} ${plural(dias, 'dia', 'dias')} da próxima estrela da época`;
    } else if (race.status === 'concluida') {
      detail = `concluída a ${fmtDate(date, todayYear)} sem corrida registada — regista-a para a estrela`;
    } else {
      detail = `${fmtDate(date, todayYear)} · por registar`;
    }
    slots.push(slot({
      key: `p${slots.length + 1}`,
      label: race.name || 'Prova marcada',
      shortLabel: race.name || 'prova marcada',
      enamel: 'silver',
      periodKey: String(race.id ?? ''),
      raceId: race.id ?? null,
      detail,
      remainingLabel,
    }));
  }
  while (slots.length < total) {
    slots.push(slot({
      key: `p${slots.length + 1}`,
      label: 'Prova',
      shortLabel: 'prova',
      enamel: 'silver',
      detail: 'marca uma prova na agenda',
    }));
  }

  return {
    medalhao: medalhao({
      key: 'epoca',
      name: 'A Época',
      engraving: 'A ÉPOCA',
      year: todayYear,
      footer: `${ganhas.length} ${plural(ganhas.length, 'PROVA', 'PROVAS')} EM ${todayYear}`,
      rule: `Uma estrela de prata por prova concluída em ${todayYear}; cada encaixe vazio é uma prova marcada por correr.`,
      slots,
      summaryMissing: porCorrer.length ? `${plural(porCorrer.length, 'falta', 'faltam')} ${porCorrer.length} ${plural(porCorrer.length, 'prova marcada', 'provas marcadas')}` : null,
    }),
    due,
  };
}

// ── 5. A Consistência ────────────────────────────────────────────────────

const SEMANAS = [4, 12, 26, 52];

/** O dia da última reescrita de um plano — a mesma fronteira de
 *  `planDivergence.js` (lastRewriteDay): ajustar um plano aceite não cria
 *  plano novo, os itens passados ficam "pendente". Sem ela, uma reescrita
 *  apagava semanas que o atleta não podia ter cumprido. */
function lastRewriteDay(items) {
  let last = null;
  for (const i of items) {
    const day = localDayOfTimestamp(i?.created_at);
    if (day && (!last || day > last)) last = day;
  }
  return last;
}

function consistencia({ coachPlans, coachPlanItems, today, todayYear }) {
  // Aceitar um plano novo que cobre o antigo passa o antigo a 'recusado'
  // (store: acceptPlan). Um plano com sessões concluídas foi aceite e
  // cumprido — sem ele a sequência encolhia e a medalha ganha desaparecia.
  // Uma proposta recusada de raiz nunca tem itens concluídos.
  const cumpridos = new Set((coachPlanItems || []).filter((i) => i?.status === 'concluido').map((i) => i.plan_id));
  const plans = (coachPlans || []).filter((p) => p && (p.status === 'aceite' || (p.status === 'recusado' && cumpridos.has(p.id))));
  const planIds = new Set(plans.map((p) => p.id));
  const planItems = (coachPlanItems || []).filter((i) => i && planIds.has(i.plan_id));
  const rewriteByPlan = new Map([...planIds].map((id) => [id, lastRewriteDay(planItems.filter((i) => i.plan_id === id))]));

  const weeks = new Map();
  for (const item of planItems) {
    if (item.kind !== 'corrida' && item.kind !== 'ginasio') continue;
    if (item.status !== 'pendente' && item.status !== 'concluido') continue;
    const d = dayOf(item.planned_date);
    if (!d) continue;
    const rewrite = rewriteByPlan.get(item.plan_id);
    if (item.status === 'pendente' && rewrite && d < rewrite) continue;
    const monday = mondayOf(d);
    if (addDays(monday, 6) >= today) continue; // semana ainda por fechar
    const w = weeks.get(monday) || { pending: 0, done: 0 };
    if (item.status === 'pendente') w.pending += 1;
    else w.done += 1;
    weeks.set(monday, w);
  }

  const wins = [];
  let streak = 0;
  let best = 0;
  for (const monday of [...weeks.keys()].sort()) {
    const w = weeks.get(monday);
    if (w.pending > 0) {
      streak = 0;
      continue;
    }
    streak += 1;
    best = Math.max(best, streak);
    if (SEMANAS.includes(streak)) wins.push({ n: streak, monday, awardedOn: addDays(monday, 7) });
  }

  const due = wins.map((w) => ({
    medalhao: 'consistencia',
    slot: `w${w.n}`,
    periodKey: w.monday,
    value: w.n,
    valueLabel: String(w.n),
    raceId: null,
    awardedOn: w.awardedOn,
    title: `${w.n} semanas de plano cumprido`,
    line: `${w.n} semanas seguidas de plano cumprido — a última fechou a ${fmtDate(addDays(w.monday, 6), todayYear)}.`,
  }));

  const semPlano = weeks.size === 0;
  const slots = SEMANAS.map((n) => {
    const mine = wins.filter((w) => w.n === n);
    const last = mine[mine.length - 1] || null;
    const falta = n - streak;
    const progress = streak < n ? streak / n : null;
    const remainingLabel = progress == null
      ? null
      : `a ${falta} ${plural(falta, 'semana', 'semanas')} de ${last ? 'voltares a ganhar' : 'ganhares'} a medalha das ${n} semanas`;
    const atual = `sequência atual: ${streak} ${plural(streak, 'semana', 'semanas')}`;
    return slot({
      key: `w${n}`,
      label: `${n} semanas`,
      shortLabel: String(n),
      state: last ? 'won' : 'empty',
      enamel: 'cyan',
      value: last ? n : null,
      valueLabel: last ? String(n) : null,
      periodKey: last ? last.monday : '',
      awardedOn: last ? last.awardedOn : null,
      detail: last
        ? `ganha a ${fmtDate(last.awardedOn, todayYear)} · ${atual}`
        : (semPlano ? 'aceita um plano da Carol e cumpre-o semana a semana' : `${streak} de ${n} semanas seguidas`),
      progress,
      remainingLabel,
      wins: mine.length,
    });
  });

  const faltam = slots.filter((s) => s.state === 'empty').map((s) => s.shortLabel);
  return {
    medalhao: medalhao({
      key: 'consistencia',
      name: 'A Consistência',
      engraving: 'A CONSISTÊNCIA',
      footer: best > 0 ? `${best} ${plural(best, 'SEMANA SEGUIDA', 'SEMANAS SEGUIDAS')}` : null,
      rule: 'Semanas seguidas, de segunda a domingo, com todos os treinos do plano aceite concluídos; semanas sem plano não contam nem quebram.',
      slots,
      summaryMissing: faltam.length ? `falta ${juntar(faltam)} semanas` : null,
    }),
    due,
    currentStreak: streak,
    bestStreak: best,
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

export function computeMedalhoes({
  runs = [], raceEvents = [], coachPlans = [], coachPlanItems = [], profile = {}, today,
} = {}) {
  const hoje = dayOf(today) || new Date().toISOString().slice(0, 10);
  const todayYear = hoje.slice(0, 4);
  // Da mais antiga para a mais recente: "a primeira", "o 3.º objetivo".
  const completed = completedRaces({ raceEvents, runs, profile: profile || {} })
    .filter(({ race }) => dayOf(race.date) <= hoje)
    .reverse();

  const ctx = { runs, raceEvents, coachPlans, coachPlanItems, completed, today: hoje, todayYear };
  const parts = {
    ano_km: anoKm(ctx),
    distancias: distancias(ctx),
    recordes: recordes(ctx),
    epoca: epoca(ctx),
    consistencia: consistencia(ctx),
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
