import { describe, it, expect, vi } from 'vitest';
import { createAuthTimeoutFetch, isAuthRequest, authTimeoutFor } from './authFetch';

/* Bug de 2026-11-17: o refresh do token pendurado prendia o arranque no logo. Os pedidos ao Auth
   do nosso projeto passam a ter prazo (o /token curto, os outros mais longos); os outros ficam. */
const ORIGIN = 'https://x.supabase.co';

describe('authFetch', () => {
  const hanging = () => vi.fn((_url, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));

  it('um /token que não responde é cortado ao fim do prazo curto', async () => {
    const base = hanging();
    const f = createAuthTimeoutFetch({ origin: ORIGIN, baseFetch: base, tokenMs: 30, otherMs: 5000 });
    await expect(f(`${ORIGIN}/auth/v1/token?grant_type=refresh_token`, { method: 'POST' })).rejects.toMatchObject({ name: 'AbortError' });
    expect(base.mock.calls[0][1].signal).toBeDefined();
  });

  it('o /token tem 10 s; signup, OTP e recover (emails) têm 30 s', () => {
    expect(authTimeoutFor(`${ORIGIN}/auth/v1/token?grant_type=refresh_token`, ORIGIN)).toBe(10000);
    expect(authTimeoutFor(`${ORIGIN}/auth/v1/signup`, ORIGIN)).toBe(30000);
    expect(authTimeoutFor(`${ORIGIN}/auth/v1/otp`, ORIGIN)).toBe(30000);
    expect(authTimeoutFor(`${ORIGIN}/auth/v1/recover`, ORIGIN)).toBe(30000);
  });

  it('só o Auth deste projeto: outra origem com /auth/v1/ no caminho fica sem prazo', () => {
    expect(isAuthRequest(`${ORIGIN}/auth/v1/user`, ORIGIN)).toBe(true);
    expect(isAuthRequest('https://outro.example.com/auth/v1/token', ORIGIN)).toBe(false);
    expect(isAuthRequest(`${ORIGIN}/rest/v1/x?q=/auth/v1/`, ORIGIN)).toBe(false);
    expect(isAuthRequest(`${ORIGIN}/functions/v1/coach-chat`, ORIGIN)).toBe(false);
  });

  it('os pedidos à base de dados passam sem prazo; um signal do chamador fica', async () => {
    const base = vi.fn(async () => new Response('{}'));
    const f = createAuthTimeoutFetch({ origin: ORIGIN, baseFetch: base, tokenMs: 30 });
    await f(`${ORIGIN}/rest/v1/runs?select=*`, {});
    expect(base.mock.calls[0][1].signal).toBeUndefined();
    const own = new AbortController();
    await f(`${ORIGIN}/auth/v1/user`, { signal: own.signal });
    expect(base.mock.calls[1][1].signal).toBe(own.signal);
  });

  it('a resposta a tempo passa tal como veio', async () => {
    const res = new Response('{"ok":true}');
    const f = createAuthTimeoutFetch({ origin: ORIGIN, baseFetch: async () => res, tokenMs: 1000 });
    await expect(f(new Request(`${ORIGIN}/auth/v1/token`))).resolves.toBe(res);
  });
});
