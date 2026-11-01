/* As perguntas da Carol na leitura de prints da corrida, do ginásio e da
   avaliação corporal (bug #106, 2026-11-01) — o que os prints não deixam
   saber e muda a análise. Mesma forma e mesmos nomes das perguntas das
   refeições (analyze-meal, CarolQuestion), para o Frontend usar o mesmo
   componente (CarolQuestions.jsx).

   O fluxo, sem guardar nada entre os dois pedidos (sem migration):
   1. mode "preview": a leitura devolve `questions` (0 a 3), cada uma com
      `answer: null`;
   2. o atleta responde no formulário (ou não);
   3. o pedido de gravar leva-as de volta em `carol_questions`, cada uma com
      `answer` preenchido (ou null, se não respondeu);
   4. o comentário recebe as respondidas como factos («nunca escrevas que
      assumiste») e as outras como suposições que não se criticam
      (recordAnswersSection) — a mesma lógica do analyze-meal (bugs #58 e #102).

   Um cliente antigo que ignore `questions` e não mande `carol_questions`
   continua a funcionar: o comentário fica como antes. */

export type RecordDomain = "run" | "gym" | "body";

export type RecordQuestion = {
  id: string;
  // Sempre "contexto": não é preparação nem quantidade de um alimento.
  kind: "contexto";
  topic: string;
  // Sobre o que é («Km 4», «Supino com halteres», «Pesagem»).
  item_name: string;
  question: string;
  options: string[];
  assumed: string;
  // As refeições mostram o impacto em kcal; aqui não há — vão a 0.
  impact_kcal: 0;
  impact_protein_g: 0;
  answer: string | null;
  answered_at: string | null;
};

export const MAX_RECORD_QUESTIONS = 3;

/** O pedaço do response_schema do preview (sem limites nos arrays: o 400 de 2026-09-05). */
export const RECORD_QUESTIONS_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      topic: { type: "STRING" },
      item_name: { type: "STRING" },
      question: { type: "STRING" },
      options: { type: "ARRAY", items: { type: "STRING" } },
      assumed: { type: "STRING" },
    },
    required: ["topic", "item_name", "question", "options", "assumed"],
  },
};

const DOMAIN_HINTS: Record<RecordDomain, string> = {
  run:
    "Exemplos do que vale perguntar: um km muito mais lento ou mais rápido do que os outros sem uma subida que o " +
    "explique («O km 4 foi a subir, ou abrandaste?» — opções como «Subida», «Parei num semáforo», «Abrandei de " +
    "propósito»); a FC muito acima do normal para o tipo de treino («Estava calor, ou não estavas bem?»); uma " +
    "distância ou um GPS estranhos («Foi em passadeira?»).",
  gym:
    "Exemplos do que vale perguntar: num exercício com halteres ou kettlebell, se a carga é por mão ou o total («Os " +
    "20 kg do supino com halteres são por mão ou os dois?» — muda o volume para o dobro); uma série com muito " +
    "menos reps do que as outras («Foi até à falha?»); um exercício que costuma fazer e desta vez parou a meio.",
  body:
    "Exemplos do que vale perguntar: se estava em jejum quando se pesou («Sim», «Não»); se treinou, bebeu muita " +
    "água ou álcool nas horas antes (mexe na água e na gordura da bioimpedância); se foi a balança e a hora de " +
    "sempre, quando os valores saltam face à última avaliação.",
};

/** A regra do prompt do preview: até 3 perguntas que mudam a análise, nenhuma trivial. */
export function recordQuestionsRule(domain: RecordDomain): string {
  return "\n\nPERGUNTAS (questions): no máximo " + MAX_RECORD_QUESTIONS + ", e só as que mudam a análise — o que os " +
    "prints não deixam saber e de que depende o comentário. Nenhuma pergunta trivial, nenhuma sobre o que o " +
    "formulário já pede (data, hora, tipo de treino, esforço/RPE, nome, observações) nem sobre o que já está nos " +
    "prints ou nas observações. Sem dúvida que mude a análise, questions fica vazio — é o caso normal. " +
    DOMAIN_HINTS[domain] + " Cada pergunta: topic (o tema, curto: «subida no km 4», «carga por mão», «jejum»), " +
    "item_name (sobre o que é: «Km 4», o nome do exercício, «Pesagem»), question (curta, na 2.ª pessoa), options " +
    "(2 a 4 respostas curtas), assumed (a opção mais provável, uma das options — é com ela que o comentário conta " +
    "se ele não responder).";
}

const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function cleanOptions(raw: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of Array.isArray(raw) ? raw : []) {
    const t = text(o, 50);
    if (t && !seen.has(key(t))) {
      seen.add(key(t));
      out.push(t);
    }
  }
  return out.slice(0, 4);
}

/** As perguntas que o Gemini devolveu no preview, limpas: 2 a 4 opções, a
 *  assumida é uma delas, temas sem repetir, no máximo MAX_RECORD_QUESTIONS. */
export function parseRecordQuestions(raw: unknown, newId: () => string = () => crypto.randomUUID()): RecordQuestion[] {
  const out: RecordQuestion[] = [];
  const topics = new Set<string>();
  for (const q of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_RECORD_QUESTIONS) break;
    const topic = text(q?.topic, 40);
    const question = text(q?.question, 140);
    const options = cleanOptions(q?.options);
    const assumed = text(q?.assumed, 50);
    const item = text(q?.item_name, 60);
    if (!topic || !question || options.length < 2 || topics.has(key(topic))) continue;
    const match = options.find((o) => key(o) === key(assumed));
    if (!match) continue;
    topics.add(key(topic));
    out.push({
      id: newId(), kind: "contexto", topic, item_name: item || topic, question, options, assumed: match,
      impact_kcal: 0, impact_protein_g: 0, answer: null, answered_at: null,
    });
  }
  return out;
}

/** As perguntas que voltam no pedido de gravar (`carol_questions`), com a
 *  resposta dele: o que vem do cliente não se confia — limpo, no máximo 3.
 *  Uma resposta pode ser uma das opções ou o texto livre do «Outro…». */
export function parseAnsweredQuestions(raw: unknown): RecordQuestion[] {
  const out: RecordQuestion[] = [];
  for (const q of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_RECORD_QUESTIONS) break;
    const question = text(q?.question, 140);
    const topic = text(q?.topic, 40);
    if (!question || !topic) continue;
    const options = cleanOptions(q?.options);
    const answer = text(q?.answer, 60) || null;
    out.push({
      id: text(q?.id, 64) || crypto.randomUUID(), kind: "contexto", topic, item_name: text(q?.item_name, 60) || topic,
      question, options, assumed: text(q?.assumed, 50), impact_kcal: 0, impact_protein_g: 0,
      answer, answered_at: answer ? (text(q?.answered_at, 40) || null) : null,
    });
  }
  return out;
}

/** O bloco do prompt do comentário com as perguntas da leitura: as respondidas
 *  são factos dele; as outras, suposições que não se criticam. "" sem perguntas. */
export function recordAnswersSection(questions: RecordQuestion[] | null | undefined): string {
  const qs = questions || [];
  const answered = qs.filter((q) => q.answer);
  const open = qs.filter((q) => !q.answer && q.assumed);
  let s = "";
  if (answered.length) {
    s += "RESPOSTAS DELE ÀS TUAS PERGUNTAS (antes de gravar): " +
      answered.map((q) => `«${q.question}» → ${q.answer}`).join("; ") + ".\n" +
      "São factos dele, não suposições tuas: usa-os na análise e nunca escrevas que assumiste, supuseste ou estimaste " +
      "estes pontos. Não lhe voltes a perguntar o mesmo.\n";
  }
  if (open.length) {
    s += "POR CONFIRMAR — não respondeu: " + open.map((q) => `«${q.question}» (contaste com: ${q.assumed})`).join("; ") +
      ".\nSão suposições tuas: não critiques nem corrijas nada com base nelas. Podes dizer com o que contaste.\n";
  }
  return s;
}

/** O jejum, se ele o respondeu a uma pergunta da leitura (bug #103 e #106):
 *  true/false, ou null se não houve pergunta ou resposta clara. */
export function fastingFromAnswers(questions: RecordQuestion[] | null | undefined): boolean | null {
  const q = (questions || []).find((x) => x.answer && /jejum/.test(key(`${x.topic} ${x.question}`)));
  if (!q) return null;
  const a = key(q.answer!);
  if (/^(sim|s|yes)\b/.test(a)) return true;
  if (/^(nao|n|no)\b/.test(a)) return false;
  return null;
}
