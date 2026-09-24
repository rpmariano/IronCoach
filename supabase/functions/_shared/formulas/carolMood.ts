// As emoções da Carol — o vocabulário que o servidor (coach-chat, que pede ao
// modelo a emoção de cada resposta) e o cliente (o rosto em CoachAvatar)
// partilham. CAROL.md §4.
//
// Seis estados. Cinco podem acompanhar uma mensagem; "a pensar" não: é o
// que ela faz enquanto escreve ou analisa, não o tom do que diz.
//
// A regra de fundo é a do resto da persona: ela reconhece o que é
// excecional, o resto regista em silêncio. "neutral" é o estado por defeito,
// e a cara nunca sorri por cima de um aviso.

export type CarolMood = "neutral" | "happy" | "proud" | "worried" | "caring" | "thinking";

export const CAROL_MOODS: readonly CarolMood[] = ["neutral", "happy", "proud", "worried", "caring", "thinking"];

/** As que o modelo pode escolher para uma resposta (sem "thinking"). */
export const MESSAGE_MOODS: readonly CarolMood[] = ["neutral", "happy", "proud", "worried", "caring"];

const ALIASES: Record<string, CarolMood> = {
  neutra: "neutral",
  contente: "happy",
  feliz: "happy",
  orgulhosa: "proud",
  celebrate: "proud",
  preocupada: "worried",
  concerned: "worried",
  empatica: "caring",
  empathetic: "caring",
  a_pensar: "thinking",
  pensar: "thinking",
};

/** Uma emoção conhecida, ou null. Aceita os nomes em português do CAROL.md
 *  e ignora maiúsculas e acentos — o modelo às vezes traduz. */
export function normalizeMood(value: unknown): CarolMood | null {
  if (typeof value !== "string") return null;
  const k = fold(value).trim().replace(/[\s-]+/g, "_");
  if ((CAROL_MOODS as readonly string[]).includes(k)) return k as CarolMood;
  return ALIASES[k] ?? null;
}

/** Como normalizeMood, mas só as que podem acompanhar uma mensagem. */
export function normalizeMessageMood(value: unknown): CarolMood | null {
  const m = normalizeMood(value);
  return m && (MESSAGE_MOODS as readonly string[]).includes(m) ? m : null;
}

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* O classificador de recurso: para as mensagens gravadas antes de o modelo
   escolher a emoção, e para quando ele não a devolve. Só marcadores fortes —
   na dúvida fica "neutral", que é o que ela é na maior parte do tempo.

   A ordem conta: um aviso ganha sempre (a cara nunca sorri por cima de uma
   dor), a empatia ganha à celebração, e o orgulho só aparece com um feito
   concreto. */
const MARKERS: Array<[CarolMood, string[]]> = [
  ["worried", [
    "preocup", "lesao", "lesoes", "fratura", "dor ossea", "medico", "fisioterapeuta",
    "red-s", "amenorreia", "sobretreino", "nao treines", "nao corras", "nao forces",
    "em pausa", "em risco", "risco de lesao", "perigos", "irrealista",
    "nao e realista", "inviavel", "nao concordo", "nao gostei", "estas bem?",
    "aconteceu alguma coisa", "nao se ignora",
  ]],
  ["caring", [
    "dormiste mal", "noite mal dormida", "dia em baixo", "energia em baixo", "cansad",
    "custou", "custa-te", "compreendo", "percebo que", "entendo que", "e normal sentires",
    "nao faz mal", "sem pressa", "com calma", "estou contigo", "estou aqui",
    "dor ligeira", "stress tambem pesa", "nao e dia de provar",
  ]],
  ["proud", [
    "recorde", "melhor marca", "novo pb", "superaste", "bateste", "prova concluida",
    "cruzaste a meta", "terminaste a prova", "acabaste a prova", "orgulh", "parabens",
    "semana cumprida", "cumpriste a semana", "a 100%", "nunca tinhas",
  ]],
  ["happy", [
    "bom trabalho", "muito bem", "gostei", "excelente", "cumpriste", "em cheio",
    "melhor do que ontem", "melhor do que na semana", "estas a evoluir", "boa semana",
    "era disto que precisavas", "dias seguidos de check-in",
  ]],
];

function hasMarker(text: string, marker: string): boolean {
  let from = 0;
  for (;;) {
    const i = text.indexOf(marker, from);
    if (i < 0) return false;
    // "não gostei" não é contente, "não bateste" não é orgulho. Os marcadores
    // que já começam por "nao" são a exceção — foram escritos assim.
    const before = text.slice(Math.max(0, i - 4), i);
    if (marker.startsWith("nao ") || before !== "nao ") return true;
    from = i + marker.length;
  }
}

/** A emoção provável de um texto da Carol, pelos marcadores acima. */
export function inferMoodFromText(text: unknown): CarolMood {
  if (typeof text !== "string" || !text.trim()) return "neutral";
  const t = fold(text).replace(/\s+/g, " ");
  for (const [mood, markers] of MARKERS) {
    if (markers.some((m) => hasMarker(t, m))) return mood;
  }
  return "neutral";
}

/** A emoção de uma mensagem gravada: a que o modelo escolheu, se houver e
 *  for válida; senão, a que o texto sugere. */
export function messageMood(msg: { mood?: unknown; content?: unknown } | null | undefined): CarolMood {
  return normalizeMessageMood(msg?.mood) ?? inferMoodFromText(msg?.content);
}
