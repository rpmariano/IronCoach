import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, Check, BookOpen, Plus, ChevronDown, Minus } from 'lucide-react';
import AddButton from '../AddButton';
import Chip from '../Chip';
import ExerciseLockerPicker from './ExerciseLockerPicker';
import { Field, FieldInput, FieldTextarea, FieldBlock, keepVisible } from './Field';
import { isMeasurableGoal } from '@formulas/goalCheck.ts';
import {
  cardioFieldsOf, describeLast, distanceUnitOf, exerciseType, hasUnconfirmedPlanSets, lockerEntryFor, markAllDone,
  newExercise, newSet, nudgeSet, renameExercise, setSuggestion, toggleSetDone,
} from '../../../utils/gymSets';

/* Os exercícios de uma sessão de ginásio — registo unificado, F1
   (specs/plano-registo-plano-coach.md). Serve a criação e a edição:
   · cada exercício é um BLOCO colapsado: o nome em destaque e, na mesma linha, o resumo
     (séries × reps × peso, ou o cardio); tocar abre o detalhe (bug #91, 2026-10-27). Um exercício
     acabado de adicionar abre-se sozinho, com o foco no nome (#92);
   · por exercício, um OBJETIVO (decisão 1) e o tipo, força ou cardio — em caixas de texto com
     etiqueta, como as da Nutrição (Field.jsx, #93);
   · força: séries de reps × kg, com − / + (reps de 1 em 1, peso de 2,5 em 2,5 kg — o salto das
     anilhas) e o campo para escrever; o ✓ do modo Live confirma a série e, vazia, preenche-a com a
     sugestão (o alvo do plano, a série anterior ou a última vez, do Armário);
   · do plano, as séries vêm só como sugestão: contam quando confirmadas (✓,
     "Marcar todas") ou escritas — nunca sozinhas (revisão pré-deploy de
     2026-10-18);
   · cardio: tempo, distância e voltas consoante o exercício (decisão 4);
   · "+ Do Armário": a pesquisa no catálogo pessoal (decisão 7).
   O estado vive em quem o usa: `exercises` + `onChange(next)`. */

const quietBtn = 'tap-44 text-[var(--text-3)] hover:text-[var(--danger)] shrink-0';

/** O passo do peso: 2,5 kg (a menor anilha comum). As reps andam de 1 em 1. */
export const WEIGHT_STEP = 2.5;
export const REPS_STEP = 1;

const label = (ex) => (ex.name || '').trim() || 'exercício';
const numOr = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fmtNum = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** O resumo da linha colapsada: «3 × 12 × 40 kg» (valores escritos, ou o alvo do plano);
 *  séries com valores diferentes dão o intervalo; cardio dá «20 min · 2 km». '' sem nada. */
export function exerciseSummary(ex) {
  if (exerciseType(ex) === 'cardio') {
    const s = ex.sets[0];
    if (!s) return '';
    const unit = distanceUnitOf(ex);
    const dur = numOr(s.durationMin) ?? numOr(s.plan?.durationMin);
    const dist = numOr(s.distance) ?? numOr(s.plan?.distance);
    const laps = numOr(s.laps) ?? numOr(s.plan?.laps);
    return [dur ? `${fmtNum(dur)} min` : null, dist ? `${fmtNum(dist)} ${unit === 'm' ? 'm' : 'km'}` : null, laps ? `${fmtNum(laps)} voltas` : null].filter(Boolean).join(' · ');
  }
  const range = (vals) => {
    const v = vals.filter((x) => x != null);
    if (!v.length) return null;
    const min = Math.min(...v); const max = Math.max(...v);
    return min === max ? fmtNum(min) : `${fmtNum(min)}–${fmtNum(max)}`;
  };
  const reps = range(ex.sets.map((s) => numOr(s.reps) ?? numOr(s.plan?.reps)));
  const kg = range(ex.sets.map((s) => numOr(s.weight) ?? numOr(s.plan?.weight)));
  const n = ex.sets.length;
  return [n ? `${n} ${n === 1 ? 'série' : 'séries'}` : null, reps ? `${reps} reps` : null, kg ? `${kg} kg` : null].filter(Boolean).join(' × ');
}

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

/* − [valor] + : o valor continua a escrever-se; os botões (44 px) mexem-lhe a partir do que lá está
   ou da sugestão (nudgeSet). */
function Stepper({ text, inputLabel, value, placeholder, step, inputMode, onType, onNudge, minusLabel, plusLabel }) {
  const btn = 'tap-44 shrink-0 rounded-xl border flex items-center justify-center active:scale-95 transition';
  const btnStyle = { background: 'color-mix(in srgb, var(--mod-ginasio-to) 14%, transparent)', borderColor: 'color-mix(in srgb, var(--mod-ginasio-to) 45%, transparent)', color: 'var(--text-1)' };
  return (
    <div className="min-w-0">
      <span className="text-[11px] text-[var(--text-3)] mb-1 block px-0.5">{text}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onNudge(-step)} aria-label={minusLabel} className={btn} style={btnStyle}><Minus size={16} aria-hidden="true" /></button>
        <FieldInput
          type="number"
          inputMode={inputMode}
          step={inputMode === 'decimal' ? '0.5' : undefined}
          aria-label={inputLabel}
          value={value}
          onChange={(e) => onType(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 px-1! text-center"
        />
        <button type="button" onClick={() => onNudge(step)} aria-label={plusLabel} className={btn} style={btnStyle}><Plus size={16} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function StrengthSets({ ex, last, onExercise }) {
  const patchSet = (key, patch) => onExercise({ ...ex, sets: ex.sets.map(s => (s.key === key ? { ...s, ...patch } : s)) });
  const name = label(ex);
  return (
    <div className="space-y-2">
      {ex.sets.map((s, idx) => {
        const sug = setSuggestion(ex, idx, last);
        const ph = (v, fallback) => (v !== '' && v != null ? String(v) : fallback);
        return (
          <FieldBlock key={s.key} className="p-2.5!">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-bold text-[var(--text-2)]">Série {idx + 1}</span>
              <div className="flex items-center">
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
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stepper
                text="Repetições"
                inputLabel={`Repetições da série ${idx + 1} — ${name}`}
                value={s.reps}
                placeholder={ph(sug?.reps, 'Reps')}
                step={REPS_STEP}
                inputMode="numeric"
                onType={(v) => patchSet(s.key, { reps: v })}
                onNudge={(d) => onExercise(nudgeSet(ex, s.key, 'reps', d, last))}
                minusLabel={`Menos 1 repetição da série ${idx + 1} — ${name}`}
                plusLabel={`Mais 1 repetição da série ${idx + 1} — ${name}`}
              />
              <Stepper
                text="Peso (kg)"
                inputLabel={`Peso da série ${idx + 1} (kg) — ${name}`}
                value={s.weight}
                placeholder={ph(sug?.weight, 'kg')}
                step={WEIGHT_STEP}
                inputMode="decimal"
                onType={(v) => patchSet(s.key, { weight: v })}
                onNudge={(d) => onExercise(nudgeSet(ex, s.key, 'weight', d, last))}
                minusLabel={`Menos 2,5 kg da série ${idx + 1} — ${name}`}
                plusLabel={`Mais 2,5 kg da série ${idx + 1} — ${name}`}
              />
            </div>
          </FieldBlock>
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
              <FieldInput
                type="number"
                inputMode="decimal"
                aria-label={`${text} — ${label(ex)}`}
                value={s[keyOf[f]]}
                onChange={e => patch({ [keyOf[f]]: e.target.value })}
                placeholder={target ? String(target) : ''}
                className="w-24!"
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
  // Os exercícios abertos (por key). Por omissão tudo colapsado; um exercício novo abre-se.
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [focusKey, setFocusKey] = useState(null);
  const nameRefs = useRef(new Map());
  const replace = (key, next) => onChange(exercises.map(e => (e.key === key ? next : e)));
  const remove = (key) => onChange(exercises.filter(e => e.key !== key));
  const anyUnconfirmed = exercises.some(hasUnconfirmedPlanSets);
  const toggleOpen = (key) => setOpenKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  /* #92: o exercício acabado de adicionar abre-se e o foco vai para o NOME dele (não para o do
     topo da lista, nem para nenhum outro), com o campo à vista por cima do teclado. */
  useEffect(() => {
    if (!focusKey) return;
    const el = nameRefs.current.get(focusKey);
    if (el) {
      el.focus({ preventScroll: true });
      keepVisible(el, { delay: 0 });
    }
    setFocusKey(null);
  }, [focusKey, openKeys]);

  const addNew = () => {
    const ex = newExercise({ type: 'forca' });
    setOpenKeys((prev) => new Set(prev).add(ex.key));
    setFocusKey(ex.key);
    onChange([ex, ...exercises]);
  };

  return (
    <div className="mb-4">
      <span className="block text-[11px] text-[var(--text-3)] mb-1.5">Exercícios e séries</span>
      {/* Bug #71 (2026-10-19): as duas ações com destaque — antes eram texto
          pequeno no canto. "Armário" não dizia nada aqui: Biblioteca. */}
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <button
          onClick={() => { setPickerOpen(o => !o); if (!pickerOpen && onOpenLocker) onOpenLocker(); }}
          type="button"
          aria-expanded={pickerOpen}
          className="min-h-[48px] rounded-xl border text-[13px] font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition"
          style={{
            background: pickerOpen ? 'color-mix(in srgb, var(--mod-ginasio-to) 22%, transparent)' : 'color-mix(in srgb, var(--mod-ginasio-to) 12%, transparent)',
            borderColor: 'color-mix(in srgb, var(--mod-ginasio-to) 55%, transparent)',
            color: 'var(--text-1)',
          }}
        >
          <BookOpen size={16} aria-hidden="true" /> Da biblioteca
        </button>
        <button
          onClick={addNew}
          type="button"
          className="min-h-[48px] rounded-xl text-[13px] font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition"
          style={{ background: 'var(--mod-ginasio-to)', color: 'var(--gym-ink, #0b2129)' }}
        >
          <Plus size={16} aria-hidden="true" /> Adicionar exercício
        </button>
      </div>

      {anyUnconfirmed && (
        <p className="text-[11px] text-[var(--text-2)] mb-2">
          Os números do plano são sugestão: toca ✓ em cada série que fizeres (ou "Marcar todas"). As que ficarem por confirmar não contam.
        </p>
      )}

      {pickerOpen && (
        <ExerciseLockerPicker
          rows={lockerRows}
          onPick={(ex) => { onChange([ex, ...exercises]); }}
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
            const isOpen = openKeys.has(ex.key);
            const panelId = `ex-detalhe-${ex.key}`;
            const resumo = exerciseSummary(ex);
            const feitas = ex.sets.filter((s) => s.done).length;
            return (
              <FieldBlock key={ex.key} className="p-0! overflow-hidden" data-testid="exercicio-bloco" data-open={isOpen ? 'true' : 'false'}>
                {/* A linha colapsada: o nome em destaque e o resumo; tocar abre/fecha. */}
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-label={`${isOpen ? 'Fechar' : 'Abrir'} ${label(ex)}`}
                    onClick={() => toggleOpen(ex.key)}
                    className="flex-1 min-w-0 min-h-[56px] flex items-center gap-2 pl-3 pr-1 text-left"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-extrabold text-[var(--text-1)] break-words">{(ex.name || '').trim() || 'Novo exercício'}</span>
                      {(resumo || feitas > 0) && (
                        <span data-testid="exercicio-resumo" className="block text-[12px] text-[var(--text-3)] break-words">
                          {resumo}{feitas > 0 ? `${resumo ? ' · ' : ''}${feitas}/${ex.sets.length} feitas` : ''}
                        </span>
                      )}
                    </span>
                    <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-[var(--text-4)] transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                  </button>
                  <button onClick={() => remove(ex.key)} type="button" aria-label={`Remover exercício ${label(ex)}`} className={quietBtn}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* O detalhe fica no DOM (escondido quando fechado): o que se escreveu não se perde. */}
                <div id={panelId} hidden={!isOpen} className="px-3 pb-3 pt-1 space-y-3">
                  <Field label="Nome do exercício">
                    {(id) => (
                      <FieldInput
                        id={id}
                        type="text"
                        ref={(el) => { if (el) nameRefs.current.set(ex.key, el); else nameRefs.current.delete(ex.key); }}
                        aria-label="Nome do exercício"
                        value={ex.name}
                        onChange={e => replace(ex.key, renameExercise(ex, e.target.value))}
                        placeholder="Nome do exercício"
                        className="font-bold"
                      />
                    )}
                  </Field>
                  <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={`Tipo de exercício — ${label(ex)}`}>
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
                      <span className="text-[11px] text-[var(--text-3)] ml-auto break-words">da última vez: {lastText}</span>
                    )}
                  </div>
                  {type === 'forca' && (
                    <Field label="Afinação da máquina (opcional)">
                      {(id) => (
                        <FieldTextarea
                          id={id}
                          aria-label={`Afinação da máquina — ${label(ex)}`}
                          // Mostra a do Armário até ele escrever outra (decisão 10): aparece da próxima vez.
                          value={ex.machineSettings ?? last?.machine_settings ?? ''}
                          maxLength={120}
                          onChange={e => replace(ex.key, { ...ex, machineSettings: e.target.value })}
                          placeholder="ex.: banco furo 3, pino 6"
                        />
                      )}
                    </Field>
                  )}
                  <Field label="Objetivo (opcional)">
                    {(id) => (
                      <FieldTextarea
                        id={id}
                        aria-label={`Objetivo — ${label(ex)}`}
                        value={ex.goal || ''}
                        maxLength={200}
                        onChange={e => replace(ex.key, { ...ex, goal: e.target.value })}
                        placeholder="ex.: descida controlada em 3 s"
                      />
                    )}
                  </Field>
                  {/* Decisão 9: o objetivo mensurável a Carol confere pelos números;
                      o qualitativo ("descida em 3 s") confirma-o ele, com um toque. */}
                  {(ex.goal || '').trim() && !isMeasurableGoal(ex.goal) && (
                    <div role="group" aria-label={`Objetivo cumprido? — ${label(ex)}`} className="flex items-center gap-2">
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
                          {ex.goalMet === value && <Check size={13} className="inline mr-1 -mt-0.5" aria-hidden="true" />}{text}
                        </button>
                      ))}
                    </div>
                  )}
                  {type === 'cardio'
                    ? <CardioRow ex={ex} onExercise={(next) => replace(ex.key, next)} />
                    : <StrengthSets ex={ex} last={last} onExercise={(next) => replace(ex.key, next)} />}
                </div>
              </FieldBlock>
            );
          })}
        </div>
      )}
    </div>
  );
}
