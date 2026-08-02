import React, { useState } from 'react';
import { Camera, ImagePlus, X, Trash2, Sparkles, PencilLine, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../store';

const MEAL_TYPES = [
  { key: 'pequeno_almoco', label: 'Pequeno-almoço' },
  { key: 'lanche_manha', label: 'Lanche da manhã' },
  { key: 'almoco', label: 'Almoço' },
  { key: 'lanche', label: 'Lanche' },
  { key: 'jantar', label: 'Jantar' },
  { key: 'ceia', label: 'Ceia' }
];

const MAX_PHOTOS = 4;

export default function MealRegistration() {
  const { setActiveNutritionTab } = useAppStore();
  const [photos, setPhotos] = useState([]);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mealType, setMealType] = useState('almoco'); // Default to lunch for now
  const [notes, setNotes] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    // Convert to object URLs for preview
    const newPhotos = files.slice(0, MAX_PHOTOS - photos.length).map(file => ({
      file,
      dataUrl: URL.createObjectURL(file)
    }));
    
    setPhotos(prev => [...prev, ...newPhotos]);
    e.target.value = ''; // reset
  };

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const newArr = [...prev];
      URL.revokeObjectURL(newArr[idx].dataUrl);
      newArr.splice(idx, 1);
      return newArr;
    });
  };

  const clearPhotos = () => {
    photos.forEach(p => URL.revokeObjectURL(p.dataUrl));
    setPhotos([]);
  };

  const analyzeMeal = () => {
    setIsAnalyzing(true);
    // Simulate AI analysis delay
    setTimeout(() => {
      setIsAnalyzing(false);
      alert('A integração com a IA será implementada na próxima fase!');
    }, 2000);
  };

  return (
    <div className="fade-in pb-8">
      <div 
        className="rounded-2xl p-4 shadow-sm relative overflow-hidden" 
        style={{ backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.1)', borderLeft: '4px solid var(--mod-nutricao-to)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Camera size={18} style={{ color: 'var(--mod-nutricao-to)' }} />
          <h2 className="text-[15px] font-semibold text-slate-700">Nova Refeição</h2>
        </div>

        {photos.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Foto ${i+1}`} />
                  <button 
                    onClick={() => removePhoto(i)} 
                    aria-label="Remover foto" 
                    className="absolute top-1 right-1 bg-white/90 border border-slate-200 rounded-full p-1 text-slate-500 hover:text-red-500 shadow-sm transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] text-slate-500">{photos.length} foto(s) · máx {MAX_PHOTOS}</span>
              <button onClick={clearPhotos} className="text-[11px] text-slate-500 hover:text-red-500 flex items-center gap-1 transition">
                <Trash2 size={14} /> Limpar todas
              </button>
            </div>
            {photos.length < MAX_PHOTOS && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <label className="flex items-center justify-center gap-1.5 border-2 border-dashed border-[var(--accent)]/40 rounded-xl py-3 text-center cursor-pointer hover:border-[var(--accent)]/70 hover:bg-[var(--accent)]/5 transition bg-white/50">
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
                  <Camera size={16} className="text-[var(--accent)]" />
                  <span className="text-xs font-semibold text-[var(--accent)]">Tirar foto</span>
                </label>
                <label className="flex items-center justify-center gap-1.5 border-2 border-dashed border-[var(--accent)]/40 rounded-xl py-3 text-center cursor-pointer hover:border-[var(--accent)]/70 hover:bg-[var(--accent)]/5 transition bg-white/50">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                  <ImagePlus size={16} className="text-[var(--accent)]" />
                  <span className="text-xs font-semibold text-[var(--accent)]">Da galeria</span>
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-300 rounded-xl py-8 text-center cursor-pointer hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition bg-white/50">
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
                <Camera size={24} className="text-slate-400" />
                <p className="text-xs text-slate-500 font-medium">Tirar foto</p>
              </label>
              <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-300 rounded-xl py-8 text-center cursor-pointer hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition bg-white/50">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                <ImagePlus size={24} className="text-slate-400" />
                <p className="text-xs text-slate-500 font-medium">Da galeria</p>
              </label>
            </div>
            <p className="text-[10px] text-slate-500 text-center -mt-2 mb-1">Podes juntar várias fotos (ângulos/pratos) da mesma refeição</p>
            <p className="text-[10px] text-slate-500 text-center mb-5 leading-relaxed">A IA lê os valores nutricionais automaticamente — podes editar ou remover itens depois de gravado</p>
          </>
        )}

        {/* Formulário Manual / Dados Auxiliares */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 mb-4">
          <input 
            type="date" 
            value={date} 
            max={format(new Date(), 'yyyy-MM-dd')} 
            onChange={e => setDate(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[var(--accent)] shadow-sm transition" 
          />
          <div className="text-[11px] text-slate-500 mr-2">Data da refeição</div>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {MEAL_TYPES.map(t => {
            const isActive = mealType === t.key;
            return (
              <button 
                key={t.key}
                onClick={() => setMealType(t.key)} 
                type="button"
                className={`border rounded-full px-4 py-1.5 text-xs transition shadow-sm ${
                  isActive 
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-neutral-900 font-bold' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mb-5">
          <label className="text-[11px] text-slate-500 mb-1.5 block px-1">Observações (opcional) — ex.: "Big Mac", "bife frito em azeite"</label>
          <textarea 
            rows="2" 
            maxLength="500" 
            placeholder="Detalhes que mudam os valores nutricionais..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 outline-none focus:border-[var(--accent)] resize-none shadow-sm transition"
          />
        </div>

        {/* Ações */}
        <button 
          onClick={analyzeMeal} 
          disabled={!photos.length || isAnalyzing}
          className="w-full bg-[var(--accent)] text-neutral-950 font-bold text-sm rounded-xl py-3 flex items-center justify-center gap-1.5 active:scale-[0.98] transition shadow-md disabled:opacity-50 disabled:active:scale-100"
        >
          {isAnalyzing ? (
            <><Loader2 size={18} className="animate-spin" /> A analisar com IA...</>
          ) : (
            <><Sparkles size={18} /> Analisar Refeição{photos.length > 1 ? ` (${photos.length} fotos)` : ''}</>
          )}
        </button>

        <button 
          onClick={() => alert('Em construção')}
          disabled={isAnalyzing} 
          type="button"
          className="w-full mt-3 border-2 border-dashed border-slate-300 hover:border-slate-400 text-slate-500 hover:text-slate-600 text-[13px] font-semibold rounded-xl py-3 flex items-center justify-center gap-1.5 transition disabled:opacity-50 bg-white/50"
        >
          <PencilLine size={16} /> Adicionar Refeição Manualmente
        </button>

      </div>
    </div>
  );
}
