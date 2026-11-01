import React from 'react';
import { invokeEdgeFunctionWithTimeout } from '../../lib/supabase';
import { ANALYZE_TIMEOUT_MS } from '../../lib/edgeTimeouts';
import { useAppStore } from '../../store';
import { spellFem } from '../../utils/verdicts/shared';
import CarolQuestionsForm, { questionsImpactText, questionImpactText, learnedLine } from '../shared/CarolQuestionsForm';

/* As perguntas da Carol sobre uma refeição (bug #52, fase B, 2026-10-04:
   «em vez de a Carol estar a adivinhar determinadas situações, pode
   perguntar no momento»). A refeição já está gravada com o que ela assumiu;
   aqui o atleta corrige com um toque — ou deixa para depois, e as perguntas
   ficam no cartão da refeição. Responder passa pela analyze-meal (mode
   "answer"): refaz as contas do alimento, refaz o comentário e soma às
   regras de como ele cozinha — à segunda resposta igual, deixa de perguntar.
   Mockup "Despensa e perguntas da Carol", ecrãs 1 e 2.

   A apresentação vive em shared/CarolQuestionsForm.jsx (bug #106), para os
   outros registos usarem as mesmas perguntas. */

export { questionsImpactText, questionImpactText, learnedLine };

/** As perguntas ainda por responder de uma refeição. */
export function openCarolQuestions(meal) {
  return (Array.isArray(meal?.carol_questions) ? meal.carol_questions : []).filter((q) => q && !q.answer);
}

export default function CarolQuestions({ meal, onAnswered, onLater }) {
  const questions = openCarolQuestions(meal);

  const submit = async (answers) => {
    const { data, error: err } = await invokeEdgeFunctionWithTimeout('analyze-meal', {
      body: { mode: 'answer', meal_id: meal.id, answers },
    }, ANALYZE_TIMEOUT_MS);
    if (err) throw new Error(err);
    if (data?.error) throw new Error(data.error);
    const updated = data.meal;
    const { meals, setMeals } = useAppStore.getState();
    setMeals((meals || []).map((m) => (m.id === updated.id ? updated : m)));
    onAnswered?.(updated, data.learned || []);
    return data.learned || [];
  };

  const intro = questions.length ? (
    <>
      {questions.length === 1 ? 'Antes de fechar as contas, uma pergunta.' : `Antes de fechar as contas, ${spellFem(questions.length)} perguntas.`}{' '}
      Para já assumi o mais comum — {questions.length === 1 ? 'a resposta muda' : 'as respostas mudam'} até{' '}
      <b style={{ color: 'var(--coach)' }}>{questionsImpactText(questions)}</b>.
    </>
  ) : null;

  return (
    <CarolQuestionsForm
      questions={questions}
      intro={intro}
      onSubmit={submit}
      onLater={onLater}
      laterAriaLabel="Agora não — as perguntas ficam no cartão da refeição"
    />
  );
}
