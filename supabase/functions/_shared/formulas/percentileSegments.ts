// Os segmentos da comparação por percentil — fórmula pura (gamificação,
// Fase 5). Escalão, janela, ventis e a banda do `n`: tudo o que a tarefa de
// agregação (supabase/functions/compute-percentile-snapshots) precisa de
// decidir sem tocar na base de dados, e que por isso se testa sozinho.
//
// Os valores têm de bater certo com os `check` de percentile_snapshots
// (migração 20260921120000_percentile_snapshots.sql): se um mudar, muda o
// outro. O limiar k é o único que NÃO manda daqui — vive no `check (n >= 20)`
// da tabela, de propósito; a constante abaixo é a cópia que evita ir buscar
// dados que a base vai recusar guardar na mesma.

/** A janela é a mesma dos 14 dias da aderência (prescriptionAdherence.ts). */
export const WINDOW_DAYS = 14;

/* Uma segunda-feira, para as janelas caírem sempre em semanas inteiras e
   serem as MESMAS para toda a gente — dois atletas comparam-se no mesmo
   intervalo de calendário ou não se comparam de todo. */
export const WINDOW_ANCHOR = "2026-01-05";

/** k, o tamanho mínimo de um segmento. É um controlo de privacidade, não um
 *  parâmetro de afinação: a regra a sério está no `check (n >= 20)` da
 *  tabela, onde baixá-la obriga a uma migração escrita à mão. */
export const MIN_SEGMENT_SIZE = 20;

/** 19 fronteiras — os ventis (5%, 10%, …, 95%). */
export const VENTILE_COUNT = 19;

const DAY_MS = 86400000;

function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.floor((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / DAY_MS);
}

export interface Window { start: string; end: string }

/* A ÚLTIMA janela que já FECHOU, alinhada à grelha da âncora. `end` é
   exclusivo: [start, end[ — os 14 dias que prescriptionAdherence avalia
   quando se lhe passa `end` como "hoje".
 *
 * Isto é a defesa contra o ataque de diferenciação, e é por isso que a função
 * se chama "closed" e não "current": refrescar todos os dias uma janela que
 * ainda anda a andar publica duas distribuições que só diferem por um dia de
 * um atleta — e a diferença ENTRE elas é esse atleta. As janelas aqui não se
 * sobrepõem e não se recalculam depois de publicadas (a única exceção é uma
 * revogação, que marca a janela viva com `stale_at`). */
export function closedWindow(todayISO: string, anchor = WINDOW_ANCHOR, days = WINDOW_DAYS): Window | null {
  const elapsed = daysBetween(anchor, todayISO);
  if (!Number.isFinite(elapsed) || elapsed < days) return null;
  const index = Math.floor(elapsed / days) - 1;
  const start = addDays(anchor, index * days);
  return { start, end: addDays(start, days) };
}

/* O escalão. Recebe a IDADE já derivada — a data de nascimento não passa
   daqui para cima (minimização): quem chama converte com ageFromBirthDate()
   e deita fora o resto. Dos 35 para cima segue a convenção do atletismo
   (M35/F35…); abaixo disso não há letra, porque o género vai na coluna ao
   lado do snapshot. */
export function ageBandFor(age: number | null | undefined, gender: string | null | undefined): string | null {
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0) return null;
  if (gender !== "F" && gender !== "M") return null;
  if (age < 23) return "sub23";
  if (age < 35) return "23-34";
  if (age < 40) return `${gender}35`;
  if (age < 45) return `${gender}40`;
  if (age < 50) return `${gender}45`;
  return `${gender}50+`;
}

/** A banda do tamanho do segmento. É ISTO que sai para o cliente; o `n`
 *  exato fica no servidor — a diferença de dois `n` entrega o indivíduo. */
export function nBand(n: number): "20-49" | "50-199" | "200+" {
  if (n < 50) return "20-49";
  if (n < 200) return "50-199";
  return "200+";
}

/* As 19 fronteiras de ventil, por interpolação linear sobre os valores
   ordenados (o mesmo método do "percentil tipo 7", o das folhas de cálculo).
   Uma casa decimal: o índice de execução também tem uma, e mais casas só
   dariam granularidade a quem quisesse distinguir atletas. */
export function ventileBoundaries(values: number[]): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const out: number[] = [];
  for (let i = 1; i <= VENTILE_COUNT; i++) {
    // Multiplicar ANTES de dividir: (i/20)*(n-1) dá 3.0000000000000004 para
    // i=3 em vírgula flutuante, e um floor/ceil sobre isso saltava um lugar.
    const pos = (i * (sorted.length - 1)) / (VENTILE_COUNT + 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const value = lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    out.push(Math.round(value * 10) / 10);
  }
  return out;
}

/* Quantos dias para trás se aceita uma prova já corrida como "a modalidade
   que este atleta prepara". Sem prova nenhuma à vista, o atleta não entra em
   segmento nenhum — a frase do ecrã é "os atletas do teu escalão que preparam
   provas de estrada/trail", e sem prova a frase não seria verdade. */
export const TERRAIN_LOOKBACK_DAYS = 90;

/** A modalidade que o atleta prepara: a próxima prova marcada; sem nenhuma
 *  marcada, a última que correu nos 90 dias antes do fim da janela. */
export function terrainForAthlete(
  races: Array<{ date?: string | null; race_type?: string | null }> | null | undefined,
  windowEnd: string,
): "estrada" | "trail" | null {
  const validas = (races || [])
    .filter((r) => !!r?.date && (r.race_type === "estrada" || r.race_type === "trail")) as Array<{ date: string; race_type: "estrada" | "trail" }>;
  const futuras = validas.filter((r) => r.date >= windowEnd).sort((a, b) => a.date.localeCompare(b.date));
  if (futuras.length) return futuras[0].race_type;
  const desde = addDays(windowEnd, -TERRAIN_LOOKBACK_DAYS);
  const recentes = validas.filter((r) => r.date < windowEnd && r.date >= desde).sort((a, b) => b.date.localeCompare(a.date));
  return recentes.length ? recentes[0].race_type : null;
}

/** A chave de um segmento, para agrupar em memória. */
export function segmentKey(s: { ageBand: string; gender: string; terrain: string }): string {
  return `${s.ageBand}|${s.gender}|${s.terrain}`;
}
