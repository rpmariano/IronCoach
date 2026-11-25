import React, { useEffect, useMemo } from 'react';
import '../../styles/v2-components.css';
import { useAppStore } from '../../store';
import { addDaysISO } from '../../lib/utils';
import { buildPlanDays, computeAcceptedWindow } from './WeeklyPlanCard';
import { liveItems, trainingItems, planItemTitle, isRacePlanItem } from '../../utils/homeModels';
import { raceForecast } from '../../utils/raceTimes';
import { findRaceRun } from '../../utils/run';
import { useCoachDailyMessages } from './CarolCard';

/* O Início no Design v2 (direção C · Painel, 2026-11-24; utils/designV2.js). Só com o v2 ligado: o
   Home.jsx escolhe-o e passa-lhe os mesmos modelos e os mesmos handlers — a lógica é a de sempre,
   só a forma muda. De cima para baixo:
   · o herói: a próxima prova (a contagem a âmbar, o objetivo ou a previsão à direita) ou, sem
     prova, o treino de hoje;
   · a Carol numa linha, com o traço ciano (a primeira mensagem do dia, a mesma do cartão dela);
   · uma grelha de dois: hoje, amanhã, kcal, proteína;
   · uma só ação. */

const nf1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0, useGrouping: 'always' });
const kmText = (km) => (Number(km) > 0 ? `${nf1.format(Math.round(Number(km) * 10) / 10)} km` : null);
const diasEntre = (a, b) => Math.round((Date.UTC(...b.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...a.split('-').map((x, i) => (i === 1 ? x - 1 : +x)))) / 86400000);

/** Uma célula do dia («18 km» / «amanhã, rodagem longa»), a partir dos itens do plano. */
export function dayCell(items, quando, raceName = null) {
  const vivos = liveItems(items);
  const treino = trainingItems(vivos);
  if (!treino.length) return { big: vivos.length ? 'Descanso' : 'Livre', small: quando, done: false };
  const first = treino[0];
  const titulo = planItemTitle(first, raceName).split(' · ')[0];
  const big = kmText(first.target_distance_km) || (first.target_duration_min ? `${first.target_duration_min} min` : titulo);
  const resto = treino.length > 1 ? ` e mais ${treino.length - 1}` : '';
  return {
    big,
    small: big === titulo ? `${quando}${resto}` : `${quando}, ${titulo.toLowerCase()}${resto}`,
    done: treino.every((i) => i.status === 'concluido'),
    race: isRacePlanItem(first) || !!first.isRace,
  };
}

function Cell({ big, small, dot = null, pct = null, testId }) {
  return (
    <div className="v2-cell" data-testid={testId}>
      <b className="v2-num">{big}</b>
      <span>{dot && <i className="v2-dot" style={{ background: dot }} aria-hidden="true" />}{small}</span>
      {pct != null && <div className="v2-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>}
    </div>
  );
}

export default function HomeV2({ today, gauges, notices, onOpenRace, onRegisterRace, onCreateRace, onCompleteItem }) {
  const { raceEvents, runs, profile, coachPlans, coachPlanItems, loadDailySummary } = useAppStore();
  const messages = useCoachDailyMessages();
  useEffect(() => { loadDailySummary?.(); }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  // A próxima prova: a de hoje fica até estar registada; depois, a seguinte.
  const race = useMemo(() => (raceEvents || [])
    .filter((e) => e?.date && e.date.slice(0, 10) >= today && e.status !== 'concluida' && !findRaceRun(runs, e))
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null, [raceEvents, runs, today]);
  const forecast = useMemo(() => (race ? raceForecast({ race, runs, profile }) : null), [race, runs, profile]);

  const [hoje, amanha] = useMemo(() => {
    const window = computeAcceptedWindow(coachPlans, coachPlanItems, today);
    if (!window) return [[], []];
    const ids = new Set((coachPlans || []).filter((p) => p.status === 'aceite').map((p) => p.id));
    const days = buildPlanDays((coachPlanItems || []).filter((i) => ids.has(i.plan_id)), today, 2, { plans: coachPlans, today });
    return [days[0]?.items || [], days[1]?.items || []];
  }, [coachPlans, coachPlanItems, today]);
  const raceName = race?.date?.slice(0, 10) === today ? race.name : null;
  let cHoje = dayCell(hoje, 'hoje', raceName);
  /* No dia da prova o herói já é ela: o mosaico de hoje não a repete. A hora de partida e o local,
     ou, sem hora, o que o treino aponta. */
  if (race && race.date.slice(0, 10) === today) {
    const hora = race.start_time ? String(race.start_time).slice(0, 5) : null;
    const local = race.location ? String(race.location).trim() : '';
    const fc = forecast?.target && forecast?.predicted ? forecast.predicted : null;
    if (hora) cHoje = { big: hora, small: local ? `partida, ${local}` : 'partida', race: true };
    else if (fc) cHoje = { big: fc.timeLabel, small: 'o treino aponta', race: true };
    else if (local) cHoje = { big: 'Hoje', small: local, race: true };
  }
  const cAmanha = dayCell(amanha, 'amanhã', race?.date?.slice(0, 10) === addDaysISO(today, 1) ? race.name : null);
  const pendenteHoje = trainingItems(liveItems(hoje)).find((i) => i.status === 'pendente' && !isRacePlanItem(i));

  const kcal = gauges?.macros?.find((m) => m.key === 'calories');
  const prot = gauges?.macros?.find((m) => m.key === 'protein');

  // O herói.
  let hero;
  if (race) {
    const dias = diasEntre(today, race.date.slice(0, 10));
    const hora = race.start_time ? String(race.start_time).slice(0, 5) : null;
    const right = forecast?.target
      ? { v: forecast.target.timeLabel, l: 'objetivo' }
      : forecast?.predicted ? { v: forecast.predicted.timeLabel, l: 'o treino aponta' } : null;
    hero = dias <= 0
      ? { n: kmText(race.distance_km) || 'Hoje', l: `${race.name}${hora ? `, às ${hora}` : ', hoje'}`, right, race: true }
      : { n: dias === 1 ? 'Amanhã' : `${dias} dias`, l: `para a ${race.name}${kmText(race.distance_km) ? `, ${kmText(race.distance_km)}` : ''}`, right, race: true };
  } else {
    hero = { n: cHoje.big, l: cHoje.small === 'hoje' ? 'hoje' : cHoje.small, right: null, race: false };
  }

  // A ação: uma só.
  const raceToday = race && race.date.slice(0, 10) === today;
  const action = raceToday
    ? { label: 'Registar a prova', cls: 'is-race', onClick: () => onRegisterRace(race.id) }
    : race
      ? { label: 'Abrir a prova', cls: '', onClick: () => onOpenRace(race.id) }
      : pendenteHoje
        ? { label: 'Registar o treino', cls: '', onClick: () => onCompleteItem(pendenteHoje) }
        : { label: 'Marcar uma prova', cls: 'is-quiet', onClick: onCreateRace };

  // Sem travessões no texto (direção C): as frases do cartão da Carol trazem-nos.
  const carol = messages[0]?.text ? messages[0].text.replace(/\s+—\s+/g, ': ') : null;

  return (
    <div className="v2-screen v2-enter pb-2" data-testid="home-v2">
      <section className="v2-hero" data-testid="home-v2-hero" aria-label={race ? `Próxima prova: ${race.name}` : 'O treino de hoje'}>
        <div className="min-w-0">
          <div className={`v2-hero-n v2-num${hero.race ? ' is-race' : ''}`}>{hero.n}</div>
          <div className="v2-hero-l">{hero.l}</div>
        </div>
        {hero.right && (
          <div className="v2-hero-r">
            <b className="v2-num">{hero.right.v}</b>
            <span>{hero.right.l}</span>
          </div>
        )}
      </section>

      {carol && (
        <div className="v2-say" data-testid="home-v2-carol">
          <i aria-hidden="true" />
          <button type="button" onClick={notices?.openCoach} aria-label={`Carol: ${carol} Abrir a conversa`}>
            <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              <span className="v2-who">Carol.</span> {carol}
            </p>
          </button>
        </div>
      )}

      <div className="v2-grid" data-testid="home-v2-grid">
        <Cell testId="home-v2-hoje" big={cHoje.big} small={cHoje.small} dot={cHoje.race ? 'var(--race)' : treinoDot(hoje)} />
        <Cell testId="home-v2-amanha" big={cAmanha.big} small={cAmanha.small} dot={cAmanha.race ? 'var(--race)' : treinoDot(amanha)} />
        {kcal && <Cell testId="home-v2-kcal" big={nf0.format(kcal.value)} small={`de ${nf0.format(kcal.target)} kcal`} dot="var(--nutrition)" pct={kcal.target ? (kcal.value / kcal.target) * 100 : 0} />}
        {prot && <Cell testId="home-v2-proteina" big={`${nf0.format(prot.value)} g`} small={`de ${nf0.format(prot.target)} g de proteína`} dot="var(--nutrition)" pct={prot.target ? (prot.value / prot.target) * 100 : 0} />}
      </div>

      <button type="button" className={`v2-btn ${action.cls}`} onClick={action.onClick} data-testid="home-v2-action">{action.label}</button>
    </div>
  );
}

// A marca pequena do módulo: um ponto na cor da corrida ou do ginásio.
function treinoDot(items) {
  const t = trainingItems(liveItems(items))[0];
  if (!t) return null;
  return t.kind === 'ginasio' ? 'var(--gym)' : 'var(--run)';
}
