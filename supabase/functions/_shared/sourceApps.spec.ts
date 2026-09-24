/* O catálogo das fontes (supabase/functions/_shared/sourceApps.ts).
 *
 * Vitest-only (*.spec.ts), pela mesma razão do carolMemoryBadges.spec.ts: o
 * `deno test` recolhe só `**\/*.test.ts` (supabase/functions/deno.json), e
 * estes asserts são de Vitest.
 *
 * O que isto protege não é a lista de campos — essa vai mudar à medida que se
 * medirem mais apps. É o CONTRATO de que o catálogo depende para poder crescer
 * sem ninguém ir a lado nenhum mexer:
 *   - uma fonte que o catálogo não conhece nunca parte nada, cai no genérico;
 *   - a repartição por ecrã transforma campos soltos em PRINTS, que é o ponto;
 *   - o que é medido está marcado como medido e o que é inferido como inferido,
 *     porque a diferença entre os dois é a única coisa que aqui não se pode
 *     perder.
 */

import { describe, it, expect } from 'vitest';
import {
  SOURCE_APPS,
  CAMPOS_AGREGADOS,
  FONTE_NAO_RECONHECIDA,
  agruparCamposPorEcra,
  appDaFonte,
  chavesDeFonte,
  ecraPrincipal,
  ecrasQueSePerdem,
  normalizarFonte,
  opcoesDeFonte,
} from './sourceApps.ts';

describe('sourceApps — o catálogo', () => {
  it('conhece as duas fontes de hoje, cada uma no seu domínio', () => {
    expect(chavesDeFonte('corrida')).toEqual(['samsung_health']);
    expect(chavesDeFonte('corpo')).toEqual(['renpho']);
    expect(chavesDeFonte()).toEqual(['renpho', 'samsung_health']);
  });

  it('não usa a chave de "não reconheci" como se fosse uma app', () => {
    expect(SOURCE_APPS[FONTE_NAO_RECONHECIDA]).toBeUndefined();
    expect(appDaFonte(FONTE_NAO_RECONHECIDA)).toBeNull();
  });

  it('dá a cada ecrã um id único dentro da app, e campos nenhuns repetidos entre ecrãs de corrida', () => {
    for (const [chave, app] of Object.entries(SOURCE_APPS)) {
      const ids = app.ecras.map((e) => e.id);
      expect(new Set(ids).size, `ids de ${chave}`).toBe(ids.length);
      expect(app.ecras.every((e) => e.campos.length > 0), `ecrãs vazios em ${chave}`).toBe(true);
    }
    const campos = SOURCE_APPS.samsung_health.ecras.flatMap((e) => e.campos);
    expect(new Set(campos).size).toBe(campos.length);
  });

  /* A parte MEDIDA da calibração de 2026-09-22 é só esta: a fronteira entre o
     que veio com a 1.ª foto e o que só apareceu com as outras três. Se alguém
     mudar um destes oito campos de sítio a pensar que a repartição por ecrã é
     facto, este teste diz-lhe que a fronteira é que é. */
  it('mantém, no ecrã de resumo, exatamente os campos que a corrida de UMA foto trouxe', () => {
    const resumo = SOURCE_APPS.samsung_health.ecras[0];
    expect(resumo.confirmado).toBe(true);
    expect([...resumo.campos].sort()).toEqual([
      'avg_heart_rate_bpm', 'cadence_spm', 'calories_kcal', 'distance_km', 'duration_seconds',
      'elevation_gain_m', 'recommended_hydration_ml', 'splits', 'sweat_loss_ml', 'vo2_max',
    ]);
  });

  it('mantém, fora do resumo, exatamente os oito campos que só vieram com as outras fotos', () => {
    const forams = SOURCE_APPS.samsung_health.ecras.slice(1);
    expect([...forams.flatMap((e) => e.campos)].sort()).toEqual([
      'aerobic_threshold_bpm', 'anaerobic_threshold_bpm', 'flight_time_ms',
      'ground_contact_time_ms', 'hr_zones', 'leg_stiffness_kn_m',
      'regularity_score', 'vertical_oscillation_cm',
    ]);
  });

  /* Honestidade: a repartição desses oito POR ecrã é inferida, e tem de
     continuar marcada como tal enquanto ninguém a medir. Um `confirmado: true`
     posto por distração faria uma inferência passar por facto. */
  it('marca como por confirmar tudo o que foi repartido pela semântica', () => {
    expect(SOURCE_APPS.samsung_health.ecras.filter((e) => e.confirmado).map((e) => e.id))
      .toEqual(['resumo']);
    expect(SOURCE_APPS.renpho.ecras.some((e) => e.confirmado)).toBe(false);
  });
});

describe('sourceApps — a deteção', () => {
  it('oferece ao modelo as chaves do domínio mais uma saída honesta', () => {
    expect(opcoesDeFonte('corrida')).toEqual(['samsung_health', FONTE_NAO_RECONHECIDA]);
    expect(opcoesDeFonte('corpo')).toEqual(['renpho', FONTE_NAO_RECONHECIDA]);
  });

  it('aceita uma chave conhecida do domínio certo', () => {
    expect(normalizarFonte('samsung_health', 'corrida')).toBe('samsung_health');
    expect(normalizarFonte('  Samsung_Health  ', 'corrida')).toBe('samsung_health');
    expect(normalizarFonte('renpho', 'corpo')).toBe('renpho');
  });

  it('recusa uma app do outro domínio em vez de a aceitar por ser conhecida', () => {
    expect(normalizarFonte('renpho', 'corrida')).toBe(FONTE_NAO_RECONHECIDA);
    expect(normalizarFonte('samsung_health', 'corpo')).toBe(FONTE_NAO_RECONHECIDA);
  });

  it('devolve sempre a chave de "não reconheci" para o que não é chave nenhuma', () => {
    for (const lixo of ['strava', '', '   ', null, undefined, 42, {}, []]) {
      expect(normalizarFonte(lixo, 'corrida')).toBe(FONTE_NAO_RECONHECIDA);
    }
  });
});

describe('sourceApps — agrupar as métricas em falta por ecrã', () => {
  /* O caso real que originou isto: o registo com uma foto só perdeu as zonas,
     os limiares e a biomecânica. São SEIS entradas no painel — e dois prints. */
  it('transforma seis campos soltos em dois prints, com o nome do ecrã', () => {
    const grupos = agruparCamposPorEcra('samsung_health', [
      'hr_zones', 'thresholds', 'biomechanics',
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].ecra?.nome).toBe('Zonas de Frequência Cardíaca');
    expect([...grupos[0].chaves].sort()).toEqual(['hr_zones', 'thresholds']);
    expect(grupos[1].ecra?.nome).toBe('Dinâmica de Corrida');
    expect(grupos[1].chaves).toEqual(['biomechanics']);
  });

  it('resolve as chaves agregadas do painel, que não são campos de extração nenhuns', () => {
    for (const [agregada, campos] of Object.entries(CAMPOS_AGREGADOS)) {
      expect(campos.length).toBeGreaterThan(1);
      const [grupo] = agruparCamposPorEcra('samsung_health', [agregada]);
      expect(grupo.ecra, `${agregada} não caiu em ecrã nenhum`).not.toBeNull();
    }
  });

  it('prefere o ecrã que resolve mais, em vez de repetir a mesma métrica em três sugestões', () => {
    // O relatório da Renpho cobre as quatro; as Tendências só cobririam três.
    const grupos = agruparCamposPorEcra('renpho', ['weight_kg', 'bmi', 'body_fat_pct', 'bmr_kcal']);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].ecra?.id).toBe('relatorio');
  });

  it('junta o que nenhum ecrã conhecido cobre num grupo à parte, sem ecrã', () => {
    const grupos = agruparCamposPorEcra('samsung_health', ['hr_zones', 'total_steps']);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].ecra?.id).toBe('zonas_fc');
    expect(grupos[1].ecra).toBeNull();
    expect(grupos[1].chaves).toEqual(['total_steps']);
  });

  /* O requisito que não pode ceder: com uma fonte que o catálogo não conhece
     — ou sem fonte nenhuma, que é o caso de todas as corridas anteriores a
     isto existir — o painel volta ao comportamento genérico de hoje. Nunca se
     inventa o nome de um ecrã de uma app que não está no catálogo. */
  it('cai no genérico com uma fonte desconhecida, sem partir nada', () => {
    const chaves = ['hr_zones', 'thresholds', 'biomechanics'];
    for (const fonte of [FONTE_NAO_RECONHECIDA, 'strava', null, undefined, '', 42, {}]) {
      const grupos = agruparCamposPorEcra(fonte, chaves);
      expect(grupos, `fonte ${String(fonte)}`).toEqual([{ ecra: null, chaves }]);
    }
  });

  it('não devolve grupo nenhum quando não falta nada', () => {
    expect(agruparCamposPorEcra('samsung_health', [])).toEqual([]);
    expect(agruparCamposPorEcra('desconhecida', [])).toEqual([]);
    expect(agruparCamposPorEcra('samsung_health', null as unknown as string[])).toEqual([]);
  });
});

describe('sourceApps — o que se diz no seletor de fotos', () => {
  it('nomeia os ecrãs que um print do resumo sozinho deixa de fora', () => {
    const [samsung] = ecrasQueSePerdem('corrida');
    expect(samsung.app.nome).toBe('Samsung Health');
    expect(samsung.ecras.map((e) => e.nome))
      .toEqual(['Zonas de Frequência Cardíaca', 'Dinâmica de Corrida']);
  });

  it('dá o ecrã principal de uma app conhecida, e nada de uma desconhecida', () => {
    expect(ecraPrincipal('renpho')?.id).toBe('relatorio');
    expect(ecraPrincipal('samsung_health')?.id).toBe('resumo');
    expect(ecraPrincipal('strava')).toBeNull();
    expect(ecraPrincipal(null)).toBeNull();
  });
});
