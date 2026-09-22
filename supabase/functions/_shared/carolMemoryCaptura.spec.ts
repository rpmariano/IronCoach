/* `buildCaptureCoverageContext` — os prints que costumam faltar nas corridas.
 *
 * Vitest-only (*.spec.ts): o `deno test` recolhe só `**\/*.test.ts`
 * (supabase/functions/deno.json). A montagem em `fetchChatMemoryBlocks`
 * continua do lado Deno, em `carolMemory.test.ts`.
 *
 * O que estes testes protegem é a REGRA, não a formatação: só há bloco
 * quando há padrão (6 #6, R2), conta-se pelos campos e não pela app, o ecrã
 * só se nomeia com a app conhecida, um ecrã por confirmar nunca é dado como
 * certo, e o resumo nunca é sugerido.
 */

import { describe, it, expect } from 'vitest';
import { buildCaptureCoverageContext } from './carolMemory.ts';
import type { SourceApp } from './sourceApps.ts';

/* Nível médio por omissão: a dinâmica de corrida só se sugere a quem não é
   iniciante (6 #4) — ver o bloco próprio lá em baixo. */
const bloco = (rows: unknown[] | null | undefined, nivel: string | null = 'medio') =>
  buildCaptureCoverageContext(rows as any[], { nivel });

/* O que UM print do resumo da Samsung Health deixa em `details` — os oito
   campos medidos a 2026-09-22 (sourceApps.ts, ecrã `resumo`). */
const umPrintSamsung = (extra: Record<string, unknown> = {}) => ({
  source_app: 'samsung_health',
  avg_heart_rate_bpm: 152,
  cadence_spm: 168,
  calories_kcal: 520,
  elevation_gain_m: 40,
  recommended_hydration_ml: 600,
  splits: [{ distance_km: 1, time_seconds: 370 }],
  sweat_loss_ml: 700,
  vo2_max: 47,
  ...extra,
});

// O mesmo print, num registo anterior a 2026-09-22: sem `source_app`.
const umPrintAntigo = (extra: Record<string, unknown> = {}) => {
  const { source_app: _fonte, ...resto } = umPrintSamsung(extra);
  return resto;
};

const zonas = { hr_zones: [{ zone: 1, minutes: 10 }, { zone: 2, minutes: 30 }, { zone: 3, minutes: 5 }] };
const limiares = { aerobic_threshold_bpm: 145, anaerobic_threshold_bpm: 172 };
const dinamica = { ground_contact_time_ms: 250, vertical_oscillation_cm: 8.9 };
const quatroPrints = (extra: Record<string, unknown> = {}) =>
  umPrintSamsung({ ...zonas, ...limiares, ...dinamica, ...extra });

/** Corridas em dias consecutivos, a MAIS RECENTE primeiro (2026-09-20, 19, …). */
const corridas = (...detalhes: Array<Record<string, unknown> | null>) =>
  detalhes.map((details, i) => ({ date: `2026-09-${String(20 - i).padStart(2, '0')}`, details }));

describe('buildCaptureCoverageContext — sem padrão, sem bloco', () => {
  it('nada, ou lixo, dá null', () => {
    expect(bloco(null)).toBeNull();
    expect(bloco(undefined)).toBeNull();
    expect(bloco([])).toBeNull();
    expect(bloco([null, { details: umPrintSamsung() }, { date: 5 }])).toBeNull();
  });

  it('um registo isolado sem zonas não é nada — nem dois', () => {
    expect(bloco(corridas(umPrintSamsung()))).toBeNull();
    expect(bloco(corridas(umPrintSamsung(), umPrintSamsung()))).toBeNull();
  });

  it('com tudo mandado não há nada a sugerir', () => {
    expect(bloco(corridas(quatroPrints(), quatroPrints(), quatroPrints(), quatroPrints()))).toBeNull();
  });

  it('a falta em minoria não é padrão', () => {
    // 4 corridas, só 1 sem zonas nem dinâmica — e é a mais recente.
    expect(bloco(corridas(umPrintSamsung(), quatroPrints(), quatroPrints(), quatroPrints()))).toBeNull();
  });

  it('metade exata não é maioria', () => {
    expect(bloco(corridas(umPrintSamsung(), umPrintSamsung(), quatroPrints(), quatroPrints()))).toBeNull();
  });

  it('se a mais recente já trouxe o ecrã, o hábito está a mudar e ela cala-se', () => {
    // 3 de 4 sem nada — maioria — mas a última veio completa.
    expect(bloco(corridas(quatroPrints(), umPrintSamsung(), umPrintSamsung(), umPrintSamsung()))).toBeNull();
  });

  it('corridas manuais (sem nada de um print em details) não contam', () => {
    expect(bloco(corridas(null, {}, null, {}, umPrintSamsung()))).toBeNull();
  });
});

describe('buildCaptureCoverageContext — com padrão', () => {
  it('um print por registo, Samsung Health: nomeia os dois ecrãs em falta', () => {
    const texto = bloco(corridas(umPrintSamsung(), umPrintSamsung(), umPrintSamsung(), umPrintSamsung(), umPrintSamsung()))!;
    expect(texto).not.toBeNull();
    expect(texto).toContain('PRINTS QUE COSTUMAM FALTAR NAS CORRIDAS');
    expect(texto).toContain('No Samsung Health');
    expect(texto).toContain('"Zonas de Frequência Cardíaca"');
    expect(texto).toContain('"Dinâmica de Corrida"');
    expect(texto).toContain('em todas as corridas recentes');
    // O que se ganha, concretamente — e só o que o código usa.
    expect(texto).toContain('distribuição de intensidade');
    expect(texto).toContain('Mestre da Z2');
    expect(texto).toContain('não prometas uma análise da técnica');
    expect(texto).toContain('Não recalibram as zonas');
    // Uma vez, e nunca como abertura.
    expect(texto).toContain('Se já lhe falaste disto');
    expect(texto).toContain('Nunca abras a conversa com isto');
  });

  it('a maioria, com a última incluída, também é padrão — e diz-se "a maioria"', () => {
    const texto = bloco(corridas(umPrintSamsung(), umPrintSamsung(), quatroPrints()))!;
    expect(texto).toContain('na maioria das corridas recentes, incluindo a última');
  });

  it('comenta o padrão, não o número: nenhuma contagem chega ao bloco (R2)', () => {
    const texto = bloco(corridas(umPrintSamsung(), umPrintSamsung(), umPrintSamsung(), quatroPrints(), umPrintSamsung()))!;
    // 4 de 5 sem zonas: nem "4 de 5", nem "4/5", nem "4 corridas". (O "80/20"
    // do texto é o nome do modelo de intensidade, não uma contagem dele.)
    expect(texto).not.toMatch(/\b\d+\s+(de|em)\s+\d+\b/);
    expect(texto).not.toMatch(/\b[45]\s*\/\s*[45]\b/);
    expect(texto).not.toMatch(/\b\d+\s+(corridas|registos)\b/);
  });

  it('só sugere o ecrã que falta: com as zonas mandadas, só a dinâmica', () => {
    const texto = bloco(corridas(
      umPrintSamsung({ ...zonas }), umPrintSamsung({ ...limiares }), umPrintSamsung({ ...zonas }),
    ))!;
    expect(texto).toContain('"Dinâmica de Corrida"');
    expect(texto).not.toContain('"Zonas de Frequência Cardíaca"');
    expect(texto).not.toContain('Mestre da Z2');
  });

  it('sem FC medida não há ecrã de zonas para pedir — a dinâmica continua', () => {
    const semFC = () => {
      const { avg_heart_rate_bpm: _fc, ...resto } = umPrintSamsung();
      return resto;
    };
    const texto = bloco(corridas(semFC(), semFC(), semFC()))!;
    expect(texto).not.toContain('Zonas de Frequência Cardíaca');
    expect(texto).not.toContain('zonas de frequência cardíaca');
    expect(texto).toContain('"Dinâmica de Corrida"');
  });

  it('não é um bloco de badges: o Mestre da Z2 é a única menção', () => {
    const texto = bloco(corridas(umPrintSamsung(), umPrintSamsung(), umPrintSamsung()))!;
    for (const outro of ['Escalada', 'Coruja', 'Relógio suíço', 'Acumulação', 'Amuletos', 'vitrina']) {
      expect(texto).not.toContain(outro);
    }
    expect(texto.match(/badge/g)?.length).toBe(1);
  });
});

describe('buildCaptureCoverageContext — nomear o ecrã só com a app conhecida', () => {
  it('registos antigos (sem source_app) contam pelos campos, mas não nomeiam app nem ecrã', () => {
    const texto = bloco(corridas(umPrintAntigo(), umPrintAntigo(), umPrintAntigo(), umPrintAntigo()))!;
    expect(texto).not.toBeNull();
    expect(texto).toContain('As zonas de frequência cardíaca');
    expect(texto).toContain('a dinâmica de corrida');
    expect(texto).toContain('Não sabes de que app vêm os prints dele');
    expect(texto).not.toContain('Samsung');
    expect(texto).not.toContain('ecrã "');
  });

  it('app desconhecida na corrida mais recente: não recua para a app antiga', () => {
    const desconhecida = umPrintSamsung({ source_app: 'desconhecida' });
    const texto = bloco(corridas(desconhecida, umPrintSamsung(), umPrintSamsung(), umPrintSamsung()))!;
    expect(texto).not.toBeNull();
    expect(texto).not.toContain('Samsung');
    expect(texto).not.toContain('ecrã "');
    expect(texto).toContain('Não sabes de que app vêm os prints dele');
  });

  it('uma chave que o catálogo não conhece também não nomeia nada', () => {
    const strava = umPrintSamsung({ source_app: 'strava' });
    const texto = bloco(corridas(strava, strava, strava))!;
    expect(texto).not.toContain('Samsung');
    expect(texto).not.toContain('strava');
    expect(texto).not.toContain('ecrã "');
  });

  it('a app conhecida mais recente nomeia, mesmo com registos antigos no meio', () => {
    const texto = bloco(corridas(umPrintSamsung(), umPrintAntigo(), umPrintAntigo()))!;
    expect(texto).toContain('No Samsung Health');
  });
});

describe('buildCaptureCoverageContext — confirmado: false não é certeza', () => {
  it('os ecrãs inferidos da Samsung saem como sugestão, nunca como facto', () => {
    const texto = bloco(corridas(umPrintSamsung(), umPrintSamsung(), umPrintSamsung()))!;
    expect(texto).toContain('devem estar no ecrã "Zonas de Frequência Cardíaca"');
    expect(texto).toContain('ainda não está confirmado com prints reais');
    expect(texto).not.toContain('estão no ecrã');
  });

  it('um ecrã confirmado diz-se como certo', () => {
    const catalogo: Record<string, SourceApp> = {
      relogio_x: {
        nome: 'Relógio X',
        dominio: 'corrida',
        ecras: [
          { id: 'resumo', nome: 'Resumo', campos: ['avg_heart_rate_bpm', 'calories_kcal'], confirmado: true },
          { id: 'zonas', nome: 'Zonas', campos: ['hr_zones'], confirmado: true },
        ],
      },
    };
    const print = { source_app: 'relogio_x', avg_heart_rate_bpm: 150, calories_kcal: 400 };
    const texto = buildCaptureCoverageContext(corridas(print, print, print), { nivel: 'medio', apps: catalogo })!;
    expect(texto).toContain('No Relógio X, estão no ecrã "Zonas".');
    expect(texto).not.toContain('devem estar');
    expect(texto).not.toContain('não está confirmado');
  });
});

describe('buildCaptureCoverageContext — o resumo nunca é sugerido', () => {
  it('nem quando os campos do resumo são o que falta', () => {
    // Registos com source_app mas sem NENHUM campo do resumo (só as zonas e a
    // dinâmica): se o resumo entrasse na contagem, faltava em todos.
    const semResumo = { source_app: 'samsung_health', max_heart_rate_bpm: 180, ...zonas, ...limiares, ...dinamica };
    expect(bloco(corridas(semResumo, semResumo, semResumo, semResumo))).toBeNull();
  });

  it('nunca aparece no texto, com app conhecida ou sem ela', () => {
    for (const print of [umPrintSamsung, umPrintAntigo]) {
      const texto = bloco(corridas(print(), print(), print(), print()))!;
      expect(texto).not.toContain('Resumo da corrida');
      expect(texto).not.toMatch(/resumo/i);
    }
  });

  it('um catálogo em que o resumo seria o único ecrã não produz bloco', () => {
    const catalogo: Record<string, SourceApp> = {
      so_resumo: {
        nome: 'Só Resumo',
        dominio: 'corrida',
        ecras: [{ id: 'resumo', nome: 'Resumo', campos: ['avg_heart_rate_bpm', 'hr_zones'], confirmado: true }],
      },
    };
    const print = { source_app: 'so_resumo', avg_heart_rate_bpm: 150 };
    expect(buildCaptureCoverageContext(corridas(print, print, print), { nivel: 'medio', apps: catalogo })).toBeNull();
  });
});

describe('buildCaptureCoverageContext — temas contraindicados por nível (6 #4)', () => {
  const umPrint = () => corridas(umPrintSamsung(), umPrintSamsung(), umPrintSamsung());

  it('a iniciante não se sugere a dinâmica de corrida — as zonas sim', () => {
    const texto = bloco(umPrint(), 'iniciante')!;
    expect(texto).toContain('"Zonas de Frequência Cardíaca"');
    expect(texto).not.toContain('Dinâmica de Corrida');
    expect(texto).not.toContain('dinâmica de corrida');
    expect(texto).not.toContain('oscilação');
  });

  it('com o nível por saber, o lado seguro é o mesmo que o do iniciante', () => {
    for (const nivel of [null, 'lendario']) {
      const texto = bloco(umPrint(), nivel)!;
      expect(texto).toContain('"Zonas de Frequência Cardíaca"');
      expect(texto).not.toContain('Dinâmica de Corrida');
    }
  });

  it('a iniciante sem FC não há nada a sugerir', () => {
    const semFC = () => {
      const { avg_heart_rate_bpm: _fc, ...resto } = umPrintSamsung();
      return resto;
    };
    expect(bloco(corridas(semFC(), semFC(), semFC()), 'iniciante')).toBeNull();
  });

  it('do básico para cima, a dinâmica entra', () => {
    for (const nivel of ['basico', 'medio', 'avancado']) {
      expect(bloco(umPrint(), nivel)).toContain('"Dinâmica de Corrida"');
    }
  });
});
