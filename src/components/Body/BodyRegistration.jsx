import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { supabase } from '../../lib/supabase';
import { ScanLine, X, Check, Loader2, ImagePlus, Sparkles, PencilLine } from 'lucide-react';

const BODY_METRICS = [
  { key:'weight_kg',            label:'Peso',              unit:'kg',   dec:1, color:'#dd3c71' },
  { key:'bmi',                  label:'IMC',               unit:'',     dec:1, color:'#da2fd7' },
  { key:'body_fat_pct',         label:'Gordura corporal',  unit:'%',    dec:1, color:'#dd3c94' },
  { key:'skeletal_muscle_pct',  label:'Músculo esquelético', unit:'%',  dec:1, color:'#468f19' },
  { key:'muscle_mass_kg',       label:'Massa muscular',    unit:'kg',   dec:1, color:'#2c931a' },
  { key:'body_water_pct',       label:'Água corporal',     unit:'%',    dec:1, color:'#2b82da' },
  { key:'protein_pct',          label:'Proteína',          unit:'%',    dec:1, color:'#5f8b18' },
  { key:'bone_mass_kg',         label:'Massa óssea',       unit:'kg',   dec:1, color:'#643cdd' },
  { key:'bmr_kcal',             label:'Metabolismo basal', unit:'kcal', dec:0, color:'#768618' },
  { key:'visceral_fat',         label:'Gordura visceral',  unit:'',     dec:0, color:'#bc3cdd' },
  { key:'subcutaneous_fat_pct', label:'Gordura subcutânea', unit:'%',   dec:1, color:'#1a9324' },
  { key:'metabolic_age',        label:'Idade metabólica',  unit:'anos', dec:0, color:'#1a9340' },
  { key:'lean_body_mass_kg',    label:'Massa magra',       unit:'kg',   dec:1, color:'#198f89' },
];

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function BodyRegistration({ onClose }) {
  const { profile, bodyAssessments, setBodyAssessments } = useAppStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  
  const [metrics, setMetrics] = useState({});

  const accentColor = profile?.accent_color === 'blue' ? '#3b82f6' : 
                      profile?.accent_color === 'green' ? '#10b981' : 
                      profile?.accent_color === 'purple' ? '#8b5cf6' : 
                      '#E49479'; // Coral default

  const handleMetricChange = (key, value) => {
    setMetrics(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const insertObj = {
        user_id: profile?.id,
        date: date,
        notes: notes.trim() || null,
        status: 'concluido'
      };

      for (const m of BODY_METRICS) {
        if (metrics[m.key] !== undefined && metrics[m.key] !== '') {
          insertObj[m.key] = parseFloat(metrics[m.key]);
        }
      }

      const { data, error } = await supabase
        .from('body_assessments')
        .insert(insertObj)
        .select()
        .single();

      if (error) throw error;
      
      if (data) {
        setBodyAssessments([data, ...bodyAssessments]);
      }
      
      onClose();
    } catch (err) {
      console.error('Error saving body assessment:', err);
      alert('Erro ao guardar avaliação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 fade-in">
      <div 
        className="rounded-2xl p-4" 
        style={{
          background: 'radial-gradient(130% 150% at 100% 0%, color-mix(in srgb, var(--mod-corpo-to) 10%, transparent) 0%, transparent 60%), linear-gradient(165deg, var(--surf-900), var(--surf-detail))',
          borderStyle: 'solid',
          borderWidth: '1px 1px 1px 3px',
          borderColor: '#e2e8f0 #e2e8f0 #e2e8f0 color-mix(in srgb, var(--mod-corpo-to) 70%, #e2e8f0)'
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <ScanLine className="w-5 h-5" style={{ color: 'var(--mod-corpo-to)' }} />
          <h2 className="text-[15px] font-bold text-slate-800">Nova Avaliação</h2>
        </div>

        {/* Photo Upload Box */}
        <label className="block border-2 border-dashed border-slate-300 rounded-xl py-6 text-center cursor-pointer hover:border-slate-400 transition mb-4 bg-white/50">
          <input type="file" accept="image/*" multiple className="hidden" disabled />
          <ImagePlus className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-xs text-slate-600 font-semibold">Escolhe os prints da app Renpho Health</p>
          <p className="text-[10px] text-slate-500 mt-1 px-4">Podes juntar vários ecrãs da mesma pesagem — a IA lê e comenta os valores automaticamente</p>
        </label>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <input 
            type="date" 
            value={date} 
            max={todayISO()} 
            onChange={e => setDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 outline-none focus:border-[var(--mod-corpo-to)]" 
          />
          <div className="flex items-center justify-center text-[11px] text-slate-500">Data da pesagem</div>
        </div>

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">Observações (opcional) — ex.: "em jejum", "após treino"</label>
          <textarea 
            rows={2} 
            maxLength={500} 
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Contexto da pesagem..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-[var(--mod-corpo-to)] resize-none" 
          />
        </div>

        <button 
          disabled={true}
          style={{ backgroundColor: accentColor, color: '#0a0a0a' }}
          className="w-full font-bold text-sm rounded-xl py-3 flex items-center justify-center gap-1.5 transition opacity-50 mb-3 shadow-sm"
        >
          <Sparkles className="w-4 h-4" /> Analisar Avaliação
        </button>

        <button 
          onClick={handleSave} 
          disabled={isSubmitting}
          className="w-full border-2 border-dashed border-slate-300 hover:border-[var(--mod-corpo-to)] text-slate-500 hover:text-[var(--mod-corpo-to)] font-bold text-xs rounded-xl py-3 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PencilLine className="w-4 h-4" />}
          {isSubmitting ? 'A guardar...' : 'Registar Avaliação Manualmente'}
        </button>
      </div>
    </div>
  );
}
