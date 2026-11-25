import React, { useState, useId } from 'react';
import { PersonStanding, Loader2 } from 'lucide-react';
import { isWalk } from '@formulas/runKinds.ts';
import CoachText from '../shared/CoachText';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import CarolInterventionActions from '../shared/CarolInterventionActions';
import { formatDuration, formatPace } from '../../utils/run';
import '../../styles/v2-components.css';
import '../../styles/v2-card-run.css';

/* O cartão da corrida no Design v2 (direção C · Painel): uma linha plana. O tipo com o ponto da
   corrida, o título e a hora; os números grandes (km e ritmo); a Carol numa linha com «Ler mais»;
   Editar e Eliminar discretos. Tudo o que o cartão de sempre mostra continua cá, atrás de «Ver
   tudo». O estado, os handlers e os valores derivados vêm do RunCard (os mesmos fluxos, o mesmo
   aviso de eliminar). Âmbar só na prova. */

/** A Carol numa linha: o texto sem marcas de negrito nem quebras. */
function oneLine(text) {
  return String(text || '').replace(/\*\*/g, '').replace(/^##\s+/gm, '').replace(/\s+/g, ' ').trim();
}

export default function RunCardV2({
  run, onEdit, hideActions, defaultExpanded,
  expanded, toggleExpand, photos, photosLoading,
  isDeleting, isReanalyzing, handleReanalyze, handleDelete,
  showDeleteConfirm, setShowDeleteConfirm, raceThatReverts, raceEvents,
  kindLabel, dateLine, durStr, paceVal, coachCommentary,
  details, hrZones, splits, chips, effortColors,
}) {
  const [carolOpen, setCarolOpen] = useState(!!defaultExpanded);
  const uid = useId();
  const carolId = `${uid}-carol`;
  const moreId = `${uid}-more`;

  const walk = isWalk(run);
  const title = run.title || run.name || (walk ? 'Caminhada' : 'Corrida');
  const isRace = run.kind === 'competicao' || !!run.race_id;
  const race = run.race_id ? (raceEvents || []).find((e) => e.id === run.race_id) : null;
  const km = run.distance_km ? Number(run.distance_km).toFixed(2) : null;
  const pace = paceVal ? formatPace(paceVal) : null;
  const extraChips = (chips || []).filter((c) => c.key !== 'dur');
  const hasPhotos = run.photo_paths?.length > 0;
  const hasBio = details.ground_contact_time_ms || details.vertical_oscillation_cm || details.asymmetry_pct || details.leg_stiffness_kn_m;

  return (
    <article className="v2-panel v2-card-run" data-testid="run-card-v2">
      <div className="v2-card-run-head">
        <i className="v2-dot" style={{ background: 'var(--run)' }} aria-hidden="true" />
        {walk && <PersonStanding size={14} className="v2-card-run-walk" aria-label="Caminhada" data-testid="icone-caminhada" />}
        <span className={`v2-card-run-type${isRace ? ' is-race' : ''}`}>{kindLabel}</span>
        {dateLine && <span className="v2-card-run-time">{dateLine}</span>}
      </div>
      <h4 className="v2-card-run-title">{title}</h4>
      {race?.name && <p className="v2-card-run-race" data-testid="run-card-v2-race">{race.name}</p>}

      {(km || pace || durStr) && (
        <div className="v2-card-run-nums">
          {km && <div><b className="v2-num">{km}</b><span>km</span></div>}
          {pace && <div><b className="v2-num">{pace}</b><span>/km</span></div>}
          {durStr && <div className="is-minor"><b className="v2-num">{durStr}</b><span>tempo</span></div>}
        </div>
      )}

      {coachCommentary && (
        <div className="v2-say v2-card-run-say" data-testid="run-card-v2-carol">
          <i aria-hidden="true" />
          <div className="min-w-0">
            <div id={carolId}>
              {carolOpen ? (
                <div className="v2-card-run-carol-full">
                  <span className="v2-who">Análise da Carol</span>
                  <CoachText>{coachCommentary}</CoachText>
                </div>
              ) : (
                <p className="v2-card-run-carol-line"><span className="v2-who">Carol.</span> {oneLine(coachCommentary)}</p>
              )}
            </div>
            <button
              type="button"
              className="v2-link v2-link-inline v2-card-run-more"
              aria-expanded={carolOpen}
              aria-controls={carolId}
              onClick={() => setCarolOpen((o) => !o)}
            >
              {carolOpen ? 'Ler menos' : 'Ler mais'}
            </button>
          </div>
        </div>
      )}

      <div className="v2-card-run-actions">
        <button
          type="button"
          className="v2-card-run-act"
          aria-expanded={expanded}
          aria-controls={moreId}
          aria-label={expanded ? 'Fechar detalhes da corrida' : 'Ver detalhes da corrida'}
          onClick={toggleExpand}
        >
          {expanded ? 'Ver menos' : 'Ver tudo'}
        </button>
        {!hideActions && hasPhotos && (
          <button type="button" className="v2-card-run-act" onClick={handleReanalyze} disabled={isReanalyzing}>
            {isReanalyzing ? 'A reanalisar…' : 'Reanalisar'}
          </button>
        )}
        {!hideActions && onEdit && (
          <button type="button" className="v2-card-run-act" onClick={(e) => { e.stopPropagation(); onEdit(run.id); }}>
            Editar
          </button>
        )}
        {!hideActions && (
          <button type="button" className="v2-card-run-act is-danger" onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}>
            {isDeleting ? 'A eliminar…' : 'Eliminar'}
          </button>
        )}
      </div>

      {expanded && (
        <div id={moreId} className="v2-card-run-more-body" data-testid="run-card-v2-details">
          {extraChips.length > 0 && (
            <ul className="v2-card-run-facts">
              {extraChips.map((c) => <li key={c.key}>{c.label}</li>)}
            </ul>
          )}

          {hasPhotos && (
            <div>
              <h5 className="v2-card-run-h">Prints</h5>
              {photosLoading ? (
                <p className="v2-card-run-note"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> A carregar prints...</p>
              ) : (
                <div className="v2-card-run-thumbs">
                  {photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="v2-card-run-thumb">
                      <img src={url} alt="Print" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {Array.isArray(hrZones) && hrZones.length > 0 && (() => {
            const maxMinutes = Math.max(...hrZones.map((z) => Number(z.minutes) || 0), 1);
            return (
              <div>
                <h5 className="v2-card-run-h">Zonas de FC</h5>
                {[...hrZones].sort((a, b) => (a.zone || 0) - (b.zone || 0)).map((z, i) => (
                  <div key={i} className="v2-card-run-zone">
                    <span>Z{z.zone}</span>
                    <div className="v2-card-run-zbar"><i style={{ width: `${Math.max(4, ((Number(z.minutes) || 0) / maxMinutes) * 100)}%` }} /></div>
                    <span className="v2-num">{Number(z.minutes).toFixed(0)} min</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {Array.isArray(splits) && splits.length > 0 && (
            <div>
              <h5 className="v2-card-run-h">Splits</h5>
              {splits.map((s, i) => {
                const splitPace = s.distance_km && s.time_seconds ? s.time_seconds / s.distance_km : null;
                return (
                  <div key={i} className="v2-card-run-split">
                    <span>{i + 1}.</span>
                    <span className="v2-num">{s.distance_km ? `${Number(s.distance_km).toFixed(2)} km` : '-'}</span>
                    <span className="v2-num">{s.time_seconds ? formatDuration(s.time_seconds) : '-'}</span>
                    <span className="v2-num">{splitPace ? `${formatPace(splitPace)}/km` : ''}</span>
                  </div>
                );
              })}
            </div>
          )}

          {hasBio && (
            <div>
              <h5 className="v2-card-run-h">Biomecânica de corrida</h5>
              <ul className="v2-card-run-facts">
                {details.ground_contact_time_ms && <li>Contacto solo {details.ground_contact_time_ms} ms</li>}
                {details.flight_time_ms && <li>Tempo de voo {details.flight_time_ms} ms</li>}
                {details.vertical_oscillation_cm && <li>Oscilação vertical {details.vertical_oscillation_cm} cm</li>}
                {details.asymmetry_pct !== undefined && details.asymmetry_pct !== null && <li>Assimetria {details.asymmetry_pct}%</li>}
                {details.leg_stiffness_kn_m && <li>Rigidez {details.leg_stiffness_kn_m} kN/m</li>}
              </ul>
            </div>
          )}

          {(details.aerobic_threshold_bpm || details.anaerobic_threshold_bpm) && (
            <div>
              <h5 className="v2-card-run-h">Limiares fisiológicos (FC)</h5>
              <ul className="v2-card-run-facts">
                {details.aerobic_threshold_bpm && <li>Limiar aeróbio {details.aerobic_threshold_bpm} bpm</li>}
                {details.anaerobic_threshold_bpm && <li>Limiar anaeróbio {details.anaerobic_threshold_bpm} bpm</li>}
              </ul>
            </div>
          )}

          {details.sweat_loss_ml && (
            <p className="v2-card-run-note">
              Perda por transpiração estimada: {details.sweat_loss_ml} ml. Repor ~{Math.round(details.sweat_loss_ml * 1.5)} ml.
            </p>
          )}

          {run.effort_rpe && (
            <div>
              <h5 className="v2-card-run-h">Esforço <span className="v2-num">{run.effort_rpe}/10</span></h5>
              <div className="v2-card-run-effort" aria-hidden="true">
                {Array(10).fill(0).map((_, i) => (
                  <i key={i} style={{ background: i < run.effort_rpe ? effortColors[i] : 'var(--v2-rule)' }} />
                ))}
              </div>
            </div>
          )}

          {run.notes && (
            <div>
              <h5 className="v2-card-run-h">Observações</h5>
              <p className="v2-card-run-note">{run.notes}</p>
            </div>
          )}

          {!hideActions && <CarolInterventionActions record={run} type="run" />}
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        message={raceThatReverts
          ? `Tem a certeza que deseja eliminar esta corrida? É o registo de ${raceThatReverts.name ? `«${raceThatReverts.name}»` : 'uma prova'}: a prova volta a ficar por registar e o balanço da Carol sai. O diploma, a medalha e as fotos da prova ficam guardados. Esta ação não pode ser desfeita.`
          : 'Tem a certeza que deseja eliminar esta corrida? Esta ação não pode ser desfeita.'}
      />
    </article>
  );
}
