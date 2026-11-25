import React, { useState } from 'react';
import '../../styles/v2-card-race.css';
import AddToCalendar from './AddToCalendar';
import { formatPace, formatTargetTimeLabel, racePriorityLabel, raceTerrainLabel } from '../../utils/run';
import { raceResultLine } from '../../utils/raceDay';
import { safeHttpUrl } from '../../utils/safeUrl';

/* A prova na agenda (o Calendário, as Provas) no Design v2 (pedido do Rui, 25/11; utils/designV2.js).
   Só a forma: o RaceCard de sempre calcula tudo (o plano, a corrida ligada, o que se pode fazer) e
   passa-o feito. Um bloco plano: o ponto âmbar, o nome, a data e a hora; os números (a distância e
   o objetivo, ou o resultado); a Carol numa linha com «Ler mais»; «Ver tudo» abre o resto (a
   contagem, a fase, o site, as notas). As ações da prova ficam (registar, calendário, concluir); o
   hub e o «Eliminar prova» são discretos, e o «Eliminar prova» abre o diálogo de sempre. */

const nf1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
const semTravessao = (t) => (typeof t === 'string' ? t.replace(/\s+—\s+/g, ': ') : t);

export default function RaceAgendaCardV2({
  ev, plan, raceRun, done, isPast, canRegister, canAddToCalendar, raceDayReached,
  dateLabel, startTime, onEdit, onToggleStatus, onDelete, onRegisterRace, onViewRun,
}) {
  const [carolAberta, setCarolAberta] = useState(false);
  const [tudo, setTudo] = useState(false);
  const km = Number(ev.distance_km) > 0 ? `${nf1.format(Math.round(Number(ev.distance_km) * 10) / 10)} km` : null;
  const objetivo = ev.target_time
    ? formatTargetTimeLabel(ev.target_time)
    : ev.target_pace_seconds_per_km ? `${formatPace(ev.target_pace_seconds_per_km)}/km` : null;
  const resultado = raceRun ? raceResultLine(raceRun) : null;
  const carol = done ? null : semTravessao(
    plan.trainingStatus === 'not_started'
      ? plan.carolAnalysis.overviewText
      : (plan.currentPhase?.evaluation?.summary || plan.carolAnalysis.overviewText),
  );
  const contagem = done ? 'Concluída'
    : plan.daysToRace === 0 ? 'É hoje' : plan.daysToRace === 1 ? 'Amanhã'
      : plan.daysToRace > 0 ? `Faltam ${plan.daysToRace} dias`
        : plan.daysToRace === -1 ? 'Ontem' : `Há ${Math.abs(plan.daysToRace)} dias`;
  const fase = plan.trainingStatus === 'not_started'
    ? (plan.daysToStart === 1 ? 'A preparação começa amanhã' : `A preparação começa daqui a ${plan.daysToStart} dias`)
    : `${plan.currentPhase?.name || 'Base Aeróbica'}${plan.trainingStatus === 'in_progress' ? `, semana ${plan.currentWeek} de ${plan.totalWeeks}` : ''}`;
  const detalhesId = `v2-race-more-${ev.id}`;

  return (
    <article className={`v2-card-race${done ? ' is-done' : ''}`} data-testid="race-agenda-v2">
      <header className="v2-card-race-head">
        <i className="v2-dot" style={{ background: 'var(--race)' }} aria-hidden="true" />
        <span className="v2-card-race-type">Prova</span>
        <span className="v2-card-race-when">
          {dateLabel}{startTime ? `, ${startTime}` : ''}{isPast && !done ? ', já passou' : ''}
        </span>
      </header>
      <h3 className="v2-card-race-title">{ev.name}</h3>
      <p className="v2-card-race-meta">
        {[ev.location, ev.race_type ? raceTerrainLabel(ev.race_type) : null, ev.race_priority ? racePriorityLabel(ev.race_priority) : null, done ? 'concluída' : null].filter(Boolean).join(' · ')}
      </p>

      <div className="v2-card-race-nums">
        {km && <div><b className="v2-num">{km}</b><span>distância</span></div>}
        {resultado
          ? <div data-testid="race-card-result"><b className="v2-num">{resultado}</b><span>resultado</span></div>
          : <div><b className="v2-num">{objetivo || 'sem objetivo'}</b><span>objetivo</span></div>}
      </div>

      {carol && (
        <div className="v2-say v2-card-race-say">
          <i aria-hidden="true" />
          <div className="min-w-0">
            <p id={`v2-race-carol-${ev.id}`} style={carolAberta ? undefined : { display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              <span className="v2-who">Carol.</span> {carol}
            </p>
            {carol.length > 60 && (
              <button type="button" className="v2-card-race-link" aria-expanded={carolAberta} aria-controls={`v2-race-carol-${ev.id}`} onClick={() => setCarolAberta((a) => !a)}>
                {carolAberta ? 'Ler menos' : 'Ler mais'}
              </button>
            )}
          </div>
        </div>
      )}

      {canRegister && onRegisterRace && (
        <button type="button" className="v2-btn is-race" onClick={() => onRegisterRace(ev)}>Registar a prova</button>
      )}

      <button type="button" className="v2-card-race-link" aria-expanded={tudo} aria-controls={detalhesId} onClick={() => setTudo((t) => !t)} data-testid="race-agenda-v2-more">
        {tudo ? 'Ver menos' : 'Ver tudo'}
      </button>
      <div id={detalhesId} hidden={!tudo} className="v2-card-race-more">
        <dl>
          <div><dt>Contagem</dt><dd>{contagem}</dd></div>
          {!done && <div><dt>Preparação</dt><dd>{fase}</dd></div>}
          {ev.elevation_gain_m != null && <div><dt>Desnível</dt><dd>{`+${ev.elevation_gain_m} m D+`}</dd></div>}
          {!done && plan.trainingStatus !== 'not_started' && plan.currentPhase?.evaluation?.gradeLabel && (
            <div><dt>A fase</dt><dd>{plan.currentPhase.evaluation.score != null ? `${plan.currentPhase.evaluation.gradeLabel}, ${plan.currentPhase.evaluation.score}%` : plan.currentPhase.evaluation.gradeLabel}</dd></div>
          )}
        </dl>
        {ev.website && (
          <p className="v2-card-race-site">
            {safeHttpUrl(ev.website)
              ? <a href={safeHttpUrl(ev.website)} target="_blank" rel="noopener noreferrer">{ev.website}</a>
              : <span data-testid="race-website-text">{ev.website}</span>}
          </p>
        )}
        {ev.notes && <p className="v2-card-race-notes">{ev.notes}</p>}
        {canAddToCalendar && <AddToCalendar race={ev} raceEventId={ev.id} variant="card" />}
        {raceRun && onViewRun ? (
          <button type="button" className="v2-btn is-quiet" onClick={() => onViewRun(raceRun.id)}>Ver registo</button>
        ) : (
          <button type="button" className="v2-btn is-quiet" disabled={!done && !raceDayReached} onClick={() => { onToggleStatus && onToggleStatus(ev); setTudo(false); }}>
            {done ? 'Repor' : 'Marcar como concluída'}
          </button>
        )}
      </div>

      <div className="v2-card-race-actions">
        {onEdit && <button type="button" className="v2-card-race-act" aria-label="Abrir o hub da prova" onClick={() => onEdit(ev.id)}>Hub</button>}
        {/* Sempre «Eliminar prova»: o botão diz o que apaga (regra do Rui, 2026-11-15). */}
        <button type="button" className="v2-card-race-act is-danger" onClick={() => onDelete && onDelete(ev.id)}>Eliminar prova</button>
      </div>
    </article>
  );
}
