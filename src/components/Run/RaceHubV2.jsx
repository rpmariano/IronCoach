import React, { useState } from 'react';
import { Info } from 'lucide-react';
import '../../styles/v2-components.css';
import { formatDuration, formatPace } from '../../utils/run';
import { FUEL_LABEL, renderRacePlanFile, downloadFile, shareOrDownload, canShareFiles } from '../../utils/racePlanImage';
import { normalizeStartTime } from '../../utils/startTime';
import { pacingRouteInput } from '../../utils/coursePacing';

/* O hub da prova no Design v2 (direção C · Painel, 2026-11-24; utils/designV2.js), antes da prova.
   Só a forma: o RaceHubView continua a calcular tudo (o momento, o plano, a previsão, o plano para
   o dia) e passa-o já feito. Os mesmos três momentos:
   · longe: o herói é a contagem (âmbar, é a prova), com o objetivo ou a previsão à direita;
   · última semana e dia: o herói é a chegada planeada (a soma dos troços), e os troços todos à
     vista; no dia, «Registar a prova» a âmbar logo a seguir ao herói.
   A Carol numa linha, com o traço ciano. O resto (o parecer da Carol inteiro, o macrociclo, o GPX,
   o site) fica recolhido por baixo, nas mesmas secções do hub de sempre. */

const nf1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
// Sem travessões no texto (direção C): as frases partilhadas com o hub de sempre trazem-nos.
const semTravessao = (t) => (typeof t === 'string' ? t.replace(/\s+—\s+/g, ': ') : t);
const kmN = (v) => nf1.format(Math.round(Number(v) * 10) / 10);

function Say({ text, testId }) {
  if (!text) return null;
  return (
    <div className="v2-say" data-testid={testId}>
      <i aria-hidden="true" />
      <p><span className="v2-who">Carol.</span> {semTravessao(text)}</p>
    </div>
  );
}

/* A etiqueta curta de cada troço (2 a 4 palavras), para caberem 6 a 8 no ecrã: o nome do troço do
   percurso, quando o plano o conhece; senão, a fase do plano. A instrução inteira do motor
   (racePacing.ts) fica a um toque na linha. */
export function splitShortLabel(row) {
  if (row?.route) return semTravessao(row.route);
  const ins = String(row?.instruction || '');
  if (row?.label === 'subida') return 'Subida';
  if (row?.label === 'descida') return 'Descida';
  if (row?.label === 'decidir') return 'Decide aqui';
  if (/^Arranque/.test(ins)) return 'Arranque controlado';
  if (/^Ainda a controlar/.test(ins)) return 'Ainda a controlar';
  if (/^Ritmo alvo/.test(ins)) return 'Ritmo alvo';
  if (/^Aguentar/.test(ins)) return 'Aguentar';
  if (/^Se decidiste/.test(ins)) return 'Acelera, se decidiste';
  if (/^Final/.test(ins)) return 'Final';
  return semTravessao(ins.split(/[:.]/)[0]);
}

function Split({ row, effort }) {
  const [open, setOpen] = useState(false);
  const id = `v2-sp-${row.fromKm}-${row.toKm}`;
  return (
    <div className={`v2-sp-wrap${row.label === 'subida' ? ' is-up' : ''}`} data-testid="race-hub-v2-split">
      <button type="button" className="v2-sp" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="v2-km">{kmN(row.fromKm)} a {kmN(row.toKm)}</span>
        <span className="min-w-0">
          <span className="v2-pace" style={effort ? { color: 'var(--v2-ink2)' } : undefined}>{formatPace(row.paceSecPerKm)}</span>
          <span className="v2-w" data-testid="race-hub-v2-split-label">{splitShortLabel(row)}</span>
        </span>
        <span className="v2-cum">{formatDuration(row.cumulativeSeconds)}</span>
      </button>
      <p id={id} hidden={!open} className="v2-sp-more" data-testid="race-hub-v2-split-more">{semTravessao(row.instruction)}</p>
    </div>
  );
}

function Splits({ plan }) {
  const effort = plan.effortMode;
  return (
    <div className="v2-splits" data-testid="race-hub-v2-splits">
      {plan.rows.map((row) => <Split key={`${row.fromKm}-${row.toKm}`} row={row} effort={effort} />)}
      {plan.fuel?.length > 0 && (
        <div className="v2-sp is-stop" data-testid="race-hub-v2-fuel">
          <span className="v2-km">Abastecer</span>
          <span className="v2-w">{plan.fuel.map((f) => `km ${kmN(f.km)}, ${String(FUEL_LABEL[f.what] || f.what).toLowerCase()}`).join('; ')}</span>
        </div>
      )}
    </div>
  );
}

/* O resto do Plano para o dia (revisão de 2026-11-25): o que o cartão de sempre tinha além dos
   troços e o v2 tinha perdido. A hora de partida (ou o atalho para a marcar), a indicação «por
   esforço» no trail, as notas do plano além da primeira, «Buscar o percurso» e guardar ou partilhar
   o plano como imagem, que é o que serve na manhã da prova sem rede. */
function PlanTools({ plan, race, onGoToEdit, onFetchWebInfo, fetchingWebInfo }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const startTime = normalizeStartTime(race?.start_time);
  // Como a v1: com o GPX carregado o percurso já é conhecido, e «Buscar o percurso» não aparece.
  const canFetchRoute = !!onFetchWebInfo && !race?.web_info && !pacingRouteInput(race).hasCourse && !!race?.website?.toString().trim();
  const notas = plan ? (plan.ambitious ? plan.notes.slice(1) : plan.notes) : [];
  const guardar = async ({ viaShare = false } = {}) => {
    setErro('');
    setBusy(true);
    try {
      const file = await renderRacePlanFile(plan, race);
      if (viaShare) await shareOrDownload(file, race?.name ? `Plano · ${race.name}` : 'O meu plano de prova');
      else downloadFile(file);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setErro(viaShare
          ? 'Não consegui abrir a partilha. Guarda a imagem e abre-a a partir da galeria.'
          : 'Não consegui guardar a imagem. Tenta outra vez.');
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="v2-plan-tools" data-testid="race-hub-v2-plan-tools">
      {startTime ? (
        <p className="v2-sub" data-testid="race-pacing-start-time">Partida às {startTime}</p>
      ) : (
        <div className="v2-plan-row">
          <p className="v2-sub" data-testid="race-pacing-start-time-missing">Sem hora de partida: marca-a para a Carol planear a véspera.</p>
          {onGoToEdit && <button type="button" className="v2-link v2-link-inline" data-testid="race-pacing-edit" onClick={onGoToEdit}>Marcar a hora</button>}
        </div>
      )}
      {plan?.effortMode && (
        <p className="v2-sub" data-testid="race-pacing-effort">Por esforço: no trail o ritmo é só referência, o que manda é o esforço.</p>
      )}
      {notas.length > 0 && (
        <div data-testid="race-pacing-notes">
          {notas.map((n) => <p key={n} className="v2-sub v2-plan-note">{semTravessao(n)}</p>)}
        </div>
      )}
      {canFetchRoute && (
        <>
          <p className="v2-sub v2-plan-note">Sem o percurso o plano não ajusta subidas e descidas.</p>
          <button type="button" className="v2-btn is-quiet" data-testid="race-pacing-fetch-route" disabled={fetchingWebInfo} onClick={onFetchWebInfo}>
            {fetchingWebInfo ? 'A buscar o percurso…' : 'Buscar o percurso'}
          </button>
        </>
      )}
      {plan && (
        <div className="v2-plan-img">
          <button type="button" className="v2-btn is-quiet" data-testid="race-pacing-save-image" disabled={busy} onClick={() => guardar()}>
            {busy ? 'A preparar a imagem…' : 'Guardar como imagem'}
          </button>
          {canShareFiles() && (
            <button type="button" className="v2-btn is-quiet" data-testid="race-pacing-share-image" disabled={busy} onClick={() => guardar({ viaShare: true })}>
              Partilhar
            </button>
          )}
        </div>
      )}
      {erro && <p role="alert" className="v2-sub" style={{ color: 'var(--warn)' }}>{erro}</p>}
    </div>
  );
}

export default function RaceHubV2({
  race, moment, dateLine, meta, countdown, phaseLine, forecast, plan, daysToRace,
  overviewText, canRegister, onRegister, onGoToEdit, onFetchWebInfo = null, fetchingWebInfo = false,
  extras, carolSection, macro, course, site, modal,
}) {
  const target = forecast?.target || null;
  const predicted = forecast?.predicted || null;

  let hero;
  if (moment === 'longe' || !plan) {
    // Longe, com os dois, eles vão para a grelha de baixo: à direita do herói não se repetem.
    const right = target && predicted && moment === 'longe' ? null
      : target ? { v: target.timeLabel, l: 'objetivo' } : predicted ? { v: predicted.timeLabel, l: 'o treino aponta' } : null;
    hero = { n: moment === 'dia' ? 'Hoje' : countdown, l: phaseLine, right, race: true };
  } else if (target) {
    /* Com objetivo (decisão do Rui, 2.ª crítica, 2026-11-26): o número grande é o objetivo. A chegada
       planeada (a soma dos troços) contradizia-o quando era outra; fica numa linha secundária, só
       quando difere do objetivo em mais de 5 s. À direita, o que o treino aponta. */
    const plannedS = Math.round(plan.plannedFinishSeconds);
    const differs = Number.isFinite(plannedS) && plannedS > 0 && Math.abs(plannedS - target.seconds) > 5;
    hero = {
      n: target.timeLabel,
      l: `${moment === 'dia' ? 'Objetivo' : `Objetivo, ${daysToRace === 1 ? 'amanhã' : `daqui a ${daysToRace} dias`}`}${plan.effortMode ? ', por esforço' : ''}`,
      plano: differs ? `Plano dos ritmos: ${formatDuration(plannedS)}${plan.ambitious && plan.decisionKm ? `, decide ao km ${kmN(plan.decisionKm)}` : ''}` : null,
      right: predicted ? { v: predicted.timeLabel, l: 'o treino aponta' } : null,
      race: false,
      testId: 'race-hub-target-hero',
    };
  } else {
    // Sem objetivo: a chegada planeada é a soma dos troços (racePacing.ts), como sempre.
    const finish = formatDuration(Math.round(plan.plannedFinishSeconds));
    // À direita, o número que não é a chegada: num objetivo ambicioso o plano monta-se sobre a
    // previsão (a chegada é ela), e o que fica a ver é o objetivo.
    const right = plan.basis === 'previsao'
      ? (target ? { v: target.timeLabel, l: plan.ambitious ? `objetivo, decide ao km ${kmN(plan.decisionKm)}` : 'objetivo' } : null)
      : (predicted ? { v: predicted.timeLabel, l: 'o treino aponta' } : null);
    hero = {
      n: finish,
      l: `${moment === 'dia' ? 'chegada planeada' : `chegada planeada, ${daysToRace === 1 ? 'amanhã' : `daqui a ${daysToRace} dias`}`}${plan.effortMode ? ', por esforço' : ''}`,
      right,
      race: false,
    };
  }
  const ambitious = plan?.ambitious ? plan.notes?.[0] : null;
  const [showWhy, setShowWhy] = useState(false);
  const longeComDois = moment === 'longe' && target && predicted;
  // O ⓘ do objetivo ambicioso: junto do «decide ao km» (na linha do plano, quando o herói é o objetivo).
  const whyToggle = (
    <button
      type="button"
      className="v2-info"
      data-testid="race-pacing-ambitious-toggle"
      aria-label="Porque decide ao km"
      aria-expanded={showWhy}
      aria-controls="race-pacing-ambitious"
      onClick={() => setShowWhy((v) => !v)}
    >
      <Info size={15} aria-hidden="true" />
    </button>
  );

  return (
    <div className="v2-screen" data-testid="race-hub-prerace" data-moment={moment} data-design="v2">
      <div className="v2-enter" data-testid="race-hub-v2-main">
        <header data-testid="race-hub-header" style={{ padding: '2px 4px 10px' }}>
          <h1 className="v2-title">{race?.name || 'Nova Prova'}</h1>
          <p className="v2-sub" data-testid="race-hub-meta"><span data-testid="race-hub-date">{dateLine}</span>, {meta}</p>
        </header>

        <section className="v2-hero" data-testid="race-hub-v2-hero">
          <div className="min-w-0">
            <div className={`v2-hero-n v2-num${hero.race ? ' is-race' : ''}`} data-testid={hero.testId || (plan && moment !== 'longe' ? 'race-pacing-finish' : 'race-hub-countdown')}>{hero.n}</div>
            <div className="v2-hero-l" data-testid="race-hub-phase">{hero.l}</div>
            {hero.plano && (
              <div className="v2-hero-l" data-testid="race-hub-plan-finish">
                {hero.plano}
                {ambitious && moment !== 'longe' && whyToggle}
              </div>
            )}
          </div>
          {hero.right && (
            <div className="v2-hero-r">
              <b className="v2-num">{hero.right.v}</b>
              <span>
                {hero.right.l}
                {ambitious && moment !== 'longe' && !hero.plano && whyToggle}
              </span>
            </div>
          )}
          {ambitious && moment !== 'longe' && (
            <p id="race-pacing-ambitious" hidden={!showWhy} className="v2-hero-why" data-testid="race-pacing-ambitious">{semTravessao(ambitious)}</p>
          )}
        </section>

        {moment === 'dia' && canRegister && (
          <button type="button" className="v2-btn is-race" data-testid="race-hub-register" onClick={onRegister}>Registar a prova</button>
        )}

        {/* Longe, com os dois: a diferença em número e a leitura, numa grelha de dois. */}
        {longeComDois && (
          <div className="v2-grid" data-testid="race-hub-v2-forecast">
            <div className="v2-cell"><b className="v2-num">{target.timeLabel}</b><span>objetivo{target.paceLabel ? `, ${target.paceLabel}` : ''}</span></div>
            <div className="v2-cell"><b className="v2-num">{predicted.timeLabel}</b><span>o treino aponta{predicted.paceLabel ? `, ${predicted.paceLabel}` : ''}</span></div>
          </div>
        )}
        {moment === 'longe' && forecast?.line && <p className="v2-sub" style={{ marginTop: 10 }} data-testid="race-forecast-line">{semTravessao(forecast.line)}</p>}
        {moment === 'longe' && !target && onGoToEdit && (
          <button type="button" className="v2-btn is-quiet" data-testid="race-forecast-set-target" onClick={onGoToEdit}>Marcar o objetivo de tempo</button>
        )}


        {moment !== 'longe' && (plan ? <Splits plan={plan} /> : (
          <div className="v2-splits" data-testid="race-pacing-card">
            <p className="v2-sub" style={{ padding: '8px 0' }}>Marca um objetivo de tempo para eu montar o plano.</p>
            {onGoToEdit && <button type="button" className="v2-btn is-quiet" style={{ marginBottom: 8 }} onClick={onGoToEdit}>Marcar o objetivo de tempo</button>}
          </div>
        ))}
        {moment !== 'longe' && <PlanTools plan={plan} race={race} onGoToEdit={onGoToEdit} onFetchWebInfo={onFetchWebInfo} fetchingWebInfo={fetchingWebInfo} />}

        <Say text={overviewText} testId={moment === 'dia' ? 'race-hub-day-line' : 'race-hub-v2-carol'} />
      </div>

      <div className="v2-more">
        {extras}
        {carolSection}
        {macro}
        {modal}
        {course}
        {site}
      </div>
    </div>
  );
}

/* ── Depois da prova (fase 2, 2026-11-25) ─────────────────────────────────────────────────────
   O tempo oficial gigante; a comparação numa frase; a posição numa linha de três (geral, escalão,
   ritmo). Um só ritmo: o OFICIAL, o tempo oficial a dividir pela distância da PROVA (o hub de
   sempre mostrava o da corrida no topo e o da prova na comparação, e não batiam). O balanço da
   Carol numa linha com o traço ciano, que expande. «E agora?» e o «Editar o registo» discreto. */

const curto = (s) => {
  const a = Math.abs(Math.round(Number(s) || 0));
  if (a < 60) return `${a} s`;
  return formatDuration(a);
};
const ordinal = (n) => `${n}.º`;

/** A comparação numa frase: com a previsão do treino e com o objetivo. '' sem nada a comparar. */
export function doneSentence(breakdown) {
  if (!breakdown?.rows?.length) return '';
  const prev = breakdown.rows.find((r) => r.key === 'previsao');
  const obj = breakdown.rows.find((r) => r.key === 'objetivo');
  const partes = [];
  if (prev) {
    partes.push(prev.delta === 0
      ? 'Exatamente o que o treino apontava'
      : `${curto(prev.delta)} ${prev.delta < 0 ? 'abaixo' : 'acima'} do que o treino apontava`);
  }
  if (obj) {
    const o = obj.delta <= 0
      ? `o objetivo de ${obj.timeLabel} ficou cumprido${obj.delta < 0 ? `, com ${curto(obj.delta)} de margem` : ''}`
      : `o objetivo de ${obj.timeLabel} ficou a ${curto(obj.delta)}`;
    partes.push(partes.length ? o : o.charAt(0).toUpperCase() + o.slice(1));
  }
  return `${partes.join('; ')}.`;
}

export function RaceDoneV2({
  race, finalSeconds, runDistanceKm = null, breakdown, details, carolText, onEditRun, onRegister, onNext, onTalk,
  markCompleted, extras, sections, sheets,
}) {
  const [aberto, setAberto] = useState(false);
  /* «Oficial» só quando o tempo é o da organização (details.official_time_seconds); sem ele é a
     duração do relógio, e diz-se «Tempo da corrida». O ritmo divide pela distância da prova;
     sem ela, pela da corrida (como o hub de sempre). */
  const oficial = Number(details?.official_time_seconds) > 0;
  const raceKm = Number(race?.distance_km) || null;
  const km = raceKm || Number(runDistanceKm) || null;
  const pace = finalSeconds > 0 && km ? formatPace(Math.round(finalSeconds / km)) : null;
  const paceNote = !pace ? null
    : oficial && raceKm ? `O ritmo oficial é o tempo oficial a dividir pelos ${kmN(raceKm)} km da prova.`
    : raceKm ? `O ritmo é o tempo da corrida a dividir pelos ${kmN(raceKm)} km da prova.`
    : `O ritmo é sobre os ${kmN(km)} km da corrida.`;
  const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
  const pos = n(details?.position);
  const participantes = n(details?.participants);
  const escalaoPos = n(details?.age_group_position);
  const escalao = typeof details?.age_group === 'string' ? details.age_group.trim() : '';
  const frase = doneSentence(breakdown);
  /* O tempo feito contra o objetivo, numa linha (2.ª crítica, 2026-11-26): «objetivo 47:00, +1:12».
     O delta é o real menos o objetivo (raceTimesBreakdown): + mais lento, − mais rápido. */
  const objRow = breakdown?.rows?.find((r) => r.key === 'objetivo');
  const vsTarget = objRow && finalSeconds > 0
    ? `objetivo ${objRow.timeLabel}, ${objRow.delta === 0 ? 'no segundo' : `${objRow.delta > 0 ? '+' : '−'}${formatDuration(Math.abs(objRow.delta))}`}`
    : null;
  const texto = carolText ? semTravessao(carolText) : null;

  return (
    <div className="v2-screen" data-testid="race-hub-completed" data-design="v2">
      <div className="v2-enter" data-testid="race-done-v2-main">
        <header style={{ padding: '2px 4px 10px' }}>
          <h1 className="v2-title">{race?.name || 'Prova'}</h1>
          <p className="v2-sub">Concluída</p>
        </header>

        {finalSeconds > 0 ? (
          <section className="v2-res" data-testid="race-done-v2-hero">
            <div className="v2-res-n v2-num" data-testid="race-final-time">{formatDuration(Math.round(finalSeconds))}</div>
            {vsTarget && <p className="v2-res-vs" data-testid="race-done-v2-vs-target">{vsTarget}</p>}
            <p className="v2-res-d" data-testid="race-done-v2-sentence">
              {oficial ? 'Tempo oficial.' : 'Tempo da corrida.'}{frase ? ` ${frase}` : ''}
            </p>
            <div className="v2-row3">
              <div><b className="v2-num">{pos ? ordinal(pos) : '–'}</b><span>{pos && participantes ? `geral, de ${new Intl.NumberFormat('pt-PT', { useGrouping: 'always' }).format(participantes)}` : 'geral'}</span></div>
              <div><b className="v2-num">{escalaoPos ? ordinal(escalaoPos) : '–'}</b><span>{escalao ? `escalão ${escalao}` : 'escalão'}</span></div>
              <div data-testid="race-done-v2-pace"><b className="v2-num">{pace || '–'}</b><span>{oficial && raceKm ? 'ritmo oficial/km' : 'ritmo/km'}</span></div>
            </div>
            {paceNote && <p className="v2-res-note" data-testid="race-done-v2-pace-note">{paceNote}</p>}
          </section>
        ) : (
          <section className="v2-res" data-testid="race-done-v2-hero">
            <div className="v2-res-n v2-num is-race">Por registar</div>
            <p className="v2-res-d">Não tenho a corrida desta prova. Regista-a e mostro-te o tempo final ao lado do objetivo.</p>
            <button type="button" className="v2-btn is-race" onClick={onRegister}>Registar a prova</button>
            {markCompleted}
          </section>
        )}

        {texto && (
          <div className="v2-say" data-testid="race-done-v2-carol">
            <i aria-hidden="true" />
            <button type="button" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
              <p style={aberto ? undefined : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                <span className="v2-who">Carol.</span> {texto}
              </p>
            </button>
          </div>
        )}

        <h2 className="v2-label">E agora?</h2>
        {/* Âmbar só para registar a prova (decisão do Rui): marcar a próxima é discreto. */}
        <button type="button" className="v2-btn is-quiet" data-testid="race-done-next" onClick={onNext}>Marcar a próxima prova</button>
        <button type="button" className="v2-btn is-quiet" data-testid="race-done-talk" onClick={onTalk}>Falar com a Carol</button>
        {onEditRun && (
          <button type="button" className="v2-link" data-testid="race-hub-edit-run" onClick={onEditRun}>Editar o registo</button>
        )}
      </div>

      <div className="v2-more">
        {extras}
        {sections}
      </div>
      {sheets}
    </div>
  );
}
