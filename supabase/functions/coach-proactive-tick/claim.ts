// O registo da notificação ANTES de a enviar (coach_proactive_pushes), com a
// M3 em falta tolerada (specs/trofeu.md §8, §9.3; Fase 5 do Troféu).
//
// Sem a M3, o CHECK coach_proactive_pushes_trigger_check recusa os tipos
// cup_* (23514). Isso não pode calar o atleta: os avisos do Troféu saem da
// lista e escolhe-se o momento seguinte, pelas mesmas regras (choosePush). Um
// erro noutro momento — a chave já registada por outra execução (23505), ou
// qualquer outro — continua a ser o "ja_notificado" de sempre.

import { isCupNoticeTrigger, type TickCandidate } from "../_shared/formulas/cupNotices.ts";
import { choosePush, type ChooseCtx, type PushDecision } from "./decide.ts";

export type ClaimError = { code?: string; message?: string } | null;

export interface ClaimResult<C extends TickCandidate> {
  /** O momento registado (ou, com `claimErr`, o que falhou); null se, sem os
   *  cup_*, não sobrou nenhum que possa sair agora. */
  candidate: C | null;
  decision: PushDecision;
  claimErr: ClaimError;
  /** A lista com que se ficou (sem os cup_*, se a BD os recusou). */
  candidates: C[];
  /** A BD recusou um cup_* (a M3 por aplicar): calá-los até ao fim da execução. */
  cupRefused: boolean;
}

export async function claimWithCupFallback<C extends TickCandidate>(
  candidates: C[],
  ctx: ChooseCtx,
  picked: C,
  claim: (c: C) => PromiseLike<{ error: ClaimError }>,
): Promise<ClaimResult<C>> {
  const { error } = await claim(picked);
  if (!error) return { candidate: picked, decision: { send: true }, claimErr: null, candidates, cupRefused: false };
  if (error.code !== "23514" || !isCupNoticeTrigger(picked.trigger)) {
    return { candidate: picked, decision: { send: true }, claimErr: error, candidates, cupRefused: false };
  }
  const rest = candidates.filter((c) => !isCupNoticeTrigger(c.trigger));
  const next = choosePush(rest, ctx);
  if (!next.candidate || !next.decision.send) {
    return { candidate: null, decision: next.decision, claimErr: null, candidates: rest, cupRefused: true };
  }
  const second = await claim(next.candidate);
  return { candidate: next.candidate, decision: next.decision, claimErr: second.error ?? null, candidates: rest, cupRefused: true };
}
