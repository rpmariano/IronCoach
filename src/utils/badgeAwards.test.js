import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { todayISO } from '../lib/utils';

/* A sincronização dos badges contra um cliente Supabase falso em memória. A
   política: o que tem mais de uma semana entra já visto, nada se duplica, e
   uma tabela que ainda não existe nunca parte a app.

   O que este ficheiro guarda além disso é a chave: (badge_key, tier,
   period_key). O `tier` vem sempre como texto — '' quando o badge não tem
   níveis —, porque em Postgres dois NULL são distintos numa chave única e a
   linha sem nível duplicava a cada sincronização. */

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
              const exists = db.rows.some((r) => r.user_id === p.user_id && r.badge_key === p.badge_key
                && r.tier === p.tier && r.period_key === p.period_key);
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

const { syncBadgeAwards, markBadgeAwardsSeen, __resetBadgeAwardsWarning } = await import('./badgeAwards');

const due = (badgeKey, over = {}) => ({
  badgeKey, tier: '', periodKey: 'run-1', value: 94, valueUnit: 'pct', raceId: null,
  awardedOn: '2026-08-01', title: `T ${badgeKey}`, line: `L ${badgeKey}`, ...over,
});

const dueDeHoje = (badgeKey, over = {}) => due(badgeKey, { awardedOn: todayISO(), ...over });

beforeEach(() => {
  db.rows = [];
  db.error = null;
  db.nextId = 1;
  db.calls = [];
  __resetBadgeAwardsWarning();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncBadgeAwards', () => {
  it('primeira sincronização com histórico: grava tudo como visto, nada por mostrar', async () => {
    const res = await syncBadgeAwards({
      userId: 'u1',
      due: [due('z2_mestre'), due('recorde_pessoal', { periodKey: 'race-1', raceId: 'race-1', valueUnit: 'seconds', value: 2900 })],
    });
    expect(res).toEqual({ pending: [], available: true });
    expect(db.rows).toHaveLength(2);
    expect(db.rows.every((r) => r.user_id === 'u1' && r.seen_at)).toBe(true);
    expect(db.rows.find((r) => r.badge_key === 'recorde_pessoal')).toEqual(expect.objectContaining({
      race_id: 'race-1', value_unit: 'seconds', value: 2900, tier: '', period_key: 'race-1',
    }));
    expect(db.calls.find((c) => c.op === 'upsert').opts).toEqual({
      onConflict: 'user_id,badge_key,tier,period_key', ignoreDuplicates: true,
    });
  });

  it('o badge desta semana fica por ver, com título e frase do due', async () => {
    const res = await syncBadgeAwards({
      userId: 'u1',
      due: [due('z2_mestre'), dueDeHoje('escalada', { tier: 'bronze', periodKey: '', valueUnit: 'metros', value: 12000 })],
    });
    expect(res.pending.map((p) => [p.badge_key, p.tier])).toEqual([['escalada', 'bronze']]);
    expect(res.pending[0]).toEqual(expect.objectContaining({ title: 'T escalada', line: 'L escalada', value: 12000 }));
    expect(db.rows.find((r) => r.badge_key === 'z2_mestre').seen_at).toBeTruthy();
  });

  /* Append-only e idempotente: o mesmo badge nunca dá duas linhas. A chave
     leva o tier como texto — é o que impede a linha sem nível de duplicar. */
  it('idempotente: voltar a sincronizar não duplica', async () => {
    const lista = [due('z2_mestre'), dueDeHoje('semana_100', { periodKey: '2026-09-07', valueUnit: 'pct', value: 100 })];
    await syncBadgeAwards({ userId: 'u1', due: lista });
    const again = await syncBadgeAwards({ userId: 'u1', due: lista });
    expect(db.rows).toHaveLength(2);
    expect(again.pending.map((p) => p.badge_key)).toEqual(['semana_100']);
    expect(db.rows.every((r) => typeof r.tier === 'string')).toBe(true);
  });

  it('níveis do mesmo badge são linhas diferentes, um por tier', async () => {
    await syncBadgeAwards({
      userId: 'u1',
      due: [
        due('coruja', { tier: 'bronze', periodKey: '', valueUnit: 'count', value: 5 }),
        due('coruja', { tier: 'prata', periodKey: '', valueUnit: 'count', value: 15 }),
      ],
    });
    expect(db.rows.filter((r) => r.badge_key === 'coruja').map((r) => r.tier)).toEqual(['bronze', 'prata']);
  });

  it('badges novos por feitos antigos entram já vistos, mesmo não sendo a primeira sincronização', async () => {
    await syncBadgeAwards({ userId: 'u1', due: [due('z2_mestre')] });
    const antigos = ['2026-06-15', '2026-06-20'].map((d, i) => due('cabra_montesa', { periodKey: `run-${i}`, awardedOn: d }));
    const res = await syncBadgeAwards({ userId: 'u1', due: [due('z2_mestre'), ...antigos] });
    expect(res.pending).toEqual([]);
    expect(db.rows.filter((r) => r.badge_key === 'cabra_montesa').every((r) => r.seen_at)).toBe(true);
  });

  it('tabela em falta: available false, sem rebentar, um só aviso', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    db.error = { message: 'relation "public.user_badges" does not exist' };
    const res = await syncBadgeAwards({ userId: 'u1', due: [due('z2_mestre')] });
    expect(res).toEqual({ pending: [], available: false });
    await syncBadgeAwards({ userId: 'u1', due: [due('z2_mestre')] });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('sem utilizador não toca na tabela', async () => {
    const res = await syncBadgeAwards({ due: [due('z2_mestre')] });
    expect(res).toEqual({ pending: [], available: false });
    expect(db.calls).toHaveLength(0);
  });
});

describe('markBadgeAwardsSeen', () => {
  it('marca as linhas dadas como vistas', async () => {
    await syncBadgeAwards({ userId: 'u1', due: [dueDeHoje('z2_mestre')] });
    const id = db.rows[0].id;
    await markBadgeAwardsSeen([id]);
    expect(db.rows[0].seen_at).toBeTruthy();
  });

  it('lista vazia não faz pedido nenhum', async () => {
    db.calls = [];
    await markBadgeAwardsSeen([]);
    expect(db.calls).toHaveLength(0);
  });
});
