import React, { useState } from 'react';
import { Info } from 'lucide-react';
import '../../styles/v2-components.css';
import { formatDuration, formatPace } from '../../utils/run';
import { FUEL_LABEL } from '../../utils/racePlanImage';

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

export default function RaceHubV2({
  race, moment, dateLine, meta, countdown, phaseLine, forecast, plan, daysToRace,
  overviewText, canRegister, onRegister, onGoToEdit, extras, carolSection, macro, course, site, modal,
}) {
  const target = forecast?.target || null;
  const predicted = forecast?.predicted || null;

  let hero;
  if (moment === 'longe' || !plan) {
    // Longe, com os dois, eles vão para a grelha de baixo: à direita do herói não se repetem.
    const right = target && predicted && moment === 'longe' ? null
      : target ? { v: target.timeLabel, l: 'objetivo' } : predicted ? { v: predicted.timeLabel, l: 'o treino aponta' } : null;
    hero = { n: moment === 'dia' ? 'Hoje' : countdown, l: phaseLine, right, race: true };
  } else {
    // A chegada planeada é a soma dos troços (racePacing.ts), não o objetivo.
    const finish = formatDuration(Math.round(plan.plannedFinishSeconds));
    // À direita, o número que não é a chegada: num objetivo ambicioso o plano monta-se sobre a
    // previsão (a chegada é ela), e o que fica a ver é o objetivo.
    const right = plan.basis === 'previsao'
      ? (target ? { v: target.timeLabel, l: plan.ambitious ? `objetivo, decide ao km ${kmN(plan.decisionKm)}` : 'objetivo' } : null)
      : (predicted ? { v: predicted.timeLabel, l: 'o treino aponta' } : null);
    hero = {
      n: finish,
      l: moment === 'dia' ? 'chegada planeada' : `chegada planeada, ${daysToRace === 1 ? 'amanhã' : `daqui a ${daysToRace} dias`}`,
      right,
      race: false,
    };
  }
  const ambitious = plan?.ambitious ? plan.notes?.[0] : null;
  const [showWhy, setShowWhy] = useState(false);
  const longeComDois = moment === 'longe' && target && predicted;

  return (
    <div className="v2-screen" data-testid="race-hub-prerace" data-moment={moment} data-design="v2">
      <div className="v2-enter" data-testid="race-hub-v2-main">
        <header data-testid="race-hub-header" style={{ padding: '2px 4px 10px' }}>
          <h1 className="v2-title">{race?.name || 'Nova Prova'}</h1>
          <p className="v2-sub" data-testid="race-hub-meta"><span data-testid="race-hub-date">{dateLine}</span>, {meta}</p>
        </header>

        <section className="v2-hero" data-testid="race-hub-v2-hero">
          <div className="min-w-0">
            <div className={`v2-hero-n v2-num${hero.race ? ' is-race' : ''}`} data-testid={plan && moment !== 'longe' ? 'race-pacing-finish' : 'race-hub-countdown'}>{hero.n}</div>
            <div className="v2-hero-l" data-testid="race-hub-phase">{hero.l}</div>
          </div>
          {hero.right && (
            <div className="v2-hero-r">
              <b className="v2-num">{hero.right.v}</b>
              <span>
                {hero.right.l}
                {ambitious && moment !== 'longe' && (
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
                )}
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
