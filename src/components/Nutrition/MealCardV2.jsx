import React, { useEffect, useState } from 'react';
import CarolLineV2 from '../shared/CarolLineV2';
import { itemNutrients, mealTypeLabel } from '../../utils/nutrition';
import { normalizeStartTime } from '../../utils/startTime';
import { supabase } from '../../lib/supabase';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import PremiumModal from '../shared/PremiumModal';
import CarolQuestions, { questionsImpactText } from './CarolQuestions';
import CarolInterventionActions from '../shared/CarolInterventionActions';
import SaveAsMealButton from './SaveAsMealButton';
import '../../styles/v2-card-meal.css';

/* O cartão da refeição no Design v2 (direção C · Painel): uma linha plana com o ponto da Nutrição,
   o tipo, a hora, as kcal e a proteína em Barlow Condensed, a análise da Carol numa linha (com
   «Ler mais») e o resto (macros, fotografias, observações, alimentos, guardar como refeição) atrás
   de «Ver tudo». Os valores vêm já calculados do MealCard; eliminar é o mesmo fluxo (a mesma
   confirmação, o mesmo handleDeleteMeal). */


export default function MealCardV2({
  meal, onEdit, defaultExpanded = false, hideActions = false,
  n, items, formattedDate, openQuestions, isDeleting, onConfirmDelete,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [carolOpen, setCarolOpen] = useState(defaultExpanded);
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const id = String(meal.id ?? 'x');
  const time = normalizeStartTime(meal.meal_time);
  const when = [formattedDate, time].filter(Boolean).join(' · ');
  const coach = meal.coach_notes;
  const hasPhotos = meal.photo_paths?.length > 0;

  // As fotografias só se pedem com o detalhe aberto (como no cartão de sempre), e também quando o
  // cartão já nasce aberto (o «Registo Guardado»).
  useEffect(() => {
    if (!expanded || !hasPhotos || photos.length > 0) return undefined;
    let alive = true;
    setPhotosLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.storage.from('meal-photos').createSignedUrls(meal.photo_paths, 3600);
        if (alive && !error && data) setPhotos(data.map((d) => d.signedUrl).filter(Boolean));
      } catch (err) {
        console.error('Error loading meal photos:', err);
      } finally {
        if (alive) setPhotosLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, hasPhotos]);

  const handleConfirm = async () => {
    setShowDeleteConfirm(false);
    await onConfirmDelete?.();
  };

  return (
    <article className="v2-card-meal v2-rec" data-testid="meal-card-v2">
      <div className="v2-card-meal-head">
        <i className="v2-dot" style={{ background: 'var(--nutrition)' }} aria-hidden="true" />
        <span className="v2-card-meal-type">Refeição</span>
        {when && <span className="v2-card-meal-time" data-testid="meal-card-v2-time">{when}</span>}
      </div>
      <h4 className="v2-card-meal-title">{mealTypeLabel(meal.meal_type)}</h4>

      <div className="v2-card-meal-nums">
        <span data-testid="meal-card-v2-kcal"><b className="v2-num">{n.calories.toFixed(0)}</b> kcal</span>
        <span data-testid="meal-card-v2-protein"><b className="v2-num">{new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(n.protein)}</b> g proteína</span>
        <span className="v2-card-meal-count">{items.length === 1 ? '1 alimento' : `${items.length} alimentos`}</span>
      </div>

      {/* As perguntas da Carol por responder: à vista com o cartão fechado; na pré-visualização não. */}
      {!hideActions && openQuestions.length > 0 && (
        <button
          type="button"
          data-testid="meal-card-questions"
          className="v2-card-meal-questions"
          onClick={() => setQuestionsOpen(true)}
        >
          <i className="v2-dot" style={{ background: 'var(--coach)' }} aria-hidden="true" />
          <span>A Carol tem {openQuestions.length === 1 ? '1 pergunta' : `${openQuestions.length} perguntas`}</span>
          <span className="v2-card-meal-questions-impact">até {questionsImpactText(openQuestions)}</span>
        </button>
      )}
      {questionsOpen && (
        <PremiumModal isOpen onClose={() => setQuestionsOpen(false)} title="Perguntas da Carol" subtitle={mealTypeLabel(meal.meal_type)} theme="coach" variant="bottom-sheet" maxWidth="max-w-md">
          <div className="px-5 py-4">
            <CarolQuestions meal={meal} onLater={() => setQuestionsOpen(false)} />
          </div>
        </PremiumModal>
      )}

      {coach && (
        <CarolLineV2
          text={coach}
          id={`meal-v2-carol-${id}`}
          open={carolOpen}
          onToggle={() => setCarolOpen((o) => !o)}
          testId="meal-card-v2-carol"
          toggleTestId="meal-card-v2-carol-toggle"
        />
      )}

      <div className="v2-card-meal-bar v2-rec-actions">
        <button
          type="button"
          className="v2-act is-acc"
          aria-expanded={expanded}
          aria-controls={`meal-v2-more-${id}`}
          data-testid="meal-card-v2-more"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Ver menos' : 'Ver tudo'}
        </button>
        {!hideActions && onEdit && (
          <button type="button" className="v2-act" onClick={() => onEdit(meal.id)}>Editar</button>
        )}
        {!hideActions && (
          <button
            type="button"
            className="v2-act is-danger"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
          >
            {isDeleting ? 'A eliminar…' : 'Eliminar refeição'}
          </button>
        )}
      </div>

      {expanded && (
        <div id={`meal-v2-more-${id}`} className="v2-card-meal-more" data-testid="meal-card-v2-details">
          <dl className="v2-card-meal-macros">
            <div><dt>Hidratos</dt><dd className="v2-num">{n.carbs.toFixed(1)} g</dd></div>
            <div><dt>Gordura</dt><dd className="v2-num">{n.fat.toFixed(1)} g</dd></div>
          </dl>

          {hasPhotos && (
            <div className="v2-card-meal-photos">
              {photosLoading ? (
                <p className="v2-card-meal-muted" role="status">A carregar fotos…</p>
              ) : (
                photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="v2-card-meal-thumb" aria-label={`Abrir fotografia ${i + 1} da refeição`}>
                    <img src={url} alt="Refeição" />
                  </a>
                ))
              )}
            </div>
          )}

          <p className="v2-card-meal-notes">
            <span className="v2-card-meal-sub">Observações.</span> {meal.notes || 'Sem observações.'}
          </p>

          {items.length > 0 && (
            <ul className="v2-card-meal-items" data-testid="meal-card-v2-items">
              {items.map((item) => {
                const ni = itemNutrients(item);
                const grams = item.amount_g || item.quantity_grams || item.quantity || 100;
                return (
                  <li key={item.id}>
                    <span className="v2-card-meal-item-name">{item.name || item.food_item?.name || 'Alimento'}</span>
                    <span className="v2-card-meal-item-g"><b className="v2-num">{grams}</b> g</span>
                    <span className="v2-card-meal-item-n">
                      {ni.calories.toFixed(0)} kcal · P {ni.protein.toFixed(1)} g · H {ni.carbs.toFixed(1)} g · G {ni.fat.toFixed(1)} g
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {!hideActions && <CarolInterventionActions record={meal} type="meal" />}
          {!hideActions && <div className="v2-card-meal-save"><SaveAsMealButton meal={meal} /></div>}
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirm}
        isDeleting={isDeleting}
        message="Tem a certeza que deseja eliminar esta refeição? Esta ação não pode ser desfeita."
      />
    </article>
  );
}
