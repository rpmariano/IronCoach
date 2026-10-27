import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import Chip from '../Chip';
import { foodKey } from '@formulas/foodKey.ts';
import { describeLast, exerciseFromLocker } from '../../../utils/gymSets';
import { FieldInput } from './Field';

/* "+ Adicionar do Armário" (registo unificado, F1 — decisão 7): pesquisa
   instantânea no catálogo pessoal, com filtro por grupo muscular. Tocar num
   exercício junta-o à sessão com séries vazias — os valores da última vez
   aparecem como sugestão e o ✓ confirma-os. */
export default function ExerciseLockerPicker({ rows, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(null);

  const groups = useMemo(() => [...new Set((rows || []).map(r => r.category).filter(Boolean))], [rows]);
  const results = useMemo(() => {
    const q = foodKey(query);
    return (rows || [])
      .filter(r => (!group || r.category === group) && (!q || (r.name_key || foodKey(r.name)).includes(q)))
      .slice(0, 30);
  }, [rows, query, group]);

  return (
    <div className="mb-3 rounded-xl border border-[var(--border-glass)] bg-[var(--surface-glass)] p-3" role="region" aria-label="Biblioteca de exercícios">
      <div className="flex items-center gap-2 mb-2">
        <FieldInput
          type="search"
          autoFocus
          aria-label="Procurar na biblioteca"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Procurar exercício…"
          className="flex-1 min-w-0"
        />
        <button type="button" onClick={onClose} aria-label="Fechar a biblioteca" className="tap-44 text-[var(--text-3)] shrink-0">
          <X size={16} />
        </button>
      </div>
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Filtrar por grupo muscular">
          {groups.map(g => (
            <Chip key={g} active={group === g} aria-pressed={group === g} variant="gym" type="button" onClick={() => setGroup(group === g ? null : g)}>
              {g}
            </Chip>
          ))}
        </div>
      )}
      {(rows || []).length === 0 ? (
        <p className="text-[12px] text-[var(--text-3)]">A biblioteca enche-se sozinha: cada exercício que registares fica cá, com a última carga.</p>
      ) : results.length === 0 ? (
        <p className="text-[12px] text-[var(--text-3)]">Nada com esse nome. Escreve-o em "Adicionar exercício".</p>
      ) : (
        <ul className="space-y-1 max-h-64 overflow-y-auto">
          {results.map(r => {
            const last = describeLast(r);
            return (
              <li key={r.id || r.name_key}>
                <button
                  type="button"
                  onClick={() => onPick(exerciseFromLocker(r))}
                  className="w-full min-h-[44px] flex items-center justify-between gap-2 rounded-lg px-2 text-left hover:bg-[var(--surface-strong)]"
                >
                  <span className="text-sm text-white truncate">{r.name}</span>
                  <span className="text-[11px] text-[var(--text-3)] shrink-0">{last || r.category}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
