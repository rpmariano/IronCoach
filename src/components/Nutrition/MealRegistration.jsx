import React, { useState } from 'react';
import { Camera, ImagePlus, X, Trash2, PencilLine, Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';

/* Espelha MEAL_TYPES em supabase/functions/analyze-meal e mealTypeLabel()
   em src/utils/nutrition.js — as duas usam hífen (ex.: "pequeno-almoco"). A
   versão anterior deste ficheiro usava underscore ("pequeno_almoco"), que a
   Edge Function rejeitava com 400 "Tipo de refeição inválido" — nunca dava
   para notar porque o botão era um placeholder e nunca chegava a chamá-la. */
const MEAL_TYPES = [
  { key: 'pequeno-almoco', label: 'Pequeno-almoço' },
  { key: 'lanche-manha', label: 'Lanche da manhã' },
  { key: 'almoco', label: 'Almoço' },
  { key: 'lanche', label: 'Lanche' },
  { key: 'jantar', label: 'Jantar' },
  { key: 'ceia', label: 'Ceia' },
];

const MAX_PHOTOS = 6; // espelha MAX_PHOTOS em supabase/functions/analyze-meal

function itemMacros(item) {
  const factor = (Number(item.quantity_grams) || 0) / 100;
  return {
    calories: factor * (Number(item.calories_per_100g) || 0),
    protein: factor * (Number(item.protein_per_100g) || 0),
    carbs: factor * (Number(item.carbs_per_100g) || 0),
    fat: factor * (Number(item.fat_per_100g) || 0),
  };
}

export default function MealRegistration({ onClose }) {
  const { profile, meals, setMeals } = useAppStore();

  // Comum aos dois caminhos
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mealType, setMealType] = useState('almoco');
  const [notes, setNotes] = useState('');
  // Um único cartão, forma de introdução à escolha — mesmo padrão da
  // Corrida: só um dos dois blocos fica visível/clicável a cada vez.
  const [entryMethod, setEntryMethod] = useState('foto'); // 'foto' | 'manual'
  const [errorMsg, setErrorMsg] = useState('');

  // Foto (IA)
  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Manual — cria a refeição vazia ao primeiro alimento adicionado (só
  // nesse momento passa a existir uma linha em `meals`) e vai acrescentando
  // alimentos um a um; cada um é estimado pelo Gemini a partir do nome (sem
  // foto). "Analisar Refeição" no fim gera só o comentário do Coach.
  const [mealId, setMealId] = useState(null);
  const [manualItems, setManualItems] = useState([]);
  const [itemName, setItemName] = useState('');
  const [itemGrams, setItemGrams] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [removingItemId, setRemovingItemId] = useState(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Handle Photo Selection — comprime e normaliza para JPEG (src/lib/image.js,
  // partilhado com a Corrida); o .base64 resultante é o que vai no pedido de
  // análise por IA.
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
  const clearPhotos = () => setPhotos([]);

  // ----------------------------------
  // ANALISAR REFEIÇÃO POR FOTO (IA — analyze-meal)
  // ----------------------------------
  const handleAnalyzePhotos = async () => {
    if (!photos.length || isAnalyzing) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
        body: {
          images: photos.map(p => p.base64),
          mime_type: 'image/jpeg',
          date,
          meal_type: mealType,
          notes: notes.trim() || null,
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      // A resposta traz meal e items em separado — o store espera-os juntos,
      // tal como loadInitialData os carrega (select('*, meal_items(*)')).
      setMeals([...meals, { ...data.meal, meal_items: data.items }]);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha na análise. Tenta novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ----------------------------------
  // REGISTO MANUAL — alimento a alimento, cada um estimado pelo Gemini a
  // partir do nome (sem foto), depois "Analisar Refeição" gera o comentário
  // do Coach a partir dos itens já gravados.
  // ----------------------------------
  const ensureMealId = async () => {
    if (mealId) return mealId;
    const { data, error } = await supabase
      .from('meals')
      .insert({ user_id: profile.id, date, meal_type: mealType, photo_paths: [], status: 'ready', notes: notes.trim() || null })
      .select()
      .single();
    if (error) throw error;
    setMealId(data.id);
    return data.id;
  };

  const handleAddItem = async () => {
    const name = itemName.trim();
    const grams = Number(itemGrams);
    if (!name) { setErrorMsg('Escreve o nome do alimento.'); return; }
    if (!(grams > 0)) { setErrorMsg('Indica as gramas.'); return; }
    if (isAddingItem) return;

    setIsAddingItem(true);
    setErrorMsg('');
    try {
      const id = await ensureMealId();
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
        body: { meal_id: id, item_name: name, item_grams: grams },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setManualItems(prev => [...prev, data.item]);
      setItemName('');
      setItemGrams('');
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a estimar o alimento. Tenta novamente.');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleRemoveManualItem = async (itemId) => {
    setRemovingItemId(itemId);
    try {
      const { error } = await supabase.from('meal_items').delete().eq('id', itemId);
      if (error) throw error;
      setManualItems(prev => prev.filter(i => i.id !== itemId));
    } catch (err) {
      console.error(err);
      setErrorMsg('Não foi possível remover o alimento.');
    } finally {
      setRemovingItemId(null);
    }
  };

  const handleFinalizeManual = async () => {
    if (!mealId || !manualItems.length || isFinalizing) return;
    setIsFinalizing(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
        body: { mode: 'finalize', meal_id: mealId },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setMeals([...meals, data.meal]);
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a analisar a refeição. Tenta novamente.');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Cancelar com uma refeição manual já criada mas sem itens (o utilizador
  // nunca chegou a adicionar nada) apaga-a — não deixa refeições vazias na
  // conta, tal como o vanilla fazia (abandonManualMealSession).
  const handleCancel = async () => {
    if (mealId && manualItems.length === 0) {
      try {
        await supabase.from('meals').delete().eq('id', mealId);
      } catch (err) {
        console.error('Error deleting empty meal:', err);
      }
    }
    onClose();
  };

  const manualTotals = manualItems.reduce((acc, it) => {
    const m = itemMacros(it);
    return { calories: acc.calories + m.calories, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  return (
    <div className="fade-in pb-8">
      <div
        className="rounded-2xl p-4 shadow-sm relative overflow-hidden"
        style={{ backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.1)', borderLeft: '4px solid var(--mod-nutricao-to)' }}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Camera size={18} style={{ color: 'var(--mod-nutricao-to)' }} />
            <h2 className="text-[15px] font-semibold text-slate-700">Nova Refeição</h2>
          </div>
          <button
            onClick={handleCancel}
            type="button"
            className="text-[12px] text-slate-500 hover:text-red-500 transition font-medium"
          >
            Cancelar
          </button>
        </div>

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

        {/* Como queres registar? — escondido depois de já haver uma refeição
            manual em curso, tal como na Corrida ao editar: uma vez escolhido
            o caminho, não faz sentido saltar a meio. */}
        {!mealId && (
          <div className="mb-5">
            <label className="text-[11px] text-slate-500 mb-1.5 block px-1">Como queres registar?</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setEntryMethod('foto')}
                style={entryMethod === 'foto' ? { color: '#fff' } : undefined}
                className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'foto' ? 'bg-[var(--mod-nutricao-to)] border-[var(--mod-nutricao-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
              >
                <Camera size={14} /> Foto (IA)
              </button>
              <button
                type="button"
                onClick={() => setEntryMethod('manual')}
                style={entryMethod === 'manual' ? { color: '#fff' } : undefined}
                className={`flex-1 rounded-xl px-3 py-2.5 text-[12px] font-semibold flex items-center justify-center gap-1.5 border transition ${entryMethod === 'manual' ? 'bg-[var(--mod-nutricao-to)] border-[var(--mod-nutricao-to)]' : 'bg-white border-slate-200 text-slate-500'}`}
              >
                <PencilLine size={14} /> Manual
              </button>
            </div>
          </div>
        )}

        {entryMethod === 'foto' ? (
          <>
            {photos.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={p.dataUrl} className="w-full h-full object-cover rounded-xl border border-slate-200" alt={`Foto ${i+1}`} />
                      <button
                        onClick={() => removePhoto(i)}
                        aria-label={`Remover foto ${i + 1}`}
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
          </>
        ) : (
          <div className="mb-4">
            <div className="rounded-xl border border-slate-200 bg-white/50 p-3 mb-3">
              <p className="text-[12px] font-bold text-slate-500 mb-2.5">Adicionar alimento</p>
              <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Ex.: peito de frango grelhado"
                  value={itemName}
                  onChange={e => setItemName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[var(--mod-nutricao-to)] transition"
                />
                <div className="relative w-24">
                  <input
                    type="number" min="1" step="1"
                    placeholder="g"
                    value={itemGrams}
                    onChange={e => setItemGrams(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[var(--mod-nutricao-to)] transition"
                  />
                </div>
              </div>
              <button
                onClick={handleAddItem}
                disabled={isAddingItem || !itemName.trim() || !itemGrams}
                type="button"
                className="w-full text-[13px] font-bold rounded-xl py-2.5 flex items-center justify-center gap-1.5 border transition disabled:opacity-40"
                style={{ borderColor: 'var(--mod-nutricao-to)', color: 'var(--mod-nutricao-to)' }}
              >
                {isAddingItem
                  ? <><Loader2 size={16} className="animate-spin" /> A estimar com IA...</>
                  : <><Plus size={16} /> Adicionar alimento</>}
              </button>
            </div>

            {manualItems.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {manualItems.map(item => {
                  const m = itemMacros(item);
                  return (
                    <div key={item.id} className="flex items-center justify-between bg-white border border-slate-200/80 rounded-xl px-3 py-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800 capitalize">{item.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {Number(item.quantity_grams).toFixed(0)}g · {m.calories.toFixed(0)} kcal · P {m.protein.toFixed(1)}g · H {m.carbs.toFixed(1)}g · G {m.fat.toFixed(1)}g
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveManualItem(item.id)}
                        disabled={removingItemId === item.id}
                        className="tap-44 text-slate-400 hover:text-red-500 shrink-0"
                        aria-label={`Remover ${item.name}`}
                      >
                        {removingItemId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-500 text-right px-1">
                  Total: {manualTotals.calories.toFixed(0)} kcal · P {manualTotals.protein.toFixed(1)}g · H {manualTotals.carbs.toFixed(1)}g · G {manualTotals.fat.toFixed(1)}g
                </p>
              </div>
            )}
          </div>
        )}

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

        {/* Ações — mesmo botão do Coach nos dois caminhos: a foto e o registo
            manual acabam ambos analisados por ele, só a origem dos dados
            muda (ver PRD 3.2). */}
        {entryMethod === 'foto' && !mealId ? (
          <CoachAnalyzeButton
            onClick={handleAnalyzePhotos}
            disabled={!photos.length || isAnalyzing}
            busy={isAnalyzing}
            label="Analisar Refeição"
          />
        ) : (
          <CoachAnalyzeButton
            onClick={handleFinalizeManual}
            disabled={!manualItems.length || isFinalizing}
            busy={isFinalizing}
            label="Analisar Refeição"
          />
        )}

        {errorMsg && <p className="text-red-500 text-[13px] font-medium mt-3 text-center">{errorMsg}</p>}
      </div>
    </div>
  );
}
