import { describe, it, expect } from 'vitest';
import { raceForecast, raceTimesBreakdown, targetLine, timeLine, describeDelta } from './raceTimes';
import { classifyRaceOutcome } from './raceOutcome';

/* Os números são os de uma conta real: uma única corrida registada, a
   Corrida do Tejo (10,11 km em 51:28, oficial 51:51), e as provas que o
   atleta tem marcadas. Sem fixtures inventadas — é assim que se percebe se
   o que sai é o que ele vê. */
const TEJO_RUN = {
  id: 'run-tejo', date: '2026-09-13', kind: 'competicao', race_id: 'tejo',
  distance_km: 10.11, duration_seconds: 3088,
  details: { official_time_seconds: 3111 },
};
const PROFILE = { experience_level: 'medio' };

describe('timeLine — o tempo e o ritmo', () => {
  it('deriva o ritmo da distância quando ninguém o dá', () => {
    const l = timeLine(3000, 10);
    expect(l.timeLabel).toBe('50:00');
    expect(l.paceSeconds).toBe(300);
    expect(l.paceLabel).toBe('5.00/km');
  });

  it('prefere o ritmo dado ao derivado — no trail não são o mesmo', () => {
    const l = timeLine(9712, 21.0975, { paceSeconds: 460 });
    expect(l.paceSeconds).toBe(460);
  });

  it('sem tempo não há linha nenhuma', () => {
    expect(timeLine(0, 10)).toBeNull();
    expect(timeLine(null, 10)).toBeNull();
  });
});

describe('targetLine — o objetivo', () => {
  it('lê a coluna numérica e o ritmo-alvo', () => {
    const l = targetLine({ target_time_seconds: 3000, target_pace_seconds_per_km: 300, distance_km: 10 });
    expect(l.timeLabel).toBe('50:00');
    expect(l.paceLabel).toBe('5.00/km');
  });

  /* O hub mostrava o objetivo só quando o campo de TEXTO estava preenchido,
     por isso uma prova criada pela Carol ficava sem objetivo à vista apesar
     de o ter na base de dados. Aqui manda a coluna numérica. */
  it('não depende do campo de texto livre', () => {
    const l = targetLine({ target_time_seconds: 3000, distance_km: 10, target_time: null });
    expect(l).not.toBeNull();
    expect(l.timeLabel).toBe('50:00');
  });

  it('sem objetivo marcado, não inventa', () => {
    expect(targetLine({ distance_km: 10 })).toBeNull();
  });
});

describe('raceForecast — antes da prova', () => {
  const forecast = (race) => raceForecast({ race, runs: [TEJO_RUN], profile: PROFILE });

  it('objetivo quase alcançado: diz a diferença e chama-lhe alinhado', () => {
    const f = forecast({ name: 'Volkswagen Run', race_type: 'estrada', distance_km: 10, target_time_seconds: 3000 });
    expect(f.target.timeLabel).toBe('50:00');
    expect(f.target.paceLabel).toBe('5.00/km');
    expect(f.predicted.timeLabel).toBe('50:52');
    expect(f.predicted.paceLabel).toBe('5.05/km');
    expect(f.stance).toBe('alinhado');
    expect(f.line).toContain('0:52');
  });

  it('objetivo com margem: diz que o treino já aponta abaixo', () => {
    const f = forecast({ name: 'Meia', race_type: 'estrada', distance_km: 21.0975, target_time_seconds: 6962 });
    expect(f.predicted.timeLabel).toBe('1:52:15');
    expect(f.stance).toBe('conservador');
    expect(f.line).toContain('3:47');
    expect(f.line).toContain('margem');
  });

  it('objetivo ambicioso: avisa que não sobra margem', () => {
    const f = forecast({ name: 'Ambiciosa', race_type: 'estrada', distance_km: 10, target_time_seconds: 2700 });
    expect(f.stance).toBe('ambicioso');
    expect(f.line).toContain('ambicioso');
  });

  /* No trail a previsão corre sobre a distância equivalente (100 m de D+
     valem 1 km plano): 21,1 km com 866 m de D+ são 29,8 km planos. Sem
     isso o número sairia absurdamente otimista. */
  it('no trail conta o desnível', () => {
    const f = forecast({ name: 'Trail', race_type: 'trail', distance_km: 21.0975, elevation_gain_m: 866, target_time_seconds: 10200 });
    expect(Math.round(f.effectiveDistanceKm * 10) / 10).toBe(29.8);
    expect(f.predicted.timeLabel).toBe('2:41:52');
    // O ritmo é sobre a distância REAL, que é a que ele vai correr.
    expect(f.predicted.paceLabel).toBe('7.40/km');
  });

  it('avisa quando a previsão é uma extrapolação longa', () => {
    const curta = forecast({ name: 'Dez', race_type: 'estrada', distance_km: 10, target_time_seconds: 3000 });
    const longa = forecast({ name: 'Meia', race_type: 'estrada', distance_km: 21.0975, target_time_seconds: 6962 });
    expect(curta.lowConfidence).toBe(false);
    expect(longa.lowConfidence).toBe(true);
  });

  it('sem objetivo, diz o tempo e pede um objetivo', () => {
    const f = forecast({ name: 'Sem meta', race_type: 'estrada', distance_km: 10 });
    expect(f.target).toBeNull();
    expect(f.line).toContain('Marca um objetivo');
  });

  it('sem corridas registadas não há previsão nenhuma', () => {
    expect(raceForecast({ race: { distance_km: 10 }, runs: [], profile: PROFILE })).toBeNull();
  });
});

describe('raceTimesBreakdown — depois da prova', () => {
  const RACE = {
    id: 'tejo', name: 'Corrida do Tejo', date: '2026-09-13', distance_km: 10,
    race_type: 'estrada', status: 'concluida',
    target_time_seconds: 3300, target_pace_seconds_per_km: 330,
  };

  it('os quatro números com ritmo, e a diferença face ao real', () => {
    const outcome = classifyRaceOutcome({ race: RACE, run: TEJO_RUN, runs: [TEJO_RUN], profile: PROFILE });
    const b = raceTimesBreakdown(outcome, RACE);

    expect(b.real.timeLabel).toBe('51:51');
    expect(b.real.paceLabel).toBe('5.11/km');

    const objetivo = b.rows.find((r) => r.key === 'objetivo');
    expect(objetivo.timeLabel).toBe('55:00');
    expect(objetivo.paceLabel).toBe('5.30/km');
    // Bateu o objetivo por 3:09 — negativo porque foi mais rápido.
    expect(objetivo.delta).toBe(-189);
    expect(describeDelta(objetivo.delta)).toBe('3:09 mais rápido');
  });

  it('sem melhor anterior, a linha não aparece', () => {
    const outcome = classifyRaceOutcome({ race: RACE, run: TEJO_RUN, runs: [TEJO_RUN], profile: PROFILE });
    const b = raceTimesBreakdown(outcome, RACE);
    expect(b.rows.some((r) => r.key === 'melhor')).toBe(false);
  });

  it('sem corrida registada não há repartição nenhuma', () => {
    expect(raceTimesBreakdown({ officialSeconds: 0 }, RACE)).toBeNull();
    expect(raceTimesBreakdown(null, RACE)).toBeNull();
  });
});

describe('describeDelta', () => {
  it('diz o sentido em palavras', () => {
    expect(describeDelta(-189)).toBe('3:09 mais rápido');
    expect(describeDelta(52)).toBe('0:52 mais lento');
    expect(describeDelta(0)).toBe('igual ao segundo');
    expect(describeDelta(null)).toBe('');
  });
});

/* O ritmo do melhor anterior. As categorias são largas ("meia" vai de 11,1 a
   22,5 km), por isso dividir o tempo dele pela distância DESTA prova dava
   números impossíveis — apanhado na revisão pré-deploy. */
describe('raceTimesBreakdown — o ritmo do melhor anterior', () => {
  it('usa a distância a que o recorde foi feito, não a desta prova', () => {
    const outcome = {
      distanceKm: 21.0975,
      category: 'meia',
      officialSeconds: 6822,
      targetSeconds: 6720,
      predictedSeconds: null,
      previousBestSeconds: 3600,
      previousBestDistanceKm: 12,
    };
    const { rows } = raceTimesBreakdown(outcome, { distance_km: 21.0975 });
    const melhor = rows.find((r) => r.key === 'melhor');
    // 1:00:00 em 12 km = 5.00/km. Pela distância da prova dariam 2.51/km.
    expect(melhor.paceLabel).toBe('5.00/km');
  });

  it('sem a distância do recorde, mostra o tempo sem ritmo em vez de um ritmo falso', () => {
    const outcome = {
      distanceKm: 21.0975,
      category: 'meia',
      officialSeconds: 6822,
      previousBestSeconds: 7066,
      previousBestDistanceKm: null,
    };
    const { rows } = raceTimesBreakdown(outcome, { distance_km: 21.0975 });
    const melhor = rows.find((r) => r.key === 'melhor');
    expect(melhor.timeLabel).toBe('1:57:46');
    expect(melhor.paceLabel).toBeNull();
  });
});

/* O objetivo das provas criadas antes das colunas numéricas, e o do rascunho
   da agenda: `targetLine` tem de ler o texto livre. */
describe('targetLine — a cascata do objetivo', () => {
  it('a coluna numérica manda', () => {
    const l = targetLine({ distance_km: 21.1, target_time_seconds: 6720, target_pace_seconds_per_km: 318, target_time: '2:00:00' });
    expect(l.timeLabel).toBe('1:52:00');
    expect(l.paceLabel).toBe('5.18/km');
  });

  it('sem coluna numérica, lê o texto livre do rascunho', () => {
    const l = targetLine({ distance_km: 21.1, target_time: '1:52:00', target_pace: '5.18' });
    expect(l.timeLabel).toBe('1:52:00');
    expect(l.paceLabel).toBe('5.18/km');
  });

  it('com o tempo em texto e sem ritmo, deriva o ritmo da distância', () => {
    const l = targetLine({ distance_km: 21.1, target_time: '1:52:00' });
    expect(l.paceLabel).toBe('5.18/km');
  });

  it('sem objetivo nenhum, null', () => {
    expect(targetLine({ distance_km: 21.1 })).toBeNull();
  });
});
