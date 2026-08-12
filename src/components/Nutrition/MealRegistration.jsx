import React, { useState, useEffect } from 'react';
import { Camera, ImagePlus, X, Trash2, PencilLine, Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../store';
import { supabase, invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { compressImage } from '../../lib/image';
import { CoachAnalyzeButton } from '../shared/CoachButton';
import { useToast } from '../shared/ToastProvider';

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

function getDefaultMealType() {
  const hour = new Date().getHours();
  const minute = new Date().getMinutes();
  const time = hour + minute / 60;
  
  if (time >= 5 && time < 10.5) return 'pequeno-almoco'; // 05:00 - 10:30
  if (time >= 10.5 && time < 12) return 'lanche-manha';  // 10:30 - 12:00
  if (time >= 12 && time < 15) return 'almoco';          // 12:00 - 15:00
  if (time >= 15 && time < 19) return 'lanche';          // 15:00 - 19:00
  if (time >= 19 && time < 22.5) return 'jantar';        // 19:00 - 22:30
  return 'ceia';                                         // 22:30 - 05:00
}

export default function MealRegistration({ onClose, mealIdToEdit = null }) {
  const { showToast } = useToast();
  const { profile, meals, setMeals, loadInitialData } = useAppStore();
  const isEditing = !!mealIdToEdit;

  // Comum aos dois caminhos
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [mealType, setMealType] = useState(getDefaultMealType());
  const [notes, setNotes] = useState('');
  // Um único cartão, forma de introdução à escolha — mesmo padrão da
  // Corrida: só um dos dois blocos fica visível/clicável a cada vez.
  const [entryMethod, setEntryMethod] = useState('foto'); // 'foto' | 'manual'
  const [errorMsg, setErrorMsg] = useState('');

  // Foto (IA)
  const [photos, setPhotos] = useState([]); // [{ dataUrl, base64 }]
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Manual — "Adicionar alimento" só acrescenta {name, grams} a uma lista
  // local, sem tocar no servidor nem no Gemini. Só ao premir "Analisar
  // Refeição" é que UMA ÚNICA chamada estima os valores nutricionais de
  // TODOS os alimentos de uma vez, grava a refeição e gera o comentário do
  // Coach — nada é consultado à IA por cada alimento adicionado.
  const [manualItems, setManualItems] = useState([]); // [{ key, name, grams, dbId? }]
  const [itemName, setItemName] = useState('');
  const [itemGrams, setItemGrams] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Edição — carrega a refeição existente. Alimentos e observações são dados
  // ANALÍTICOS: mudá-los muda a análise, por isso guardar passa pelo Coach e
  // regenera-a (as observações entram no prompt de estimação — "hambúrguer"
  // caseiro e do McDonald's não dão os mesmos valores). Data e tipo de
  // refeição não mexem na análise, e nesses casos guardar é um update direto,
  // sem custo de API. É por passar pelo Coach que acrescentar um alimento
  // novo ao editar é agora possível — a estimativa dos valores dele vem daí.
  const [isSaving, setIsSaving] = useState(false);
  const [originalSnapshot, setOriginalSnapshot] = useState(null);

  // Assinatura do que é analítico, para comparar o antes com o agora.
  const analyticalSignature = (notesValue, items) => JSON.stringify({
    notes: (notesValue || '').trim(),
    items: items.map(i => ({ name: (i.name || '').trim(), grams: i.grams ?? null })),
  });

  useEffect(() => {
    if (!mealIdToEdit) return;
    const meal = meals.find(m => m.id === mealIdToEdit);
    if (!meal) return;
    setDate(meal.date || format(new Date(), 'yyyy-MM-dd'));
    setMealType(meal.meal_type || 'almoco');
    setNotes(meal.notes || '');
    const items = (meal.meal_items || []).map((it, i) => ({
      key: it.id || `${Date.now()}-${i}`,
      dbId: it.id,
      name: it.name,
      grams: it.quantity_grams,
    }));
    setManualItems(items);
    setOriginalSnapshot(analyticalSignature(meal.notes, items));
    setEntryMethod('manual');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealIdToEdit]);

  // Só regenera a análise se os alimentos ou as observações mudaram; mudar
  // apenas a data ou o tipo de refeição não justifica uma chamada ao Gemini.
  const needsReanalysis = isEditing
    && originalSnapshot !== null
    && analyticalSignature(notes, manualItems) !== originalSnapshot;

  const updateManualItem = (key, patch) => {
    setManualItems(prev => prev.map(i => (i.key === key ? { ...i, ...patch } : i)));
  };

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
      showToast('Refeição registada');
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha na análise. Tenta novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ----------------------------------
  // REGISTO MANUAL — adicionar é só local; a estimativa de nutrientes e o
  // comentário do Coach só acontecem ao premir "Analisar Refeição". As
  // gramas são opcionais: quando não indicadas, o Coach estima a porção
  // típica a partir da descrição do alimento + das observações da refeição
  // (ex.: "fiambre" com a observação "1 fatia" dá o mesmo resultado que
  // "1 fatia de fiambre" sem observação nenhuma).
  // ----------------------------------
  const handleAddItem = () => {
    const name = itemName.trim();
    if (!name) { setErrorMsg('Escreve o nome do alimento.'); return; }
    const trimmedGrams = itemGrams.trim();
    const grams = trimmedGrams ? Number(trimmedGrams) : null;
    if (trimmedGrams && !(grams > 0)) { setErrorMsg('Indica um valor de gramas válido.'); return; }

    setErrorMsg('');
    setManualItems(prev => [...prev, { key: `${Date.now()}-${prev.length}`, name, grams }]);
    setItemName('');
    setItemGrams('');
  };

  const handleRemoveManualItem = (key) => {
    setManualItems(prev => prev.filter(i => i.key !== key));
  };

  const handleFinalizeManual = async () => {
    if (!manualItems.length || isFinalizing) return;
    setIsFinalizing(true);
    setErrorMsg('');
    try {
      const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
        body: {
          mode: 'manual',
          date,
          meal_type: mealType,
          notes: notes.trim() || null,
          items: manualItems.map(i => ({ name: i.name, grams: i.grams })),
        },
      });
      if (error) throw new Error(error);
      if (data?.error) throw new Error(data.error);

      setMeals([...meals, data.meal]);
      showToast('Refeição registada');
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a analisar a refeição. Tenta novamente.');
    } finally {
      setIsFinalizing(false);
    }
  };

  // ----------------------------------
  // GUARDAR ALTERAÇÕES (edição) — dois caminhos:
  //   • Alimentos ou observações mudaram → passa pelo Coach (analyze-meal em
  //     mode manual com meal_id), que reestima os valores nutricionais de
  //     todos os alimentos e regenera a análise. É o que permite acrescentar
  //     um alimento novo ao editar.
  //   • Só a data/tipo mudaram → update direto, sem chamada ao Gemini.
  // ----------------------------------
  const handleSaveEdit = async () => {
    if (isSaving) return;
    if (needsReanalysis && !manualItems.length) {
      setErrorMsg('A refeição tem de ter pelo menos um alimento.');
      return;
    }
    setIsSaving(true);
    setErrorMsg('');
    try {
      if (needsReanalysis) {
        const { data, error } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
          body: {
            mode: 'manual',
            meal_id: mealIdToEdit,
            date,
            meal_type: mealType,
            notes: notes.trim() || null,
            items: manualItems.map(i => ({ name: i.name, grams: i.grams })),
          },
        });
        if (error) throw new Error(error);
        if (data?.error) throw new Error(data.error);
      } else {
        const { error: mealError } = await supabase
          .from('meals')
          .update({ date, meal_type: mealType })
          .eq('id', mealIdToEdit);
        if (mealError) throw mealError;
      }

      if (profile?.id) await loadInitialData(profile.id);
      showToast(needsReanalysis ? 'Refeição reanalisada pelo Coach' : 'Refeição atualizada');
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Falha a guardar alterações. Tenta novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fade-in pb-8">
      <div
        className="rounded-2xl p-4 shadow-sm relative overflow-hidden"
        style={{ backgroundColor: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.1)', borderLeft: '4px solid var(--mod-nutricao-to)' }}
      >
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Camera size={18} style={{ color: 'var(--mod-nutricao-to)' }} />
            <h2 className="text-[15px] font-semibold text-slate-700">{isEditing ? 'Editar Refeição' : 'Nova Refeição'}</h2>
          </div>
          <button
            onClick={onClose}
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

        {/* Como queres registar? — escondido a editar: editar é sempre pelos
            campos, sem foto nova (mesmo padrão da Corrida). */}
        {!isEditing && (
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
            {/* Também disponível a editar: como guardar passa pelo Coach
                quando os alimentos mudam, os valores nutricionais de um
                alimento novo são estimados na mesma chamada. */}
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
                      placeholder="g (opcional)"
                      value={itemGrams}
                      onChange={e => setItemGrams(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[var(--mod-nutricao-to)] transition"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 mb-2 px-1">Sem gramas indicadas, o Coach estima a porção típica pela descrição do alimento (ex.: "1 fatia de fiambre") e pelas observações abaixo.</p>
                <button
                  onClick={handleAddItem}
                  disabled={!itemName.trim()}
                  type="button"
                  className="w-full text-[13px] font-bold rounded-xl py-2.5 flex items-center justify-center gap-1.5 border transition disabled:opacity-40"
                  style={{ borderColor: 'var(--mod-nutricao-to)', color: 'var(--mod-nutricao-to)' }}
                >
                  <Plus size={16} /> Adicionar alimento
                </button>
            </div>

            {manualItems.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {manualItems.map(item => (
                  <div key={item.key} className="flex items-center gap-2 bg-white border border-slate-200/80 rounded-xl px-3 py-2">
                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          value={item.name}
                          onChange={e => updateManualItem(item.key, { name: e.target.value })}
                          className="flex-1 text-xs font-bold text-slate-800 outline-none bg-transparent"
                        />
                        <input
                          type="number" min="1"
                          value={item.grams}
                          onChange={e => updateManualItem(item.key, { grams: e.target.value })}
                          className="w-14 text-xs text-slate-600 text-right outline-none bg-transparent"
                        />
                        <span className="text-[10px] text-slate-400">g</span>
                      </>
                    ) : (
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-800 capitalize">{item.name}</p>
                        <p className="text-[10px] text-slate-400">{item.grams != null ? `${item.grams}g` : 'Porção estimada pelo Coach'}</p>
                      </div>
                    )}
                    <button
                      onClick={() => handleRemoveManualItem(item.key)}
                      className="tap-44 text-slate-400 hover:text-red-500 shrink-0"
                      aria-label={`Remover ${item.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {(!isEditing || needsReanalysis) && (
                  <p className="text-[10px] text-slate-400 text-right px-1">Valores nutricionais calculados ao analisar</p>
                )}
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
            muda (ver PRD 3.2). O manual só chega aqui a servidor nenhum —
            "Adicionar alimento" é sempre local. A editar, o botão só leva o
            gradiente do Coach quando os alimentos ou as observações mudaram
            (dados analíticos); mudar só a data ou o tipo é update direto. */}
        {isEditing ? (
          needsReanalysis ? (
            <CoachAnalyzeButton
              onClick={handleSaveEdit}
              disabled={isSaving || !manualItems.length}
              busy={isSaving}
              label="Guardar e Reanalisar"
            />
          ) : (
            <button
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="w-full bg-[var(--accent)] text-slate-900 font-bold text-[14px] rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-sm disabled:opacity-30"
            >
              {isSaving
                ? <><Loader2 size={16} className="animate-spin" /> A gravar...</>
                : <><PencilLine size={16} /> Guardar Alterações</>}
            </button>
          )
        ) : entryMethod === 'foto' ? (
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
