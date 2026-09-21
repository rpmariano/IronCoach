import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { todayISO } from '../lib/utils';

/* A sincronização das medalhas contra um cliente Supabase falso em memória:
   o que se guarda aqui é a política — a primeira vez é histórico (visto),
   depois só o novo toca, e uma tabela que ainda não existe nunca parte a
   app. */

const db = vi.hoisted(() => ({ rows: [], error: null, nextId: 1, calls: [] }));

vi.mock('../lib/supabase', () => {
  const from = (table) => {
    const state = { table, op: 'select', filters: [], payload: null, patch: null };
    const builder = {
      select() { return builder; },
      eq(col, v) { state.filters.push((r) => r[col] === v); return builder; },
      is(col, v) { state.filters.push((r) => (r[col] ?? null) === v); return builder; },
      in(col, vs) { state.filters.push((r) => vs.includes(r[col])); return builder; },
      upsert(payload, opts) { state.op = 'upsert'; state.payload = payload; state.opts = opts; return builder; },
      update(patch) { state.op = 'update'; state.patch = patch; return builder; },
      then(resolve, reject) {
        try {
          db.calls.push({ op: state.op, opts: state.opts });
          if (db.error) return resolve({ data: null, error: db.error });
          const match = (r) => state.filters.every((f) => f(r));
          if (state.op === 'upsert') {
            for (const p of state.payload) {
              const exists = db.rows.some((r) => r.user_id === p.user_id && r.medalhao === p.medalhao && r.slot === p.slot && r.period_key === p.period_key);
              if (!exists) db.rows.push({ id: `id${db.nextId++}`, ...p });
            }
            return resolve({ data: null, error: null });
          }
          if (state.op === 'update') {
            db.rows.filter(match).forEach((r) => Object.assign(r, state.patch));
            return resolve({ data: null, error: null });
          }
          return resolve({ data: db.rows.filter(match).map((r) => ({ ...r })), error: null });
        } catch (e) {
          return reject(e);
        }
      },
    };
    return builder;
  };
  return { supabase: { from } };
});

const { syncMedalAwards, markMedalAwardsSeen, __resetMedalAwardsWarning } = await import('./medalAwards');

const due = (medalhao, slot, periodKey, over = {}) => ({
  medalhao, slot, periodKey, value: 10, valueLabel: '10', raceId: null, awardedOn: '2026-08-01',
  title: `T ${medalhao} ${slot}`, line: `L ${medalhao} ${slot} ${periodKey}`, ...over,
});

/* O que decide se uma medalha toca é a DATA DO FEITO, não o estado da
   tabela: um feito de há mais de uma semana entra já como visto, venha na
   primeira sincronização ou na centésima. Foi o que travou a enxurrada
   quando a escala bronze/prata/ouro passou a cunhar medalhas por corridas
   de meses atrás. Este ajudante marca as que são de hoje — as que o atleta
   tem mesmo de ver a tocar. */
const dueDeHoje = (medalhao, slot, periodKey, over = {}) =>
  due(medalhao, slot, periodKey, { awardedOn: todayISO(), ...over });

beforeEach(() => {
  db.rows = [];
  db.error = null;
  db.nextId = 1;
  db.calls = [];
  __resetMedalAwardsWarning();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncMedalAwards', () => {
  it('primeira sincronização com histórico: grava tudo como visto, nada por mostrar', async () => {
    const res = await syncMedalAwards({
      userId: 'u1',
      due: [due('ano_km', 'mes', '2026-07'), due('distancias', '21k', '', { raceId: 'race-1' })],
    });
    expect(res).toEqual({ pending: [], available: true });
    expect(db.rows).toHaveLength(2);
    expect(db.rows.every((r) => r.user_id === 'u1' && r.seen_at)).toBe(true);
    expect(db.rows.find((r) => r.medalhao === 'distancias').race_id).toBe('race-1');
    expect(db.calls.find((c) => c.op === 'upsert').opts).toEqual({ onConflict: 'user_id,medalhao,slot,period_key', ignoreDuplicates: true });
  });

  it('primeira sincronização de um atleta novo: a medalha desta semana fica por ver', async () => {
    // hora LOCAL, como a app (ver nota em GymRegistration.test.jsx)
    const hoje = todayISO();
    const res = await syncMedalAwards({
      userId: 'u1',
      due: [due('ano_km', 'mes', '2026-01'), due('distancias', '5k', '', { awardedOn: hoje })],
    });
    expect(res.pending.map((p) => `${p.medalhao}/${p.slot}`)).toEqual(['distancias/5k']);
    expect(db.rows.find((r) => r.medalhao === 'ano_km').seen_at).toBeTruthy();
  });

  it('depois: só as novas ficam por ver, com título e frase do due, a mais significativa primeiro', async () => {
    const historico = [due('ano_km', 'mes', '2026-07')];
    await syncMedalAwards({ userId: 'u1', due: historico });

    const res = await syncMedalAwards({
      userId: 'u1',
      due: [...historico, dueDeHoje('ano_km', 'mes', '2026-08', { value: 182 }), dueDeHoje('niveis', '10k', 'race-9', { value: 3107, raceId: 'race-9' })],
    });
    expect(res.available).toBe(true);
    expect(res.pending.map((p) => [p.medalhao, p.period_key])).toEqual([['niveis', 'race-9'], ['ano_km', '2026-08']]);
    expect(res.pending[0]).toEqual(expect.objectContaining({
      slot: '10k', value: 3107, race_id: 'race-9', title: 'T niveis 10k', line: 'L niveis 10k race-9',
    }));
    expect(res.pending[0].id).toBeTruthy();
    expect(res.pending[0].awarded_at).toBeTruthy();
    expect(db.rows).toHaveLength(3);
  });

  it('idempotente: voltar a sincronizar não duplica e continua a devolver as por ver', async () => {
    await syncMedalAwards({ userId: 'u1', due: [due('ano_km', 'mes', '2026-07')] });
    const list = [due('ano_km', 'mes', '2026-07'), dueDeHoje('superacao', 'o1', '')];
    await syncMedalAwards({ userId: 'u1', due: list });
    const again = await syncMedalAwards({ userId: 'u1', due: list });
    expect(db.rows).toHaveLength(2);
    expect(again.pending.map((p) => p.medalhao)).toEqual(['superacao']);
  });

  /* A regressão que a escala d'Os Níveis trouxe: a guarda de histórico só
     valia na primeiríssima sincronização, por isso quem já tinha uma linha
     na tabela abria a app com dezenas de animações por feitos antigos. */
  it('medalhas novas por feitos antigos entram já vistas, mesmo não sendo a primeira sincronização', async () => {
    await syncMedalAwards({ userId: 'u1', due: [due('ano_km', 'mes', '2026-07')] });

    const antigas = ['5k', '10k', '21k'].map((slot) => due('niveis', slot, 'bronze', { awardedOn: '2026-06-15' }));
    const res = await syncMedalAwards({ userId: 'u1', due: [due('ano_km', 'mes', '2026-07'), ...antigas] });

    expect(res.pending).toEqual([]);
    expect(db.rows.filter((r) => r.medalhao === 'niveis').every((r) => r.seen_at)).toBe(true);
  });

  it('tabela em falta: available false, sem rebentar, um só aviso', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.error = { code: 'PGRST205', message: "Could not find the table 'public.medal_awards'" };
    await expect(syncMedalAwards({ userId: 'u1', due: [due('ano_km', 'mes', '2026-07')] })).resolves.toEqual({ pending: [], available: false });
    await expect(syncMedalAwards({ userId: 'u1', due: [] })).resolves.toEqual({ pending: [], available: false });
    await expect(markMedalAwardsSeen(['id1'])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('sem utilizador não vai à rede', async () => {
    await expect(syncMedalAwards({ userId: null, due: [due('ano_km', 'mes', '2026-07')] })).resolves.toEqual({ pending: [], available: false });
    expect(db.calls).toHaveLength(0);
  });
});

describe('markMedalAwardsSeen', () => {
  it('marca seen_at nas indicadas e deixa as outras', async () => {
    await syncMedalAwards({ userId: 'u1', due: [due('ano_km', 'mes', '2026-07')] });
    const { pending } = await syncMedalAwards({ userId: 'u1', due: [due('ano_km', 'mes', '2026-07'), dueDeHoje('terreno', 'trail1', ''), dueDeHoje('niveis', '5k', 'r2')] });
    expect(pending).toHaveLength(2);
    await markMedalAwardsSeen([pending[0].id]);
    const after = await syncMedalAwards({ userId: 'u1', due: [] });
    expect(after.pending.map((p) => p.medalhao)).toEqual(['terreno']);
    expect(after.pending[0].title).toBeNull();
  });

  it('lista vazia não faz nada', async () => {
    await markMedalAwardsSeen([]);
    expect(db.calls).toHaveLength(0);
  });
});
