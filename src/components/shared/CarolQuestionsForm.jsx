import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import CoachAvatar from '../Coach/CoachAvatar';
import { CAROL_TALK_CLASS, CAROL_TALK_STYLE, CAROL_SECONDARY_CLASS, CAROL_SECONDARY_STYLE } from './CarolActions';
import { fmtNumber } from '../../utils/verdicts/shared';
import { FieldInput } from './registration/Field';

/* As perguntas da Carol — só a apresentação, para servir qualquer registo (bug #106: as leituras
   do treino, da corrida e do corporal vão trazer perguntas no MESMO formato das da refeição).
   Quem a usa decide o que fazer com as respostas (`onSubmit`) e o que dizer antes (`intro`); a
   refeição continua em Nutrition/CarolQuestions.jsx, que monta isto com a analyze-meal.

   Cada pergunta, no formato da analyze-meal (carol_questions):
     { id, question, options: string[], assumed, kind?, impact_kcal?, impact_protein_g? }
   As respostas vão como [{ id, answer }] — a opção escolhida, ou o texto de «Outro…». */

export const OUTRO = '__outro__';

/* Desde 2026-10-17 (bugs #58/#66) uma pergunta também vale pela proteína que
   muda — o fiambre muda pouca energia e muita proteína —, e podem ser até 5. */
const proteinOf = (q) => Number(q?.impact_protein_g) || 0;
const fmtProtein = (g) => fmtNumber(g, Number.isInteger(g) ? 0 : 1);

/** "160 kcal" ou "160 kcal e 4,2 g de proteína": quanto as respostas mudam. */
export function questionsImpactText(questions) {
  const kcal = (questions || []).reduce((s, q) => s + (Number(q?.impact_kcal) || 0), 0);
  const protein = Math.round((questions || []).reduce((s, q) => s + proteinOf(q), 0) * 10) / 10;
  if (protein > 0 && kcal > 0) return `${kcal} kcal e ${fmtProtein(protein)} g de proteína`;
  if (protein > 0) return `${fmtProtein(protein)} g de proteína`;
  return `${kcal} kcal`;
}

/** "± 90 kcal" ou "± 17 kcal · 4,2 g prot.", ao lado de cada pergunta. */
export function questionImpactText(q) {
  const kcal = Number(q?.impact_kcal) || 0;
  const protein = proteinOf(q);
  if (protein > 0) return kcal > 0 ? `± ${kcal} kcal · ${fmtProtein(protein)} g prot.` : `± ${fmtProtein(protein)} g prot.`;
  return `± ${kcal} kcal`;
}

/** A frase de cada regra depois de responder. */
export function learnedLine({ topic, value, status }) {
  if (status === 'confirmado') return `Guardei: ${topic} — ${value}. Não volto a perguntar.`;
  if (status === 'varia') return `Anotado: ${topic} — ${value}. Isto varia de vez para vez, por isso continuo a perguntar.`;
  return `Anotado: ${topic} — ${value}. Se da próxima vez também for, deixo de perguntar.`;
}

/** Uma pergunta: as opções em pílulas, «Outro…» com texto livre (até 60) e o que ela assumiu.
 *  Controlado: `picked` (a opção, ou OUTRO) e `other` (o texto) vêm de quem a usa. */
export function QuestionCard({ q, picked, other, onPick, onOther, impact = '' }) {
  // Numa quantidade (fase B dos #58/#66), com gramas a resposta aplica-se logo; sem gramas a
  // Carol volta a estimar a porção. As perguntas de contexto (leituras dos prints, #106) não.
  const placeholder = q.kind === 'quantidade' ? 'ex.: 20 g, ou "duas fatias grossas"' : undefined;
  return (
    <fieldset data-testid={`carol-question-${q.id}`} className="rounded-2xl p-3.5 m-0" style={{ background: 'var(--tint-coach-bg)', border: '1px solid var(--tint-coach-bd)' }}>
      <legend className="sr-only">{q.question}</legend>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-extrabold" style={{ color: 'var(--text-1)' }} aria-hidden="true">{q.question}</p>
        {impact && <span className="text-[11px] shrink-0" style={{ color: 'var(--text-4)' }}>{impact}</span>}
      </div>
      <div className="flex flex-wrap gap-2 mt-2.5">
        {[...(q.options || []), OUTRO].map((opt) => {
          const on = picked === opt;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(opt)}
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
      {picked === OUTRO && (
        <FieldInput
          aria-label={`Outra resposta: ${q.question}`}
          value={other || ''}
          maxLength={60}
          autoFocus
          placeholder={placeholder}
          onChange={(e) => onOther(e.target.value)}
          className="mt-2.5"
          style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-glass)', color: 'var(--text-1)' }}
        />
      )}
      {q.assumed && <p className="text-[11.5px] mt-2" style={{ color: 'var(--text-muted)' }}>Assumi {String(q.assumed).toLowerCase()}.</p>}
    </fieldset>
  );
}

/** A resposta de uma pergunta a partir do estado { picked, other }: a opção, ou o texto de
 *  «Outro…» (sem espaços à volta); '' sem resposta. */
export const answerOf = (st) => (st?.picked === OUTRO ? (st.other || '').trim() : (st?.picked || ''));

/**
 * @param questions    as perguntas por responder
 * @param intro        o que a Carol diz antes das perguntas (nó)
 * @param impactText   (q) => texto ao lado de cada pergunta; '' para nada
 * @param onSubmit     async (answers) => learned[] — lança um Error com a mensagem a mostrar
 * @param onLater      «Agora não» (sem ele, o botão não aparece)
 * @param laterAriaLabel  o que «Agora não» faz às perguntas
 * @param doneFallback a frase depois de responder, quando não há regras aprendidas
 */
export default function CarolQuestionsForm({
  questions, intro = null, impactText = questionImpactText, onSubmit, onLater,
  laterAriaLabel = 'Agora não', busyLabel = 'A refazer as contas…',
  doneFallback = 'Anotado, e as contas estão refeitas.', testid = 'carol-questions',
}) {
  const [picked, setPicked] = useState({});
  const [other, setOther] = useState({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [learned, setLearned] = useState(null);

  if (learned) {
    return (
      <div data-testid={`${testid}-done`} className="flex gap-2.5 items-start">
        <CoachAvatar size={36} mood="happy" />
        <div className="text-[13px] leading-[1.5] space-y-1" style={{ color: 'var(--text-2)' }}>
          {learned.length
            ? learned.map((l) => <p key={l.topic}>{learnedLine(l)}</p>)
            : <p>{doneFallback}</p>}
        </div>
      </div>
    );
  }
  if (!questions?.length) return null;

  const answerFor = (q) => (picked[q.id] === OUTRO ? (other[q.id] || '').trim() : picked[q.id]);
  const answers = questions.map((q) => ({ id: q.id, answer: answerFor(q) })).filter((a) => a.answer);

  const submit = async () => {
    if (!answers.length || sending) return;
    setSending(true);
    setError('');
    try {
      const got = await onSubmit(answers);
      setLearned(Array.isArray(got) ? got : []);
    } catch (e) {
      setError(e?.message || 'Não consegui guardar as respostas. Tenta outra vez.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid={testid} className="space-y-3">
      {intro && (
        <div className="flex gap-2.5 items-start">
          <CoachAvatar size={36} mood="thinking" />
          <p className="text-[13px] leading-[1.5] mt-0.5" style={{ color: 'var(--text-2)' }}>{intro}</p>
        </div>
      )}

      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          q={q}
          picked={picked[q.id]}
          other={other[q.id]}
          onPick={(opt) => setPicked((p) => ({ ...p, [q.id]: opt }))}
          onOther={(text) => setOther((o) => ({ ...o, [q.id]: text }))}
          impact={impactText ? impactText(q) : ''}
        />
      ))}

      {error && <p role="alert" className="text-[12.5px]" style={{ color: 'var(--danger)' }}>{error}</p>}

      {/* Convenção única dos botões da Carol (2026-10-05): "Responder" é o
          primário dela — gradiente e tinta var(--coach-ink), largura toda,
          em cima. Por baixo, "Agora não" fecha sem responder. Só aparece
          quando quem mostra as perguntas sabe fechá-las (onLater). */}
      <button
        type="button"
        data-testid={`${testid}-submit`}
        onClick={submit}
        disabled={!answers.length || sending}
        className={`${CAROL_TALK_CLASS} disabled:opacity-50`}
        style={CAROL_TALK_STYLE}
      >
        {sending ? <><Loader2 size={15} className="animate-spin" /> {busyLabel}</> : 'Responder'}
      </button>
      {onLater && (
        <div className="flex gap-2">
          <button
            type="button"
            data-testid={`${testid}-later`}
            onClick={onLater}
            disabled={sending}
            aria-label={laterAriaLabel}
            className={`${CAROL_SECONDARY_CLASS} disabled:opacity-50`}
            style={CAROL_SECONDARY_STYLE}
          >
            Agora não
          </button>
        </div>
      )}
    </div>
  );
}

/* As perguntas de uma leitura de prints (bug #106, contrato do Backend 6597c0ec): a Carol pergunta
   o contexto do que leu (no máximo 3). Não há «Responder» — as respostas seguem com o registo, em
   `carol_questions`, quando se carrega em Analisar. Sem impacto em kcal (é sempre 0). */
export function PrintQuestions({ questions, answers, onChange, testid = 'print-questions', intro = null }) {
  if (!questions?.length) return null;
  const set = (id, patch) => onChange({ ...answers, [id]: { ...(answers?.[id] || {}), ...patch } });
  return (
    <div data-testid={testid} className="space-y-3">
      <div className="flex gap-2.5 items-start">
        <CoachAvatar size={36} mood="thinking" />
        <p className="text-[13px] leading-[1.5] mt-0.5" style={{ color: 'var(--text-2)' }}>
          {intro || `${questions.length === 1 ? 'Li os prints. Uma pergunta' : 'Li os prints. Umas perguntas'} para acertar a análise — se não souberes, deixa: fico com o que assumi.`}
        </p>
      </div>
      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          q={q}
          picked={answers?.[q.id]?.picked}
          other={answers?.[q.id]?.other}
          onPick={(opt) => set(q.id, { picked: answers?.[q.id]?.picked === opt ? undefined : opt })}
          onOther={(text) => set(q.id, { other: text })}
        />
      ))}
    </div>
  );
}

/** O `carol_questions` do pedido de gravar: as perguntas lidas, com `answer` preenchido (ou null)
 *  e `answered_at` quando há resposta. No máximo 3 (o servidor também corta) — as refeições levam
 *  mais (#106, até 7: as do modelo, a da variante e a da manteiga), com `max`. */
export function questionsPayload(questions, answers, now = () => new Date().toISOString(), max = 3) {
  if (!Array.isArray(questions) || !questions.length) return {};
  return {
    carol_questions: questions.slice(0, max).map((q) => {
      const answer = answerOf(answers?.[q.id]).slice(0, 60) || null;
      return { ...q, answer, answered_at: answer ? now() : null };
    }),
  };
}

/** As perguntas que vieram numa resposta de leitura (array válido, no máximo 3; `max` nas refeições). */
export const readQuestions = (data, max = 3) => (Array.isArray(data?.questions) ? data.questions.filter((q) => q && q.id && q.question).slice(0, max) : []);
