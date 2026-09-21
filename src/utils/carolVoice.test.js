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

describe('racePlanEngine — carolOverviewText, os quatro ramos', () => {
  const raceBase = { id: 'r1', name: 'Corrida do Tejo', distance_km: 10, race_type: 'estrada', race_priority: 'a', experience_level: 'medio' };

  it('prova já realizada (daysToRace < 0)', () => {
    const plan = calculateRaceTrainingPlan({ race: { ...raceBase, date: iso(10) }, profile: {}, runs: [], todayISO: iso(0) });
    expect(plan.carolAnalysis.overviewText).toContain('já foi realizada');
    expectCarolVoice(plan.carolAnalysis.overviewText);
  });

  it('antes do início do macrociclo (daysToStart > 0)', () => {
    // 6 semanas de preparação para um 10k nível médio — a prova a 120 dias
    // garante folga antes do início ideal do plano.
    const plan = calculateRaceTrainingPlan({ race: { ...raceBase, date: iso(-120) }, profile: {}, runs: [], todayISO: iso(0) });
    expect(plan.carolAnalysis.overviewText).toContain('Faltam');
    expect(plan.carolAnalysis.overviewText).toContain('início oficial do macrociclo');
    expectCarolVoice(plan.carolAnalysis.overviewText);
  });

  it('semana decisiva da prova (0 < daysToRace <= 7)', () => {
    const plan = calculateRaceTrainingPlan({ race: { ...raceBase, date: iso(-5) }, profile: {}, runs: [], todayISO: iso(0) });
    expect(plan.carolAnalysis.overviewText).toContain('semana decisiva');
    expectCarolVoice(plan.carolAnalysis.overviewText);
  });

  it('em plena preparação, com corridas registadas nesta fase', () => {
    const raceDate = iso(-40); // dentro do macrociclo, fora da semana decisiva
    const runs = Array.from({ length: 6 }, (_, i) => ({ date: iso(i * 3), distance_km: 8, duration_seconds: 2700, kind: 'treino' }));
    const plan = calculateRaceTrainingPlan({ race: { ...raceBase, date: raceDate }, profile: {}, runs, todayISO: iso(0) });
    expect(plan.carolAnalysis.overviewText).toContain('Encontras-te na');
    expectCarolVoice(plan.carolAnalysis.overviewText);
  });

  it('em plena preparação, ainda sem corridas registadas nesta fase', () => {
    const raceDate = iso(-40);
    const plan = calculateRaceTrainingPlan({ race: { ...raceBase, date: raceDate }, profile: {}, runs: [], todayISO: iso(0) });
    expect(plan.carolAnalysis.overviewText).toContain('mas ainda sem corridas registadas');
    expectCarolVoice(plan.carolAnalysis.overviewText);
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
