// Os quatro dados do perfil de que dependem as contas da Carol — género,
// idade (data de nascimento), altura e peso.
//
// @contexto Bug #50 (2026-10-02): "a Carol tem em conta a idade, género, peso
// e altura na elaboração dos planos?" — tem, mas a TMB/GETD (Mifflin-St Jeor,
// formulas/tdee.ts) só sai com os quatro, e o onboarding não obriga a nenhum.
// Faltando um, a linha desaparecia do contexto sem aviso: a doutrina dizia
// "os targets calculados no contexto abaixo mostram a estimativa Mifflin" e
// lá em baixo não havia nada — ela ficava a adivinhar o gasto, ou calada,
// sem nunca pedir o que faltava.

import { ageFromBirthDate } from "./formulas/age.ts";

export type ProfileBasics = {
  gender?: string | null;
  birth_date?: string | null;
  height_cm?: number | string | null;
  weight_kg?: number | string | null;
};

// Number(null) e Number("") dão 0, Number(undefined) dá NaN — ambos falham.
const positive = (v: number | string | null | undefined): boolean => Number(v) > 0;

// Nomes como o atleta os vê no Perfil → Pessoal, pela ordem do ecrã. Uma data
// de nascimento que não dá idade (inválida, no futuro) conta como em falta:
// para as contas é o mesmo que não estar lá.
export function missingProfileBasics(profile: ProfileBasics | null | undefined): string[] {
  const p = profile ?? {};
  const missing: string[] = [];
  if (!p.gender) missing.push("género");
  if (ageFromBirthDate(p.birth_date ?? null) === null) missing.push("data de nascimento");
  if (!positive(p.height_cm)) missing.push("altura");
  if (!positive(p.weight_kg)) missing.push("peso");
  return missing;
}

const joinPt = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;

// Bloco do prompt do chat. null com o perfil completo — o prompt fica igual
// byte a byte para quem tem tudo preenchido.
//
// Ela não tem ferramenta para gravar no perfil, por isso o pedido acaba
// sempre no Perfil → Pessoal (o peso também entra por uma avaliação corporal,
// ver analyze-body). Uma vez por conversa: o histórico do chat é o que lhe
// diz se já pediu.
export function missingProfileBasicsInstruction(profile: ProfileBasics | null | undefined): string | null {
  const missing = missingProfileBasics(profile);
  if (missing.length === 0) return null;
  const semIdade = missing.includes("data de nascimento");
  return (
    `DADOS DO PERFIL EM FALTA: ${joinPt(missing)}.\n` +
    `  Sem os quatro (género, idade, altura e peso) não há TMB nem GETD estimados para este atleta — a linha de ` +
    `Mifflin-St Jeor não aparece no contexto${semIdade ? ", e sem idade as zonas de FC só existem se houver FCmáx dos prints" : ""}. ` +
    `Não os inventes nem os estimes a olho, e não lhe digas quantas calorias gasta.\n` +
    `  Quando vier a propósito — antes de propores um plano de treino, sugestões de refeições ou objetivos, ou quando a ` +
    `conversa tocar em calorias, peso ou energia — pede-lhos numa frase, a dizer para que servem (as contas do que ele ` +
    `gasta e do que deve comer), e diz-lhe que os põe no Perfil → Pessoal` +
    `${missing.includes("peso") ? " (o peso também entra com uma avaliação corporal)" : ""}. ` +
    `Se ele tos disser aqui, usa-os nesta conversa e lembra-o de os gravar no Perfil: tu não os gravas. ` +
    `Se já lhos pediste nesta conversa, não voltes a pedir.`
  );
}
