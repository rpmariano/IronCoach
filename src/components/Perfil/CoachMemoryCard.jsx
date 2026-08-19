import React, { useEffect, useState } from 'react';
import { Brain, Plus, Trash2, Pencil, Check, X, Loader2, MessageSquare, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { useToast } from '../shared/ToastProvider';
import Button from '../shared/Button';
import PremiumModal from '../shared/PremiumModal';

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
  {
    key: 'preferencia_alimentar', label: 'Alimentação',
    hint: 'Ex.: prefiro refeições vegetarianas',
    description: 'Preferências e recusas alimentares que não mudam de refeição para refeição.',
    examples: ['Prefiro refeições vegetarianas (como ovos e lacticínios)', 'Não como marisco', 'Evito lacticínios ao pequeno-almoço, sinto-me pesado a treinar'],
  },
  {
    key: 'limitacao_fisica',      label: 'Limitação',
    hint: 'Ex.: epicondilite no cotovelo direito',
    description: 'Lesões, dores ou condições físicas que o plano de treino tem de respeitar.',
    examples: ['Epicondilite no cotovelo direito — evitar exercícios de tração e preensão forte', 'Joelho sensível em descidas prolongadas', 'Asma induzida por esforço, uso inalador antes de treinos intensos'],
  },
  {
    key: 'disponibilidade',       label: 'Disponibilidade',
    hint: 'Ex.: não treino às segundas',
    description: 'Dias, horários ou épocas em que não podes ou preferes não treinar.',
    examples: ['Não treino às segundas-feiras', 'Só consigo correr de manhã cedo, antes das 7h', 'Viagem de trabalho todo o mês de outubro, treinos limitados a ginásio de hotel'],
  },
  {
    key: 'objetivo_pessoal',      label: 'Objetivo',
    hint: 'Ex.: quero acabar a meia maratona a correr',
    description: 'Motivações pessoais que vão além do tempo-alvo de uma prova.',
    examples: ['Quero acabar a meia maratona a correr, sem parar a andar', 'Esta é a minha primeira maratona — o objetivo é terminar, não o tempo', 'Quero perder peso mantendo a massa muscular'],
  },
  {
    key: 'preferencia_treino',    label: 'Treino',
    hint: 'Ex.: prefiro correr ao ar livre',
    description: 'Como preferes treinar — não são restrições, são gostos que tornam o plano mais fácil de cumprir.',
    examples: ['Prefiro correr ao ar livre a passadeira', 'Gosto de treinos em grupo aos sábados', 'Detesto séries de intervalados curtos, prefiro fartlek'],
  },
  {
    key: 'contexto_vida',         label: 'Contexto',
    hint: 'Ex.: trabalho por turnos',
    description: 'Circunstâncias de vida que afetam a tua disponibilidade, sono ou recuperação.',
    examples: ['Trabalho por turnos, o sono é irregular', 'Bebé pequeno em casa — noites mal dormidas são frequentes', 'Escritório em pé o dia todo, chego cansado às pernas'],
  },
  {
    key: 'outro',                 label: 'Outro',
    hint: '',
    description: 'Qualquer facto importante que não encaixe nas categorias acima.',
    examples: [],
  },
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
  const [showCategoryHelp, setShowCategoryHelp] = useState(false);

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
    <div className="module-card-contrast">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={16} className="text-[var(--mod-coach-to)]" />
        <h2 className="text-sm font-semibold">Memória do Coach</h2>
        <button
          type="button"
          onClick={() => setShowCategoryHelp(true)}
          aria-label="O que colocar em cada categoria?"
          title="O que colocar em cada categoria?"
          className="inline-flex items-center justify-center rounded-full active:scale-90 transition"
          style={{
            color: 'var(--mod-coach-to)',
            background: 'color-mix(in srgb, var(--mod-coach-to) 15%, transparent)',
            width: 18,
            height: 18,
          }}
        >
          <HelpCircle size={12} />
        </button>
        {notes.length > 0 && (
          <span className="text-[10px] text-slate-500 font-mono ml-auto">{notes.length}/40</span>
        )}
      </div>

      <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
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
                <div className="ml-auto flex items-center gap-1">
                  {byCoach ? (
                    // Editar por cima do que a Carol escreveu misturava as duas
                    // vozes na mesma linha e destruía a autoria. Em vez disso,
                    // pede-se-lhe a alteração e discute-se no chat.
                    <button
                      type="button"
                      aria-label="Pedir à Carol para alterar esta nota"
                      title="Falar com a Carol sobre esta nota"
                      onClick={() => askCarolToChange(n.note)}
                      className="p-1 transition hover:opacity-70"
                      style={{ color: 'var(--mod-coach-to)' }}
                    >
                      <MessageSquare size={13} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Editar nota"
                      onClick={() => { setEditingId(n.id); setEditText(n.note); }}
                      className="p-1 text-slate-500 hover:text-slate-200 transition"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remover nota"
                    onClick={() => handleDelete(n.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
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

      <PremiumModal
        isOpen={showCategoryHelp}
        onClose={() => setShowCategoryHelp(false)}
        title="Categorias da Memória"
        subtitle="O que colocar em cada uma?"
        icon={Brain}
        theme="coach"
        variant="bottom-sheet"
      >
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-slate-50/30">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Cada facto fica só numa categoria — ajuda a Carol a saber onde procurar, e a ti a
            veres de relance o que já lhe contaste.
          </p>
          {NOTE_CATEGORIES.filter(c => c.key !== 'outro').map(c => (
            <div key={c.key} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
              <p className="text-[12px] font-bold text-slate-700 mb-1">{c.label}</p>
              <p className="text-[11px] text-slate-600 leading-snug mb-2">{c.description}</p>
              <ul className="space-y-1">
                {c.examples.map((ex, i) => (
                  <li key={i} className="text-[11px] leading-snug flex gap-1.5 text-slate-500 italic">
                    <span aria-hidden="true" className="font-bold text-slate-400 not-italic">·</span>
                    <span>"{ex}"</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[10px] leading-relaxed text-slate-400 text-center pb-2">
            Não encaixa em nenhuma? Usa "Outro" — a Carol lê à mesma.
          </p>
        </div>
      </PremiumModal>
    </div>
  );
}
