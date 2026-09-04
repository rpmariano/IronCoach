import React from 'react';

const MEAL_EMOJIS = {
  'pequeno-almoço:': '☕ Pequeno-almoço:',
  'almoço:': '🥗 Almoço:',
  'lanche pré-treino:': '⚡ Lanche pré-treino:',
  'lanche pós-treino:': '💪 Lanche pós-treino:',
  'lanche da manhã:': '🍎 Lanche da manhã:',
  'lanche da tarde:': '🍎 Lanche da tarde:',
  'lanche:': '🍎 Lanche:',
  'jantar:': '🍽️ Jantar:',
  'ceia:': '🌙 Ceia:'
};
const MEAL_REGEX = /(Pequeno-almoço:|Almoço:|Lanche pré-treino:|Lanche pós-treino:|Lanche da manhã:|Lanche da tarde:|Lanche:|Jantar:|Ceia:)/gi;

export default function CoachText({ children }) {
  if (!children) return null;

  let text = String(children);

  // 1. Remover marcadores de título ## e transformar em bold
  text = text.replace(/^##\s+(.*)/gm, '\n**$1**\n');

  // 1.5 Remover bullets antes de nomes de refeições
  const MEAL_NAMES = "(Pequeno-almoço:|Almoço:|Lanche pré-treino:|Lanche pós-treino:|Lanche da manhã:|Lanche da tarde:|Lanche:|Jantar:|Ceia:)";
  const listRegex = new RegExp(`^[-*]\\s+${MEAL_NAMES}`, 'gim');
  text = text.replace(listRegex, '$1');

  // 2. Aplicar formatação das refeições (emojis no início da refeição)
  text = text.replace(MEAL_REGEX, (match) => {
    const key = match.toLowerCase();
    return '\n' + (MEAL_EMOJIS[key] || match);
  });

  // 3. Quebrar texto corrido em parágrafos duplos para melhor leitura
  text = text.replace(/([.!?])\s+(?=[A-ZÀ-ÖØ-Þ])/g, '$1\n\n');

  const lines = text.split('\n');

  return (
    <div className="coach-text space-y-1">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        
        if (trimmed === '') {
          return <div key={lineIdx} className="h-1.5" />;
        }

        // Processar negrito **texto**
        const parts = trimmed.split(/(\*\*.*?\*\*)/g);
        const formattedLine = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            // Sem cor própria — herda a do texto à volta. CoachText é usado
            // em contextos claros (MealCard) e escuros (chat do Coach,
            // WeeklyPlanCard); "text-slate-900" fixo ficava ilegível
            // (escuro sobre escuro) nos segundos, porque a cascata CSS do
            // Tailwind vencia a cor pensada para o tema escuro de quem
            // chama isto.
            return (
              <strong key={pIdx} className="font-bold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <React.Fragment key={pIdx}>{part}</React.Fragment>;
        });

        // Listas com marcas
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <li key={lineIdx} className="ml-4 list-disc text-slate-800 my-1 marker:text-emerald-500">
              {formattedLine}
            </li>
          );
        }

        return (
          <p key={lineIdx} className="my-1.5 leading-relaxed">
            {formattedLine}
          </p>
        );
      })}
    </div>
  );
}
