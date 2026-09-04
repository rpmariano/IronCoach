const MEAL_KEYS = [
  ['Pequeno-almoço', 'pequeno_almoco'],
  ['Lanche da manhã', 'lanche_manha'],
  ['Almoço', 'almoco'],
  ['Lanche da tarde', 'lanche_tarde'],
  ['Jantar', 'jantar'],
  ['Ceia', 'ceia'],
];
const MEAL_RE = new RegExp(`^(${MEAL_KEYS.map(([l]) => l).join('|')}):\\s*(.+)$`, 'i');
const TOTAL_RE = /^Total:\s*~?(\d+)\s*kcal\s*\|\s*Prote[ií]na:\s*(\d+)\s*g\s*\|\s*Hidratos:\s*(\d+)\s*g\s*\|\s*Gordura:\s*(\d+)\s*g/i;
const RACIONAL_RE = /^Racional:\s*(.+)$/i;

export function parseMealSuggestion(text) {
  if (!text) return null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const refeicoes = [];
  let totais = null;
  let racional = null;

  for (const line of lines) {
    const mealMatch = line.match(MEAL_RE);
    if (mealMatch) {
      const key = MEAL_KEYS.find(([l]) => l.toLowerCase() === mealMatch[1].toLowerCase())[1];
      refeicoes.push({ tipo: key, label: mealMatch[1], texto: mealMatch[2] });
      continue;
    }
    const totalMatch = line.match(TOTAL_RE);
    if (totalMatch) {
      const [, kcal, proteina, hidratos, gordura] = totalMatch.map(Number);
      totais = { kcal, proteina_g: proteina, hidratos_g: hidratos, gordura_g: gordura };
      continue;
    }
    const racionalMatch = line.match(RACIONAL_RE);
    if (racionalMatch) racional = racionalMatch[1];
  }

  if (refeicoes.length < 2 || !totais) return null; // não confia em parse parcial
  return { refeicoes, totais, racional };
}

// share de energia (%) por macro — 4 kcal/g proteína e hidratos, 9 kcal/g gordura
export function macroShares(totais) {
  const p = totais.proteina_g * 4, h = totais.hidratos_g * 4, g = totais.gordura_g * 9;
  const sum = p + h + g || 1;
  return { proteina: p / sum, hidratos: h / sum, gordura: g / sum };
}

export const MEAL_ICON_BY_TIPO = {
  pequeno_almoco: 'Sunrise', lanche_manha: 'Apple', almoco: 'Salad',
  lanche_tarde: 'Cherry', jantar: 'UtensilsCrossed', ceia: 'Coffee',
};
