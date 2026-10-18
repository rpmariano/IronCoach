import React from 'react';
import { X, Trash2 } from 'lucide-react';
import AddButton from '../AddButton';

/* Os exercícios e as séries de uma sessão de ginásio: nome, reps e kg por
   série. Só apresentação — o estado (`exercises`) e as operações vivem em
   quem o usa, que também decide o que é "sujo" via `onDirty`. Extraído de
   Gym/GymRegistration.jsx (registo unificado, F1-pré) sem mudar o
   comportamento nem o aspeto. */
export default function ExerciseEditor({ exercises, onAddExercise, onRemoveExercise, onUpdateExercise, onAddSet, onRemoveSet, onUpdateSet, onDirty }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] text-[var(--text-3)]">Exercícios e séries</label>
        <AddButton
          onClick={onAddExercise}
          type="button"
          variant="gym"
        >
          Adicionar exercício
        </AddButton>
      </div>
      {exercises.length === 0 ? (
        <p className="text-[11px] text-[var(--text-3)]">Sem exercícios ainda.</p>
      ) : (
        <div className="space-y-2">
          {exercises.map(ex => (
            <div key={ex.key} className="bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  aria-label="Nome do exercício"
                  value={ex.name}
                  onChange={e => { onUpdateExercise(ex.key, { name: e.target.value }); onDirty(); }}
                  placeholder="Nome do exercício"
                  className="flex-1 text-xs font-bold text-white outline-none bg-transparent border-b border-[var(--border-glass)] focus:border-[var(--border-control)] pb-1"
                />
                <button onClick={() => onRemoveExercise(ex.key)} type="button" aria-label="Remover exercicio" className="tap-44 text-[var(--text-3)] hover:text-[var(--danger)] shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="space-y-1.5">
                {ex.sets.map((s, idx) => (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-3)] w-14 shrink-0">Série {idx + 1}</span>
                    <input
                      type="number"
                      aria-label={`Repetições da série ${idx + 1}`}
                      value={s.reps}
                      onChange={e => { onUpdateSet(ex.key, s.key, { reps: e.target.value }); onDirty(); }}
                      placeholder="Reps"
                      className="w-16 bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[var(--mod-ginasio-to)]"
                    />
                    <input
                      type="number"
                      step="0.5"
                      aria-label={`Peso da série ${idx + 1} (kg)`}
                      value={s.weight}
                      onChange={e => { onUpdateSet(ex.key, s.key, { weight: e.target.value }); onDirty(); }}
                      placeholder="kg"
                      className="w-16 bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-[var(--mod-ginasio-to)]"
                    />
                    <button onClick={() => onRemoveSet(ex.key, s.key)} type="button" aria-label={`Remover serie ${idx + 1}`} className="tap-44 text-[var(--text-3)] hover:text-[var(--danger)] shrink-0">
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <AddButton
                  onClick={() => onAddSet(ex.key)}
                  type="button"
                  variant="gym"
                >
                  Série
                </AddButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
