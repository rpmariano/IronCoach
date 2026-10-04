import { describe, it, expect } from 'vitest';
import { readinessHint, readinessMissing } from './readinessHints';

const p = (key, hasData, score = hasData ? 80 : 0) => ({ key, hasData, score, label: key, desc: '' });

describe('readinessHint — o que falta para a prontidão dizer alguma coisa', () => {
  it('a calibrar sem nada: pede corridas e refeições', () => {
    const r = { calibrating: true, pillars: [p('ea', false), p('calories', false), p('vdot', false)] };
    expect(readinessHint(r)).toBe('Regista corridas e refeições e eu digo-te como estás.');
  });

  it('com carga, só falta nutrição: diz quantos pilares contam', () => {
    const r = { calibrating: false, pillars: [p('acwr', true), p('ea', false), p('calories', false), p('vdot', true)] };
    expect(readinessHint(r)).toBe('Conta com 2 de 4 pilares. Para os outros, regista refeições.');
  });

  it('com carga mas sem VDOT: pede uma corrida rápida, não "corridas"', () => {
    expect(readinessMissing([p('acwr', true), p('ea', true), p('calories', true), p('vdot', false)]))
      .toEqual(['uma corrida rápida (prova, tempo ou intervalos)']);
  });

  it('tudo com dados: nenhuma frase', () => {
    expect(readinessHint({ calibrating: false, pillars: [p('acwr', true), p('ea', true), p('calories', true), p('vdot', true)] })).toBeNull();
  });
});
