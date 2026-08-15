import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ScanLine, Trash2, MessageSquare, Loader2, Scale, Droplet, Activity, Award, PencilLine } from 'lucide-react';
import { BODY_METRICS } from '../../utils/body';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { getBodyIcon } from '../../utils/bodyIcons';
import ConfirmDeleteModal from '../shared/ConfirmDeleteModal';
import Button from '../shared/Button';

/* O cartão é só de consulta e de eliminar. Qualquer alteração ao conteúdo
   passa pelo botão "Editar" → BodyRegistration, porque mexer nas métricas ou
   nas observações muda a análise do Coach e tem de a regenerar. Editar aqui à
   mão deixava a "Análise do Coach" a descrever uma avaliação que já não
   existe. Mesmo padrão da Nutrição/Ginásio (ver PRD 3.2/3.3/3.5). */
export default function BodyAssessmentCard({ assessment, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const { profile, loadInitialData } = useAppStore();
  const { showToast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const dateParts = assessment.date ? assessment.date.split('-') : [];
  const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : assessment.date;

  const handleDelete = async () => {
    setShowDeleteConfirm(false);
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('body_assessments').delete().eq('id', assessment.id);
      if (error) throw error;
      if (profile?.id) {
        await loadInitialData(profile.id);
      }
      showToast('Avaliação eliminada');
    } catch (err) {
      console.error('Error deleting assessment:', err);
      showToast('Erro ao eliminar avaliação.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const coachCommentary = assessment.ai_summary;

  const weight = assessment.weight_kg ? `${assessment.weight_kg} kg` : null;
  const bodyFat = assessment.body_fat_pct ? `${assessment.body_fat_pct}% Gordura` : null;
  const muscle = assessment.skeletal_muscle_pct ? `${assessment.skeletal_muscle_pct}% Músculo` : assessment.muscle_mass_kg ? `${assessment.muscle_mass_kg} kg Músculo` : null;
  const bmi = assessment.bmi ? `IMC ${assessment.bmi.toFixed(1)}` : null;

  // Pílulas Coloridas com Ícones
  const metricChips = [
    weight ? { key: 'w', colorClass: 'bg-slate-100 text-slate-800 border-slate-200', icon: <Scale size={14} className="text-slate-500" />, label: weight } : null,
    bodyFat ? { key: 'fat', colorClass: 'bg-slate-100 text-slate-800 border-slate-200', icon: <Droplet size={14} className="text-slate-500" />, label: bodyFat } : null,
    muscle ? { key: 'musc', colorClass: 'bg-slate-100 text-slate-800 border-slate-200', icon: assessment.skeletal_muscle_pct ? getBodyIcon('skeletal_muscle_pct', 14, "text-slate-500") : getBodyIcon('muscle_mass_kg', 14, "text-slate-500"), label: muscle } : null,
    bmi ? { key: 'bmi', colorClass: 'bg-slate-100 text-slate-800 border-slate-200', icon: <Activity size={14} className="text-slate-500" />, label: bmi } : null,
  ].filter(Boolean);

  return (
    <div className="module-card-contrast space-y-3">
      {/* Header Bar */}
      <div 
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center text-[var(--green-dark)] shrink-0">
            <ScanLine size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 leading-tight">
              Avaliação Corporal
            </h4>
            <p className="text-xs text-slate-400 font-medium">
              {formattedDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-800">
            {weight || '—'}
          </span>
          {/* A linha inteira é clicável, mas o chevron é o controlo real —
              é ele que dá acesso por teclado e o estado ao leitor de ecrã. */}
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
            type="button"
            aria-label={expanded ? 'Fechar detalhes da avaliação' : 'Ver detalhes da avaliação'}
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
          {/* Pílulas Coloridas com Ícones */}
          {metricChips.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {metricChips.map(c => (
                <span key={c.key} className={`px-3 py-1.5 rounded-full text-xs font-bold border shadow-xs flex items-center gap-1.5 ${c.colorClass}`}>
                  {c.icon}
                  {c.label}
                </span>
              ))}
            </div>
          )}

          {/* Observações — só leitura; alterar é pelo botão "Editar" */}
          <div className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <MessageSquare size={14} className="text-slate-400" /> Observações
            </div>
            <p className="text-xs text-slate-500 italic mt-1">
              {assessment.notes || 'Sem observações.'}
            </p>
          </div>

          {/* Full Metrics Breakdown */}
          <div className="space-y-1.5">
            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">Todas as Métricas</h5>
            <div className="grid grid-cols-2 gap-1.5">
              {BODY_METRICS.map(m => {
                const val = assessment[m.key];
                if (val === null || val === undefined) return null;
                return (
                  <div key={m.key} className="bg-white border border-slate-200/60 rounded-xl p-2.5 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 flex items-center justify-center mr-0.5" style={{ color: m.color }}>
                        {getBodyIcon(m.key, 14)}
                      </span>
                      <span className="text-[11px] font-medium text-slate-700 truncate">{m.label}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800 shrink-0 ml-1">
                      {val} {m.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ANÁLISE DO COACH */}
          {coachCommentary && (
            <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Award size={16} className="text-[var(--mod-coach-from)] shrink-0" />
                Análise do Coach
              </div>
              <p className="text-xs text-slate-700 leading-relaxed font-normal">
                {coachCommentary}
              </p>
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center gap-2 pt-1">
            {onEdit && (
              <Button
                variant="light"
                onClick={() => onEdit(assessment.id)}
                className="flex-1 text-xs"
                icon={<PencilLine size={14} />}
              >
                Editar
              </Button>
            )}
            <Button
              variant="light-danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              isLoading={isDeleting}
              className="flex-1 text-xs"
              icon={!isDeleting && <Trash2 size={14} />}
            >
              Eliminar avaliação
            </Button>
          </div>
        </div>
      )}
      <ConfirmDeleteModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        message="Tem a certeza que deseja eliminar esta avaliação corporal? Esta ação não pode ser desfeita."
      />
    </div>
  );
}
