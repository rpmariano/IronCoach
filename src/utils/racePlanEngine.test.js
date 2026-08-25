import { describe, it, expect } from 'vitest';
import {
  getRecommendedPrepWeeks,
  getRecoveryDaysAfterRace,
  getTaperWeeks,
  calculateEquivalentFlatKm,
  calculateRaceTrainingPlan,
  formatDatePTShort,
  formatDateDayMonth,
} from './racePlanEngine';

describe('racePlanEngine — Duração recomendada & conversões', () => {
  it('retorna as semanas mínimas corretas por distância e nível', () => {
    expect(getRecommendedPrepWeeks(5, 'iniciante')).toBe(6);
    expect(getRecommendedPrepWeeks(10, 'iniciante')).toBe(10);
    expect(getRecommendedPrepWeeks(21.1, 'iniciante')).toBe(16);
    expect(getRecommendedPrepWeeks(42.2, 'iniciante')).toBe(24);

    expect(getRecommendedPrepWeeks(10, 'avancado')).toBe(4);
    expect(getRecommendedPrepWeeks(42.2, 'avancado')).toBe(12);
  });

  it('calcula os dias de recuperação pós-prova de acordo com Bloco 2.3 #2', () => {
    expect(getRecoveryDaysAfterRace(10, 'iniciante')).toBe(7);
    expect(getRecoveryDaysAfterRace(21.1, 'iniciante')).toBe(14);
    expect(getRecoveryDaysAfterRace(42.2, 'iniciante')).toBe(28);
    expect(getRecoveryDaysAfterRace(42.2, 'avancado')).toBe(21);
  });

  it('calcula o taper de acordo com a prioridade A/B/C, por inteiro sensível ao nível (Fase C)', () => {
    // A-race: taper longo, e agora sensível ao nível — Fase C passou a usar
    // a tabela completa da doutrina (Bloco 2.3 #1) em vez de um valor flat
    // por distância. Iniciante numa maratona: 10-14 dias (limite superior
    // 14 → 2 semanas), mais curto que básico/médio/avançado (14-21 dias →
    // 3 semanas) — antes disto a app dava sempre 3 semanas a toda a gente.
    expect(getTaperWeeks(10, 'a', 'iniciante')).toBe(1);
    expect(getTaperWeeks(21.1, 'a', 'iniciante')).toBe(2);
    expect(getTaperWeeks(42.2, 'a', 'iniciante')).toBe(2);
    expect(getTaperWeeks(42.2, 'a', 'basico')).toBe(3);
    expect(getTaperWeeks(42.2, 'a', 'avancado')).toBe(3);

    // B-race / C-race: taper curto (1 semana), independente do nível
    expect(getTaperWeeks(42.2, 'b', 'iniciante')).toBe(1);
    expect(getTaperWeeks(42.2, 'c', 'iniciante')).toBe(1);
  });

  it('calcula distância equivalente em trail (fator 100m D+ = 1km plano)', () => {
    expect(calculateEquivalentFlatKm(20, 1000, 'trail')).toBe(30);
    expect(calculateEquivalentFlatKm(10, null, 'trail')).toBe(10);
    expect(calculateEquivalentFlatKm(10, 500, 'estrada')).toBe(10); // estrada ignora D+
  });
});

describe('racePlanEngine — calculateRaceTrainingPlan', () => {
  const sampleRace = {
    id: 'race-10k',
    name: 'Corrida do Tejo',
    date: '2026-10-15',
    distance_km: 10,
    race_type: 'estrada',
    race_priority: 'a',
    experience_level: 'medio',
    target_time: '50:00',
    target_pace_seconds_per_km: 300,
  };

  it('calcula corretamente o macrociclo, datas e contadores antes do início', () => {
    // 6 semanas antes de 2026-10-15 é ~2026-09-03
    const today = '2026-08-01';
    const plan = calculateRaceTrainingPlan({
      race: sampleRace,
      profile: { experience_level: 'medio' },
      runs: [],
      todayISO: today,
    });

    expect(plan.totalWeeks).toBe(6);
    expect(plan.daysToRace).toBe(75);
    expect(plan.daysToStart).toBeGreaterThan(0);
    expect(plan.trainingStatus).toBe('not_started');
    expect(plan.progressPercentage).toBe(0);
    expect(plan.phases).toHaveLength(5);
  });

  it('calcula corretamente o progresso e a fase ativa quando em treino', () => {
    // Prova a 10 de Outubro de 2026 (total 6 semanas de plano = início 29 de Agosto)
    // Hoje = 15 de Setembro de 2026 (~semana 3)
    const today = '2026-09-15';
    const plan = calculateRaceTrainingPlan({
      race: { ...sampleRace, date: '2026-10-10' },
      profile: { experience_level: 'medio' },
      runs: [
        { date: '2026-09-01', distance_km: 8, duration_seconds: 2400, training_type: 'facil' },
        { date: '2026-09-05', distance_km: 10, duration_seconds: 3000, training_type: 'longo' },
        { date: '2026-09-10', distance_km: 6, duration_seconds: 1800, training_type: 'regenerativo' },
      ],
      todayISO: today,
    });

    expect(plan.trainingStatus).toBe('in_progress');
    expect(plan.currentWeek).toBeGreaterThanOrEqual(1);
    expect(plan.progressPercentage).toBeGreaterThan(0);
    expect(plan.currentPhase).toBeDefined();
    expect(plan.phases.some(p => p.state === 'active')).toBe(true);
  });

  it('avalia o desempenho da Carol proporcionalmente ao cumprimento do volume alvo e disciplina', () => {
    // Prova a 15 de Dezembro de 2026 (8 semanas à frente de hoje = 20 de Outubro)
    // 6 semanas de plano = início a 3 de Novembro
    // Fase Base (2 semanas): 3 de Novembro a 16 de Novembro (alvo: 35 km/sem * 2 = 70 km)
    // Atleta com 65 km realizados e 80% em Z1/Z2
    const today = '2026-11-20';
    const runs = [
      { date: '2026-11-04', distance_km: 10, duration_seconds: 3000, training_type: 'facil' },
      { date: '2026-11-06', distance_km: 15, duration_seconds: 4500, training_type: 'longo' },
      { date: '2026-11-09', distance_km: 10, duration_seconds: 3000, training_type: 'regenerativo' },
      { date: '2026-11-11', distance_km: 10, duration_seconds: 3000, training_type: 'facil' },
      { date: '2026-11-14', distance_km: 20, duration_seconds: 6000, training_type: 'longo' },
    ];

    const plan = calculateRaceTrainingPlan({
      race: { ...sampleRace, date: '2026-12-15' },
      profile: { experience_level: 'medio' },
      runs,
      todayISO: today,
    });

    const basePhase = plan.phases.find(p => p.id === 'base');
    expect(basePhase.evaluation).toBeDefined();
    expect(basePhase.evaluation.metrics.runsCount).toBe(5);
    expect(basePhase.evaluation.metrics.totalKm).toBe(65);
    expect(basePhase.evaluation.score).toBeGreaterThanOrEqual(85);
    expect(basePhase.evaluation.stars).toBeGreaterThanOrEqual(4);
    expect(basePhase.evaluation.summary).toContain('Base aeróbica');
  });

  it('penaliza o score da fase quando o volume está muito abaixo do alvo e a prova tem tempo insuficiente', () => {
    // Prova a 2 semanas da data atual com volume insuficiente
    const today = '2026-09-20';
    const runs = [
      { date: '2026-09-02', distance_km: 5, duration_seconds: 1500, training_type: 'facil' },
    ];

    const plan = calculateRaceTrainingPlan({
      race: { ...sampleRace, date: '2026-10-05' },
      profile: { experience_level: 'medio' },
      runs,
      todayISO: today,
    });

    const basePhase = plan.phases.find(p => p.id === 'base');
    expect(basePhase.evaluation.score).toBeLessThan(70);
    expect(basePhase.evaluation.gradeLabel).toMatch(/Abaixo do Alvo|Ajuste Recomendado/);
    expect(basePhase.evaluation.summary).toContain('abaixo do alvo');
  });

  it('lida graciosamente com provas no passado (concluídas)', () => {
    const today = '2026-11-01';
    const plan = calculateRaceTrainingPlan({
      race: sampleRace, // 2026-10-15
      profile: { experience_level: 'medio' },
      runs: [],
      todayISO: today,
    });

    expect(plan.trainingStatus).toBe('completed');
    expect(plan.daysToRace).toBeLessThan(0);
    expect(plan.progressPercentage).toBe(100);
    expect(plan.carolAnalysis.overviewText).toContain('já foi realizada');
  });
});
