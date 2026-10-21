import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import PremiumModal from '../shared/PremiumModal';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { deleteMealTemplate, foodKey, isKnownFood, pantrySuggestions, portionText, saveMealTemplate, templateItems, templateTotals, toNumber } from '../../utils/pantry';
import { MEAL_TYPE_OPTIONS } from '../../utils/nutrition';

/* Criar ou ajustar uma refeição predefinida (bug #63, fase D, 2026-10-17;
   specs/carol-quantidades-habitos-refeicoes.md §5.2): um nome, o tipo de
   refeição sugerido e os alimentos da despensa com as gramas. No registo,
   tocar nela preenche a lista de alimentos. */
/* `initial` (fase 2 do #63, 2026-10-18): uma refeição NOVA já preenchida —
   "Guardar como refeição" no cartão de uma refeição registada. */
export default function MealTemplateSheet({ template = null, initial = null, onClose }) {
  const start = template ?? initial;
  const { profile, pantryFoods, pantryLoaded, loadPantry } = useAppStore();
  // Aberta do Calendário ("Guardar como refeição"), a despensa pode ainda
  // não estar lida: sem ela, a pesquisa dizia "nada com esse nome" e os
  // totais não apareciam (revisão pré-master).
  useEffect(() => { if (!pantryLoaded) loadPantry?.(); }, [pantryLoaded, loadPantry]);
  const { showToast } = useToast();
  const [name, setName] = useState(start?.name ?? '');
  const [mealType, setMealType] = useState(start?.default_meal_type ?? '');
  const [items, setItems] = useState(() => templateItems(start).map((it, i) => ({ ...it, key: `${i}`, grams: it.grams != null ? String(it.grams) : '' })));
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // O nome sugerido seleciona-se só no 1.º foco: voltar ao campo para corrigir
  // uma letra não pode apagar o nome todo à primeira tecla.
  const selectedOnce = useRef(false);

  const suggestions = pantrySuggestions(query, pantryFoods)
    .filter((f) => !items.some((it) => foodKey(it.name) === f.name_key));
  const totals = templateTotals({ items: items.map((it) => ({ name: it.name, grams: toNumber(it.grams) })) }, pantryFoods);

  const addFood = (food) => {
    setItems((prev) => [...prev, {
      key: `${Date.now()}-${prev.length}`, food_id: food.id ?? null, name: food.name,
      grams: Number(food.portion_grams) > 0 ? String(Math.round(Number(food.portion_grams))) : '',
    }]);
    setQuery('');
  };

  const run = async (fn, done) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await loadPantry?.();
      showToast(done);
      onClose();
    } catch (e) {
      setError(e?.message || 'Não consegui guardar.');
      setBusy(false);
    }
  };

  // O poço dos campos (.data-form): inline ganha ao CSS, por isso aqui os mesmos tokens.
  const field = { border: '1px solid var(--border-well)', background: 'var(--surface-well)', color: 'var(--text-1)' };

  return (
    <PremiumModal isOpen onClose={onClose} title={template ? template.name : 'Nova refeição'} subtitle="Os alimentos, com as gramas" theme="nutri" variant="bottom-sheet" maxWidth="max-w-md">
      <div className="px-5 py-4 space-y-3" data-testid="meal-template-sheet">
        <label className="block" htmlFor="template-name">
          <span className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>Nome (ex.: Pequeno-almoço de treino)</span>
          <input id="template-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
            // Nova a partir de uma refeição: o nome vem sugerido e selecionado, pronto a trocar.
            autoFocus={!!initial && !template} onFocus={(e) => { if (initial && !template && !selectedOnce.current) { selectedOnce.current = true; e.target.select(); } }} className="w-full min-h-[46px] rounded-xl px-3 text-[15px] font-bold outline-none" style={field} />
        </label>

        <div>
          <span id="template-type" className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>Costuma ser ao (opcional)</span>
          <div role="group" aria-labelledby="template-type" className="flex flex-wrap gap-1.5">
            {MEAL_TYPE_OPTIONS.map((t) => {
              const on = mealType === t.key;
              return (
                <button key={t.key} type="button" aria-pressed={on} onClick={() => setMealType(on ? '' : t.key)}
                  className="min-h-[44px] px-3 rounded-full text-[12.5px] font-bold"
                  style={on
                    ? { background: 'var(--tint-nutrition-bg)', border: '1px solid var(--nutrition)', color: 'var(--text-1)' }
                    : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.16)', color: 'var(--text-2)' }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {items.length > 0 && (
          <ul className="space-y-1.5" aria-label="Alimentos da refeição">
            {items.map((it) => (
              <li key={it.key} className="flex items-center gap-2 p-2 pl-3 rounded-xl" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)' }}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{it.name}</span>
                  {/* Vindo de "Guardar como refeição", pode não estar na despensa:
                      ao usar a refeição, a Carol estima-o (sem os valores dela). */}
                  {pantryLoaded && !isKnownFood(it.name, pantryFoods) && (
                    <span className="block text-[11px]" style={{ color: 'var(--text-4)' }}>fora da despensa · a Carol estima</span>
                  )}
                </span>
                <label className="flex items-center gap-1 shrink-0">
                  <input type="number" min="1" step="1" inputMode="numeric" value={it.grams} aria-label={`Gramas de ${it.name}`}
                    onChange={(e) => setItems((prev) => prev.map((x) => (x.key === it.key ? { ...x, grams: e.target.value } : x)))}
                    className="w-16 min-h-[44px] rounded-lg px-2 text-sm text-right outline-none" style={field} />
                  <span className="text-[12px]" style={{ color: 'var(--text-4)' }}>g</span>
                </label>
                <button type="button" aria-label={`Tirar ${it.name}`} onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}
                  className="tap-44 flex items-center justify-center shrink-0" style={{ color: 'var(--text-4)' }}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && totals.known > 0 && (
          <p className="text-[12px]" style={{ color: 'var(--text-3)' }} data-testid="meal-template-totals">
            {totals.kcal} kcal · <abbr title="proteína" aria-label="proteína">P</abbr> {String(totals.protein).replace('.', ',')} g · <abbr title="hidratos" aria-label="hidratos">H</abbr> {String(totals.carbs).replace('.', ',')} g · <abbr title="gordura" aria-label="gordura">G</abbr> {String(totals.fat).replace('.', ',')} g
            {totals.known < totals.total ? ` (${totals.known} de ${totals.total} alimentos com gramas)` : ''}
          </p>
        )}

        <label className="block" htmlFor="template-food">
          <span className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>Juntar alimento da despensa</span>
          <input id="template-food" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar na despensa" className="w-full min-h-[44px] rounded-xl px-3 text-sm outline-none" style={field} />
        </label>
        {suggestions.length > 0 && (
          <div role="listbox" aria-label="Da tua despensa" className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-glass-strong)', background: 'var(--surface-strong)' }}>
            {suggestions.map((f, i) => (
              <button key={f.id ?? f.name_key} type="button" role="option" aria-selected={false} onClick={() => addFood(f)}
                className="w-full min-h-[48px] px-3 py-1.5 text-left" style={i ? { borderTop: '1px solid var(--border-glass)' } : undefined}>
                <span className="block text-[13.5px] font-extrabold" style={{ color: 'var(--text-1)' }}>{f.name}</span>
                {portionText(f) && <span className="block text-[11.5px]" style={{ color: 'var(--text-4)' }}>{portionText(f)}</span>}
              </button>
            ))}
          </div>
        )}
        {query.trim() && suggestions.length === 0 && (
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nada com esse nome na despensa. Junta-o primeiro em Alimentos.</p>
        )}

        {error && <p role="alert" className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>}
        <button
          type="button"
          disabled={busy || !name.trim() || items.length === 0}
          onClick={() => run(() => saveMealTemplate({
            userId: profile?.id, existing: template,
            values: { name, default_meal_type: mealType || null, items: items.map(({ food_id, name: n, grams }) => ({ food_id, name: n, grams })) },
          }), 'Refeição guardada')}
          className="w-full min-h-[48px] rounded-xl text-[14px] font-black disabled:opacity-50"
          style={{ background: 'var(--nutrition)', color: 'var(--nutrition-ink)' }}
        >
          Guardar
        </button>
        {template && (
          <button type="button" disabled={busy} onClick={() => run(() => deleteMealTemplate(template.id), 'Refeição apagada')}
            className="w-full min-h-[46px] rounded-xl text-[13.5px] font-extrabold" style={{ border: '1px solid var(--tint-danger-bd)', color: 'var(--danger)' }}>
            Apagar refeição
          </button>
        )}
      </div>
    </PremiumModal>
  );
}
