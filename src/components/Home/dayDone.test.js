import { describe, it, expect } from 'vitest';
import { doneLine, wasDayDoneSeen } from './dayDone';

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
    expect(l.verdict).toBe('Cumprido.');
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
