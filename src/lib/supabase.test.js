import { describe, it, expect, vi, afterEach } from 'vitest';
import { invokeEdgeFunctionWithTimeout, supabase } from './supabase';

/* O protótipo a espiar tem de vir do cliente VIVO, não de um
   `import { FunctionsClient } from '@supabase/functions-js'`.
   Era assim que estava até 2026-09-18, e passou a falhar quando o pacote
   ficou resolvido em duas cópias (o npm dentro do Deno instala em
   node_modules/.deno/...): a classe importada aqui deixou de ser a mesma que
   o SupabaseClient instancia lá dentro — `Object.getPrototypeOf(supabase
   .functions) === functionsProto` dá false —, por isso o spy
   ficava a mockar uma classe que ninguém usava, o invoke REAL corria, e
   todos estes testes recebiam "Sessão inválida" do servidor a sério.
   Ir buscá-lo à instância acerta sempre, haja as cópias que houver. */
const functionsProto = Object.getPrototypeOf(supabase.functions);

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
    vi.spyOn(functionsProto, 'invoke').mockImplementation((_fnName, opts) => {
      return new Promise((resolve) => {
        opts.signal.addEventListener('abort', () => resolve({ data: null, error: functionsFetchError() }));
      });
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 20);

    expect(result.isTimeout).toBe(true);
    expect(result.error).toMatch(/timeout/i);
  });

  it('falha de rede genuína (sem o temporizador ter disparado) continua isTimeout:false', async () => {
    vi.spyOn(functionsProto, 'invoke').mockResolvedValue({ data: null, error: functionsFetchError() });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 45000);

    expect(result.isTimeout).toBe(false);
    expect(result.error).toBe('Failed to send a request to the Edge Function');
    // Ação P.12: isNetwork pela CLASSE do erro (FunctionsFetchError), nunca
    // por navigator.onLine nem por procurar "Failed to fetch" no texto.
    expect(result.isNetwork).toBe(true);
    expect(result.status).toBeNull();
  });

  it('erro devolvido pelo próprio servidor mantém isTimeout:false (comportamento inalterado)', async () => {
    vi.spyOn(functionsProto, 'invoke').mockResolvedValue({
      data: null,
      error: { message: 'Não consegui processar isto agora (erro 503). Tenta outra vez.' },
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 45000);

    expect(result.isTimeout).toBe(false);
    expect(result.error).toBe('Não consegui processar isto agora (erro 503). Tenta outra vez.');
    // O servidor respondeu (nem que seja com erro) — não é falha de rede.
    expect(result.isNetwork).toBe(false);
  });

  it('ação P.12: o código HTTP do servidor (error.context.status) vem no resultado, para o Coach mostrar o erro dela em vez do texto de rede', async () => {
    vi.spyOn(functionsProto, 'invoke').mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 502, json: async () => ({ error: 'Estou com muitos pedidos. Dá-me uns minutos.' }) },
      },
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 45000);

    expect(result.status).toBe(502);
    expect(result.isNetwork).toBe(false);
    expect(result.error).toBe('Estou com muitos pedidos. Dá-me uns minutos.');
    // A frase é dela (veio no campo `error`): o Coach pode mostrá-la.
    expect(result.serverText).toBe('Estou com muitos pedidos. Dá-me uns minutos.');
  });

  it('revisão pré-deploy 2026-09-25: um erro do gateway sem frase dela não dá serverText (o texto em inglês fica só para o log)', async () => {
    vi.spyOn(functionsProto, 'invoke').mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 546, json: async () => ({ code: 'WORKER_LIMIT', message: 'Worker failed to boot' }) },
      },
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 45000);

    expect(result.status).toBe(546);
    expect(result.isNetwork).toBe(false);
    expect(result.serverText).toBeNull();
    expect(result.error).toBe('Edge Function returned a non-2xx status code');
  });

  it('sucesso continua a devolver os dados sem isTimeout', async () => {
    vi.spyOn(functionsProto, 'invoke').mockResolvedValue({
      data: { reply: 'olá' },
      error: null,
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 45000);

    expect(result).toEqual({ data: { reply: 'olá' }, error: null });
  });

  it('rede de segurança: se invoke() alguma vez rejeitar em vez de resolver, o timer do cliente ainda é detetado no catch', async () => {
    vi.spyOn(functionsProto, 'invoke').mockImplementation((_fnName, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(functionsFetchError()));
      });
    });

    const result = await invokeEdgeFunctionWithTimeout('coach-chat', {}, 20);

    expect(result.isTimeout).toBe(true);
    expect(result.error).toMatch(/timeout/i);
  });
});
