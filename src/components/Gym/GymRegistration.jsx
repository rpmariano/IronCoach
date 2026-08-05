import React, { useState } from 'react';
import { useAppStore } from '../../store';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { Dumbbell, ImagePlus, Camera, PencilLine, Users, X } from 'lucide-react';

const GYM_KINDS = [
  { key: 'forca', label: 'Força', icon: Dumbbell },
  { key: 'aula', label: 'Aula', icon: Users }
];

const GYM_CATEGORIES = {
  forca: ['Peito', 'Costas', 'Pernas', 'Ombros', 'Biceps', 'Triceps', 'Glúteos', 'Full Body', 'Levantamento Olímpico', 'Powerlifting', 'Calistenia', 'Outro'],
  aula:  ['HIIT', 'RPM/Cycling', 'Pilates', 'Yoga', 'Body Pump', 'Zumba', 'CrossFit', 'Treino Funcional', 'Natação', 'Outro'],
};
const GYM_CATEGORIES_VISIBLE = 6;
const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-gym

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
  const { gymSessions, setGymSessions } = useAppStore();

  // Comum aos dois caminhos
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState('forca');
  const [categories, setCategories] = useState([]);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  // Um único cartão, forma de introdução à escolha — mesmo padrão da
  // Corrida/Nutrição/Corpo: só um dos dois blocos fica visível/clicável a
  // cada vez, e as duas formas passam pelo Coach.
  const [entryMethod, setEntryMethod] = useState('foto'); // 'foto' | 'manual'
  const [errorMsg, setErrorMsg] = useState('');

  // Foto (IA)
  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Manual — métricas do relógio; séries/repetições/carga são adicionadas
  // à sessão já criada, uma a uma, no próprio cartão do treino (não
  // precisam de IA nem fazem parte deste registo inicial).
  const [durationStr, setDurationStr] = useState('');
  const [calories, setCalories] = useState('');
  const [avgHr, setAvgHr] = useState('');
  const [maxHr, setMaxHr] = useState('');
  const [exertion, setExertion] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  // Handle Photo Selection — comprime e normaliza para JPEG (src/lib/image.js,
  // partilhado com a Corrida/Refeição/Corpo); o .base64 resultante é o que
  // vai no pedido de análise por IA.
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
  // ANALISAR TREINO POR FOTO (IA — analyze-gym)
  // ----------------------------------
  const handleAnalyzePhotos = async () => {
    if (!photos.length || isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-gym', {
        body: {
          images: photos.map(p => p.base64),
          mime_type: 'image/jpeg',
          date,
          kind,
          name: name.trim() || null,
          categories,
          notes: notes.trim() || null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setGymSessions([data.session, ...gymSessions]);
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
  // Gemini extrair de imagem nenhuma); o mesmo pedido grava a sessão E gera
  // o comentário do Coach a partir dos números indicados, comparando com
  // sessões anteriores do mesmo tipo — mode:"manual" em analyze-gym.
  // ----------------------------------
  const handleSaveManual = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-gym', {
        body: {
          mode: 'manual',
          date,
          kind,
          name: name.trim() || null,
          categories,
          notes: notes.trim() || null,
          duration_seconds: parseDurationInput(durationStr),
          calories_kcal: calories ? parseInt(calories) : null,
          avg_hr: avgHr ? parseInt(avgHr) : null,
          max_hr: maxHr ? parseInt(maxHr) : null,
          exertion: exertion ? parseInt(exertion) : null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setGymSessions([data.session, ...gymSessions]);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a gravar o treino. Tenta novamente.');
    } finally {
      setIsSaving(false);
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
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5" style={{ color: 'var(--mod-ginasio-to)' }} />
            <h2 className="text-[15px] font-bold text-slate-800">Novo Treino</h2>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-[12px] text-slate-500 hover:text-red-500 transition font-medium"
          >
            Cancelar
          </button>
        </div>

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
                style={isActive ? { color: '#fff' } : undefined}
                className={`flex-1 rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border ${isActive ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)] shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
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

        <div className="mb-4">
          <label className="text-[11px] text-slate-500 mb-1.5 block">Como queres registar?</label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setEntryMethod('foto')}
              style={entryMethod === 'foto' ? { color: '#fff' } : undefined}
              className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
            >
              <Camera size={14} /> Foto (IA)
            </button>
            <button
              type="button"
              onClick={() => setEntryMethod('manual')}
              style={entryMethod === 'manual' ? { color: '#fff' } : undefined}
              className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-ginasio-to)] border-[var(--mod-ginasio-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
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
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-[var(--mod-ginasio-to)]/40 rounded-xl py-3 text-center cursor-pointer hover:bg-[var(--mod-ginasio-to)]/5 transition mb-4">
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                    <ImagePlus className="w-4 h-4" style={{ color: 'var(--mod-ginasio-to)' }} />
                    <span className="text-[12px] font-bold" style={{ color: 'var(--mod-ginasio-to)' }}>Adicionar outro print</span>
                  </label>
                )}
              </>
            ) : (
              <label className="block border-2 border-dashed border-slate-300 rounded-xl py-6 text-center cursor-pointer hover:border-slate-400 transition mb-4 bg-white/50">
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                <ImagePlus className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-semibold">Escolhe os prints da app de treino (Hevy, Strong...)</p>
                <p className="text-[10px] text-slate-500 mt-1 px-4">Podes juntar vários ecrãs da mesma sessão — a IA lê exercícios, séries e cargas automaticamente</p>
              </label>
            )}
          </>
        ) : (
          <>
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
            <p className="text-[10px] text-slate-500 -mt-2 mb-4">Séries/repetições/carga adicionam-se ao treino depois de gravado.</p>
          </>
        )}

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

        {/* Ação — mesmo botão do Coach nos dois caminhos: a foto e o registo
            manual acabam ambos analisados por ele, só a origem dos dados
            muda. */}
        {entryMethod === 'foto' ? (
          <CoachAnalyzeButton
            onClick={handleAnalyzePhotos}
            disabled={!photos.length || isAnalyzing}
            busy={isAnalyzing}
            label="Analisar Treino"
          />
        ) : (
          <CoachAnalyzeButton
            onClick={handleSaveManual}
            disabled={isSaving}
            busy={isSaving}
            label="Analisar Treino"
          />
        )}

        {errorMsg && <p className="text-red-500 text-[13px] font-medium mt-3 text-center">{errorMsg}</p>}
      </div>
    </div>
  );
}
