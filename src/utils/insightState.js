/* O estado de um insight da Carol, lido num sítio só.

   Escondido quando o atleta o percebeu ("Percebi", ou falou dele com a
   Carol — os dois gravam 'understood') ou o pôs de lado HOJE ("Agora não",
   pedido 2026-09-27). Um "Agora não" de outro dia já não esconde nada: é
   esse o "volta amanhã, se ainda se aplicar". O botão flutuante
   (BI/useCarolNotices.js) e o banner da Evolução · Geral
   (BI/SmartInsightsBanner.jsx) usam a mesma régua, para um insight nunca
   sair de um e ficar no outro. */
export function isInsightHidden(id, { states = {}, snoozes = {}, today } = {}) {
  return (states || {})[id] === 'understood' || (!!today && (snoozes || {})[id] === today);
}

/* O que a Carol lê sobre cada insight no chat (Coach.jsx, activeInsights):
   com os nomes dos botões que o atleta vê e sem inventar — 'understood' vem
   tanto do "Percebi" como do "Falar com a Carol", e um 'ignored' antigo (ou
   vindo de outro dispositivo) já não quer dizer "até amanhã". */
export function insightStateForCarol(id, { states = {}, snoozes = {}, today } = {}) {
  if ((states || {})[id] === 'understood') return 'Tratado pelo atleta (carregou em "Percebi" ou já falou dele contigo)';
  if (today && (snoozes || {})[id] === today) return 'Ativo, posto de lado hoje pelo atleta ("Agora não"); volta a aparecer-lhe amanhã';
  if ((states || {})[id] === 'ignored') return 'Ativo (o atleta já o pôs de lado noutro dia)';
  return 'Ativo (pendente)';
}
