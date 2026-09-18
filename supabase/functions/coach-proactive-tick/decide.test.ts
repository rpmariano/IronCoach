import { assertEquals } from "jsr:@std/assert@1";
import { decidePush } from "./decide.ts";

const candidate = { trigger: "race_eve" as const, key: "race_eve:r1", raceId: "r1", raceName: "Meia", hasRun: false, silenceDays: null, anchorDate: null, anchorAt: null };
const NOW = Date.parse("2026-09-18T15:00:00Z");
const base = { candidate, lisbonHour: 16, deliveredKeys: new Set<string>(), pushedKeys: new Set<string>(), pushedToday: false, lastModelMessageAt: null, nowMs: NOW };

Deno.test("decidePush: envia quando nada o impede", () => {
  assertEquals(decidePush(base), { send: true });
});

Deno.test("decidePush: cada travão, pela ordem", () => {
  assertEquals(decidePush({ ...base, candidate: null }), { send: false, reason: "sem_momento" });
  assertEquals(decidePush({ ...base, lisbonHour: 22 }), { send: false, reason: "fora_de_horas" });
  assertEquals(decidePush({ ...base, deliveredKeys: new Set(["race_eve:r1"]) }), { send: false, reason: "ja_entregue" });
  assertEquals(decidePush({ ...base, pushedKeys: new Set(["race_eve:r1"]) }), { send: false, reason: "ja_notificado" });
  assertEquals(decidePush({ ...base, pushedToday: true }), { send: false, reason: "limite_diario" });
  assertEquals(decidePush({ ...base, lastModelMessageAt: "2026-09-18T11:00:00Z" }), { send: false, reason: "falou_ha_pouco" });
  // Falou há mais de 6 horas: já não trava.
  assertEquals(decidePush({ ...base, lastModelMessageAt: "2026-09-18T08:00:00Z" }), { send: true });
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
