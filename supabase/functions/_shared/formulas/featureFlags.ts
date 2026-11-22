// Os interruptores por funcionalidade (v1 lite, 2026-11-22, aprovado pelo
// Rui) — a parte pura, partilhada pela app (@formulas) e pelo servidor: as
// chaves, os defeitos (o estado do lançamento) e a junção das linhas de
// public.app_feature_flags sobre eles. A leitura com cache das Edge Functions
// está em ../featureFlags.ts; os nomes e as descrições para o Admin, na app.
//
// Regra: uma chave que não esteja na tabela (ou uma leitura que falhe) vale o
// defeito daqui — nunca «tudo ligado» por acidente.

export type FeatureFlag =
  | "cup" // a Taça: jornadas, classificações, equipas, inscrições, avisos
  | "race_memories" // diploma, medalha, mural, fotos da prova
  | "badges" // conquistas e medalhas
  | "water" // a água e os lembretes de água
  | "pantry_advanced" // regras e modelos de refeição (os alimentos frequentes ficam sempre)
  | "advanced_charts" // análises cruzadas e gráficos técnicos
  | "tutorial"
  | "shoes" // o armário de sapatilhas
  | "load_profile_choice"; // a escolha Prudente / Mais volume

export type FeatureFlags = Record<FeatureFlag, boolean>;

/** O estado do lançamento (a migration 20261122120000 grava o mesmo). */
export const FEATURE_FLAG_DEFAULTS: Readonly<FeatureFlags> = Object.freeze({
  cup: false,
  race_memories: false,
  badges: false,
  water: false,
  pantry_advanced: false,
  advanced_charts: false,
  tutorial: false,
  shoes: true,
  load_profile_choice: true,
});

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlag[];

/** O interruptor de que um momento proativo depende (null: nenhum — os da
 *  carga, da prova e do plano nunca se calam). A Taça (cup_*) com «cup»; as
 *  tabelas e o percentil («Onde estás», a vitrina) com «badges». */
export function proactiveTriggerFlag(trigger: string): FeatureFlag | null {
  if (trigger.startsWith("cup_")) return "cup";
  if (trigger === "leaderboard" || trigger === "percentile_ready") return "badges";
  return null;
}

/** Este momento proativo pode sair com estes interruptores? */
export function proactiveTriggerAllowed(trigger: string, flags: FeatureFlags): boolean {
  const flag = proactiveTriggerFlag(trigger);
  return !flag || flags[flag];
}

/** As linhas da tabela sobre os defeitos: só chaves conhecidas e booleanos. */
export function mergeFeatureFlags(rows: unknown): FeatureFlags {
  const out: FeatureFlags = { ...FEATURE_FLAG_DEFAULTS };
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const key = (r as { key?: unknown })?.key;
    const enabled = (r as { enabled?: unknown })?.enabled;
    if (typeof key === "string" && key in out && typeof enabled === "boolean") out[key as FeatureFlag] = enabled;
  }
  return out;
}
