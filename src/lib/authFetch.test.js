import { describe, it, expect, vi } from 'vitest';
import { createAuthTimeoutFetch, isAuthRequest } from './authFetch';

/* Bug de 2026-11-17: o refresh do token pendurado prendia o arranque no logo. Os pedidos ao Auth
   passam a ter prazo; os outros ficam como estão. */
describe('authFetch', () => {
  const hanging = () => vi.fn((_url, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));

  it('um pedido ao Auth que não responde é cortado ao fim do prazo', async () => {
    const base = hanging();
    const f = createAuthTimeoutFetch({ baseFetch: base, timeoutMs: 30 });
    await expect(f('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(base.mock.calls[0][1].signal).toBeDefined();
  });

  it('os pedidos à base de dados e às funções passam sem prazo; um signal do chamador fica', async () => {
    const base = vi.fn(async () => new Response('{}'));
    const f = createAuthTimeoutFetch({ baseFetch: base, timeoutMs: 30 });
    await f('https://x.supabase.co/rest/v1/runs?select=*', {});
    expect(base.mock.calls[0][1].signal).toBeUndefined();
    const own = new AbortController();
    await f('https://x.supabase.co/auth/v1/user', { signal: own.signal });
    expect(base.mock.calls[1][1].signal).toBe(own.signal);
    expect(isAuthRequest('https://x.supabase.co/functions/v1/coach-chat')).toBe(false);
  });

  it('a resposta a tempo passa tal como veio', async () => {
    const res = new Response('{"ok":true}');
    const f = createAuthTimeoutFetch({ baseFetch: async () => res, timeoutMs: 1000 });
    await expect(f(new Request('https://x.supabase.co/auth/v1/token'))).resolves.toBe(res);
  });
});
