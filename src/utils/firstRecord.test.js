import { describe, it, expect } from 'vitest';
import { firstRecordMoment } from './firstRecord';

/* O primeiro registo de cada tipo é o único que a Carol reconhece à parte
   (CAROL.md: não aplaude tudo). O registo acabado de criar pode ou não já
   estar no store — conta-se sem ele. */

describe('firstRecordMoment', () => {
  it('a primeira corrida: sim, esteja ou não já no store', () => {
    const run = { id: 'r1' };
    expect(firstRecordMoment('run', { runs: [] }, run)).toMatchObject({ title: 'A primeira corrida.' });
    expect(firstRecordMoment('run', { runs: [run] }, run)).toMatchObject({ title: 'A primeira corrida.' });
  });

  it('a segunda corrida: não', () => {
    expect(firstRecordMoment('run', { runs: [{ id: 'r0' }, { id: 'r1' }] }, { id: 'r1' })).toBeNull();
  });

  it('cada tipo conta à parte; everFirst só no primeiro de sempre', () => {
    const st = { runs: [{ id: 'r0' }], meals: [], gymSessions: [], bodyAssessments: [] };
    expect(firstRecordMoment('meal', st, { id: 'm1' })).toMatchObject({ title: 'A primeira refeição.', everFirst: false });
    expect(firstRecordMoment('meal', { meals: [] }, { id: 'm1' }).everFirst).toBe(true);
  });

  it('na voz dela: sem exclamações; e tipos desconhecidos não dão nada', () => {
    for (const k of ['run', 'meal', 'gym', 'body']) {
      const m = firstRecordMoment(k, {}, null);
      expect(`${m.title} ${m.sub}`).not.toMatch(/!/);
    }
    expect(firstRecordMoment('agua', {}, null)).toBeNull();
  });
});
