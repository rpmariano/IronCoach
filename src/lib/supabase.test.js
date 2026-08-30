import { describe, it, expect, vi, afterEach } from 'vitest';
import { FunctionsClient } from '@supabase/functions-js';
import { invokeEdgeFunctionWithTimeout } from './supabase';

// `supabase.functions` (SupabaseClient.ts) é um GETTER que devolve uma
// instância NOVA de FunctionsClient a cada acesso — espiar
// `supabase.functions.invoke` mockaria só essa instância descartável, não
// a que invokeEdgeFunctionWithTimeout vai buscar quando chama `supabase.
// functions.invoke(...)` internamente. Espiar o protótipo partilhado é o
// que realmente intercepta, independentemente de quantas instâncias o
// getter crie.

// BUG CORRIGIDO (2026-08-30) — relatado como "erro de comunicação" ao
// falar com a Carol, mesmo com rede no telemóvel, e persistente mesmo
// depois de uma primeira tentativa de correção. Duas camadas do mesmo
// problema, as duas confirmadas contra o código real de
// @supabase/functions-js (não um mock inventado):
//
// 1. A deteção comparava `err.name === 'AbortError'` num `catch`.
// 2. Mas FunctionsClient.invoke() NUNCA REJEITA a promise — envolve TUDO
//    (incluindo a nossa própria AbortController a desistir) num try/catch
//    interno e resolve SEMPRE com `{ data: null, error }`. O `catch` deste
//    ficheiro nunca era alcançado para esta falha; a resposta chega
//    sempre pelo ramo `if (error)`, que assumia isTimeout:false sempre.
//
// Confirmado em produção (app_logs): a mensagem gravada tinha sempre
// meta:{fnName} — a assinatura exata do ramo `if (error)`, nunca do catch.
//
// Estes testes reproduzem o comportamento REAL da livraria (resolve,
// nunca rejeita) — ao contrário dos testes de Coach.jsx, que mockam
// invokeEdgeFunctionWithTimeout inteiro e por isso nunca exercitam esta
// lógica de deteção.
function functionsFetchError() {
  const err = new Error('Failed to send a request to the Edge Function');
  err.name = 'FunctionsFetchError';
  return err;
}

describe('invokeEdgeFunctionWithTimeout — deteção de timeout do cliente', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('BUG CORRIGIDO — o próprio timer do cliente disparar dá isTimeout:true (invoke() RESOLVE com {data:null, error}, nunca rejeita)', async () => {
    vi.spyOn(FunctionsClient.prototype, 'invoke').mockImplementation((_fnName, opts) => {
      return new Promise((resolve) => {
        opts.signal.addEventListener('abort', () => resolve({ data: null, error: functionsFetchError() }));
      });
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 20);

    expect(result.isTimeout).toBe(true);
    expect(result.error).toMatch(/timeout/i);
  });

  it('falha de rede genuína (sem o temporizador ter disparado) continua isTimeout:false', async () => {
    vi.spyOn(FunctionsClient.prototype, 'invoke').mockResolvedValue({ data: null, error: functionsFetchError() });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 45000);

    expect(result.isTimeout).toBe(false);
    expect(result.error).toBe('Failed to send a request to the Edge Function');
  });

  it('erro devolvido pelo próprio servidor mantém isTimeout:false (comportamento inalterado)', async () => {
    vi.spyOn(FunctionsClient.prototype, 'invoke').mockResolvedValue({
      data: null,
      error: { message: 'Falha na resposta do coach (503). Tenta novamente.' },
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 45000);

    expect(result.isTimeout).toBe(false);
    expect(result.error).toBe('Falha na resposta do coach (503). Tenta novamente.');
  });

  it('sucesso continua a devolver os dados sem isTimeout', async () => {
    vi.spyOn(FunctionsClient.prototype, 'invoke').mockResolvedValue({
      data: { reply: 'olá' },
      error: null,
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 45000);

    expect(result).toEqual({ data: { reply: 'olá' }, error: null });
  });

  it('rede de segurança: se invoke() alguma vez rejeitar em vez de resolver, o timer do cliente ainda é detetado no catch', async () => {
    vi.spyOn(FunctionsClient.prototype, 'invoke').mockImplementation((_fnName, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(functionsFetchError()));
      });
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 20);

    expect(result.isTimeout).toBe(true);
    expect(result.error).toMatch(/timeout/i);
  });
});
