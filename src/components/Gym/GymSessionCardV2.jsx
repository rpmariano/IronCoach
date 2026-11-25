import React, { useEffect, useRef, useState } from 'react';
import CarolLineV2 from '../shared/CarolLineV2';
import '../../styles/v2-components.css';
import '../../styles/v2-card-gym.css';
import CarolMuscleAnatomy from '../GraphicsLibrary/CarolMuscleAnatomy';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import CarolInterventionActions from '../shared/CarolInterventionActions';
import { mapCategoriesToMuscles } from '../../utils/gym';
import { formatDuration } from '../../utils/run';
import { describeSavedSet } from '../../utils/gymSets';
import { normalizeStartTime } from '../../utils/startTime';

/* O cartão do treino no Design v2 (direção C · Painel): uma linha plana com o
   ponto do ginásio, o título e a hora; os números (exercícios e volume) em
   Barlow Condensed; a análise da Carol numa linha com «Ler mais»; Editar e
   Eliminar discretos. Tudo o que o cartão de sempre mostra (métricas, músculos,
   prints, observações, séries) fica atrás de «Ver tudo». O estado e os fluxos
   (as fotos, a confirmação de eliminar, o Editar) vêm do GymSessionCard. */

export default function GymSessionCardV2({
  session, onEdit, hideActions = false, defaultExpanded = false,
  isAula, groupedSets, totalSets, volume, formattedDate, metricChips, coachCommentary,
  photos, photosLoading, loadPhotos,
  isDeleting, showDeleteConfirm, setShowDeleteConfirm, handleDeleteSession,
}) {
  const [detailsOpen, setDetailsOpen] = useState(defaultExpanded);
  const [carolOpen, setCarolOpen] = useState(defaultExpanded);
  const triedPhotos = useRef(false);

  // As fotos carregam quando os detalhes abrem (também quando já nascem
  // abertos, no "Registo Guardado"). Uma tentativa só: um erro não repete.
  const hasPhotos = session.photo_paths?.length > 0;
  useEffect(() => {
    if (detailsOpen && hasPhotos && !triedPhotos.current && photos.length === 0) {
      triedPhotos.current = true;
      loadPhotos();
    }
  }, [detailsOpen, hasPhotos, photos.length, loadPhotos]);

  const exercises = Object.entries(groupedSets);
  const id = session.id || 'gym';
  const detailsId = `v2-card-gym-details-${id}`;
  const carolId = `v2-card-gym-carol-${id}`;

  const title = session.name || (isAula ? 'Aula' : 'Treino de Força');
  const meta = [formattedDate, normalizeStartTime(session.start_time),
    isAula && session.class_types?.length ? session.class_types.join(', ') : null,
    session.categories?.length ? session.categories.join(', ') : null]
    .filter(Boolean).join(' · ');

  const nums = [];
  if (exercises.length > 0) nums.push({ key: 'ex', n: exercises.length, l: exercises.length === 1 ? 'exercício' : 'exercícios' });
  if (volume > 0) nums.push({ key: 'vol', n: Math.round(volume).toLocaleString('pt-PT'), l: 'kg de volume' });
  else if (totalSets > 0) nums.push({ key: 'sets', n: totalSets, l: totalSets === 1 ? 'série' : 'séries' });
  if (isAula && session.duration_seconds) nums.push({ key: 'dur', n: formatDuration(session.duration_seconds), l: 'duração' });

  return (
    <div className="v2-card-gym v2-panel v2-rec" data-testid="gym-card-v2">
      <div className="v2-card-gym-head">
        <i className="v2-dot" style={{ background: 'var(--gym)' }} aria-hidden="true" />
        <span className="v2-card-gym-type">{isAula ? 'Aula' : 'Ginásio'}</span>
      </div>
      <h4 className="v2-card-gym-title">{title}</h4>
      {meta && <p className="v2-card-gym-meta">{meta}</p>}

      {nums.length > 0 && (
        <div className="v2-card-gym-nums">
          {nums.map((x) => (
            <div key={x.key} className="v2-card-gym-num" data-testid={`gym-v2-num-${x.key}`}>
              <b className="v2-num">{x.n}</b>
              <span>{x.l}</span>
            </div>
          ))}
        </div>
      )}

      {coachCommentary && (
        <CarolLineV2
          text={coachCommentary}
          id={carolId}
          open={carolOpen}
          onToggle={() => setCarolOpen((o) => !o)}
          testId="gym-v2-carol"
        />
      )}

      <div className="v2-card-gym-actions v2-rec-actions">
        <button
          type="button"
          className="v2-act is-acc"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((o) => !o)}
        >
          {detailsOpen ? 'Ver menos' : 'Ver tudo'}
        </button>
        {!hideActions && onEdit && (
          <button type="button" className="v2-act" onClick={() => onEdit(session.id)}>
            Editar
          </button>
        )}
        {!hideActions && (
          <button
            type="button"
            className="v2-act is-danger"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            aria-label="Eliminar treino"
          >
            {isDeleting ? 'A eliminar…' : 'Eliminar treino'}
          </button>
        )}
      </div>

      {detailsOpen && (
        <div id={detailsId} className="v2-card-gym-details" data-testid="gym-v2-details">
          {metricChips.length > 0 && (
            <p className="v2-card-gym-metrics">{metricChips.map((c) => c.label).join(' · ')}</p>
          )}

          {session.categories?.length > 0 && (
            <CarolMuscleAnatomy activeMuscles={mapCategoriesToMuscles(session.categories)} naked />
          )}

          {hasPhotos && (
            <div className="v2-card-gym-block">
              <p className="v2-card-gym-label">Prints do treino</p>
              {photosLoading ? (
                <p className="v2-card-gym-muted" role="status">A carregar fotos...</p>
              ) : (
                <div className="v2-card-gym-photos">
                  {photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="v2-card-gym-thumb" aria-label={`Abrir print ${i + 1} do treino`}>
                      <img src={url} alt="Print" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="v2-card-gym-block">
            <p className="v2-card-gym-label">Observações</p>
            <p className="v2-card-gym-muted">{session.notes || 'Sem observações.'}</p>
          </div>

          {exercises.length > 0 && (
            <ul className="v2-card-gym-ex">
              {exercises.map(([exName, exSets]) => (
                <li key={exName}>
                  <p className="v2-card-gym-ex-name">{exName}</p>
                  <ol className="v2-card-gym-sets">
                    {exSets.map((s, idx) => (
                      <li key={s.id || idx}>
                        <span>Série {idx + 1}</span>
                        <b className="v2-num">{describeSavedSet(s)}</b>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          )}

          {!hideActions && <CarolInterventionActions record={session} type="gym" />}
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteSession}
        isDeleting={isDeleting}
        message="Tem a certeza que deseja eliminar este treino? Esta ação não pode ser desfeita."
      />
    </div>
  );
}
