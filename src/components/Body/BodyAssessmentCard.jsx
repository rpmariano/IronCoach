import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ScanLine, Trash2, MessageSquare, Loader2, Scale, Percent, Dumbbell, Activity } from 'lucide-react';
import { BODY_METRICS } from '../../utils/body';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store';

export default function BodyAssessmentCard({ assessment }) {
  const [expanded, setExpanded] = useState(false);
  const { profile, loadInitialData } = useAppStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(assessment.notes || '');

  const dateParts = assessment.date ? assessment.date.split('-') : [];
  const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : assessment.date;

  const handleDelete = async () => {
    if (!confirm('Tem a certeza que deseja eliminar esta avaliação corporal?')) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('body_assessments').delete().eq('id', assessment.id);
      if (error) throw error;
      if (profile?.id) {
        await loadInitialData(profile.id);
      }
    } catch (err) {
      console.error('Error deleting assessment:', err);
      alert('Erro ao eliminar avaliação.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      const { error } = await supabase.from('body_assessments').update({ notes: notesText.trim() || null }).eq('id', assessment.id);
      if (error) throw error;
      setEditingNotes(false);
      if (profile?.id) {
        await loadInitialData(profile.id);
      }
    } catch (err) {
      console.error('Error updating notes:', err);
      alert('Erro ao guardar observações.');
    }
  };

  const weight = assessment.weight_kg ? `${assessment.weight_kg} kg` : null;
  const bodyFat = assessment.body_fat_pct ? `${assessment.body_fat_pct}% Gordura` : null;
  const muscle = assessment.skeletal_muscle_pct ? `${assessment.skeletal_muscle_pct}% Músculo` : assessment.muscle_mass_kg ? `${assessment.muscle_mass_kg} kg Músculo` : null;
  const bmi = assessment.bmi ? `IMC ${assessment.bmi.toFixed(1)}` : null;

  // Pílulas Coloridas com Ícones
  const metricChips = [
    weight ? { key: 'w', colorClass: 'bg-purple-100/90 text-purple-800 border-purple-200/80', icon: <Scale size={14} className="text-purple-600" />, label: weight } : null,
    bodyFat ? { key: 'fat', colorClass: 'bg-pink-100/90 text-pink-800 border-pink-200/80', icon: <Percent size={14} className="text-pink-600" />, label: bodyFat } : null,
    muscle ? { key: 'musc', colorClass: 'bg-emerald-100/90 text-emerald-800 border-emerald-200/80', icon: <Dumbbell size={14} className="text-emerald-600" />, label: muscle } : null,
    bmi ? { key: 'bmi', colorClass: 'bg-blue-100/90 text-blue-800 border-blue-200/80', icon: <Activity size={14} className="text-blue-600" />, label: bmi } : null,
  ].filter(Boolean);

  return (
    <div className="bg-[var(--surf-detail)] border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-3 transition">
      {/* Header Bar */}
      <div 
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-100/70 border border-purple-200/60 flex items-center justify-center text-purple-600 shrink-0">
            <ScanLine size={18} />
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
          <span className="text-sm font-bold text-purple-600">
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

          {/* Observações Card */}
          <div className="bg-white border border-slate-200/60 rounded-xl p-3 shadow-xs">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <MessageSquare size={14} className="text-slate-400" /> Observações
              </div>
              <button 
                onClick={() => setEditingNotes(!editingNotes)}
                className="text-[11px] font-bold text-purple-600 hover:underline"
              >
                {editingNotes ? 'Cancelar' : assessment.notes ? 'Editar' : 'Adicionar'}
              </button>
            </div>

            {editingNotes ? (
              <div className="mt-2 space-y-2">
                <textarea
                  rows={2}
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                  placeholder="Contexto da pesagem..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-purple-500"
                />
                <button
                  onClick={handleSaveNotes}
                  className="px-3 py-1 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition"
                >
                  Guardar
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic mt-1">
                {assessment.notes || 'Sem observações.'}
              </p>
            )}
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
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
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

          {/* Delete Action Button */}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 font-bold text-xs rounded-xl py-2.5 flex items-center justify-center gap-1.5 transition disabled:opacity-50 mt-2"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Eliminar avaliação
          </button>
        </div>
      )}
    </div>
  );
}
