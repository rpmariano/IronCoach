import { describe, it, expect } from 'vitest';
import { format, subDays } from 'date-fns';
import { expectCarolVoice } from '../test/carolVoice';
import { calculateRaceTrainingPlan } from './racePlanEngine';
import { detectCoachInsights } from './biEngine';
import { COACH_ASYNC_FALLBACK_TEXT, COACH_IMMEDIATE_FAILURE_TEXT, COACH_EMPTY_REPLY_TEXT } from '../components/Coach/Coach';

/* Ação P.12: o que não tinha teste nenhum a verificar a voz — os quatro
   ramos do parecer da prova (racePlanEngine), os insights de prova do
   biEngine, e as constantes de erro do Coach.jsx. Os catorze módulos que já
   tinham o seu próprio teste de voz (agora via expectCarolVoice) ficam nos
   seus ficheiros — aqui só o que faltava. */

const iso = (daysAgo) => format(subDays(new Date(), daysAgo), 'yyyy-MM-dd');

describe('racePlanEngine — carolOverviewText, cada ramo na voz dela', () => {
  const raceBase = { id: 'r1', name: 'Corrida do Tejo', distance_km: 10, race_type: 'estrada', race_priority: 'a', experience_level: 'medio' };
  const overview = (race, runs = []) => calculateRaceTrainingPlan({ race: { ...raceBase, ...race }, profile: {}, runs, todayISO: iso(0) }).carolAnalysis.overviewText;

  /* Revisão pré-deploy de 2026-09-25 (a P.12 que ficara por acabar): sem
     elogio automático — "Excelente dedicação" saía em qualquer prova
     concluída —, sem "o trabalho duro está feito" dito a quem não treinou, e
     sem falar de si na terceira pessoa (expectCarolVoice). */
  const semRotina = (text) => {
    expectCarolVoice(text);
    expect(text).not.toMatch(/Excelente|trabalho duro|sono reparador/);
  };

  it('prova já realizada (daysToRace < 0)', () => {
    const text = overview({ date: iso(10) });
    expect(text).toContain('A prova já foi');
    semRotina(text);
  });

  it('antes do início do macrociclo (daysToStart > 0)', () => {
    // 6 semanas de preparação para um 10k nível médio — a prova a 120 dias
    // garante folga antes do início ideal do plano.
    const text = overview({ date: iso(-120) });
    expect(text).toMatch(/^Faltam \d+ dias para começarmos o ciclo/);
    semRotina(text);
  });

  it('dia da prova (daysToRace = 0)', () => {
    const text = overview({ date: iso(0) });
    expect(text).toContain('A prova é hoje');
    semRotina(text);
    // Terceira revisão (2026-09-25): na manhã da prova, a fase da prova ainda
    // não está "Concluída · 95%" — sem nota, a pílula não aparece.
    const plan = calculateRaceTrainingPlan({ race: { ...raceBase, date: iso(0) }, profile: {}, runs: [], todayISO: iso(0) });
    const fase = plan.phases.find((p) => p.id === 'race_recovery');
    expect(fase.evaluation.score).toBeNull();
    expect(fase.evaluation.gradeLabel).toBe('Dia da Prova');
    expect(fase.evaluation.summary).toMatch(/^É dia de prova/);
  });

  it('semana da prova (0 < daysToRace <= 7), com o singular a um dia', () => {
    const text = overview({ date: iso(-5) });
    expect(text).toMatch(/^Faltam 5 dias: esta semana já não se ganha forma/);
    semRotina(text);
    expect(overview({ date: iso(-1) })).toMatch(/^Falta 1 dia:/);
  });

  it('em plena preparação, com corridas registadas nesta fase', () => {
    const raceDate = iso(-40); // dentro do macrociclo, fora da semana da prova
    const runs = Array.from({ length: 6 }, (_, i) => ({ date: iso(i * 3), distance_km: 8, duration_seconds: 2700, kind: 'treino' }));
    const text = overview({ date: raceDate }, runs);
    expect(text).toMatch(/^Estás na Base Aeróbica, semana /);
    semRotina(text);
    // Terceira revisão (2026-09-25): o que a fase quer, sem repetir o cartão
    // da fase (as fáceis, o volume), e o volume com vírgula.
    expect(text).toContain('A base é para aguentares volume');
    expect(text).not.toMatch(/contam como fáceis|conta como fácil/);
    expect(text).not.toMatch(/\d\.\d km por semana/);
  });

  it('em plena preparação, ainda sem corridas registadas nesta fase', () => {
    const text = overview({ date: iso(-40) });
    expect(text).toContain('ainda não tenho nenhuma corrida tua registada');
    semRotina(text);
  });
});

describe('biEngine — insights de prova, na voz dela', () => {
  it('dia da prova, reta final e polimento', () => {
    const hoje = detectCoachInsights({ runs: [], raceEvents: [{ id: 'ev-1', status: 'agendada', date: iso(0), distance_km: 10, name: 'Corrida do Tejo' }] }, {});
    expectCarolVoice(hoje.find((i) => i.id === 'race_day_ev-1').message);

    const vespera = detectCoachInsights({ runs: [], raceEvents: [{ id: 'ev-1', status: 'agendada', date: iso(-5), distance_km: 21, name: 'Meia Maratona' }] }, {});
    expectCarolVoice(vespera.find((i) => i.id === 'race_final_week_ev-1').message);

    const taper = detectCoachInsights({ runs: [], raceEvents: [{ id: 'ev-2', status: 'agendada', date: iso(-9), distance_km: 21, name: 'Meia Maratona' }] }, {});
    expectCarolVoice(taper.find((i) => i.id === 'race_tapering_ev-2').message);
  });

  it('ritmo-alvo irrealista', () => {
    // Histórico sólido (8 semanas a ~40 km/semana, nível avançado) para não
    // cair em tempo_insuficiente/volume_insuficiente — só sobra o ritmo.
    const runs = Array.from({ length: 40 }, (_, i) => ({
      date: iso(2 + i * 2), distance_km: 16, duration_seconds: 4800, kind: 'treino', training_type: 'continuo',
    }));
    const raceEvents = [{
      id: 'ev-3', status: 'agendada', date: iso(-70), distance_km: 10, name: 'Corrida Rápida',
      experience_level: 'avancado', target_pace_seconds_per_km: 180, // 3:00/km — irrealista
    }];
    const insights = detectCoachInsights({ runs, raceEvents }, { experience_level: 'avancado' });
    const pace = insights.find((i) => i.id === 'race_tactic_pace');
    expect(pace).toBeTruthy();
    expectCarolVoice(pace.message);
  });
});

describe('Coach.jsx — as constantes de erro, na voz dela', () => {
  it('nunca "do Coach" em terceira pessoa, nunca "a tua mensagem" (nem sempre há uma)', () => {
    for (const text of [COACH_ASYNC_FALLBACK_TEXT, COACH_IMMEDIATE_FAILURE_TEXT, COACH_EMPTY_REPLY_TEXT]) {
      expectCarolVoice(text);
      expect(text.toLowerCase()).not.toContain('do coach');
      expect(text.toLowerCase()).not.toContain('a tua mensagem');
    }
  });
});
