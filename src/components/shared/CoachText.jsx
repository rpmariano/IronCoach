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

  // 1. Remover marcadores de título ## e transformar em bold para ter formatação mas sem o ## visual
  text = text.replace(/^##\s+(.*)/gm, '\n**$1**\n');

  // 1.5 Remover bullets antes de nomes de refeições para evitar bullets órfãos
  const MEAL_NAMES = "(Pequeno-almoço:|Almoço:|Lanche pré-treino:|Lanche pós-treino:|Lanche da manhã:|Lanche da tarde:|Lanche:|Jantar:|Ceia:)";
  const listRegex = new RegExp(`^[-*]\\s+${MEAL_NAMES}`, 'gim');
  text = text.replace(listRegex, '$1');

  // 2. Aplicar formatação das refeições (emojis e quebras de linha)
  text = text.replace(MEAL_REGEX, (match) => {
    const key = match.toLowerCase();
    return '\n' + (MEAL_EMOJIS[key] || match);
  });

  const lines = text.split('\n');

  return (
    <div className="coach-text space-y-1">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        
        if (trimmed === '') {
          return <div key={lineIdx} className="h-1.5" />;
        }

        // Basic bold parsing
        const parts = trimmed.split(/(\*\*.*?\*\*)/g);
        const formattedLine = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pIdx} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
          }
          return part;
        });

        // Lists
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <li key={lineIdx} className="ml-4 list-disc text-slate-800 my-0.5 marker:text-emerald-500">
              {trimmed.substring(2)}
            </li>
          );
        }

        return (
          <p key={lineIdx} className="my-0.5">
            {formattedLine}
          </p>
        );
      })}
    </div>
  );
}
