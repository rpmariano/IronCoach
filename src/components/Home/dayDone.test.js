import { describe, it, expect } from 'vitest';
import { doneLine, wasDayDoneSeen } from './dayDone';
import { expectCarolVoice } from '../../test/carolVoice';

/* O dia fechado: o que foi feito contra o que estava pedido, sem aplauso. */

const corrida = (o = {}) => ({ id: 'i1', kind: 'corrida', status: 'concluido', target_distance_km: 8, completed_run_id: 'r1', ...o });
const run = (distance_km, duration_seconds) => ({ id: 'r1', distance_km, duration_seconds });

describe('doneLine', () => {
  it('a corrida feita, com o ritmo, e cumprida', () => {
    expect(doneLine(corrida(), { runs: [run(8.2, 8.2 * 331)] })).toEqual({ text: '8,2 km a 5.31 por km.', verdict: 'Cumprido.' });
  });

  it('abaixo do pedido diz quanto; bem acima também', () => {
    expect(doneLine(corrida(), { runs: [run(6.1, 2000)] }).verdict).toBe('Ficaste nos 6,1 de 8 km.');
    expect(doneLine(corrida(), { runs: [run(10, 3300)] }).verdict).toBe('Mais 2 km do que o plano pedia.');
  });

  it('sem a corrida ligada, só "Feito." — nada inventado', () => {
    expect(doneLine(corrida(), { runs: [] })).toEqual({ text: 'Feito.', verdict: null });
  });

  it('o ginásio: séries e o volume', () => {
    const s = { id: 's1', workout_session_sets: [{ weight_kg: 60, reps: 10 }, { weight_kg: 60, reps: 8 }] };
    const l = doneLine({ id: 'g', kind: 'ginasio', status: 'concluido', completed_session_id: 's1' }, { gymSessions: [s] });
    expect(l.text).toMatch(/^2 séries/);
  });

  /* Pedido 2026-09-26: «Cumprido.» só quando a comparação o torna
     verdadeiro. No código antigo, cada um destes dava «Cumprido.». */
  describe('«Cumprido.» só quando é verdade', () => {
    const series = (n) => Array.from({ length: n }, () => ({ weight: 12, reps: 10 }));
    const ginasio = (o = {}) => ({ id: 'g', kind: 'ginasio', status: 'concluido', completed_session_id: 's1', categories: ['Pernas'], target_duration_min: 60, ...o });
    const sessao = (o = {}) => ({ id: 's1', duration_seconds: 60 * 60, categories: ['Pernas Inferiores', 'Glúteos'], workout_session_sets: series(3), ...o });

    it('o caso do relato: pernas de 60 min, registado com 15 min de braços — não é cumprido', () => {
      const l = doneLine(ginasio(), { gymSessions: [sessao({ duration_seconds: 15 * 60, categories: ['Bíceps', 'Tríceps'] })] });
      expect(l.text).toBe('3 séries · 360 kg levantados.');
      expect(l.verdict).toBe('O plano pedia pernas; fizeste bíceps e tríceps.');
      expectCarolVoice(l.verdict);
    });

    it('a zona certa mas curta: diz quanto', () => {
      const l = doneLine(ginasio(), { gymSessions: [sessao({ duration_seconds: 15 * 60 })] });
      expect(l.verdict).toBe('Ficaste nos 15 de 60 min.');
      expectCarolVoice(l.verdict);
    });

    it('a zona certa e a duração quase toda (80% ou mais): cumprido', () => {
      expect(doneLine(ginasio(), { gymSessions: [sessao()] }).verdict).toBe('Cumprido.');
      expect(doneLine(ginasio(), { gymSessions: [sessao({ duration_seconds: 48 * 60 })] }).verdict).toBe('Cumprido.');
      expect(doneLine(ginasio(), { gymSessions: [sessao({ duration_seconds: 47 * 60 })] }).verdict).toBe('Ficaste nos 47 de 60 min.');
    });

    it('o «Pernas» do plano é a mesma zona que «Pernas Superiores» do registo; «Full Body» serve qualquer uma', () => {
      expect(doneLine(ginasio(), { gymSessions: [sessao({ categories: ['Pernas Superiores'] })] }).verdict).toBe('Cumprido.');
      expect(doneLine(ginasio(), { gymSessions: [sessao({ categories: ['Full Body'] })] }).verdict).toBe('Cumprido.');
    });

    it('sem nada que se compare — sem duração pedida nem grupos que se saibam ler —, sem veredicto', () => {
      const semAlvo = ginasio({ categories: [], target_duration_min: null });
      expect(doneLine(semAlvo, { gymSessions: [sessao()] }).verdict).toBeNull();
      // Uma modalidade de aula não é uma zona do corpo: não se inventa nada.
      const aula = ginasio({ categories: ['Pilates'], target_duration_min: null });
      expect(doneLine(aula, { gymSessions: [sessao({ categories: ['Core/Abdominais'] })] }).verdict).toBeNull();
    });

    it('uma aula sem séries diz os minutos, e compara-os', () => {
      const aula = ginasio({ categories: [], target_duration_min: 45 });
      const l = doneLine(aula, { gymSessions: [sessao({ categories: [], workout_session_sets: [], duration_seconds: 50 * 60 })] });
      expect(l).toEqual({ text: '50 min.', verdict: 'Cumprido.' });
    });

    /* Revisão de 2026-09-26: os minutos ditos são os comparados. No código
       anterior, 20 segundos davam «0 min.» e «Ficaste nos 0 de 60 min.», e
       47,6 min eram curtos com «Ficaste nos 48 de 60 min.». */
    it('uns segundos não são «0 min.», e o número dito é o que se compara', () => {
      const segundos = doneLine(ginasio(), { gymSessions: [sessao({ categories: [], workout_session_sets: [], duration_seconds: 20 })] });
      expect(segundos).toEqual({ text: 'Feito.', verdict: null });
      const comSeries = doneLine(ginasio(), { gymSessions: [sessao({ duration_seconds: 20 })] });
      expect(comSeries).toEqual({ text: '3 séries · 360 kg levantados.', verdict: 'Cumprido.' });
      expect(doneLine(ginasio(), { gymSessions: [sessao({ duration_seconds: 2856 })] }).verdict).toBe('Cumprido.');
      expect(doneLine(ginasio(), { gymSessions: [sessao({ duration_seconds: 2820 })] }).verdict).toBe('Ficaste nos 47 de 60 min.');
    });

    it('6 km de corrida contínua contra intervalos de 6 km: bate nos km, não é o treino pedido', () => {
      const l = doneLine(corrida({ training_type: 'intervalos', target_distance_km: 6 }), { runs: [{ ...run(6, 6 * 330), training_type: 'continuo' }] });
      expect(l.verdict).toBe('O plano pedia intervalos; ficou registada como corrida contínua.');
      expectCarolVoice(l.verdict);
    });

    it('o mesmo tipo, ou dois tipos soltos (contínua por longa), comparam-se pelos km', () => {
      const pedido = corrida({ training_type: 'intervalos', target_distance_km: 6 });
      expect(doneLine(pedido, { runs: [{ ...run(6, 1980), training_type: 'intervalos' }] }).verdict).toBe('Cumprido.');
      const longo = corrida({ training_type: 'longo', target_distance_km: 16 });
      expect(doneLine(longo, { runs: [{ ...run(16, 16 * 340), training_type: 'continuo' }] }).verdict).toBe('Cumprido.');
      // Um registo sem tipo (a prova, registos antigos) não se compara.
      expect(doneLine(pedido, { runs: [run(6, 1980)] }).verdict).toBe('Cumprido.');
    });

    it('trabalho forte num dia de recuperação também não é o treino pedido', () => {
      const l = doneLine(corrida({ training_type: 'recuperacao', target_distance_km: 6 }), { runs: [{ ...run(6, 1800), training_type: 'fartlek' }] });
      expect(l.verdict).toBe('O plano pedia recuperação; ficou registada como fartlek.');
    });
  });

  it('por fazer: nada', () => {
    expect(doneLine(corrida({ status: 'pendente' }), { runs: [run(8, 2600)] })).toBeNull();
  });
});

/* Visto noutro dispositivo (ação 5.1): a impressão 'moment:daydone:<dia>'
   lida do servidor conta como visto, mesmo sem a marca local. */
describe('wasDayDoneSeen', () => {
  const semStorage = { getItem: () => null, setItem: () => {} };

  it('a impressão deste dia conta como visto; outro dia ou nenhuma, não', () => {
    expect(wasDayDoneSeen('u1', '2026-09-21', new Set(['moment:daydone:2026-09-21']), semStorage)).toBe(true);
    expect(wasDayDoneSeen('u1', '2026-09-21', new Set(['moment:daydone:2026-09-20']), semStorage)).toBe(false);
    expect(wasDayDoneSeen('u1', '2026-09-21', new Set(), semStorage)).toBe(false);
  });
});
