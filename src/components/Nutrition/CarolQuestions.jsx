import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { ANALYZE_TIMEOUT_MS } from '../../lib/edgeTimeouts';
import { useAppStore } from '../../store';

/* As perguntas da Carol sobre uma refeição (bug #52, fase B, 2026-10-04:
   «em vez de a Carol estar a adivinhar determinadas situações, pode
   perguntar no momento»). A refeição já está gravada com o que ela assumiu;
   aqui o atleta corrige com um toque — ou deixa para depois, e as perguntas
   ficam no cartão da refeição. Responder passa pela analyze-meal (mode
   "answer"): refaz as contas do alimento, refaz o comentário e soma às
   regras de como ele cozinha — à segunda resposta igual, deixa de perguntar.
   Mockup "Despensa e perguntas da Carol", ecrãs 1 e 2. */

/** As perguntas ainda por responder de uma refeição. */
export function openCarolQuestions(meal) {
  return (Array.isArray(meal?.carol_questions) ? meal.carol_questions : []).filter((q) => q && !q.answer);
}

const OUTRO = '__outro__';

/** A frase de cada regra depois de responder. */
export function learnedLine({ topic, value, status }) {
  if (status === 'confirmado') return `Guardei: ${topic} — ${value}. Não volto a perguntar.`;
  if (status === 'varia') return `Anotado: ${topic} — ${value}. Isto varia de vez para vez, por isso continuo a perguntar.`;
  return `Anotado: ${topic} — ${value}. Se da próxima vez também for, deixo de perguntar.`;
}

export default function CarolQuestions({ meal, onAnswered }) {
  const questions = openCarolQuestions(meal);
  const [picked, setPicked] = useState({});
  const [other, setOther] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [learned, setLearned] = useState(null);

  if (learned) {
    return (
      <div data-testid="carol-questions-done" className="flex gap-2.5 items-start">
        <CoachAvatar size={36} mood="happy" />
        <div className="text-[13px] leading-[1.5] space-y-1" style={{ color: 'var(--text-2)' }}>
          {learned.length
            ? learned.map((l) => <p key={l.topic}>{learnedLine(l)}</p>)
            : <p>Anotado, e as contas estão refeitas.</p>}
        </div>
      </div>
    );
  }
  if (!questions.length) return null;

  const answerFor = (q) => (picked[q.id] === OUTRO ? (other[q.id] || '').trim() : picked[q.id]);
  const answers = questions.map((q) => ({ id: q.id, answer: answerFor(q) })).filter((a) => a.answer);
  const totalImpact = questions.reduce((s, q) => s + (Number(q.impact_kcal) || 0), 0);

  const submit = async () => {
    if (!answers.length || sending) return;
    setSending(true);
    setError('');
    try {
      const { data, error: err } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
        body: { mode: 'answer', meal_id: meal.id, answers },
      }, ANALYZE_TIMEOUT_MS);
      if (err) throw new Error(err);
      if (data?.error) throw new Error(data.error);
      const updated = data.meal;
      const { meals, setMeals } = useAppStore.getState();
      setMeals((meals || []).map((m) => (m.id === updated.id ? updated : m)));
      setLearned(data.learned || []);
      onAnswered?.(updated, data.learned || []);
    } catch (e) {
      setError(e?.message || 'Não consegui guardar as respostas. Tenta outra vez.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="carol-questions" className="space-y-3">
      <div className="flex gap-2.5 items-start">
        <CoachAvatar size={36} mood="thinking" />
        <p className="text-[13px] leading-[1.5] mt-0.5" style={{ color: 'var(--text-2)' }}>
          {questions.length === 1 ? 'Antes de fechar as contas, uma pergunta.' : 'Antes de fechar as contas, duas perguntas.'}{' '}
          Para já assumi o mais comum — {questions.length === 1 ? 'a resposta muda' : 'as respostas mudam'} até{' '}
          <b style={{ color: 'var(--coach)' }}>{totalImpact} kcal</b>.
        </p>
      </div>

      {questions.map((q) => (
        <fieldset key={q.id} data-testid={`carol-question-${q.id}`} className="rounded-2xl p-3.5 m-0" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}>
          <legend className="sr-only">{q.question}</legend>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[14px] font-extrabold" style={{ color: 'var(--text-1)' }} aria-hidden="true">{q.question}</p>
            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-4)' }}>± {q.impact_kcal} kcal</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {[...q.options, OUTRO].map((opt) => {
              const on = picked[q.id] === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((p) => ({ ...p, [q.id]: opt }))}
                  className="min-h-[44px] px-[15px] rounded-full text-[13px] font-bold"
                  style={on
                    ? { background: 'rgba(34,211,238,.16)', border: '1px solid rgba(34,211,238,.6)', color: 'var(--coach)' }
                    : { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.16)', color: 'var(--text-2)' }}
                >
                  {opt === OUTRO ? 'Outro…' : opt}
                </button>
              );
            })}
          </div>
          {picked[q.id] === OUTRO && (
            <input
              aria-label={`Outra resposta: ${q.question}`}
              value={other[q.id] || ''}
              maxLength={60}
              autoFocus
              onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))}
              className="w-full mt-2.5 min-h-[44px] rounded-xl px-3 text-sm outline-none"
              style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-glass)', color: 'var(--text-1)' }}
            />
          )}
          <p className="text-[11.5px] mt-2" style={{ color: 'var(--text-muted)' }}>Assumi {q.assumed.toLowerCase()}.</p>
        </fieldset>
      ))}

      {error && <p role="alert" className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>}

      <button
        type="button"
        data-testid="carol-questions-submit"
        onClick={submit}
        disabled={!answers.length || sending}
        className="w-full min-h-[48px] rounded-xl text-[14px] font-black inline-flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: 'var(--coach)', color: '#062a33' }}
      >
        {sending ? <><Loader2 size={16} className="animate-spin" /> A refazer as contas…</> : 'Responder'}
      </button>
    </div>
  );
}
