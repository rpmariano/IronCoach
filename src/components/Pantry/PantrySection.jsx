import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, ChevronRight, Pencil, Refrigerator } from 'lucide-react';
import { useAppStore } from '../../store';
import CoachAvatar from '../Coach/CoachAvatar';
import PantryFoodSheet from './PantryFoodSheet';
import FoodRuleSheet from './FoodRuleSheet';
import { foodSubline, foodKey, ruleInfo, visibleRules } from '../../utils/pantry';

/* A despensa, no Armário do Perfil (bugs #48/#52, fase C; mockup "Despensa e
   perguntas da Carol", ecrãs 6 e 7). Dois separadores: os alimentos que a
   Carol já conhece — os mais usados primeiro, sem distinguir de onde vieram
   («não entendo a necessidade de ter ícones diferentes») — e como o atleta
   cozinha, o que ela já não pergunta. Tocar num alimento abre-o para
   ajustar; "+" adiciona por descrição, foto do rótulo ou galeria. */
export default function PantrySection() {
  const { pantryFoods: storedFoods, foodRules: storedRules, pantryUserId, session, profile, loadPantry } = useAppStore();
  // A despensa em memória pode ser de outra conta (sessão trocada sem
  // recarregar): até chegar a de quem está, fica vazia.
  const myId = session?.user?.id || profile?.id;
  const mine = !myId || pantryUserId === myId;
  const pantryFoods = mine ? storedFoods : null;
  const foodRules = mine ? storedRules : null;
  const [tab, setTab] = useState('alimentos');
  const [query, setQuery] = useState('');
  const [foodSheet, setFoodSheet] = useState(null); // { food } | { food: null } (novo)
  const [ruleSheet, setRuleSheet] = useState(null); // { rule } | { rule: null } (nova)

  useEffect(() => { loadPantry?.(); }, [loadPantry]);

  const rules = visibleRules(foodRules);
  const foods = useMemo(() => {
    const q = foodKey(query);
    return [...(pantryFoods || [])]
      .filter((f) => !q || String(f.name_key || '').includes(q))
      .sort((a, b) => (b.times_seen || 0) - (a.times_seen || 0));
  }, [pantryFoods, query]);

  return (
    <div className="module-card-contrast" data-testid="pantry-section">
      <div className="flex items-center gap-2 mb-1">
        <Refrigerator size={16} style={{ color: 'var(--nutrition)' }} />
        <h3 className="text-sm font-semibold">Despensa</h3>
      </div>
      <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: 'var(--text-3)' }}>
        O que a Carol já conhece do que comes e de como cozinhas — não volta a analisar nem a perguntar.
      </p>

      <div role="tablist" aria-label="Despensa" className="grid grid-cols-2 gap-1 p-1 rounded-[14px] mb-3" style={{ background: 'rgba(255,255,255,.05)' }}>
        {[['alimentos', `Alimentos · ${pantryFoods?.length || 0}`, 'rgba(199,125,255,.2)', '#f3e8ff'], ['cozinhar', `Como cozinhas · ${rules.length}`, 'rgba(34,211,238,.18)', '#cffafe']].map(([key, label, bg, fg]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className="min-h-[40px] rounded-[10px] text-[13px] font-extrabold"
            style={tab === key ? { background: bg, color: fg } : { color: 'var(--text-3)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'alimentos' ? (
        <div role="tabpanel" className="space-y-2">
          <div className="flex gap-2">
            <label className="flex-1 min-h-[44px] rounded-xl flex items-center gap-2 px-3" style={{ border: '1px solid var(--border-glass)', background: 'var(--surface-soft)' }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <span className="sr-only">Procurar alimento</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Procurar alimento"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text-1)' }}
              />
            </label>
            <button
              type="button"
              aria-label="Adicionar alimento à despensa"
              data-testid="pantry-add-food"
              onClick={() => setFoodSheet({ food: null })}
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--nutrition)', color: 'var(--nutrition-ink)' }}
            >
              <Plus size={20} />
            </button>
          </div>

          {foods.length === 0 ? (
            <p className="text-[12px] leading-relaxed py-2" style={{ color: 'var(--text-muted)' }}>
              {query ? 'Nada com esse nome na despensa.' : 'Ainda vazia. Um alimento entra à segunda vez que o comes, ou logo, se fotografares o rótulo ou o adicionares aqui.'}
            </p>
          ) : (
            <ul className="space-y-2" aria-label="Alimentos da despensa">
              {foods.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => setFoodSheet({ food: f })}
                    className="w-full min-h-[56px] flex items-center gap-2 pl-3.5 pr-2 rounded-[14px] text-left"
                    style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)' }}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{f.name}</span>
                      <span className="block text-[12px]" style={{ color: 'var(--text-4)' }}>{foodSubline(f)}</span>
                    </span>
                    <ChevronRight size={18} style={{ color: 'var(--text-4)' }} className="shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11.5px] leading-relaxed pt-1" style={{ color: 'var(--text-muted)' }}>
            Cada alimento que entra aqui é confirmado pela Carol, e podes ajustar os valores à mão. Numa refeição, já não volta a ser analisado.
          </p>
        </div>
      ) : (
        <div role="tabpanel" className="space-y-2">
          <div className="flex gap-2.5 items-start mb-1">
            <CoachAvatar size={32} mood="neutral" />
            <p className="text-[12.5px] leading-[1.5]" style={{ color: 'var(--text-2)' }}>
              Isto é o que já não te pergunto. Guardo à segunda resposta igual, ou quando o escreves nas observações. Se estiver errado, corrige aqui.
            </p>
          </div>
          {rules.length === 0 ? (
            <p className="text-[12px] leading-relaxed py-1" style={{ color: 'var(--text-muted)' }}>Ainda não sei nada de como cozinhas.</p>
          ) : (
            <ul className="space-y-2" aria-label="Como cozinhas">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-2 p-3 rounded-[14px]"
                  style={r.status === 'varia'
                    ? { background: 'var(--tint-warn-bg)', border: '1px solid var(--tint-warn-bd)' }
                    : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)' }}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] font-extrabold uppercase" style={{ letterSpacing: 'var(--tracking-label)', color: r.status === 'varia' ? 'var(--warn-soft)' : 'var(--text-4)' }}>{r.topic}</span>
                    <span className="block text-[15px] font-extrabold mt-0.5" style={{ color: 'var(--text-1)' }}>{r.status === 'varia' ? 'Varia' : r.value}</span>
                    <span className="block text-[11.5px] mt-0.5" style={{ color: r.status === 'varia' ? 'var(--warn-soft)' : 'var(--text-muted)' }}>{ruleInfo(r)}</span>
                  </span>
                  <button type="button" aria-label={`Corrigir ${r.topic}`} onClick={() => setRuleSheet({ rule: r })} className="tap-44 flex items-center justify-center shrink-0" style={{ color: 'var(--text-4)' }}>
                    <Pencil size={17} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setRuleSheet({ rule: null })}
            className="w-full min-h-[46px] rounded-xl text-[13.5px] font-extrabold"
            style={{ border: '1px dashed var(--tint-coach-bd)', color: 'var(--coach)' }}
          >
            + Dizer-lhe como cozinho uma coisa
          </button>
        </div>
      )}

      {foodSheet && <PantryFoodSheet food={foodSheet.food} onClose={() => setFoodSheet(null)} />}
      {ruleSheet && <FoodRuleSheet rule={ruleSheet.rule} onClose={() => setRuleSheet(null)} />}
    </div>
  );
}
