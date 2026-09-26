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
 * sobrepõem e não se recalculam depois de publicadas, sem exceção: nem uma
 * revogação as mexe, porque tirar alguém de um agregado publicado aponta-o. */
export function closedWindow(todayISO: string, anchor = WINDOW_ANCHOR, days = WINDOW_DAYS): Window | null {
  const elapsed = daysBetween(anchor, todayISO);
  if (!Number.isFinite(elapsed) || elapsed < days) return null;
  const index = Math.floor(elapsed / days) - 1;
  const start = addDays(anchor, index * days);
  return { start, end: addDays(start, days) };
}

/* A FOLGA DE PUBLICAÇÃO (2026-09-26). A quinzena fecha ao fim de domingo e a
   tarefa corre de madrugada: publicar na segunda às 04:17 UTC (05:17 de Lisboa
   no verão) deixava de fora quem
   regista o treino de domingo só na segunda — e o ecrã, que recalcula o
   índice dele ao vivo, mostrava-lhe um percentil que não batia com a média.
   Publica-se na terça: um dia inteiro para os registos atrasados. Não mexe
   nas janelas (continuam fixas, sem sobreposição, e nunca se refazem) — só
   no dia em que cada uma sai. */
export const PUBLISH_GRACE_DAYS = 1;

/** A janela que a tarefa de agregação pode publicar HOJE: a última fechada
 *  há pelo menos PUBLISH_GRACE_DAYS dias. */
export function publishableWindow(todayISO: string, grace = PUBLISH_GRACE_DAYS): Window | null {
  return closedWindow(addDays(todayISO, -grace));
}

/* A HORA DA PUBLICAÇÃO (2026-09-26). O cron corre às 04:17 UTC: na terça de
   publicação, entre a meia-noite e essa hora, a quinzena ainda não saiu — e
   contar pelo calendário anunciava já a seguinte (+14 dias). O "dia de
   publicação" de um instante é o dia UTC desse instante menos esta margem
   (04:30, um quarto de hora de folga sobre o cron): antes dela, a terça ainda
   conta como segunda, e a próxima atualização é "hoje".
   DEPENDE DO CRON, que vive em produção e não no repositório (job
   compute-percentile-snapshots, '17 4 * * *'): mudar a hora de um obriga a
   mudar a do outro — ver o cabeçalho da compute-percentile-snapshots. */
export const PUBLICATION_CUTOFF_UTC_MINUTES = 4 * 60 + 30;

/** O dia (YYYY-MM-DD) que conta para a publicação num instante `nowMs` — é
 *  este que se passa a nextPublicationDate quando se fala do "agora". */
export function publicationDayOf(nowMs: number): string {
  return new Date(nowMs - PUBLICATION_CUTOFF_UTC_MINUTES * 60000).toISOString().slice(0, 10);
}

/** O dia (YYYY-MM-DD) em que sai a PRÓXIMA distribuição — o fim da quinzena
 *  que está a decorrer, mais a folga. É o que o ecrã diz ("próxima
 *  atualização") e o que a Carol responde se ele perguntar quando muda. */
export function nextPublicationDate(todayISO: string, grace = PUBLISH_GRACE_DAYS): string {
  const w = publishableWindow(todayISO, grace);
  // Antes da primeira janela fechar, a primeira publicação é o fim dela.
  const nextEnd = w ? addDays(w.end, WINDOW_DAYS) : addDays(WINDOW_ANCHOR, WINDOW_DAYS);
  return addDays(nextEnd, grace);
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

/* ── O percentil e os segmentos vizinhos (2026-09-25) ───────────────────────
   Viviam só no cliente (src/utils/percentile.js). A Carol passou a poder dizer
   o percentil ao próprio atleta e a avisá-lo quando há dados — o servidor
   precisa exatamente da mesma conta e dos mesmos vizinhos, por isso moram
   aqui e o cliente re-exporta. */

/* A faixa 5–95, e a truncatura é de propósito: "estás no 100.º percentil"
   num segmento de 20 pessoas é uma pessoa só, identificável. Os extremos
   dizem-se "5% ou menos" / "95% ou mais". */
export const PERCENTILE_FLOOR = 5;
export const PERCENTILE_CEILING = 95;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** O percentil do atleta, truncado à faixa 5–95, em degraus de 5 — quantas
 *  das 19 fronteiras ele já passou. null sem índice ou sem fronteiras válidas. */
export function percentileFrom(value: unknown, boundaries: unknown): number | null {
  const nums = Array.isArray(boundaries) ? boundaries.map(Number) : null;
  if (!isNum(value) || !nums || nums.length !== VENTILE_COUNT || !nums.every(isNum)) return null;
  const passadas = nums.filter((b) => value >= b).length;
  return Math.min(PERCENTILE_CEILING, Math.max(PERCENTILE_FLOOR, passadas * 5));
}

export const AGE_BANDS_BY_GENDER: Record<string, string[]> = {
  M: ["sub23", "23-34", "M35", "M40", "M45", "M50+"],
  F: ["sub23", "23-34", "F35", "F40", "F45", "F50+"],
};

export interface Segment { ageBand: string; gender: string; terrain: string }

/** O escalão equivalente no outro género — sub23 e 23-34 não têm letra. */
export function counterpartBand(band: string, gender: string): string {
  if (band === "sub23" || band === "23-34") return band;
  return `${gender}${String(band).slice(1)}`;
}

/* Os grupos com que um atleta se pode comparar quando o dele é pequeno, por
   ordem: largar a modalidade, alargar o escalão, largar o género. Cada passo é
   um segmento CONCRETO — alargar é mudar de segmento, nunca fundir segmentos. */
export function neighbourSegments(s: Partial<Segment>): Array<{ step: "modalidade" | "escalao" | "genero"; segment: Segment }> {
  const { ageBand, gender, terrain } = s;
  if (!ageBand || !gender || !terrain) return [];
  const bands = AGE_BANDS_BY_GENDER[gender] || [];
  const i = bands.indexOf(ageBand);
  const vizinhos = i < 0 ? [] : [bands[i - 1], bands[i + 1]].filter(Boolean);
  const outroGenero = gender === "F" ? "M" : "F";
  const outraModalidade = terrain === "estrada" ? "trail" : "estrada";
  return [
    { step: "modalidade", segment: { ageBand, gender, terrain: outraModalidade } },
    ...vizinhos.map((band) => ({ step: "escalao" as const, segment: { ageBand: band, gender, terrain } })),
    { step: "genero", segment: { ageBand: counterpartBand(ageBand, outroGenero), gender: outroGenero, terrain } },
  ];
}
