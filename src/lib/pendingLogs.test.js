import { describe, it, expect, beforeEach } from 'vitest';
import { queuePendingLog, pendingLogs, flushPendingLogs, AWAITING_SESSION_MAX_MS, __resetPendingLogsForTests } from './pendingLogs';

/* Revisão pré-deploy de a78b80bb: uma linha sem user_id fazia a RLS recusar o lote inteiro e as boas
   iam-se com ela. As sem sessão esperam pela sessão; uma recusa trata-se linha a linha. */
describe('pendingLogs', () => {
  beforeEach(() => { localStorage.clear(); __resetPendingLogsForTests(); });

  it('sem sessão, a linha sem user_id fica; com sessão, sai com o user_id de agora', async () => {
    queuePendingLog({ user_id: null, level: 'error', event: 'boot_deadline', message: 'x', meta: {} });
    queuePendingLog({ user_id: 'u1', level: 'info', event: 'save_failed', message: 'y', meta: {} });
    const batches = [];
    const insert = async (rows) => { batches.push(rows); return { error: null }; };

    expect(await flushPendingLogs(insert, { userId: null })).toBe(1);
    expect(batches[0].map((r) => r.event)).toEqual(['save_failed']);
    expect(pendingLogs().map((r) => r.event)).toEqual(['boot_deadline']);

    expect(await flushPendingLogs(insert, { userId: 'u9' })).toBe(1);
    expect(batches[1][0]).toMatchObject({ event: 'boot_deadline', user_id: 'u9' });
    expect(pendingLogs()).toEqual([]);
  });

  it('uma linha sem sessão velha demais não se atribui a ninguém: sai', async () => {
    queuePendingLog({ user_id: null, level: 'error', event: 'boot_deadline', message: 'x', meta: {} });
    const batches = [];
    const later = Date.now() + AWAITING_SESSION_MAX_MS + 1000;
    await flushPendingLogs(async (rows) => { batches.push(rows); return { error: null }; }, { userId: 'u9', now: () => later });
    expect(batches).toEqual([]);
    expect(pendingLogs()).toEqual([]);
  });

  it('o lote recusado (RLS): linha a linha — só sai a recusada, as boas vão', async () => {
    queuePendingLog({ user_id: 'u1', level: 'info', event: 'a', meta: {} });
    queuePendingLog({ user_id: 'outro', level: 'info', event: 'b', meta: {} });
    queuePendingLog({ user_id: 'u1', level: 'info', event: 'c', meta: {} });
    const sent = [];
    const insert = async (rows) => {
      if (rows.some((r) => r.user_id === 'outro')) return { error: { code: '42501', message: 'rls' } };
      sent.push(...rows.map((r) => r.event));
      return { error: null };
    };
    expect(await flushPendingLogs(insert, { userId: 'u1' })).toBe(2);
    expect(sent).toEqual(['a', 'c']);
    expect(pendingLogs()).toEqual([]);
  });

  it('sem rede, tudo fica para a próxima', async () => {
    queuePendingLog({ user_id: 'u1', level: 'info', event: 'a', meta: {} });
    expect(await flushPendingLogs(async () => ({ error: { message: 'Failed to fetch' } }), { userId: 'u1' })).toBe(0);
    expect(pendingLogs()).toHaveLength(1);
  });
});
