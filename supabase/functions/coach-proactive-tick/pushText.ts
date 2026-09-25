// O texto da notificação, escrito pela Carol (specs/carol-omnisciencia-
// omnipresenca.md, ação P.4).
//
// Na P.3 o texto era uma frase fixa por momento. Agora pede-se ao Gemini uma
// notificação curta, na voz dela, com os dados reais do momento — o nome da
// prova, a distância, a hora de partida, o tempo feito face ao objetivo, os
// dias sem registos. A conversa a sério continua a ser escrita pelo
// coach-chat quando o atleta abre o Coach; isto é só o que aparece no ecrã
// bloqueado para ele abrir.
//
// Três guardas: o texto é validado (tamanho, sem emoji, sem "!", uma linha);
// se falhar a validação, a chamada, ou demorar, sai a frase fixa de
// proactivePushMessage; e o prompt proíbe inventar números que não estão lá.

import { CAROL_TONE_RULES_SHORT } from "../_shared/carolTone.ts";
import { proactivePushMessage, type ServerProactiveCandidate } from "../_shared/formulas/proactiveTriggers.ts";

export const PUSH_TEXT_MIN = 15;
export const PUSH_TEXT_MAX = 140;
const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_TIMEOUT_MS = 10000;

export interface PushFacts {
  firstName?: string | null;
  raceName?: string | null;
  distanceKm?: number | string | null;
  startTime?: string | null;           // "09:00:00"
  targetSeconds?: number | null;
  runSeconds?: number | null;           // balanço com corrida: o tempo feito
  runDistanceKm?: number | string | null;
}

function hhmmss(total: number): string {
  const s = Math.round(total);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

const MOMENT: Record<ServerProactiveCandidate["trigger"], string> = {
  race_morning: "É a manhã da prova. Ele vai abrir a app antes da partida: a notificação chama-o para as duas coisas que lhe queres dizer.",
  race_eve: "É a véspera da prova. A notificação chama-o para o plano de hoje à noite (jantar, sono) e de amanhã de manhã.",
  race_after: "A prova já foi. A notificação chama-o para o balanço contigo.",
  silence: "Ele não regista nada há vários dias. A notificação pergunta se está bem, sem sermão.",
  // Nunca chega ao modelo (frase fixa, ver composePushMessage); fica pelo tipo.
  missed_workout: "O treino de ontem não está registado. A notificação pergunta o que aconteceu, sem acusar.",
  intervention: "Há um assunto por resolver.",
  race_conflict: "Ele tem duas provas principais no mesmo bloco de treino. A notificação chama-o para decidirem juntos qual é o objetivo.",
  block_end: "O bloco de treino dele está a acabar e não há outro a seguir. A notificação chama-o para fazerem o ponto e prepararem o próximo.",
  week_review: "A semana dele fechou no domingo. A notificação chama-o para verem juntos como correu, face ao plano, e o foco da que começa. Não digas o dia da semana de hoje nem que o balanço já está feito.",
  // Nunca chegam ao modelo (frases fixas, ver composePushMessage): no ecrã
  // bloqueado não vão posições nem percentis. Ficam pelo tipo.
  leaderboard: "Ele entrou (ou saiu) das tabelas com nomes do escalão dele.",
  percentile_ready: "Já há números publicados para ele ver onde está no escalão.",
};

/** Os dados do momento, em linhas — só o que existe; nada é inventado. */
export function describeFacts(c: ServerProactiveCandidate, f: PushFacts): string[] {
  const lines: string[] = [];
  if (f.firstName) lines.push(`Nome do atleta: ${f.firstName}`);
  if (c.trigger === "silence" && c.lastCheckinDate) {
    // P.10: ele faz os check-ins — o que falta são os treinos, não notícias dele.
    // Sem nenhum treino registado não há dias a contar (o chat diz o mesmo).
    lines.push(c.trainingSilenceDays == null
      ? "Treinos registados: nenhum até hoje"
      : `Dias sem nenhum treino registado: ${c.trainingSilenceDays}`);
    lines.push(`Último check-in: ${c.lastCheckinDate} — ele está por cá; não digas que não regista nada, fala dos treinos`);
  } else if (c.trigger === "silence") {
    lines.push(`Dias sem registos: ${c.silenceDays ?? "vários"}`);
  }
  if (c.trigger === "block_end" && c.blockEnd) lines.push(`Último dia do bloco: ${c.blockEnd}`);
  if (c.trigger === "week_review" && c.weekStart && c.weekEnd) lines.push(`Semana revista: ${c.weekStart} a ${c.weekEnd}`);
  if (c.trigger === "race_conflict") {
    if (c.raceName) lines.push(`Prova-objetivo do bloco: ${c.raceName}`);
    if (c.conflictRaceNames?.length) lines.push(`Outra(s) principal(is) no mesmo bloco: ${c.conflictRaceNames.join(", ")}`);
    return lines;
  }
  if (c.trigger !== "silence" && c.trigger !== "block_end" && c.trigger !== "intervention" && c.trigger !== "week_review" && c.trigger !== "missed_workout" && c.trigger !== "leaderboard" && c.trigger !== "percentile_ready") {
    const name = (f.raceName || c.raceName || "").trim();
    if (name) lines.push(`Prova: ${name}`);
    const km = Number(f.distanceKm);
    if (Number.isFinite(km) && km > 0) lines.push(`Distância: ${Math.round(km * 10) / 10} km`);
    if ((c.trigger === "race_morning" || c.trigger === "race_eve") && f.startTime) lines.push(`Partida: ${String(f.startTime).slice(0, 5)}`);
    const target = Number(f.targetSeconds);
    if (Number.isFinite(target) && target > 0) lines.push(`Objetivo de tempo: ${hhmmss(target)}`);
    if (c.trigger === "race_after") {
      const run = Number(f.runSeconds);
      if (c.hasRun && Number.isFinite(run) && run > 0) {
        lines.push(`Tempo feito: ${hhmmss(run)}`);
        if (Number.isFinite(target) && target > 0) {
          const delta = run - target;
          lines.push(delta <= 0 ? `Bateu o objetivo por ${hhmmss(-delta)}` : `Ficou ${hhmmss(delta)} acima do objetivo`);
        }
      } else {
        lines.push("A corrida da prova ainda não está registada.");
      }
    }
  }
  return lines;
}

export function buildPushPrompt(c: ServerProactiveCandidate, f: PushFacts): string {
  return (
    `És a Carol, a treinadora deste atleta. Escreve o texto de UMA notificação no telemóvel — não é a conversa: ` +
    `é a frase que aparece no ecrã bloqueado e que o faz abrir a app.\n\n` +
    `${CAROL_TONE_RULES_SHORT}\n\n` +
    `REGRAS DA NOTIFICAÇÃO:\n` +
    `- Uma ou duas frases, no máximo ${PUSH_TEXT_MAX} caracteres no total. Uma linha só.\n` +
    `- Sem emoji. Sem ponto de exclamação. Sem aspas.\n` +
    `- Específica para este momento, com os dados abaixo. Não uses números que não estejam nos dados.\n` +
    `- Não comeces pelo nome dele, e não assines.\n\n` +
    `MOMENTO: ${c.trigger === "silence" && c.lastCheckinDate
      ? "Ele faz os check-ins mas não regista treinos há vários dias. A notificação pergunta pelos treinos, sem sermão."
      : MOMENT[c.trigger]}\n` +
    `DADOS:\n${describeFacts(c, f).map((l) => `- ${l}`).join("\n") || "- (sem dados adicionais)"}\n\n` +
    `Devolve só o texto da notificação.`
  );
}

/** O texto limpo, ou null se não servir (e aí sai a frase fixa). */
export function validatePushText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim().replace(/^["'«“]+|["'»”]+$/g, "").trim();
  if (text.length < PUSH_TEXT_MIN || text.length > PUSH_TEXT_MAX) return null;
  if (/\p{Extended_Pictographic}/u.test(text)) return null;
  if (text.includes("!")) return null;
  return text;
}

/** O primeiro texto das partes da resposta (o modelo pode pôr partes de
 *  raciocínio à frente — ver extractReplyText no coach-chat). */
// deno-lint-ignore no-explicit-any
export function extractText(json: any): string | null {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const p of parts) if (typeof p?.text === "string" && p.text.trim() && !p.thought) return p.text;
  return null;
}

export type PushUsage = { input_tokens: number; output_tokens: number };

/**
 * O título e o corpo da notificação. Nunca rejeita: qualquer falha dá a frase
 * fixa. `fetchImpl` é injetável para os testes. `usage` são os tokens da
 * chamada ao modelo quando ela respondeu — mesmo que o texto não sirva e saia
 * a frase fixa, o custo existiu (P.10, app_logs); null sem chamada ou sem
 * resposta.
 */
export async function composePushMessage(
  c: ServerProactiveCandidate,
  facts: PushFacts,
  geminiKey: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<{ title: string; body: string; generated: boolean; usage: PushUsage | null }> {
  const fallback = proactivePushMessage(c);
  /* O assunto por resolver nunca passa pelo gerador: o motivo pode ser de
     saúde (uma dor, um sinal de sobretreino) e não vai para o ecrã
     bloqueado. Sai sempre a frase genérica. O treino de ontem também não
     (P.10): a pergunta é fixa de propósito, para não acusar nem inventar.
     Nem a Vitrina (2026-09-25): uma posição ou um percentil no ecrã
     bloqueado é uma comparação com outros atletas à vista de quem pegar no
     telemóvel — o número diz-se no chat, a ele. */
  const fixa = c.trigger === "intervention" || c.trigger === "missed_workout" || c.trigger === "leaderboard" || c.trigger === "percentile_ready";
  if (!geminiKey || fixa) return { ...fallback, generated: false, usage: null };
  try {
    const res = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPushPrompt(c, facts) }] }],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.8 },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.warn("coach-proactive-tick: texto gerado falhou", res.status);
      return { ...fallback, generated: false, usage: null };
    }
    const json = await res.json();
    // Os mesmos campos das outras funções (input = prompt, output = candidatos).
    const usage: PushUsage = {
      input_tokens: Number(json?.usageMetadata?.promptTokenCount) || 0,
      output_tokens: Number(json?.usageMetadata?.candidatesTokenCount) || 0,
    };
    const text = validatePushText(extractText(json));
    return text
      ? { title: fallback.title, body: text, generated: true, usage }
      : { ...fallback, generated: false, usage };
  } catch (e) {
    console.warn("coach-proactive-tick: texto gerado falhou", e);
    return { ...fallback, generated: false, usage: null };
  }
}
