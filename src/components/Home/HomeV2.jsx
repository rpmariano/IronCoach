import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import '../../styles/v2-components.css';
import { useAppStore } from '../../store';
import { addDaysISO } from '../../lib/utils';
import { buildPlanDays, computeAcceptedWindow } from './WeeklyPlanCard';
import { liveItems, trainingItems, planItemTitle, isRacePlanItem, MEAL_LABEL_BY_TIPO, raceForDate } from '../../utils/homeModels';
import { prescriptionExercises } from '../../utils/prescriptionView';
import { mealNutrients } from '../../utils/nutrition';
import { raceForecast } from '../../utils/raceTimes';
import { findRaceRun } from '../../utils/run';
import { upcomingRaces } from '../../utils/upcomingRaces';
import { useCupListing } from '../../utils/useCup';
import CheckinCard from './CheckinCard';
import GettingStartedCard from './GettingStartedCard';
import { useCoachDailyMessages, MessageAction, MessageActions, MessageText } from './CarolCard';
import { pendingProposalsText, useDayDoneMoment, noPlanCopy } from './DayPlanCard';
import { useRaceCardModel, RaceMilestoneLine } from './RaceCard';
import WeekDoneRibbon from './WeekDoneRibbon';
import { weekDone } from './weekDone';
import { isQuotaNoticeActive } from '../../utils/quotaNotice';

/* O Início no Design v2 (direção C · Painel, 2026-11-24; utils/designV2.js). Só com o v2 ligado: o
   Home.jsx escolhe-o e passa-lhe os mesmos modelos e os mesmos handlers — a lógica é a de sempre,
   só a forma muda. De cima para baixo:
   · o herói: a próxima prova (a contagem a âmbar, o objetivo ou a previsão à direita) ou, sem
     prova, o treino de hoje;
   · a Carol numa linha, com o traço ciano (a primeira mensagem do dia, a mesma do cartão dela);
   · «Hoje»: o treino do dia por extenso, e um toque começa a registá-lo (pedido do Rui, 25/11);
   · «Esta semana»: os 7 dias do plano, o tipo de cada um e um visto nos feitos;
   · «Nutrição de hoje»: as kcal, a proteína e as refeições registadas;
   · o check-in, e a ação do dia (começar o treino, registar a prova, abrir a prova). */

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

function Cell({ big, small, dot = null, pct = null, testId, onClick = null, label = null }) {
  const body = (
    <>
      <b className="v2-num">{big}</b>
      <span>{dot && <i className="v2-dot" style={{ background: dot }} aria-hidden="true" />}{small}</span>
      {pct != null && <div className="v2-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>}
    </>
  );
  // Com ação (as refeições de hoje), o mosaico é um botão.
  return onClick
    ? <button type="button" className="v2-cell v2-cell-btn" data-testid={testId} onClick={onClick} aria-label={label || undefined}>{body}</button>
    : <div className="v2-cell" data-testid={testId}>{body}</div>;
}

const DIAS_CURTOS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const DIAS_LONGOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** A segunda-feira da semana de `iso` (a semana do plano vai de segunda a domingo). */
export function mondayOf(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  return addDaysISO(iso, -wd);
}

/** O que um dia é, para a faixa da semana: prova, corrida, ginásio, descanso ou nada. */
export function weekDayKind(items, isRaceDay) {
  if (isRaceDay) return 'prova';
  const t = trainingItems(liveItems(items)).filter((i) => i.status !== 'cancelado');
  if (t.some((i) => isRacePlanItem(i) || i.isRace)) return 'prova';
  if (t.some((i) => i.kind === 'corrida')) return 'corrida';
  if (t.some((i) => i.kind === 'ginasio')) return 'ginasio';
  return liveItems(items).length ? 'descanso' : 'livre';
}
const KIND_LABEL = { prova: 'prova', corrida: 'corrida', ginasio: 'ginásio', descanso: 'descanso', livre: 'livre' };
// Na faixa cabem 7 colunas a 375 px: «descanso» não cabe, diz-se «folga» (o nome acessível diz «descanso»).
const KIND_SHORT = { ...KIND_LABEL, descanso: 'folga' };
const KIND_DOT = { prova: 'var(--race)', corrida: 'var(--run)', ginasio: 'var(--gym)' };

/* «Hoje»: o treino do dia por extenso (o título, o que o plano diz e o estado), e, se está por
   fazer, o toque abre o registo já com o item do plano (o mesmo caminho do «Começar treino»). */
function TodayBlock({ items, raceName, onStart, doneMoment = false }) {
  const vivos = liveItems(items);
  const treinos = trainingItems(vivos).filter((i) => i.status !== 'cancelado' && !isRacePlanItem(i) && !i.isRace);
  if (!treinos.length) {
    const prova = vivos.some((i) => isRacePlanItem(i) || i.isRace);
    const titulo = prova ? `Prova${raceName ? `: ${raceName}` : ''}` : vivos.length ? 'Descanso' : 'Sem treino no plano';
    const sub = prova ? 'Hoje, o que conta é a prova.' : vivos.length ? 'Hoje é para recuperar.' : 'O plano não tem nada para hoje.';
    return (
      <div className="v2-panel v2-today" data-testid="home-v2-today">
        <b className="v2-today-t">{titulo}</b>
        <span className="v2-today-s">{sub}</span>
      </div>
    );
  }
  return (
    <div className="v2-today-list">
      {treinos.map((item) => {
        const feito = item.status === 'concluido';
        const titulo = planItemTitle(item, raceName);
        const exercicios = item.kind === 'ginasio' ? prescriptionExercises(item.prescription) : [];
        const nota = typeof item.notes === 'string' && item.notes.trim() ? item.notes.trim().replace(/\s+—\s+/g, ': ') : null;
        const detalhe = (
          <>
            <span className="v2-today-head">
              <i className="v2-dot" style={{ background: item.kind === 'ginasio' ? 'var(--gym)' : 'var(--run)' }} aria-hidden="true" />
              <b className="v2-today-t">{titulo}</b>
              <span className={`v2-today-state${feito ? ' is-done' : ''}${feito && doneMoment ? ' day-done-check' : ''}`} data-testid="home-v2-today-state">{feito ? 'Feito' : 'Por fazer'}</span>
            </span>
            {/* A distância já vem no título («Corrida contínua · 8 km»); a duração, se o plano a tiver. */}
            {item.kind === 'corrida' && item.target_duration_min > 0 && (
              <span className="v2-today-s">{item.target_duration_min} min</span>
            )}
            {exercicios.length > 0 && (
              <ul className="v2-today-ex" data-testid="home-v2-today-exercises">
                {exercicios.map((e) => <li key={e.name}><span>{e.name}</span>{e.target && <b className="v2-num">{e.target}</b>}</li>)}
              </ul>
            )}
            {nota && <span className="v2-today-note">{nota}</span>}
          </>
        );
        return feito ? (
          <div key={item.id} className="v2-panel v2-today" data-testid="home-v2-today">{detalhe}</div>
        ) : (
          <button key={item.id} type="button" className="v2-panel v2-today v2-today-btn" data-testid="home-v2-today" onClick={() => onStart(item)} aria-label={`${titulo}, por fazer. Começar a registar`}>
            {detalhe}
          </button>
        );
      })}
    </div>
  );
}

/* As ações de uma mensagem da Carol (a prova, a inscrição no Troféu): as mesmas do cartão de sempre. */
function CarolMessageActions({ m, onOpenRace }) {
  if (!m) return null;
  if (m.actions?.length) return <div className="v2-say-act"><MessageActions actions={m.actions} onOpenRace={onOpenRace} /></div>;
  if (m.action) return <div className="v2-say-act"><MessageAction action={m.action} onOpenRace={onOpenRace} /></div>;
  return null;
}

/* «Esta semana»: os 7 dias do plano (segunda a domingo), o tipo de cada um e um visto nos feitos.
   É o que dá contexto à contagem da prova. */
function WeekStrip({ days, today, raceDate }) {
  return (
    <ol className="v2-week" data-testid="home-v2-week" aria-label="Esta semana">
      {days.map((d, i) => {
        const kind = weekDayKind(d.items, raceDate === d.dateISO);
        const t = trainingItems(liveItems(d.items)).filter((x) => x.status !== 'cancelado' && !isRacePlanItem(x) && !x.isRace);
        const feito = t.length > 0 && t.every((x) => x.status === 'concluido');
        const hoje = d.dateISO === today;
        return (
          <li
            key={d.dateISO}
            className={`v2-week-d${hoje ? ' is-today' : ''}${kind === 'prova' ? ' is-race' : ''}`}
            data-testid="home-v2-week-day"
            aria-label={`${DIAS_LONGOS[i]}${hoje ? ', hoje' : ''}: ${KIND_LABEL[kind]}${feito ? ', feito' : ''}`}
          >
            <span className="v2-week-n">{DIAS_CURTOS[i]}</span>
            <span className="v2-week-k" aria-hidden="true">
              {feito ? <Check size={14} strokeWidth={3} /> : KIND_DOT[kind] ? <i className="v2-dot" style={{ background: KIND_DOT[kind], margin: 0 }} /> : <i className="v2-week-none" />}
            </span>
            <span className="v2-week-l">{KIND_SHORT[kind]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function HomeV2({ today, gauges, notices, onOpenRace, onRegisterRace, onCreateRace, onCompleteItem, onOpenMeals = null, onGettingStarted = null }) {
  const { raceEvents, runs, profile, coachPlans, coachPlanItems, loadDailySummary, meals, dailyCheckins, dailySummaryNotice, setActiveTab } = useAppStore();
  const messages = useCoachDailyMessages();
  const [carolAberta, setCarolAberta] = useState(false);
  useEffect(() => { loadDailySummary?.(); }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  /* A próxima prova: a mesma do «Para onde vou» (utils/upcomingRaces.js) — a de hoje e as dos
     últimos 7 dias ficam até estarem registadas; as jornadas fixas do Troféu futuras saem. */
  const { listing: cupListing } = useCupListing();
  const cupFixed = cupListing ? cupListing.isFixed : null;
  const race = useMemo(() => {
    const registadas = new Set((raceEvents || []).filter((e) => findRaceRun(runs, e)).map((e) => e.id));
    return upcomingRaces({ raceEvents, today, isRegistered: (id) => registadas.has(id), cupFixed, limit: 1 })[0] || null;
  }, [raceEvents, runs, today, cupFixed]);
  const forecast = useMemo(() => (race ? raceForecast({ race, runs, profile }) : null), [race, runs, profile]);

  // A semana do plano (segunda a domingo); o dia de hoje sai dela.
  const semana = useMemo(() => {
    const segunda = mondayOf(today);
    const window = computeAcceptedWindow(coachPlans, coachPlanItems, today);
    const aceites = (coachPlans || []).filter((p) => p.status === 'aceite');
    const ids = new Set(aceites.map((p) => p.id));
    const items = window ? (coachPlanItems || []).filter((i) => ids.has(i.plan_id)) : [];
    return buildPlanDays(items, segunda, 7, { plans: aceites, today });
  }, [coachPlans, coachPlanItems, today]);
  const hoje = semana.find((d) => d.dateISO === today)?.items || [];
  const raceDateISO = race?.date?.slice(0, 10) || null;
  // O nome da prova de hoje (pela agenda, como o cartão de sempre), mesmo que o herói seja outra.
  const raceName = raceForDate(raceEvents, today)?.name || (raceDateISO === today ? race.name : null);
  const cHoje = dayCell(hoje, 'hoje', raceName);
  const pendenteHoje = trainingItems(liveItems(hoje)).find((i) => i.status === 'pendente' && !isRacePlanItem(i) && !i.isRace);
  const checkinFeito = (dailyCheckins || []).some((c) => c?.date === today);

  /* Os avisos do Início de sempre, com as mesmas regras (revisão de 2026-11-25: «os avisos para falar
     com a Carol não apareciam» com o v2). O que vem do botão flutuante (useCarolNotices: as
     intervenções, o assunto da carga, os balanços, os insights) já cá estava, montado pelo Home:
     · as propostas de plano por rever (o aviso do «O que faço hoje», DayPlanCard);
     · a semana do plano cumprida (WeekDoneRibbon, weekDone);
     · o momento do dia fechado (useDayDoneMoment, o mesmo do DayPlanCard);
     · o marco da contagem da prova (RaceMilestoneLine, com o modelo do RaceCard);
     · as ações das mensagens da Carol (a prova, a inscrição no Troféu) e o aviso da quota. */
  const propostas = (coachPlans || []).filter((p) => p.status === 'proposto').length;
  /* Sem plano aceite, o «Hoje» diz o que o cartão de sempre diz (noPlanCopy, DayPlanCard): a prova
     de hoje, as propostas no chat, o plano que acabou, ou «Sem plano acordado» com o pedido à
     Carol; e o aviso das propostas só aparece quando esse texto não as diz já (hideBanner). */
  const temPlano = !!computeAcceptedWindow(coachPlans, coachPlanItems, today);
  const semPlano = temPlano ? null : noPlanCopy({
    pendingCount: propostas,
    hadPlan: (coachPlans || []).some((p) => p?.status === 'aceite'),
    raceToday: raceForDate(raceEvents, today),
  });
  const mostrarPropostas = propostas > 0 && (temPlano || !semPlano?.hideBanner);
  const semPlanoAcao = () => {
    if (semPlano?.raceId) { onOpenRace(semPlano.raceId); return; }
    if (!propostas) useAppStore.getState().setCoachIntent('adapt_plan');
    setActiveTab?.('coach');
  };
  const semanaFeita = useMemo(() => weekDone({ plans: coachPlans, planItems: coachPlanItems, today }), [coachPlans, coachPlanItems, today]);
  const doneMoment = useDayDoneMoment(hoje, today);
  const raceModel = useRaceCardModel({ race, profile, runs, today });
  const quota = isQuotaNoticeActive(dailySummaryNotice, Date.now(), today) ? dailySummaryNotice.text : null;

  const kcal = gauges?.macros?.find((m) => m.key === 'calories');
  const prot = gauges?.macros?.find((m) => m.key === 'protein');
  const refeicoes = useMemo(() => (meals || []).filter((m) => m?.date === today), [meals, today]);

  // O herói.
  let hero;
  if (race) {
    const dias = diasEntre(today, raceDateISO);
    const hora = race.start_time ? String(race.start_time).slice(0, 5) : null;
    const right = forecast?.target
      ? { v: forecast.target.timeLabel, l: 'objetivo' }
      : forecast?.predicted ? { v: forecast.predicted.timeLabel, l: 'o treino aponta' } : null;
    hero = dias < 0
      ? { n: 'Por registar', l: `${race.name}, ${dias === -1 ? 'ontem' : `há ${-dias} dias`}`, right, race: true, small: true }
      : dias === 0
      ? { n: kmText(race.distance_km) || 'Hoje', l: `${race.name}${hora ? `, às ${hora}` : ', hoje'}`, right, race: true }
      : { n: dias === 1 ? 'Amanhã' : `${dias} dias`, l: `para a ${race.name}${kmText(race.distance_km) ? `, ${kmText(race.distance_km)}` : ''}`, right, race: true };
  } else {
    hero = { n: cHoje.big, l: cHoje.small === 'hoje' ? 'hoje' : cHoje.small, right: null, race: false };
  }

  /* A ação principal é a do dia: registar a prova (no dia dela, ou por registar), começar o treino
     de hoje; num dia sem treino por fazer, abrir a prova, ou o check-in se ainda não está feito. */
  const raceToRegister = race && raceDateISO <= today;
  const abrirCheckin = () => { document.querySelector('[data-testid="checkin-card"]')?.click(); };
  const action = raceToRegister
    ? { label: 'Registar a prova', cls: 'is-race', onClick: () => onRegisterRace(race.id) }
    : pendenteHoje
      ? { label: pendenteHoje.kind === 'ginasio' ? 'Começar o treino' : 'Começar a corrida de hoje', cls: '', onClick: () => onCompleteItem(pendenteHoje) }
      : race
        ? { label: 'Abrir a prova', cls: '', onClick: () => onOpenRace(race.id) }
        : !checkinFeito
          ? { label: 'Fazer o check-in', cls: 'is-quiet', onClick: abrirCheckin }
          : { label: 'Marcar uma prova', cls: 'is-quiet', onClick: onCreateRace };
  // «Abrir a prova» como link no herói quando a ação principal é outra.
  const heroLink = race && !raceToRegister && action.label !== 'Abrir a prova';

  // Sem travessões no texto (direção C): as frases do cartão da Carol trazem-nos.
  const carol = messages[0]?.text ? messages[0].text.replace(/\s+—\s+/g, ': ') : null;
  const carolLonga = !!carol && (carol.length > 140 || messages.length > 1);

  return (
    <div className="v2-screen v2-enter pb-2" data-testid="home-v2">
      <section className="v2-hero" data-testid="home-v2-hero" aria-label={race ? `Próxima prova: ${race.name}` : 'O treino de hoje'}>
        <div className="min-w-0">
          <div className={`v2-hero-n v2-num${hero.race ? ' is-race' : ''}${hero.small ? ' is-small' : ''}`}>{hero.n}</div>
          <div className="v2-hero-l">{hero.l}</div>
          {heroLink && <button type="button" className="v2-link v2-link-inline" data-testid="home-v2-open-race" onClick={() => onOpenRace(race.id)}>Abrir a prova</button>}
        </div>
        {hero.right && (
          <div className="v2-hero-r">
            <b className="v2-num">{hero.right.v}</b>
            <span>{hero.right.l}</span>
          </div>
        )}
      </section>

      {/* O marco da contagem (100, 50, 30, 14, 7, 3 dias), como no cartão da prova de sempre. */}
      {race && raceModel.model && !raceToRegister && (
        <div className="v2-embed v2-milestone">
          <RaceMilestoneLine key={`${race.id}-${raceModel.model.days}`} raceId={race.id} days={raceModel.model.days} prioridade={race.race_priority} flags={raceModel.flags} comPlano={raceModel.comPlano} comCorridas={raceModel.comCorridas} />
        </div>
      )}

      {carol && (
        <div className="v2-say v2-say-home" data-testid="home-v2-carol">
          <i aria-hidden="true" />
          <div className="min-w-0">
            <p id="home-v2-carol-text" style={carolAberta ? undefined : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              <span className="v2-who">Carol.</span> <MessageText m={{ ...messages[0], text: carol }} />
            </p>
            <CarolMessageActions m={messages[0]} onOpenRace={onOpenRace} />
            {carolAberta && messages.slice(1).map((m) => (
              <div key={m.key} data-testid="home-v2-carol-more">
                <p className="v2-say-more">
                  <span className="v2-say-label" style={m.color === 'var(--warn)' ? { color: 'var(--warn)' } : undefined}>{m.label}.</span>{' '}
                  <MessageText m={{ ...m, text: String(m.text).replace(/\s+—\s+/g, ': ') }} />
                </p>
                <CarolMessageActions m={m} onOpenRace={onOpenRace} />
              </div>
            ))}
            {quota && <p role="status" className="v2-say-more" data-testid="carol-quota-notice">{quota}</p>}
            <div className="v2-say-actions">
              {carolLonga && (
                <button type="button" className="v2-link v2-link-inline" aria-expanded={carolAberta} aria-controls="home-v2-carol-text" data-testid="home-v2-carol-more-toggle" onClick={() => setCarolAberta((a) => !a)}>
                  {carolAberta ? 'Ler menos' : 'Ler mais'}
                </button>
              )}
              <button type="button" className="v2-link v2-link-inline" data-testid="home-v2-carol-chat" onClick={notices?.openCoach}>Falar com a Carol</button>
            </div>
          </div>
        </div>
      )}

      {mostrarPropostas && (
        <button type="button" className="v2-panel v2-alert" data-testid="home-v2-proposals" onClick={() => setActiveTab?.('coach')}>
          <i className="v2-dot" style={{ background: 'var(--coach)' }} aria-hidden="true" />
          <span>{pendingProposalsText(propostas)}</span>
        </button>
      )}

      <h2 className="v2-label">Hoje</h2>
      {semanaFeita && <div className="v2-embed" style={{ marginTop: 0, marginBottom: 8 }}><WeekDoneRibbon done={semanaFeita} /></div>}
      {semPlano ? (
        <div className="v2-panel v2-today" data-testid="home-v2-today">
          <b className="v2-today-t">{semPlano.title}</b>
          <span className="v2-today-s">{semPlano.body}</span>
          <button type="button" className={`v2-btn ${semPlano.raceId ? 'is-race' : 'is-quiet'}`} data-testid="home-v2-no-plan-cta" onClick={semPlanoAcao}>{semPlano.cta}</button>
        </div>
      ) : (
        <TodayBlock items={hoje} raceName={raceName} onStart={onCompleteItem} doneMoment={doneMoment} />
      )}

      <h2 className="v2-label">Esta semana</h2>
      <WeekStrip days={semana} today={today} raceDate={raceDateISO} />

      <h2 className="v2-label">Nutrição de hoje</h2>
      <div className="v2-grid" data-testid="home-v2-grid" style={{ marginTop: 0 }}>
        {kcal && <Cell testId="home-v2-kcal" onClick={onOpenMeals} label={onOpenMeals ? `${nf0.format(kcal.value)} de ${nf0.format(kcal.target)} kcal. Ver as refeições de hoje` : null} big={nf0.format(kcal.value)} small={`de ${nf0.format(kcal.target)} kcal`} dot="var(--nutrition)" pct={kcal.target ? (kcal.value / kcal.target) * 100 : 0} />}
        {prot && <Cell testId="home-v2-proteina" onClick={onOpenMeals} label={onOpenMeals ? `${nf0.format(prot.value)} de ${nf0.format(prot.target)} g de proteína. Ver as refeições de hoje` : null} big={`${nf0.format(prot.value)} g`} small={`de ${nf0.format(prot.target)} g de proteína`} dot="var(--nutrition)" pct={prot.target ? (prot.value / prot.target) * 100 : 0} />}
      </div>
      <button type="button" className="v2-panel v2-meals" data-testid="home-v2-meals" onClick={onOpenMeals || undefined} disabled={!onOpenMeals}>
        {refeicoes.length ? (
          <ul>
            {refeicoes.map((m) => {
              const n = mealNutrients(m);
              return (
                <li key={m.id}>
                  <span>{MEAL_LABEL_BY_TIPO[m.meal_type] || m.meal_type || 'Refeição'}</span>
                  {n?.calories > 0 && <b className="v2-num">{nf0.format(Math.round(n.calories))} kcal</b>}
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="v2-today-s">Ainda sem refeições hoje.</span>
        )}
        <span className="v2-meals-go">Ver as refeições de hoje</span>
      </button>

      {/* O que falta para começar (só enquanto falta alguma coisa: o próprio cartão decide). Depois
          do dia: o que interessa primeiro é o treino de hoje. */}
      {onGettingStarted && <div className="v2-embed"><GettingStartedCard onAction={onGettingStarted} /></div>}

      {/* O check-in diário (como te sentes hoje): o mesmo cartão, com os tokens do v2. */}
      <div className="v2-embed" data-testid="home-v2-checkin"><CheckinCard /></div>

      <button type="button" className={`v2-btn ${action.cls}`} onClick={action.onClick} data-testid="home-v2-action">{action.label}</button>
    </div>
  );
}
