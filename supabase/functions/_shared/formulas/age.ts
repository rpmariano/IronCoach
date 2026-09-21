// Idade cronológica a partir da data de nascimento — cálculo de calendário
// (ano corrente menos o ano de nascimento, ajustado se o aniversário deste
// ano ainda não passou), não uma divisão por 365,25 dias.
//
// @contexto Ação 5.4: havia três cópias no servidor (coach-chat/index.ts
// tinha a versão de calendário e, mais abaixo no mesmo ficheiro, uma segunda
// versão por milissegundos/365,25; coach-daily-summary/index.ts tinha uma
// terceira, também por 365,25, dentro de computeTDEE) — a das zonas de FC
// seria a quarta. Espelha ageFromBirthDate() em src/utils/body.js, que o
// cliente mantém à parte (runtime diferente); se um mudar, mudar o outro.
export function ageFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (isNaN(born.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age--;

  return age >= 0 && age < 130 ? age : null;
}
