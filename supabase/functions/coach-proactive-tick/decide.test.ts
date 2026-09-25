import { assertEquals } from "jsr:@std/assert@1";
import { choosePush, decidePush, lisbonDateOf, tickLogRow, tickLogSignature } from "./decide.ts";

const candidate = { trigger: "race_eve" as const, key: "race_eve:r1", raceId: "r1", raceName: "Meia", hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };
const NOW = Date.parse("2026-09-18T15:00:00Z");
const base = { candidate, lisbonHour: 16, deliveredKeys: new Set<string>(), pushedKeys: new Set<string>(), pushedTodayCount: 0, lastModelMessageAt: null, nowMs: NOW };

Deno.test("decidePush: envia quando nada o impede", () => {
  assertEquals(decidePush(base), { send: true });
});

Deno.test("decidePush: cada travão, pela ordem", () => {
  assertEquals(decidePush({ ...base, candidate: null }), { send: false, reason: "sem_momento" });
  assertEquals(decidePush({ ...base, lisbonHour: 22 }), { send: false, reason: "fora_de_horas" });
  assertEquals(decidePush({ ...base, deliveredKeys: new Set(["race_eve:r1"]) }), { send: false, reason: "ja_entregue" });
  assertEquals(decidePush({ ...base, pushedKeys: new Set(["race_eve:r1"]) }), { send: false, reason: "ja_notificado" });
  assertEquals(decidePush({ ...base, pushedTodayCount: 1 }), { send: false, reason: "limite_diario" });
  assertEquals(decidePush({ ...base, lastMessage: { role: "model", created_at: "2026-09-18T11:00:00Z" } }), { send: false, reason: "falou_ha_pouco" });
  // Falou há mais de 6 horas: já não trava.
  assertEquals(decidePush({ ...base, lastMessage: { role: "model", created_at: "2026-09-18T08:00:00Z" } }), { send: true });
  // O atleta foi o último a escrever: ela não está a empilhar mensagens.
  assertEquals(decidePush({ ...base, lastMessage: { role: "user", created_at: "2026-09-18T14:00:00Z" } }), { send: true });
});

Deno.test("decidePush: a manhã da prova sai às 6h; a véspera não", () => {
  const morning = { ...candidate, trigger: "race_morning" as const, key: "race_morning:r1" };
  assertEquals(decidePush({ ...base, candidate: morning, lisbonHour: 6 }), { send: true });
  assertEquals(decidePush({ ...base, lisbonHour: 6 }), { send: false, reason: "fora_de_horas" });
});

Deno.test("decidePush: o que aconteceu antes do registo no servidor não se repete", () => {
  const balance = { ...candidate, trigger: "race_after" as const, key: "race_after:r1:run1", hasRun: true, anchorDate: "2026-09-13" };
  assertEquals(decidePush({ ...base, candidate: balance, balanceDone: true }), { send: false, reason: "balanco_feito" });
  assertEquals(decidePush({ ...base, candidate: balance, balanceDone: false }), { send: true });
  // Sem balanço gravado (anterior à coluna), mas ela falou depois do registo da corrida.
  const registered = { ...balance, anchorAt: "2026-09-13T12:00:00+00:00" };
  assertEquals(decidePush({ ...base, candidate: registered, lastModelMessageAt: "2026-09-13T22:32:00+00:00" }), { send: false, reason: "ja_falou_depois" });
  assertEquals(decidePush({ ...base, candidate: registered, lastModelMessageAt: "2026-09-13T08:00:00+00:00" }), { send: true });

  const howWasIt = { ...balance, key: "race_after:r1:sem-registo", hasRun: false, anchorDate: "2026-09-16" };
  assertEquals(decidePush({ ...base, candidate: howWasIt, lastModelMessageAt: "2026-09-17T08:00:00Z" }), { send: false, reason: "ja_falou_depois" });
  // Falou no próprio dia da prova (antes dela, por exemplo): ainda pergunta.
  assertEquals(decidePush({ ...base, candidate: howWasIt, lastModelMessageAt: "2026-09-16T06:00:00Z" }), { send: true });

  const silence = { ...candidate, trigger: "silence" as const, key: "silence:2026-09-14", silenceDays: 4, anchorDate: "2026-09-14" };
  assertEquals(decidePush({ ...base, candidate: silence, lastModelMessageAt: "2026-09-15T20:00:00Z" }), { send: false, reason: "ja_falou_depois" });
  assertEquals(decidePush({ ...base, candidate: silence, lastModelMessageAt: "2026-09-10T20:00:00Z" }), { send: true });
});

Deno.test("decidePush: 'já falou depois' usa a última mensagem DELA, mesmo que o atleta tenha escrito a seguir", () => {
  const balance = { ...candidate, trigger: "race_after" as const, key: "race_after:r1:run1", hasRun: true, anchorDate: "2026-09-13", anchorAt: "2026-09-13T12:00:00+00:00" };
  assertEquals(decidePush({
    ...base,
    candidate: balance,
    lastMessage: { role: "user", created_at: "2026-09-17T10:00:00Z" },
    lastModelMessageAt: "2026-09-13T22:32:00+00:00",
  }), { send: false, reason: "ja_falou_depois" });
});

Deno.test("lisbonDateOf: a 00:30 de Lisboa no verão ainda é ontem em UTC", () => {
  assertEquals(lisbonDateOf("2026-09-14T23:30:00Z"), "2026-09-15");
  const silence = { ...candidate, trigger: "silence" as const, key: "silence:2026-09-14", silenceDays: 4, anchorDate: "2026-09-14" };
  assertEquals(decidePush({ ...base, candidate: silence, lastModelMessageAt: "2026-09-14T23:30:00Z" }), { send: false, reason: "ja_falou_depois" });
});

Deno.test("decidePush: as preferências do atleta (P.6)", () => {
  // Um momento que ele desligou não sai.
  assertEquals(decidePush({ ...base, prefs: { types: ["silence"] } }), { send: false, reason: "tipo_desligado" });
  // Até 3 por dia, se ele quiser.
  assertEquals(decidePush({ ...base, pushedTodayCount: 1, prefs: { maxPerDay: 2 } }), { send: true });
  assertEquals(decidePush({ ...base, pushedTodayCount: 2, prefs: { maxPerDay: 2 } }), { send: false, reason: "limite_diario" });
  // Um valor fora do intervalo cai para 3 no máximo, e para 1 se for inválido.
  assertEquals(decidePush({ ...base, pushedTodayCount: 3, prefs: { maxPerDay: 9 } }), { send: false, reason: "limite_diario" });
  assertEquals(decidePush({ ...base, pushedTodayCount: 1, prefs: { maxPerDay: 0 } }), { send: false, reason: "limite_diario" });
  // A janela dele.
  assertEquals(decidePush({ ...base, lisbonHour: 16, prefs: { startHour: 18, endHour: 22 } }), { send: false, reason: "fora_de_horas" });
});


/* A lista (revisão pré-master de 2026-09-19): um momento já notificado não
   pode tapar os seguintes para sempre. */
const intervention = { ...candidate, trigger: "intervention" as const, key: "intervention:abc", raceId: null, raceName: null };
const { candidate: _c, ...ctx } = base;

Deno.test("choosePush: a intervenção já notificada passa a vez à véspera", () => {
  const r = choosePush([intervention, candidate], { ...ctx, pushedKeys: new Set(["intervention:abc"]) });
  assertEquals(r.candidate?.key, "race_eve:r1");
  assertEquals(r.decision, { send: true });
});

Deno.test("choosePush: sem nada a impedir, fica o primeiro", () => {
  assertEquals(choosePush([intervention, candidate], ctx).candidate?.key, "intervention:abc");
});

Deno.test("choosePush: o limite do dia e as 6 horas param a lista toda", () => {
  const cheio = choosePush([intervention, candidate], { ...ctx, pushedKeys: new Set(["intervention:abc"]), pushedTodayCount: 1 });
  assertEquals(cheio, { candidate: null, decision: { send: false, reason: "limite_diario" } });
  const recente = choosePush([intervention, candidate], { ...ctx, lastMessage: { role: "model", created_at: "2026-09-18T13:00:00Z" } });
  assertEquals(recente.candidate, null);
  assertEquals(recente.decision, { send: false, reason: "falou_ha_pouco" });
});

Deno.test("choosePush: sem nenhum que saia, o motivo é o do mais importante", () => {
  const r = choosePush([intervention, candidate], { ...ctx, pushedKeys: new Set(["intervention:abc", "race_eve:r1"]) });
  assertEquals(r, { candidate: null, decision: { send: false, reason: "ja_notificado" } });
  assertEquals(choosePush([], ctx), { candidate: null, decision: { send: false, reason: "sem_momento" } });
});

Deno.test("choosePush: o balanço já feito é dessa prova, não dos outros momentos", () => {
  const after = { ...candidate, trigger: "race_after" as const, key: "race_after:r0:run1", raceId: "r0", hasRun: true };
  const silence = { ...candidate, trigger: "silence" as const, key: "silence:2026-09-10", raceId: null, anchorDate: "2026-09-10" };
  const r = choosePush([after, silence], { ...ctx, balanceDoneFor: (c) => c.raceId === "r0" });
  assertEquals(r.candidate?.key, "silence:2026-09-10");
});

// ── P.10 ────────────────────────────────────────────────────────────────────

Deno.test("P.10: a manhã da prova não sai depois da partida, e com partida marcada só a partir de 2 h antes", () => {
  const morning = { ...candidate, trigger: "race_morning" as const, key: "race_morning:r1", startMinutes: 9 * 60 + 30 };
  // 7:07 — ainda mais de 2 h antes da partida.
  assertEquals(decidePush({ ...base, candidate: morning, lisbonHour: 7, minuteOfDay: 7 * 60 + 7 }), { send: false, reason: "fora_de_horas" });
  assertEquals(decidePush({ ...base, candidate: morning, lisbonHour: 8, minuteOfDay: 8 * 60 + 7 }), { send: true });
  // 9:37 — a prova já partiu.
  assertEquals(decidePush({ ...base, candidate: morning, lisbonHour: 9, minuteOfDay: 9 * 60 + 37 }), { send: false, reason: "depois_da_partida" });
  // Sem hora de partida, a regra de antes: das 6h.
  assertEquals(decidePush({ ...base, candidate: { ...morning, startMinutes: null }, lisbonHour: 6, minuteOfDay: 6 * 60 + 7 }), { send: true });
});

Deno.test("P.10: o que o Início mostrou hoje não se notifica — e passa a vez ao momento seguinte", () => {
  assertEquals(decidePush({ ...base, seenKeys: new Set(["race_eve:r1"]) }), { send: false, reason: "ja_visto" });
  const silence = { ...candidate, trigger: "silence" as const, key: "silence:2026-09-14", raceId: null, raceName: null, silenceDays: 4, anchorDate: "2026-09-14" };
  const picked = choosePush([candidate, silence], { ...base, seenKeys: new Set(["race_eve:r1"]) });
  assertEquals(picked.candidate?.key, "silence:2026-09-14");
  // Os dois vistos: o motivo é o do primeiro.
  assertEquals(choosePush([candidate, silence], { ...base, seenKeys: new Set(["race_eve:r1", "silence:2026-09-14"]) }).decision, { send: false, reason: "ja_visto" });
});

Deno.test("P.10: o registo em app_logs — só com momento, custo no topo do meta, sem o ruído de hora a hora", () => {
  const input = { userId: "u1", candidates: [candidate], candidate, reason: "enviada", lisbonHour: 16 };
  // Sem nenhum momento não há decisão para registar.
  assertEquals(tickLogRow({ ...input, candidates: [], candidate: null }), null);
  // Com chamada ao modelo: 'success' com os tokens no topo, para o painel Custos.
  const sent = tickLogRow({ ...input, usage: { input_tokens: 800, output_tokens: 40 }, generated: true })!;
  assertEquals(sent.level, "success");
  assertEquals(sent.event, "coach-proactive-tick");
  assertEquals(sent.message, "enviada");
  assertEquals(sent.meta.input_tokens, 800);
  assertEquals(sent.meta.output_tokens, 40);
  assertEquals(sent.meta.key, "race_eve:r1");
  assertEquals(sent.meta.generated, true);
  // Sem chamada: 'info', sem tokens.
  const seen = tickLogRow({ ...input, reason: "ja_visto" })!;
  assertEquals(seen.level, "info");
  assertEquals("input_tokens" in seen.meta, false);
  assertEquals(seen.meta.candidates, ["race_eve:r1"]);
  // O que se repete de hora a hora sem novidade fica de fora.
  for (const reason of ["fora_de_horas", "ja_notificado", "ja_entregue"]) assertEquals(tickLogRow({ ...input, reason }), null);
  // …a não ser que tenha havido custo.
  assertEquals(tickLogRow({ ...input, reason: "ja_notificado", usage: { input_tokens: 1, output_tokens: 1 } })?.level, "success");
});

Deno.test("P.10: sem custo, cada decisão (atleta, momento, motivo) fica uma vez por dia", () => {
  // Revisão pré-deploy de 2026-09-25: com o app_logs a aceitar 'info', o
  // ja_visto (e o limite do dia, o "falou há pouco"…) repetia-se de hora a hora.
  const input = { userId: "u1", candidates: [candidate], candidate, reason: "ja_visto", lisbonHour: 16 };
  const loggedToday = new Set([tickLogSignature("u1", "race_eve:r1", "ja_visto")]);
  assertEquals(tickLogRow({ ...input, loggedToday }), null);
  // Outro motivo, ou outro atleta, é outra decisão.
  assertEquals(tickLogRow({ ...input, reason: "limite_diario", loggedToday })?.level, "info");
  assertEquals(tickLogRow({ ...input, userId: "u2", loggedToday })?.level, "info");
  // Com custo, regista-se sempre.
  assertEquals(tickLogRow({ ...input, usage: { input_tokens: 5, output_tokens: 5 }, loggedToday })?.level, "success");
});

Deno.test("P.10: à terça, com o balanço já entregue na segunda, a notificação passa ao treino de segunda", () => {
  const week = { ...candidate, trigger: "week_review" as const, key: "week_review:2026-09-14", raceId: null, raceName: null };
  const missed = { ...candidate, trigger: "missed_workout" as const, key: "missed_workout:2026-09-21", raceId: null, raceName: null, anchorDate: "2026-09-21" };
  const picked = choosePush([week, missed], { ...base, lisbonHour: 12, deliveredKeys: new Set(["week_review:2026-09-14"]) });
  assertEquals(picked.candidate?.key, "missed_workout:2026-09-21");
});
