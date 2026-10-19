import React, { useEffect, useMemo, useState } from 'react';
import { Search, Plus, ChevronRight, Dumbbell } from 'lucide-react';
import { useAppStore } from '../../store';
import Chip from '../shared/Chip';
import ExerciseSheet from './ExerciseSheet';
import { exerciseSubline, filterExercises, groupsOf } from '../../utils/exerciseLocker';

/* O Armário de Exercícios (decisões 7, 10 e 14 de specs/plano-registo-plano-coach.md):
   tudo o que o atleta já fez, com a última carga, o recorde e a afinação da
   máquina. Enche-se sozinho a cada registo de ginásio — aqui vê-se, procura-se,
   ajusta-se e acrescenta-se à mão. */
export default function ExerciseLockerSection() {
  const { exerciseLocker, exerciseLockerUserId, session, profile, loadExerciseLocker } = useAppStore();
  // O Armário em memória pode ser de outra conta: até chegar o de quem está, fica vazio.
  const myId = session?.user?.id || profile?.id;
  const rows = !myId || exerciseLockerUserId === myId ? (exerciseLocker || []) : [];
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(null);
  const [sheet, setSheet] = useState(null); // { exercise } | { exercise: null } (novo)

  useEffect(() => { loadExerciseLocker?.(); }, [loadExerciseLocker]);

  const groups = useMemo(() => groupsOf(rows), [rows]);
  const visible = useMemo(() => filterExercises(rows, query, group), [rows, query, group]);

  return (
    <div className="module-card-contrast" data-testid="exercise-locker-section">
      <div className="flex items-center gap-2 mb-1">
        <Dumbbell size={16} style={{ color: 'var(--mod-ginasio-to)' }} />
        <h3 className="text-sm font-semibold">Exercícios</h3>
      </div>
      <p className="text-[11.5px] leading-relaxed mb-3" style={{ color: 'var(--text-3)' }}>
        O que já fizeste, com a última carga e a afinação da máquina. Enche-se sozinho a cada treino.
      </p>

      <div className="flex gap-2 mb-2">
        <label className="flex-1 min-h-[44px] rounded-xl flex items-center gap-2 px-3" style={{ border: '1px solid var(--border-glass)', background: 'var(--surface-soft)' }}>
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <span className="sr-only">Procurar exercício</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar exercício"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm" style={{ color: 'var(--text-1)' }} />
        </label>
        <button type="button" aria-label="Adicionar exercício" data-testid="locker-add-exercise" onClick={() => setSheet({ exercise: null })}
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--mod-ginasio-to)', color: 'var(--bg-app)' }}>
          <Plus size={20} />
        </button>
      </div>

      {groups.length > 1 && (
        <div role="group" aria-label="Filtrar por grupo muscular" className="flex flex-wrap gap-1.5 mb-2">
          {groups.map((g) => (
            <Chip key={g} active={group === g} aria-pressed={group === g} variant="gym" type="button" onClick={() => setGroup(group === g ? null : g)}>{g}</Chip>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-[12px] leading-relaxed py-2" style={{ color: 'var(--text-muted)' }}>
          {rows.length === 0
            ? 'Ainda vazio. Cada exercício que registares fica cá, com a última carga — ou junta um com o "+".'
            : 'Nada com esse nome ou grupo.'}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Exercícios do Armário">
          {visible.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setSheet({ exercise: r })}
                className="w-full min-h-[56px] flex items-center gap-2 pl-3.5 pr-2 rounded-[14px] text-left"
                style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)' }}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-extrabold truncate" style={{ color: 'var(--text-1)' }}>{r.name}</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text-4)' }}>{[r.category, exerciseSubline(r)].filter(Boolean).join(' · ')}</span>
                  {r.machine_settings && (
                    <span className="block text-[12px] truncate" style={{ color: 'var(--text-3)' }}>Afinação: {r.machine_settings}</span>
                  )}
                </span>
                <ChevronRight size={18} style={{ color: 'var(--text-4)' }} className="shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {sheet && <ExerciseSheet exercise={sheet.exercise} onClose={() => setSheet(null)} />}
    </div>
  );
}
