import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { Dumbbell, ImagePlus, PencilLine, Sparkles, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';

const GYM_KINDS = [
  { key: 'forca', label: 'Força', icon: Dumbbell },
  { key: 'aula', label: 'Aula', icon: Users }
];

const GYM_CATEGORIES = {
  forca: ['Peito', 'Costas', 'Pernas', 'Ombros', 'Biceps', 'Triceps', 'Glúteos', 'Full Body', 'Levantamento Olímpico', 'Powerlifting', 'Calistenia', 'Outro'],
  aula:  ['HIIT', 'RPM/Cycling', 'Pilates', 'Yoga', 'Body Pump', 'Zumba', 'CrossFit', 'Treino Funcional', 'Natação', 'Outro'],
};
const GYM_CATEGORIES_VISIBLE = 6;

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function parseDurationInput(val) {
  val = val.trim().toLowerCase();
  if (!val) return null;
  if (val.endsWith('m')) return parseInt(val) * 60;
  const parts = val.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (!isNaN(parts[0])) return parts[0] * 60;
  return null;
}

export default function GymRegistration({ onClose }) {
  const { profile, gymSessions, setGymSessions } = useAppStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState('forca');
  const [categories, setCategories] = useState([]);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  
  const [name, setName] = useState('');
  const [durationStr, setDurationStr] = useState('');
  const [calories, setCalories] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [exertion, setExertion] = useState('');
  const [notes, setNotes] = useState('');

  // No photos in this version yet, but we show the UI for it
  const [photos] = useState([]);

  // Use the profile's accent color or a default coral fallback if not set
  const accentColor = profile?.accent_color === 'blue' ? '#3b82f6' : 
                      profile?.accent_color === 'green' ? '#10b981' : 
                      profile?.accent_color === 'purple' ? '#8b5cf6' : 
                      '#E49479'; // Coral default as seen in screenshot

  const handleToggleCategory = (cat) => {
    if (categories.includes(cat)) {
      setCategories(categories.filter(c => c !== cat));
    } else {
      setCategories([...categories, cat]);
    }
  };

  const handleAddCustomCategory = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = customCategory.trim().slice(0, 60);
      if (val && !categories.includes(val)) {
        setCategories([...categories, val]);
      }
      setCustomCategory('');
    }
  };

  const handleKindChange = (newKind) => {
    setKind(newKind);
    setCategories([]);
    setCategoriesExpanded(false);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      let finalName = name.trim();
      if (!finalName) {
        finalName = categories.join(' e ') || (kind === 'aula' ? 'Aula' : 'Força');
      }

      const insertObj = {
        user_id: profile?.id,
        date: date,
        name: finalName,
        kind: kind,
        categories: categories,
        duration_seconds: parseDurationInput(durationStr),
        calories_kcal: calories ? parseInt(calories) : null,
        avg_heart_rate_bpm: avgHr ? parseInt(avgHr) : null,
        max_heart_rate_bpm: maxHr ? parseInt(maxHr) : null,
        effort_rpe: exertion ? parseInt(exertion) : null,
        notes: notes.trim() || null,
        status: 'concluido'
      };

      const { data, error } = await supabase
        .from('workout_sessions')
        .insert(insertObj)
        .select()
        .single();

      if (error) throw error;
      
      if (data) {
        setGymSessions([data, ...gymSessions]);
      }
      
      onClose();
    } catch (err) {
      console.error('Error saving gym session:', err);
      alert('Erro ao guardar treino.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableCategories = GYM_CATEGORIES[kind] || GYM_CATEGORIES.forca;
  const visibleCategories = categoriesExpanded 
    ? availableCategories 
    : availableCategories.filter((c, i) => i < GYM_CATEGORIES_VISIBLE || categories.includes(c));
  const hiddenCount = availableCategories.length - visibleCategories.length;

  return (
    <div className="space-y-4 fade-in">
      <div 
        className="rounded-2xl p-4" 
        style={{
          background: 'radial-gradient(130% 150% at 100% 0%, color-mix(in srgb, var(--mod-ginasio-to) 10%, transparent) 0%, transparent 60%), linear-gradient(165deg, #ffffff, #f8fafc)',
          borderStyle: 'solid',
          borderWidth: '1px 1px 1px 3px',
          borderColor: '#e2e8f0 #e2e8f0 #e2e8f0 color-mix(in srgb, var(--mod-ginasio-to) 70%, #e2e8f0)'
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Dumbbell className="w-5 h-5" style={{ color: 'var(--mod-ginasio-to)' }} />
          <h2 className="text-[15px] font-bold text-slate-800">Novo Treino</h2>
        </div>

        {/* Photo Upload Box */}
        <label className="block border-2 border-dashed border-slate-300 rounded-xl py-6 text-center cursor-pointer hover:border-slate-400 transition mb-4 bg-white/50">
          <input type="file" accept="image/*" multiple className="hidden" disabled />
          <ImagePlus className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-xs text-slate-600 font-semibold">Escolhe os prints da app de treino (Hevy, Strong...)</p>
          <p className="text-[10px] text-slate-500 mt-1 px-4">Podes juntar vários ecrãs da mesma sessão — a IA lê exercícios, séries e cargas automaticamente</p>
        </label>

        <label className="text-[11px] text-slate-500 mb-1.5 block">Tipo de sessão</label>
        <div className="flex gap-1.5 mb-4">
          {GYM_KINDS.map(k => {
            const Icon = k.icon;
            const isActive = kind === k.key;
            return (
              <button 
                key={k.key}
                onClick={() => handleKindChange(k.key)}
                type="button"
                style={isActive ? { backgroundColor: accentColor, color: '#0a0a0a', border: 'none' } : {}}
                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${isActive ? 'shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
              >
                <Icon size={14} /> {k.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <input 
            type="date" 
            value={date} 
            max={todayISO()} 
            onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-ginasio-to)]" 
          />
          <div className="flex items-center justify-center text-[11px] text-slate-500">Data do treino</div>
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">
            Nome da sessão (opcional) — ex.: "{kind === 'aula' ? 'Aula de HIIT' : 'Peito e Tríceps'}"
          </label>
          <input 
            type="text" 
            maxLength={80} 
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nome do treino"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)]" 
          />
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">
            {kind === 'aula' ? 'Tipo de aula' : 'Grupos musculares'} — podes escolher vários
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {visibleCategories.map(c => (
              <button 
                key={c}
                onClick={() => handleToggleCategory(c)} 
                type="button"
                className={`rounded-full px-3.5 py-1.5 text-[11px] font-medium border transition-colors ${categories.includes(c) ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                {c}
              </button>
            ))}
            
            {hiddenCount > 0 && !categoriesExpanded && (
              <button 
                onClick={() => setCategoriesExpanded(true)} 
                type="button"
                className="rounded-full px-3.5 py-1.5 text-[11px] font-medium border border-dashed border-slate-300 text-slate-500"
              >
                +{hiddenCount} mais
              </button>
            )}
            {categoriesExpanded && availableCategories.length > GYM_CATEGORIES_VISIBLE && (
              <button 
                onClick={() => setCategoriesExpanded(false)} 
                type="button"
                className="rounded-full px-3.5 py-1.5 text-[11px] font-medium border border-dashed border-slate-300 text-slate-500"
              >
                Mostrar menos
              </button>
            )}

            {/* Custom categories not in the main list */}
            {categories.filter(c => !availableCategories.includes(c)).map(c => (
              <button 
                key={c}
                onClick={() => handleToggleCategory(c)} 
                type="button"
                className="bg-sky-50 border border-sky-300 text-sky-700 rounded-full px-3.5 py-1.5 text-[11px] font-medium"
              >
                {c}
              </button>
            ))}
          </div>
          <input 
            type="text" 
            maxLength={60}
            value={customCategory}
            onChange={e => setCustomCategory(e.target.value)}
            onKeyDown={handleAddCustomCategory}
            placeholder="Ou escreve outra e prime Enter..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)]" 
          />
        </div>

        <label className="text-[11px] text-slate-500 mb-1.5 block">Métricas do relógio (opcional)</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <input 
            type="text" 
            inputMode="text" 
            value={durationStr}
            onChange={e => setDurationStr(e.target.value)}
            placeholder="Duração (43m ou 37:57)"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)]" 
          />
          <input 
            type="number" 
            min="0" 
            step="1" 
            value={calories}
            onChange={e => setCalories(e.target.value)}
            placeholder="Calorias (kcal)"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)]" 
          />
          <input 
            type="number" 
            min="0" 
            step="1" 
            value={avgHr}
            onChange={e => setAvgHr(e.target.value)}
            placeholder="FC média (bpm)"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)]" 
          />
          <input 
            type="number" 
            min="0" 
            step="1" 
            value={maxHr}
            onChange={e => setMaxHr(e.target.value)}
            placeholder="FC máx (bpm)"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)]" 
          />
          <input 
            type="number" 
            min="1" 
            max="10" 
            step="1" 
            value={exertion}
            onChange={e => setExertion(e.target.value)}
            placeholder="Esforço (1-10)"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)]" 
          />
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">
            Observações (opcional) — ex.: "{kind === 'aula' ? 'aula puxada, professor novo' : 'treino de força, peso corporal'}"
          </label>
          <textarea 
            rows={2} 
            maxLength={500} 
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Contexto do treino..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-ginasio-to)] resize-none" 
          />
        </div>

        <button 
          disabled={true}
          style={{ backgroundColor: accentColor, color: '#0a0a0a' }}
          className="w-full font-bold text-sm rounded-xl py-3 flex items-center justify-center gap-1.5 transition opacity-50 mb-3 shadow-sm"
        >
          <Sparkles className="w-4 h-4" /> Analisar Treino
        </button>

        <button 
          onClick={handleSave}
          disabled={isSubmitting}
          className="w-full border-2 border-dashed border-slate-300 hover:border-[var(--mod-ginasio-to)] text-slate-500 hover:text-[var(--mod-ginasio-to)] font-bold text-xs rounded-xl py-3 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PencilLine className="w-4 h-4" />}
          {isSubmitting ? 'A guardar...' : (kind === 'aula' ? 'Registar Aula Sem Print' : 'Adicionar Treino Manualmente')}
        </button>
      </div>
    </div>
  );
}
