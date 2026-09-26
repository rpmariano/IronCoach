import { describe, it, expect } from 'vitest';
import { firstRecordMoment } from './firstRecord';
import { expectCarolVoice } from '../test/carolVoice';

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
      expectCarolVoice(`${m.title} ${m.sub}`);
    }
    expect(firstRecordMoment('agua', {}, null)).toBeNull();
  });
});

/* Revisão de 2026-09-26: a primeira corrida gravada sem tempo (o
   "Continuar assim mesmo" da persiana das métricas em falta) não tem ritmo
   nem esforço, e a Carol dizia que já sabia os três. O registo é a linha de
   `runs` que a RunRegistration acabou de gravar. */
describe('firstRecordMoment — a primeira corrida diz só o que o registo tem', () => {
  const vazio = { runs: [], meals: [], gymSessions: [], bodyAssessments: [] };
  const corrida = (record) => firstRecordMoment('run', vazio, { id: 'r1', ...record });

  it('com distância e tempo: o ritmo, a distância e o esforço', () => {
    expect(corrida({ distance_km: 5.2, duration_seconds: 1800 }).sub)
      .toBe('Agora já sei por onde começar: o teu ritmo, a tua distância, o teu esforço.');
  });

  it('sem tempo: só a distância, e o ritmo fica para quando houver tempo', () => {
    for (const duration_seconds of [null, undefined, 0]) {
      const m = corrida({ distance_km: 5.2, duration_seconds });
      expect(m.title).toBe('A primeira corrida.');
      expect(m.sub).toBe('Já sei a tua distância. Com o tempo, fico a saber o teu ritmo.');
      expect(m.sub).not.toMatch(/já sei por onde começar|o teu esforço/);
    }
  });

  it('sem distância, ou sem nenhum dos dois: nunca afirma o que não tem', () => {
    const semDistancia = corrida({ distance_km: null, duration_seconds: 1800 });
    expect(semDistancia.sub).toBe('Já sei quanto tempo correste. Com a distância, fico a saber o teu ritmo.');
    const semNada = corrida({ distance_km: null, duration_seconds: null });
    expect(semNada.sub).toBe('É o teu ponto de partida. Com a distância e o tempo, fico a saber o teu ritmo.');
    for (const m of [semDistancia, semNada]) expect(m.sub).not.toMatch(/Já sei a tua distância|o teu esforço/);
  });

  it('todas na voz dela', () => {
    for (const r of [{ distance_km: 5, duration_seconds: 1500 }, { distance_km: 5 }, { duration_seconds: 1500 }, {}]) {
      const m = corrida(r);
      expectCarolVoice(`${m.title} ${m.sub}`);
    }
  });
});

/* O primeiro registo de ginásio diz-se pelo que ele é (pedido 2026-09-26):
   "Já sei o que levantas" numa aula de pilates, ou num treino sem cargas, é
   ela a afirmar uma coisa que o registo não tem. O registo é o que a
   GymRegistration grava: a sessão da analyze-gym com as séries em
   `workout_session_sets` ({ reps, weight }). */
describe('firstRecordMoment — o primeiro treino de ginásio', () => {
  const vazio = { runs: [], meals: [], gymSessions: [], bodyAssessments: [] };
  const gym = (record) => firstRecordMoment('gym', vazio, record);

  it('uma aula: é a primeira aula, com a modalidade, e nada de cargas', () => {
    const m = gym({ id: 'g1', kind: 'aula', class_types: ['Pilates'], workout_session_sets: [] });
    expect(m.title).toBe('A primeira aula de pilates.');
    expect(m.sub).toBe('É o teu ponto de partida. Da próxima vez, já tenho com que comparar.');
    expect(m.sub).not.toMatch(/levantas|cargas|subir/);
    expect(m.everFirst).toBe(true);
  });

  it('a modalidade diz-se como se diz: siglas e marcas como estão, nomes comuns em minúscula', () => {
    expect(gym({ kind: 'aula', class_types: ['HIIT'] }).title).toBe('A primeira aula de HIIT.');
    expect(gym({ kind: 'aula', class_types: ['RPM/Cycling'] }).title).toBe('A primeira aula de RPM/Cycling.');
    expect(gym({ kind: 'aula', class_types: ['Treino Funcional'] }).title).toBe('A primeira aula de treino funcional.');
    // "Outro", nenhuma, ou duas de uma vez: sem modalidade na frase.
    expect(gym({ kind: 'aula', class_types: ['Outro'] }).title).toBe('A primeira aula.');
    expect(gym({ kind: 'aula', class_types: [] }).title).toBe('A primeira aula.');
    expect(gym({ kind: 'aula', class_types: ['Yoga', 'Pilates'] }).title).toBe('A primeira aula.');
  });

  it('uma aula com cargas (Body Pump) continua a ser uma aula', () => {
    const m = gym({ kind: 'aula', class_types: ['Body Pump'], workout_session_sets: [{ reps: 12, weight: 10 }] });
    expect(m.title).toBe('A primeira aula de Body Pump.');
    expect(m.sub).not.toMatch(/levantas/);
  });

  it('força com cargas: aí, sim, ela já sabe o que levantas', () => {
    const m = gym({ kind: 'forca', workout_session_sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 60 }] });
    expect(m.title).toBe('O primeiro treino de ginásio.');
    expect(m.sub).toBe('Já sei o que levantas. Da próxima vez, digo-te se é para subir.');
  });

  it('força só com repetições (peso do corpo): as repetições, sem pedir cargas a quem faz flexões', () => {
    const m = gym({ kind: 'forca', workout_session_sets: [{ reps: 15, weight: null }, { reps: 12, weight: null }] });
    expect(m.sub).toBe('Já sei quantas repetições fazes. Da próxima vez, digo-te se é para subir.');
  });

  it('força sem séries nenhumas: pede os exercícios e as cargas, e diz porquê', () => {
    const m = gym({ kind: 'forca', workout_session_sets: [] });
    expect(m.sub).toBe('Da próxima vez, regista também os exercícios e as cargas: é com eles que te digo se é para subir.');
    expect(m.sub).not.toMatch(/Já sei/);
    // Sem o campo das séries também não há cargas para saber.
    expect(gym({ kind: 'forca' }).sub).toBe(m.sub);
  });

  /* Revisão de 2026-09-26: o registo manual não tem campos de séries, e
     quem o usa escreve os exercícios e as cargas no "Contexto do treino"
     (a analyze-gym lê-os daí). Pedir-lhe que os registe era pedir o que
     acabou de escrever. */
  it('força sem séries mas com o treino escrito nas notas: não pede o que acabou de ser escrito', () => {
    const m = gym({ kind: 'forca', workout_session_sets: [], notes: 'Agachamento 4x10 com 40 kg, supino 3x8 com 50 kg.' });
    expect(m.title).toBe('O primeiro treino de ginásio.');
    expect(m.sub).toBe('É o teu ponto de partida. Da próxima vez, já tenho com que comparar.');
    expect(m.sub).not.toMatch(/regista|cargas/);
    // Só espaços não é treino escrito: continua o pedido.
    expect(gym({ kind: 'forca', workout_session_sets: [], notes: '   ' }).sub).toMatch(/^Da próxima vez, regista também/);
    expectCarolVoice(`${m.title} ${m.sub}`);
  });

  it('sem o registo à mão, a frase que serve a qualquer treino — nunca "já sei o que levantas"', () => {
    const m = firstRecordMoment('gym', vazio, null);
    expect(m.title).toBe('O primeiro treino de ginásio.');
    expect(m.sub).not.toMatch(/levantas/);
  });

  it('o segundo registo de ginásio, aula ou força, já não é momento', () => {
    expect(firstRecordMoment('gym', { gymSessions: [{ id: 'g0' }] }, { id: 'g1', kind: 'aula', class_types: ['Pilates'] })).toBeNull();
  });

  it('todas na voz dela', () => {
    const casos = [
      null,
      { kind: 'aula', class_types: ['Zumba'] },
      { kind: 'aula', class_types: [] },
      { kind: 'forca', workout_session_sets: [{ reps: 5, weight: 100 }] },
      { kind: 'forca', workout_session_sets: [{ reps: 5 }] },
      { kind: 'forca', workout_session_sets: [] },
    ];
    for (const r of casos) {
      const m = gym(r);
      expectCarolVoice(`${m.title} ${m.sub}`);
    }
  });
});
