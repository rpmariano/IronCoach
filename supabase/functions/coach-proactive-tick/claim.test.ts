// O registo antes do envio, com a M3 em falta tolerada (specs/trofeu.md §8, §9.3).
import { assertEquals } from "jsr:@std/assert@1";
import { claimWithCupFallback } from "./claim.ts";
import type { ChooseCtx } from "./decide.ts";
import type { TickCandidate } from "../_shared/formulas/cupNotices.ts";

const NONE = { raceId: null, raceName: null, hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };
const cupDeadline = {
  ...NONE, trigger: "cup_entry_deadline", key: "cup_entry_deadline:rd-3",
  cup: { editionId: "ed-1", roundId: "rd-3", body: "A inscrição na jornada 3 (Corrida CCD) fecha amanhã às 24h.", tab: "home" },
} as TickCandidate;
const cupResults = {
  ...NONE, trigger: "cup_results", key: "cup_results:rd-3",
  cup: { editionId: "ed-1", roundId: "rd-3", body: "Saiu a classificação da jornada 3 (Corrida CCD). Vem ver comigo.", tab: "coach" },
} as TickCandidate;
const silence: TickCandidate = { ...NONE, trigger: "silence", key: "silence:2027-01-10", silenceDays: 4, anchorDate: "2027-01-10" };
const week: TickCandidate = { ...NONE, trigger: "week_review", key: "week_review:2027-01-11", anchorDate: "2027-01-17" };

const ctx: ChooseCtx = {
  lisbonHour: 12, deliveredKeys: new Set(), pushedKeys: new Set(), pushedTodayCount: 0, lastModelMessageAt: null,
  nowMs: Date.parse("2027-01-19T12:00:00Z"), prefs: { maxPerDay: 3 },
};

function claimer(errors: Record<string, { code?: string; message?: string }>) {
  const claimed: string[] = [];
  return {
    claimed,
    claim: (c: TickCandidate) => {
      claimed.push(c.key);
      return Promise.resolve({ error: errors[c.key] ?? null });
    },
  };
}

const CHECK = { code: "23514", message: 'new row for relation "coach_proactive_pushes" violates check constraint "coach_proactive_pushes_trigger_check"' };

Deno.test("claim: sem erro, fica o escolhido", async () => {
  const c = claimer({});
  const r = await claimWithCupFallback([cupDeadline, silence], ctx, cupDeadline, c.claim);
  assertEquals([r.candidate?.key, r.claimErr, r.cupRefused, r.decision], ["cup_entry_deadline:rd-3", null, false, { send: true }]);
  assertEquals(c.claimed, ["cup_entry_deadline:rd-3"]);
});

Deno.test("claim: M3 em falta — o cup_* recusado (23514) passa a vez ao momento seguinte", async () => {
  const c = claimer({ "cup_entry_deadline:rd-3": CHECK, "cup_results:rd-3": CHECK });
  const list = [cupDeadline, cupResults, silence, week];
  const r = await claimWithCupFallback(list, ctx, cupDeadline, c.claim);
  assertEquals(r.candidate?.key, "silence:2027-01-10");
  assertEquals(r.claimErr, null);
  assertEquals(r.cupRefused, true);
  assertEquals(r.candidates.map((x) => x.key), ["silence:2027-01-10", "week_review:2027-01-11"]);
  // Nunca tenta o 2.º cup_*.
  assertEquals(c.claimed, ["cup_entry_deadline:rd-3", "silence:2027-01-10"]);
});

Deno.test("claim: M3 em falta e só havia cup_* — nada a enviar, sem erro", async () => {
  const c = claimer({ "cup_results:rd-3": CHECK });
  const r = await claimWithCupFallback([cupResults], ctx, cupResults, c.claim);
  assertEquals([r.candidate, r.claimErr, r.cupRefused, r.candidates], [null, null, true, []]);
  assertEquals(r.decision, { send: false, reason: "sem_momento" });
});

Deno.test("claim: o seguinte também não pode sair agora — o motivo dele (o limite do dia continua a valer)", async () => {
  const c = claimer({ "cup_results:rd-3": CHECK });
  const r = await claimWithCupFallback([cupResults, silence], { ...ctx, pushedKeys: new Set(["silence:2027-01-10"]) }, cupResults, c.claim);
  assertEquals([r.candidate, r.cupRefused, r.decision], [null, true, { send: false, reason: "ja_notificado" }]);
  assertEquals(c.claimed, ["cup_results:rd-3"]);
});

Deno.test("claim: a chave já registada (23505) é o ja_notificado de sempre, sem alternativa", async () => {
  const dup = { code: "23505", message: "duplicate key value violates unique constraint" };
  const c = claimer({ "cup_entry_deadline:rd-3": dup, "silence:2027-01-10": dup });
  const r1 = await claimWithCupFallback([cupDeadline, silence], ctx, cupDeadline, c.claim);
  assertEquals([r1.candidate?.key, r1.claimErr, r1.cupRefused], ["cup_entry_deadline:rd-3", dup, false]);
  // Um 23514 num tipo antigo também não é a M3: sem alternativa.
  const c2 = claimer({ "silence:2027-01-10": CHECK });
  const r2 = await claimWithCupFallback([silence, week], ctx, silence, c2.claim);
  assertEquals([r2.candidate?.key, r2.claimErr, r2.cupRefused], ["silence:2027-01-10", CHECK, false]);
  assertEquals(c2.claimed, ["silence:2027-01-10"]);
});

Deno.test("claim: o seguinte bate na chave primária — devolve o erro dele", async () => {
  const dup = { code: "23505", message: "duplicate" };
  const c = claimer({ "cup_results:rd-3": CHECK, "silence:2027-01-10": dup });
  const r = await claimWithCupFallback([cupResults, silence], ctx, cupResults, c.claim);
  assertEquals([r.candidate?.key, r.claimErr, r.cupRefused], ["silence:2027-01-10", dup, true]);
});
