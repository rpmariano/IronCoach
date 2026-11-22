// Os interruptores por funcionalidade (v1 lite, 2026-11-22, aprovado pelo
// Rui): public.app_feature_flags, só o admin os muda. Aqui, a leitura do lado
// das Edge Functions, com cache curta por instância; as chaves e os defeitos
// (partilhados com a app) estão em formulas/featureFlags.ts.
//
// Regra: a Carol nunca fala de uma funcionalidade desligada (nem dispara os
// avisos proativos dela), mas a inteligência continua a usar os dados todos —
// uma prova da Taça conta como prova, as conquistas continuam a ser
// calculadas pela app quando voltarem. As decisões de segurança (a carga)
// nunca dependem de um interruptor.
//
// Se a leitura falhar (sem a tabela, rede), valem os DEFEITOS (formulas/) —
// o estado do lançamento —, nunca «tudo ligado».

import { createClient } from "jsr:@supabase/supabase-js@2";
import { FEATURE_FLAG_DEFAULTS, type FeatureFlags, mergeFeatureFlags } from "./formulas/featureFlags.ts";

export { FEATURE_FLAG_DEFAULTS, FEATURE_FLAG_KEYS, mergeFeatureFlags, proactiveTriggerAllowed, proactiveTriggerFlag } from "./formulas/featureFlags.ts";
export type { FeatureFlag, FeatureFlags } from "./formulas/featureFlags.ts";

/** Quanto tempo uma instância confia no que leu. */
export const FEATURE_FLAGS_CACHE_MS = 60_000;

let cache: { at: number; flags: FeatureFlags } | null = null;

/** Para os testes: esquece a cache. */
export function resetFeatureFlagsCache(): void {
  cache = null;
}

/**
 * Os interruptores em vigor. `db`: um cliente qualquer (a tabela lê-se com o
 * do atleta ou com a service role); por omissão, um novo com a service role.
 * Uma falha a ler devolve a última leitura boa desta instância, ou os
 * defeitos — e não fica em cache, para tentar outra vez no pedido seguinte.
 */
export async function getFeatureFlags(
  // deno-lint-ignore no-explicit-any
  deps: { db?: any; nowMs?: number } = {},
): Promise<FeatureFlags> {
  const now = deps.nowMs ?? Date.now();
  if (cache && now - cache.at < FEATURE_FLAGS_CACHE_MS) return cache.flags;
  try {
    const db = deps.db ?? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await db.from("app_feature_flags").select("key, enabled");
    if (error) {
      console.warn("featureFlags: leitura falhou — valem os defeitos:", error.message ?? error);
      return cache?.flags ?? { ...FEATURE_FLAG_DEFAULTS };
    }
    const flags = mergeFeatureFlags(data);
    cache = { at: now, flags };
    return flags;
  } catch (e) {
    console.warn("featureFlags: leitura falhou — valem os defeitos:", e instanceof Error ? e.message : e);
    return cache?.flags ?? { ...FEATURE_FLAG_DEFAULTS };
  }
}
