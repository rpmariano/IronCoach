import { describe, it, expect } from 'vitest';
import { pendingTopicLines } from './carolTopics';

/* O popup diz o assunto, na voz dela, sem o motivo técnico (2026-09-23). */
describe('pendingTopicLines', () => {
  const comMotivo = (reason) => ({ profile: { coach_intervention_status: 'needed', coach_intervention_reason: reason } });

  it('objetivos por definir e por rever, cada um com a sua frase', () => {
    expect(pendingTopicLines(comMotivo('[objetivos] O atleta acabou de registar uma avaliação corporal e ainda não tem objetivos definidos (os do corpo).')))
      .toEqual(['Vi a tua avaliação corporal. Quero definir contigo os teus objetivos.']);
    expect(pendingTopicLines(comMotivo('[objetivos] … os objetivos que tem deviam ser revistos: peso-alvo atingido.'))[0])
      .toMatch(/Quero revê-los contigo/);
  });

  it('o motivo antigo, sem etiqueta, também é de objetivos', () => {
    expect(pendingTopicLines(comMotivo('O atleta acabou de registar uma avaliação corporal e ainda não tem objetivos definidos (x).'))[0])
      .toMatch(/definir contigo os teus objetivos/);
  });

  it('check-in e desvio ao plano, sem mostrar o motivo técnico', () => {
    expect(pendingTopicLines(comMotivo('Check-in de hoje: dor 6/10.'))[0]).toMatch(/check-in de hoje/);
    const plano = pendingTopicLines(comMotivo('ACWR 1.8, três treinos falhados.'))[0];
    expect(plano).toMatch(/ajustar contigo/);
    expect(plano).not.toMatch(/ACWR/);
  });

  it('propostas por decidir; nada pendente, nada a dizer', () => {
    expect(pendingTopicLines({ coachPlans: [{ status: 'proposto' }], coachGoalProposals: [{ status: 'proposto' }] }))
      .toEqual(['Tens um plano meu à espera que o aceites ou recuses.', 'Tens objetivos meus à espera da tua decisão.']);
    expect(pendingTopicLines({ profile: { coach_intervention_status: 'resolved' }, coachPlans: [{ status: 'aceite' }] })).toEqual([]);
  });
});
