import React, { useState } from 'react';
import { BODY_METRICS, BODY_METRIC_BY_KEY, fmtMetric, fmtMetricValue } from '../../utils/body';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import CarolLineV2 from '../shared/CarolLineV2';
import CarolInterventionActions from '../shared/CarolInterventionActions';
import '../../styles/v2-card-body.css';

/* O cartão da avaliação corporal no Design v2 (direção C · Painel, 2026-11-25): uma linha plana
   com o ponto do Corpo, o título e a hora; o peso e a gordura em números grandes; a análise da
   Carol numa linha com «Ler mais»; as outras medidas e as observações atrás de «Ver tudo»; Editar
   e Eliminar discretos. O estado da eliminação e o diálogo de confirmação vêm do cartão de sempre
   (BodyAssessmentCard), que decide entre as duas variantes: o fluxo é o mesmo. */

const MAIN_KEYS = ['weight_kg', 'body_fat_pct'];

export default function BodyAssessmentCardV2({
  assessment,
  onEdit,
  defaultExpanded = false,
  hideActions = false,
  dateLabel,
  coachCommentary,
  isDeleting,
  showDeleteConfirm,
  onAskDelete,
  onCloseDelete,
  onConfirmDelete,
}) {
  const [carolOpen, setCarolOpen] = useState(defaultExpanded);
  const [detailsOpen, setDetailsOpen] = useState(defaultExpanded);
  const id = assessment.id ?? 'x';
  const carolId = `v2-card-body-carol-${id}`;
  const detailsId = `v2-card-body-details-${id}`;

  const mains = MAIN_KEYS
    .map((key) => ({ key, metric: BODY_METRIC_BY_KEY[key], val: assessment[key] }))
    .filter(({ val }) => val !== null && val !== undefined && val !== '' && Number.isFinite(Number(val)));

  const others = BODY_METRICS.filter((m) => !MAIN_KEYS.includes(m.key))
    .map((m) => ({ metric: m, val: assessment[m.key] }))
    .filter(({ val }) => val !== null && val !== undefined && val !== '');


  return (
    <article className="v2-panel v2-card-body v2-rec" data-testid="v2-card-body">
      <header className="v2-card-body-head">
        <span className="v2-card-body-type">
          <i className="v2-dot" style={{ background: 'var(--body)' }} aria-hidden="true" data-testid="v2-card-body-dot" />
          Corpo
        </span>
        <h4 className="v2-card-body-title">Avaliação corporal</h4>
        {dateLabel && <span className="v2-card-body-time" data-testid="v2-card-body-time">{dateLabel}</span>}
      </header>

      {mains.length > 0 ? (
        <div className="v2-card-body-nums" data-testid="v2-card-body-nums">
          {mains.map(({ key, metric, val }) => (
            <div key={key} className="v2-card-body-num" data-testid={`v2-card-body-num-${key}`}>
              <b className="v2-num">
                {fmtMetricValue(metric, val)}
                <small>{metric.unit}</small>
              </b>
              <span>{key === 'weight_kg' ? 'peso' : 'gordura corporal'}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="v2-card-body-empty">Sem peso nem gordura nesta avaliação.</p>
      )}

      {coachCommentary && (
        <CarolLineV2
          text={coachCommentary}
          id={carolId}
          open={carolOpen}
          onToggle={() => setCarolOpen((o) => !o)}
          testId="v2-card-body-carol"
          toggleTestId="v2-card-body-carol-toggle"
        />
      )}

      <div className="v2-card-body-actions v2-rec-actions" data-testid="v2-card-body-actions">
        <button
          type="button"
          className="v2-act is-acc"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          data-testid="v2-card-body-details-toggle"
          onClick={() => setDetailsOpen((o) => !o)}
        >
          {detailsOpen ? 'Ver menos' : 'Ver tudo'}
        </button>
        {!hideActions && onEdit && (
          <button type="button" className="v2-act" onClick={() => onEdit(assessment.id)}>
            Editar
          </button>
        )}
        {!hideActions && (
          <button
            type="button"
            className="v2-act is-danger"
            onClick={onAskDelete}
            disabled={isDeleting}
            aria-label="Eliminar avaliação"
          >
            {isDeleting ? 'A eliminar…' : 'Eliminar avaliação'}
          </button>
        )}
      </div>

      {detailsOpen && (
        <div id={detailsId} className="v2-card-body-details" data-testid="v2-card-body-details">
          {others.length > 0 && (
            <ul className="v2-card-body-metrics">
              {others.map(({ metric, val }) => (
                <li key={metric.key} data-testid={`v2-card-body-metric-${metric.key}`}>
                  <span>{metric.label}</span>
                  <b className="v2-num">{fmtMetric(metric, val)}</b>
                </li>
              ))}
            </ul>
          )}
          <p className="v2-card-body-notes">
            <span className="v2-card-body-notes-l">Observações.</span> {assessment.notes || 'Sem observações.'}
          </p>
        </div>
      )}

      {!hideActions && <CarolInterventionActions record={assessment} type="body" />}

      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={onCloseDelete}
        onConfirm={onConfirmDelete}
        isDeleting={isDeleting}
        message="Tem a certeza que deseja eliminar esta avaliação corporal? Esta ação não pode ser desfeita."
      />
    </article>
  );
}
