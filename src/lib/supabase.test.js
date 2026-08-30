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
// falar com a Carol, mesmo com rede no telemóvel, "já aconteceu algumas
// vezes". A deteção de timeout comparava `err.name === 'AbortError'`, mas
// `supabase.functions.invoke()` envolve QUALQUER falha do fetch — a nossa
// própria AbortController incluída — num `FunctionsFetchError` genérico
// (mensagem fixa "Failed to send a request to the Edge Function", nome
// "FunctionsFetchError"), sem preservar o nome original. A comparação por
// nome era por isso sempre falsa: um pedido que o PRÓPRIO cliente desistiu
// de esperar (isTimeout deveria ser true, para acionar o aviso de demora +
// sondagem em Coach.jsx) caía sempre no ramo de falha de rede genérica —
// a mesma mensagem de uma falha de rede real, sem ligação nenhuma com o
// estado da rede do atleta.
//
// Estes testes reproduzem o comportamento REAL da livraria (o erro nunca
// chega com name: 'AbortError') — ao contrário dos testes de Coach.jsx,
// que mockam invokeEdgeFunctionWithTimeout inteiro e por isso nunca
// exercitam esta lógica de deteção.
function mockFunctionsFetchError() {
  const err = new Error('Failed to send a request to the Edge Function');
  err.name = 'FunctionsFetchError';
  return err;
}

describe('invokeEdgeFunctionWithTimeout — deteção de timeout do cliente', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('BUG CORRIGIDO — o próprio timer do cliente disparar dá isTimeout:true, mesmo com o erro embrulhado sem name "AbortError"', async () => {
    vi.spyOn(FunctionsClient.prototype, 'invoke').mockImplementation((_fnName, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(mockFunctionsFetchError()));
      });
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 20);

    expect(result.isTimeout).toBe(true);
    expect(result.error).toMatch(/timeout/i);
  });

  it('falha de rede genuína (sem o temporizador ter disparado) continua isTimeout:false', async () => {
    vi.spyOn(FunctionsClient.prototype, 'invoke').mockImplementation(() => Promise.reject(mockFunctionsFetchError()));

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
});
