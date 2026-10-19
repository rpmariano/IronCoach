import React, { useState } from 'react';
import { X, Trash2, Check } from 'lucide-react';
import AddButton from '../AddButton';
import Chip from '../Chip';
import ExerciseLockerPicker from './ExerciseLockerPicker';
import { isMeasurableGoal } from '@formulas/goalCheck.ts';
import {
  cardioFieldsOf, describeLast, distanceUnitOf, exerciseType, hasUnconfirmedPlanSets, lockerEntryFor, markAllDone,
  newExercise, newSet, nudgeSet, renameExercise, setSuggestion, toggleSetDone,
} from '../../../utils/gymSets';

/* Os exercícios de uma sessão de ginásio — registo unificado, F1
   (specs/plano-registo-plano-coach.md). Serve a criação e a edição:
   · por exercício, um OBJETIVO (decisão 1) e o tipo, força ou cardio;
   · força: séries de reps × kg, com o ✓ do modo Live — confirma a série e,
     vazia, preenche-a com a sugestão (o alvo do plano, a série anterior ou a
     última vez, do Armário); por baixo da série ativa, o ajuste rápido
     ±2,5 kg / ±1 rep;
   · do plano, as séries vêm só como sugestão: contam quando confirmadas (✓,
     "Marcar todas") ou escritas — nunca sozinhas (revisão pré-deploy de
     2026-10-18);
   · cardio: tempo, distância e voltas consoante o exercício (decisão 4);
   · "+ Do Armário": a pesquisa no catálogo pessoal (decisão 7).
   O estado vive em quem o usa: `exercises` + `onChange(next)`. */

const inputCls = 'min-h-[44px] bg-[var(--surface-glass)] border border-[var(--border-glass)] rounded-lg px-2 text-sm text-white outline-none focus:border-[var(--mod-ginasio-to)] placeholder-[var(--text-muted)]';
const quietBtn = 'tap-44 text-[var(--text-3)] hover:text-[var(--danger)] shrink-0';

const label = (ex) => (ex.name || '').trim() || 'exercício';

/* O ✓: feito = círculo cheio na cor do módulo com o ícone escuro; por fazer =
   só o contorno. A diferença é de forma e de cor, não só de tinta (WCAG
   1.4.11). O rótulo é fixo e o estado vai em aria-pressed — um rótulo que
   mudasse com o estado era lido duas vezes, ao contrário. */
function DoneToggle({ done, onToggle, ariaLabel }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={!!done} aria-label={ariaLabel} className="tap-44 shrink-0">
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors"
        style={done
          ? { background: 'var(--mod-ginasio-to)', borderColor: 'var(--mod-ginasio-to)', color: 'var(--bg-app)' }
          : { background: 'transparent', borderColor: 'var(--border-glass-strong)', color: 'var(--text-3)' }}
      >
        <Check size={15} strokeWidth={3} />
      </span>
    </button>
  );
}

function StrengthSets({ ex, last, onExercise }) {
  const activeIdx = ex.sets.findIndex(s => !s.done);
  const patchSet = (key, patch) => onExercise({ ...ex, sets: ex.sets.map(s => (s.key === key ? { ...s, ...patch } : s)) });
  const name = label(ex);
  return (
    <div className="space-y-1.5">
      {ex.sets.map((s, idx) => {
        const sug = setSuggestion(ex, idx, last);
        return (
          <div key={s.key}>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[var(--text-3)] w-11 shrink-0">Série {idx + 1}</span>
              <input
                type="number"
                inputMode="numeric"
                aria-label={`Repetições da série ${idx + 1} — ${name}`}
                value={s.reps}
                onChange={e => patchSet(s.key, { reps: e.target.value })}
                placeholder={sug?.reps !== '' && sug?.reps != null ? String(sug.reps) : 'Reps'}
                className={`${inputCls} w-14`}
              />
              <span className="text-[11px] text-[var(--text-3)]" aria-hidden="true">×</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                aria-label={`Peso da série ${idx + 1} (kg) — ${name}`}
                value={s.weight}
                onChange={e => patchSet(s.key, { weight: e.target.value })}
                placeholder={sug?.weight !== '' && sug?.weight != null ? String(sug.weight) : 'kg'}
                className={`${inputCls} w-14`}
              />
              <DoneToggle
                done={s.done}
                onToggle={() => onExercise(toggleSetDone(ex, s.key, last))}
                ariaLabel={`Série ${idx + 1} de ${name} feita`}
              />
              <button
                type="button"
                onClick={() => onExercise({ ...ex, sets: ex.sets.filter(x => x.key !== s.key) })}
                aria-label={`Remover série ${idx + 1} de ${name}`}
                className={quietBtn}
              >
                <X size={13} />
              </button>
            </div>
            {idx === activeIdx && (
              <div className="flex gap-1 mt-1 ml-11" role="group" aria-label={`Ajuste rápido da série ${idx + 1} de ${name}`}>
                {[['weight', -2.5, '−2,5 kg'], ['weight', 2.5, '+2,5 kg'], ['reps', -1, '−1 rep'], ['reps', 1, '+1 rep']].map(([f, d, text]) => (
                  <button
                    key={text}
                    type="button"
                    onClick={() => onExercise(nudgeSet(ex, s.key, f, d, last))}
                    className="tap-h-44 px-2 rounded-full text-[11px] font-medium border border-[var(--border-glass)] text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <AddButton onClick={() => onExercise({ ...ex, sets: [...ex.sets, newSet()] })} type="button" variant="gym">
        Série
      </AddButton>
    </div>
  );
}

const CARDIO_LABEL = { duration: 'Tempo (min)', laps: 'Voltas' };

function CardioRow({ ex, onExercise }) {
  const fields = cardioFieldsOf(ex);
  const unit = distanceUnitOf(ex);
  const s = ex.sets[0] || newSet();
  const patch = (p) => onExercise({ ...ex, sets: [{ ...s, ...p }, ...ex.sets.slice(1)] });
  const keyOf = { duration: 'durationMin', distance: 'distance', laps: 'laps' };
  const missing = ['distance', 'laps'].filter(f => !fields.includes(f));
  const exWithRow = ex.sets.length ? ex : { ...ex, sets: [s] };
  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        {fields.map(f => {
          const text = f === 'distance' ? (unit === 'm' ? 'Distância (m)' : 'Distância (km)') : CARDIO_LABEL[f];
          const target = s.plan?.[keyOf[f]];
          return (
            <label key={f} className="flex flex-col gap-1 text-[11px] text-[var(--text-3)]">
              {text}
              <input
                type="number"
                inputMode="decimal"
                aria-label={`${text} — ${label(ex)}`}
                value={s[keyOf[f]]}
                onChange={e => patch({ [keyOf[f]]: e.target.value })}
                placeholder={target ? String(target) : ''}
                className={`${inputCls} w-24`}
              />
            </label>
          );
        })}
        <DoneToggle
          done={s.done}
          onToggle={() => onExercise(toggleSetDone(exWithRow, s.key, null))}
          ariaLabel={`${label(ex)} feito`}
        />
      </div>
      {missing.length > 0 && (
        <div className="flex gap-1.5 mt-1.5">
          {missing.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => onExercise({ ...ex, fields: [...fields, f] })}
              className="tap-h-44 px-2.5 rounded-full text-[11px] font-medium border border-dashed border-[var(--border-glass-strong)] text-[var(--text-3)]"
            >
              + {f === 'distance' ? (unit === 'm' ? 'metros' : 'km') : 'voltas'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExerciseEditor({ exercises, onChange, locker = null, lockerRows = [], onOpenLocker }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const replace = (key, next) => onChange(exercises.map(e => (e.key === key ? next : e)));
  const remove = (key) => onChange(exercises.filter(e => e.key !== key));
  const anyUnconfirmed = exercises.some(hasUnconfirmedPlanSets);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <span className="text-[11px] text-[var(--text-3)]">Exercícios e séries</span>
        <div className="flex gap-1.5">
          <AddButton
            onClick={() => { setPickerOpen(o => !o); if (!pickerOpen && onOpenLocker) onOpenLocker(); }}
            type="button"
            variant="gym"
            aria-expanded={pickerOpen}
          >
            Do Armário
          </AddButton>
          <AddButton onClick={() => onChange([...exercises, newExercise({ type: 'forca' })])} type="button" variant="gym">
            Adicionar exercício
          </AddButton>
        </div>
      </div>

      {anyUnconfirmed && (
        <p className="text-[11px] text-[var(--text-2)] mb-2">
          Os números do plano são sugestão: toca ✓ em cada série que fizeres (ou "Marcar todas"). As que ficarem por confirmar não contam.
        </p>
      )}

      {pickerOpen && (
        <ExerciseLockerPicker
          rows={lockerRows}
          onPick={(ex) => { onChange([...exercises, ex]); }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {exercises.length === 0 ? (
        <p className="text-[11px] text-[var(--text-3)]">Sem exercícios ainda.</p>
      ) : (
        <div className="space-y-2">
          {exercises.map(ex => {
            const type = exerciseType(ex);
            const last = lockerEntryFor(locker, ex.name);
            const lastText = describeLast(last);
            return (
              <div key={ex.key} className="bg-[var(--surface-glass)] border border-[var(--border-glass)] text-white rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="text"
                    aria-label="Nome do exercício"
                    value={ex.name}
                    onChange={e => replace(ex.key, renameExercise(ex, e.target.value))}
                    placeholder="Nome do exercício"
                    className="flex-1 min-w-0 min-h-[44px] text-sm font-bold text-white outline-none bg-transparent border-b border-[var(--border-glass)] focus:border-[var(--border-control)]"
                  />
                  <button onClick={() => remove(ex.key)} type="button" aria-label={`Remover exercício ${label(ex)}`} className={quietBtn}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 mb-2 flex-wrap" role="group" aria-label={`Tipo de exercício — ${label(ex)}`}>
                  {[['forca', 'Força'], ['cardio', 'Cardio']].map(([k, text]) => (
                    <Chip
                      key={k}
                      active={type === k}
                      aria-pressed={type === k}
                      variant="gym"
                      type="button"
                      onClick={() => type !== k && replace(ex.key, { ...ex, type: k, sets: [newSet()] })}
                    >
                      {text}
                    </Chip>
                  ))}
                  {hasUnconfirmedPlanSets(ex) && (
                    <button
                      type="button"
                      onClick={() => replace(ex.key, markAllDone(ex, last))}
                      className="tap-h-44 px-2.5 rounded-full text-[11px] font-bold border"
                      style={{ borderColor: 'color-mix(in srgb, var(--mod-ginasio-to) 55%, transparent)', color: 'var(--mod-ginasio-to)' }}
                      aria-label={`Marcar todas as séries de ${label(ex)} como feitas`}
                    >
                      Marcar todas
                    </button>
                  )}
                  {lastText && type === 'forca' && (
                    <span className="text-[11px] text-[var(--text-3)] ml-auto">da última vez: {lastText}</span>
                  )}
                </div>
                {type === 'forca' && (
                  <input
                    type="text"
                    aria-label={`Afinação da máquina — ${label(ex)}`}
                    // Mostra a do Armário até ele escrever outra (decisão 10): aparece da próxima vez.
                    value={ex.machineSettings ?? last?.machine_settings ?? ''}
                    maxLength={120}
                    onChange={e => replace(ex.key, { ...ex, machineSettings: e.target.value })}
                    placeholder="Afinação (opcional) — ex.: banco furo 3, pino 6"
                    className="w-full min-h-[44px] mb-2 bg-transparent border-b border-[var(--border-glass)] text-[12px] text-white outline-none focus:border-[var(--mod-ginasio-to)] placeholder-[var(--text-muted)]"
                  />
                )}
                <input
                  type="text"
                  aria-label={`Objetivo — ${label(ex)}`}
                  value={ex.goal || ''}
                  maxLength={200}
                  onChange={e => replace(ex.key, { ...ex, goal: e.target.value })}
                  placeholder="Objetivo (opcional) — ex.: descida controlada em 3 s"
                  className="w-full min-h-[44px] mb-2 bg-transparent border-b border-[var(--border-glass)] text-[12px] text-white outline-none focus:border-[var(--mod-ginasio-to)] placeholder-[var(--text-muted)]"
                />
                {/* Decisão 9: o objetivo mensurável a Carol confere pelos números;
                    o qualitativo ("descida em 3 s") confirma-o ele, com um toque. */}
                {(ex.goal || '').trim() && !isMeasurableGoal(ex.goal) && (
                  <div role="group" aria-label={`Objetivo cumprido? — ${label(ex)}`} className="flex items-center gap-2 mb-2">
                    <span className="flex-1 min-w-0 text-[12px] text-[var(--text-2)]">Cumpriste o objetivo?</span>
                    {[[true, 'Sim'], [false, 'Não']].map(([value, text]) => (
                      <button
                        key={text}
                        type="button"
                        aria-pressed={ex.goalMet === value}
                        onClick={() => replace(ex.key, { ...ex, goalMet: ex.goalMet === value ? null : value })}
                        className="min-h-[44px] min-w-[56px] px-3 rounded-xl border text-[12px] font-bold transition active:scale-[0.99]"
                        style={ex.goalMet === value
                          ? { borderColor: 'var(--mod-ginasio-to)', color: 'var(--mod-ginasio-to)', background: 'color-mix(in srgb, var(--mod-ginasio-to) 14%, transparent)' }
                          : { borderColor: 'var(--border-glass)', color: 'var(--text-3)' }}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                )}
                {type === 'cardio'
                  ? <CardioRow ex={ex} onExercise={(next) => replace(ex.key, next)} />
                  : <StrengthSets ex={ex} last={last} onExercise={(next) => replace(ex.key, next)} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
