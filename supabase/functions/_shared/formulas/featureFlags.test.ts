import { assertEquals } from "jsr:@std/assert@1";
import { FEATURE_FLAG_DEFAULTS, proactiveTriggerAllowed, proactiveTriggerFlag } from "./featureFlags.ts";

const ALL_ON = Object.fromEntries(Object.keys(FEATURE_FLAG_DEFAULTS).map((k) => [k, true])) as typeof FEATURE_FLAG_DEFAULTS;

Deno.test("proactiveTriggerFlag: a Taça com «cup», as tabelas e o percentil com «badges», o resto com nenhum", () => {
  for (const t of ["cup_results", "cup_calendar", "cup_date_change", "cup_entry_deadline", "cup_map"]) assertEquals(proactiveTriggerFlag(t), "cup", t);
  assertEquals([proactiveTriggerFlag("leaderboard"), proactiveTriggerFlag("percentile_ready")], ["badges", "badges"]);
  for (const t of ["intervention", "race_after", "race_eve", "race_morning", "silence", "week_review", "block_end", "plan_resume", "missed_workout"]) {
    assertEquals(proactiveTriggerFlag(t), null, t);
  }
});

Deno.test("proactiveTriggerAllowed: desligados no lançamento, ligados com os interruptores — a carga e a prova sempre", () => {
  assertEquals(proactiveTriggerAllowed("cup_results", FEATURE_FLAG_DEFAULTS), false);
  assertEquals(proactiveTriggerAllowed("leaderboard", FEATURE_FLAG_DEFAULTS), false);
  assertEquals(proactiveTriggerAllowed("intervention", FEATURE_FLAG_DEFAULTS), true);
  assertEquals(proactiveTriggerAllowed("race_after", FEATURE_FLAG_DEFAULTS), true);
  assertEquals(proactiveTriggerAllowed("cup_results", ALL_ON), true);
  assertEquals(proactiveTriggerAllowed("percentile_ready", ALL_ON), true);
});
