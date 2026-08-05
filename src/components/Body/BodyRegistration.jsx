import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { ScanLine, X, ImagePlus, Camera, PencilLine } from 'lucide-react';

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

const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-body

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function BodyRegistration({ onClose }) {
  const { bodyAssessments, setBodyAssessments } = useAppStore();

  // Comum aos dois caminhos
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  // Um único cartão, forma de introdução à escolha — mesmo padrão da
  // Corrida e da Nutrição: só um dos dois blocos fica visível/clicável a
  // cada vez, e as duas formas passam pelo Coach.
  const [entryMethod, setEntryMethod] = useState('foto'); // 'foto' | 'manual'
  const [errorMsg, setErrorMsg] = useState('');

  // Foto (IA)
  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Manual
  const [metrics, setMetrics] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const handleMetricChange = (key, value) => {
    setMetrics(prev => ({ ...prev, [key]: value }));
  };

  // Handle Photo Selection — comprime e normaliza para JPEG (src/lib/image.js,
  // partilhado com a Corrida/Refeição); o .base64 resultante é o que vai no
  // pedido de análise por IA.
  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setErrorMsg(`Máximo de ${MAX_PHOTOS} fotos.`);
      return;
    }
    for (const file of files.slice(0, remaining)) {
      try {
        const { dataUrl, base64 } = await compressImage(file);
        setPhotos(prev => [...prev, { dataUrl, base64 }]);
      } catch (err) {
        console.warn('Falha a processar imagem', err);
      }
    }
  };

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));

  // ----------------------------------
  // ANALISAR AVALIAÇÃO POR FOTO (IA — analyze-body)
  // ----------------------------------
  const handleAnalyzePhotos = async () => {
    if (!photos.length || isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
        body: {
          images: photos.map(p => p.base64),
          mime_type: 'image/jpeg',
          date,
          notes: notes.trim() || null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setBodyAssessments([data.assessment, ...bodyAssessments]);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha na análise. Tenta novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ----------------------------------
  // REGISTO MANUAL — os valores já vêm todos do formulário (nada para o
  // Gemini extrair de imagem nenhuma); o mesmo pedido grava a avaliação E
  // gera o comentário do Coach a partir dos números indicados, comparando
  // com o histórico — mode:"manual" em analyze-body.
  // ----------------------------------
  const handleSaveManual = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const payloadMetrics = {};
      for (const m of BODY_METRICS) {
        if (metrics[m.key] !== undefined && metrics[m.key] !== '') {
          payloadMetrics[m.key] = parseFloat(metrics[m.key]);
        }
      }
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-body', {
        body: { mode: 'manual', date, notes: notes.trim() || null, metrics: payloadMetrics },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setBodyAssessments([data.assessment, ...bodyAssessments]);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a gravar a avaliação. Tenta novamente.');
    } finally {
      setIsSaving(false);
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
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" style={{ color: 'var(--mod-corpo-to)' }} />
            <h2 className="text-[15px] font-bold text-slate-800">Nova Avaliação</h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-[12px] text-slate-500 hover:text-red-500 transition font-medium"
          >
            Cancelar
          </button>
        </div>

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
          <label className="text-[11px] text-slate-500 mb-1.5 block">Como queres registar?</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setEntryMethod('foto')}
              style={entryMethod === 'foto' ? { color: '#fff' } : undefined}
              className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-corpo-to)] border-[var(--mod-corpo-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
            >
              <Camera size={14} /> Foto (IA)
            </button>
            <button
              type="button"
              onClick={() => setEntryMethod('manual')}
              style={entryMethod === 'manual' ? { color: '#fff' } : undefined}
              className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-corpo-to)] border-[var(--mod-corpo-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
            >
              <PencilLine size={14} /> Manual
            </button>
          </div>
        </div>

        {entryMethod === 'foto' ? (
          <>
            {photos.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Print ${i+1}`} />
                      <button
                        onClick={() => removePhoto(i)}
                        aria-label={`Remover print ${i + 1}`}
                        className="tap-44 absolute -top-1.5 -right-1.5 text-slate-500 hover:text-red-500 transition"
                      >
                        <span className="bg-white/90 border border-slate-200 rounded-full p-1 shadow-sm flex items-center justify-center">
                          <X size={14} />
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] text-slate-500">{photos.length} foto(s) · máx {MAX_PHOTOS}</span>
                </div>
                {photos.length < MAX_PHOTOS && (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[var(--mod-corpo-to)]/40 rounded-xl py-3 text-center cursor-pointer hover:bg-[var(--mod-corpo-to)]/5 transition mb-4">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                    <ImagePlus className="w-4 h-4" style={{ color: 'var(--mod-corpo-to)' }} />
                    <span className="text-[12px] font-bold" style={{ color: 'var(--mod-corpo-to)' }}>Adicionar outro print</span>
                  </label>
                )}
              </>
            ) : (
              <label className="block border-2 border-dashed border-slate-300 rounded-xl py-6 text-center cursor-pointer hover:border-slate-400 transition mb-4 bg-white/50">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                <ImagePlus className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-semibold">Escolhe os prints da app Renpho Health</p>
                <p className="text-[10px] text-slate-500 mt-1 px-4">Podes juntar vários ecrãs da mesma pesagem — a IA lê e comenta os valores automaticamente</p>
              </label>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {BODY_METRICS.map(m => (
              <label key={m.key} className="block">
                <span className="text-[10px] text-slate-500 block mb-1">{m.label} {m.unit && `(${m.unit})`}</span>
                <input
                  type="number"
                  step={m.dec > 0 ? '0.1' : '1'}
                  value={metrics[m.key] ?? ''}
                  onChange={e => handleMetricChange(m.key, e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-[var(--mod-corpo-to)] transition"
                />
              </label>
            ))}
          </div>
        )}

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

        {/* Ação — mesmo botão do Coach nos dois caminhos: a foto e o registo
            manual acabam ambos analisados por ele, só a origem dos dados
            muda. */}
        {entryMethod === 'foto' ? (
          <CoachAnalyzeButton
            onClick={handleAnalyzePhotos}
            disabled={!photos.length || isAnalyzing}
            busy={isAnalyzing}
            label="Analisar Avaliação"
          />
        ) : (
          <CoachAnalyzeButton
            onClick={handleSaveManual}
            disabled={isSaving}
            busy={isSaving}
            label="Analisar Avaliação"
          />
        )}

        {errorMsg && <p className="text-red-500 text-[13px] font-medium mt-3 text-center">{errorMsg}</p>}
      </div>
    </div>
  );
}
