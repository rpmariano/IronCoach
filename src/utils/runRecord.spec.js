import { describe, it, expect } from 'vitest';
import { runRecordMoment } from '@formulas/runRecord.ts';
import { expectCarolVoice } from '../test/carolVoice';

/* O recorde num treino: bate algo que já existia, com margem. A primeira
   corrida de 10 km é a primeira, não um recorde.

   Delega em @formulas/runRecord.ts (ação 5.3) — única implementação,
   partilhada com o analyze-run: o comentário da corrida e a confirmação do
   registo passam a usar a mesma régua. */

const run = (id, distance_km, duration_seconds, o = {}) => ({ id, date: '2026-09-10', distance_km, duration_seconds, ...o });

describe('runRecordMoment', () => {
  it('um 10 km mais rápido do que o melhor: recorde nos 10 km', () => {
    const antigas = [run('a', 10, 3000), run('b', 10.2, 3120)]; // melhor: 5:00/km
    const nova = run('n', 10, 2910); // 4:51/km
    const m = runRecordMoment(nova, [...antigas, nova]);
    expect(m).toMatchObject({ kind: 'pace', title: 'Recorde nos 10 km.' });
    expect(m.sub).toMatch(/9 segundos por km mais rápido/);
  });

  it('a meia maratona tem o seu artigo', () => {
    const m = runRecordMoment(run('n', 21.1, 6300), [run('a', 21.1, 6500)]);
    expect(m.title).toBe('Recorde na meia maratona.');
  });

  it('a primeira corrida no escalão não é recorde', () => {
    expect(runRecordMoment(run('n', 10, 2900), [run('a', 5, 1500)])).toBeNull();
  });

  it('menos de um segundo por km é ruído, não recorde', () => {
    expect(runRecordMoment(run('n', 10, 2995), [run('a', 10, 3000)])).toBeNull();
  });

  it('a corrida mais longa, com pelo menos três corridas antes e meio km de margem', () => {
    const antigas = [run('a', 8, 2600), run('b', 12, 3900), run('c', 6, 2000)];
    const m = runRecordMoment(run('n', 14.2, 4800), antigas);
    expect(m).toMatchObject({ kind: 'distance', title: 'A tua corrida mais longa.' });
    expect(m.sub).toMatch(/^14,2 km, mais 2,2 do que/);
    expect(runRecordMoment(run('n', 12.3, 4000), antigas)).toBeNull();
    expect(runRecordMoment(run('n', 20, 7000), antigas.slice(0, 2))).toBeNull();
  });

  it('conta sem a própria corrida, esteja ou não já na lista; nunca exclamações', () => {
    const nova = run('n', 10, 2900);
    const m = runRecordMoment(nova, [run('a', 10, 3000), nova]);
    expect(m.kind).toBe('pace');
    expectCarolVoice(`${m.title} ${m.sub}`);
  });
});

describe('revisão pré-master de 2026-09-19', () => {
  it('uma corrida de 4 km não é recorde nos 5 km', () => {
    expect(runRecordMoment(run('n', 4.1, 1100), [run('a', 5, 1500)])).toBeNull();
  });
});

describe('o "amanhã" da corrida mais longa (specs/carol-frases-contexto.md)', () => {
  const antigas = [run('a', 8, 2600), run('b', 12, 3900), run('c', 6, 2000)];
  // Domingo, 13 de setembro de 2026.
  const longo = run('n', 14.2, 4800, { date: '2026-09-13' });
  const item = (planned_date, training_type, o = {}) => ({ planned_date, kind: 'corrida', training_type, status: 'planeado', ...o });

  it('um longo de domingo registado na segunda não fala de amanhã', () => {
    const m = runRecordMoment(longo, antigas, { todayISO: '2026-09-14', planItems: [] });
    expect(m.sub).toBe('14,2 km, mais 2,2 do que alguma vez fizeste.');
  });

  it('sem saber que dia é hoje, também não', () => {
    expect(runRecordMoment(longo, antigas).sub).toBe('14,2 km, mais 2,2 do que alguma vez fizeste.');
  });

  it('corrida de hoje, sem treino duro amanhã no plano: dia de recuperar', () => {
    const m = runRecordMoment(longo, antigas, { todayISO: '2026-09-13', planItems: [item('2026-09-14', 'regenerativo')] });
    expect(m.sub).toBe('14,2 km, mais 2,2 do que alguma vez fizeste. Amanhã é dia de recuperar, não de repetir.');
    expectCarolVoice(`${m.title} ${m.sub}`);
  });

  it('corrida de hoje com intervalos amanhã no plano: não contradiz o plano', () => {
    const m = runRecordMoment(longo, antigas, { todayISO: '2026-09-13', planItems: [item('2026-09-14T00:00:00', 'intervalos')] });
    expect(m.sub).toBe('14,2 km, mais 2,2 do que alguma vez fizeste. Amanhã, só o que está no plano.');
    expect(m.sub).not.toMatch(/recuperar/);
    expectCarolVoice(`${m.title} ${m.sub}`);
  });

  it('intervalos cancelados, ou só depois de amanhã, não contam', () => {
    const recuperar = /Amanhã é dia de recuperar, não de repetir\.$/;
    expect(runRecordMoment(longo, antigas, { todayISO: '2026-09-13', planItems: [item('2026-09-14', 'intervalos', { status: 'cancelado' })] }).sub).toMatch(recuperar);
    expect(runRecordMoment(longo, antigas, { todayISO: '2026-09-13', planItems: [item('2026-09-15', 'intervalos')] }).sub).toMatch(recuperar);
  });
});
