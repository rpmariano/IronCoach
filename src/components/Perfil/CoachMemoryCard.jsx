import React, { useEffect, useState } from 'react';
import { Brain, Plus, Trash2, Pencil, Check, X, Loader2, MessageSquare } from 'lucide-react';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import Button from '../shared/Button';

/* Memória de longo prazo partilhada com a Carol (tabela coach_notes).

   Porque existe: o histórico que vai ao modelo são só as últimas mensagens.
   Um facto dito há semanas ("tenho epicondilite") cai fora dessa janela e a
   Carol volta a propor o que já sabia estar errado. Estas notas são o oposto
   — poucas, curadas, sempre presentes no prompt.

   Porque é editável: a Carol regista o que percebe da conversa, e pode
   perceber mal ou registar algo que deixou de ser verdade. Sem o atleta poder
   corrigir, um engano dela ficaria a enviesar todas as propostas seguintes
   sem ninguém saber porquê. Ver specs — mesma lógica das metas escritas pelo
   Coach, que também exigem confirmação do atleta. */

export const NOTE_CATEGORIES = [
  { key: 'preferencia_alimentar', label: 'Alimentação',   hint: 'Ex.: prefiro refeições vegetarianas' },
  { key: 'limitacao_fisica',      label: 'Limitação',     hint: 'Ex.: epicondilite no cotovelo direito' },
  { key: 'disponibilidade',       label: 'Disponibilidade', hint: 'Ex.: não treino às segundas' },
  { key: 'objetivo_pessoal',      label: 'Objetivo',      hint: 'Ex.: quero acabar a meia maratona a correr' },
  { key: 'preferencia_treino',    label: 'Treino',        hint: 'Ex.: prefiro correr ao ar livre' },
  { key: 'contexto_vida',         label: 'Contexto',      hint: 'Ex.: trabalho por turnos' },
  { key: 'outro',                 label: 'Outro',         hint: '' },
];

const MAX_NOTE_LEN = 500;

function categoryLabel(key) {
  return NOTE_CATEGORIES.find(c => c.key === key)?.label || key;
}

export default function CoachMemoryCard() {
  const { coachNotes, reloadCoachNotes, addCoachNote, updateCoachNote, deleteCoachNote,
          setCoachIntent, setActiveTab } = useAppStore();
  const { showToast } = useToast();

  const [adding, setAdding] = useState(false);
  const [draftNote, setDraftNote] = useState('');
  const [draftCat, setDraftCat] = useState('preferencia_alimentar');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { reloadCoachNotes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const notes = coachNotes || [];

  const resetAdd = () => { setAdding(false); setDraftNote(''); setDraftCat('preferencia_alimentar'); };

  const handleAdd = async () => {
    const text = draftNote.trim();
    if (!text || busy) return;
    setBusy(true);
    const ok = await addCoachNote({ category: draftCat, note: text });
    setBusy(false);
    if (ok) { showToast('Guardado na memória do Coach'); resetAdd(); }
    else showToast('Não foi possível guardar');
  };

  const handleSaveEdit = async (id) => {
    const text = editText.trim();
    if (!text || busy) return;
    setBusy(true);
    const ok = await updateCoachNote(id, { note: text });
    setBusy(false);
    if (ok) { showToast('Nota atualizada'); setEditingId(null); }
    else showToast('Não foi possível atualizar');
  };

  // Leva a conversa para o Coach já focada nesta nota. O atleta não
  // reescreve o que a Carol registou — explica-lhe o que está errado e é
  // ela que atualiza, mantendo a autoria de cada linha intacta.
  const askCarolToChange = (note) => {
    setCoachIntent({ kind: 'discuss_note', note });
    setActiveTab('coach');
  };

  const handleDelete = async (id) => {
    if (busy) return;
    setBusy(true);
    const ok = await deleteCoachNote(id);
    setBusy(false);
    showToast(ok ? 'Nota removida' : 'Não foi possível remover');
  };

  return (
    <div className="rounded-2xl p-4 bg-neutral-900/50 border border-neutral-800">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={16} className="text-[var(--mod-coach-to)]" />
        <h2 className="text-sm font-semibold">Memória do Coach</h2>
        {notes.length > 0 && (
          <span className="text-[10px] text-slate-500 font-mono ml-auto">{notes.length}/40</span>
        )}
      </div>

      {/* 12px, não 11px como o resto dos rótulos do cartão — é o único bloco
          de leitura contínua aqui (os outros são etiquetas curtas), por isso
          fica um degrau acima do piso tipográfico da app. */}
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        Factos que a Carol tem sempre presentes, mesmo em conversas de daqui a semanas.
        Ela regista o que percebe do que lhe contas — corrige ou apaga o que não estiver certo,
        e acrescenta o que quiseres que ela nunca esqueça.{' '}
        <span style={{ color: 'var(--mod-coach-to)' }}>A azul o que a Carol escreveu</span>
        — para mudares uma dessas, fala com ela; a cinzento o que escreveste tu, que editas aqui.
      </p>

      {notes.length === 0 && !adding && (
        <p className="text-[11px] text-slate-600 italic mb-4">
          Ainda sem notas. À medida que falares com a Carol, ela vai registando aqui o que for
          importante — ou podes começar tu.
        </p>
      )}

      <div className="flex flex-col gap-2 mb-3">
        {notes.map(n => {
          const byCoach = n.source === 'coach';
          return (
          <div
            key={n.id}
            className="rounded-xl border bg-neutral-900/70 p-3"
            style={{
              // Um filete na cor do coach chega para separar as duas autorias
              // de relance, sem transformar a lista num arco-íris.
              borderColor: byCoach
                ? 'color-mix(in srgb, var(--mod-coach-to) 30%, transparent)'
                : 'rgb(38 38 38)',
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: byCoach
                    ? 'color-mix(in srgb, var(--mod-coach-to) 12%, transparent)'
                    : 'rgb(38 38 38)',
                  color: byCoach ? 'var(--mod-coach-to)' : 'rgb(148 163 184)',
                }}
              >
                {categoryLabel(n.category)}
              </span>
              <span
                className="text-[9px]"
                style={{ color: byCoach ? 'var(--mod-coach-to)' : 'rgb(100 116 139)', opacity: byCoach ? 0.8 : 1 }}
              >
                {byCoach ? 'registado pela Carol' : 'escrito por ti'}
              </span>

              {editingId !== n.id && (
                // flex-wrap: com categorias mais longas (ex. "Disponibilidade")
                // + o alvo de toque maior dos botões, a linha pode deixar de
                // caber a 375px — cai para a linha seguinte em vez de estourar.
                <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
                  {byCoach ? (
                    // Editar por cima do que a Carol escreveu misturava as duas
                    // vozes na mesma linha e destruía a autoria. Em vez disso,
                    // pede-se-lhe a alteração e discute-se no chat.
                    <button
                      type="button"
                      aria-label="Pedir à Carol para alterar esta nota"
                      title="Falar com a Carol sobre esta nota"
                      onClick={() => askCarolToChange(n.note)}
                      // p-2.5 em vez de tap-44: os botões ficam lado a lado —
                      // um alvo de 44px bateria certo com o vizinho. 33px é o
                      // mínimo aceite (Material) quando 44 não cabe numa linha
                      // de metadados tão densa. Sem margem negativa: encolhia
                      // a área visível mas não a caixa clicável (isso é o
                      // padding-box), só aproximava fisicamente os dois
                      // botões até sobreporem-se.
                      className="p-2.5 transition hover:opacity-70"
                      style={{ color: 'var(--mod-coach-to)' }}
                    >
                      <MessageSquare size={13} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Editar nota"
                      onClick={() => { setEditingId(n.id); setEditText(n.note); }}
                      className="p-2.5 text-slate-500 hover:text-slate-200 transition"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remover nota"
                    onClick={() => handleDelete(n.id)}
                    className="p-2.5 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>

            {editingId === n.id && !byCoach ? (
              <div className="flex flex-col gap-2">
                <textarea
                  rows="3"
                  value={editText}
                  maxLength={MAX_NOTE_LEN}
                  onChange={e => setEditText(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs outline-none resize-none focus:border-[var(--mod-coach-to)]/70"
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="module"
                    moduleColor="var(--mod-coach-to)"
                    className="text-[11px] py-2 px-3"
                    onClick={() => handleSaveEdit(n.id)}
                    disabled={busy || !editText.trim()}
                    icon={<Check size={14} />}
                  >
                    Guardar
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-[11px] text-slate-500 hover:text-slate-300 px-2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p
                className="text-xs leading-relaxed"
                style={{ color: byCoach ? 'var(--mod-coach-to)' : 'rgb(203 213 225)' }}
              >
                {n.note}
              </p>
            )}
          </div>
          );
        })}
      </div>

      {adding ? (
        <div className="rounded-xl border border-dashed border-[var(--mod-coach-to)]/40 p-3 flex flex-col gap-2">
          <select
            value={draftCat}
            onChange={e => setDraftCat(e.target.value)}
            aria-label="Categoria da nota"
            className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[var(--mod-coach-to)]/70"
          >
            {NOTE_CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <textarea
            rows="3"
            autoFocus
            value={draftNote}
            maxLength={MAX_NOTE_LEN}
            onChange={e => setDraftNote(e.target.value)}
            placeholder={NOTE_CATEGORIES.find(c => c.key === draftCat)?.hint || 'O que queres que a Carol nunca esqueça?'}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs outline-none resize-none placeholder-slate-600 focus:border-[var(--mod-coach-to)]/70"
          />
          <div className="flex items-center gap-2">
            <Button variant="module" moduleColor="var(--mod-coach-to)" className="text-[11px] py-2 px-3" onClick={handleAdd} disabled={busy || !draftNote.trim()} icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}>
              Guardar
            </Button>
            <button type="button" onClick={resetAdd} className="text-[11px] text-slate-500 hover:text-slate-300 px-2">
              Cancelar
            </button>
            <span className="ml-auto text-[10px] text-slate-600 font-mono">
              {draftNote.length}/{MAX_NOTE_LEN}
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={notes.length >= 40}
          className="w-full border-2 border-dashed border-[var(--mod-coach-to)]/40 hover:border-[var(--mod-coach-to)]/70 hover:bg-[var(--mod-coach-to)]/10 text-[var(--mod-coach-to)] py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={15} />
          {notes.length >= 40 ? 'Memória cheia — remove uma nota primeiro' : 'Acrescentar um facto'}
        </button>
      )}
    </div>
  );
}
