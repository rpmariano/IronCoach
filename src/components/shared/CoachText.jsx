import React from 'react';
import { getBodyIcon } from '../../utils/bodyIcons';
import { Flame, Wheat, Droplet, Droplets, CalendarDays } from 'lucide-react';

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

  // 3. Quebrar texto corrido: adicionar parágrafos duplos após sinais de pontuação para facilitar leitura
  // (apanha ponto, exclamação ou interrogação seguido de espaço e letra maiúscula)
  text = text.replace(/([.!?])\s+(?=[A-ZÀ-ÖØ-Þ])/g, '$1\n\n');

  const lines = text.split('\n');

  const COACH_KEYWORDS = {
    'peso': { type: 'body', key: 'weight_kg' },
    'imc': { type: 'body', key: 'bmi' },
    'gordura corporal': { type: 'body', key: 'body_fat_pct' },
    'massa gorda': { type: 'body', key: 'body_fat_pct' },
    'músculo esquelético': { type: 'body', key: 'skeletal_muscle_pct' },
    'massa muscular': { type: 'body', key: 'muscle_mass_kg' },
    'água corporal': { type: 'body', key: 'body_water_pct' },
    'proteína': { type: 'body', key: 'protein_pct' },
    'massa óssea': { type: 'body', key: 'bone_mass_kg' },
    'metabolismo basal': { type: 'body', key: 'bmr_kcal' },
    'gordura visceral': { type: 'body', key: 'visceral_fat' },
    'gordura subcutânea': { type: 'body', key: 'subcutaneous_fat_pct' },
    'idade metabólica': { type: 'body', key: 'metabolic_age' },
    'massa magra': { type: 'body', key: 'lean_body_mass_kg' },
    'calorias': { type: 'icon', icon: Flame, color: 'text-orange-500' },
    'hidratos de carbono': { type: 'icon', icon: Wheat, color: 'text-orange-600' },
    'hidratos': { type: 'icon', icon: Wheat, color: 'text-orange-600' },
    'gordura': { type: 'icon', icon: Droplet, color: 'text-sky-500' },
    'água': { type: 'icon', icon: Droplets, color: 'text-blue-500' },
    'plano de treino': { type: 'icon', icon: CalendarDays, color: 'text-indigo-500' }
  };
  
  const KEYWORD_REGEX = new RegExp(`\\b(${Object.keys(COACH_KEYWORDS).join('|')})\\b`, 'gi');

  const renderTextWithIcons = (str, isBold = false) => {
    const parts = str.split(KEYWORD_REGEX);
    return parts.map((m, i) => {
      const lower = m.toLowerCase();
      const match = COACH_KEYWORDS[lower];
      if (match) {
        let iconEl = null;
        if (match.type === 'body') {
          iconEl = <span className="text-emerald-600 shrink-0 mt-[-2px]">{getBodyIcon(match.key, 14)}</span>;
        } else {
          const IconComponent = match.icon;
          iconEl = <IconComponent size={14} className={`${match.color} shrink-0 mt-[-2px]`} />;
        }
        return (
          <span key={i} className={`inline-flex items-center gap-1 mx-0.5 ${isBold ? '' : 'font-semibold text-slate-800'}`}>
            {iconEl}
            {m}
          </span>
        );
      }
      return m;
    });
  };

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
            return (
              <strong key={pIdx} className="font-bold text-slate-900">
                {renderTextWithIcons(part.slice(2, -2), true)}
              </strong>
            );
          }
          return <React.Fragment key={pIdx}>{renderTextWithIcons(part)}</React.Fragment>;
        });

        // Lists
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
