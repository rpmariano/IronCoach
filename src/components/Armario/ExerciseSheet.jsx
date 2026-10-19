import React, { useState } from 'react';
import PremiumModal from '../shared/PremiumModal';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import { MAX_MACHINE_SETTINGS, MUSCLE_GROUPS, deleteExercise, exerciseSubline, saveExercise } from '../../utils/exerciseLocker';

/* Um exercício do Armário (decisões 10 e 14 de specs/plano-registo-plano-coach.md):
   ajustar o nome, o grupo muscular e a afinação da máquina ("banco furo 3,
   pino 6"), ou juntar um à mão. Os números da última vez e o recorde vêm
   dos registos — não se editam aqui. */
export default function ExerciseSheet({ exercise = null, onClose }) {
  const { profile, session, loadExerciseLocker } = useAppStore();
  const { showToast } = useToast();
  const [name, setName] = useState(exercise?.name ?? '');
  const [category, setCategory] = useState(exercise?.category ?? 'Outro');
  const [blockType, setBlockType] = useState(exercise?.block_type === 'cardio' ? 'cardio' : 'forca');
  const [settings, setSettings] = useState(exercise?.machine_settings ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const field = { border: '1px solid var(--border-glass)', background: 'var(--surface-soft)', color: 'var(--text-1)' };

  const run = async (fn, done) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await loadExerciseLocker?.();
      showToast?.(done);
      onClose();
    } catch (e) {
      setError(e?.message || 'Não consegui guardar.');
      setBusy(false);
    }
  };

  const save = () => run(
    () => saveExercise({
      userId: session?.user?.id || profile?.id,
      values: { name, category, block_type: blockType, machine_settings: settings },
      existing: exercise,
    }),
    exercise ? 'Exercício atualizado' : 'Exercício guardado',
  );
  const remove = () => run(() => deleteExercise(exercise.id), 'Exercício tirado do Armário');

  const sub = exercise ? exerciseSubline(exercise) : '';

  return (
    <PremiumModal isOpen onClose={onClose} title={exercise ? exercise.name : 'Novo exercício'} subtitle={sub || 'O que fazes, e como afinas a máquina'} theme="gym" variant="bottom-sheet" maxWidth="max-w-md">
      <div className="px-5 py-4 space-y-3" data-testid="exercise-sheet">
        <label className="block" htmlFor="exercise-name">
          <span className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>Nome</span>
          <input id="exercise-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
            className="w-full min-h-[46px] rounded-xl px-3 text-[15px] font-bold outline-none" style={field} />
        </label>

        <div>
          <span id="exercise-type" className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>Tipo</span>
          <div role="group" aria-labelledby="exercise-type" className="flex gap-1.5">
            {[['forca', 'Força'], ['cardio', 'Cardio']].map(([k, label]) => (
              <button key={k} type="button" aria-pressed={blockType === k} onClick={() => setBlockType(k)}
                className="min-h-[44px] px-4 rounded-full text-[12.5px] font-bold"
                style={blockType === k
                  ? { background: 'color-mix(in srgb, var(--mod-ginasio-to) 18%, transparent)', border: '1px solid var(--mod-ginasio-to)', color: 'var(--text-1)' }
                  : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.16)', color: 'var(--text-2)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span id="exercise-group" className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>Grupo muscular</span>
          <div role="group" aria-labelledby="exercise-group" className="flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.map((g) => (
              <button key={g} type="button" aria-pressed={category === g} onClick={() => setCategory(g)}
                className="min-h-[44px] px-3 rounded-full text-[12px] font-bold"
                style={category === g
                  ? { background: 'color-mix(in srgb, var(--mod-ginasio-to) 18%, transparent)', border: '1px solid var(--mod-ginasio-to)', color: 'var(--text-1)' }
                  : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.16)', color: 'var(--text-2)' }}>
                {g}
              </button>
            ))}
          </div>
        </div>

        <label className="block" htmlFor="exercise-settings">
          <span className="block text-[11px] mb-1.5" style={{ color: 'var(--text-3)' }}>Afinação da máquina (opcional) — ex.: banco furo 3, pino 6</span>
          <input id="exercise-settings" value={settings} maxLength={MAX_MACHINE_SETTINGS} onChange={(e) => setSettings(e.target.value)}
            className="w-full min-h-[46px] rounded-xl px-3 text-sm outline-none" style={field} />
        </label>
        <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>Aparece da próxima vez que registares este exercício.</p>

        {error && <p role="alert" className="text-[12.5px] font-medium" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="flex flex-col gap-2 pt-1">
          <button type="button" onClick={save} disabled={busy}
            className="min-h-[48px] rounded-xl text-[14px] font-extrabold disabled:opacity-60"
            style={{ background: 'var(--mod-ginasio-to)', color: 'var(--bg-app)' }}>
            {exercise ? 'Guardar' : 'Juntar ao Armário'}
          </button>
          {exercise && !confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy}
              className="min-h-[44px] rounded-xl text-[13px] font-semibold" style={{ color: 'var(--danger)' }}>
              Tirar do Armário
            </button>
          )}
          {exercise && confirmDelete && (
            <div role="alertdialog" aria-label="Tirar o exercício do Armário" className="rounded-xl p-3 space-y-2" style={{ border: '1px solid var(--danger)' }}>
              <p className="text-[12.5px]" style={{ color: 'var(--text-2)' }}>Os treinos já registados ficam como estão; só sai da lista e da última carga.</p>
              <div className="flex gap-2">
                <button type="button" onClick={remove} disabled={busy} className="flex-1 min-h-[44px] rounded-xl text-[13px] font-bold" style={{ background: 'var(--danger)', color: '#fff' }}>Tirar</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 min-h-[44px] rounded-xl text-[13px] font-semibold" style={{ border: '1px solid var(--border-glass-strong)', color: 'var(--text-2)' }}>Manter</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PremiumModal>
  );
}
