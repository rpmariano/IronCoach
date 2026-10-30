/* O disjuntor do modelo principal do Gemini, partilhado entre instâncias
   (migração 20261030120000_gemini_circuit).

   Porquê (30-10-2026): o gemini-3.8-flash esteve sobrecarregado uma manhã
   inteira — 503 ou sem resposta em quase todos os pedidos — e cada pedido
   esperava pelo principal (até 25–60 s) antes de cair no Flash de recurso.
   Com o disjuntor, 3 falhas em 5 min abrem-no por 10 min: os pedidos vão
   direto ao recurso. Passado esse tempo, um só pedido testa o principal; se
   der certo fecha, se falhar reabre com o dobro, até 60 min. Os números e a
   atomicidade vivem nas duas funções SQL (gemini_circuit_check e
   gemini_circuit_record); aqui só se chamam.

   Nunca piora um pedido: sem configuração, com a base em baixo ou lenta, o
   disjuntor está fechado (como antes dele). O registo do resultado corre
   depois da resposta (EdgeRuntime.waitUntil) quando o runtime o deixa. */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type CircuitState = "closed" | "open" | "probe";

export interface GeminiCircuit {
  check(model: string): Promise<CircuitState>;
  record(model: string, ok: boolean): Promise<void>;
}

/** Sempre fechado: os testes e as funções sem service role. */
export const NO_CIRCUIT: GeminiCircuit = {
  check: () => Promise.resolve("closed"),
  record: () => Promise.resolve(),
};

/** Quanto se espera pela base antes de seguir como fechado. */
export const CIRCUIT_CHECK_TIMEOUT_MS = 1500;
/** O estado lido guarda-se na instância só este tempo (um pedido do chat faz
 *  várias rondas; a fonte de verdade é sempre a tabela). Um «probe» nunca se guarda. */
const CACHE_MS = 10000;

export async function safeCheck(circuit: GeminiCircuit, model: string, timeoutMs = CIRCUIT_CHECK_TIMEOUT_MS): Promise<CircuitState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const state = await Promise.race([
      circuit.check(model),
      new Promise<CircuitState>((resolve) => { timer = setTimeout(() => resolve("closed"), timeoutMs); }),
    ]);
    return state === "open" || state === "probe" ? state : "closed";
  } catch (e) {
    console.warn("[gemini] disjuntor sem base — segue fechado:", e instanceof Error ? e.message : e);
    return "closed";
  } finally {
    clearTimeout(timer);
  }
}

/** Corre `p` depois da resposta quando o runtime o deixa; senão espera por ela. Nunca rejeita. */
export async function afterResponse(p: Promise<unknown>): Promise<void> {
  const safe = p.catch((e) => console.warn("[gemini] disjuntor: resultado não registado —", e instanceof Error ? e.message : e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) {
    rt.waitUntil(safe);
    return;
  }
  await safe;
}

function supabaseCircuit(sb: SupabaseClient): GeminiCircuit {
  const cache = new Map<string, { state: CircuitState; at: number }>();
  return {
    async check(model) {
      const hit = cache.get(model);
      if (hit && Date.now() - hit.at < CACHE_MS) return hit.state;
      const { data, error } = await sb.rpc("gemini_circuit_check", { p_model: model });
      if (error) throw new Error(error.message);
      const state = (data === "open" || data === "probe" ? data : "closed") as CircuitState;
      if (state !== "probe") cache.set(model, { state, at: Date.now() });
      else cache.delete(model);
      return state;
    },
    async record(model, ok) {
      const { data, error } = await sb.rpc("gemini_circuit_record", { p_model: model, p_ok: ok });
      if (error) throw new Error(error.message);
      const state = (data === "open" ? "open" : "closed") as CircuitState;
      cache.set(model, { state, at: Date.now() });
      if (state === "open") console.warn(`[gemini] disjuntor ABERTO para ${model}: os pedidos vão direto ao recurso`);
    },
  };
}

let instanceCircuit: GeminiCircuit | null = null;
/** O disjuntor da instância: o da tabela com a service role, ou NO_CIRCUIT. */
export function defaultCircuit(): GeminiCircuit {
  if (instanceCircuit) return instanceCircuit;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  instanceCircuit = url && key ? supabaseCircuit(createClient(url, key, { auth: { persistSession: false } })) : NO_CIRCUIT;
  return instanceCircuit;
}
