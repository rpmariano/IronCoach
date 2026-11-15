import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { newClientRequestId, useClientRequestId, upsertById, saveErrorText, SAVE_RETRY_SAFE_TEXT, SAVE_NETWORK_TEXT } from './clientRequestId';

describe('clientRequestId (idempotência das gravações)', () => {
  it('um uuid v4', () => {
    expect(newClientRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('o hook devolve sempre o mesmo id até renew()', () => {
    const { result } = renderHook(() => useClientRequestId());
    const a = result.current.get();
    expect(result.current.get()).toBe(a);
    result.current.renew();
    expect(result.current.get()).not.toBe(a);
  });
  it('upsertById substitui pelo id e põe à cabeça', () => {
    expect(upsertById([{ id: 'a' }, { id: 'b', v: 1 }], { id: 'b', v: 2 })).toEqual([{ id: 'b', v: 2 }, { id: 'a' }]);
    expect(upsertById([{ id: 'a' }], { id: 'c' })).toEqual([{ id: 'c' }, { id: 'a' }]);
  });
  it('saveErrorText: timeout e rede dizem que tentar outra vez não duplica; os outros erros passam', () => {
    expect(saveErrorText({ error: 'x', isTimeout: true })).toBe(SAVE_RETRY_SAFE_TEXT);
    expect(saveErrorText({ error: 'x', isNetwork: true })).toBe(SAVE_NETWORK_TEXT);
    expect(saveErrorText({ error: 'O Coach está ocupado.' })).toBe('O Coach está ocupado.');
  });
  it('#116: um erro do gateway sem frase do servidor nunca mostra «Edge Function» ao atleta', () => {
    const t = saveErrorText({ error: 'Edge Function returned a non-2xx status code', serverText: null, status: 546, isNetwork: false });
    expect(t).not.toMatch(/edge function/i);
    expect(t).toMatch(/Tenta de novo/);
    expect(saveErrorText({ error: 'Não percebi.', serverText: 'Não percebi.', status: 400 })).toBe('Não percebi.');
  });
});
