import { describe, it, expect } from 'vitest';
import {
  interventionNotes,
  recordAsksToTalk,
  isInterventionDismissed,
  showRecordIntervention,
  recordInterventionIntent,
} from './recordIntervention';

/* Uma chave por tipo (2026-10-05): o cartão, o formulário e o "Registo
   Guardado" leem e gravam a dispensa com o mesmo texto. Antes a corrida lia
   coach_notes||ai_analysis||coach_analysis no cartão e
   coach_notes||coach_analysis no formulário, e a avaliação ai_summary no
   cartão e coach_notes no formulário. */
const CONVITE = 'Vamos adaptar o plano para esta semana.';

describe('interventionNotes — a chave única por tipo', () => {
  it('corrida: coach_notes, depois ai_analysis, depois coach_analysis', () => {
    expect(interventionNotes({ coach_notes: 'a', ai_analysis: 'b', coach_analysis: 'c' }, 'run')).toBe('a');
    expect(interventionNotes({ ai_analysis: 'b', coach_analysis: 'c' }, 'run')).toBe('b');
    expect(interventionNotes({ coach_analysis: 'c' }, 'run')).toBe('c');
  });

  it('avaliação: ai_summary primeiro (é o que a analyze-body escreve)', () => {
    expect(interventionNotes({ ai_summary: 's', coach_notes: 'n' }, 'body')).toBe('s');
    expect(interventionNotes({ coach_notes: 'n' }, 'body')).toBe('n');
  });

  it('ginásio e refeição: coach_notes, depois coach_analysis; vazio é null', () => {
    expect(interventionNotes({ coach_notes: 'n' }, 'gym')).toBe('n');
    expect(interventionNotes({ coach_analysis: 'c' }, 'meal')).toBe('c');
    expect(interventionNotes({ coach_notes: '   ' }, 'meal')).toBeNull();
    expect(interventionNotes(null, 'meal')).toBeNull();
  });
});

describe('recordAsksToTalk', () => {
  it('pelo convite no texto ou pelas marcas da análise acabada de fazer', () => {
    expect(recordAsksToTalk({ coach_notes: CONVITE }, 'run')).toBe(true);
    expect(recordAsksToTalk({ coach_notes: 'Boa corrida.' }, 'run')).toBe(false);
    expect(recordAsksToTalk({ intervention_needed: true }, 'meal')).toBe(true);
    expect(recordAsksToTalk({ coach_intervention_status: 'needed' }, 'gym')).toBe(true);
    // A avaliação lê o convite no ai_summary.
    expect(recordAsksToTalk({ ai_summary: CONVITE }, 'body')).toBe(true);
  });
});

describe('isInterventionDismissed / showRecordIntervention', () => {
  const run = { id: 'r1', coach_notes: CONVITE, ai_analysis: 'outro' };

  it('a dispensa com a chave única vale; com o texto de outro campo não', () => {
    expect(isInterventionDismissed(run, 'run', { r1: CONVITE })).toBe(true);
    expect(isInterventionDismissed(run, 'run', { r1: 'outro' })).toBe(false);
  });

  it('aceita a marca antiga "dismissed"', () => {
    expect(isInterventionDismissed(run, 'run', { r1: 'dismissed' })).toBe(true);
  });

  it('um texto novo (reanálise) volta a mostrar o convite', () => {
    expect(showRecordIntervention({ ...run, coach_notes: `${CONVITE} (novo)` }, 'run', { r1: CONVITE })).toBe(true);
  });

  it('sem id não se mostra (não há onde gravar a dispensa)', () => {
    expect(showRecordIntervention({ coach_notes: CONVITE }, 'run', {})).toBe(false);
  });
});

describe('recordInterventionIntent', () => {
  it('leva a origem: o tipo, o registo e o motivo', () => {
    expect(recordInterventionIntent({ id: 'b1', date: '2026-10-05', ai_summary: CONVITE }, 'body')).toEqual({
      kind: 'proactive_intervention', recordType: 'body', recordId: 'b1', recordName: 'Avaliação Corporal', date: '2026-10-05', reason: CONVITE,
    });
    expect(recordInterventionIntent({ id: 'r1', name: 'Rodagem', coach_notes: CONVITE }, 'run', 'Motivo do perfil').reason).toBe('Motivo do perfil');
  });
});
