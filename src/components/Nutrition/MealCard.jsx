import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sunrise, Coffee, Sun, Cookie, Moon, Utensils, Trash2, MessageSquare, Loader2, Flame, Beef, Wheat, Droplet, Award, PencilLine } from 'lucide-react';
import { mealNutrients, itemNutrients, mealTypeLabel } from '../../utils/nutrition';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import CoachText from '../shared/CoachText';

const MEAL_ICONS = {
  'pequeno-almoco': Sunrise,
  'lanche-manha': Coffee,
  'almoco': Sun,
  'lanche': Cookie,
  'jantar': Moon,
};

/* O cartão é só de consulta e de eliminar. Qualquer alteração ao conteúdo
   passa pelo botão "Editar" → MealRegistration, porque mexer nos alimentos
   ou nas observações muda a análise do Coach e tem de a regenerar (as
   observações entram no prompt de estimação — "hambúrguer" caseiro e do
   McDonald's não dão os mesmos valores). Editar aqui à mão deixava a
   "Análise do Coach" a descrever uma refeição que já não existe. */
export default function MealCard({ meal, onEdit }) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const { profile, loadInitialData } = useAppStore();
  const [isDeleting, setIsDeleting] = useState(false);

  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  const n = mealNutrients(meal);
  const items = meal.meal_items || [];
  const IconComponent = MEAL_ICONS[meal.meal_type] || Utensils;

  const coachCommentary = meal.coach_notes;

  const dateParts = meal.date ? meal.date.split('-') : [];
  const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : meal.date;

  const toggleExpand = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    if (willExpand && meal.photo_paths?.length > 0 && photos.length === 0) {
      setPhotosLoading(true);
      try {
        const { data, error } = await supabase.storage.from('meal-photos').createSignedUrls(meal.photo_paths, 3600);
        if (!error && data) {
          setPhotos(data.map(d => d.signedUrl).filter(Boolean));
        }
      } catch (err) {
        console.error('Error loading meal photos:', err);
      } finally {
        setPhotosLoading(false);
      }
    }
  };

  const handleDeleteMeal = async () => {
    if (!confirm('Tem a certeza que deseja eliminar esta refeição?')) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('meals').delete().eq('id', meal.id);
      if (error) throw error;
      if (profile?.id) {
        await loadInitialData(profile.id);
      }
      showToast('Refeição eliminada');
    } catch (err) {
      console.error('Error deleting meal:', err);
      showToast('Erro ao eliminar refeição.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-[var(--surf-detail)] border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3 transition">
      {/* Header Bar */}
      <div 
        onClick={toggleExpand}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100/70 border border-emerald-200/60 flex items-center justify-center text-emerald-600 shrink-0">
            <IconComponent size={18} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 leading-tight">
              {mealTypeLabel(meal.meal_type)}
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {formattedDate} · {items.length} item(s)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-emerald-600">
            {n.calories.toFixed(0)} kcal
          </span>
          {/* A linha inteira é clicável, mas o chevron é o controlo real —
              é ele que dá acesso por teclado e o estado ao leitor de ecrã. */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
            type="button"
            aria-label={expanded ? 'Fechar detalhes da refeição' : 'Ver detalhes da refeição'}
            aria-expanded={expanded}
            className="tap-44 text-slate-400 hover:text-slate-600 shrink-0"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="space-y-3 pt-2 border-t border-slate-200/60 fade-in">
          {/* Pílulas Coloridas com Ícones + Valores Reais */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200/80 text-slate-700 shadow-xs flex items-center gap-1.5">
              <Flame size={14} className="text-orange-500" />
              {n.calories.toFixed(0)} kcal
            </span>
            <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100/90 text-emerald-800 border border-emerald-200/80 shadow-xs flex items-center gap-1.5">
              <Beef size={14} className="text-emerald-700" />
              {n.protein.toFixed(1)}g Proteína
            </span>
            <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-orange-100/90 text-orange-800 border border-orange-200/80 shadow-xs flex items-center gap-1.5">
              <Wheat size={14} className="text-orange-700" />
              {n.carbs.toFixed(1)}g Hidratos
            </span>
            <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-sky-100/90 text-sky-800 border border-sky-200/80 shadow-xs flex items-center gap-1.5">
              <Droplet size={14} className="text-sky-700" />
              {n.fat.toFixed(1)}g Gordura
            </span>
          </div>

          {/* Photos if present */}
          {meal.photo_paths?.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fotografias</span>
              {photosLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <Loader2 size={14} className="animate-spin" /> A carregar fotos...
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt="Refeição" className="w-20 h-20 object-cover rounded-xl border border-slate-200 shadow-xs hover:opacity-95 transition" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Observações — só leitura; alterar é pelo botão "Editar" */}
          <div className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <MessageSquare size={14} className="text-slate-400" /> Observações
            </div>
            <p className="text-xs text-slate-500 italic mt-1">
              {meal.notes || 'Sem observações.'}
            </p>
          </div>

          {/* Food Items List */}
          {items.map(item => {
            const ni = itemNutrients(item);

            return (
              <div key={item.id} className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-xs space-y-2">
                <span className="text-xs font-bold text-slate-800 capitalize block">{item.name || item.food_item?.name || 'Alimento'}</span>

                <div className="flex items-center gap-2">
                  <div className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800">
                    {item.amount_g || item.quantity_grams || item.quantity || 100}
                  </div>
                  <span className="text-xs text-slate-400 font-medium">gramas</span>
                </div>

                <p className="text-[11px] text-slate-400 font-medium">
                  {ni.calories.toFixed(0)} kcal · P {ni.protein.toFixed(1)}g · H {ni.carbs.toFixed(1)}g · G {ni.fat.toFixed(1)}g
                </p>
              </div>
            );
          })}

          {/* ANÁLISE DO COACH */}
          {coachCommentary && (
            <div className="bg-[var(--surf-success-soft)] border border-emerald-200/80 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                <Award size={16} className="text-emerald-600 shrink-0" />
                Análise do Coach
              </div>
              <div className="text-xs text-slate-700 font-normal">
                <CoachText>{coachCommentary}</CoachText>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {onEdit && (
              <button
                onClick={() => onEdit(meal.id)}
                className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition"
              >
                <PencilLine size={14} /> Editar
              </button>
            )}
            <button
              onClick={handleDeleteMeal}
              disabled={isDeleting}
              className="flex-1 border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Eliminar refeição
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
